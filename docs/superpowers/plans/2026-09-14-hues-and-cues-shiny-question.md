# Hues and Cues Shiny Question Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Hues and Cues" as a new phone-interactive shiny question type — a
240-square color grid, a one-word clue, teams tap-pick a coordinate, scored by
grid distance from the true answer.

**Architecture:** Follows the existing shiny-type extension points exactly
(shinySeries.js predicate, slideStepping.js PHONE_MECHANICS, LiveMode.jsx
lock/score/reveal wiring, a phone board mounted from Join.jsx, a display
component mounted from QuestionSlide.jsx). No new Supabase table — guesses go
through the existing `phone_answers` table like every other phone-interactive
type. No schema migration — `shiny_formats.input_schema` is jsonb.

**Tech Stack:** React 18, Vite, Tailwind, Framer Motion, Supabase JS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-hues-and-cues-shiny-question-design.md`

## Global Constraints

- Grid: 16 columns (`A`–`P`, no letters skipped) × 15 rows (`1`–`15`) = 240
  squares. Code format: `H8`. Regex: `/^([A-P])(1[0-5]|[1-9])$/`.
- Scoring: Chebyshev distance. 0 → 20 points, 1 → 10 points, else → 0. No
  ties to resolve (absolute distance, not room-relative).
- Answer storage: the existing generic `data.answer` field. No new
  `data.huesCuesAnswer` field — a prior shiny type shipped a duplicate answer
  field and caused a real production bug (2026-09-06).
- Phone input: tap-only, no typing anywhere (Ben's explicit call —
  fat-finger risk on a phone keyboard in a dark bar).
- No new Supabase table, no migration.
- GPU-only animation (`transform`/`opacity` only), every animated element
  gated behind `useReducedMotion()`.
- Reuse `client/src/lib/easings.js` curves (`EASE_OUT`, `EASE_DROP`,
  `EASE_PANEL`) — never declare a new curve.
- Object key for this shiny type is `huesCues` (camelCase) everywhere in JS
  (matches `matching`/`wager`/`order`/`choice` in `PHONE_MECHANICS` and
  `FIXED_SHAPE_KINDS`). The `shinyInputSchema.type` STRING value is
  `'hues-cues'` (kebab-case) — this split exists for every existing type too
  (confirmed: `FIXED_SHAPE_KINDS.choice` vs `shinyInputSchema?.type ===
  'choice'` — same string in that one case, but `wager-tiers`/`wager-guesses`
  vs `wager` shows the split is real elsewhere). Do not use `hues-cues` as a
  JS object key or `huesCues` as the `input_schema.type` string — keep them
  on their own sides consistently.

---

## File Structure

**Create:**
- `client/src/lib/huesCuesGrid.js` — grid generation, coordinate helpers, code regex/parser.
- `client/src/lib/huesCuesGrid.test.js`
- `client/src/lib/huesCuesScoring.js` — scoring + scoreboard fold-in.
- `client/src/lib/huesCuesScoring.test.js`
- `client/src/components/join/HuesCuesBoard.jsx` — phone board.
- `client/src/components/display/slides/ShinyHuesCuesQuestion.jsx` — TV display.

**Modify:**
- `client/src/lib/shinySeries.js` — add `isHuesCuesShiny`.
- `client/src/lib/slideStepping.js` — add `PHONE_MECHANICS.huesCues`.
- `client/src/lib/shinyWizardKinds.jsx` — add `FIXED_SHAPE_KINDS.huesCues`.
- `client/src/components/host/FormatLibrary.jsx` — add `'hues-cues'` to `INPUT_TYPES`.
- `client/src/components/host/SlideEditor.jsx` — grid-picker component; hide generic Answer field for this type.
- `client/src/components/host/LiveMode.jsx` — state, `handleLockAndScoreHuesCues`, `lockHandlersRef`, panel config.
- `client/src/views/Join.jsx` — mount `HuesCuesBoard`.
- `client/src/components/display/slides/QuestionSlide.jsx` — mount `ShinyHuesCuesQuestion`.
- `client/src/views/Display.jsx` — suppress the generic answer-reveal overlay for this type.

---

### Task 1: Grid generation

**Files:**
- Create: `client/src/lib/huesCuesGrid.js`
- Test: `client/src/lib/huesCuesGrid.test.js`

**Interfaces:**
- Produces: `HUES_CUES_COLS` (16), `HUES_CUES_ROWS` (15), `HUES_CUES_CODE_RE`
  (RegExp), `codeToColRow(code) -> {col, row} | null`, `colRowToCode({col,
  row}) -> string`, `chebyshevDistance(a, b) -> number` (a/b are `{col, row}`),
  `getHuesCuesGrid() -> [{code, col, row, hex}]` (240 entries, memoized),
  `getHuesCuesCell(code) -> {code, col, row, hex} | null`.
- Consumes: `oklabToRgb`, `rgbToOklab`, `rgbToHex` from
  `client/src/lib/oklab.js` (confirmed exports).

- [ ] **Step 1: Write the failing tests**

```js
// client/src/lib/huesCuesGrid.test.js
import { describe, it, expect } from 'vitest'
import {
  HUES_CUES_COLS, HUES_CUES_ROWS, HUES_CUES_CODE_RE,
  codeToColRow, colRowToCode, chebyshevDistance,
  getHuesCuesGrid, getHuesCuesCell,
} from './huesCuesGrid.js'

describe('huesCuesGrid dimensions', () => {
  it('is 16 columns by 15 rows = 240 squares', () => {
    expect(HUES_CUES_COLS).toBe(16)
    expect(HUES_CUES_ROWS).toBe(15)
    expect(getHuesCuesGrid()).toHaveLength(240)
  })
})

describe('code parsing', () => {
  it('accepts every real code', () => {
    for (const cell of getHuesCuesGrid()) {
      expect(HUES_CUES_CODE_RE.test(cell.code)).toBe(true)
      expect(codeToColRow(cell.code)).toEqual({ col: cell.col, row: cell.row })
    }
  })
  it('rejects out-of-range and malformed codes', () => {
    expect(codeToColRow('Q1')).toBeNull()   // column past P
    expect(codeToColRow('A16')).toBeNull()  // row past 15
    expect(codeToColRow('A0')).toBeNull()   // row 0 doesn't exist
    expect(codeToColRow('8A')).toBeNull()   // swapped order
    expect(codeToColRow('')).toBeNull()
    expect(codeToColRow(null)).toBeNull()
  })
  it('round-trips colRowToCode', () => {
    expect(colRowToCode({ col: 'H', row: 8 })).toBe('H8')
  })
})

describe('chebyshevDistance', () => {
  it('is 0 for the same square', () => {
    expect(chebyshevDistance({ col: 'H', row: 8 }, { col: 'H', row: 8 })).toBe(0)
  })
  it('is 1 for each of the 8 surrounding squares', () => {
    const center = { col: 'H', row: 8 }
    const neighbors = [
      { col: 'G', row: 7 }, { col: 'H', row: 7 }, { col: 'I', row: 7 },
      { col: 'G', row: 8 },                        { col: 'I', row: 8 },
      { col: 'G', row: 9 }, { col: 'H', row: 9 }, { col: 'I', row: 9 },
    ]
    for (const n of neighbors) {
      expect(chebyshevDistance(center, n)).toBe(1)
    }
  })
  it('is 2+ for squares further out (not adjacent)', () => {
    expect(chebyshevDistance({ col: 'H', row: 8 }, { col: 'J', row: 8 })).toBe(2)
    expect(chebyshevDistance({ col: 'H', row: 8 }, { col: 'H', row: 10 })).toBe(2)
  })
  it('a corner square still scores correctly with fewer real neighbors', () => {
    // A1 has only 3 real neighbors on the grid (B1, A2, B2), all distance 1 —
    // no special-casing needed, the math just naturally has fewer distance-1
    // squares to land on.
    expect(chebyshevDistance({ col: 'A', row: 1 }, { col: 'B', row: 1 })).toBe(1)
    expect(chebyshevDistance({ col: 'A', row: 1 }, { col: 'B', row: 2 })).toBe(1)
    expect(chebyshevDistance({ col: 'A', row: 1 }, { col: 'P', row: 15 })).toBeGreaterThan(1)
  })
})

describe('getHuesCuesGrid generation', () => {
  it('is deterministic across calls', () => {
    const a = getHuesCuesGrid()
    const b = getHuesCuesGrid()
    expect(a).toEqual(b)
  })
  it('every cell has a valid 6-digit hex color', () => {
    for (const cell of getHuesCuesGrid()) {
      expect(cell.hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
  it('no two horizontally adjacent cells are near-identical colors', () => {
    // Perceptual distinctness floor: adjacent hues at the same row must not
    // collapse to the same visible color. Uses a plain hex-string check
    // (cheap, no re-import of oklab math) — real color-math distinctness is
    // covered by the in-gamut round-trip in Task 1 Step 3 itself.
    const grid = getHuesCuesGrid()
    for (let r = 0; r < HUES_CUES_ROWS; r++) {
      const rowCells = grid.filter(c => c.row === r + 1)
      for (let c = 0; c < rowCells.length - 1; c++) {
        expect(rowCells[c].hex).not.toBe(rowCells[c + 1].hex)
      }
    }
  })
})

describe('getHuesCuesCell', () => {
  it('finds a real cell by code', () => {
    const cell = getHuesCuesCell('H8')
    expect(cell).not.toBeNull()
    expect(cell.col).toBe('H')
    expect(cell.row).toBe(8)
  })
  it('returns null for an invalid code', () => {
    expect(getHuesCuesCell('Z99')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/huesCuesGrid.test.js`
Expected: FAIL — `huesCuesGrid.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

```js
// client/src/lib/huesCuesGrid.js
import { oklabToRgb, rgbToOklab, rgbToHex } from './oklab.js'

export const HUES_CUES_COLS = 16 // A-P
export const HUES_CUES_ROWS = 15 // 1-15
export const HUES_CUES_CODE_RE = /^([A-P])(1[0-5]|[1-9])$/

const COL_LETTERS = Array.from({ length: HUES_CUES_COLS }, (_, i) => String.fromCharCode(65 + i)) // A..P

export function codeToColRow(code) {
  const m = HUES_CUES_CODE_RE.exec(code ?? '')
  if (!m) return null
  return { col: m[1], row: Number(m[2]) }
}

export function colRowToCode({ col, row }) {
  return `${col}${row}`
}

function colIndex(col) {
  return col.charCodeAt(0) - 65
}

export function chebyshevDistance(a, b) {
  return Math.max(Math.abs(colIndex(a.col) - colIndex(b.col)), Math.abs(a.row - b.row))
}

// Reduce chroma in fixed steps until the color round-trips through
// oklabToRgb's internal sRGB clamp within tolerance — i.e. it's actually
// in-gamut, not silently clipped to a nearby color. oklab.js exposes no
// pre-clamp gamut test, so this reconstructs one from its public functions
// rather than duplicating oklab.js's internal linearToSrgb math.
const CHROMA_START = 0.18
const CHROMA_STEP = 0.01
const ROUNDTRIP_TOLERANCE = 0.01

function inGamutHex(L, hueRadians) {
  let chroma = CHROMA_START
  while (chroma > 0) {
    const lab = [L, chroma * Math.cos(hueRadians), chroma * Math.sin(hueRadians)]
    const rgb = oklabToRgb(lab)
    const roundTrip = rgbToOklab(rgb)
    const dist = Math.hypot(lab[0] - roundTrip[0], lab[1] - roundTrip[1], lab[2] - roundTrip[2])
    if (dist <= ROUNDTRIP_TOLERANCE) return rgbToHex(rgb)
    chroma -= CHROMA_STEP
  }
  // Chroma 0 (pure gray) is always in-gamut. Never actually reached for a
  // full 0-360deg sweep, but keeps the loop provably terminating.
  return rgbToHex(oklabToRgb([L, 0, 0]))
}

let _cache = null

export function getHuesCuesGrid() {
  if (_cache) return _cache
  const grid = []
  for (let r = 0; r < HUES_CUES_ROWS; r++) {
    const row = r + 1
    // L range 0.35-0.9 so no row collapses to near-black or near-white.
    const L = 0.35 + (0.55 * r) / (HUES_CUES_ROWS - 1)
    for (let c = 0; c < HUES_CUES_COLS; c++) {
      const col = COL_LETTERS[c]
      const hueRadians = (c / HUES_CUES_COLS) * 2 * Math.PI
      grid.push({ code: colRowToCode({ col, row }), col, row, hex: inGamutHex(L, hueRadians) })
    }
  }
  _cache = grid
  return grid
}

export function getHuesCuesCell(code) {
  return getHuesCuesGrid().find(cell => cell.code === code) ?? null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/huesCuesGrid.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/baynes-trivia/trivia-os
git add client/src/lib/huesCuesGrid.js client/src/lib/huesCuesGrid.test.js
git commit -m "Add Hues and Cues grid generation (OKLCH sweep, 16x15)"
```

---

### Task 2: Scoring

**Files:**
- Create: `client/src/lib/huesCuesScoring.js`
- Test: `client/src/lib/huesCuesScoring.test.js`

**Interfaces:**
- Consumes: `chebyshevDistance`, `codeToColRow` from `./huesCuesGrid.js`
  (Task 1). `normalizeRoundScore` from `./scoreboardMath.js` (existing,
  confirmed signature: `normalizeRoundScore(raw) -> {written, phone,
  phoneBySlide}`).
- Produces: `scoreHuesCuesRound({entries, correctAnswer}) -> [{teamId,
  teamName, guess, distance, points}]` (entries: `[{teamId, teamName,
  guess: {col,row}}]`). `computeHuesCuesScoreUpdates({results, teams,
  scoreboardTeams, roundKey, slideId}) -> [scoreboard_teams row]`. Both
  signatures match the shape `LiveMode.jsx`'s `handleLockAndScoreHuesCues`
  (Task 6) calls directly.

- [ ] **Step 1: Write the failing tests**

```js
// client/src/lib/huesCuesScoring.test.js
import { describe, it, expect } from 'vitest'
import { scoreHuesCuesRound, computeHuesCuesScoreUpdates } from './huesCuesScoring.js'

describe('scoreHuesCuesRound', () => {
  const correctAnswer = 'H8'

  it('scores an exact match 20 points', () => {
    const results = scoreHuesCuesRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: { col: 'H', row: 8 } }],
      correctAnswer,
    })
    expect(results[0]).toMatchObject({ teamId: 't1', distance: 0, points: 20 })
  })

  it('scores each of the 8 adjacent squares 10 points', () => {
    const neighbors = [
      { col: 'G', row: 7 }, { col: 'H', row: 7 }, { col: 'I', row: 7 },
      { col: 'G', row: 8 },                        { col: 'I', row: 8 },
      { col: 'G', row: 9 }, { col: 'H', row: 9 }, { col: 'I', row: 9 },
    ]
    const entries = neighbors.map((guess, i) => ({ teamId: `t${i}`, teamName: `Team ${i}`, guess }))
    const results = scoreHuesCuesRound({ entries, correctAnswer })
    for (const r of results) {
      expect(r.distance).toBe(1)
      expect(r.points).toBe(10)
    }
  })

  it('scores distance 2+ as 0 points', () => {
    const results = scoreHuesCuesRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: { col: 'J', row: 8 } }],
      correctAnswer,
    })
    expect(results[0]).toMatchObject({ distance: 2, points: 0 })
  })

  it('a corner-square answer still scores its real neighbors at 10, no special case', () => {
    const results = scoreHuesCuesRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: { col: 'B', row: 2 } }],
      correctAnswer: 'A1',
    })
    expect(results[0]).toMatchObject({ distance: 1, points: 10 })
  })

  it('a team with no guess scores 0, not thrown out', () => {
    const results = scoreHuesCuesRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: null }],
      correctAnswer,
    })
    expect(results[0]).toMatchObject({ teamId: 't1', distance: null, points: 0 })
  })

  it('a malformed correctAnswer scores every entry 0 rather than throwing', () => {
    const results = scoreHuesCuesRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: { col: 'H', row: 8 } }],
      correctAnswer: 'not-a-code',
    })
    expect(results[0]).toMatchObject({ points: 0 })
  })
})

describe('computeHuesCuesScoreUpdates', () => {
  const teams = [{ id: 'team-1', name: 'Alpha ' }] // trailing space — case/whitespace insensitive match
  const scoreboardTeams = [
    { id: 'sb-1', show_id: 'show-1', name: 'alpha', scores: {}, sort_order: 0 },
  ]

  it('folds points into scoreboard_teams.scores[roundKey].phoneBySlide[slideId]', () => {
    const results = [{ teamId: 'team-1', teamName: 'Alpha', guess: 'H8', distance: 0, points: 20 }]
    const updates = computeHuesCuesScoreUpdates({
      results, teams, scoreboardTeams, roundKey: 'r_round1', slideId: 'slide-1',
    })
    expect(updates).toHaveLength(1)
    expect(updates[0].scores.r_round1.phone.phoneBySlide?.['slide-1']).toBeUndefined() // scores stores the raw shape, not normalized
    expect(updates[0].scores.r_round1.phone['slide-1']).toBe(20)
  })

  it('skips a result with no live team registration', () => {
    const results = [{ teamId: 'ghost-team', teamName: 'Ghost', guess: 'H8', distance: 0, points: 20 }]
    const updates = computeHuesCuesScoreUpdates({
      results, teams, scoreboardTeams, roundKey: 'r_round1', slideId: 'slide-1',
    })
    expect(updates).toHaveLength(0)
  })

  it('skips a result whose team has no scoreboard row yet', () => {
    const results = [{ teamId: 'team-1', teamName: 'Alpha', guess: 'H8', distance: 0, points: 20 }]
    const updates = computeHuesCuesScoreUpdates({
      results, teams, scoreboardTeams: [], roundKey: 'r_round1', slideId: 'slide-1',
    })
    expect(updates).toHaveLength(0)
  })

  it('re-scoring the same slideId overwrites just that entry, additive with other phone slides', () => {
    const scoreboardWithPriorSlide = [
      { id: 'sb-1', show_id: 'show-1', name: 'alpha', scores: { r_round1: { written: 5, phone: { 'other-slide': 10 } } }, sort_order: 0 },
    ]
    const results = [{ teamId: 'team-1', teamName: 'Alpha', guess: 'H8', distance: 0, points: 20 }]
    const updates = computeHuesCuesScoreUpdates({
      results, teams, scoreboardTeams: scoreboardWithPriorSlide, roundKey: 'r_round1', slideId: 'slide-1',
    })
    expect(updates[0].scores.r_round1.written).toBe(5)
    expect(updates[0].scores.r_round1.phone['other-slide']).toBe(10)
    expect(updates[0].scores.r_round1.phone['slide-1']).toBe(20)
  })

  it('dedupes by scoreboard team id when two rows normalize to the same name', () => {
    const dupScoreboard = [
      { id: 'sb-1', show_id: 'show-1', name: 'Alpha', scores: {}, sort_order: 0 },
      { id: 'sb-1', show_id: 'show-1', name: 'alpha', scores: {}, sort_order: 0 }, // same id, data-entry accident
    ]
    const results = [{ teamId: 'team-1', teamName: 'Alpha', guess: 'H8', distance: 0, points: 20 }]
    const updates = computeHuesCuesScoreUpdates({
      results, teams, scoreboardTeams: dupScoreboard, roundKey: 'r_round1', slideId: 'slide-1',
    })
    expect(updates).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/huesCuesScoring.test.js`
Expected: FAIL — `huesCuesScoring.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

```js
// client/src/lib/huesCuesScoring.js
import { chebyshevDistance, codeToColRow, colRowToCode } from './huesCuesGrid.js'
import { normalizeRoundScore } from './scoreboardMath.js'

// Absolute scoring, not room-relative like wager — every team is scored only
// against the true answer, never against each other. No ties to resolve.
export function scoreHuesCuesRound({ entries, correctAnswer }) {
  const correct = codeToColRow(correctAnswer)
  return (entries ?? []).map(e => {
    const guess = e.guess
    const validGuess = guess && typeof guess.col === 'string' && Number.isInteger(guess.row)
    if (!correct || !validGuess) {
      return { teamId: e.teamId, teamName: e.teamName ?? null, guess: null, distance: null, points: 0 }
    }
    const distance = chebyshevDistance(guess, correct)
    const points = distance === 0 ? 20 : distance === 1 ? 10 : 0
    return { teamId: e.teamId, teamName: e.teamName ?? null, guess: colRowToCode(guess), distance, points }
  })
}

// Same fold-in shape as computeWagerScoreUpdates/computeChoiceScoreUpdates:
// writes only this slide's entry into the round's phoneBySlide bucket,
// preserving every other phone-scored slide already in the round.
// Idempotent — re-running for the same slideId overwrites just that entry.
export function computeHuesCuesScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId }) {
  const teamIdToName = new Map((teams ?? []).map(t => [t.id, t.name.trim().toLowerCase()]))
  const updates = []
  for (const r of results ?? []) {
    const teamName = teamIdToName.get(r.teamId)
    if (!teamName) continue // no live registration — nothing to attribute this to
    const sbTeam = (scoreboardTeams ?? []).find(t => t.name.trim().toLowerCase() === teamName)
    if (!sbTeam) continue // host hasn't added this team to the admin scoreboard yet
    const prevSplit = normalizeRoundScore(sbTeam.scores?.[roundKey])
    const nextPhone = { ...prevSplit.phoneBySlide, [slideId]: r.points }
    const nextScores = { ...sbTeam.scores, [roundKey]: { written: prevSplit.written, phone: nextPhone } }
    updates.push({ id: sbTeam.id, show_id: sbTeam.show_id, name: sbTeam.name, scores: nextScores, sort_order: sbTeam.sort_order })
  }
  // Dedupe by scoreboard team id (last write wins) — guards against a
  // host data-entry accident (two rows normalizing to the same name)
  // making the upsert's ON CONFLICT fail and scoring nothing for the round.
  return [...new Map(updates.map(u => [u.id, u])).values()]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/huesCuesScoring.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/baynes-trivia/trivia-os
git add client/src/lib/huesCuesScoring.js client/src/lib/huesCuesScoring.test.js
git commit -m "Add Hues and Cues scoring (Chebyshev distance, 20/10/0 tiers)"
```

---

### Task 3: Register the shiny type

**Files:**
- Modify: `client/src/lib/shinySeries.js`
- Modify: `client/src/lib/slideStepping.js`
- Modify: `client/src/lib/shinyWizardKinds.jsx`
- Modify: `client/src/components/host/FormatLibrary.jsx`

**Interfaces:**
- Produces: `isHuesCuesShiny(data) -> boolean`, importable from
  `client/src/lib/shinySeries.js` exactly like `isWagerShiny`/`isChoiceShiny`
  — this is what Tasks 4-8 all import to detect the type.
- Consumes: nothing new — wires existing generic machinery
  (`PHONE_MECHANICS`, `FIXED_SHAPE_KINDS`) to the new predicate.

- [ ] **Step 1: Add the predicate**

In `client/src/lib/shinySeries.js`, alongside the existing predicates (near
`isChoiceShiny`, line ~109):

```js
export function isHuesCuesShiny(data) { return data.shinyInputSchema?.type === 'hues-cues' }
```

- [ ] **Step 2: Add the PHONE_MECHANICS entry**

In `client/src/lib/slideStepping.js`, import `isHuesCuesShiny` alongside the
other guards, then add to the `PHONE_MECHANICS` object (exact existing
shape — no `lockedAtField`/`resultsField` keys, those are local names passed
directly into `lockAndScore()` in Task 6, not table fields):

```js
export const PHONE_MECHANICS = {
  matching: { guard: isMatchingShiny, lockFields: ['matchingLocked'], revealField: 'matchingRevealed' },
  wager:    { guard: isWagerShiny,    lockFields: ['wagerTiersLocked', 'wagerGuessesLocked'], revealField: 'wagerRevealed' },
  order:    { guard: isOrderShiny,    lockFields: ['orderLocked'], revealField: 'orderRevealed' },
  choice:   { guard: isChoiceShiny,   lockFields: ['choiceLocked'], revealField: 'choiceRevealed' },
  huesCues: { guard: isHuesCuesShiny, lockFields: ['huesCuesLocked'], revealField: 'huesCuesRevealed' },
}
```

This single addition is consumed automatically (no other code changes in
this file) by `withEntryState`, `pendingLockPhase`, `REVEAL_FIELD`, and
`pendingReveal` — all four iterate `PHONE_MECHANICS` generically.

- [ ] **Step 3: Add the FIXED_SHAPE_KINDS entry**

In `client/src/lib/shinyWizardKinds.jsx`, add to `FIXED_SHAPE_KINDS` (note
the camelCase key, matching `matching`/`wager`/`order`/`choice`):

```js
export const FIXED_SHAPE_KINDS = {
  matching: { hasOwnControls: false },
  wager:    { hasOwnControls: false },
  order:    { hasOwnControls: false },
  choice:   { hasOwnControls: false },
  huesCues: { hasOwnControls: false },
  grid:     { hasOwnControls: true, extraControls: gridExtraControls, buildSlideData: buildGridSlide },
  venn:     { hasOwnControls: true, extraControls: vennExtraControls, buildSlideData: buildVennSlide },
  bendle:   { hasOwnControls: true, extraControls: bendleExtraControls, buildSlideData: buildBendleSlide },
}
```

`hasOwnControls: false` means AddSlideWizard falls through to its generic
flat single-asset creation path — no `buildSlideData` function needed, same
as wager/choice/order/matching.

- [ ] **Step 4: Register the format type for the host UI**

In `client/src/components/host/FormatLibrary.jsx`, find the hardcoded type
allowlist (line ~3) and add `'hues-cues'`:

```js
const INPUT_TYPES = ['image', 'audio', 'video', 'text', 'list', 'grid', 'matching', 'wager', 'venn', 'order', 'bendle', 'choice', 'hues-cues']
```

- [ ] **Step 5: Run the existing test suite to confirm nothing broke**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/slideStepping.test.js client/src/lib/shinyWizardKinds.test.js`
Expected: PASS — these are generic-over-the-table tests
(`slideStepping.test.js:670` per the design critique), a new entry must not
break them. If either file's tests enumerate `PHONE_MECHANICS`/
`FIXED_SHAPE_KINDS` keys and assert an exact count, update that count (this
is expected, not a regression) — but do not weaken any assertion about the
existing entries' shapes.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/baynes-trivia/trivia-os
git add client/src/lib/shinySeries.js client/src/lib/slideStepping.js client/src/lib/shinyWizardKinds.jsx client/src/components/host/FormatLibrary.jsx
git commit -m "Register hues-cues as a shiny question type"
```

---

### Task 4: Host authoring — grid-picker in SlideEditor

**Files:**
- Modify: `client/src/components/host/SlideEditor.jsx`

**Interfaces:**
- Consumes: `isHuesCuesShiny` (Task 3), `getHuesCuesGrid`, `HUES_CUES_COLS`,
  `HUES_CUES_ROWS` (Task 1). Existing `onChange(field, value)` prop pattern
  already used throughout this file (confirmed: `onChange('answer', v)` on
  the generic Answer TextInput).
- Produces: a picker that writes the same `data.answer` field wager/choice's
  neighbors already read — no new slide-data field.

- [ ] **Step 1: Hide the generic Answer field for this type**

Find the existing guard at ~line 1146-1163:

```jsx
{schema.type !== 'choice' && (
  <Field
    label={schema.type === 'wager' ? 'Answer — the true number' : 'Answer'}
    hint={schema.type === 'wager' ? 'Every guess is scored by how close it lands to this. Must be a number.' : undefined}
  >
    <TextInput
      value={data.answer ?? ''}
      onChange={v => onChange('answer', v)}
      ...
```

Change the condition to also exclude hues-cues (it gets its own grid-picker
control instead, added in Step 2 below, writing to the same `data.answer`
field):

```jsx
{schema.type !== 'choice' && schema.type !== 'hues-cues' && (
```

- [ ] **Step 2: Add the grid-picker component**

Add a new component in `SlideEditor.jsx` (near the other type-specific
editors), and render it conditionally where the Answer field was hidden:

```jsx
// A click-to-select picker over the full 240-square Hues and Cues grid.
// Writes the SAME data.answer field the generic Answer TextInput uses for
// every other type — never a separate field (see Global Constraints: a
// prior shiny type's duplicate answer field caused a real production bug).
function HuesCuesAnswerPicker({ data, onChange }) {
  const grid = getHuesCuesGrid()
  const selectedCode = data.answer ?? null

  return (
    <Field label="Correct square" hint="Click the target square. Teams are scored by how close their guess lands to this.">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${HUES_CUES_COLS}, 1fr)`,
          gap: 2,
          maxWidth: 480,
        }}
      >
        {grid.map(cell => (
          <button
            key={cell.code}
            type="button"
            onClick={() => onChange('answer', cell.code)}
            title={cell.code}
            style={{
              aspectRatio: '1 / 1',
              background: cell.hex,
              border: selectedCode === cell.code ? '3px solid white' : '1px solid rgba(0,0,0,0.15)',
              borderRadius: 2,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>
      {selectedCode && (
        <p style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>
          Selected: <strong>{selectedCode}</strong>
        </p>
      )}
    </Field>
  )
}
```

Render it where the generic field was hidden (immediately after the closing
of the `schema.type !== 'choice' && schema.type !== 'hues-cues'` block):

```jsx
{schema.type === 'hues-cues' && (
  <HuesCuesAnswerPicker data={data} onChange={onChange} />
)}
```

Add the import at the top of `SlideEditor.jsx`:

```js
import { getHuesCuesGrid, HUES_CUES_COLS } from '../../lib/huesCuesGrid.js'
```

- [ ] **Step 3: Manual verification**

Run: `cd ~/Projects/baynes-trivia/trivia-os && vercel dev`
1. Go to `/questions` → confirm `HostPinGate` PIN flow still works (unrelated
   regression check — this file is PIN-gated).
2. Create or open a show, add a shiny format via "✨ Add Shiny" with type
   `hues-cues` (Task 3 made this selectable in `FormatLibrary.jsx`).
3. Add a question slide using that format. In `SlideEditor`, confirm: the
   generic "Answer" text box is GONE, the 240-square grid-picker renders,
   clicking a square sets it as selected (white border) and shows its code.
4. Confirm clicking a different square updates the selection and the stored
   `data.answer` (verify via `SlideCanvasEditor`'s live preview reflecting no
   visible text, since the grid-picker is the only reveal-adjacent control
   right now — full reveal isn't wired until Task 7).

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/baynes-trivia/trivia-os
git add client/src/components/host/SlideEditor.jsx
git commit -m "Add Hues and Cues answer grid-picker to SlideEditor"
```

---

### Task 5: Phone board

**Files:**
- Create: `client/src/components/join/HuesCuesBoard.jsx`
- Modify: `client/src/views/Join.jsx`

**Interfaces:**
- Consumes: `getHuesCuesGrid`, `getHuesCuesCell`, `HUES_CUES_COLS`,
  `HUES_CUES_ROWS` (Task 1). `isHuesCuesShiny` (Task 3). `supabase` from
  `client/src/lib/supabase.js`. `ShrinkToFit` from
  `client/src/components/join/ShrinkToFit.jsx` (existing, wraps every other
  board). `EASE_PANEL` from `client/src/lib/easings.js`.
- Produces: `HuesCuesBoard({slide, team, theme, preview, onAnswered})` —
  same prop contract as `ChoiceBoard`/`WagerBoard`. Writes `phone_answers`
  rows with `answer: {col, row}` (structured, never a code string).

- [ ] **Step 1: Write the component**

```jsx
// client/src/components/join/HuesCuesBoard.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { getHuesCuesGrid, getHuesCuesCell, HUES_CUES_COLS, HUES_CUES_ROWS } from '../../lib/huesCuesGrid.js'
import { EASE_PANEL } from '../../lib/easings.js'
import ShrinkToFit from './ShrinkToFit.jsx'

const COL_LETTERS = Array.from({ length: HUES_CUES_COLS }, (_, i) => String.fromCharCode(65 + i))
const ROW_NUMBERS = Array.from({ length: HUES_CUES_ROWS }, (_, i) => i + 1)

// Two phases, mirroring the two-phase intent Ben asked for explicitly:
//   1. Browse — the full grid, free pan/zoom, no selection state at all.
//   2. Pick   — an "I'm Ready" sheet with two tap rows (letter, number),
//      never typed input (fat-finger risk on a phone keyboard ruled this
//      out — see the design spec). Locking in follows the same
//      committed-vs-local / explicit-commit / restore-on-mount contract
//      every other phone board (ChoiceBoard, WagerBoard) already uses.
export default function HuesCuesBoard({ slide, team, theme, preview = false, onAnswered }) {
  const { data } = slide
  const locked = !!data.huesCuesLocked
  const text = theme?.colors?.text ?? '#ffffff'
  const highlight = theme?.colors?.highlight ?? '#f5c842'
  const shouldReduceMotion = useReducedMotion()
  const grid = getHuesCuesGrid()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [col, setCol] = useState(null)
  const [row, setRow] = useState(null)
  const [committedCol, setCommittedCol] = useState(null)
  const [committedRow, setCommittedRow] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  // Pan/zoom state for the browse phase — plain CSS transform, no library.
  const [pan, setPan] = useState({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef(null)
  const pinchRef = useRef(null)

  const saveChainRef = useRef(Promise.resolve())

  const save = useCallback((nextCol, nextRow) => {
    if (preview) return Promise.resolve(true)
    const run = saveChainRef.current.then(async () => {
      const upsert = supabase.from('phone_answers').upsert(
        {
          show_id: slide.showId ?? team.showId,
          slide_id: slide.id,
          team_id: team.id,
          answer: { col: nextCol, row: nextRow },
        },
        { onConflict: 'slide_id,team_id' }
      )
      let error
      try {
        ;({ error } = await Promise.race([
          upsert,
          new Promise((_, reject) => setTimeout(() => reject(new Error('hues-cues save timed out')), 8000)),
        ]))
      } catch (err) {
        error = err
      }
      if (error) console.error('[HuesCuesBoard] guess save failed:', error)
      setSaveFailed(!!error)
      return !error
    })
    saveChainRef.current = run.catch(() => false)
    return run
  }, [preview, slide.id, slide.showId, team.id, team.showId])

  // Restore this team's own row so a phone reload mid-question keeps its pick.
  useEffect(() => {
    if (preview) return
    let cancelled = false
    supabase
      .from('phone_answers')
      .select('answer')
      .eq('slide_id', slide.id)
      .eq('team_id', team.id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (cancelled || !row?.answer) return
        if (row.answer.col) { setCol(row.answer.col); setCommittedCol(row.answer.col) }
        if (row.answer.row) { setRow(row.answer.row); setCommittedRow(row.answer.row) }
      })
    return () => { cancelled = true }
  }, [preview, slide.id, team.id])

  const dirty = col !== committedCol || row !== committedRow
  const hasPick = col != null && row != null

  async function handleLockIn() {
    if (!hasPick || !dirty || saving || locked) return
    setSaving(true)
    const ok = await save(col, row)
    setSaving(false)
    if (ok) {
      setCommittedCol(col)
      setCommittedRow(row)
    }
  }

  // onAnswered fires only off the CONFIRMED (committed) pick, never the
  // optimistic local tap — same rule every other board follows so a failed
  // save can't release a team from forceInteractive with nothing recorded.
  useEffect(() => {
    if (!onAnswered) return
    onAnswered(committedCol != null && committedRow != null)
  }, [onAnswered, committedCol, committedRow])

  const previewCell = hasPick ? getHuesCuesCell(`${col}${row}`) : null

  // --- Pan/zoom handlers (browse phase) ---
  function onPointerDown(e) {
    if (pickerOpen) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pan.x, originY: pan.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setPan(p => ({ ...p, x: dragRef.current.originX + dx, y: dragRef.current.originY + dy }))
  }
  function onPointerUp() {
    dragRef.current = null
  }
  function onWheel(e) {
    if (pickerOpen) return
    e.preventDefault()
    setPan(p => ({ ...p, scale: Math.max(0.5, Math.min(4, p.scale - e.deltaY * 0.001)) }))
  }

  return (
    <ShrinkToFit>
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', touchAction: 'none' }}>
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${HUES_CUES_COLS}, 1fr)`,
            gap: 1,
            width: '600px',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`,
            transformOrigin: 'center center',
            touchAction: 'none',
          }}
        >
          {grid.map(cell => (
            <div key={cell.code} style={{ aspectRatio: '1 / 1', background: cell.hex }} />
          ))}
        </div>

        {!locked && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              padding: '0.9rem 2rem', borderRadius: 999, border: 'none',
              background: highlight, color: '#000', fontWeight: 700, fontSize: '1.1rem',
              transition: 'transform 160ms ease-out',
            }}
          >
            I'm Ready
          </button>
        )}

        <AnimatePresence>
          {pickerOpen && (
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(100%)' }}
              animate={{ opacity: 1, transform: 'translateY(0%)' }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(100%)' }}
              transition={{ duration: 0.3, ease: EASE_PANEL }}
              style={{
                position: 'absolute', inset: 0, top: 'auto', bottom: 0,
                background: 'rgba(0,0,0,0.92)', borderRadius: '16px 16px 0 0',
                padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
              }}
            >
              <button type="button" onClick={() => setPickerOpen(false)} style={{ alignSelf: 'flex-end', color: text, background: 'none', border: 'none' }}>
                Back to grid
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 8,
                  background: previewCell?.hex ?? 'rgba(255,255,255,0.1)',
                  border: '2px solid rgba(255,255,255,0.3)',
                }} />
                <span style={{ color: text, fontSize: '1.3rem', fontWeight: 700 }}>
                  {hasPick ? `${col}${row}` : 'Pick a letter and number'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {COL_LETTERS.map(letter => (
                  <button
                    key={letter}
                    type="button"
                    disabled={locked}
                    onClick={() => setCol(letter)}
                    style={{
                      padding: '0.9rem 0', minHeight: 44, borderRadius: 8,
                      background: col === letter ? highlight : 'rgba(255,255,255,0.08)',
                      color: col === letter ? '#000' : text,
                      border: 'none', fontWeight: 700, fontSize: '1.1rem',
                      transition: 'transform 150ms ease-out',
                    }}
                  >
                    {letter}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {ROW_NUMBERS.map(n => (
                  <button
                    key={n}
                    type="button"
                    disabled={locked}
                    onClick={() => setRow(n)}
                    style={{
                      padding: '0.9rem 0', minHeight: 44, borderRadius: 8,
                      background: row === n ? highlight : 'rgba(255,255,255,0.08)',
                      color: row === n ? '#000' : text,
                      border: 'none', fontWeight: 700, fontSize: '1.1rem',
                      transition: 'transform 150ms ease-out',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={!hasPick || !dirty || saving || locked}
                onClick={handleLockIn}
                style={{
                  marginTop: 'auto', padding: '1rem', borderRadius: 12, border: 'none',
                  background: (!hasPick || !dirty || saving || locked) ? 'rgba(255,255,255,0.15)' : highlight,
                  color: (!hasPick || !dirty || saving || locked) ? text : '#000',
                  fontWeight: 700, fontSize: '1.15rem',
                }}
              >
                {saving ? 'Locking In…' : committedCol && !dirty ? '🔒 Locked In' : 'Lock In Guess'}
              </button>

              {saveFailed && (
                <p style={{ color: '#e8703a', fontSize: '0.9rem', textAlign: 'center' }}>
                  Guess didn't save — check your connection and try again.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ShrinkToFit>
  )
}
```

- [ ] **Step 2: Mount it from Join.jsx**

Add `isHuesCuesShiny` to the existing shinySeries import (line 8):

```js
import { resolveShinyPart, isMatchingShiny, isWagerShiny, isOrderShiny, isConcurrentMediaShiny, isChoiceShiny, isHuesCuesShiny } from '../lib/shinySeries.js'
```

Add the import for the new board near the other board imports:

```js
import HuesCuesBoard from '../components/join/HuesCuesBoard.jsx'
```

Add the dispatch alongside the existing ones (~line 620-636, inside
`case 'question':`):

```jsx
if (d.isShiny && isHuesCuesShiny(d)) {
  return <HuesCuesBoard slide={slide} team={team} theme={theme} onAnswered={onInteractiveAnswered} />
}
```

No changes needed to `liveSlideIsInteractive`/`interactivePhaseKey` — both
are already generic over `PHONE_MECHANICS` (Task 3 made `huesCues` a member).

- [ ] **Step 3: Manual verification**

Run: `cd ~/Projects/baynes-trivia/trivia-os && vercel dev`
1. With a hues-cues slide live (from Task 4), open `/join?show=<id>` on a
   phone-width viewport.
2. Confirm the grid renders, drag pans it, scroll/pinch zooms it (within the
   0.5x-4x clamp), no crash.
3. Tap "I'm Ready" — sheet slides up from the bottom (not center), letter
   grid and number grid render as real 4-wide/3-wide grids (not one long
   row), tapping either updates the swatch preview immediately.
4. Change the letter after picking the number (or vice versa) — confirm no
   stuck/broken state, swatch updates correctly either way.
5. Tap "Lock In Guess" — button shows "Locking In…" then "🔒 Locked In".
   Reload the page — confirm the pick is restored (not reset to blank).
6. Kill network (devtools offline) mid-guess, tap Lock In — confirm the
   save-failed message appears within ~8s, doesn't hang forever.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/baynes-trivia/trivia-os
git add client/src/components/join/HuesCuesBoard.jsx client/src/views/Join.jsx
git commit -m "Add Hues and Cues phone board (pan/zoom browse + tap-pick)"
```

---

### Task 6: TV display

**Files:**
- Create: `client/src/components/display/slides/ShinyHuesCuesQuestion.jsx`
- Modify: `client/src/components/display/slides/QuestionSlide.jsx`

**Interfaces:**
- Consumes: `getHuesCuesGrid`, `getHuesCuesCell`, `HUES_CUES_COLS` (Task 1).
  `isHuesCuesShiny` (Task 3). `supabase.rpc('phone_answers_count', {
  p_slide_id })` (existing RPC, confirmed call site in
  `ShinyChoiceQuestion.jsx`). `SHINY_GOLD`, `SHINY_GOLD_GLOW` from
  `client/src/lib/shinyGold.js`. `EASE_OUT`, `EASE_DROP` from
  `client/src/lib/easings.js`. `useFitToBox`, `WAGER_Q_FLOOR`, `WAGER_Q_CEIL`
  from `client/src/lib/autoFitText.js` (reused verbatim for the clue-word
  text sizing, same as `ShinyChoiceQuestion.jsx` does). `AnswersLockedBadge`
  from `client/src/components/display/LockCountdownOverlay.jsx`.
  `data.huesCuesResults` — the persisted results snapshot Task 7's
  `handleLockAndScoreHuesCues` writes (shape: `[{teamId, teamName, guess,
  distance, points}]`, matches `scoreHuesCuesRound`'s output exactly).
- Produces: `ShinyHuesCuesQuestion({slide, show, theme})`, mirroring
  `ShinyWagerQuestion`'s three-beat structure (waiting → locked → reveal) but
  without wager's separate wagering phase (hues-cues has no blind-tier step).

- [ ] **Step 1: Write the component**

```jsx
// client/src/components/display/slides/ShinyHuesCuesQuestion.jsx
import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { getHuesCuesGrid, getHuesCuesCell, HUES_CUES_COLS } from '../../../lib/huesCuesGrid.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { EASE_OUT, EASE_DROP } from '../../../lib/easings.js'
import { useFitToBox, WAGER_Q_FLOOR, WAGER_Q_CEIL } from '../../../lib/autoFitText.js'
import { AnswersLockedBadge } from '../LockCountdownOverlay.jsx'

// Three beats, one component, mirroring ShinyWagerQuestion's structure minus
// its separate blind-wagering phase (hues-cues has only one guess, no tiers):
//   1. Waiting  — clue + full grid up, teams guessing on their phones.
//   2. Locked   — held after "lock guesses" until the host presses A to reveal.
//   3. Reveal   — the answer code, then its color swatch, then who was close.
export default function ShinyHuesCuesQuestion({ slide, show, theme }) {
  const { data } = slide
  const locked = !!data.huesCuesLocked
  const revealed = !!data.huesCuesRevealed
  const shouldReduceMotion = useReducedMotion()
  const grid = getHuesCuesGrid()

  const [submittedCount, setSubmittedCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)

  useEffect(() => {
    if (locked || revealed) return
    let cancelled = false
    async function load() {
      const { data: count } = await supabase.rpc('phone_answers_count', { p_slide_id: slide.id })
      if (!cancelled) setSubmittedCount(count ?? 0)
    }
    load()
    const interval = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [slide.id, locked, revealed])

  useEffect(() => {
    let cancelled = false
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('show_id', show.id)
      .then(({ count }) => { if (!cancelled) setTeamCount(count ?? 0) })
    return () => { cancelled = true }
  }, [show.id])

  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const { ref: clueRef, fontSize: clueFontSize } = useFitToBox({
    text: data.text ?? '',
    family: displayFont,
    floorPx: WAGER_Q_FLOOR,
    ceilPx: WAGER_Q_CEIL,
  })

  if (revealed) {
    return <HuesCuesReveal data={data} theme={theme} shouldReduceMotion={shouldReduceMotion} />
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '2rem 3rem', gap: '1.5rem',
    }}>
      <p ref={clueRef} style={{ margin: 0, fontFamily: displayFont, fontSize: clueFontSize, color: theme.colors.text, textAlign: 'center' }}>
        {data.text}
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${HUES_CUES_COLS}, 1fr)`, gap: 2,
        width: '100%', maxWidth: 900,
      }}>
        {grid.map(cell => (
          <div key={cell.code} style={{ aspectRatio: '1 / 1', background: cell.hex, borderRadius: 2 }} />
        ))}
      </div>

      {locked ? (
        <AnswersLockedBadge />
      ) : (
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE_OUT }}
          style={{ margin: 0, color: `${theme.colors.text}70`, fontSize: '1.35rem', fontFamily: bodyFont }}
        >
          {teamCount > 0 ? `${submittedCount} of ${teamCount} teams guessed` : `${submittedCount} team${submittedCount === 1 ? '' : 's'} guessed`}
        </motion.p>
      )}
    </div>
  )
}

// The payoff: the code lands first, the color swatch beneath it (per Ben's
// explicit call — flash the code, then the color, not dots-only), then each
// team's guess and how close it landed, cascading in the order the host
// would read them out loud. Structurally the same beat sequence as
// ShinyWagerQuestion's reveal (EASE_DROP land, staggered EASE_OUT rows).
function HuesCuesReveal({ data, theme, shouldReduceMotion }) {
  const results = data.huesCuesResults ?? []
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const twoCol = results.length > 8
  const answerCell = getHuesCuesCell(data.answer)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '3rem 4rem', gap: '1.75rem',
    }}>
      {data.text && (
        <p style={{ margin: 0, textAlign: 'center', maxWidth: 1200, fontFamily: bodyFont, fontSize: '1.4rem', lineHeight: 1.35, color: `${text}80` }}>
          {data.text}
        </p>
      )}

      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.94)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        transition={{ duration: 0.32, ease: EASE_DROP }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
      >
        <span style={{ fontFamily: bodyFont, fontSize: '1.15rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: `${text}60` }}>
          The answer
        </span>
        <span style={{ fontFamily: displayFont, fontSize: '6rem', lineHeight: 1, color: SHINY_GOLD, textShadow: `0 0 30px ${SHINY_GOLD_GLOW}77` }}>
          {data.answer ?? '—'}
        </span>
        <div style={{
          width: 80, height: 80, borderRadius: 12,
          background: answerCell?.hex ?? 'transparent',
          border: `2px solid ${SHINY_GOLD}66`,
        }} />
      </motion.div>

      {results.length === 0 ? (
        <p style={{ margin: 0, color: `${text}60`, fontFamily: bodyFont, fontSize: '1.3rem' }}>
          No answers were submitted.
        </p>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: twoCol ? '1fr 1fr' : '1fr', gap: '0.5rem 2.5rem',
          width: '100%', maxWidth: twoCol ? 1600 : 1000,
        }}>
          {results.map((r, i) => {
            const cell = r.guess ? getHuesCuesCell(r.guess) : null
            return (
              <motion.div
                key={`${r.teamName}-${i}`}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                transition={{ duration: 0.26, delay: 0.4 + i * 0.06, ease: EASE_OUT }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.65rem 1.1rem', borderRadius: 12,
                  background: r.points > 0 ? `${SHINY_GOLD}1f` : 'rgba(255,255,255,0.04)',
                  border: r.points > 0 ? `1px solid ${SHINY_GOLD}66` : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: cell?.hex ?? 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: displayFont, fontSize: '1.9rem', color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.teamName}
                </span>
                <span style={{ fontFamily: bodyFont, fontSize: '1.25rem', color: `${text}75`, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {r.guess ?? '—'}
                </span>
                <span style={{ minWidth: '4.5rem', textAlign: 'right', flexShrink: 0, fontFamily: displayFont, fontSize: '2rem', color: r.points > 0 ? SHINY_GOLD : `${text}40` }}>
                  {r.points > 0 ? `+${r.points}` : '0'}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Mount it from QuestionSlide.jsx**

Add `isHuesCuesShiny` to the existing shinySeries import (line 10):

```js
import { resolveShinyPart, isVisualShiny, isAudioShiny, isListShiny, isVideoShiny, isMatchingShiny, isWagerShiny, isOrderShiny, isBendleShiny, isChoiceShiny, isHuesCuesShiny, isConcurrentShiny, isConcurrentMediaShiny, partsToGridView } from '../../../lib/shinySeries.js'
```

Add the component import:

```js
import ShinyHuesCuesQuestion from './ShinyHuesCuesQuestion.jsx'
```

Add the dispatch branch (~line 1480-1493), alongside the existing ones:

```jsx
if (isHuesCuesShiny(data)) {
  return <ShinyHuesCuesQuestion slide={slide} show={show} theme={theme} />
}
```

- [ ] **Step 3: Manual verification**

Run: `cd ~/Projects/baynes-trivia/trivia-os && vercel dev`
1. With the hues-cues slide live on `/display` and un-revealed: confirm the
   clue text and full grid render, submitted-count text updates as a phone
   (from Task 5) locks in a guess (poll interval ~2s).
2. Confirm `AnswersLockedBadge` behavior after host locks (Task 7 must be
   done for the lock button to exist — if testing before Task 7, this step
   can only be verified after both are complete; note it now, re-check
   after Task 7).
3. On reveal: confirm the answer code flashes, then its swatch beneath,
   then each team's row cascades in with their guessed code + a small
   swatch + points earned, gold-highlighted rows for any points > 0.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/baynes-trivia/trivia-os
git add client/src/components/display/slides/ShinyHuesCuesQuestion.jsx client/src/components/display/slides/QuestionSlide.jsx
git commit -m "Add Hues and Cues TV display (waiting state + reveal)"
```

---

### Task 7: Host control wiring (lock, score, reveal)

**Files:**
- Modify: `client/src/components/host/LiveMode.jsx`

**Interfaces:**
- Consumes: `scoreHuesCuesRound`, `computeHuesCuesScoreUpdates` (Task 2).
  `HUES_CUES_CODE_RE` (Task 1). `isHuesCuesShiny` (Task 3, already imported
  generically via `PHONE_MECHANICS`). The existing `lockAndScore()` helper
  (already present in this file, generic — confirmed signature: `{slide,
  lockField, lockedAtField, resultsField, preCheck, buildResults, setBusy,
  setError, lateLogLabel, ...}`).
- Produces: `handleLockAndScoreHuesCues(slide)`, wired into
  `lockHandlersRef` under the key `huesCues` (must match what
  `pendingLockPhase` returns — the `PHONE_MECHANICS` table key from Task 3)
  and into the panel config map so a "Lock Answers & Score" control appears
  in the live control surface for this slide type.

- [ ] **Step 1: Add the scoring import**

Near the existing scoring imports (line ~12):

```js
import { scoreHuesCuesRound, computeHuesCuesScoreUpdates } from '../../lib/huesCuesScoring.js'
import { HUES_CUES_CODE_RE } from '../../lib/huesCuesGrid.js'
```

- [ ] **Step 2: Add busy/error state**

Near the existing `choiceBusy`/`choiceScoreError` pair (line ~231-232):

```js
const [huesCuesBusy, setHuesCuesBusy] = useState(false)
const [huesCuesScoreError, setHuesCuesScoreError] = useState(null)
```

Add to the combined busy flag (line ~243):

```js
const scoringBusy = matchingBusy || orderBusy || wagerBusy || choiceBusy || huesCuesBusy
```

Add to the clear-on-slide-change effect (line ~261-266):

```js
useEffect(() => {
  setWagerError(null)
  setMatchingScoreError(null)
  setOrderScoreError(null)
  setChoiceScoreError(null)
  setHuesCuesScoreError(null)
}, [currentSlide?.id])
```

- [ ] **Step 3: Add the lock-and-score handler**

Near `handleLockAndScoreChoice` (line ~532-554):

```js
async function handleLockAndScoreHuesCues(slide) {
  await lockAndScore({
    slide,
    lockField: 'huesCuesLocked',
    lockedAtField: 'huesCuesLockedAt',
    resultsField: 'huesCuesResults',
    preCheck: s => HUES_CUES_CODE_RE.test(s.data.answer ?? '') ? null : 'Set a correct square before locking — pick one on the grid',
    lateLogLabel: 'hues-cues lock',
    buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId }) => {
      const teamIdToName = new Map((teams ?? []).map(t => [t.id, t.name]))
      const entries = (answers ?? []).map(a => ({
        teamId: a.team_id,
        teamName: teamIdToName.get(a.team_id) ?? null,
        guess: a.answer,
      }))
      const results = scoreHuesCuesRound({ entries, correctAnswer: slide.data.answer })
      const updates = computeHuesCuesScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
      return {
        results,
        updates,
        unmatchedError: answers.length > 0 && updates.length === 0
          ? 'No answers could be matched to the scoreboard — check team names match, then retry'
          : null,
      }
    },
    setBusy: setHuesCuesBusy,
    setError: setHuesCuesScoreError,
  })
}
```

- [ ] **Step 4: Register the lock handler**

In `lockHandlersRef` (line ~914-921):

```js
lockHandlersRef.current = {
  matching: handleLockAndScoreMatching,
  'wager-tiers': handleLockWagers,
  'wager-guesses': handleLockAndScoreWagers,
  order: handleLockAndScoreOrder,
  choice: handleLockAndScoreChoice,
  huesCues: handleLockAndScoreHuesCues,
}
```

- [ ] **Step 5: Add the panel config entry**

In the panel config map (the IIFE at line ~1240, keyed by `phoneMechanic` at
line ~1292), add alongside the `choice` entry:

```js
huesCues: {
  busy: huesCuesBusy, error: huesCuesScoreError, zeroErr: null,
  status: d.huesCuesLocked
    ? 'Guesses locked and scored — press A to reveal the correct square on the TV.'
    : 'Hues and Cues — teams are guessing on their phones',
  label: huesCuesBusy ? 'Scoring…' : d.huesCuesLocked ? '🔁 Retry Scoring' : '🔒 Lock Guesses & Score',
  act: () => handleLockAndScoreHuesCues(currentSlide),
},
```

No changes needed to `revealCurrentSlide()` or the Stream Deck `A` binding —
both are already generic over `PHONE_MECHANICS`/`REVEAL_FIELD`.

- [ ] **Step 6: Manual verification**

Run: `cd ~/Projects/baynes-trivia/trivia-os && vercel dev`
1. With a hues-cues question live in `LiveMode`, confirm the panel shows
   "Hues and Cues — teams are guessing on their phones" and a "🔒 Lock
   Guesses & Score" button.
2. With NO answer square picked (skip Task 4's picker), click Lock — confirm
   the preCheck error ("Set a correct square before locking...") shows and
   nothing locks.
3. Pick an answer square (Task 4), have 1-2 phones (Task 5) submit guesses,
   click Lock — confirm it locks, scores, and the button becomes "🔁 Retry
   Scoring".
4. Press Stream Deck `A` (or the equivalent UI reveal control) — confirm the
   TV (Task 6) shows the reveal sequence, not the generic full-screen
   answer overlay (verify after Task 8 too — this task alone doesn't fix
   that overlay).
5. Confirm scoreboard (`ScoreboardModal`) reflects the new points in the
   right round's `phoneBySlide` bucket.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/baynes-trivia/trivia-os
git add client/src/components/host/LiveMode.jsx
git commit -m "Wire Hues and Cues lock/score/reveal into LiveMode"
```

---

### Task 8: Suppress the generic answer-reveal overlay

**Files:**
- Modify: `client/src/views/Display.jsx`

**Interfaces:**
- Consumes: `isHuesCuesShiny` (Task 3).

- [ ] **Step 1: Add the suppression**

Find `AnswerRevealOverlay` (line ~509-527):

```jsx
import { resolveShinyPart, isWagerShiny } from '../lib/shinySeries.js'
// ...
function AnswerRevealOverlay({ show, currentSlide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const visible = show.answer_reveal ?? show.showState?.answerReveal ?? false
  const answer = currentSlide ? resolveShinyPart(currentSlide.data).answer : null
  const suppressed = currentSlide ? isWagerShiny(currentSlide.data) : false
```

Change to:

```jsx
import { resolveShinyPart, isWagerShiny, isHuesCuesShiny } from '../lib/shinySeries.js'
// ...
function AnswerRevealOverlay({ show, currentSlide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const visible = show.answer_reveal ?? show.showState?.answerReveal ?? false
  const answer = currentSlide ? resolveShinyPart(currentSlide.data).answer : null
  const suppressed = currentSlide ? (isWagerShiny(currentSlide.data) || isHuesCuesShiny(currentSlide.data)) : false
```

- [ ] **Step 2: Manual verification**

Run: `cd ~/Projects/baynes-trivia/trivia-os && vercel dev`
1. On `/display` with a hues-cues slide live, BEFORE locking guesses, trigger
   the generic Stream Deck `A` reveal (or whatever UI path toggles
   `show.showState.answerReveal` directly, bypassing `revealCurrentSlide()`)
   — confirm nothing flashes full-screen over the grid. This is the exact
   bug scenario: hitting reveal before `huesCuesLocked`/`huesCuesRevealed`
   are set, which previously had no suppression check.
2. After Task 7's real lock+reveal flow, confirm the TV shows Task 6's
   proper reveal sequence, not this generic overlay, at any point — right
   after the question or later while going back over round answers.
3. Regression-check: confirm a WAGER slide's answer-reveal suppression still
   works exactly as before (no change to wager's behavior).

- [ ] **Step 3: Run full test suite**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npm run test:unit`
Expected: PASS — full suite green, including every new hues-cues test file
from Tasks 1-2 and the untouched wager/choice/matching/order suites.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/baynes-trivia/trivia-os
git add client/src/views/Display.jsx
git commit -m "Suppress generic answer-reveal overlay for Hues and Cues"
```

---

## Self-Review Notes

**Spec coverage:** Grid generation (Task 1), answer storage reuse (Task 4
Step 1), host authoring (Task 4), phone tap-to-pick flow (Task 5), display
waiting/reveal (Task 6), host control wiring (Task 7), scoring (Task 2),
tests (Tasks 1-2 + Task 8 full-suite run), overlay suppression (Task 8) — all
spec sections map to a task.

**Placeholder scan:** No TBD/TODO. Every step has real code, not a
description of code.

**Type consistency:** `scoreHuesCuesRound`'s output shape (`{teamId,
teamName, guess, distance, points}`) is used identically in Task 2's test,
Task 6's `HuesCuesReveal` (`r.teamName`, `r.guess`, `r.points`), and Task 7's
`buildResults` (passes straight through as `resultsField`). `{col, row}` is
the guess shape end-to-end: `HuesCuesBoard` writes it (Task 5), raw
`phone_answers.answer` carries it, `handleLockAndScoreHuesCues` reads
`a.answer` as `{col,row}` and passes to `scoreHuesCuesRound` unchanged (Task
7) — never re-parsed from a code string at any point, matching the spec's
explicit requirement. `data.answer` (a code string like `"H8"`) is the one
place a string form exists, written only by Task 4's picker, read by Task 6
(`getHuesCuesCell(data.answer)`) and Task 7's `preCheck`/`correctAnswer` —
consistent throughout.
