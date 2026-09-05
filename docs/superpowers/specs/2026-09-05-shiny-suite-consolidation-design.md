# Shiny Suite Consolidation (H1-H5) — Design

Date: 2026-09-05
Status: design approved by Ben in chat, formalizing before planning.

## Goal

A Fable 5.1 critique of the whole shiny-format suite (matching/wager/order/bendle
plus the shared creation/lock/reveal machinery) surfaced a real live bug and four
concrete simplify/level-up opportunities. Ben approved doing all five in one pass.
This spec covers exactly those five (H1-H5) — no new shiny formats, no unrelated
cleanup.

**C1, the bug that motivated this pass:** `slideStepping.js`'s `withEntryState`
clears each phone-scored mechanic's lock/reveal flags on fresh slide entry
(2026-08-31 fix, so a rehearsal-locked slide doesn't stay locked when the show
goes live) — verified live at `slideStepping.js:127-128` (`protectLockedFlags`)
and `:136-144` (the clear list). Both lists enumerate
`wagerTiersLocked/wagerGuessesLocked/wagerRevealed/matchingLocked/
matchingRevealed/orderLocked/orderRevealed` and never gained
`bendleGuessesLocked`/`bendleRevealed` when Bendle shipped. A Bendle slide locked
during rehearsal stays locked live: `Join.jsx`'s `liveSlideIsInteractive` stays
false, phones never mount `BendleBoard` as interactive, `/display` shows the
locked badge, audio never starts. Silent — no error anywhere. H1 fixes this as a
side effect of its real target (see below), not as a standalone patch.

## H1 — one shared mechanic descriptor, `slideStepping.js`

**Problem, verified:** which lock fields / reveal field a phone-scored mechanic
uses is hand-restated in at least six places: `pendingLockPhase` (`:327-338`),
`pendingReveal` (`:359-368`), `REVEAL_FIELD` (`:343-349`), `withEntryState`'s
`protectLockedFlags` (`:127-128`) and clear list (`:136-144`), `Join.jsx`'s
`liveSlideIsInteractive` AND-chain (`:1281-1285`) and `interactivePhaseKey`
(`:1300`). C1 is what happens when one restatement is missed — there is no
mechanism forcing all seven to agree.

**Fix:** one table in `slideStepping.js`:

```js
// One definition of "what does mechanic X need to lock/reveal/reset" — every
// place that used to restate this list by hand now derives from here, so
// adding a phone-scored mechanic (or fixing one) is one entry, not seven.
export const PHONE_MECHANICS = {
  matching: { guard: isMatchingShiny, lockFields: ['matchingLocked'], revealField: 'matchingRevealed' },
  wager:    { guard: isWagerShiny,    lockFields: ['wagerTiersLocked', 'wagerGuessesLocked'], revealField: 'wagerRevealed' },
  order:    { guard: isOrderShiny,    lockFields: ['orderLocked'], revealField: 'orderRevealed' },
  bendle:   { guard: isBendleShiny,   lockFields: ['bendleGuessesLocked'], revealField: 'bendleRevealed' },
}
```

`lockFields` is ordered — wager is the one two-phase mechanic (blind tier pick,
then the numeric guess), and `pendingLockPhase` needs "first unlocked field in
order" semantics to reproduce its current `wager-tiers` then `wager-guesses`
behavior.

Rewrite to derive from the table (mechanical, not creative — walk
`Object.entries(PHONE_MECHANICS)`, call `guard(data)`, use `lockFields`/
`revealField`):
- `pendingLockPhase` — for the matched mechanic, return `${key}` if single
  lockField, or `${key}-tiers`/`${key}-guesses`-shaped strings if the mechanic
  needs multi-phase naming (only wager does today; keep its existing phase
  string values — `'wager-tiers'`/`'wager-guesses'` — for `lockHandlersRef`
  compatibility, don't rename them).
- `pendingReveal` — same matched mechanic, `data[lockFields.at(-1)] && !data[revealField]`
  (verified against the real current code, `slideStepping.js:359-368`: wager
  keys off `wagerGuessesLocked` alone, the same "last lock field" rule as
  `liveSlideIsInteractive` below — not `lockFields.every(...)`, even though the
  two are equivalent in practice today because `pendingLockPhase` already
  enforces tiers-before-guesses sequentially; state the direct rule, don't lean
  on that invariant holding forever).
- `REVEAL_FIELD` — `Object.fromEntries(Object.entries(PHONE_MECHANICS).map(([k, v]) => [k, v.revealField]))`.
- `withEntryState`'s `protectLockedFlags` — `protectInProgress && Object.values(PHONE_MECHANICS).some(m => m.lockFields.some(f => slide.data?.[f]))`.
- `withEntryState`'s clear list — loop every mechanic's `lockFields` + `revealField`, same `if (slide.data?.[f]) patch[f] = false` shape, replacing the seven hand-written lines.
- `Join.jsx`'s `liveSlideIsInteractive` — **verified against the real current condition** (`Join.jsx:1281-1285`, already includes `bendleGuessesLocked` from the Bendle final-review fix wave, commit `1f10a30`): a mechanic is interactive while its LAST lock field is still false, not "all lock fields false" — wager stays interactive through both the tiers phase and the guesses phase, only releasing once `wagerGuessesLocked` fires, `wagerTiersLocked` alone does not end interactivity (a team still has to enter a number once the question is revealed). Correct derivation: `Object.values(PHONE_MECHANICS).some(m => m.guard(data) && !data[m.lockFields.at(-1)])`. Getting this wrong (e.g. "every lockField false") would silently break wager: teams would be released from the force-pin the instant the question appears, before they can actually answer it — verify this exact behavior is preserved with a live check, not just a passing unit test, since this is the one place H1's refactor could regress an already-correct, already-fixed line.
- `Join.jsx`'s `interactivePhaseKey` — same file, same commit, already includes `bendleGuessesLocked`. Build the key by concatenating every mechanic's lock fields' values in a stable order (`Object.values(PHONE_MECHANICS).flatMap(m => m.lockFields).map(f => data?.[f]).join(':')`), prefixed by `slide?.id` — this one has no "last field only" subtlety, every lock field transition should reset `interactiveSatisfied`, matching current behavior exactly.

**Explicitly not touched by H1:** the four `Board.jsx` components, the four
`Shiny*Question.jsx` display components, the four scoring libs — those don't
restate the flag list, they read `slide.data` directly per-mechanic. H1 is
scoped to the phase/lock bookkeeping layer only.

## H2 — one shared `lockAndScore()` helper, `LiveMode.jsx`

**Problem, verified:** `handleLockAndScoreMatching` (`:356-453`),
`handleLockAndScoreOrder` (`:454-579`), `handleLockAndScoreWagers`'s second half
(`:580-709`), and `handleLockAndScoreBendle` (`:710-820`) each do, in order:
stamp `lockedAt` if unlocked → `actions.updateSlide` + `flushSlides` + 700ms wait
→ fetch `phone_answers` filtered to `submitted_at <= lockedAt` → fetch `teams` →
fetch `scoreboard_teams` → refuse if `!force && answers.length === 0 &&
teams.length > 0` → compute mechanic-specific entries → call the mechanic's
`score*Round`/`compute*ScoreUpdates` → refuse if entries exist but no updates
matched → upsert `scoreboard_teams` → write `data.{lockField}: true,
{lockField}At, {mechanic}Results` back onto the slide (no reveal flag — that's
the host's separate A-key press). The four `*Busy`/`*Error` state pairs
(`:245-252`) and four control-panel JSX blocks (`:1390-1519`) mirror the same
shape.

**Fix:** one helper:

```js
// entries/score/errorLabel are the only real per-mechanic differences —
// everything else (the lock stamp, the three fetches, the cutoff filter, the
// zero-answers refusal, the upsert, the final write) is identical across all
// four mechanics and was drifting slightly out of sync between them before
// this existed.
async function lockAndScore({
  slide, lockField, lockedAtField, resultsField, mechanic,
  buildEntries,      // (answers, teams, extra) => entries[] — mechanic-specific shape
  score,             // (entries, extra) => results[] — calls the mechanic's score*Round
  computeUpdates,    // (results, teams, scoreboardTeams, roundKey, slideId) => updates[]
  loadExtra,         // async (slide) => extra (e.g. bendle's song row, wager's tiers snapshot) — optional
  force = false,
  setBusy, setError, zeroAnswersError,
}) { /* the ~60 shared lines, parameterized */ }
```

Each existing handler becomes a thin wrapper supplying its mechanic-specific
`buildEntries`/`score`/`computeUpdates`/`loadExtra`. `handleLockWagers` (the
first-phase, tiers-only lock — `:520-579` roughly, verify exact range) stays
separate; it's a genuinely different operation (locks the question visible, no
scoring happens yet), not a fourth call site for this helper.

Collapse the four `*Busy`/`*Error` state pairs into one
`{ scoring: { mechanic, busy, error } }` state object, and the four control-panel
JSX blocks (`:1390-1519`) into one that reads `pendingLockPhase`/`pendingReveal`
(now H1's table) to pick copy/mechanic dynamically, same visual shape as today
(one panel visible at a time, same button/error/override structure) — this is a
render-logic consolidation, not a visual redesign; the host should not notice
any UI change.

**Also folds in, same pass (cheap, same file, same root cause class):**
`wagerActionShowing` (`:306-310`) currently only blocks the scoreboard modal for
an active wager question ("modal covers the Lock button" — B6 fix). The same
problem exists for matching/order/bendle and was never extended. Once H1's
`PHONE_MECHANICS` table exists, generalize this to any mechanic with a pending
lock/reveal, not just wager.

## H3 — `BendleBuilder` in `SlideEditor.jsx`

**Problem, verified:** `grep -c bendle client/src/components/host/SlideEditor.jsx`
→ 0. Bendle has no post-creation editor at all — a host can't see which song is
attached to an existing slide, can't change it, can't preview it. `LiveMode.jsx`'s
own no-song-refusal message (`:719` area, exact line may have shifted since the
final Bendle review — verify) already admits this gap.

**Fix, verified against the real `WagerBuilder`/wiring shape:**
`WagerBuilder` (`SlideEditor.jsx:1729-1767`) is simpler than Fable's critique
implied — it takes one prop, `{ answer }`, and is purely informational/
validating (shows the fixed `WAGER_TIERS` ladder read-only, and warns if
`answer` is missing or non-numeric). It has NO edit callback of its own —
Bendle's song selection needs one, since (unlike wager's plain numeric
answer) it's a dropdown pick from `bendle_songs`, not free text in the
existing shared Answer field.

The real dispatch pattern (`SlideEditor.jsx:950-995`, `schema.type === 'X'`
branches) always pairs a Builder with a live "Phone preview" block rendering
the real `*Board` component with a `preview` prop and a synthesized
preview `team`/`slide` (see `:960-970` for Matching's exact shape, `:983-993`
for Wager's).

**Real gap found, must be fixed as part of this task:** `BendleBoard.jsx` has
**no `preview` prop at all** today (`grep preview client/src/components/join/BendleBoard.jsx`
→ zero matches, vs. `WagerBoard.jsx`'s `preview = false` param used at 5 call
sites to skip the real mount-check fetch and no-op the submit handler). Add
the same `preview` support to `BendleBoard.jsx` FIRST — mirror
`WagerBoard.jsx`'s exact `preview` guards (skip the `phone_answers` mount-check
query, make `handleSubmit` a no-op, use a synthetic team count if it fetches
one) — before wiring it into a preview pane, or the preview would attempt
real Supabase reads/writes against a fake `__preview__` team/show that don't
exist.

Then:
1. New `BendleBuilder({ songId, onChangeSongId })` in `SlideEditor.jsx`
   (near `WagerBuilder`): fetches `bendle_songs` (same query
   `AddSlideWizard.jsx`'s song picker already uses — reuse it, don't
   duplicate a second fetch), renders a dropdown bound to `songId`/
   `onChangeSongId`, and a read-only `BENDLE_TIERS` ladder display (same
   informational shape as `WagerBuilder`'s tier list, adapted to Bendle's 3
   steps/`stems` fields — see `bendleScoring.js`'s `BENDLE_TIERS`).
2. Wire it into `SlideEditor.jsx`'s dispatcher: add a
   `{schema.type === 'bendle' && (...)}` branch alongside the existing
   matching/wager/order branches (`:950-1010`), passing
   `songId={data.bendleSongId}` and `onChangeSongId={id => onChange('bendleSongId', id)}`
   (confirm `onChange`'s real signature against how the other builders call
   it, e.g. `:956-957`'s `onChangePairs`/`onChangePoints` — match that exact
   pattern, don't invent a different update mechanism), plus a
   `BendleBoard preview` phone-preview block matching Matching/Wager's shape
   exactly (`:960-970`, `:983-993`).

## H4 — port the wizard's count+relationship fix into `DatabaseAddPanels.jsx`

**Problem, verified:** `client/src/components/host/DatabaseAddPanels.jsx` has
its own, older copy of the pre-2026-08-25-rebuild wizard logic —
`isImageFmt`/`isConcurrentFmt`/`hasAssetPreset`/`effectiveAssets`
(`:191-200, 207, 268, 375, 393, 458`) — the exact "preset lock" bug class the
real wizard rebuild fixed everywhere else, still live here.

**Ben's call (2026-09-05, revised):** keep this bulk-entry panel — it's a
"just in case" fallback even though the live-show pipeline
(`AddSlideWizard.jsx`, which auto-archives via `archiveQuestion.js`) covers
real usage today. Don't lose the functionality — port the fix rather than
deleting the path.

**Fix, verified precise scope (this panel is simpler than `AddSlideWizard` —
no live slide, no round, no tied/separate relationship concept, just
`useItemList` — don't port the wizard's full 3-way relationship picker, that
would be new complexity this panel doesn't need):**

`DatabaseAddPanels.jsx:191-200` computes:
```js
const fmtAssetPreset = selectedShinyFmt?.input_schema?.slots
const hasAssetPreset = typeof fmtAssetPreset === 'number' && fmtAssetPreset > 0
const effectiveAssets = hasAssetPreset ? fmtAssetPreset : assetCount
```
and `:392-393` gates the "How many assets?" input's visibility on
`!hasAssetPreset` — hiding it entirely and silently hard-overriding whatever
`assetCount` holds whenever the picked format has a `slots` preset. This is
the exact "preset lock" bug class (hides the control, overrides the typed
value) the 2026-08-25 wizard rebuild fixed everywhere else.

Minimal, precise fix (three changes, same file):
1. `:200` — `effectiveAssets` becomes just `assetCount` (drop the
   `hasAssetPreset ? fmtAssetPreset : ...` branch entirely — the preset never
   overrides once this lands, matching the real wizard's rule).
2. `:393` — remove the `{!hasAssetPreset && (...)}` gate so the "How many
   assets?" input always renders, for every format.
3. When `selectedShinyFmt` changes (find wherever the format-picker's
   `onClick`/`onChange` sets `selectedShinyFmt` — likely near the pick-step
   UI earlier in this file), pre-fill `assetCount` from `fmtAssetPreset` if
   one exists, else leave it at its current default — a **pre-fill**, not an
   override, so a host who then edits the field keeps whatever they typed.

Keep the regular/swing/PYL bulk-entry paths in this file completely
untouched — this fix is scoped to these three exact lines/behaviors, and the
panel's existing functionality (bulk archive entry) must not regress or
disappear. Do not introduce a relationship/tied-vs-separate concept here;
`useItemList` (`:207`, already correct, unaffected by this fix) already
covers what this panel needs.

## H5 — submitted-count line for `ShinyMatchingQuestion.jsx`

**Problem, verified:** `ShinyOrderQuestion.jsx:34-62`'s own code comment
confirms `phone_answers_count(slide_id)` — a generic SECURITY DEFINER RPC,
already live since migration `20260817171310_lock_down_phone_answers_select.sql`
— was "provisioned... for exactly this ('a submitted-count
(ShinyMatchingQuestion.jsx)') but never actually wired up until now [Order]."
Matching was the RPC's original intended consumer and never got it.

**Fix:** copy `ShinyOrderQuestion.jsx:34-62`'s pattern into
`ShinyMatchingQuestion.jsx` verbatim-adapted (same polling effect: stop on
`locked || revealed`, 2s interval, `phone_answers_count` RPC call; same
`teamCount` fetch effect) — render the same "N of M teams submitted" line
Order/Wager/Bendle already show, in Matching's beat-1 (pre-lock) render.

## Explicitly out of scope for this pass

Everything Fable's critique flagged as Nice-to-have (N1-N6): the duplicated
"Add X →" button label, the dead `hasOwnControls` flag, the untyped wizard ctx
bag, `FormatLibrary`'s legacy toggle vocabulary, the small consistency drifts
(inline `roundKey` in matching's handler — though H2 may incidentally fix this
by routing through the shared helper's `roundKeyFor` call, not a separate task
either way — duplicated seeded-random code, missing `RoundSidebar` prefixes,
Bendle's no-popup reveal), and `BendleAdmin` being insert-only. None of these
are in this pass; don't fix them as a "while I'm here."

## Testing

- H1: unit tests for `pendingLockPhase`/`pendingReveal`/`REVEAL_FIELD` already
  exist per-mechanic in `slideStepping.test.js` — they must all still pass
  unchanged (behavior-preserving refactor, not a behavior change) plus new
  tests proving C1 is fixed (a fresh-entry Bendle slide with
  `bendleGuessesLocked: true` gets cleared, same as the existing
  wager/matching/order fresh-entry-clear tests already cover).
- H2: no existing test suite covers `LiveMode.jsx`'s handlers directly (they're
  integration-shaped, tested via the live-DB harnesses Tasks 7/9 used during
  Bendle's build) — the refactor's correctness bar is: full `npx vitest run`
  stays green, and a live-DB verification harness (same shape as Bendle Task
  9's) proving each of the four mechanics still locks/scores/reveals correctly
  post-refactor, run against a throwaway show, cleaned up after.
- H3: no existing test file for `WagerBuilder`/other `SlideEditor` builders —
  match whatever testing convention (if any) the file already has; if none,
  a manual verification (open the editor for a real Bendle slide, confirm song
  shows/changes) is the bar, same discipline as H2.
- H4: confirm regular/swing/PYL bulk-entry still works after the change
  (existing `DatabaseAddPanels` tests if any exist, else manual check) — this
  panel is being kept deliberately, so a regression here is a real problem,
  not a "nobody uses it anyway."
- H5: existing `ShinyOrderQuestion.test.jsx`-shaped test if one exists for the
  count-line pattern — mirror it for Matching. Manual `/display` check
  acceptable if no test convention exists for this file.

Full `npx vitest run` and `npm run build` must stay green throughout — this
touches shared files behind matching/wager/order, all live and working; a
regression to any of them is worse than not doing this pass at all.
