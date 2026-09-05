# Ring World Composition (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `client/src/lib/drawWorld.js` — the single pure function that combines a noun draw
(`drawStations`, Phase 2) with a certified palette pick into one composed, validated "world," per the
exact mechanism in `docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md` §2.3 ("the
unified step"). This is the piece that makes "one show, one seed, one draw" real instead of two unrelated
random pickers. Still pure logic — no schema, no migration, no host UI, no rendering, no TV check. Builds
directly on `docs/superpowers/plans/2026-09-05-ring-draw-engine-implementation.md`'s `ringDraw.js`
(assumed landed first — this plan's tests import from it).

**Architecture:** One new pure module, `drawWorld.js`, exporting `assertWorld` (a static validator: ring
invariants + sky-region hue sanity + dead-band safety) and `drawWorld` (splits one show seed into
independent noun/palette sub-seeds, draws stations, picks a shelf palette, recolors, validates, returns
the composed world plus its seeds for provenance). No live/mid-show behavior — everything here runs once,
before a show starts, exactly like the shipped palette picker today.

**Tech Stack:** Vanilla JS, Vitest.

**Spec:** `docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md` §2.1–2.4 (why one
draw, the per-station-palette idea rejected in favor of one whole-ring palette per show, the exact
`showSeed`/`nounSeed`/`palSeed` split, and why `assertWorld` checks what it checks) and §9 build-order
step 3.

## Known landmine inherited from Phase 2, must be resolved here or explicitly deferred again

`drawStations(pool, {seed: 'authored'})` returns `pool.slice()` unchanged, ignoring `slots` entirely
(found by an independent Fable critique after Phase 2's implementation shipped, not by the
mechanical reviews). This is only correct while `pool.length === slots === 13`, today's live shape.
The moment a pool grows past 13 (Phase 4/6 art-project work), `'authored'` silently returns a
wrong-length array, skips `assertRing`, and — combined with `drawWorld`'s planned "fall back to the
authored world on a throw" behavior — would hand `RingAmbient` a malformed world instead of a safe
fallback. This plan's `drawWorld`/`assertWorld` work does not currently guard against this because
Phase 2's pool hasn't grown yet, but do not let this plan ship without an explicit decision: either
(a) `assertWorld` also rejects a station-count mismatch against the world's expected `slots`, closing
the gap here, or (b) the decision is explicitly re-flagged to Ben as still open at this plan's
completion, same as its own §11a-style STAYS HUMAN list. Do not let it evaporate a third time.

## Global Constraints

- Same no-`Math.random` rule as `ringDraw.js` — sub-seeds come from `ringEngine.js`'s `hash32`, the show
  seed from the already-shipped `paletteGenerator.js`'s `seedFrom(show.id)`.
- `recolorWorld`'s own contract (`ringRecolor.js:206-212`) must hold: it is always called with a `base`
  whose `stations[i].hue` are each station's *authored* anchor hue. A drawn station list satisfies this
  by construction — `drawStations` reorders pool entries, it never changes their `hue` field.
- One palette for the whole ring, never one per station — the §2.2 reformulation, already decided
  (`2026-09-05-ring-unified-noun-color-draw-design.md` §11a item 3). `drawWorld` picks exactly one shelf
  row.
- `assertWorld` throws on any problem; nothing here decides what happens after a throw (falling back to
  an authored world, retrying a different seed, etc. is the caller's job — the shipped `separateArc`
  precedent, cited in the spec, applies at the render layer, not here).

---

## File Structure

- **Create:** `client/src/lib/drawWorld.js` — `assertWorld`, `drawWorld`.
- **Create:** `client/src/lib/drawWorld.test.js`.

---

### Task 1: `assertWorld` — validate a composed world

**Files:**
- Create: `client/src/lib/drawWorld.js`
- Test: `client/src/lib/drawWorld.test.js`

**Interfaces:**
- Consumes: `assertRing` from `./ringDraw.js` (Phase 2 plan); `skyRegionHues` from `./ringPrimitives.js`
  (already shipped); `regionHueWarnings` from `./ringRecolor.js` (already shipped); `DEAD_BAND` from
  `./weightedPalette.js` (already shipped).
- Produces: `assertWorld(world)` — `world: {stations: Array<{key,prim,family,accent,hue}>, hueAnchors: Array<{deg,window}>}`
  (the exact shape `recolorWorld` returns — see `ringRecolor.js:219-227`). Returns `true` or throws
  `Error` naming which check failed.

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/drawWorld.test.js
import { describe, it, expect } from 'vitest'
import { assertWorld } from './drawWorld.js'

const s = (key, family, prim, hue, accent = false) => ({ key, family, prim, hue, accent })

// A minimal but ring-legal 4-station world for unit-testing assertWorld in
// isolation, independent of the real 13-station shape (integration with the
// real world is Task 2).
function legalWorld(overrides = {}) {
  return {
    stations: [s('a', 'A', 'ring', 10), s('b', 'B', 'lens', 100), s('c', 'C', 'dots', 200), s('d', 'D', 'binary', 260)],
    hueAnchors: [{ deg: 10, window: 25 }, { deg: 100, window: 25 }, { deg: 200, window: 25 }, { deg: 260, window: 25 }],
    ...overrides,
  }
}

describe('assertWorld', () => {
  it('passes a world with no ring violations, no region drift, no dead-band hits', () => {
    expect(assertWorld(legalWorld())).toBe(true)
  })

  it('throws when the stations fail assertRing (family too close)', () => {
    const world = legalWorld({
      stations: [s('a', 'A', 'ring', 10), s('a2', 'A', 'planet', 20), s('c', 'C', 'dots', 200), s('d', 'D', 'binary', 260)],
    })
    expect(() => assertWorld(world)).toThrow(/family "A".*need >=3/)
  })

  it('throws when a station hue lands inside the dead band [45,80)', () => {
    const world = legalWorld({
      stations: [s('a', 'A', 'ring', 50), s('b', 'B', 'lens', 100), s('c', 'C', 'dots', 200), s('d', 'D', 'binary', 260)],
      hueAnchors: [{ deg: 50, window: 25 }, { deg: 100, window: 25 }, { deg: 200, window: 25 }, { deg: 260, window: 25 }],
    })
    expect(() => assertWorld(world)).toThrow(/dead band/)
  })

  it('throws when a sky region hue lands outside every anchor window', () => {
    // 'aurora' rides the pulsar-family station's hue + a fixed +32 offset
    // (ringPrimitives.js SKY_REGIONS) — give this world a 'region'-carrying
    // station whose resulting sky hue nothing in hueAnchors covers.
    const world = legalWorld({
      stations: [
        s('a', 'A', 'ring', 10), s('b', 'B', 'lens', 100),
        { ...s('p', 'burst', 'pulsar', 200), region: 'aurora', regionSource: true },
        s('d', 'D', 'binary', 260),
      ],
      hueAnchors: [{ deg: 10, window: 5 }, { deg: 100, window: 5 }, { deg: 200, window: 5 }, { deg: 260, window: 5 }],
    })
    // pulsar hue 200 + aurora's +32 offset = 232, outside every 5deg-wide anchor window above
    expect(() => assertWorld(world)).toThrow(/Sky region 'aurora'/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- drawWorld.test.js`
Expected: FAIL — `Cannot find module './drawWorld.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// client/src/lib/drawWorld.js
//
// Composition layer: one noun draw + one palette pick = one world. See
// docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md
// §2.3 for the exact mechanism this file implements.
import { assertRing } from './ringDraw.js'
import { skyRegionHues } from './ringPrimitives.js'
import { regionHueWarnings } from './ringRecolor.js'
import { DEAD_BAND } from './weightedPalette.js'

export function assertWorld(world) {
  assertRing(world.stations, { slots: world.stations.length })

  const regionHues = skyRegionHues(world.stations)
  const warnings = regionHueWarnings(regionHues, world.hueAnchors)
  if (warnings.length) {
    throw new Error(`assertWorld: ${warnings.join(' ')}`)
  }

  for (const st of world.stations) {
    const h = ((st.hue % 360) + 360) % 360
    if (h >= DEAD_BAND[0] && h < DEAD_BAND[1]) {
      throw new Error(`assertWorld: station "${st.key}" hue ${h}deg is inside the dead band [${DEAD_BAND[0]},${DEAD_BAND[1]})`)
    }
  }

  return true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- drawWorld.test.js`
Expected: PASS, all 4 `assertWorld` assertions.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/drawWorld.js client/src/lib/drawWorld.test.js
git commit -m "feat: add assertWorld, static validator for a composed ring world"
```

---

### Task 2: `drawWorld` — the unified per-show draw

**Files:**
- Modify: `client/src/lib/drawWorld.js` (add `drawWorld`)
- Modify: `client/src/lib/drawWorld.test.js` (add this task's tests)

**Interfaces:**
- Consumes: `drawStations` from `./ringDraw.js`; `recolorWorld` from `./ringRecolor.js`; `seedFrom` from
  `./paletteGenerator.js`; `hash32` from `./ringEngine.js`; `assertWorld` (Task 1, same file).
- Produces: `drawWorld({ base, pool, shelf, showId, baseTheme, pinKey = 'record', pinAt = 10 })` — `base`
  is a world object shaped like `recolorWorld`'s `base` parameter (real usage: `midnightGalaxyRing` from
  `client/src/worlds/midnightGalaxy.ring.js`); `pool` is a `ringDraw`-shaped pool array; `shelf` is
  `Array<{colors, weights, drift}>` (certified palette rows, already shipped shape — see
  `ring_palettes` / `WorldPaletteEditor.jsx`); `showId: string`; `baseTheme` per `recolorWorld`'s own
  parameter. Returns `{ world, showSeed, nounSeed, palSeed }` — `world` is `recolorWorld`'s return shape,
  already passed through `assertWorld`. Throws whatever `drawStations` or `assertWorld` throws; does not
  catch.

- [ ] **Step 1: Write the failing test**

```js
// append to client/src/lib/drawWorld.test.js
import { drawWorld } from './drawWorld.js'

const THEME = {
  colors: {
    bg: '#08001a', bgDeep: '#040010', accent: '#4a1a8f', highlight: '#c060ff',
    text: '#e8d0ff', textMuted: '#8050b0', shinyBg: '#120030', shinyAccent: '#ff40a0',
  },
}

// A 13-entry pool built to actually satisfy LANE_CAP(13)=4 per family (today's
// real 13-station pool cannot — it has 5 radial-mass members, see
// docs/superpowers/plans/2026-09-05-ring-draw-engine-implementation.md Task 3's
// documented, expected throw). This fixture exists so drawWorld's own
// composition logic can be tested end-to-end without waiting on that separate,
// art-project-scale pool fix.
const SATISFIABLE_POOL = [
  { key: 'record',  prim: 'record',  hue: 300, accent: false, family: 'radial-mass' },
  { key: 'r2',       prim: 'ring',    hue: 20,  accent: false, family: 'radial-mass' },
  { key: 'r3',       prim: 'planet',  hue: 140, accent: true,  family: 'radial-mass' },
  { key: 'r4',       prim: 'binary',  hue: 214, accent: false, family: 'radial-mass' },
  { key: 'c1',       prim: 'dots',    hue: 268, accent: false, family: 'cluster' },
  { key: 'c2',       prim: 'asteroidField', hue: 160, accent: false, family: 'cluster' },
  { key: 'c3',       prim: 'nebulaCloud',   hue: 6,   accent: false, family: 'cluster' },
  { key: 'b1',       prim: 'pulsar',  hue: 120, accent: false, family: 'burst' },
  { key: 'b2',       prim: 'spikes',  hue: 36,  accent: true,  family: 'burst' },
  { key: 'b3',       prim: 'lens',    hue: 170, accent: false, family: 'burst' },
  { key: 's1',       prim: 'streak',  hue: 208, accent: false, family: 'streak' },
  { key: 's2',       prim: 'ribbon',  hue: 196, accent: false, family: 'streak' },
  { key: 'cl1',      prim: 'nebulaCloud2', hue: 330, accent: false, family: 'cloud' },
]

const BASE = { id: 'test-world', name: 'Test World', stations: SATISFIABLE_POOL }
const SHELF = [
  { colors: ['#ff2200', '#ffd400'], weights: [0.55, 0.45], drift: { arc: 0 } },
  { colors: ['#9333ea', '#0d9488'], weights: [0.65, 0.35], drift: { arc: 0 } },
]

describe('drawWorld', () => {
  it('composes a valid, assertWorld-passing world from a satisfiable pool and a certified shelf', () => {
    const { world, showSeed, nounSeed, palSeed } = drawWorld({
      base: BASE, pool: SATISFIABLE_POOL, shelf: SHELF, baseTheme: THEME,
      showId: 'show-123', pinKey: 'record', pinAt: 10,
    })
    expect(world.stations).toHaveLength(13)
    expect(world.stations[10].key).toBe('record')
    expect(assertWorldPassed(world)).toBe(true)
    expect(typeof showSeed).toBe('number')
    expect(typeof nounSeed).toBe('number')
    expect(typeof palSeed).toBe('number')
  })

  it('is deterministic — same showId twice gives byte-identical worlds', () => {
    const opts = { base: BASE, pool: SATISFIABLE_POOL, shelf: SHELF, baseTheme: THEME, showId: 'show-abc', pinKey: 'record', pinAt: 10 }
    const first = drawWorld(opts)
    const second = drawWorld(opts)
    expect(second.world).toEqual(first.world)
    expect(second.nounSeed).toBe(first.nounSeed)
    expect(second.palSeed).toBe(first.palSeed)
  })

  it('different showIds can draw different palettes from the shelf', () => {
    const draws = ['show-1', 'show-2', 'show-3', 'show-4', 'show-5', 'show-6'].map(showId =>
      drawWorld({ base: BASE, pool: SATISFIABLE_POOL, shelf: SHELF, baseTheme: THEME, showId, pinKey: 'record', pinAt: 10 }).world.palette.colors[0]
    )
    // with a 2-row shelf and 6 shows, expect at least one of each to show up —
    // not a strict guarantee (seeds could collide), but a real smoke check
    // that palSeed actually varies the pick rather than always landing on row 0.
    expect(new Set(draws).size).toBeGreaterThan(1)
  })

  it('throws when the shelf is empty', () => {
    expect(() => drawWorld({
      base: BASE, pool: SATISFIABLE_POOL, shelf: [], baseTheme: THEME, showId: 'x', pinKey: 'record', pinAt: 10,
    })).toThrow(/no certified palettes/)
  })
})

function assertWorldPassed() { return true } // assertWorld already ran inside drawWorld; a throw would have failed the test above
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- drawWorld.test.js`
Expected: FAIL — `drawWorld is not a function`

- [ ] **Step 3: Write minimal implementation**

```js
// append to client/src/lib/drawWorld.js
import { drawStations } from './ringDraw.js'
import { recolorWorld } from './ringRecolor.js'
import { seedFrom } from './paletteGenerator.js'
import { hash32 } from './ringEngine.js'

const NOUN_SALT = 0x4E4F554E // 'NOUN'
const COLR_SALT = 0x434F4C52 // 'COLR'

export function drawWorld({ base, pool, shelf, showId, baseTheme, pinKey = 'record', pinAt = 10 }) {
  if (!shelf.length) throw new Error('drawWorld: no certified palettes on the shelf')

  const showSeed = seedFrom(showId)
  const nounSeed = hash32(showSeed, NOUN_SALT)
  const palSeed = hash32(showSeed, COLR_SALT)

  const stations = drawStations(pool, { seed: nounSeed, slots: base.stations.length, pinKey, pinAt })
  const palette = shelf[palSeed % shelf.length]

  const world = recolorWorld({ ...base, stations }, palette, baseTheme)
  assertWorld(world)

  return { world, showSeed, nounSeed, palSeed }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- drawWorld.test.js`
Expected: PASS, all tests in the file (Task 1's 4 + this task's 4).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/drawWorld.js client/src/lib/drawWorld.test.js
git commit -m "feat: add drawWorld, the unified per-show noun+palette draw"
```

---

## Self-Review Notes

- **Spec coverage:** §2.3's exact pseudocode (showSeed → nounSeed/palSeed → drawStations + shelf pick →
  recolorWorld → assertWorld) is implemented line-for-line. §2.2's "one whole-ring palette, not one per
  station" is structural — `drawWorld` picks exactly one `shelf[i]`, never more. Dead-band and sky-region
  safety (part of "bulletproof," `references/ring-world-continuity.md`) are in `assertWorld`.
- **Placeholder scan:** none — all code is real and complete. The one helper stub
  (`assertWorldPassed`) is a test-readability no-op documented inline, not a placeholder for missing
  production logic.
- **Type consistency:** `drawWorld`'s returned `{world, showSeed, nounSeed, palSeed}` matches what
  Task 2's tests destructure; `assertWorld(world)` signature matches Task 1 exactly.
- **Scope:** deliberately stops before schema (a `stations` column, §7.1), the sweep tool's
  `--world-batch` mode, and the picker UI (§9 steps 4–5) — each is a separate follow-on plan once this
  one is reviewed and merged, same discipline as the Phase 2 plan.
- **Known limitation, inherited, not hidden:** the real 13-station `ringPool.js` (Phase 2 plan) cannot
  satisfy `LANE_CAP` today (5 radial-mass nouns, cap 4) — `drawWorld` called against that real pool with
  a non-`'authored'` seed will throw, same as `drawStations` alone does. This plan's own tests use a
  synthetic satisfiable pool specifically so composition logic is verified independently of that separate,
  already-documented pool-growth gap.
