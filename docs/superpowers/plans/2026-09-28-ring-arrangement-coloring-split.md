# Ring Arrangement/Coloring Split + Color-Evolution Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split ring-world "arrangement" (which 13 stations sit where) from "coloring" (what color each renders) into two independent per-show choices, wire the dormant color-evolution system (`EvolvingRingAmbient.jsx`) into the live render path for the first time, fix a real cross-color hue-collapse bug in the drift algorithm, and add host UI for both new choices — all shipped OFF by default.

**Architecture:** Extract arrangement resolution out of `ringWorldFor.js` into a shared function both the existing worldPalette path and the new color-evolution path call, instead of color-evolution duplicating the resolution logic hardcoded to the fixed order (the exact duplication shape that caused gap-C). Fix `weightedPalette.js`'s `driftPlan`/`derivePalette` so two colors in a palette can never drift into each other. Wire `ParticleBackground.jsx` and `WarpTransition.jsx` to branch on a new `theme.colorEvolution` flag. Add host UI. Re-certify the shelf under a version bump.

**Tech Stack:** React 18, Vite, Supabase, Playwright (via `concepts/tools/ring-verify.mjs`/`palette-sweep.mjs`), vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-ring-arrangement-coloring-split-design.md`

## Global Constraints

- `theme.colorEvolution` defaults to unset/false for every show. Zero behavior change for any show live today.
- This plan ships the feature **code-complete but not enabled** — no task in this plan sets `colorEvolution: true` on any real show's `theme_overrides`. Turning it on per-show is Ben's call, made later, by hand, after a live review (STAYS-HUMAN, `references/ring-world-continuity.md` §4).
- The `resolveArrangement` extraction (Task 1) must not change `ringWorldFor`'s output for any existing input. The full existing `ringWorldFor.test.js` suite passing UNCHANGED is the acceptance bar — this is a refactor, not a behavior change, for every non-duo path.
- GPU-only animation / reduced-motion / safe-box rules (SKILL.md Critical Rules 2, 3, 6) apply to any new render code.
- Every task ends by running `npx vitest run` (full suite) and confirming no new failures, in addition to its own scoped tests.

---

### Task 1: Extract `resolveArrangement` from `ringWorldFor.js`

**Files:**
- Modify: `client/src/lib/ringWorldFor.js`
- Test: `client/src/lib/ringWorldFor.test.js`

**Interfaces:**
- Produces: `export function resolveArrangement(theme, showId)` — returns a ring-world object (`{...base, stations}`) with arrangement resolved (fixed authored order, a saved `ringWorld`, or a per-show draw) and **no coloring applied** — `stations[i].hue` is each station's own authored hue, unchanged. Returns `undefined` if `theme.id` has no registered `RING_WORLDS` entry. Never throws (matches every other tier in this file).
- Consumes: nothing new — same `RING_POOL`, `resolveStations`, `drawStations`, `RING_VERSION`, `seedFrom`, `hash32` already imported in this file.

- [ ] **Step 1: Write the failing tests**

Add to `client/src/lib/ringWorldFor.test.js`:

```js
import { resolveArrangement } from './ringWorldFor.js'

describe('resolveArrangement', () => {
  it('returns the fixed authored order when no showId and no ringWorld', () => {
    const arrangement = resolveArrangement(BASE_THEME, undefined)
    expect(arrangement.stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
    expect(arrangement.stations.map(s => s.hue)).toEqual(midnightGalaxyRing.stations.map(s => s.hue))
  })

  it('draws a per-show arrangement when showId is set and no worldPalette', () => {
    const arrangement = resolveArrangement(BASE_THEME, 'show_arrangement_test')
    expect(arrangement.stations.map(s => s.key)).not.toEqual(AUTHORED_KEYS)
    expect(new Set(arrangement.stations.map(s => s.key)).size).toBe(AUTHORED_KEYS.length)
  })

  it('stays on the fixed order when a worldPalette is set, even with a showId', () => {
    const theme = { ...BASE_THEME, worldPalette: { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35] } }
    const arrangement = resolveArrangement(theme, 'show_arrangement_test_2')
    expect(arrangement.stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
  })

  it('returns the SAME arrangement resolveArrangement produces, for the equivalent ringWorldFor call — no divergence between the two functions', () => {
    const showId = 'show_arrangement_parity'
    const arrangement = resolveArrangement(BASE_THEME, showId)
    const full = ringWorldFor(BASE_THEME, showId)
    expect(full.stations.map(s => s.key)).toEqual(arrangement.stations.map(s => s.key))
  })
})
```

(`AUTHORED_KEYS`, `BASE_THEME`, `midnightGalaxyRing` import already exist in this test file per the current gap-C tests — reuse them, don't redeclare.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/lib/ringWorldFor.test.js`
Expected: FAIL — `resolveArrangement` is not exported yet.

- [ ] **Step 3: Extract the function and rewrite `ringWorldFor`**

In `client/src/lib/ringWorldFor.js`, add the new export (place it right after `autoDrawWorld`, before `ringWorldFor`):

```js
// Resolves ONLY the station arrangement (fixed authored order, a saved
// ringWorld, or a per-show draw) — no coloring applied. Both the ordinary
// worldPalette path (ringWorldFor, below) and the color-evolution path
// (EvolvingRingAmbient.jsx) call this so there is exactly one place that
// decides "which stations, in what order" — sharing it instead of a second
// copy is what gap-C's own root cause (two places deciding the same thing)
// argues for.
export function resolveArrangement(theme, showId) {
  const base = RING_WORLDS[theme.id]
  if (!base) return base

  if (theme.ringWorld && theme.ringWorld.ringVersion === RING_VERSION) {
    try {
      const stations = resolveStations(RING_POOL, theme.ringWorld.stations)
      if (stations.length !== base.stations.length) {
        throw new Error(`resolveArrangement: expected ${base.stations.length} stations, got ${stations.length}`)
      }
      if (new Set(stations.map(s => s.key)).size !== stations.length) {
        throw new Error('resolveArrangement: duplicate station keys in a resolved ringWorld')
      }
      return { ...base, stations }
    } catch (err) {
      console.warn('[ring] bad ringWorld arrangement, falling back:', err.message)
      return base
    }
  }

  if (showId && !theme.worldPalette) {
    return autoDrawWorld(base, showId)
  }

  return base
}
```

Now rewrite `ringWorldFor` to call it instead of duplicating the arrangement logic:

```js
export function ringWorldFor(theme, showId) {
  const base = RING_WORLDS[theme.id]
  if (!base) return base

  if (theme.ringWorld && theme.ringWorld.ringVersion === RING_VERSION) {
    const key = theme.id + '|world|' + JSON.stringify(theme.ringWorld)
    if (!worldCache.has(key)) {
      const arrangement = resolveArrangement(theme, showId)
      try {
        worldCache.set(key, recolorWorld(arrangement, theme.ringWorld.palette, getTheme(theme.id)))
      } catch (err) {
        console.warn('[ring] bad ringWorld, falling back:', err.message)
        worldCache.set(key, paletteOnly(theme, base) ?? base)
      }
    }
    return worldCache.get(key)
  }

  if (showId && !theme.worldPalette) {
    const key = theme.id + '|autodraw|' + showId
    if (!worldCache.has(key)) {
      worldCache.set(key, autoDrawWorld(base, showId))
    }
    return worldCache.get(key)
  }

  return paletteOnly(theme, base) ?? base
}
```

Note: the `theme.ringWorld` branch's error handling changes shape slightly — `resolveArrangement` itself already falls back to `base` on a bad saved arrangement (with its own console.warn), so `recolorWorld` is the only thing left that can throw in that branch now (a bad `theme.ringWorld.palette`). This is intentional — `resolveArrangement`'s own try/catch absorbs the arrangement-specific failure modes so `ringWorldFor` doesn't need to re-check `stations.length`/duplicate-keys itself. Verify this against Step 4 before assuming it's equivalent — if any existing test in `ringWorldFor.test.js` covering a malformed `theme.ringWorld.stations` now fails, that test's setup crosses into `resolveArrangement`'s territory and its expectation is still correct (falls back to `paletteOnly(theme, base) ?? base` either way, via a different code path) — fix the test's assertion only if it was asserting on the internal error message text, not on the final output.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: PASS, same file/test counts as the pre-task baseline (72 files / 995 tests) plus the 4 new tests in Step 1.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/ringWorldFor.js client/src/lib/ringWorldFor.test.js
git commit -m "refactor(ring): extract resolveArrangement so arrangement and coloring can vary independently"
```

---

### Task 2: Fix cross-color hue collapse under drift

**Files:**
- Modify: `client/src/lib/weightedPalette.js`
- Test: `client/src/lib/weightedPalette.test.js`

**Interfaces:**
- Produces: `derivePalette`'s output no longer lets two colors in the same palette drift within 20° of each other at any station. `driftPlan`'s own signature and per-color dead-band behavior are UNCHANGED — the fix is additive, in a new function, not a rewrite of `driftPlan`.
- Consumes: `hueDelta` (already exported in this file), `driftPlan` (already exported).

**Background (verified 2026-09-28, not assumed):** `derivePalette` computes each color's drift plan independently via `driftPlan(anchorDeg, drift.arc)`, which only keeps a color away from `DEAD_BAND` — nothing checks that two colors in the same palette stay apart from EACH OTHER. Confirmed live against the current 17 `DUO_PALETTES` entries: 7 of them (`purple_blue`, `amazon_dusk`, `mint_drift`, `turquoise_bloom`, `cyan_mirage`, `spring_lilac`, `ice_violet`) drop below 15° hue separation somewhere in their drift cycle — effectively invisible as a two-color duo at that station for part of the night.

- [ ] **Step 1: Write the failing test**

Add to `client/src/lib/weightedPalette.test.js`:

```js
import { derivePalette, hueDelta, hexToHslHue } from './weightedPalette.js'

describe('derivePalette — cross-color drift separation', () => {
  const COLLAPSING_DUOS = [
    { name: 'purple_blue', colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35], arc: 60 },
    { name: 'amazon_dusk', colors: ['#166534', '#7c3aed'], weights: [0.55, 0.45], arc: 60 },
    { name: 'mint_drift', colors: ['#63e4a3', '#5134f9'], weights: [0.688, 0.312], arc: 79 },
    { name: 'turquoise_bloom', colors: ['#2bdeb6', '#8254ef'], weights: [0.664, 0.336], arc: 52 },
    { name: 'cyan_mirage', colors: ['#53f7e2', '#d24aed'], weights: [0.646, 0.354], arc: 75 },
    { name: 'spring_lilac', colors: ['#56f594', '#8659e9'], weights: [0.599, 0.401], arc: 85 },
    { name: 'ice_violet', colors: ['#39c1f5', '#8856f0'], weights: [0.599, 0.401], arc: 31 },
  ]

  it.each(COLLAPSING_DUOS)('$name never drops below 20deg separation across all 13 stations', ({ colors, weights, arc }) => {
    const result = derivePalette({ colors, weights, stationCount: 13, currentHues: [], drift: { arc } })
    // Group the 13 resolved hues by which of the 2 colors produced them
    // (assignment order isn't guaranteed contiguous, so re-derive per-station
    // color index the same way derivePalette itself would for a 2-color
    // palette is unnecessary here — instead assert directly on the
    // hueAnchorsAt output, which carries BOTH colors' rotated anchor at
    // every station regardless of assignment).
    for (const anchorsAtStation of result.hueAnchorsAt) {
      const [a, b] = anchorsAtStation
      expect(hueDelta(a.deg, b.deg)).toBeGreaterThanOrEqual(20)
    }
  })

  it('does not change output at all for a palette that never collapses (no scaling applied)', () => {
    const colors = ['#dc2626', '#eab308'] // crimson_gold — verified non-collapsing (minDelta 45deg @ arc 60)
    const weights = [0.6, 0.4]
    const result = derivePalette({ colors, weights, stationCount: 13, currentHues: [], drift: { arc: 60 } })
    for (const anchorsAtStation of result.hueAnchorsAt) {
      const [a, b] = anchorsAtStation
      expect(hueDelta(a.deg, b.deg)).toBeGreaterThan(20)
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/lib/weightedPalette.test.js`
Expected: FAIL on the 7 collapsing cases (real measured minDelta values run 0.1° to 13.1° — see spec background), PASS already on crimson_gold.

- [ ] **Step 3: Implement `safeDriftPlans`**

In `client/src/lib/weightedPalette.js`, add a new function right after `driftPlan` (do not modify `driftPlan` itself):

```js
// A palette's own dead-band safety (driftPlan, above) only keeps ONE colour
// away from the yellow band — nothing stops two colours in the SAME palette
// from drifting toward each other. Verified 2026-09-28: 7 of the 17 curated
// duos drop below 15deg apart somewhere in their drift cycle with driftPlan's
// independent per-colour plans. This scales every colour's plan down by the
// SAME factor (never up, never a direction change) until no pair comes
// within MIN_SEPARATION at any station — arcs only ever shrink, so each
// individual colour's own dead-band safety (driftPlan's own `room` cap) is
// untouched by construction.
const MIN_SEPARATION = 20 // degrees — 5deg of margin above the loosest observed collapse

export function safeDriftPlans(anchorsDeg, requestedArc, stationCount) {
  const basePlans = anchorsDeg.map(a => driftPlan(a, requestedArc))
  if (anchorsDeg.length < 2) return basePlans

  const hueAt = (plan, anchor, i) =>
    ((anchor + plan.dir * plan.arc * (1 - Math.cos(2 * Math.PI * i / stationCount)) / 2) % 360 + 360) % 360

  const minSeparation = (scale) => {
    let min = Infinity
    for (let i = 0; i < stationCount; i++) {
      const hues = basePlans.map((p, c) => hueAt({ ...p, arc: p.arc * scale }, anchorsDeg[c], i))
      for (let a = 0; a < hues.length; a++) {
        for (let b = a + 1; b < hues.length; b++) {
          const d = hueDelta(hues[a], hues[b])
          if (d < min) min = d
        }
      }
    }
    return min
  }

  if (minSeparation(1) >= MIN_SEPARATION) return basePlans

  let lo = 0, hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (minSeparation(mid) >= MIN_SEPARATION) lo = mid
    else hi = mid
  }
  return basePlans.map(p => ({ dir: p.dir, arc: p.arc * lo }))
}
```

Then in `derivePalette`, find this line (inside the function, after `anchors` is computed):

```js
  const plans = colors.map(hex => driftPlan(Math.round(hexToHslHue(hex)), drift.arc))
```

Replace it with:

```js
  const plans = safeDriftPlans(anchors.map(a => a.deg), drift.arc, stationCount)
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run client/src/lib/weightedPalette.test.js`
Expected: PASS, all cases including the pre-existing suite in this file (`safeDriftPlans` only changes output for palettes that were actually colliding — verify no pre-existing `derivePalette`/`driftPlan` test in this file broke).

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: PASS. Watch specifically for anything in `ringRecolor.test.js` or `ringWorldFor.test.js` that hardcodes an expected hue for a palette+drift combo — if one exists and asserts an exact hue for a palette this fix doesn't touch (only 7 specific duos are affected, no existing worldPalette preset happens to collide per the crimson_gold check above, but confirm none of the 9-11 `PRESETS` in `paletteGenerator.js` do either by running this suite and reading any failure, not by assuming).

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/weightedPalette.js client/src/lib/weightedPalette.test.js
git commit -m "fix(ring): prevent two drifting colours in the same palette from converging on each other"
```

---

### Task 3: Generalize `worldForDuo`/`EvolvingRingAmbient` to accept an arrangement

**Files:**
- Modify: `client/src/components/display/EvolvingRingAmbient.jsx`
- Test: `client/src/components/display/EvolvingRingAmbient.test.jsx` (add one new test only — existing tests must pass unchanged)

**Interfaces:**
- Produces: `EvolvingRingAmbient` accepts a new optional prop `arrangement` (default `midnightGalaxyRing`, so every existing call site — all 3 test files, `AmbientAudit.jsx` — keeps working byte-identical with no changes to them).
- Consumes: `resolveArrangement` is NOT imported here — this component stays a pure renderer of whatever arrangement it's handed, same "don't resolve, just render" split as `RingAmbient` itself.

- [ ] **Step 1: Write the failing test**

Add to `client/src/components/display/EvolvingRingAmbient.test.jsx`:

```js
import { drawStations } from '../../lib/ringDraw.js'
import { RING_POOL } from '../../worlds/ringPool.js'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'

it('recolors the arrangement it is given, not always the fixed authored order', async () => {
  const drawn = {
    ...midnightGalaxyRing,
    stations: drawStations(RING_POOL, { seed: 12345, slots: midnightGalaxyRing.stations.length, pinKey: 'eclipse', pinAt: 10 }),
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={1} arrangement={drawn} />) })
  // Station identity comes from arrangement — if the ring rendered the
  // authored order instead of `drawn`, this key ordering assertion fails.
  const stationEls = container.querySelectorAll('[data-station-key]')
  const renderedKeys = Array.from(stationEls).map(el => el.dataset.stationKey)
  expect(renderedKeys).toEqual(drawn.stations.map(s => s.key))
  root.unmount()
  container.remove()
})
```

Before trusting this test's assertion mechanics (`[data-station-key]`), check how the existing tests in this file assert station identity — reuse whatever selector/assertion pattern they already use instead of inventing a new one if `data-station-key` isn't real; adapt the assertion to match this file's established pattern.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/components/display/EvolvingRingAmbient.test.jsx`
Expected: FAIL — `arrangement` prop doesn't exist yet, component always renders `midnightGalaxyRing`.

- [ ] **Step 3: Implement**

In `EvolvingRingAmbient.jsx`:

```js
const duoWorldCache = new Map()
function worldForDuo(duoId, arrangement) {
  const key = duoId + '|' + arrangement.stations.map(s => s.key).join(',')
  if (!duoWorldCache.has(key)) {
    duoWorldCache.set(key, recolorWorld(arrangement, DUO_PALETTES[duoId], getTheme('midnight-galaxy')))
  }
  return duoWorldCache.get(key)
}
```

And in the default export:

```js
export default function EvolvingRingAmbient({ showId, slideIndex, arrangement = midnightGalaxyRing, stationOverride, showStationDebug, forceSnap }) {
```

Update every call to `worldForDuo(duo)` inside this file to `worldForDuo(duo, arrangement)` (there is exactly one call site, inside the `.map(duo => ...)` in the return JSX).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run client/src/components/display/EvolvingRingAmbient.test.jsx client/src/components/display/EvolvingRingAmbient.glide.test.jsx client/src/components/display/EvolvingRingAmbient.onscreen.test.jsx`
Expected: PASS — the 2 existing test files pass UNCHANGED (they never pass `arrangement`, so they get the default `midnightGalaxyRing`, byte-identical to before this task), plus the 1 new test.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: PASS, no new failures.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/display/EvolvingRingAmbient.jsx client/src/components/display/EvolvingRingAmbient.test.jsx
git commit -m "feat(ring): EvolvingRingAmbient recolors whatever arrangement it's given, not always the fixed order"
```

---

### Task 4: Add `colorEvolution` to `ThemeProvider.jsx`

**Files:**
- Modify: `client/src/components/shared/ThemeProvider.jsx`
- Test: `client/src/components/shared/ThemeProvider.test.jsx` (check this file exists first — `find client/src -iname 'ThemeProvider*test*'`; if it doesn't, add the test inline to whichever test file currently covers `applyOverrides`, found the same way)

**Interfaces:**
- Produces: `applyOverrides(baseTheme, overrides)` output gains `colorEvolution: overrides?.colorEvolution ?? undefined` — `undefined` for any show without it set, matching the existing `worldPalette`/`ringWorld` pattern exactly.

- [ ] **Step 1: Write the failing test**

Find the existing `applyOverrides` test(s) (search for `worldPalette` in whatever test file covers `ThemeProvider.jsx`'s `applyOverrides`) and add alongside them:

```js
it('applyOverrides carries colorEvolution through, undefined when absent', () => {
  const withFlag = applyOverrides(BASE_THEME, { colorEvolution: true })
  expect(withFlag.colorEvolution).toBe(true)
  const without = applyOverrides(BASE_THEME, {})
  expect(without.colorEvolution).toBeUndefined()
})
```

- [ ] **Step 2: Run to verify failure**

Run the relevant test file. Expected: FAIL — `colorEvolution` is `undefined` on the WITH case too, because the field isn't read from overrides yet.

- [ ] **Step 3: Implement**

In `ThemeProvider.jsx`, find:

```js
        worldPalette: overrides?.worldPalette ?? undefined,
        ringWorld: overrides?.ringWorld ?? undefined,
```

Add immediately after:

```js
        colorEvolution: overrides?.colorEvolution ?? undefined,
```

- [ ] **Step 4: Run to verify pass, then full suite**

Run the relevant test file, then `npx vitest run`. Expected: PASS throughout.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/shared/ThemeProvider.jsx
git add -u
git commit -m "feat(ring): thread theme.colorEvolution through applyOverrides"
```

---

### Task 5: Wire `ParticleBackground.jsx` to branch on `colorEvolution`

**Files:**
- Modify: `client/src/components/display/ParticleBackground.jsx`
- Test: `client/src/components/display/ParticleBackground.test.jsx` (find via `find client/src -iname 'ParticleBackground*test*'`; if none exists, create one covering only this branch — do not attempt to cover the whole file)

**Interfaces:**
- Consumes: `resolveArrangement` (Task 1), `EvolvingRingAmbient` (Task 3), `theme.colorEvolution` (Task 4).

- [ ] **Step 1: Write the failing test**

If `ParticleBackground.test.jsx` doesn't exist, create it with this one test (adapt the render/mount pattern to match how `EvolvingRingAmbient.test.jsx` mounts things — same project, same JSDOM setup):

```js
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import ParticleBackground from './ParticleBackground.jsx'
import { getTheme } from '../../themes/index.js'

it('renders EvolvingRingAmbient when theme.colorEvolution is set', async () => {
  const theme = { ...getTheme('midnight-galaxy'), id: 'midnight-galaxy', colorEvolution: true }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<ParticleBackground theme={theme} showId="show_pb_test" slideIndex={0} />)
  })
  expect(container.innerHTML).toContain('data-ring-role') // or whatever real marker EvolvingRingAmbient/RingAmbient's DOM carries — check the existing EvolvingRingAmbient tests for the real selector before finalizing this assertion
  root.unmount()
  container.remove()
})
```

Do not guess the DOM marker — read `EvolvingRingAmbient.test.jsx`'s own assertions (Task 3 already required checking this) and reuse the exact same real one here.

- [ ] **Step 2: Run to verify failure**

Run the new/updated test file. Expected: FAIL — `colorEvolution` isn't consulted by `ParticleBackground.jsx` yet.

- [ ] **Step 3: Implement**

In `ParticleBackground.jsx`, add the import:

```js
import EvolvingRingAmbient from './EvolvingRingAmbient.jsx'
import { RING_WORLDS, ringWorldFor, resolveArrangement } from '../../lib/ringWorldFor.js'
```

Replace the `ringWorldRef` block:

```js
  const ringWorldRef = useRef(null)
  if (ringWorldRef.current === null) {
    ringWorldRef.current = theme.colorEvolution
      ? { evolving: true, arrangement: resolveArrangement(theme, showId) }
      : (ringWorldFor(theme, showId) ?? false)
  }
  const ringWorld = ringWorldRef.current || null
```

Replace the render branch:

```jsx
          {gradientMood
            ? <BreathingGradient palette={theme.colors} mood={gradientMood} />
            : ringWorld?.evolving
              ? <EvolvingRingAmbient arrangement={ringWorld.arrangement} showId={showId} slideIndex={slideIndex} stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap} />
              : ringWorld
                ? <RingAmbient worldData={ringWorld} showId={showId} slideIndex={slideIndex} stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap} />
                : AmbientComponent && <AmbientComponent tint={tint} />}
```

(Both branches are inside the existing `<ErrorBoundary>` — do not restructure that wrapper, just the ternary inside it.)

- [ ] **Step 4: Run to verify pass, then full suite**

Run the test file, then `npx vitest run`. Expected: PASS throughout — every existing `ParticleBackground` behavior (no `colorEvolution` set) is byte-unchanged since `ringWorld?.evolving` is falsy for every existing show.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/display/ParticleBackground.jsx
git add -u
git commit -m "feat(ring): ParticleBackground renders EvolvingRingAmbient when a show opts into color evolution"
```

---

### Task 6: Wire `WarpTransition.jsx` for color-evolution

**Files:**
- Modify: `client/src/components/display/WarpTransition.jsx`
- Modify: `client/src/views/Display.jsx` (thread `slideIndex` to both `<WarpTransition>` mount points)
- Test: find via `find client/src -iname 'WarpTransition*test*'`; if none exists, create one scoped to only this new logic

**Interfaces:**
- Consumes: `outgoingAndIncomingDuo` (already exported from `client/src/lib/duoTransition.js`), `resolveArrangement` (Task 1), `DUO_PALETTES` (`client/src/lib/duoGraph.js`), `recolorWorld` (`client/src/lib/ringRecolor.js`).

- [ ] **Step 1: Confirm `slideIndex` availability at both `<WarpTransition>` mount points**

Read `client/src/views/Display.jsx` around lines 1139 and 1162 (the two `<WarpTransition` JSX call sites) and confirm a `slideIndex` value is already in scope there (it's computed once, around line 975/1889, for `PersistentRing`/`ParticleBackground`'s own props in the same component). If it's in scope under a different local variable name, use that name — do not recompute it a second way.

- [ ] **Step 2: Write the failing test**

```js
import { render } from '../test helpers as this project already uses' // match whatever WarpTransition or a sibling display test already imports for rendering
import WarpTransition from './WarpTransition.jsx'
import { ThemeProvider } from '../shared/ThemeProvider.jsx'

it('uses the current duo colors for its sky/tints when theme.colorEvolution is set', () => {
  // Render under a ThemeProvider with theme.colorEvolution=true and a
  // known showId/slideIndex, and confirm the canvas element's inline
  // `background` style (GROUND, set from world.sky) is NOT the authored
  // midnightGalaxyRing sky (i.e. it changed because a duo world was
  // consulted). Adapt exact assertion mechanics to how this project
  // already tests WarpTransition's GROUND/BANDS derivation, if any
  // existing test in this file does — reuse that pattern.
})
```

Write this test for real once Step 1's scan is done — if `WarpTransition.jsx` has zero existing tests, keep this first test minimal and concrete: render with `colorEvolution: true`, assert the canvas's `style.background` differs from a render with `colorEvolution` unset, both using the same `showId`/`slideIndex`.

- [ ] **Step 3: Run to verify failure**

Run the test file. Expected: FAIL — `WarpTransition.jsx` doesn't consult `colorEvolution` yet.

- [ ] **Step 4: Implement**

In `WarpTransition.jsx`, add the new imports:

```js
import { resolveArrangement } from '../../lib/ringWorldFor.js'
import { outgoingAndIncomingDuo } from '../../lib/duoTransition.js'
import { DUO_PALETTES, DUO_GRAPH } from '../../lib/duoGraph.js'
import { recolorWorld } from '../../lib/ringRecolor.js'
```

Add `slideIndex` to the component's props:

```js
export default function WarpTransition({ dir = 'out', onDone, durationMs = DURATION_MS, coverAt = COVER_AT, slideIndex }) {
```

Replace the `world` computation:

```js
  const world = useMemo(() => {
    if (theme.colorEvolution && Number.isInteger(slideIndex)) {
      const arrangement = resolveArrangement(theme, showId) ?? midnightGalaxyRing
      const { incoming } = outgoingAndIncomingDuo(showId, DUO_GRAPH, slideIndex)
      try {
        return recolorWorld(arrangement, DUO_PALETTES[incoming], getTheme(theme.id))
      } catch {
        return midnightGalaxyRing
      }
    }
    return ringWorldFor(theme, showId) ?? midnightGalaxyRing
  }, [theme, showId, slideIndex])
```

(`getTheme` is already imported in this file — check the top of `WarpTransition.jsx` before adding a duplicate import; if it isn't, add `import { getTheme } from '../../themes/index.js'`.)

- [ ] **Step 5: Thread `slideIndex` from `Display.jsx`**

At both `<WarpTransition` JSX call sites found in Step 1, add `slideIndex={<the in-scope variable found in Step 1>}` as a new prop.

- [ ] **Step 6: Run to verify pass, then full suite**

Run the test file, then `npx vitest run`. Expected: PASS — every existing call to `<WarpTransition>` without `theme.colorEvolution` set is byte-unchanged (the `useMemo`'s first branch never triggers).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/display/WarpTransition.jsx client/src/views/Display.jsx
git add -u
git commit -m "feat(ring): WarpTransition reads the current duo's colors under color evolution instead of the authored palette"
```

---

### Task 7: Host UI — arrangement picker + color picker

**Files:**
- Modify: `client/src/components/host/ThemePickerModal.jsx`
- Test: find via `find client/src -iname 'ThemePickerModal*test*'`; if none exists, this task's manual verification (Step 4 below) substitutes — do not invent a test harness for a component this size if the project has never tested it

**Interfaces:**
- Consumes: `WorldPaletteEditor`'s existing `onApplyThemeColors` callback shape (already in this file), `applyOverrides` (already imported).

- [ ] **Step 1: Read the current control flow**

Read `ThemePickerModal.jsx` in full around lines 89-150 and 300-320 (already partially seen this session: `overrides` state, `applyPaletteColors`, the `<WorldPaletteEditor onApplyThemeColors={applyPaletteColors}>` mount). Identify exactly where in the JSX the `<WorldPaletteEditor>` renders, since the two new pickers mount alongside it.

- [ ] **Step 2: Add the arrangement picker**

Add a small control (reuse this file's existing button/toggle styling — do not introduce a new UI pattern) offering "Fixed layout" / "Random draw", writing to `overrides.ringWorld` presence the same way the file already manages it: selecting "Fixed layout" should force `theme.ringWorld` to a definite fixed-order value OR simply ensure no draw happens — read `resolveArrangement`'s own logic (Task 1) again: with no `ringWorld` and no `worldPalette` and a `showId`, it auto-draws; with `worldPalette` set, it doesn't. So "Fixed layout" vs "Random draw" as a real independent toggle (not just a side effect of whether a palette happens to be set) needs its own overrides field — add `theme.forceFixedArrangement: true` (new boolean, undefined by default) and thread it into `resolveArrangement` (Task 1's function) as an additional early-return check:

```js
export function resolveArrangement(theme, showId) {
  const base = RING_WORLDS[theme.id]
  if (!base) return base
  if (theme.forceFixedArrangement) return base
  // ...rest unchanged
```

(This means Task 1's function gains one more line here — do it now, in this task, since the UI is what actually needs it; Task 1 itself didn't need to anticipate it.) Wire the picker to write `forceFixedArrangement: true/undefined` into `overrides` via the same write path `applyPaletteColors` uses.

- [ ] **Step 3: Add the color picker's third option**

The existing UI already offers "Authored colors" (default, no worldPalette) vs "Custom palette" (`WorldPaletteEditor`). Add a third: "Color evolution" — a button/toggle that, on select, writes `overrides.colorEvolution = true` AND clears `overrides.worldPalette`/`overrides.ringWorld` (mutual exclusion — read Task's Global Constraint: `ParticleBackground`'s branch checks `colorEvolution` FIRST, so a stale `worldPalette` sitting alongside it would be silently ignored, not an error, but confusing state to leave saved). Selecting "Custom palette" or "Authored colors" must clear `colorEvolution` for the same reason, symmetrically.

- [ ] **Step 4: Manual verification**

Run `npm run dev` (or this project's equivalent), open `/host`, load a show, open the Theme panel, and confirm: (a) both new controls render without errors, (b) selecting "Color evolution" then reloading `/display` for that show actually renders `EvolvingRingAmbient` (visually different ring color behavior from the authored default), (c) switching back to "Authored colors" and reloading `/display` shows the ring back to normal. Screenshot or describe what was seen in the task report — do not mark this task done on code-compiles-without-errors alone.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: PASS, no new failures.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/host/ThemePickerModal.jsx client/src/lib/ringWorldFor.js
git add -u
git commit -m "feat(ring): host UI for arrangement + color-evolution picking"
```

---

### Task 8: Fix-invalidated re-certification of the shelf

**Files:**
- Modify: `client/src/lib/ringCertification.js` (bump `RING_VERSION`)
- Modify: `concepts/tools/palette-sweep.mjs` (export `certifyPalette`, `sb`, `elevateIfNeeded`, `startServers`, `stopServers`)
- Create: `concepts/tools/certify-duos.mjs`

**Interfaces:**
- Consumes: `DUO_PALETTES` (`client/src/lib/duoGraph.js`), everything exported from Step 2 below.

**Context:** Task 2's fix changes `derivePalette`'s output for the 7 collapsing duos (same inputs, different — corrected — output), which means the shelf's existing certified rows for those 7 (and, by the project's own `RING_VERSION` contract, everything else on the shelf) certified the OLD algorithm's picture. Ben's explicit call (2026-09-28): bump `RING_VERSION` and re-sweep the whole shelf, not a narrow patch — keeps the "version = a fixed algorithm" contract honest instead of 7 rows silently meaning something different under the same version number as everything else.

- [ ] **Step 1: Bump `RING_VERSION`**

In `client/src/lib/ringCertification.js`, change the current value (confirm it via `grep RING_VERSION client/src/lib/ringCertification.js` first — do not assume the string without checking, it may have moved since this plan was written) to a new date-stamped value following the file's own existing convention (e.g. `'v1-2026-09-28'`).

- [ ] **Step 2: Export what `certify-duos.mjs` needs from `palette-sweep.mjs`**

In `concepts/tools/palette-sweep.mjs`, add `export` to: `certifyPalette`, `sb` (the module-level Supabase client), `elevateIfNeeded`, `startServers`, `stopServers`. Do not change their implementations — export only.

- [ ] **Step 3: Write `concepts/tools/certify-duos.mjs`**

```js
#!/usr/bin/env node
// certify-duos.mjs — re-certifies every DUO_PALETTES entry against the real
// Playwright gate under the CURRENT RING_VERSION. Run after any change to
// weightedPalette.js's drift algorithm or a RING_VERSION bump — duoGraph.js's
// own header comment requires every entry here to be a real certified shelf
// row, not just a plausible-looking one.
import { chromium } from 'playwright'
import { certifyPalette, sb, elevateIfNeeded, startServers, stopServers } from './palette-sweep.mjs'
import { DUO_PALETTES } from '../../client/src/lib/duoGraph.js'
import { RING_VERSION } from '../../client/src/lib/ringCertification.js'

async function main() {
  await elevateIfNeeded()
  await startServers()
  const browser = await chromium.launch()
  try {
    for (const [name, palette] of Object.entries(DUO_PALETTES)) {
      const { passed, summary } = await certifyPalette(browser, palette)
      const row = {
        colors: palette.colors, weights: palette.weights, drift: palette.drift, stations: null,
        status: 'pending', source: 'duo', seed: name, ring_version: RING_VERSION,
      }
      const { error: insErr } = await sb.from('ring_palettes')
        .upsert([row], { onConflict: 'source,seed,ring_version' })
      if (insErr) throw new Error(`certify-duos: upsert (pending) failed for ${name}: ${insErr.message}`)
      const { error: updErr } = await sb.from('ring_palettes')
        .update({ status: passed ? 'certified' : 'failed', gate_summary: summary, checked_at: new Date().toISOString() })
        .eq('source', 'duo').eq('seed', name).eq('ring_version', RING_VERSION)
      if (updErr) throw new Error(`certify-duos: status update failed for ${name}: ${updErr.message}`)
      console.log(`${name}: ${passed ? 'CERTIFIED' : 'FAILED'}${passed ? '' : ' — ' + summary.regression_fail_names.join(', ')}`)
    }
  } finally {
    await browser.close()
    await stopServers()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
```

Before finalizing: check the real column list and RLS insert/update policy on `ring_palettes` (`mcp__supabase__execute_sql` a `select column_name from information_schema.columns where table_name='ring_palettes'`, and re-read the two-step pending-then-update pattern already used in `runSeedBatch`/`runWorldBatch` in `palette-sweep.mjs`) — copy that exact pattern rather than trusting the sketch above verbatim if the real schema or RLS shape differs.

- [ ] **Step 4: Run it for real**

Run: `node concepts/tools/certify-duos.mjs`
Expected: all 17 duos print `CERTIFIED`. If any print `FAILED`, that duo's regression failure names are real information — do NOT silently retry or fudge the check. Stop and report which duo(s) failed and why (the actual `regression_fail_names` from the output) before proceeding to Step 5 — a duo that fails the real gate even after Task 2's collapse fix needs its own investigation, out of this task's scope to silently paper over.

- [ ] **Step 5: Repopulate the general shelf**

Run: `node concepts/tools/palette-sweep.mjs --seed-batch 27` (27 matches the prior generated-row count under the old version, confirmed via `select count(*) from ring_palettes where ring_version='<old version>' and source='generated'` before running — use the REAL prior count, not this plan's guess, if it differs).

- [ ] **Step 6: Verify live**

Run: `select ring_version, status, source, count(*) from ring_palettes where ring_version = '<new version>' group by 1,2,3 order by 1,2,3;` via `mcp__supabase__execute_sql` against project `qwtbgusqfoypvehnungr`. Confirm: 17 `source='duo'` rows, all `status='certified'`; the preset/generated counts roughly match what `--seed-batch 27` should have produced.

- [ ] **Step 7: Run full test suite + build**

Run: `npx vitest run` and `npm run build`. Expected: PASS / clean build (this task touches no app source beyond `ringCertification.js`'s version string, which nothing else in the suite hardcodes — confirm via the test run, not assumption).

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/ringCertification.js concepts/tools/palette-sweep.mjs concepts/tools/certify-duos.mjs
git commit -m "chore(ring): bump RING_VERSION and re-certify the shelf after the drift-collapse fix"
```

---

### Task 9: Real visual verification pass

**Files:** none modified — this task is verification only.

- [ ] **Step 1: Visual pass across both arrangement modes**

With the dev server running, open `/ambient?evolving=1&showId=show_verify_fixed` and `/ambient?evolving=1&showId=show_verify_drawn` (or whatever query params `AmbientAudit.jsx`'s evolving mode actually takes — confirm by reading it, this session already knows it exists per Task 3's context) — one exercising the fixed arrangement path, one exercising a drawn arrangement (requires `forceFixedArrangement` unset and no `worldPalette`, per Task 7's new field). Step through several slides in each, watching for: console errors, any bright object landing inside the safe box, any visibly "stuck" or non-transitioning duo.

- [ ] **Step 2: Confirm feature stays off**

Run `select id, theme_overrides->>'colorEvolution' as ce from shows where theme_overrides->>'colorEvolution' is not null;` via `mcp__supabase__execute_sql` against `qwtbgusqfoypvehnungr`. Expected: zero rows — this plan's own Global Constraint (no task in this plan turns the feature on for a real show).

- [ ] **Step 3: Report**

Summarize what was seen in Step 1 (plain language, per this project's working style) — confirmed clean, or specific issues found — as the final report for this plan. Do not mark this plan done on "the code compiles" alone; Step 1's actual visual pass is the acceptance bar per this project's `verification-before-completion` standing rule.
