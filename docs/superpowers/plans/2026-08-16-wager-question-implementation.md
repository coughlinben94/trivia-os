# Wager Question — Implementation Plan

Date: 2026-08-16. Branch `wager-question`.

Phone-interactive mechanic #2, built on the `phone_answers` foundation laid for
Matching (see `docs/superpowers/specs/2026-07-28-phone-answer-scoring-design.md`).
Matching is the architectural template — every layer below mirrors its
counterpart, and every deliberate divergence is called out.

## The mechanic

1. **Blind wager.** Before the question text is shown anywhere, each team picks a
   risk tier on their phone: 🕯️ Play It Safe (10 pts) / 🔥 Play With Fire (20) /
   ☀️ Fly Close To The Sun (30). Each card shows exactly three things — emoji,
   name, points — plus the win bar stated as a head count ("Beat 6 of 11
   teams"), computed live from tonight's registered team count. Nothing about
   the question itself.
2. **Question reveal.** Host locks the wagers; the numeric question appears on
   the TV and phones. Teams build a number on a tap keypad (1–9 / ⌫ 0 C) with a
   live readout, and commit it with an explicit "Lock In Guess" — never on a
   "last digit typed" heuristic. They can update it until the host locks.
3. **Score at lock.** Host locks guesses. Every guess is ranked by absolute
   distance from the true answer — **relative to the room**, not against a fixed
   tolerance. A team wins its tier only if it beat enough of the rest of the room:
   Safe ≥50%, Fire ≥75%, Sun ≥90%. Miss your threshold → **0**, flatly. No
   fallback to a lower tier.

## Scoring algorithm (`client/src/lib/wagerScoring.js`)

Pool = every team with a finite numeric guess. Teams that never guessed score 0
and are excluded from the pool entirely (they aren't part of "the room" for
ranking purposes).

For each team in a pool of N:

```
distance     = |guess - correctAnswer|
strictlyWorse = # of other teams with distance > this distance
beatFraction = N > 1 ? strictlyWorse / (N - 1) : 1
won          = beatFraction >= TIER.threshold
points       = won ? TIER.points : 0
```

`teamsToBeat(threshold, N) = ceil(threshold * (N - 1))` is the ONE threshold
rule. The scorer applies it (`beaten >= teamsToBeat(...)`) and the phone
picker's "Beat N of M teams" copy prints it, so the bar a team is shown and the
bar it is scored against are the same inequality. Ceiling isn't a taste call:
for an integer `beaten`, `beaten/(N-1) >= threshold` is *exactly*
`beaten >= ceil(threshold*(N-1))`. A property test walks every room size 2–30 ×
every tier and asserts the team at the bar wins and the team one short loses.

**Denominator is N-1 (the *other* teams), not N.** With N teams, the best team
beats all N-1 others → beatFraction 1.0, so the Sun tier (0.90) is reachable in a
room of any size. Using N would cap the best team at (N-1)/N, making Sun
unreachable below 10 teams — wrong for an 8-team bar.

**Ties: count strictly-worse only.** Two teams equidistant from the answer get an
identical `strictlyWorse` count, therefore an identical `beatFraction` and an
identical win/lose result — the tie can't produce an off-by-one that splits them.
A tie is conservative: tied teams do not count as having beaten each other. It is
also explainable out loud ("you beat 2 of the other 3 teams"), which matters for
a mechanic a host has to justify to a room.

`N === 1` → beatFraction 1 by definition (there is nobody to beat; the sole
answering team wins whatever it wagered).

Point values and thresholds are **hardcoded constants**, per the spec — not
per-slide host-configurable. The host authors only the question and the true
number.

## Data (no migration)

`phone_answers.answer` is a generic `jsonb` column (its own migration comment
names future mechanics as the reason). Wager stores an object rather than
matching's array:

```js
answer: { tier: 'safe' | 'fire' | 'sun', guess: <number|null> }
```

Fits the existing column and the existing `unique (slide_id, team_id)` upsert.
**No schema change.**

Slide flags (mirroring `matchingLocked`/`matchingRevealed`):

- `wagerTiersLocked`  — wager phase closed, question revealed
- `wagerGuessesLocked` — guesses closed, scoring runs
- `wagerRevealed`     — scored, TV shows the reveal
- `wagerTiers: { [team_id]: tier }` — **snapshot** taken at wager-lock time
- `wagerResults: [{ teamName, guess, tier, points, won, distance }]` — for the TV reveal

`data.answer` (the existing generic shiny Answer field) holds the true number.
One field, parsed by `parseWagerNumber()`; the editor warns if it doesn't parse.

## Blind-wager enforcement (hard constraint)

Three layers, the third being the one that actually enforces it:

1. `/display` renders no question text until `wagerTiersLocked`.
2. `/join` disables the tier buttons once `wagerTiersLocked` is true.
3. **The host snapshots every team's tier into `slide.data.wagerTiers` at the
   moment of the wager lock, and scoring reads the snapshot, never the live
   row.** RLS on `phone_answers` is public-update by design (it's the phone's own
   data), so a client-side disable alone is a suggestion. The snapshot makes a
   post-reveal tier rewrite provably inert.

A team with no snapshot entry (joined late, never wagered) is scored at `safe` —
Safe is the spec's implicit no-risk default.

## Files

New:
- `client/src/lib/wagerScoring.js` + `.test.js`
- `client/src/components/join/WagerBoard.jsx`
- `client/src/components/display/slides/ShinyWagerQuestion.jsx`

Changed (one-line/one-block each, mirroring matching's touchpoints):
- `client/src/lib/shinySeries.js` — `isWagerShiny()`
- `client/src/components/host/FormatLibrary.jsx` — `'wager'` in `INPUT_TYPES`
- `client/src/components/host/SlideEditor.jsx` — `WagerBuilder` + phone preview
- `client/src/components/display/slides/QuestionSlide.jsx` — dispatch branch
- `client/src/views/Join.jsx` — mount `WagerBoard`
- `client/src/components/host/LiveMode.jsx` — two-step lock/score panel

`AddSlideWizard.jsx` is **untouched**: a `wager` format is non-image and
non-concurrent, so it already falls through to the generic Question + Answer
form, which is exactly the pair this mechanic needs. Nothing to add.

## Divergences from the matching precedent

| Matching | Wager | Why |
|---|---|---|
| one lock | two locks | the blind wager is a real phase boundary — reveal is what closes wagering |
| no per-team reveal on TV | `wagerResults` on the slide | who won at which tier is the payoff beat; the TV needs names + points |
| scores from live `phone_answers` | tiers from a host-written snapshot | enforces "no changing after reveal" against a public-update table |
| answer key is `data.pairs` | answer key is `data.answer` (parsed) | one true number; reusing the generic Answer field avoids a second answer field |
