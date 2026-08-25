# "Next locks answers" — countdown-then-lock ceremony for phone-scored questions

Date: 2026-08-25. Approved in chat with Ben (bounded-path brainstorm, no
separate spec doc — this plan file IS the spec). Builds directly on top of
the Order Up work already on this branch (`feat/order-up-shiny-question`) —
this plan's tasks are additional commits on the SAME branch/worktree, not a
new one, since this feature touches all three phone-scored mechanics
including Order Up.

## The ask, in Ben's words

Ben wants to host away from his laptop, driving the show entirely off the
Stream Deck's Next button. Today, locking a phone-scored question's answers
requires a separate manual click on a "🔒 Lock Answers & Score" button in
`/host` — Next doesn't touch it. That's incompatible with hands-off hosting.

## The mechanic

Applies to all three phone-scored mechanics: Matching, Wager, Order Up.

When Next is pressed while the current slide is a phone-scored question with
a lock phase still open (not yet locked):
- Next does **NOT** advance to the next slide.
- Instead, a 3‑2‑1 countdown plays on `/display` (real ceremony, not a
  snappy UI blip — this is a rare, once-per-question moment, closer to
  "occasional/rare" on the animation decision framework than a repeated
  keyboard action).
- When the countdown reaches zero, the exact same lock-and-score action that
  already exists behind the manual button fires automatically (no scoring
  logic changes — this only changes what TRIGGERS it), followed by a brief
  🔒 flash on `/display`.
- A second Next then behaves as it does today once a question is locked.

**Wager has two lock phases on one slide, not one** — the blind wager-tier
lock, then (after the question reveals and teams guess) the numeric-guess
lock. Ben confirmed: apply the countdown-then-lock at BOTH points
independently, giving Wager three Nexts in sequence (lock tiers → lock
guesses+score → advance), vs two for Matching/Order Up (lock+score →
advance).

## Architecture — read this before writing any code

### The real complication: two windows, one Stream Deck

`/host` (LiveMode.jsx) and `/display` (Display.jsx) are both open all show;
only one has OS keyboard focus at a time, and the Stream Deck's Right-Arrow
goes to whichever that is. **Three separate call sites currently turn a
Next press into `nextSlide()`, and all three need the new branch:**

1. `client/src/components/host/LiveMode.jsx`'s `handleKeyDown` — the
   `ArrowRight` branch (search for `e.code === 'ArrowRight'`).
2. `client/src/components/host/LiveMode.jsx`'s `handleNextClick` (the
   on-screen Next button — small function, easy to find by name).
3. `client/src/views/Display.jsx`'s `guardedStep` + its own keydown listener
   (search for `ArrowRight`/`Space`/`Enter` near the bottom of the file,
   around the "Step the show from the TV itself" comment).

This exact dual-window problem already has a solved, working precedent in
this codebase — **read it before designing anything new**:
`client/src/lib/slideStepping.js`, the team-picker auto-roll system —
`teamPickerCursor`, `cursorAfterStep`, `ownsAutoRoll`,
`AUTO_ROLL_OWNERSHIP_MAX_AGE_MS`, and the big comment block above
`ownsAutoRoll` explaining exactly why cross-window ownership arbitration is
needed there. Read the whole comment, not just the code.

**Why this feature does NOT need `ownsAutoRoll`'s full arbitration,
though — read this carefully so you don't over-build:**

Team-picker's auto-roll needs strict ownership because EITHER window can
equally perform the shared action (`actions.nextSlide()` exists identically
on both sides) — so both windows naively arming a timer off the same
observed state would double-advance.

The lock-countdown's *actual locking action* (`handleLockAndScoreMatching`
/ `handleLockWagers` / `handleLockAndScoreWagers` / `handleLockAndScoreOrder`
— all in `LiveMode.jsx`, search for these names) reads `phone_answers`,
`teams`, and writes `scoreboard_teams` via host-side `actions` that
**`Display.jsx` does not have** (it's a read-mostly TV view). So there is
only ONE place in the whole app capable of performing the actual lock+score
— `LiveMode.jsx`. That means:

- **Starting** the countdown (writing the timestamp) can safely happen from
  whichever window's Next press triggered it (`LiveMode.jsx`'s two sites, or
  `Display.jsx`'s) — no double-start risk, because a single physical
  keypress only reaches ONE focused window's listener at the OS level (this
  is already true today for every other Next-triggered action, nothing new
  to guard here).
- **Completing** the countdown (calling the actual lock handler) only ever
  needs to happen from `LiveMode.jsx`, regardless of which window started
  it — `Display.jsx` never arms a completion timer at all, it only shows
  the visual countdown reactively. Since there is exactly one actor capable
  of completing, there's no double-completion race to defend against, and
  you do **not** need `ownsAutoRoll`-style ownership arbitration for this
  part. Building that would be solving a problem this feature doesn't have.

### Shared state on the slide

New fields on `slide.data`, written via the existing debounced
`actions.updateSlide` path (same mechanism every other slide field already
uses — see `useShow.js`'s serialized-write chain, no new save mechanism
needed):

```js
data: {
  ...
  lockCountdownPhase: 'matching' | 'wager-tiers' | 'wager-guesses' | 'order' | null,
  lockCountdownStartedAt: <timestamp ms>,  // null/absent when no countdown active
}
```

Cleared (`lockCountdownPhase: null, lockCountdownStartedAt: null`) as part
of the SAME `updateSlide` call that performs the actual lock (so the
countdown UI naturally disappears the instant the real lock write lands —
no separate cleanup step, no race between "countdown says done" and "lock
actually happened").

### New shared pure helpers — `client/src/lib/slideStepping.js`

Follow `teamPickerCursor`'s naming and shape exactly (read it first):

```js
export const LOCK_COUNTDOWN_MS = 3000  // 3-2-1, ~1s per number

// Which lock phase (if any) is currently open on this slide, given its
// current shiny type + lock flags. null if the slide isn't a phone-scored
// question, or its lock phase(s) are already past.
export function pendingLockPhase(slide) {
  const data = slide?.data
  if (!data) return null
  if (isMatchingShiny(data) && !data.matchingLocked) return 'matching'
  if (isWagerShiny(data)) {
    if (!data.wagerTiersLocked) return 'wager-tiers'
    if (!data.wagerGuessesLocked) return 'wager-guesses'
    return null
  }
  if (isOrderShiny(data) && !data.orderLocked) return 'order'
  return null
}
```

(You'll need to import `isMatchingShiny`/`isWagerShiny`/`isOrderShiny` from
`shinySeries.js` into `slideStepping.js` — check they aren't already
imported there for a different reason first.)

This is the ONE place that knows "is there a lock phase pending" — both
`LiveMode.jsx` and `Display.jsx` call it, so they can't drift on the
definition (exactly the reasoning `isAutoRollPart` already documents for
itself).

## Task 1 — Shared helper + countdown UI component

**New:** `pendingLockPhase`/`LOCK_COUNTDOWN_MS` in `slideStepping.js` (above).

**New:** `client/src/components/display/LockCountdownOverlay.jsx` (or find
the right existing location for shared `/display`-only overlays — check
where `ScoreboardOverlay.jsx` lives, that's the closest sibling: a
full-screen overlay mounted conditionally over the current slide). Props:
`startedAt` (the timestamp), `onComplete` (optional callback — NOT required
for the actual lock trigger, see Task 2, but useful for the display to know
when to stop rendering the countdown numbers and show 🔒 instead).

Read `emil-design-eng`'s guidance before writing this (already loaded this
session, don't re-fetch): this is a RARE, ceremonial animation (once per
question, not a repeated UI action) — it's allowed real personality and
duration, unlike a button press. GPU-only (`transform`/`opacity`), respects
`prefers-reduced-motion` (numbers can cross-fade instead of scale/slide for
reduced-motion, same pattern this codebase already uses elsewhere — e.g.
`RoundIntroSlide.jsx`'s `reduce` branch). Big numbers (3, 2, 1), roughly 1s
each, then a 🔒 that holds briefly before the real lock write clears the
countdown fields and the slide's own revealed/locked UI takes over.

Compute the numbers from elapsed time since `startedAt`
(`Math.floor((Date.now() - startedAt) / 1000)`), not a local component
timer that starts at 0 on mount — this makes it correct even if `/display`
mounts or re-renders mid-countdown (e.g. the window that DIDN'T start it,
picking up the shared timestamp via realtime).

## Task 2 — Wire the three trigger sites + the completion effect

**`LiveMode.jsx`, `handleKeyDown`'s `ArrowRight` branch and
`handleNextClick`:** before falling through to `guardNav(actions.nextSlide)`,
check `pendingLockPhase(currentSlide)` (or whatever the current-slide
variable is called in this file — check). If non-null AND
`currentSlide.data.lockCountdownStartedAt` is not already set (i.e. a
countdown isn't already running), write
`{ lockCountdownPhase: phase, lockCountdownStartedAt: Date.now() }` via
`actions.updateSlide` instead of advancing, and return — do not call
`nextSlide()`. If a countdown IS already running (`lockCountdownStartedAt`
set), Next should no-op (ignore the press) rather than restart or skip
ahead — the countdown must run its full course once started, per the
approved design ("ignores repeat Next presses while it's already running").

**`Display.jsx`'s `guardedStep`/keydown listener:** same branch, same
`pendingLockPhase` check, same write — but `Display.jsx` doesn't have
`LiveMode.jsx`'s `actions` object; check how it currently performs its OWN
slide writes (it must have SOME path, since it drives `nextSlide` itself —
search for how `guardedStep` currently calls into `useShow`/Supabase) and
use that same mechanism to write the countdown-start fields.

**`LiveMode.jsx` — new completion effect** (mirror the shape of the
existing team-picker auto-roll `useEffect`, which you should read in full
first — same file, search for "Team Intro (team-picker) auto-roll"): keyed
on the current slide's `lockCountdownPhase`/`lockCountdownStartedAt`. When
a countdown is active for the current slide, schedule a `setTimeout` for
whatever time REMAINS until `startedAt + LOCK_COUNTDOWN_MS` (not always the
full duration — if this effect mounts partway through an already-running
countdown, e.g. after a re-render, it must not restart the clock). On
fire, call the correct handler for the current `lockCountdownPhase`:
- `'matching'` → `handleLockAndScoreMatching(slide)`
- `'wager-tiers'` → `handleLockWagers(slide)`
- `'wager-guesses'` → `handleLockAndScoreWagers(slide)`
- `'order'` → `handleLockAndScoreOrder(slide)`

Same `actionsRef`-not-raw-`actions` pattern the team-picker effect already
uses in its dependency array, for the same stale-closure reason documented
there — read that reasoning before copying the pattern, don't just copy the
code blind.

The effect's cleanup (on slide change, or on `lockCountdownStartedAt`
clearing because the lock already completed) must cancel the pending
timeout — same "effect keyed on state, cancel-and-reschedule on change"
shape team-picker's effect already has.

**Do NOT add a mirrored completion effect to `Display.jsx`** — per the
Architecture section above, only `LiveMode.jsx` can perform the actual
lock+score action, so it's the only place that needs to WATCH for
completion. `Display.jsx` only needs to RENDER the countdown reactively
(via `LockCountdownOverlay` reading `lockCountdownStartedAt` off the slide
it's already subscribed to) — it takes no action of its own.

## Global constraints

- No changes to the actual scoring/locking logic inside
  `handleLockAndScoreMatching`/`handleLockWagers`/`handleLockAndScoreWagers`/
  `handleLockAndScoreOrder` — this plan only changes what CALLS them, never
  their internals.
- The existing manual "🔒 Lock Answers & Score" buttons in `LiveMode.jsx`
  should stay working exactly as they do today (don't remove them — a host
  who's back at the laptop should still be able to click them directly,
  bypassing the countdown entirely, same as today).
- `pendingLockPhase` must be the ONLY place either file checks "is a lock
  phase open" — no duplicate inline conditions re-deriving the same thing
  in `LiveMode.jsx` or `Display.jsx`.
- Respect `prefers-reduced-motion` in the countdown overlay per this repo's
  existing convention (see Critical Rule 3 in the project's own SKILL.md).
- Run `npm run test:unit` and `npm run build` after each task; must stay
  green (currently 305/305 on this branch — verify the live count before
  you start).

## Testing

- `slideStepping.test.js` (or wherever `isAutoRollPart`/`ownsAutoRoll` are
  tested — same file): unit tests for `pendingLockPhase` covering all four
  phases, both Wager sub-phases in sequence, and the "already locked/no
  phase pending" null case.
- Manual/live trace after Task 2: on a local dev show, put a Matching (or
  Order Up) question live, press Next (or click the on-screen Next button)
  while it's open, confirm the countdown appears on `/display` instead of
  advancing, confirm it locks+scores automatically at zero, confirm a
  second Next then advances normally. Repeat for Wager's two-phase case if
  time allows — at minimum trace it by reading the code path, since the
  brief's manual test doesn't require live phones.
