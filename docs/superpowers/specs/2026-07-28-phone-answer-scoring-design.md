# Phone-Answer Scoring Foundation — Design

Date: 2026-07-28
Status: design in review with Ben, not yet planned or built.

## Goal

Today every question is graded on paper and entered as one hand-typed round total
(`scoreboard_teams.scores`, keys like `r_${round.id}`) — no per-question, per-team
answer is ever captured anywhere in the app. This spec adds a new question category,
**"Use Your Phone,"** where a team's `/join` submission IS their graded answer, scored
automatically, and folded into that round's total — without breaking Quick Entry, the
manual scoring flow it's built to speed up, or the "add new question formats" openness
the host-side format system already has.

**Concrete first format:** Matching — two columns on `/display` (e.g. 4 real people, 4
aliases), teams tap-to-pair on `/join`, correct pairs score points automatically.

Explicitly out of scope for this spec, deferred to their own later designs once this
foundation exists: **chain reaction** (a hint/vote layer on top of a still-paper-graded
question — doesn't touch scoring, reuses only the phone-submission plumbing) and **map
maker** (tap-to-place variant of the same submission model). Soundbite/soundboard work
is a fully separate, unrelated track.

## Non-goal: this is not a generic no-code game builder

"Backend scoring stays a consistent base, front-end format creation stays fully open"
is the guiding constraint, and it's worth being precise about what that does and
doesn't mean, because the app already has a real precedent for exactly this split:
`shiny_formats`. Today, a *format instance* (its name, icon, labels, point values,
answer key) is fully host-authored in-app via "✨ Add Shiny," with zero code changes —
but the finite set of *format mechanics* (visual, audio, list) are real React
components someone wrote once. A new mechanic (matching, chain-reaction, map maker)
is still a code change; a new *instance* of an existing mechanic (a new matching
question with different people/aliases, different point values) is not. This spec
keeps that same split for phone-scored questions — Matching is mechanic #1, built as
real code; any host can then create unlimited matching *instances* afterward with no
further engineering.

## Data model

### 1. New table: `phone_answers`

```sql
phone_answers {
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id      text NOT NULL,
  slide_id     text NOT NULL,
  team_id      uuid NOT NULL REFERENCES teams(id),
  answer       jsonb NOT NULL,   -- shape is per-mechanic; matching: [{leftId, rightId}]
  score        numeric,          -- null until scored
  submitted_at timestamptz DEFAULT now(),
  UNIQUE(slide_id, team_id)      -- one submission per team per phone question; latest write wins pre-lock
}
-- RLS: INSERT/UPDATE public (teams write their own answer, matched by team_id they hold
-- in localStorage — same trust model as `teams` row writes elsewhere in this app);
-- SELECT public (host reads via the same anon session; scoring computation runs
-- client-side in the host panel, not in an Edge Function, matching how the rest of
-- scoring already works — no server-side grading exists anywhere in this app today)
```

Team submissions upsert on `(slide_id, team_id)` while the question is open, so a team
can change their answer up until Lock. This is a new write path from `/join` — the
first one since powerups that isn't registration, scoreboard-drawer read, or a status
flag.

### 2. `scoreboard_teams.scores` round values: number → `{written, phone}`

The actual load-bearing decision. A round's score, currently a raw number typed by
the host, becomes:

```js
scores: {
  r_1: { written: 12, phone: 0 },
  r_2: { written: 8,  phone: 6 },   // 6 came from an auto-scored matching question
  bonus: { written: 2, phone: 0 },
}
```

**Backward compatibility:** any existing round value that's still a plain number reads
as `{ written: <that number>, phone: 0 }` via one normalizer, `normalizeRoundScore()`,
added to `scoreboardMath.js` next to the existing `computeTotal`/`deriveRoundCols`.
Every consumer of a round value calls this normalizer first — no migration needed, no
show's history breaks.

**`computeTotal(scores, cols)` changes** to sum `written + phone` per round before
summing rounds — genuinely the single chokepoint for *totals*.

**Correction from independent review: totals are not the only place a round value is
touched.** Four call sites read or write a round's raw cell value directly, bypassing
`computeTotal` entirely, and all four need updating or this breaks on day one:

- `ScoreboardModal.jsx` `TeamTable`'s score `<input>` (line ~187) reads
  `team.scores[c.key]` straight into a number input — needs to read
  `normalizeRoundScore(team.scores[c.key]).written`, not the raw cell.
- `ScoreboardModal.jsx`'s `updateScore()` (line ~282-285), the actual write path
  behind **both** the manual score cell and Quick Entry's `quickSave` (which calls
  `updateScore` directly) — today it does
  `scores: { ...t.scores, [key]: Number(val) }`, which clobbers the whole round value.
  As written, editing a round's score after Lock Answers has run would silently zero
  out that round's `phone` contribution. Must become
  `scores: { ...t.scores, [key]: { ...normalizeRoundScore(t.scores[key]), written: Number(val) } }`
  — preserve `phone`, only overwrite `written`.
- `ScoreboardOverlay.jsx` (line ~72-73) — TV per-round score pills read
  `team.scores?.[col.key]` and do a direct `Number(val) === 0` check. Needs the same
  normalize-then-sum treatment or it renders an object/`NaN` on the TV.
- `ShowDetail.jsx` (line ~172-173) — public show-history page does
  `Number((team.scores ?? {})[col.key])` per round. Same issue, and this one's
  public-facing, which is exactly the class of surface this spec is emphatic must
  never show broken or leaked internals.

**Quick Entry and the manual score cell (`TeamTable`) both write only `written`**
(intent unchanged from the original draft) — the fix above is what makes that
actually true in code rather than just true in this document. The `phone` value is
written only by the auto-scoring step below and by `normalizeRoundScore`'s
pass-through of whatever `phone` already existed.

### 3. Question authoring: a shiny-format mechanic, not a separate system

**Revised after Ben's note: "Use Your Phone" must be rope into the shiny question
builder and architecture, not stand alongside it as a second authoring path.** The app
already has exactly one in-app format-creation flow — "✨ Add Shiny" →
`FormatLibrary.jsx` → `shiny_formats` table → picked in `AddSlideWizard` → filled in
per-slide in `SlideEditor`. Matching becomes one more entry in that same pipeline, the
same way `shinyType: 'audio'` or `input_schema.type === 'list'` are today, not a
parallel `phoneScoring` field bolted onto a plain question slide.

**`shiny_formats.input_schema` gets one new `type`:**

```js
input_schema: {
  type: 'matching',
  hasPoints: true,
  pointsPerMatch: 2,   // host-set default when creating the format; overridable per-slide
}
```

This is created via the existing FormatLibrary UI exactly like every other format —
no new host-facing screen. A new `isMatchingShiny()` helper joins the existing
`isListShiny()` in `shinySeries.js`, following the same pattern, so `SlideRenderer`
and `QuestionSlide.jsx`'s dispatch logic gain one more branch, not a second dispatch
system.

**Per-slide content** — the actual 4 people/4 aliases for *this* question — is filled
in on `slide.data` when the host builds that specific question in `SlideEditor`, the
same way `ShinyListBuilder` lets a host fill in `data.listItems` for a list-type shiny
question today:

```js
data: {
  ...existing question fields,
  isShiny: true,               // same flag every shiny question already carries
  pairs: [
    { id: 'p1', left: 'Abraham Lincoln', right: 'Honest Abe' },
    { id: 'p2', left: 'Amelia Earhart',  right: 'Lady Lindy' },
    { id: 'p3', left: 'Muhammad Ali',    right: 'The Greatest' },
    { id: 'p4', left: 'Babe Ruth',       right: 'The Bambino' },
  ],
  pointsPerMatch: 2,           // seeded from the format's default, editable per-slide
  matchingLocked: false,       // flips true when host hits "Lock Answers"
}
```

`pairs` is the answer key — each pair's `id` is what a correct submission must
reference on both sides. Left items render in one column order, right items in a
**shuffled** order per slide (fixed once when the slide goes live, not re-shuffled per
team — see Open Questions), so it isn't a positional giveaway.

Being a real `isShiny` question also means Matching gets the existing
`ShinyIntroScreen` announce beat ("✨ Format Name") for free, the same beat every other
shiny question already opens with — one less thing this spec needs to invent.

## Phone UI (`/join`)

When the live slide is `isMatchingShiny()` and isn't locked, `LiveView` renders a
matching board instead of the plain read-only question text: left column (fixed
order), right column (shuffled order). **Revised per Ben: color-fill matching, not a
connector line.** A fixed palette of N colors is available, N = number of pairs (4
pairs → 4 colors). Tap a left item, then tap a right item — both items fill solid with
the same color, taken from the palette in pairing order (the team's first pair made
gets color 1, second gets color 2, etc.). A same-color fill on both sides — red name,
red alias — is what reads as "this is the pair I'm submitting," at a glance, on a
small screen, with no lines crossing each other to untangle. Tap either half of an
already-colored pair to undo it (both items clear back to unfilled, that color returns
to the available pool). Color assignment is purely a submission-side visual aid — it
carries no meaning against the answer key, which is still checked by which item IDs a
team paired, not which color they happened to use. An implicit "answer so far" upserts
to `phone_answers` on every pair change (not just on a final submit tap) — cheap
writes, same debounce-and-retry shape `Join.jsx` already uses elsewhere, and it means a
team that closes the browser mid-question doesn't lose progress.

**Tap-to-pair, not drag.** Matches this app's existing precedent — every other
`/join` interaction (powerup, registration, scoreboard) is one discrete write per
action, never a continuous stream. True drag-linking would need position events
streamed in real time, a different order of technical complexity for no real benefit
on a phone screen where tap targets are already the right size.

No forward/timer pressure from the app itself — same as every other slide, the
question stays open until the host moves on. That's the host's cue to hit **Lock
Answers**.

## /display rendering (gap found in review — added here)

A matching question is still a real slide on `/display`, and per Critical Rule 5
("Design is not optional"), it needs an actual designed render, not just a
description of the phone side. Three states, one component
(`MatchingQuestion.jsx`, mounted the same way `ShinyListQuestion` is today —
dispatched from `QuestionSlide.jsx` once `isMatchingShiny()` is true, after the shared
`ShinyIntroScreen` beat):

1. **Open** — the two columns (people / aliases), same shuffled-right-column order
   every phone sees, with a live "X of Y teams have submitted" count (subscribed the
   same way the rest of `/display` already subscribes to `shows`/team state) so the
   room has something to watch while phones are tapping. No per-team answers shown —
   nobody's individual picks are public.
2. **Locked, not yet scored** — brief transitional state between the host clicking
   Lock Answers and scores finishing computation (should be near-instant, but the
   render needs to exist so there's no blank frame).
3. **Revealed** — correct pairs shown with the same shared-color-fill convention the
   phones use (not a connector line, per the Phone UI section above), each pair's fill
   in fixed shiny gold to match the existing shiny visual language, same treatment
   `PylRevealSlide` already gives a
   correct-answer reveal. This state needs its own explicit host trigger (a "Reveal"
   action separate from Lock — locking closes submissions, revealing is a presentation
   beat the host times independently, same separation `answer_reveal` already has for
   ordinary questions).

## Locking and scoring

New control in `LiveMode.jsx`, visible only when the live slide is
`isMatchingShiny()`: **Lock Answers**. On click:

1. Writes `slide.data.matchingLocked = true` (via the existing `updateSlide`
   debounced-and-serialized path — no new save mechanism needed).
2. `/join` immediately stops accepting new pair taps for that slide (locked board
   renders read-only, showing the team's last submitted state).
3. Host panel reads all `phone_answers` rows for that `slide_id`, scores each team's
   `answer` against `slide.data.pairs` (count of correctly-matched `id`s ×
   `slide.data.pointsPerMatch`), and writes each team's result into `scoreboard_teams` — merging
   into that round's `phone` value (additively, in case a round somehow carries more
   than one phone-scored question — sum, don't overwrite).
4. A submission missing entirely (team never answered) scores 0, same as a blank
   paper answer would.

This is fully automatic — no per-team confirm step. Section below covers why, and what
visibility exists instead.

## Why automatic, not a confirm gate (and what "visible" means here)

Quick Entry's actual shape — team → round → score, one typed number, Enter, loop — is
built for speed during a live grading break with several teams back to back. A
per-team confirm gate for phone scores would sit inside that same loop and slow down
the exact thing Quick Entry exists to speed up. So scoring is silent in the sense of
"doesn't ask you to approve it," but not invisible:

**Host-only passive indicator.** Any round-score cell whose `phone` value is non-zero
gets a small marker (a ⚡ corner badge or similar, exact treatment TBD at build time)
in `ScoreboardModal`'s `TeamTable` and in Quick Entry's flash confirmation — so a host
scanning the admin table can always tell a number wasn't fully hand-typed, and can
still edit the `written` portion at any time without disturbing the `phone` portion.

**Backend-only — never shown on any public-facing surface.** Per Ben: this indicator
appears exclusively in the host-side `ScoreboardModal`/Quick Entry. It must NOT render
on `ScoreboardOverlay` (TV), the `/join` `ScoresDrawer` (phone), or `ShowDetail`
(public show history) — those three surfaces show the merged total only, identical to
how any other round score looks today. This is a rendering-only distinction (all three
already call the same `computeTotal`, which returns one number regardless), so it
costs nothing structurally — it's simply that the badge component is only ever mounted
in the two host-only call sites.

## Error handling & edge cases

- **No submission:** scores 0 for that team, same as a team that leaves a paper answer
  blank.
- **Partial pairing at lock time** (e.g. 3 of 4 pairs made): scored on whatever pairs
  exist in `answer` — partial credit, not an all-or-nothing reject.
- **Re-locking / re-scoring:** if a host somehow triggers Lock Answers twice (double
  click, reopening LiveMode), scoring must be idempotent — recompute and **overwrite**
  each team's `phone` contribution for that specific `slide_id`, not add to it again.
  This means the `phone` value per round actually needs to track its source at a level
  finer than the round if a round could ever carry two separate phone questions in
  future — noted as an open question below, not blocking for the single-phone-question-
  per-round case this spec covers.
- **Late submission after lock:** `/join` write path checks `locked` before allowing an
  upsert; a race where a team submits in the same instant as Lock is acceptable to lose
  (same "who cares, the host controls pacing" tolerance the rest of the app already has
  for host-vs-team races).
- **Malformed/incomplete answer key** (host publishes a matching question with fewer
  than 2 pairs, or a duplicate `id`): validate in the authoring UI before the slide can
  go live, same class of guard `AddSlideWizard` already applies elsewhere.

## Testing

- `normalizeRoundScore()` / `computeTotal()`: unit tests covering legacy plain-number
  rounds, new `{written, phone}` rounds, and mixed shows (some rounds still legacy,
  some new) — this function is the one place correctness of "single merged total"
  actually lives.
- Scoring function (`answer` vs `pairs` → points): unit tests for full match, partial
  match, empty answer, extra/unknown `id`s in a malformed submission.
- Manual/live test: two phones submitting, editing, and re-submitting before Lock;
  confirm the last state before Lock is what scores.
- Visual check: confirm the ⚡ badge never renders on `ScoreboardOverlay`, `ShowDetail`,
  or the `/join` `ScoresDrawer` — this is the one requirement in this spec that's a
  pure rendering-location rule with no functional test to catch a regression, so it's
  worth a deliberate manual pass rather than assuming code review catches it.

## Open questions

- Per-team shuffle of the right column (harder to screenshot-share an answer between
  tables) versus one shared shuffle per slide (simpler, matches how every other slide's
  content is identical for every team) — leaning shared/simple for v1, revisit if
  answer-sharing between tables becomes a real problem at a live show.
- Whether a round could ever carry more than one phone-scored question, which would
  need the `phone` value keyed by `slide_id` rather than being a single number — not
  needed for the matching-question launch case, worth deciding before chain-reaction or
  map maker land if either of them turns out to also be phone-scored rather than
  hint-only.
