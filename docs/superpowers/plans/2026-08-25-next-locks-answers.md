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
- When the countdown reaches zero, the LOCK-AND-SCORE half of the existing
  manual-button action fires automatically — submissions close, scoring
  computes and writes to `scoreboard_teams` — but **NOT the reveal half**
  (see "Reveal is decoupled" below, added 2026-08-25 after Ben's follow-up).
  `/display` shows a persistent "🔒 Locked" state, not the correct answer.
- A second Next then behaves as it does today once a question is locked —
  EXCEPT today "locked" and "revealed" happen together, and after this
  change they don't (see below), so what "a locked slide's Next behavior"
  even means may need re-deriving from `slideStepping.js`'s existing
  locked-question guards once decoupled — check those still make sense.

**Wager has two lock phases on one slide, not one** — the blind wager-tier
lock, then (after the question reveals and teams guess) the numeric-guess
lock. Ben confirmed: apply the countdown-then-lock at BOTH points
independently, giving Wager three Nexts in sequence (lock tiers → lock
guesses+score → advance), vs two for Matching/Order Up (lock+score →
advance) — the reveal decoupling below applies only to the SECOND Wager
lock (guesses), since only that one currently bundles a reveal; the tier
lock never revealed anything.

## Reveal is decoupled from lock — triggered by the existing 'A' hotkey

Added 2026-08-25, Ben: "the answer reveal animation for phone questions
should only invoke when i hit A, the hotkey for answer on my streamdeck."

Today, `handleLockAndScoreMatching`/`handleLockAndScoreWagers`/
`handleLockAndScoreOrder` (all in `LiveMode.jsx`) set locked+scored+revealed
in ONE write each (search for `matchingRevealed: true` /
`wagerGuessesLocked: true` alongside its neighbor / `orderRevealed: true` in
each function to see the current combined write). **Split this**: the
lock-and-score half still fires automatically via the Next+countdown
ceremony above; the reveal half (setting `matchingRevealed` /
`orderRevealed` true — Wager's `wagerGuessesLocked` write itself doesn't
need to change, since scoring depends on the guesses being locked, not on
revealing them, but check the actual code for what `wagerRevealed` or
equivalent is really called before assuming a name) fires only when the
host presses **A** (`KeyA`) while the current slide is a locked-but-not-yet-
revealed phone-scored question.

`LiveMode.jsx`'s existing `A` handler (search `e.code === 'KeyA'`) currently
does one thing: `actions.setAnswerReveal(!show.showState.answerReveal)` — a
SHOW-LEVEL toggle used by plain (non-shiny) questions for the text-answer
overlay. That flag and mechanism are unrelated to the phone-scored
mechanics' own per-SLIDE `*Revealed` fields — don't conflate them. Extend
the `A` handler with a branch: if the current slide is locked-but-not-
revealed per whichever phone-scored mechanic it is, set that slide's own
`*Revealed` field to true (a one-way reveal, not a toggle — unlike the
plain-question answer overlay, un-revealing a scored result doesn't make
sense) instead of touching the unrelated show-level `answer_reveal` flag.
If the current slide ISN'T a phone-scored mechanic, `A` should behave
exactly as it does today (untouched).

**Consequence for each mechanic's `/display` component:** "locked, not yet
revealed" becomes a real, potentially long-lived state a room might sit in
for a while (host talking, building suspense) — not a brief transitional
flicker like it is today. Verify each of `ShinyMatchingQuestion.jsx`,
`ShinyWagerQuestion.jsx`, `ShinyOrderQuestion.jsx` actually has a real,
finished visual for this state, not just a placeholder. The final
whole-branch review of the Order Up work already found
`ShinyMatchingQuestion.jsx` has NO distinct locked-vs-revealed visual today
(it only branches on revealed, not on locked) — that gap must be closed as
part of this task, not left as a blank/broken-looking screen once locked
stops being momentary. Order Up's own three-state design (open / locked-not-
scored / revealed) is the closest existing model to extend from.

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

## Task 3 — Decouple reveal from lock, wire it to the 'A' hotkey

Do this task AFTER Task 2 (it edits the same handler functions Task 2's
completion effect calls, so the call sites must exist first).

1. In `LiveMode.jsx`, edit `handleLockAndScoreMatching`,
   `handleLockAndScoreWagers` (the guesses-lock function — NOT
   `handleLockWagers`, the tiers-lock function, which never set a reveal
   field to begin with), and `handleLockAndScoreOrder`: remove the
   `*Revealed: true` write from each (find the exact field name each one
   sets today — `matchingRevealed`, `orderRevealed`, and whatever Wager's
   equivalent is actually called, don't assume — and stop setting it in
   these functions). Locking and scoring themselves are unchanged — only
   stop flipping the reveal flag as part of the same write.
2. Add a new small function (or extend an existing one, your call, but keep
   it in one place) that JUST sets the appropriate `*Revealed` field true
   for whichever mechanic the current slide is — this is what both the
   manual UI (see #4) and the new `A`-key branch (see #3) call.
3. In `LiveMode.jsx`'s `handleKeyDown`, find the `e.code === 'KeyA'` branch
   (currently just `actions.setAnswerReveal(!show.showState.answerReveal)`).
   Add a check: if the current slide is a phone-scored mechanic that's
   locked but not yet revealed (matching `pendingLockPhase`'s underlying
   locked-flags, but for the REVEALED half — you may want a small sibling
   helper next to `pendingLockPhase` in `slideStepping.js`, e.g.
   `pendingReveal(slide)`, returning which mechanic needs revealing or null
   — use your judgment, keep the "one source of truth" rule from the
   Global Constraints), call the new reveal-setter from #2 instead of
   touching `answer_reveal`. If the slide isn't a locked-but-unrevealed
   phone-scored question, `A` must behave exactly as it does today
   (untouched fallback).
4. Find wherever the existing manual "🔒 Lock Answers & Score" buttons live
   in `LiveMode.jsx`'s JSX (search `handleLockAndScoreMatching`/
   `handleLockAndScoreWagers`/`handleLockAndScoreOrder` for their `onClick`
   sites). Per Ben's ask, reveal should ONLY ever happen via `A` — including
   when the host locks manually from the laptop, not just via the Next
   ceremony — so these buttons should stay as "lock+score only" after your
   step 1 edit, no additional change needed here beyond confirming they now
   correctly do NOT reveal (verify, don't just assume step 1 covered it).
5. Update each of `ShinyMatchingQuestion.jsx`, `ShinyWagerQuestion.jsx`,
   `ShinyOrderQuestion.jsx` to have a real, finished "locked, awaiting
   reveal" visual — not a placeholder — since this state can now last as
   long as the host wants before pressing `A`. Order Up's existing
   open/locked-not-scored/revealed three-state design
   (`ShinyOrderQuestion.jsx`) is the closest existing model; the review that
   flagged this gap noted Matching currently has none at all, so that one
   needs real design work, not just a copy-paste. Read `emil-design-eng`'s
   guidance again for this — a "waiting for the host" state that might hold
   for 10+ seconds needs different treatment than a 3-frame transitional
   flicker (a subtle idle/breathing animation on the 🔒, GPU-only, is
   reasonable; don't leave it a static frozen frame, but don't over-animate
   something meant to recede into the background while the host talks).

## Global constraints

- Task 1/2 must not change the actual scoring MATH inside
  `handleLockAndScoreMatching`/`handleLockWagers`/`handleLockAndScoreWagers`/
  `handleLockAndScoreOrder` — only what calls them. Task 3 DOES intentionally
  change these same functions, but only to remove the bundled reveal write,
  never the scoring logic itself.
- The existing manual "🔒 Lock Answers & Score" buttons in `LiveMode.jsx`
  should stay working (don't remove them — a host back at the laptop should
  still be able to click them directly, bypassing the countdown), but after
  Task 3 they lock+score only, same as the Next ceremony — reveal is `A`-only
  everywhere, no exceptions carved out for the manual button.
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
