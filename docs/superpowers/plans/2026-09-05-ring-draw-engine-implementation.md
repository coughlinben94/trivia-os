# Ring Draw Engine (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `client/src/lib/ringDraw.js`, a pure, seeded, testable function that turns a pool of ring
nouns into a valid 13-station arrangement — the "Phase 2" engine named in
`docs/superpowers/plans/2026-09-02-ring-station-variety.md` §2.4 and
`docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md` §9 step 2. This plan builds
the engine only. It does not wire it into `RingAmbient.jsx`, does not touch the palette side, does not
change anything rendered on `/display` today. Nothing in this plan is scoped to require Ben's aesthetic
sign-off — it is pure logic with a test oracle, no rendering, no TV check.

**Architecture:** One new pure module (`ringDraw.js`, no DOM, sibling of `ringEngine.js`) exporting
`LANE_CAP`, `assertRing`, and `drawStations`. A new pool data file (`ringPool.js`) captures today's 13
authored stations verbatim, with `family` already available from the shipped `midnightGalaxy.slots.js`.
`drawStations` is deterministic (seeded via `ringEngine.js`'s existing `hash32`/`rng`, never
`Math.random`) and either (a) returns today's exact 13-station order unchanged when `seed === 'authored'`,
or (b) runs a real backtracking placement over the chosen set, enforcing the family/prim/accent invariants
by construction, then validates the result with `assertRing` before returning it.

**Tech Stack:** Vanilla JS (no framework), Vitest (existing `*.test.js` convention in this repo).

**Spec:** `docs/superpowers/plans/2026-09-02-ring-station-variety.md` §2.3–2.5 (invariant table, the
`drawStations` sketch, what the draw cannot make invariant) and
`docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md` §3.1–3.2 (lane/family rules
applied) and §9 (build order — this plan is step 2, explicitly listed as runnable before step 1's eclipse
art work).

## Global Constraints

- No `Math.random` anywhere — every random choice goes through `ringEngine.js`'s `rng(i, seed)` /
  `hash32(x, seed)`. This is a gate-checked house rule (`references/ring-world-mistakes.md`).
- Family spacing ≥3 apart, cyclic (station 12's neighbour is station 0). Prim name used by ≤3 stations,
  never by two adjacent stations. Accent stations ≤3 total. All from
  `2026-09-02-ring-station-variety.md`'s invariant table (§2.3), enforced by `assertRing`.
- `seed === 'authored'` must return today's live 13 stations in today's exact order, byte-for-byte —
  the falsifier that keeps this change inert until something else calls it with a real seed.
- Pure functions only in this plan. No file under `client/src/components`, `client/src/views`, or
  `concepts/` is touched.

---

## File Structure

- **Create:** `client/src/worlds/ringPool.js` — today's 13 stations as a plain pool array
  (`{key, prim, hue, accent, family}` each), copied verbatim from `midnightGalaxy.ring.js` (key/prim/hue/
  accent) and `midnightGalaxy.slots.js` (family). This is data, not the authored world file itself —
  `midnightGalaxy.ring.js` is untouched by this plan.
- **Create:** `client/src/worlds/ringPool.test.js` — confirms the pool matches the live authored data
  (guards against the two files drifting apart later).
- **Create:** `client/src/lib/ringDraw.js` — `LANE_CAP`, `assertRing`, `drawStations`.
- **Create:** `client/src/lib/ringDraw.test.js` — the full invariant + falsifier test suite.

---

### Task 1: `ringPool.js` — today's stations as a pool

**Files:**
- Create: `client/src/worlds/ringPool.js`
- Test: `client/src/worlds/ringPool.test.js`

**Interfaces:**
- Produces: `RING_POOL` — `Array<{key: string, prim: string, hue: number, accent: boolean, family: string}>`,
  length 13, in today's station order (index 0 = station 0 = "ringed planet", ... index 12 = "supernova").
  `ringDraw.js` (Task 2) consumes this shape; `drawStations(pool, opts)`'s `pool` parameter is exactly
  `RING_POOL` in the tests below.

- [ ] **Step 1: Write the failing test**

```js
// client/src/worlds/ringPool.test.js
import { describe, it, expect } from 'vitest'
import { RING_POOL } from './ringPool.js'
import {
  RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
  PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, RECORD_HUE,
  AURORA_RIBBON_HUE, SUPERNOVA_HUE,
} from './midnightGalaxy.ring.js'

describe('RING_POOL', () => {
  it('has exactly 13 entries in todays authored order', () => {
    expect(RING_POOL).toHaveLength(13)
    expect(RING_POOL.map(s => s.key)).toEqual([
      'ringed planet', 'spiral galaxy', 'star cluster', 'amber planet', 'lit planet',
      'pulsar', 'rose nebula', 'comet', 'binary pair', 'asteroid field', 'record',
      'aurora ribbon', 'supernova',
    ])
  })

  it('every hue matches the live authored constant, not a copied literal', () => {
    const hues = [
      RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
      PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, RECORD_HUE,
      AURORA_RIBBON_HUE, SUPERNOVA_HUE,
    ]
    expect(RING_POOL.map(s => s.hue)).toEqual(hues)
  })

  it('accent is true only on amber planet, rose nebula, supernova — the warm-complementary cap', () => {
    expect(RING_POOL.filter(s => s.accent).map(s => s.key)).toEqual(
      ['amber planet', 'rose nebula', 'supernova']
    )
  })

  it('family matches the shipped slot table', () => {
    expect(RING_POOL.map(s => s.family)).toEqual([
      'radial-mass', 'lens', 'cluster', 'radial-mass', 'radial-mass', 'burst', 'cloud',
      'streak', 'radial-mass', 'cluster', 'radial-mass', 'streak', 'burst',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- ringPool.test.js`
Expected: FAIL — `Cannot find module './ringPool.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// client/src/worlds/ringPool.js
//
// Today's 13 ring stations, reshaped as a draw pool for ringDraw.js
// (docs/superpowers/plans/2026-09-02-ring-station-variety.md §2.4). This is
// a read of midnightGalaxy.ring.js + midnightGalaxy.slots.js, not a second
// source of truth — if either of those files changes, ringPool.test.js's
// hue-constant check catches drift immediately.
//
// `record` stays in the pool as shipped. The 2026-09-05 decision to retire
// it for an `eclipse` noun (docs/superpowers/plans/
// 2026-09-05-ring-unified-noun-color-draw-design.md §11a item 4, still
// provisional pending Ben's TV sign-off) is separate art-project work — see
// that doc's §9 build-order step 1. This plan does not depend on it and
// does not pre-empt it.
import {
  RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
  PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, RECORD_HUE,
  AURORA_RIBBON_HUE, SUPERNOVA_HUE,
} from './midnightGalaxy.ring.js'

export const RING_POOL = [
  { key: 'ringed planet',  prim: 'ring',          hue: RINGED_PLANET_HUE,  accent: false, family: 'radial-mass' },
  { key: 'spiral galaxy',  prim: 'lens',           hue: SPIRAL_GALAXY_HUE,  accent: false, family: 'lens' },
  { key: 'star cluster',   prim: 'dots',           hue: STAR_CLUSTER_HUE,   accent: false, family: 'cluster' },
  { key: 'amber planet',   prim: 'ring',           hue: AMBER_PLANET_HUE,   accent: true,  family: 'radial-mass' },
  { key: 'lit planet',     prim: 'planet',         hue: LIT_PLANET_HUE,     accent: false, family: 'radial-mass' },
  { key: 'pulsar',         prim: 'pulsar',         hue: PULSAR_HUE,         accent: false, family: 'burst' },
  { key: 'rose nebula',    prim: 'nebulaCloud',    hue: ROSE_NEBULA_HUE,    accent: true,  family: 'cloud' },
  { key: 'comet',          prim: 'streak',         hue: COMET_HUE,          accent: false, family: 'streak' },
  { key: 'binary pair',    prim: 'binary',         hue: BINARY_PAIR_HUE,    accent: false, family: 'radial-mass' },
  { key: 'asteroid field', prim: 'asteroidField',  hue: ASTEROID_FIELD_HUE, accent: false, family: 'cluster' },
  { key: 'record',         prim: 'record',         hue: RECORD_HUE,         accent: false, family: 'radial-mass' },
  { key: 'aurora ribbon',  prim: 'ribbon',         hue: AURORA_RIBBON_HUE,  accent: false, family: 'streak' },
  { key: 'supernova',      prim: 'spikes',         hue: SUPERNOVA_HUE,      accent: true,  family: 'burst' },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- ringPool.test.js`
Expected: PASS, all 4 assertions.

- [ ] **Step 5: Commit**

```bash
git add client/src/worlds/ringPool.js client/src/worlds/ringPool.test.js
git commit -m "feat: add ringPool.js, today's 13 stations reshaped as a draw pool"
```

---

### Task 2: `assertRing` — the invariant checker

**Files:**
- Create: `client/src/lib/ringDraw.js`
- Test: `client/src/lib/ringDraw.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 yet (this task tests `assertRing` directly against hand-built fixture
  arrays, not `RING_POOL` — `RING_POOL` fails these invariants as-is, see Task 3).
- Produces: `assertRing(order, opts?)` — `order: Array<{key, prim, family, accent}>` (length = `slots`,
  default 13), `opts: {slots?: number, maxAccents?: number, maxPerPrim?: number}`. Returns `true` or
  throws `Error` with a message naming which rule failed and at which indices. `LANE_CAP(slots)` — pure
  function, `Math.floor(slots / 3)`.

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/ringDraw.test.js
import { describe, it, expect } from 'vitest'
import { LANE_CAP, assertRing } from './ringDraw.js'

const s = (key, family, prim = key, accent = false) => ({ key, family, prim, accent })

describe('LANE_CAP', () => {
  it('is floor(slots/3) — 4 at 13 slots', () => {
    expect(LANE_CAP(13)).toBe(4)
    expect(LANE_CAP(12)).toBe(4)
    expect(LANE_CAP(9)).toBe(3)
  })
})

describe('assertRing', () => {
  it('passes a ring where every family is >=3 apart cyclically', () => {
    // families A,B,C,D placed at 0,1,2,3 then repeated every 4 — max distance
    // between same-family members is >=3 for a 12-slot ring built this way
    const order = [
      s('a0', 'A'), s('b0', 'B'), s('c0', 'C'), s('d0', 'D'),
      s('a1', 'A'), s('b1', 'B'), s('c1', 'C'), s('d1', 'D'),
      s('a2', 'A'), s('b2', 'B'), s('c2', 'C'), s('d2', 'D'),
    ]
    expect(assertRing(order, { slots: 12 })).toBe(true)
  })

  it('throws when two same-family members are <3 apart', () => {
    const order = [
      s('a0', 'A'), s('a1', 'A'), s('b0', 'B'), s('c0', 'C'),
    ]
    expect(() => assertRing(order, { slots: 4 })).toThrow(/family "A".*need >=3/)
  })

  it('throws when the same prim is adjacent', () => {
    const order = [
      s('x0', 'A', 'ring'), s('x1', 'B', 'ring'), s('x2', 'C', 'dots'), s('x3', 'D', 'lens'),
    ]
    expect(() => assertRing(order, { slots: 4 })).toThrow(/prim "ring" adjacent/)
  })

  it('throws on a duplicate key', () => {
    const order = [s('dup', 'A'), s('dup', 'B'), s('c', 'C'), s('d', 'D')]
    expect(() => assertRing(order, { slots: 4 })).toThrow(/duplicate key "dup"/)
  })

  it('throws when accents exceed the cap', () => {
    const order = [
      s('a', 'A', 'a', true), s('b', 'B', 'b', true), s('c', 'C', 'c', true), s('d', 'D', 'd', true),
    ]
    expect(() => assertRing(order, { slots: 4, maxAccents: 3 })).toThrow(/4 accents, max 3/)
  })

  it('throws when one prim is used more than maxPerPrim times', () => {
    const order = [
      s('a', 'A', 'ring'), s('b', 'B', 'lens'), s('c', 'C', 'ring'),
      s('d', 'D', 'dots'), s('e', 'E', 'ring'), s('f', 'F', 'binary'),
    ]
    expect(() => assertRing(order, { slots: 6, maxPerPrim: 2 })).toThrow(/prim "ring" used 3x, max 2/)
  })

  it('wraps around the cyclic boundary (last slot vs slot 0)', () => {
    const order = [s('a0', 'A'), s('b', 'B'), s('c', 'C'), s('a1', 'A')]
    // slot 3 and slot 0 are cyclically 1 apart (4-slot ring) — same family, must throw
    expect(() => assertRing(order, { slots: 4 })).toThrow(/family "A".*need >=3/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- ringDraw.test.js`
Expected: FAIL — `Cannot find module './ringDraw.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// client/src/lib/ringDraw.js
//
// Pure. No DOM, no Math.random — every random choice below goes through
// ringEngine.js's hash32/rng (docs/superpowers/plans/
// 2026-09-02-ring-station-variety.md §2.4). See that doc's invariant table
// (§2.3) for where each rule below comes from.
import { rng, hash32 } from './ringEngine.js'

export const LANE_CAP = (slots) => Math.floor(slots / 3)

function cyclicDist(a, b, slots) {
  const d = Math.abs(a - b)
  return Math.min(d, slots - d)
}

export function assertRing(order, { slots = order.length, maxAccents = 3, maxPerPrim = 3 } = {}) {
  const seenKeys = new Set()
  const primCounts = {}
  let accents = 0

  for (let i = 0; i < slots; i++) {
    const s = order[i]
    if (seenKeys.has(s.key)) throw new Error(`assertRing: duplicate key "${s.key}"`)
    seenKeys.add(s.key)
    if (s.accent) accents++
    primCounts[s.prim] = (primCounts[s.prim] || 0) + 1

    for (let j = i + 1; j < slots; j++) {
      const other = order[j]
      const d = cyclicDist(i, j, slots)
      if (other.family === s.family && d < 3) {
        throw new Error(`assertRing: family "${s.family}" at slots ${i} and ${j} are ${d} apart, need >=3`)
      }
      if (other.prim === s.prim && d === 1) {
        throw new Error(`assertRing: prim "${s.prim}" adjacent at slots ${i} and ${j}`)
      }
    }
  }

  if (accents > maxAccents) {
    throw new Error(`assertRing: ${accents} accents, max ${maxAccents}`)
  }
  for (const [prim, count] of Object.entries(primCounts)) {
    if (count > maxPerPrim) {
      throw new Error(`assertRing: prim "${prim}" used ${count}x, max ${maxPerPrim}`)
    }
  }
  return true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- ringDraw.test.js`
Expected: PASS, all 7 `assertRing`/`LANE_CAP` assertions. (`drawStations` doesn't exist yet — later tests
in the same file, added in Task 3, will fail until then; run with `-t assertRing` or `-t LANE_CAP` to
scope this step if the runner doesn't isolate by describe block automatically.)

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/ringDraw.js client/src/lib/ringDraw.test.js
git commit -m "feat: add assertRing + LANE_CAP, the ring draw's invariant checker"
```

---

### Task 3: `drawStations` — the seeded draw

**Files:**
- Modify: `client/src/lib/ringDraw.js` (add `drawStations`)
- Modify: `client/src/lib/ringDraw.test.js` (add this task's tests)

**Interfaces:**
- Consumes: `RING_POOL` (Task 1) for the `'authored'`-seed falsifier test; `assertRing`, `LANE_CAP`
  (Task 2, same file) internally.
- Produces: `drawStations(pool, opts)` — `pool: Array<{key,prim,hue,accent,family}>`,
  `opts: {seed: number|string, slots?: number, pinKey?: string, pinAt?: number}` (defaults
  `slots=13, pinKey='record', pinAt=10`). Returns `Array<pool[number]>` of length `slots`, a permutation
  of a subset of `pool` satisfying `assertRing`, with `pool.find(s => s.key === pinKey)` placed at index
  `pinAt`. Throws `Error` if no legal set/arrangement exists, or if `seed !== 'authored'` and `pinKey` is
  not found in `pool`.

- [ ] **Step 1: Write the failing test**

```js
// append to client/src/lib/ringDraw.test.js
import { drawStations } from './ringDraw.js'
import { RING_POOL } from '../worlds/ringPool.js'

describe('drawStations', () => {
  it('seed "authored" returns todays 13 stations byte-for-byte, unchanged order', () => {
    const result = drawStations(RING_POOL, { seed: 'authored' })
    expect(result).toEqual(RING_POOL)
  })

  it('throws for a real seed on the current 13-entry pool — radial-mass has 5 members, cap is 4', () => {
    // This is the documented, expected failure (docs/superpowers/plans/
    // 2026-09-05-ring-unified-noun-color-draw-design.md §9): with pool.length
    // === slots, every member must be chosen, and today's pool has 5
    // radial-mass nouns against LANE_CAP(13)=4. The throw IS the proof the
    // cap is enforced, not a bug — pool growth (a separate art-project task)
    // is what makes a real seed succeed.
    expect(() => drawStations(RING_POOL, { seed: 42 })).toThrow(/cannot fill 13 slots under the caps/)
  })

  it('throws if pinKey is not in the pool (non-authored seed)', () => {
    const noRecord = RING_POOL.filter(s => s.key !== 'record')
    expect(() => drawStations(noRecord, { seed: 1, slots: 12 })).toThrow(/pinKey "record" not found/)
  })

  const SYNTHETIC_POOL = [
    { key: 'p1', prim: 'ring', hue: 10, accent: false, family: 'radial-mass' },
    { key: 'p2', prim: 'planet', hue: 40, accent: false, family: 'radial-mass' },
    { key: 'c1', prim: 'dots', hue: 90, accent: false, family: 'cluster' },
    { key: 'c2', prim: 'asteroidField', hue: 130, accent: false, family: 'cluster' },
    { key: 'b1', prim: 'pulsar', hue: 170, accent: false, family: 'burst' },
    { key: 'b2', prim: 'spikes', hue: 210, accent: true, family: 'burst' },
    { key: 'record', prim: 'record', hue: 300, accent: false, family: 'radial-mass' },
    { key: 's1', prim: 'streak', hue: 250, accent: false, family: 'streak' },
  ]

  it('a satisfiable synthetic pool: same seed twice gives identical results, and each result is valid', () => {
    const r1 = drawStations(SYNTHETIC_POOL, { seed: 777, slots: 8, pinAt: 6 })
    const r2 = drawStations(SYNTHETIC_POOL, { seed: 777, slots: 8, pinAt: 6 })
    expect(r1).toEqual(r2)
    expect(assertRing(r1, { slots: 8 })).toBe(true)
  })

  it('pins "record" at pinAt regardless of where the internal draw placed it', () => {
    const result = drawStations(SYNTHETIC_POOL, { seed: 777, slots: 8, pinAt: 6 })
    expect(result[6].key).toBe('record')
  })

  it('different seeds can produce different arrangements of the same satisfiable pool', () => {
    const r1 = drawStations(SYNTHETIC_POOL, { seed: 1, slots: 8, pinAt: 6 })
    const r2 = drawStations(SYNTHETIC_POOL, { seed: 2, slots: 8, pinAt: 6 })
    // not asserting they always differ (small search space could coincide),
    // just that both are independently valid — the real claim under test.
    expect(assertRing(r1, { slots: 8 })).toBe(true)
    expect(assertRing(r2, { slots: 8 })).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- ringDraw.test.js`
Expected: FAIL — `drawStations is not a function` (or `Cannot find module '../worlds/ringPool.js'` if
Task 1 hasn't landed yet in this branch; that dependency is Task 1's job, not this one's).

- [ ] **Step 3: Write minimal implementation**

```js
// append to client/src/lib/ringDraw.js

export function drawStations(pool, { seed, slots = 13, pinKey = 'record', pinAt = 10 } = {}) {
  if (seed === 'authored') return pool.slice()

  const pinned = pool.find(s => s.key === pinKey)
  if (!pinned) throw new Error(`ringDraw: pinKey "${pinKey}" not found in pool`)

  const numericSeed = typeof seed === 'number' ? seed : hash32(String(seed), 0)
  const r = rng(numericSeed, 0xD0A1)

  const laneCap = LANE_CAP(slots)
  const maxAccents = 3
  const maxPerPrim = 3

  // 1. Choose the set (all of `pool` if pool.length === slots — no freedom,
  //    but the cap check below still runs and can still throw).
  const chosen = [pinned]
  const famCount = { [pinned.family]: 1 }
  const primCount = { [pinned.prim]: 1 }
  let accentCount = pinned.accent ? 1 : 0
  const remaining = pool.filter(s => s !== pinned)

  while (chosen.length < slots) {
    const cands = remaining.filter(s =>
      (famCount[s.family] || 0) < laneCap &&
      accentCount + (s.accent ? 1 : 0) <= maxAccents &&
      (primCount[s.prim] || 0) < maxPerPrim
    )
    if (!cands.length) {
      throw new Error(`ringDraw: pool cannot fill ${slots} slots under the caps (chose ${chosen.length} of ${slots})`)
    }
    const idx = Math.floor(r() * cands.length)
    const picked = cands[idx]
    remaining.splice(remaining.indexOf(picked), 1)
    chosen.push(picked)
    famCount[picked.family] = (famCount[picked.family] || 0) + 1
    primCount[picked.prim] = (primCount[picked.prim] || 0) + 1
    accentCount += picked.accent ? 1 : 0
  }

  // 2. Place: backtracking search over slot order. Small n (<=13), heavily
  //    pruned by the family/prim checks, so this terminates fast in
  //    practice; it is a correctness-first search, not the fastest possible
  //    placement — see the variety plan's own note that a hand-optimised
  //    lane-fill is ~40 lines for the same guarantee.
  const order = new Array(slots).fill(null)
  const used = new Array(chosen.length).fill(false)
  const dist = (a, b) => Math.min(Math.abs(a - b), slots - Math.abs(a - b))

  function fits(member, slotIdx) {
    for (let i = 0; i < slots; i++) {
      const other = order[i]
      if (!other) continue
      const d = dist(slotIdx, i)
      if (other.family === member.family && d < 3) return false
      if (other.prim === member.prim && d === 1) return false
    }
    return true
  }

  function shuffledIndices(n) {
    const idxs = Array.from({ length: n }, (_, i) => i)
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[idxs[i], idxs[j]] = [idxs[j], idxs[i]]
    }
    return idxs
  }

  function backtrack(slotIdx) {
    if (slotIdx === slots) return true
    for (const i of shuffledIndices(chosen.length)) {
      if (used[i]) continue
      const member = chosen[i]
      if (!fits(member, slotIdx)) continue
      order[slotIdx] = member
      used[i] = true
      if (backtrack(slotIdx + 1)) return true
      order[slotIdx] = null
      used[i] = false
    }
    return false
  }

  if (!backtrack(0)) {
    throw new Error('ringDraw: no arrangement of the chosen set satisfies spacing under this seed')
  }

  assertRing(order, { slots, maxAccents, maxPerPrim })

  // 3. Rotate so the pinned noun lands at pinAt — rotation preserves every
  //    cyclic distance, so assertRing's guarantees survive the rotation.
  const at = order.findIndex(s => s.key === pinKey)
  return order.map((_, i) => order[(i + at - pinAt + slots) % slots])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- ringDraw.test.js`
Expected: PASS, all tests in the file (Task 2's 7 + this task's 6).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/ringDraw.js client/src/lib/ringDraw.test.js
git commit -m "feat: add drawStations — seeded, invariant-checked ring station draw"
```

---

## Self-Review Notes (completed during planning, not a re-check needed by the executor)

- **Spec coverage:** family spacing (assertRing), prim adjacency (assertRing), accent cap (assertRing),
  `LANE_CAP` formula, seeded/no-`Math.random` (rng/hash32), `'authored'` byte-identical falsifier,
  determinism, pin-and-rotate — every invariant in the variety plan's §2.3 table and §2.4 sketch has a
  task and a test above. Pool growth, palette coupling, schema, and the picker UI are explicitly out of
  scope (separate future plans per the unified design doc's §9 build order).
- **Placeholder scan:** none — every step has real, complete code, not a description of code.
- **Type consistency:** `drawStations(pool, opts)` and `assertRing(order, opts)` signatures are identical
  across every task and test that calls them.
- **Scope:** intentionally the smallest independently-shippable slice (§9 step 2 alone). Composition
  (`drawWorld`, step 3), schema/certification (step 4), and the picker (step 5) are separate follow-on
  plans once this one is reviewed and merged — each produces working, testable software on its own, per
  this project's own "frequent commits, don't blur decision into build" discipline.
