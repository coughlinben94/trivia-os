# Ring World — Six New Pool Objects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Also read `references/ring-world-mistakes.md` and `references/ring-world-continuity.md` before starting — this plan lives in the ring-world system's mandatory-read set.

**Goal:** Give the noun-selection pool real slack (13 → 19 candidates for 13 slots) by adding six new station nouns — a wormhole, a dark nebula, and four real constellations (Big Dipper, full Orion, Cassiopeia, Southern Cross) — so "Re-roll objects" can actually succeed instead of deterministically throwing on every seed. This is Ben's explicit direction, confirmed in a brainstorming pass: both new-shape objects AND all four constellations, dots only (no connecting lines), Codex consulted read-only on the architecture and cited below.

**Architecture:** Three layers, each already precedented in this codebase. (1) A new data file, `client/src/worlds/midnightGalaxy.candidates.js`, holds the six new stations as full render-capable objects (same shape as the 13 authored ones). (2) `client/src/worlds/ringPool.js`'s `RING_POOL` stops being a reduced `{key,prim,hue,accent,family}` projection and becomes the union of the 13 authored stations (spread in full, with `family` still read from `SLOTS[i]`) and the six candidates — this also finishes the job the 2026-09-24 critique-fix pass started (resolving drawn worlds against full station objects, not a reduced shape). (3) `client/src/lib/ringPrimitives.js` gets two new primitive kinds (`wormhole`, `darkNebula`) and one existing-but-unwired kind gets finished (`constellation` — built 2026-09-15 as an unwired "Phase 4 pool noun," per its own header comment; currently draws connecting lines, which Ben's direction rules out, and Orion's point set is missing its sword).

**Tech Stack:** React, Vite, plain SVG (no library), Vitest, Playwright (for self-render screenshots only — this plan does not touch `ring-verify.mjs`'s gate logic).

**Spec:** `concepts/ART-DIRECTION-SPEC.md` (silhouette families, the occluder/rim rules Task 4 must satisfy), `concepts/OBJECT-RENDERING-PROTOCOL.md` (the noun test, frozen pass-criterion sentence, iconic-vs-figurative classification), `references/ring-world-mistakes.md` (rule zero — render before you claim, no threshold moves), `docs/superpowers/plans/2026-09-02-ring-station-variety.md` §Phase 4 (the constellation/wormhole-adjacent prior work this plan finishes). Codex (`gpt-6-sol`, read-only, two consult sessions 2026-09-24) confirmed the pool-vs-authored-ring architecture below by reading the actual code, not guessing.

## Global Constraints

- **Never touch:** `RingAmbient.jsx`, `ringEngine.js`, `SLOTS`/`midnightGalaxy.slots.js` (the 13-slot placement grammar), `ring-spec.lock.json`, `ring-verify.mjs`'s pass/fail logic, `assertRing`/`LANE_CAP`'s own logic in `ringDraw.js` (call it, don't modify it), `recolorWorld`'s own body. The 13-station authored ring's slot count and geometry are unchanged by this plan — only the *pool* grows.
- **STAYS HUMAN** (`references/ring-world-continuity.md` §4): no lock-file edit, no gate-check-code edit, no threshold choice, and — critically — **aesthetic acceptance is Ben's call, not this plan's**. Every task ends with a self-render screenshot step; the implementer reports what they see, never "this looks good" as a final verdict. Ben looks at the actual renders before this is called done (see Final Review below).
- **No connecting lines on constellations.** Ben's explicit correction during brainstorming. The existing `constellation` primitive draws `<line>` edges between points — Task 2 removes that drawing code entirely. Star positions and brightness stay.
- **No traced/generated art, no licensing risk.** Constellation star positions are astronomical fact (approximate real asterism shapes), not anyone's copyrighted artwork — Codex's research already flagged this as lower licensing risk than a reference-traced icon. Wormhole and dark nebula are pure iconic geometry per the noun test (one sentence of shape each) — hand-coded directly, no reference image sourced or traced for either.
- **Dark nebula's occluder-placement risk is flagged, not solved, in this plan.** `ART-DIRECTION-SPEC.md` §7.2 bans occluders from bottom-third-loudness slots; the draw algorithm (`ringDraw.js`) has no concept of "loudness," only family/prim spacing — extending it is out of scope (a real `ringDraw.js` change, and that file's own logic is near-STAYS-HUMAN territory, not something to touch for one noun's placement preference). The actual backstop is the existing certification pipeline (`palette-sweep.mjs --world-batch` + `ring-verify.mjs`'s real gate) — nothing reaches a host's shelf uncertified. Task 4 builds the mandatory hard-edge rim (§6.1) regardless, which is the one thing the primitive itself CAN guarantee.
- **Frozen pass-criterion sentences, per `OBJECT-RENDERING-PROTOCOL.md`:** each new/changed kind gets one sentence, written before the first real render, stating what a fresh viewer should name it as. Given below per task. Do not change a sentence after writing it without saying so explicitly.
- Every new candidate gets `accent: false` (the authored 13 already use 3 of the `maxAccents = 3` budget — don't add pressure there) and a `hue` outside `weightedPalette.js`'s `DEAD_BAND` (currently `[45, 80)` — confirm the live value, don't assume it hasn't moved).

---

### Task 1: Pool architecture — full-shaped `RING_POOL` + candidate file skeleton

**Files:**
- Create: `client/src/worlds/midnightGalaxy.candidates.js`
- Modify: `client/src/worlds/ringPool.js`
- Modify: `client/src/worlds/ringPool.test.js`
- Modify: `client/src/lib/ringDraw.test.js`
- Modify: `client/src/lib/ringWorldFor.js`
- Modify: `client/src/components/host/WorldPaletteEditor.jsx`

**Interfaces:**
- Produces: `CANDIDATE_STATIONS` (array of 6 full station objects, exported from the new candidates file — empty of real geometry work in this task, just the data shape and placeholder `prim` values that Tasks 2-4 will make real); `RING_POOL` (now 19 full station objects: 13 authored + 6 candidates, family on every entry, `prim`/`hue`/`accent`/`key` plus whatever authored fields each of the 13 already carries).
- Consumes: `midnightGalaxyRing.stations` (`./midnightGalaxy.ring.js`), `SLOTS` (`./midnightGalaxy.slots.js`) — both unchanged, only read differently.

- [ ] **Step 1: Write the candidate data file**

```js
// client/src/worlds/midnightGalaxy.candidates.js
//
// Pool-only station candidates — never part of the fixed 13-station
// authored ring (client/src/worlds/midnightGalaxy.ring.js), never given a
// SLOTS entry. They exist only so client/src/worlds/ringPool.js's
// RING_POOL has real surplus for client/src/lib/ringDraw.js's drawStations
// to draw from. See docs/superpowers/plans/2026-09-24-ring-world-six-new-
// objects.md for the full architecture and why (the pool used to equal the
// authored 13 exactly, so drawStations had zero freedom and threw on every
// real seed — 5 authored stations share family 'radial-mass' against a cap
// of 4).
//
// Every entry needs the same fields the reduced RING_POOL projection used
// to drop before 2026-09-24's critique-fix pass: whatever
// client/src/components/display/RingAmbient.jsx reads by station identity
// (variant/region/regionSource/noCompanion/companionKind) for stations
// that need them. None of these six do (deliberately kept simple for a
// first pass) — omitted fields default the same way an authored station
// omitting them does.
export const CANDIDATE_STATIONS = [
  { key: 'big dipper', prim: 'constellation', variant: 'bigDipper', hue: 210, accent: false, family: 'constellation' },
  { key: 'orion', prim: 'constellation', variant: 'orion', hue: 195, accent: false, family: 'constellation' },
  { key: 'cassiopeia', prim: 'constellation', variant: 'cassiopeia', hue: 180, accent: false, family: 'constellation' },
  { key: 'southern cross', prim: 'constellation', variant: 'southernCross', hue: 165, accent: false, family: 'constellation' },
  { key: 'wormhole', prim: 'wormhole', hue: 230, accent: false, family: 'lens' },
  { key: 'dark nebula', prim: 'darkNebula', hue: 265, accent: false, family: 'cloud' },
]
```

Before committing to these six `hue` values, read `client/src/lib/weightedPalette.js`'s current `DEAD_BAND` export and confirm none of `210, 195, 180, 165, 230, 265` fall inside it. If the range has moved since this plan was written, shift any colliding value by ±10° rather than editing `DEAD_BAND`.

- [ ] **Step 2: Write the failing pool tests**

Replace `client/src/worlds/ringPool.test.js` in full:

```js
import { describe, it, expect } from 'vitest'
import { RING_POOL } from './ringPool.js'
import { CANDIDATE_STATIONS } from './midnightGalaxy.candidates.js'
import {
  RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
  PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, ECLIPSE_HUE,
  AURORA_RIBBON_HUE, SUPERNOVA_HUE,
} from './midnightGalaxy.ring.js'

// These literals are the oracle, not a re-derivation of RING_POOL. If
// midnightGalaxy.ring.js, midnightGalaxy.slots.js, or
// midnightGalaxy.candidates.js changes, these hardcoded expectations
// mismatch and the test fails — that's the drift detector.
const EXPECTED_AUTHORED_KEYS = [
  'ringed planet', 'spiral galaxy', 'star cluster', 'amber planet', 'lit planet',
  'pulsar', 'rose nebula', 'comet', 'binary pair', 'asteroid field', 'eclipse',
  'aurora ribbon', 'supernova',
]
const EXPECTED_CANDIDATE_KEYS = ['big dipper', 'orion', 'cassiopeia', 'southern cross', 'wormhole', 'dark nebula']

const EXPECTED_ACCENT_KEYS = ['amber planet', 'rose nebula', 'supernova']

const EXPECTED_AUTHORED_FAMILIES = [
  'radial-mass', 'lens', 'cluster', 'radial-mass', 'radial-mass',
  'burst', 'cloud', 'streak', 'radial-mass', 'cluster', 'radial-mass',
  'streak', 'burst',
]

describe('RING_POOL', () => {
  it('has 19 entries: the 13 authored stations, then the pool-only candidates', () => {
    expect(RING_POOL).toHaveLength(19)
    expect(RING_POOL.map(s => s.key)).toEqual([...EXPECTED_AUTHORED_KEYS, ...EXPECTED_CANDIDATE_KEYS])
  })

  it('the first 13 hues match the live authored constants, not a copied literal', () => {
    const hues = [
      RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
      PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, ECLIPSE_HUE,
      AURORA_RIBBON_HUE, SUPERNOVA_HUE,
    ]
    expect(RING_POOL.slice(0, 13).map(s => s.hue)).toEqual(hues)
  })

  it('accent is true only on amber planet, rose nebula, supernova — the warm-complementary cap', () => {
    expect(RING_POOL.filter(s => s.accent).map(s => s.key)).toEqual(EXPECTED_ACCENT_KEYS)
  })

  it('the first 13 families match the shipped slot table', () => {
    expect(RING_POOL.slice(0, 13).map(s => s.family)).toEqual(EXPECTED_AUTHORED_FAMILIES)
  })

  it('the last 6 entries are exactly CANDIDATE_STATIONS, in order, unmodified', () => {
    expect(RING_POOL.slice(13)).toEqual(CANDIDATE_STATIONS)
  })

  it('every authored station carries its full render fields, not a reduced projection', () => {
    // Regression guard for the exact bug fixed 2026-09-24: a reduced
    // {key,prim,hue,accent,family} pool silently drops variant/region/
    // regionSource/noCompanion/companionKind. Pick two authored stations
    // that carry fields the old reduced shape dropped and confirm they
    // survive into RING_POOL.
    const pulsar = RING_POOL.find(s => s.key === 'pulsar')
    expect(pulsar.noCompanion).toBe(true)
    expect(pulsar.region).toBe('aurora')
    const amberPlanet = RING_POOL.find(s => s.key === 'amber planet')
    expect(amberPlanet.variant).toBe('dust')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit -- ringPool`
Expected: FAIL — `Cannot find module './midnightGalaxy.candidates.js'` (doesn't exist until Step 1's file is picked up — if Step 1 already ran, expect FAIL on length/key mismatches instead, since `ringPool.js` itself hasn't changed yet).

- [ ] **Step 4: Rewrite `client/src/worlds/ringPool.js`**

```js
//
// Full station objects for the 13 authored (fixed default ring) plus the
// pool-only candidates in midnightGalaxy.candidates.js — this is the pool
// client/src/lib/ringDraw.js's drawStations draws from. Carries every
// render field (variant/region/regionSource/noCompanion/companionKind),
// not a reduced {key,prim,hue,accent,family} projection: resolving a drawn
// world's render data against a reduced pool silently dropped those
// fields at render time — fixed 2026-09-24, see
// references/ring-world-mistakes.md and client/src/lib/ringWorldFor.js's
// own comment. `family` still comes from SLOTS[i] for the 13 authored
// entries (reading a reshuffle of stations can't silently pair the wrong
// hue/family to the wrong station); the six candidates carry their own
// family directly, since they have no SLOTS entry — they're never part of
// the fixed default ring, only ever pool-drawn.
import { midnightGalaxyRing } from './midnightGalaxy.ring.js'
import { SLOTS } from './midnightGalaxy.slots.js'
import { CANDIDATE_STATIONS } from './midnightGalaxy.candidates.js'

export const RING_POOL = [
  ...midnightGalaxyRing.stations.map((station, i) => ({ ...station, family: SLOTS[i].family })),
  ...CANDIDATE_STATIONS,
]
```

- [ ] **Step 5: Run the pool tests to verify they pass**

Run: `npm run test:unit -- ringPool`
Expected: PASS, all 6 tests.

- [ ] **Step 6: Fix `ringDraw.test.js`'s now-inverted assumption**

Read `client/src/lib/ringDraw.test.js` around the test titled `'throws for a real seed on the current 13-entry pool — radial-mass has 5 members, cap is 4'`. Its whole premise (the pool has no slack, every real seed throws) is exactly what this plan fixes — once `RING_POOL` has 19 entries, a real seed should now **succeed**. Replace that test:

```js
  it('a real seed succeeds on the 19-entry pool — the six candidates give radial-mass room to be excluded', () => {
    // Inverse of the old regression test this replaces: before the pool
    // grew past 13 entries, drawStations had zero freedom and threw on
    // every real seed (5 authored stations share family 'radial-mass'
    // against LANE_CAP(13)=4). The SUCCESS here is the proof the fix
    // worked, the same way the old test's throw was proof of the bug.
    const result = drawStations(RING_POOL, { seed: 42 })
    expect(result).toHaveLength(13)
    expect(new Set(result.map(s => s.key)).size).toBe(13) // no duplicates
    expect(() => assertRing(result)).not.toThrow()
  })
```

Import `assertRing` at the top of the file alongside the existing `drawStations`/`RING_POOL` imports if it isn't already imported.

- [ ] **Step 7: Run the full ringDraw suite to verify it passes**

Run: `npm run test:unit -- ringDraw`
Expected: PASS. If the replaced test still throws, stop and report — it means the pool math is wrong (re-check Step 1's family assignments against `LANE_CAP`/`maxPerPrim` in `client/src/lib/ringDraw.js`, don't loosen the test to hide it).

- [ ] **Step 8: Point the two resolve-against-full-stations call sites at `RING_POOL` instead of `midnightGalaxyRing.stations`**

Modify `client/src/lib/ringWorldFor.js`: add `import { RING_POOL } from '../worlds/ringPool.js'` near the existing imports, then change the line `const stations = resolveStations(midnightGalaxyRing.stations, theme.ringWorld.stations)` to `const stations = resolveStations(RING_POOL, theme.ringWorld.stations)`. Update the comment directly above it (currently explains resolving against "the FULL authored station objects, not RING_POOL" — that sentence is now backwards; fix it to say RING_POOL is the correct, now-full-shaped resolve target, covering both the 13 authored and the 6 candidates). Leave the `midnightGalaxyRing` import in place — `RING_WORLDS` still needs it.

Modify `client/src/components/host/WorldPaletteEditor.jsx`: find `resolvedStations`'s `useMemo` (currently calls `resolveStations(midnightGalaxyRing.stations, stations)`) and change it to `resolveStations(RING_POOL, stations)` — `RING_POOL` is already imported in this file. Update the comment above it the same way.

- [ ] **Step 9: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS, every existing test plus the new/changed ones above. No other file should need changes for this task — if something else breaks, read the failure before assuming it's unrelated; `RING_POOL` growing from 13 to 19 entries and from a reduced to a full shape is a real, load-bearing change other files may quietly depend on.

- [ ] **Step 10: Commit**

```bash
git add client/src/worlds/midnightGalaxy.candidates.js client/src/worlds/ringPool.js client/src/worlds/ringPool.test.js client/src/lib/ringDraw.test.js client/src/lib/ringWorldFor.js client/src/components/host/WorldPaletteEditor.jsx
git commit -m "feat(ring): grow RING_POOL to 19 entries — full station shape + 6 candidate placeholders"
```

---

### Task 2: Finish the constellation primitive — remove lines, add Orion's sword, wire the 4 candidates

**Files:**
- Modify: `client/src/lib/ringPrimitives.js`
- Test: `client/src/lib/ringPrimitives.constellation.test.js` (new)

**Interfaces:**
- Consumes: `CONSTELLATIONS` (module-scope object in `ringPrimitives.js`, already has `bigDipper`/`orion`/`cassiopeia`/`southernCross` entries), `CANDIDATE_STATIONS` (Task 1, already has the 4 constellation candidates pointing at these `variant` keys — no change needed there).
- Produces: the `constellation` kind renders dots only, no edges; `orion`'s point set includes its sword.

**Frozen pass criterion (write this before rendering, per `OBJECT-RENDERING-PROTOCOL.md`):** *"a fresh viewer names each of these four as a star pattern / a constellation — not a plain scattered cluster, not connected dots, not a random field of stars."* This replaces the existing frozen sentence in the code comment (which said "stars connected by lines" — no longer true once lines are removed).

- [ ] **Step 1: Remove the connecting-line rendering**

In `client/src/lib/ringPrimitives.js`, find the `kind === 'constellation'` branch (search for `else if (kind === 'constellation')`). Delete the entire block that draws edges:

```js
    // lines first, under the stars
    SET.edges.forEach(([a, b]) => {
      const pa = SET.points[a], pb = SET.points[b]
      const line = document.createElementNS(NS, 'line')
      line.setAttribute('x1', (remap(pa.x) * 100).toFixed(2)); line.setAttribute('y1', (remap(pa.y) * 100).toFixed(2))
      line.setAttribute('x2', (remap(pb.x) * 100).toFixed(2)); line.setAttribute('y2', (remap(pb.y) * 100).toFixed(2))
      line.setAttribute('stroke', hsla(hue, 40, 70, A(0.35, fill)))
      line.setAttribute('stroke-width', '0.6')
      line.setAttribute('vector-effect', 'non-scaling-stroke')
      svg.appendChild(line)
    })
```

Leave everything else in the branch (the `MARGIN`/`remap` setup, the `SET.points.forEach(...)` star-drawing block, the `f.appendChild(svg)` at the end) untouched. Update the branch's header comment: the line "PASS criterion (protocol, frozen before first render): 'a fresh viewer names this as stars connected by lines / a constellation' — not a plain star cluster..." must change to match the new frozen sentence above (dots only, no "connected by lines" wording since that's no longer true).

- [ ] **Step 2: Add Orion's sword**

In the same file, find the `orion` entry inside `CONSTELLATIONS`. Its `points` array currently has 7 entries (Betelgeuse, Bellatrix, Alnitak, Alnilam, Mintaka, Saiph, Rigel — shoulders, belt, feet) and no sword. Add three more points hanging below the belt's center star (Alnilam, at `x: 0.50, y: 0.50`), fainter than the named bright stars per the file's own `mag` convention (0-1, brighter = higher):

```js
      { x: 0.48, y: 0.60, mag: 0.55 }, // sword, upper
      { x: 0.50, y: 0.67, mag: 0.6 },  // sword, middle (Orion Nebula region)
      { x: 0.52, y: 0.74, mag: 0.55 }, // sword, lower
```

Since edges are removed entirely (Step 1), no corresponding `edges` entries are needed for the new points — `orion.edges` can stay as-is (it's now unused by the render path but still validated by any existing test asserting its shape; leave the array in place rather than deleting it, in case another part of the codebase reads it for something other than rendering — grep for `.edges` usage across the repo before deleting anything, don't assume it's render-only).

- [ ] **Step 3: Write a test confirming lines are gone and Orion has its sword**

Create `client/src/lib/ringPrimitives.constellation.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderPrim } from './ringPrimitives.js' // adjust to the file's real exported render entry point — read the file's exports before writing this import; makePrim itself may not be exported, there may be a public wrapper. If makePrim truly isn't exported anywhere, export it (named export, no behavior change) rather than reaching into internals a different way.

function svgFor(variant) {
  const container = document.createElement('div')
  const node = renderPrim(container.appendChild.bind(container), 'constellation', 200, 200, 210, 0.5, () => 0.5, false, 1, variant)
  return container.querySelector('svg')
}

describe('constellation primitive — dots only, per Ben\'s 2026-09-24 direction', () => {
  it('renders no <line> elements for any of the four variants', () => {
    for (const variant of ['bigDipper', 'orion', 'cassiopeia', 'southernCross']) {
      const svg = svgFor(variant)
      expect(svg.querySelectorAll('line')).toHaveLength(0)
    }
  })

  it('still renders one star (a glow + core circle pair) per point', () => {
    const svg = svgFor('bigDipper')
    // 7 points for Big Dipper -> 7 glow circles + 7 core circles = 14
    expect(svg.querySelectorAll('circle')).toHaveLength(14)
  })

  it('orion has 10 points now (7 original + 3 sword), not 7', () => {
    const svg = svgFor('orion')
    expect(svg.querySelectorAll('circle')).toHaveLength(20) // 10 points * 2 circles each
  })
})
```

**Before running this**, read `client/src/lib/ringPrimitives.js`'s actual export list (`grep -n "^export" client/src/lib/ringPrimitives.js`) — the test above assumes a `renderPrim`/`makePrim`-shaped export exists or can be added as a thin, behavior-preserving named export. If the real call signature or export name differs from this sketch, use the real one; the point of the test (no `<line>` elements, correct point count via circle count) is what matters, not the exact harness shown here.

- [ ] **Step 4: Run the test to verify it fails, then passes after Steps 1-2**

Run: `npm run test:unit -- ringPrimitives.constellation`
Expected before Steps 1-2 (if written first, TDD-style): FAIL on the line-count assertion (existing code still draws edges) and the Orion point count (still 7, not 10). After Steps 1-2: PASS, all 3 tests. (Doing Steps 1-2 before writing the test is also fine, given the change is small and mechanical — either order, but report which you did.)

- [ ] **Step 5: Self-render check — screenshot all four**

Reuse the project's own `concepts/world-07-ring.html` reference build and its `window.__world.jumpTo(index)` + `document.getAnimations().forEach(a => {a.pause(); a.currentTime = 0})` freeze pattern (same pattern `concepts/tools/ring-verify.mjs`'s `freezeFrame` uses, and the same pattern already used earlier this session to screenshot the 5 existing radial-mass stations). The cleanest path: use `concepts/world-07-ring.html`'s `?stations=` query param support (added by the 2026-09-14 shelf-stations plan, read `client/src/lib/drawWorld.js`'s `worldFromParams` if you need to confirm the param format) to substitute each constellation candidate into a visible slot, or — if that's more friction than it's worth — write a small throwaway Playwright script (same shape as any `concepts/tools/*.mjs` screenshot tool) that imports `makePrim`/the render entry point directly and rasterizes each of the 4 variants in isolation at a representative size (e.g. 300×200, matching a typical headline box). Either approach is fine; the requirement is a real rendered PNG per variant, not a description of what the code should produce.

Save the four screenshots and describe, in your report, what you actually see in each — do not write "looks good," describe the silhouette (e.g. "Big Dipper reads as a hooked chain of 7 dots, brightest at both ends, no lines connecting them"). This is evidence for Ben's own look, not a self-certification — do not claim the frozen pass criterion is met; report what's rendered and let Ben judge it.

- [ ] **Step 6: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/ringPrimitives.js client/src/lib/ringPrimitives.constellation.test.js
git commit -m "feat(ring): constellation primitive — dots only (no connecting lines), add Orion's sword"
```

---

### Task 3: Wormhole primitive

**Files:**
- Modify: `client/src/lib/ringPrimitives.js`
- Test: `client/src/lib/ringPrimitives.wormhole.test.js` (new)

**Interfaces:**
- Consumes: `lerp` (already imported from `./ringEngine.js` at the top of `ringPrimitives.js`), `hsla`/`A`/`px` (this file's existing color/unit helpers — confirm their exact names by reading a neighboring branch, e.g. the `ring` branch, before using them).
- Produces: a new `wormhole` kind in the `makePrim` dispatch chain.

**Frozen pass criterion (write before rendering):** *"a fresh viewer names this as a wormhole / a tunnel in space — not a target, not a bullseye, not a plain ring."*

- [ ] **Step 1: Add the `wormhole` branch**

In `client/src/lib/ringPrimitives.js`, add a new `else if (kind === 'wormhole')` branch to the `makePrim` dispatch chain (alongside the other Phase-4 pool-noun branches — search for `else if (kind === 'constellation')` and add this either immediately before or after it):

```js
  else if (kind === 'wormhole') {
    // NEW pool candidate (docs/superpowers/plans/2026-09-24-ring-world-
    // six-new-objects.md). Iconic per OBJECT-RENDERING-PROTOCOL.md's noun
    // test: several concentric ellipses, shrinking and brightening toward
    // an off-center focal point, reading as a tunnel receding into the
    // frame. Reuses this file's existing elliptical-stroke construction
    // (see the 'ring' branch above) rather than inventing new SVG
    // mechanics — no fill, no back/front split needed (nothing occludes
    // a wormhole the way a planet's body occludes its own ring).
    // PASS criterion (protocol, frozen before first render): "a fresh
    // viewer names this as a wormhole / a tunnel in space" — not a
    // target, not a bullseye, not a plain ring.
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.style.position = 'absolute'; svg.style.inset = '0'
    svg.style.width = '100%'; svg.style.height = '100%'
    const RINGS = 5
    // Off-center on purpose — a dead-centered set of concentric circles
    // reads as a target/bullseye, not a tunnel receding into the frame.
    const focalX = w * 0.42, focalY = h * 0.5
    for (let i = 0; i < RINGS; i++) {
      const t = i / (RINGS - 1) // 0 = outer/dimmest, 1 = inner/brightest
      const rx = lerp(w * 0.46, w * 0.08, t)
      const ry = rx * 0.62
      const ring = document.createElementNS(NS, 'ellipse')
      ring.setAttribute('cx', focalX.toFixed(1)); ring.setAttribute('cy', focalY.toFixed(1))
      ring.setAttribute('rx', rx.toFixed(1)); ring.setAttribute('ry', ry.toFixed(1))
      ring.setAttribute('fill', 'none')
      ring.setAttribute('stroke', hsla(hue, 55, lerp(55, 92, t), A(lerp(0.30, 0.85, t), fill)))
      ring.setAttribute('stroke-width', px(lerp(w * 0.010, w * 0.018, t)))
      ring.setAttribute('vector-effect', 'non-scaling-stroke')
      svg.appendChild(ring)
    }
    f.appendChild(svg)
  }
```

Before pasting this in, read the `ring` branch immediately above (search `else if (kind === 'ring')`) and confirm `hsla`, `A`, and `px` are called with the same argument order this snippet assumes (`hsla(hue, saturation, lightness, alpha)`, `A(baseAlpha, fill)`, `px(number)`) — they should be, since this file uses them the same way throughout, but confirm rather than assume, and fix the snippet's calls if the real signatures differ.

- [ ] **Step 2: Write a test confirming the shape**

Create `client/src/lib/ringPrimitives.wormhole.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderPrim } from './ringPrimitives.js' // same note as Task 2 Step 3 — use the file's real render entry point

describe('wormhole primitive', () => {
  it('renders 5 concentric ellipses, no fill, shrinking toward the center', () => {
    const container = document.createElement('div')
    renderPrim(container.appendChild.bind(container), 'wormhole', 200, 130, 230, 0.5, () => 0.5, false, 1)
    const svg = container.querySelector('svg')
    const ellipses = [...svg.querySelectorAll('ellipse')]
    expect(ellipses).toHaveLength(5)
    ellipses.forEach(e => expect(e.getAttribute('fill')).toBe('none'))
    const radii = ellipses.map(e => parseFloat(e.getAttribute('rx')))
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThan(radii[i - 1])
  })

  it('is off-center, not a dead-centered bullseye', () => {
    const container = document.createElement('div')
    renderPrim(container.appendChild.bind(container), 'wormhole', 200, 130, 230, 0.5, () => 0.5, false, 1)
    const svg = container.querySelector('svg')
    const cx = parseFloat(svg.querySelector('ellipse').getAttribute('cx'))
    expect(cx).not.toBeCloseTo(100, 0) // 200-wide box, dead center would be cx=100
  })
})
```

- [ ] **Step 3: Run the test to verify it fails, then passes**

Run: `npm run test:unit -- ringPrimitives.wormhole`
Expected: FAIL before Step 1 (`kind === 'wormhole'` matches no branch, nothing rendered), PASS after.

- [ ] **Step 4: Self-render check**

Same approach as Task 2 Step 5 — a real rendered PNG of the wormhole in isolation (and, if practical in the same pass, wired into a preview slot via `?stations=` the way Task 2 did). Describe what's actually rendered: ring count, whether the "tunnel" read comes through or it looks like a target — if it reads as a bullseye rather than a tunnel, that's useful information to report, not something to silently tune away without saying so.

- [ ] **Step 5: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/ringPrimitives.js client/src/lib/ringPrimitives.wormhole.test.js
git commit -m "feat(ring): add wormhole primitive — concentric rings, off-center focal point"
```

---

### Task 4: Dark nebula primitive (higher design risk — read the Global Constraints note on this before starting)

**Files:**
- Modify: `client/src/lib/ringPrimitives.js`
- Test: `client/src/lib/ringPrimitives.darkNebula.test.js` (new)

**Interfaces:**
- Consumes: same helpers as Task 3.
- Produces: a new `darkNebula` kind.

**Frozen pass criterion (write before rendering):** *"a fresh viewer names this as a dark cloud / a shadow in the stars — not a hole, not a black circle, not a rendering glitch."*

**Read before starting:** `concepts/ART-DIRECTION-SPEC.md` §6.1 (the hard-edge rim rule — ≥4px, contrast ≥ local background + 40, confirm the exact current numbers rather than trusting this paraphrase) and §7.2 (the occluder-on-quiet-station ban). This plan's Global Constraints section already explains why the placement half of §7.2 is a flagged, not solved, risk here — the rim requirement below is the part this task CAN and must satisfy.

- [ ] **Step 1: Add the `darkNebula` branch**

```js
  else if (kind === 'darkNebula') {
    // NEW pool candidate (docs/superpowers/plans/2026-09-24-ring-world-
    // six-new-objects.md). Iconic per OBJECT-RENDERING-PROTOCOL.md's noun
    // test: an irregular dark polygon with a soft blurred edge, occluding
    // the stars behind it — the anatomical opposite of this file's
    // 'nebulaCloud' branch (which emits light; this absorbs it).
    // Deliberately a FIXED 7-point polygon, not a per-instance randomized
    // contour — a randomized silhouette risks drifting toward a
    // recognizable figure across different seeds/instances, which would
    // tip this into figurative/reference-trace territory per the noun
    // test (see OBJECT-RENDERING-PROTOCOL.md). Stays iconic by staying
    // fixed and simple.
    // Mandatory hard-edge rim (ART-DIRECTION-SPEC.md §6.1) — NOT optional,
    // this shape exists specifically to satisfy it: a dark fill with no
    // bright edge can vanish entirely against dark sky. Verify the
    // rendered stroke width actually meets the spec's real px/contrast
    // numbers at this station's typical render scale during the self-
    // render check in Step 4 — the stroke-width value below is a starting
    // point, not a verified-correct final number.
    // Occluder placement (ART-DIRECTION-SPEC.md §7.2): this primitive
    // cannot enforce "not in a bottom-third-loudness slot" itself —
    // loudness is a property of the SLOT a draw places this in, not the
    // noun's own data. The certification pipeline (palette-sweep.mjs
    // --world-batch, the real ring-verify.mjs gate) is the actual
    // backstop — flagged in this plan's Global Constraints, not solved
    // here.
    // PASS criterion (protocol, frozen before first render): "a fresh
    // viewer names this as a dark cloud / a shadow in the stars" — not a
    // hole, not a black circle, not a glitch.
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', '0 0 100 100')
    svg.style.position = 'absolute'; svg.style.inset = '0'
    svg.style.width = '100%'; svg.style.height = '100%'
    const PTS = [[50, 10], [78, 22], [92, 48], [80, 76], [50, 92], [22, 74], [10, 44]]
    const d = 'M ' + PTS.map(([x, y]) => `${x},${y}`).join(' L ') + ' Z'
    const blob = document.createElementNS(NS, 'path')
    blob.setAttribute('d', d)
    blob.setAttribute('fill', hsla(hue, 30, 6, A(0.92, fill)))
    blob.style.filter = 'blur(3px)'
    svg.appendChild(blob)
    const rim = document.createElementNS(NS, 'path')
    rim.setAttribute('d', d)
    rim.setAttribute('fill', 'none')
    rim.setAttribute('stroke', hsla(hue, 45, 78, A(0.55, fill)))
    rim.setAttribute('stroke-width', '2.2')
    svg.appendChild(rim)
    f.appendChild(svg)
  }
```

- [ ] **Step 2: Write a test confirming the shape and the mandatory rim**

Create `client/src/lib/ringPrimitives.darkNebula.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderPrim } from './ringPrimitives.js' // same note as Task 2 Step 3

describe('dark nebula primitive', () => {
  it('renders a dark filled blob plus a separate bright rim stroke — the rim is not optional', () => {
    const container = document.createElement('div')
    renderPrim(container.appendChild.bind(container), 'darkNebula', 200, 200, 265, 0.5, () => 0.5, false, 1)
    const svg = container.querySelector('svg')
    const paths = [...svg.querySelectorAll('path')]
    expect(paths).toHaveLength(2)
    const [blob, rim] = paths
    expect(blob.getAttribute('fill')).not.toBe('none') // the dark body
    expect(rim.getAttribute('fill')).toBe('none') // the rim is stroke-only
    expect(rim.getAttribute('stroke')).toBeTruthy()
    expect(parseFloat(rim.getAttribute('stroke-width'))).toBeGreaterThan(0)
  })

  it('the fill is genuinely dark (low lightness), not a bright/glowing mass', () => {
    const container = document.createElement('div')
    renderPrim(container.appendChild.bind(container), 'darkNebula', 200, 200, 265, 0.5, () => 0.5, false, 1)
    const fillAttr = container.querySelector('path').getAttribute('fill')
    // hsla(hue, sat, lightness, alpha) — extract lightness, confirm it's low
    const lightness = parseInt(fillAttr.match(/,\s*(\d+)%/g)?.[1] ?? '999', 10)
    expect(lightness).toBeLessThan(20)
  })
})
```

Adjust the lightness-extraction regex in the second test if this file's `hsla` helper doesn't literally emit a CSS `hsla(...)` string with `%` signs — read the helper first and match its real output format.

- [ ] **Step 3: Run the test to verify it fails, then passes**

Run: `npm run test:unit -- ringPrimitives.darkNebula`
Expected: FAIL before Step 1, PASS after.

- [ ] **Step 4: Self-render check — including the rim contrast verification**

Same rendering approach as Tasks 2-3. In addition to describing the silhouette, actually measure the rendered rim's contrast against a representative dark-sky background (sample pixel values from the screenshot, or read them via a headless canvas/Playwright `page.evaluate` pixel read — same tool category `concepts/tools/safebox-scrim-test.mjs`/`ringPrimitives.js`'s own contrast-adjacent helpers already use elsewhere in this repo) and report the actual number against the ≥40-contrast, ≥4px rim requirement from `ART-DIRECTION-SPEC.md` §6.1. If it falls short, adjust the rim's `stroke-width`/lightness/alpha and re-measure — this is the one number in this whole plan that must be verified against the real spec threshold, not eyeballed.

- [ ] **Step 5: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/ringPrimitives.js client/src/lib/ringPrimitives.darkNebula.test.js
git commit -m "feat(ring): add dark nebula primitive — occluding blob with mandatory hard-edge rim"
```

---

## Self-Review

**Spec coverage:** all 6 candidates from Ben's brainstorming decision are covered — 4 constellations (Task 2, finishing already-shipped-but-unwired code), wormhole (Task 3, new), dark nebula (Task 4, new, flagged risk). The pool-architecture root cause (Task 1) is what actually makes "Re-roll objects" work, not just adds art — confirmed by reading `ringDraw.js`'s real selection algorithm, not assumed. No connecting lines (Ben's explicit correction) — Task 2 removes the existing line-drawing code. Full Orion, not just the belt (Ben's second correction) — Task 2 adds the sword points.

**Placeholder scan:** the `renderPrim` import in Tasks 2-4's test files is flagged explicitly as needing verification against the file's real exports rather than assumed — that's a stated uncertainty with clear instructions to resolve it (read the file, use the real name), not a vague placeholder like "add appropriate tests."

**Type consistency:** `CANDIDATE_STATIONS` (Task 1) is consumed by `RING_POOL` (Task 1) and by the constellation `variant` lookups (Task 2, via the existing `CONSTELLATIONS[variant]` dispatch — no new interface needed there, already wired). `prim: 'wormhole'`/`prim: 'darkNebula'` in Task 1's candidate data match the exact `kind === 'wormhole'`/`kind === 'darkNebula'` string checks Tasks 3-4 add to `makePrim`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-24-ring-world-six-new-objects.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
