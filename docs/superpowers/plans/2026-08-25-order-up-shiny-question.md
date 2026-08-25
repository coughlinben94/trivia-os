# Order Up — new phone-scored shiny question mechanic

Date: 2026-08-25. Approved in chat with Ben (bounded-path brainstorm, no
separate spec doc — this plan file IS the spec).

## The mechanic

Host uploads 4-6 images (the things to be ordered) and sets the correct
sequence when authoring the question. On `/display`, the images render in a
fixed shuffled row (same order for everyone), each labeled A/B/C/D…, with
the question text describing what order to guess ("put these in order from
smallest to largest", etc). Teams see the same images/labels on `/join` and
tap them in the order they believe is correct — each tap stamps a position
number (1, 2, 3…) on that image. A "⌫ undo last" button removes only the
most recently tapped item (stack-pop, not arbitrary mid-sequence removal —
keeps the UI unambiguous). No explicit submit button: every tap upserts the
in-progress answer to `phone_answers`, same as Matching does today, and the
host's "Lock Answers" is what closes submissions and triggers scoring.

**Scoring is all-or-nothing**: a team's full submitted sequence must equal
the answer key exactly (same ids, same order) to score the question's full
points; anything else — wrong order, partial, empty — scores 0. No partial
credit per correct position.

## Architectural template — Matching, mirror it closely

This mechanic is architecturally identical to Matching
(`docs/superpowers/specs/2026-07-28-phone-answer-scoring-design.md` for the
original foundation design, though the CURRENT CODE has moved past some of
that doc — read the real files below, not just the spec prose) and Wager
(`docs/superpowers/plans/2026-08-16-wager-question-implementation.md`).
Every task below names the Matching file to mirror. Read the real file, not
a description of it — patterns, naming, error handling, all of it should
feel like the same hand wrote both.

**No new table, no migration.** `phone_answers.answer` is a generic jsonb
column, already built for exactly this. Order's answer shape:
```js
answer: ['i3', 'i1', 'i4', 'i2']   // item ids, in the order the team tapped them
```

**`shiny_formats.input_schema`** gets one new type, created via the existing
"✨ Add Shiny" → `FormatLibrary.jsx` flow, no new host screen needed:
```js
input_schema: { type: 'order', hasPoints: true, pointsForOrder: 10 }  // pointsForOrder is the host-set default, overridable per-slide same as Matching's pointsPerMatch
```

**Per-slide `data`** (filled in per-question in `SlideEditor.jsx`):
```js
data: {
  ...existing question fields (text = the ordering instruction, isShiny: true),
  items: [
    { id: 'i1', url: 'https://...supabase.../trivia-show-media/...' },
    { id: 'i2', url: '...' },
    { id: 'i3', url: '...' },
    { id: 'i4', url: '...' },
    // 4-6 items, host's choice per question — not a fixed count
  ],
  correctOrder: ['i3', 'i1', 'i4', 'i2'],   // the answer key — item ids in correct sequence
  pointsForOrder: 10,                        // seeded from format default, editable per-slide, same pattern as Matching's pointsPerMatch
  orderLocked: false,                        // flips true on host's "Lock Answers", mirrors matchingLocked
}
```

Images upload through the existing `uploadMedia()` action (same one
`AddSlideWizard`'s image-type shiny formats already use) — no new upload
plumbing needed, just point image slots at it the way `We're not so
different`'s `mediaSlots` do (`useShow.js`'s `uploadMedia`).

## Global constraints (bind every task)

- **Mirror Matching's naming and file layout exactly**, substituting
  "matching"/"Matching" → "order"/"Order" and "pair(s)" → "item(s)"/"order".
  A reviewer comparing the two side by side should see the same shape.
- **All-or-nothing scoring, no partial credit.** Do not build a
  position-by-position partial-credit path "for later" — YAGNI, Ben was
  explicit about this.
- **Item count is per-question, not fixed by the format.** Don't hardcode 4
  or 5 anywhere; the host adds however many images they want (practically
  4-6, but nothing in the code should assert a specific count beyond "at
  least 2").
- **No explicit phone-side submit button.** Autosave-on-every-tap +
  host-side Lock Answers, exactly like Matching. Do not add a "Submit
  Order" button.
- **Undo is stack-pop only** (removes the most recently placed item),
  never arbitrary mid-sequence removal — this is a deliberate simplicity
  choice from the approved design, not an oversight.
- Every new file gets the same license/pattern of inline comments this
  codebase already uses heavily — a short "why", not "what". Don't skip
  comments just because the pattern file has fewer than expected; match the
  house style, which explains non-obvious decisions.
- Run `npm run test:unit` after every task; it must stay green (currently
  281/281 — check the live count before you start, it may have grown).

## Task 1 — Scoring library (`orderScoring.js`)

**Mirror:** `client/src/lib/matchingScoring.js` in full — read it first.
**New files:** `client/src/lib/orderScoring.js`, `client/src/lib/orderScoring.test.js`.

Two exported functions:

1. `scoreOrderSubmission(answer, correctOrder, points)` — pure. Returns
   `points` (the full value) if `answer` is an array, has the same length as
   `correctOrder`, and every element matches at the same index
   (`answer.length === correctOrder.length && answer.every((id, i) => id ===
   correctOrder[i])`); returns `0` for anything else, including a
   non-array/null answer, wrong length, or any single element out of place.
   No partial credit — one wrong slot fails the whole submission.

2. `computeOrderScoreUpdates({ answers, teams, scoreboardTeams, roundKey,
   points, correctOrder, slideId })` — mirror
   `computeMatchingScoreUpdates` in `matchingScoring.js` line-for-line in
   structure: same team_id → team name (trimmed/lowercased) → scoreboard_teams
   row attribution logic, same `normalizeRoundScore` read
   (`client/src/lib/scoreboardMath.js` — read this file too, specifically the
   `phoneBySlide` contract in `normalizeRoundScore`'s doc comment), same
   `phoneBySlide[slideId]` write-back shape, same dedupe-by-id guard at the
   end for the scoreboard-teams-name-collision case. The only real
   difference from Matching's version is calling `scoreOrderSubmission`
   instead of `scoreMatchingSubmission`.

**Do NOT reuse Matching's shuffle helpers** (`seededShuffle`,
`hashSeed`, `mulberry32`) by importing them from `matchingScoring.js` — Order
needs its own seeded shuffle for the image row (same algorithm, different
file, since `orderScoring.js` shouldn't import from a sibling mechanic's
file). Copy the three shuffle-related functions from `matchingScoring.js`
into `orderScoring.js` verbatim (they're mechanic-agnostic — just shuffle a
list stably by seed) — including the "re-roll on fixed point for n>=3"
behavior and its comment explaining why. Rename nothing inside them; only
the exports at the top level need order-specific names.

**Tests** (`orderScoring.test.js`), mirroring `matchingScoring.test.js`'s
structure (read it too):
- `scoreOrderSubmission`: full correct match → full points; one item
  swapped → 0; shorter/longer answer than correctOrder → 0; empty array →
  0; null/undefined answer → 0.
- `computeOrderScoreUpdates`: full correct submission scores the round;
  wrong order scores 0 for that team; a team with no `phone_answers` row is
  skipped (not scored 0 explicitly — mirror Matching's "no submission at all
  means no update entry" behavior, check this against the real Matching
  behavior, not the older spec doc, since Matching's actual code may have
  moved past the spec's "scores 0" prose); name-collision dedupe behaves
  like Matching's.
- Seeded shuffle: deterministic for the same seed, different for a
  different seed, and (for n>=3) never returns the identity order.

Report back the exact function signatures you shipped — Task 3 needs them
verbatim.

## Task 2 — Display + phone components, shinySeries helper

**Mirrors:**
- `client/src/components/display/slides/ShinyMatchingQuestion.jsx` → new
  `client/src/components/display/slides/ShinyOrderQuestion.jsx`
- `client/src/components/join/MatchingBoard.jsx` → new
  `client/src/components/join/OrderBoard.jsx`
- `client/src/lib/shinySeries.js`'s `isMatchingShiny(data)` (read the real
  function — it's `return data.shinyInputSchema?.type === 'matching'`, one
  line) → add `isOrderShiny(data)` alongside it, same one-line shape:
  `return data.shinyInputSchema?.type === 'order'`.

Read both Matching source files in full before writing anything — they're
the exact shape of what you're building, adapted from pairing to
sequencing.

**`ShinyOrderQuestion.jsx`** (display), three states mirroring Matching's:
1. **Open** — images in a fixed shuffled row (seeded off slide id, via the
   shuffle you copied into `orderScoring.js` in Task 1 — import it from
   there), each labeled A/B/C/D…, question text, live "X of Y teams
   submitted" count subscribed the same way Matching's open state already
   subscribes to team/answer state (read exactly how Matching does this
   subscription — don't invent a new one). No per-team answers visible.
2. **Locked, not yet scored** — same brief transitional state Matching has;
   copy its approach, this state should barely be visible in practice.
3. **Revealed** — images re-arranged into the correct order (1st, 2nd,
   3rd… under each), shiny-gold highlight treatment, same visual language
   `PylRevealSlide.jsx` and Matching's own revealed state already use for a
   correct-answer reveal.

**`OrderBoard.jsx`** (phone, mounted from `/join`), mirroring
`MatchingBoard.jsx`'s structure and Supabase-write pattern exactly (same
debounce/upsert-on-every-change shape to `phone_answers`, same "team closes
browser mid-question, doesn't lose progress" guarantee):
- Same images/labels as `/display`, same shuffled order (read from
  `slide.data.items`, shuffled the same seeded way so it visually matches
  the TV).
- Tap an unnumbered image → stamps it with the next sequence number (1, 2,
  3…) and upserts the in-progress `answer` array to `phone_answers`.
- "⌫ Undo last" button — removes the number from whichever image currently
  holds the highest number (stack-pop), upserts the shortened array.
- Read-only rendering once `slide.data.orderLocked` is true (mirror
  Matching's locked-board read-only treatment).
- No submit button — per Global Constraints above.

Don't touch `Join.jsx`'s mount point or `QuestionSlide.jsx`'s dispatch in
this task — that's Task 3, once `isOrderShiny` exists for it to check
against.

## Task 3 — Integration wiring

Five touch points, mirroring Matching's own integration exactly at each one
(read the current Matching code at each site before editing — this is where
"looks similar" isn't good enough, it needs to be the same mechanism):

1. **`client/src/components/host/FormatLibrary.jsx`** — add `'order'` to
   wherever `'matching'` is currently listed as an `INPUT_TYPES` /
   format-type option (read the file to find the exact list and the UI copy
   pattern for Matching's entry, mirror it for Order — name, icon, and the
   `pointsForOrder` default field the host sets when creating the format).

2. **`client/src/components/host/SlideEditor.jsx`** — add an `OrderBuilder`
   sub-component mirroring whatever Matching's own builder is called there
   (find it by searching for `isMatchingShiny` in this file). The host needs
   to: upload N images (reuse the existing `uploadMedia` action the same way
   other image-shiny builders in this file already do — search for an
   existing per-slide image-upload UI to mirror, e.g. the mediaSlots builder
   for "We're not so different"), and set the correct order — the simplest
   correct-order UI is host taps the images in the correct order themselves,
   same tap-to-sequence interaction as the phone board, OR a numbered
   dropdown per image if that's a smaller diff against the existing builder
   patterns in this file. Use your judgment on which is the smaller,
   more-consistent-with-this-file's-existing-patterns diff — note which you
   picked and why in your report. Include whatever phone-preview mechanism
   Matching's builder already has (search for it) so the host can see how
   the phone board will look.

3. **`client/src/components/display/slides/QuestionSlide.jsx`** — find
   the `isMatchingShiny(...)` dispatch branch and add an equivalent
   `isOrderShiny(...)` branch dispatching to `ShinyOrderQuestion` (built in
   Task 2), inserted the same way relative to the `ShinyIntroScreen` beat
   Matching's branch already goes through — shiny questions get that intro
   beat "for free" per the existing pattern, don't rebuild it.

4. **`client/src/views/Join.jsx`** — find where `MatchingBoard` gets
   mounted (checking `isMatchingShiny`) and add the equivalent mount for
   `OrderBoard` checking `isOrderShiny`.

5. **`client/src/components/host/LiveMode.jsx`** — find Matching's "Lock
   Answers" control (visible only when the live slide `isMatchingShiny`) and
   its on-click handler (writes `slide.data.matchingLocked = true` via the
   existing debounced `updateSlide`, then reads `phone_answers` for the
   slide and calls `computeMatchingScoreUpdates`, then upserts the results
   into `scoreboard_teams`). Mirror this exactly for Order: writes
   `slide.data.orderLocked = true`, calls `computeOrderScoreUpdates` from
   Task 1 with the slide's `correctOrder`/`pointsForOrder`, same upsert
   path. Confirm from Task 1's report which exact function signature to
   call.

**Validation guard** (mirror whatever Matching's `AddSlideWizard.jsx` or
`SlideEditor.jsx` validation does for "fewer than 2 pairs" per the original
foundation spec's edge-case guard) — Order needs the equivalent: a question
can't go live with fewer than 2 items or with `correctOrder` not matching
`items` 1:1 (same set of ids, no duplicates, no missing ids). Find where
Matching enforces its analogous guard and mirror it, or if Matching doesn't
actually enforce this today (the spec mentions it but check the real code),
note that in your report rather than inventing new validation infrastructure
this task doesn't call for.

After this task, do a full manual trace: create a test Order Up question in
a local/dev show (images can be placeholder URLs), confirm it appears in
Add Shiny, renders on a slide, shows on `/display`, and the phone board
mounts on `/join` for that slide. You don't need a live multi-phone test —
confirm the wiring reaches end to end without a console error.
