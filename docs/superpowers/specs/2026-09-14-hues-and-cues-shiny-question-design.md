# Hues and Cues — new shiny question type

Date: 2026-09-14

## What this is

Ports the board game Hues and Cues into a shiny question type: a color grid, a
one-word clue, teams guess the target square, scored by distance. Reviewed
twice by an adversarial critique pass (Fable 5.1) against the wager/choice
precedent in this codebase; both rounds' fixes are folded in below.

## Grid

- `client/src/lib/huesCuesGrid.js` — generated palette, not hand-typed hex.
- 16 columns (`A`–`P`, no letters skipped — see Phone input) × 15 rows
  (`1`–`15`) = 240 squares. Code format: `H8`.
- Generate in OKLCH via the existing `client/src/lib/oklab.js`, hue × lightness
  sweep at as-high-as-possible chroma per cell (gamut-clamped — reduce chroma
  per cell until in-gamut rather than clipping to a flat value, or dark
  yellows/light blues collapse into look-alike cells). Target roughly
  L 0.35–0.9 so no row goes near-black or near-white. Test: minimum pairwise
  OKLab distance between any two squares stays above a floor (exact floor
  picked during implementation, verified with a real distinctness check, not
  eyeballed).
- Parser for a stored answer code: `^([A-P])(1[0-5]|[1-9])$`. Used once, on
  the host-authored answer — never round-tripped from a phone guess (the
  phone stores `{col, row}` structured, see below).

## Answer storage

Reuses the existing generic `data.answer` field slide types already have —
**not** a new `data.huesCuesAnswer` field. A prior shiny type shipped with a
duplicate answer field and hit a real production bug (2026-09-06: the
generic Answer box and the type-specific field disagreed). `SlideEditor.jsx`
must hide the generic Answer `TextInput` for this type, the same way it
already does for `choice` (~line 1153) — otherwise two controls write
`data.answer` and can disagree.

## Host authoring

- `SlideEditor.jsx`: new grid-picker component (click a swatch → sets
  `data.answer` to that square's code), modeled on the existing `GridEditor`
  pattern used for the `grid` slide type.
- `client/src/lib/shinyWizardKinds.jsx`: add an entry to `FIXED_SHAPE_KINDS`
  with `hasOwnControls: false` (straight copy of the choice/wager entries —
  AddSlideWizard otherwise shows a slot-count input that doesn't apply here).
- `FormatLibrary.jsx`: register `hues-cues` as a selectable shiny format,
  `input_schema` jsonb, no migration needed (same as every other format).

## Phone (`/join`)

New `HuesCuesBoard.jsx`, mounted from `Join.jsx` next to `WagerBoard`/
`ChoiceBoard` via an `isHuesCuesShiny` predicate in `shinySeries.js`. Copies
the **full board contract** those components already implement — this is not
optional, every point below is a real landmine one of the existing boards
already hit:

- Committed-vs-local state split: `onAnswered` only fires once a save is
  **confirmed**, never on the optimistic local tap.
- `locked` gate reads from slide data (`data.huesCuesLocked`) — once the host
  locks, the board goes read-only.
- Restore-own-row on mount, so a phone reload mid-question keeps the team's
  in-progress pick.
- `preview` prop, so SlideEditor's live phone preview renders this board too.
- Chained-promise save queue + timeout race on the Supabase write (same
  pattern as `WagerBoard.jsx`'s `saveChainRef` — rapid taps can't land out of
  order, a dead connection can't wedge the UI).
- Upserts into the existing `phone_answers` table (`show_id, slide_id,
  team_id, answer jsonb`, `onConflict: 'slide_id,team_id'`) — no new table.
  `answer` shape: `{ col: 'H', row: 8 }`, structured, never a re-parsed code
  string.
- `submitted_at` is NOT client-set (server trigger owns it, per existing
  convention).

### Interaction flow (confirmed with Ben)

Two-phase, deliberately split so browsing never commits anything:

1. **Browse.** Full 240-square grid, freely pannable/zoomable (plain CSS
   `transform` + touch/pinch handlers — no new npm dependency; `touch-action:
   none` on the pan surface so it doesn't fight the join sheet's own scroll).
   No selection state yet.
2. **Pick.** An "I'm Ready" button opens a picker sheet (slides up from the
   bottom, `EASE_PANEL` curve from `client/src/lib/easings.js` — the same
   curve every other drawer/sheet on `/join` uses, not a new one):
   - Letter row: 16 buttons, **A–P, no letters skipped.** The original design
     worried about `I`/`1` and `O`/`0` typos, but that risk only existed for
     *typed* entry — Ben explicitly ruled out typing ("fat finger syndrome"
     on a phone keyboard in a dark bar), so the whole board is tap-only and
     the ambiguity risk is gone. Layout wraps into a real grid (e.g. 4×4),
     not a single 16-wide row — at typical phone width a 16-across row is
     ~20px per button, under the ~44px minimum comfortable tap target.
   - Number row: 15 buttons (e.g. 3×5 wrap), same tap-target sizing rule.
   - Either can be re-tapped to change the pick before locking in — this is
     just two independent `useState` values (`col`, `row`); no ordering
     dependency, changing one after the other is a plain state update, not a
     special case.
   - Live preview: the currently-picked square's color swatch, updates as
     either row is tapped.
   - Explicit "Lock In Guess" button commits — matches every other board's
     explicit-commit convention (never an implicit "last tap" heuristic).
   - Tap feedback: `scale(0.97)` on `:active`, 150-200ms, `ease-out`.

No phone-side result popup after the reveal (wager has one, choice doesn't —
this design follows choice: the TV reveal is enough, per Ben's confirmation).

## Display (`/display`)

New `ShinyHuesCuesQuestion.jsx`, mounted from `QuestionSlide.jsx` the same way
`ShinyWagerQuestion`/`ShinyChoiceQuestion` are, gated on `isHuesCuesShiny`.

- **While waiting for guesses:** `/display` cannot read `phone_answers` rows
  directly (RLS blocks anonymous reads). Poll the existing
  `phone_answers_count` RPC, same pattern as `ShinyChoiceQuestion.jsx` — show
  a submitted-count indicator, never live guesses.
- **On host-triggered reveal:** render only the persisted `huesCuesResults`
  snapshot on `slide.data` (never live `phone_answers` rows — RLS blocks it
  there too, and the snapshot is the single source of truth for what was
  scored). Sequence: flash the answer code (e.g. "H8"), then the color swatch
  beneath it, then each team's guess and how close it landed
  (dead-on/adjacent/miss). Motion: reuse `EASE_DROP` for the weighted "land"
  of the answer reveal (the same curve Winner Reveal already uses for its
  slam beat) and `EASE_OUT` for the team-result entries, staggered ~60ms per
  row (matching `ScoreboardOverlay.jsx`'s existing stagger). GPU-only
  (`transform`/`opacity`), `prefers-reduced-motion` guard throughout, per
  Critical Rules 2–3.
- **Must suppress the generic full-screen answer-reveal overlay.** The
  existing Stream Deck `A` key / `answer_reveal` toggle (`Display.jsx`'s
  `AnswerRevealOverlay`) currently only suppresses itself for `isWagerShiny`.
  Add `isHuesCuesShiny` to that same suppression check — otherwise hitting
  reveal before guesses are locked flashes the raw answer code full-screen
  over the grid, outside this component's own reveal sequence, at the wrong
  time and in the wrong style. This applies whenever reveal is triggered —
  immediately after the question or later while going back over round
  answers — the fix isn't about timing, it's about which code path owns the
  reveal.

## Host control wiring

The most-underspecified part in round 1 of critique — named explicitly here
so implementation doesn't have to guess. A new phone-interactive shiny type
touches all of the following in `LiveMode.jsx` / `slideStepping.js`, mirrored
off the `choice` type's existing wiring:

- `slideStepping.js` `PHONE_MECHANICS` table: new entry —
  `{ guard: isHuesCuesShiny, lockFields: ['huesCuesLocked'], lockedAtField:
  'huesCuesLockedAt', revealField: 'huesCuesRevealed', resultsField:
  'huesCuesResults' }`.
- `LiveMode.jsx`:
  - `lockHandlersRef` entry for this type.
  - Panel/UI config map entry (the per-type control block in the live
    control surface).
  - `handleLockAndScoreHuesCues` — a `preCheck` that rejects a missing or
    malformed `data.answer` (parseable by the regex above) before scoring
    runs, mirroring wager's pre-check pattern.
  - `huesCuesBusy` / `huesCuesScoreError` state pair, cleared on slide change
    (same effect wager/choice already have).
  - `buildResults`: hybrid of choice's (populate from `answers`, not `teams`
    — this is absolute-distance scoring, not room-relative, so no
    wager-style force-path is needed) but must still return a non-null
    `results` array for the `resultsField` snapshot.
- `Join.jsx`: board dispatch entry (mount `HuesCuesBoard` for this shiny
  type).
- `QuestionSlide.jsx`: TV dispatch entry (mount `ShinyHuesCuesQuestion`).

`withEntryState` already clears lock/reveal fields via the `PHONE_MECHANICS`
table for free once the entry exists — no separate reset code needed.

## Scoring

`client/src/lib/huesCuesScoring.js`, mirrors `wagerScoring.js`'s shape but
simpler — this is absolute distance, not room-relative rank:

```
scoreHuesCuesRound({ entries, correctAnswer })
```

- `entries`: `[{ teamId, guess: {col, row} }]` from `phone_answers`.
- `correctAnswer`: the host's `data.answer` code, parsed once.
- Distance metric: **Chebyshev** (`max(|Δcol|, |Δrow|)`), not Manhattan —
  Chebyshev distance 1 is exactly the 8 surrounding squares (a king's move),
  which is what "8 squares around" means. Manhattan distance 1 would only be
  the 4 orthogonal neighbors.
- Points: distance 0 → 20, distance 1 → 10, else → 0.
- Corner/edge squares naturally have fewer real neighbors (a corner square
  has only 3 neighbors at distance 1, not 8) — this falls out of the distance
  math for free, no special-casing needed, and is correct behavior (not a
  bug): a corner guess is still scored right, it just has fewer squares that
  can earn the 10-point tier.
- No ties to resolve (score is per-team absolute, not room-relative).

```
computeHuesCuesScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
```

Mirrors `computeWagerScoreUpdates` exactly: folds into
`scoreboard_teams.scores[roundKey].phoneBySlide[slideId]`, idempotent
re-score, dedupes by scoreboard team id (same guard against duplicate-name
data-entry accidents).

## Tests

`huesCuesScoring.test.js`, pattern-matched to `wagerScoring.test.js`:

- Exact match → 20.
- Each of the 8 neighbors → 10.
- A square at distance 2 → 0.
- Corner square (fewer real neighbors) scores correctly with no special case.
- `computeHuesCuesScoreUpdates` idempotent re-score, dedupe-by-id behavior.

`huesCuesGrid.test.js`:

- Every generated code matches the regex.
- Generation is deterministic (same output every run — no `Math.random()`
  without a fixed seed).
- Minimum pairwise OKLab distance between any two squares clears the chosen
  floor (perceptual distinctness is a real, checked property, not assumed).

## Explicitly out of scope

- No phone-side result popup (TV reveal is enough).
- No retrofit of `GridSlide.jsx`'s `GridContent` for the display grid — it
  has no highlight/label layer and a fresh 240-div grid is less work than
  bolting that on.
- No extraction of a shared `foldPhoneScores()` helper across
  matching/order/choice/wager/hues-cues even though this would be the fifth
  byte-identical fold-in pattern — flagged for a future cleanup, not this
  feature.
