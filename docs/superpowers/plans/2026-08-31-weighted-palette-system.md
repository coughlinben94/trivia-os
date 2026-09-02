# Weighted Palette System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Supersedes:** Task 3 ("Ring Station Color Editor" — a per-station hue slider) of [`2026-08-31-color-picking-rebuild.md`](./2026-08-31-color-picking-rebuild.md). That plan's Tasks 1–2 and its entire Investigation Summary still stand and are **not** duplicated here — read it for the theme-override pipeline trace (`shows.theme_overrides` → `ThemeProvider.applyOverrides()` → live `/display`), for why the ring's *sky* palette stays fixed, and for the `RingAmbient` isolated-preview opening this plan reuses. This document only records findings that are new since it was written.

**Why Task 3 is superseded:** it gave a host 13 hue sliders and asked them to be a colorist 13 times. Ben's refinement, verbatim: pick 2–3 colors, say what percentage of the world leans toward each, and let that one small palette drive the theme's background/accent *and* the direction the ring stations lean. His stated principle, twice: **"simplicity but controllability is key."**

**Goal:** One control — 2–3 color swatches and a draggable weight bar — that derives both a per-show theme color set (saves live, instantly, through the existing ungated pipeline) and a full 13-station ring hue assignment (produces a paste-ready source edit plus a mandatory `npm run verify:ring` step, never a live write).

**Architecture:** The core design decision is that **weights allocate, they do not blend.** Blending 3 weighted colors into an average is exactly the mud failure `AlbumGradientMesh.jsx` spent a week of tuning escaping ("an average of many colors structurally can't read as two colors colliding, it just trends toward one blended pastel" — that file's own header). So a 60/25/15 palette does not tint every station 60% purple; it gives 8 of 13 stations the purple hue, 3 the blue, 2 the orange, spread around the ring so no color clumps, with a small deterministic offset ladder inside each color's ±25° anchor window so same-color stations vary the way `comet 208°`/`binary pair 214°` already do today. Perceptual OKLab blending is used in exactly one place — deriving the near-black background field, where a weighted mean is genuinely the right operation and, at L≈0.06, mud is not physically reachable. One picker, two exits: the theme half saves instantly; the ring half is gated.

**Tech Stack:** React 18, Tailwind (UI); vitest (`npm run test:unit`) for the pure allocation math; Node/Playwright via `concepts/tools/ring-verify.mjs`, invoked and never modified. No new dependencies. No schema changes.

**Spec:** This document. The refined requirement came from a live back-and-forth with Ben tonight, recorded inline below rather than as a separate spec file.

## Global Constraints

- **STAYS HUMAN, no exceptions** (`references/ring-world-continuity.md` §4): choosing target metrics or thresholds; editing `ring-spec.lock.json`, `ring-verify.mjs`'s pass/fail logic, or any gate cap; typing an allowlist entry; interpreting a POISONED or ambiguous run; aesthetic acceptance. No task below writes to a lock file, runs an optimization loop against the gate, or auto-accepts a verify result on Ben's behalf.
- **Never move a threshold to make something pass. Report and stop.** (`ring-world-mistakes.md`, standing instruction.)
- **Render before you claim.** Label anything unrendered as unverified in the same message that delivers it.
- `npm run verify:ring` is literally `node concepts/tools/ring-verify.mjs concepts/world-07-ring.html`. **The gate reads the HTML file, not the React file.** A hue written only into `midnightGalaxy.ring.js` is a hue the gate never sees — it will happily certify the old colors. Every ring edit covers both files or it covers neither.
- Supabase is the only backend. No Socket.io, Express, or local file storage. The editor cannot write a source file from a deployed host session.
- Every write to `shows.theme_overrides` goes through `useShow.js`'s existing `actions.updateShowMeta({ themeOverrides })`. No second write path.
- `ThemeProvider.jsx`'s `applyOverrides()` is the single merge chokepoint for theme colors. Never hand-duplicate the merge or the contrast floor.
- Do not touch `ringEngine.js`'s `skyFromTheme()`. The ring's sky palette stays fixed (see the superseded plan's Investigation Part B.1).
- Do not touch `LiveScreen.jsx` or `StationRingLayer.jsx` — separate agent, separate worktree.

---

## New findings since the superseded plan (read these; they change its conclusions)

### 1. The ring is now mounted in production, and the gate now blocks shipping

`references/ring-world-mistakes.md`'s "Live state as of the 2026-08-09 handoff" says the ring gate is non-blocking in `scripts/ship.sh` **because `RingAmbient.jsx` is not mounted in production yet — this is still dev-only.** Both halves of that are stale as of tonight:

- `client/src/components/display/ParticleBackground.jsx:1167` declares `const RING_WORLDS = { 'midnight-galaxy': midnightGalaxyRing }` and line 1248 mounts `<RingAmbient worldData={ringWorld} …/>` for any show on that theme. The ring is live on the real `/display`.
- `scripts/ship.sh:77` now emits `SHIP_BLOCKED: ring-verify regression tier has structural-correctness failures`. Regression-tier failures block; spec-conformance-tier failures alone do not.

**Consequence for this plan:** a ring hue change is production-visible *and* can block every future ship, not just a ring ship. That is the single biggest input to the tonight-vs-later call in the Scope section.

**Flagged, not edited** — per `ring-world-mistakes.md`'s own process note ("flag it to Ben — don't silently drive-by-edit it"), that file's stale paragraph is left alone for Ben to correct.

### 2. Twelve of the thirteen new hue constants are dead code

`client/src/worlds/midnightGalaxy.ring.js` (uncommitted, today) hoists 13 named constants — `RINGED_PLANET_HUE` through `SUPERNOVA_HUE` — under a header comment claiming "Pure rename, no behavior change: every value is identical to what the station list already had."

The rename only landed on one station. Line 109 reads `hue: RECORD_HUE`; every other station still carries a literal (`hue: 256`, `hue: 170`, `hue: 268`, …). **Editing `RINGED_PLANET_HUE` today changes nothing on screen.** This is a live bug in uncommitted work, and it is also the exact seam this plan's output wants to write to, so Task 0 fixes it first.

### 3. The world has 13 stations, not 12

Ben's ask, this plan's original framing, and several project docs say "12 stations." The array has 13 entries, and `midnightGalaxy.ring.js:109`'s own comment reasons about `PANES=13`. Twelve is the number of *turns* to close the loop, not the number of stations. Every count in this plan is 13. Flagging rather than correcting the docs.

### 4. Hue is worth up to a 2.21× swing in rendered luminance, measured

`ringPrimitives.js` builds every station color as `hsla(hue, S, L, α)` with S ≈ 60–84 and L ≈ 54–90 — the hue is the only per-station variable; saturation and lightness are engine-authored. HSL lightness is `(max+min)/2`, which is *not* luminance, and `makePrim`'s own comment already knows this ("rose/magenta and similar hues are green-starved under Rec.709 luma at any alpha").

Measured at a representative `hsl(h, 72%, 62%)`, Rec.709 relative luminance across the current 13 stations:

| # | station | hue | luma |
|---|---------|-----|------|
| 0 | ringed planet | 256° | 106.3 |
| 1 | spiral galaxy | 170° | 196.5 |
| 2 | star cluster | 268° | 112.3 |
| 3 | amber planet | 28° | 164.6 |
| 4 | lit planet | 140° | 191.5 |
| 5 | pulsar | 120° | 188.1 |
| 6 | rose nebula | 330° | 123.0 |
| 7 | comet | 208° | 151.6 |
| 8 | binary pair | 214° | 141.7 |
| 9 | asteroid field | 160° | 194.8 |
| 10 | record | 300° | 128.1 |
| 11 | aurora ribbon | 196° | 171.6 |
| 12 | supernova | 36° | 177.9 |

Across the full hue circle at those fixed S/L: min 98.4 at 240°, max 217.8 at 60° — a **2.21× ratio**. The `safeBox` cap (mean ≤ 34, p99.5 ≤ 68) is a luminance cap. So "everything purple" and "everything yellow-green" are not equivalent asks to the gate, and a host dragging a weight bar has no way to know that. Task 1 turns this into a visible advisory. It does **not** turn it into a prediction of the verdict — see the honesty note in Task 1, Step 5.

### 5. `ring-verify.mjs` does not check hue anchors or silhouette-family spacing

Grepped: the gate has no hue-anchor conformance check and no family-spacing check. `hueAnchors` (spec §4, 1–3 anchors, ±25° windows) and "same silhouette family ≥3 stations apart" are prose rules living in the station array's own comments, enforced by humans.

Two consequences, one good and one bad:

- **Good, and it shrinks scope a lot:** silhouette-family spacing is a function of `prim` and station *order*, not hue. This plan rewrites only `hue` fields, in place, never reordering. Family spacing is therefore untouched by construction — there is nothing to re-derive and nothing to get wrong. The superseded plan worried about this; it turns out not to apply.
- **Bad:** because nothing mechanical checks hue anchors, a palette that scatters hues outside their windows fails silently and forever. Task 1's assignment algorithm enforces the window itself, in code, with a test.

---

## File structure

- **Create** `client/src/lib/weightedPalette.js` — all pure math: hex→hue, weight→station allocation, ring spreading, the offset ladder, theme color derivation, the luma proxy. No React, no DOM. One responsibility: palette in, assignment out.
- **Create** `client/src/lib/weightedPalette.test.js` — vitest. The invariants that must not silently break.
- **Create** `client/src/components/host/WorldPaletteEditor.jsx` — the swatches, the weight bar, the isolated `RingAmbient` preview, the paste-block output.
- **Modify** `client/src/worlds/midnightGalaxy.ring.js` — Task 0 only: wire the 12 dead constants.
- **Modify** `client/src/components/host/ThemePickerModal.jsx` — one entry-point button, Midnight Galaxy only.
- **Not modified by any task:** `RingAmbient.jsx`, `ringEngine.js`, `ringPrimitives.js`, `ParticleBackground.jsx`, `concepts/tools/ring-verify.mjs`, `concepts/tools/ring-spec.lock.json`, `scripts/ship.sh`, the Supabase schema.

---

## Task 0: Wire the 12 dead hue constants (bug fix, provably zero visual change)

**Why first:** finding 2 above. The constants exist but 12 of 13 stations ignore them. Every later task's output is "13 new constant values" — that output is worthless until the stations actually read the constants.

**Files:**
- Modify: `client/src/worlds/midnightGalaxy.ring.js:99-111`

**Interfaces:**
- Consumes: nothing.
- Produces: the invariant that `midnightGalaxyRing.stations[i].hue` is sourced from exactly one named constant per station. Tasks 3–4's paste-blocks depend on this.

- [ ] **Step 1: Capture the pre-change render as ground truth**

  ```bash
  cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
  node -e "import('./client/src/worlds/midnightGalaxy.ring.js').then(m => console.log(JSON.stringify(m.midnightGalaxyRing.stations.map(s => [s.key, s.hue]))))" > /tmp/hues-before.json
  cat /tmp/hues-before.json
  ```

  Expected: `[["ringed planet",256],["spiral galaxy",170],["star cluster",268],["amber planet",28],["lit planet",140],["pulsar",120],["rose nebula",330],["comet",208],["binary pair",214],["asteroid field",160],["record",300],["aurora ribbon",196],["supernova",36]]`

  If that import fails because the module pulls in `THEMES`/`skyFromTheme` under plain Node, run it through vitest instead — add the assertion in Step 3 and skip this step's file, using the table in finding 4 above as the reference values.

- [ ] **Step 2: Replace each station's hue literal with its constant**

  In the `stations:` array, change only the `hue:` value on each line. Leave every other field, and every trailing comment, byte-identical.

  ```js
  { key: 'ringed planet', prim: 'ring', hue: RINGED_PLANET_HUE, accent: false, maxDetail: 2 },
  { key: 'spiral galaxy', prim: 'lens', hue: SPIRAL_GALAXY_HUE, accent: false, companionKind: 'dots', maxDetail: 1 },
  { key: 'star cluster', prim: 'dots', hue: STAR_CLUSTER_HUE, accent: false, companionUpper: true, maxDetail: 1 },
  { key: 'amber planet', prim: 'ring', variant: 'dust', hue: AMBER_PLANET_HUE, accent: true, maxDetail: 1 },
  { key: 'lit planet', prim: 'planet', hue: LIT_PLANET_HUE, accent: false, region: 'aurora', maxDetail: 1 },
  { key: 'pulsar', prim: 'pulsar', hue: PULSAR_HUE, accent: false, region: 'aurora', regionSource: true, noCompanion: true },
  { key: 'rose nebula', prim: 'nebulaCloud', hue: ROSE_NEBULA_HUE, accent: true, cornerLeft: false, companionBoost: true },
  { key: 'comet', prim: 'streak', hue: COMET_HUE, accent: false, cornerLeft: false, companionBoost: true, companionKind: 'lens' },
  { key: 'binary pair', prim: 'binary', hue: BINARY_PAIR_HUE, accent: false },
  { key: 'asteroid field', prim: 'asteroidField', hue: ASTEROID_FIELD_HUE, accent: false },
  { key: 'record', prim: 'record', hue: RECORD_HUE, accent: false, region: 'disco', regionSource: true, maxDetail: 1 },
  { key: 'aurora ribbon', prim: 'ribbon', hue: AURORA_RIBBON_HUE, accent: false, bandUpper: false, maxDetail: 1 },
  { key: 'supernova', prim: 'spikes', hue: SUPERNOVA_HUE, accent: true, region: 'ember', regionSource: true, maxDetail: 1 },
  ```

  Also correct the header comment's claim, which is currently false. Replace the sentence "Pure rename, no behavior change: every value is identical to what the station list already had." with:

  ```
  // Pure rename, no behavior change: every value below is identical to the
  // literal it replaced. (Corrected 2026-08-31: the first version of this
  // block hoisted all 13 constants but only rewired `record` to use one —
  // the other 12 stations kept their literals, so 12 of these constants
  // were dead. Now every station reads its own constant.)
  ```

- [ ] **Step 3: Prove it is byte-identical**

  Add to `client/src/lib/ringEngine.test.js` (it already imports from `worlds/`; if it does not, put this in a new `client/src/worlds/midnightGalaxy.ring.test.js` with the same body):

  ```js
  import { describe, it, expect } from 'vitest'
  import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'

  // Pins the shipped hues so a constant-wiring change (or any future palette
  // edit landing by accident) can't silently alter the world. Update this
  // list ONLY in the same commit that deliberately changes a hue, and only
  // after `npm run verify:ring` has been run against the change.
  describe('midnightGalaxyRing station hues', () => {
    it('matches the shipped values', () => {
      expect(midnightGalaxyRing.stations.map(s => [s.key, s.hue])).toEqual([
        ['ringed planet', 256], ['spiral galaxy', 170], ['star cluster', 268],
        ['amber planet', 28], ['lit planet', 140], ['pulsar', 120],
        ['rose nebula', 330], ['comet', 208], ['binary pair', 214],
        ['asteroid field', 160], ['record', 300], ['aurora ribbon', 196],
        ['supernova', 36],
      ])
    })
  })
  ```

- [ ] **Step 4: Run it**

  ```bash
  cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && npm run test:unit
  ```

  Expected: PASS. A failure here means a value was mistyped in Step 2 — fix the typo, do not edit the expectation.

- [ ] **Step 5: Confirm the render is unchanged, do not assume it**

  ```bash
  cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && npm run verify:ring
  ```

  This touches only the React file, and the gate reads the HTML file, so this run's numbers must be **identical** to a run from before Step 2 — that is the point of running it. Capture both. If the regression-tier line moves at all, something other than a rename happened; stop and report, do not proceed to Task 1.

  Known flake (`scripts/ship.sh:61-70`): if the `[react-live]` route fails to boot, the gate "goes quiet." Re-run by hand once before treating any change as real.

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
  git add client/src/worlds/midnightGalaxy.ring.js client/src/lib/ringEngine.test.js
  git commit -m "Wire the 12 dead station hue constants; pin shipped hues in a test"
  ```

---

## Task 1: The palette math — `weightedPalette.js`

**What this delivers:** a pure function that turns `{ colors: ['#a855f7','#3b82f6','#f97316'], weights: [0.60,0.25,0.15] }` into 13 station hues, a `hueAnchors` array, a theme color set, and a per-station luma advisory. No React. Fully testable.

**Files:**
- Create: `client/src/lib/weightedPalette.js`
- Create: `client/src/lib/weightedPalette.test.js`

**Interfaces:**
- Consumes: `rgbToOklab`, `oklabToRgb`, `lerpOklabPolar`, `hexToRgb` — all already exported from `client/src/jukebox/components/AlbumGradientMesh.jsx`. Reuse them; do not reimplement OKLab. (If vitest chokes importing a `.jsx` component module in Task 1 Step 6, the fix is to move those four functions to a new `client/src/lib/oklab.js` and re-point both `AlbumGradientMesh.jsx` and this file at it — **move, never copy**. A second copy of OKLab going stale is instrument #6 from `ring-world-mistakes.md` generalized.)
- Produces, and every later task depends on these exact names:
  ```js
  hexToHslHue(hex) -> number            // 0-359
  allocate(weights, n) -> number[]      // counts per color, sums to n, each >= 1
  spread(counts) -> number[]            // length n, color index per slot, interleaved and
                                        // cyclically repaired to the max(0, 2c-n) adjacency floor
  hueLadder(k, halfWindow) -> number[]  // k offsets from -halfWindow to +halfWindow
  lumaProxy(hue) -> number              // Rec.709 luma of hsl(hue, 72%, 62%), 0-255
  derivePalette({ colors, weights, stationCount, baseTheme }) -> {
    hues, hueAnchors, themeColors, assignment, advisory, warnings
  }
  ```

- [ ] **Step 1: Write the failing test**

  Create `client/src/lib/weightedPalette.test.js`:

  ```js
  import { describe, it, expect } from 'vitest'
  import {
    hexToHslHue, allocate, spread, hueLadder, lumaProxy, derivePalette,
  } from './weightedPalette.js'

  const BASE = {
    colors: {
      bg: '#08001a', bgDeep: '#040010', accent: '#4a1a8f', highlight: '#c060ff',
      text: '#e8d0ff', textMuted: '#8050b0', shinyBg: '#120030', shinyAccent: '#ff40a0',
    },
  }

  describe('hexToHslHue', () => {
    it('reads HSL hue, the space the ring engine actually consumes', () => {
      // ringPrimitives.js builds every color as hsla(hue, S%, L%, a) — so the
      // hue number must be an HSL hue, not an OKLab hue angle. A pure blue is
      // 240 in HSL; its OKLab hue angle is nowhere near 240.
      expect(Math.round(hexToHslHue('#0000ff'))).toBe(240)
      expect(Math.round(hexToHslHue('#ff0000'))).toBe(0)
      expect(Math.round(hexToHslHue('#00ff00'))).toBe(120)
    })
  })

  describe('allocate', () => {
    it('apportions 13 stations by weight, largest remainder', () => {
      expect(allocate([0.60, 0.25, 0.15], 13)).toEqual([8, 3, 2])
    })
    it('always sums to the station count', () => {
      for (const w of [[0.5, 0.5], [0.34, 0.33, 0.33], [0.9, 0.05, 0.05], [0.7, 0.3]]) {
        expect(allocate(w, 13).reduce((a, b) => a + b, 0)).toBe(13)
      }
    })
    it('never starves a color to zero — a 2% slider still owns a station', () => {
      // Controllability: a color you deliberately picked must stay visible in
      // the world, or the third swatch silently does nothing at low weights.
      expect(allocate([0.96, 0.02, 0.02], 13).every(c => c >= 1)).toBe(true)
    })
  })

  describe('spread', () => {
    const cyclicAdjacent = out => {
      let a = 0
      for (let i = 0; i < out.length; i++) if (out[i] === out[(i + 1) % out.length]) a++
      return a
    }
    // The ring WRAPS — station 12 neighbours station 0 (midnightGalaxy.ring.js's
    // own family-spacing comment says so explicitly). So adjacency is cyclic,
    // and the minimum achievable for a colour owning c of n slots is
    // max(0, 2c - n): the other n - c stations can separate the colour into at
    // most n - c blocks. Every case must hit that floor exactly — no worse
    // (a visible clump) and no better (impossible, so a pass would mean the
    // test is measuring the wrong thing).
    const floorFor = counts =>
      Math.max(0, 2 * Math.max(...counts) - counts.reduce((a, b) => a + b, 0))

    it('hits the arithmetic adjacency floor for every allocation shape', () => {
      for (const counts of [[5, 4, 4], [8, 3, 2], [7, 6], [11, 1, 1], [9, 4], [5, 5, 3]]) {
        const out = spread(counts)
        expect(out).toHaveLength(counts.reduce((a, b) => a + b, 0))
        expect(cyclicAdjacent(out)).toBe(floorFor(counts))
      }
    })
    it('achieves zero clumping when the weights allow it', () => {
      // Regression pin: the un-repaired greedy walk produced 0120120120120
      // for this case — 1 collision at the wrap seam, invisible to a
      // non-cyclic check. See repairCyclic in weightedPalette.js.
      expect(cyclicAdjacent(spread([5, 4, 4]))).toBe(0)
    })
    it('gives each color exactly its allotted count', () => {
      const out = spread([8, 3, 2])
      expect([0, 1, 2].map(c => out.filter(v => v === c).length)).toEqual([8, 3, 2])
    })
  })

  describe('hueLadder', () => {
    it('spans the window symmetrically', () => {
      expect(hueLadder(7, 18)).toEqual([-18, -12, -6, 0, 6, 12, 18])
    })
    it('centres a lone station on its anchor', () => {
      expect(hueLadder(1, 18)).toEqual([0])
    })
  })

  describe('lumaProxy', () => {
    it('reproduces the measured reference values — a known-answer probe', () => {
      // If these drift, the proxy code is broken, not the palette. These are
      // the shipped hues, measured 2026-08-31 (see the plan's finding 4).
      expect(Math.round(lumaProxy(256))).toBe(106)
      expect(Math.round(lumaProxy(170))).toBe(197)
      expect(Math.round(lumaProxy(120))).toBe(188)
      expect(Math.round(lumaProxy(300))).toBe(128)
    })
  })

  describe('derivePalette', () => {
    const out = derivePalette({
      colors: ['#a855f7', '#3b82f6', '#f97316'],
      weights: [0.60, 0.25, 0.15],
      stationCount: 13,
      baseTheme: BASE,
    })

    it('emits one hue per station, all integers in 0-359', () => {
      expect(out.hues).toHaveLength(13)
      for (const h of out.hues) {
        expect(Number.isInteger(h)).toBe(true)
        expect(h).toBeGreaterThanOrEqual(0)
        expect(h).toBeLessThan(360)
      }
    })

    it('keeps every station inside its own anchor window — spec section 4', () => {
      // Nothing in ring-verify.mjs checks this (see the plan's finding 5), so
      // it has to be guaranteed here or it is guaranteed nowhere.
      const delta = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }
      out.hues.forEach((h, i) => {
        const anchor = out.hueAnchors[out.assignment[i]]
        expect(delta(h, anchor.deg)).toBeLessThanOrEqual(anchor.window)
      })
    })

    it('emits one anchor per palette color, within the spec 1-3 limit', () => {
      expect(out.hueAnchors).toHaveLength(3)
      expect(out.hueAnchors.every(a => a.window <= 25)).toBe(true)
    })

    it('keeps the background near-black — it is the whole screen behind every slide', () => {
      const lumaOfHex = hex => {
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      expect(lumaOfHex(out.themeColors.bg)).toBeLessThan(24)
      expect(lumaOfHex(out.themeColors.bgDeep)).toBeLessThan(lumaOfHex(out.themeColors.bg))
    })

    it('leans the accent toward the heaviest color, not toward an average', () => {
      // The anti-mud invariant. A 60/25/15 palette's accent must read as the
      // 60% colour, not as a three-way blend of all of them.
      const delta = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }
      expect(delta(hexToHslHue(out.themeColors.accent), hexToHslHue('#a855f7'))).toBeLessThan(12)
    })

    it('works with 2 colors as well as 3', () => {
      const two = derivePalette({
        colors: ['#a855f7', '#f97316'], weights: [0.7, 0.3],
        stationCount: 13, baseTheme: BASE,
      })
      expect(two.hues).toHaveLength(13)
      expect(two.hueAnchors).toHaveLength(2)
    })

    it('warns when two picked colors are close enough to read as one family', () => {
      const close = derivePalette({
        colors: ['#a855f7', '#c084fc'], weights: [0.6, 0.4],
        stationCount: 13, baseTheme: BASE,
      })
      expect(close.warnings.some(w => w.includes('one family'))).toBe(true)
    })

    it('advises per station without claiming a verdict', () => {
      expect(out.advisory).toHaveLength(13)
      expect(out.advisory[0]).toHaveProperty('fromLuma')
      expect(out.advisory[0]).toHaveProperty('toLuma')
      expect(out.advisory[0]).toHaveProperty('delta')
    })
  })
  ```

- [ ] **Step 2: Run it and watch it fail**

  ```bash
  cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/weightedPalette.test.js
  ```

  Expected: FAIL — `Failed to resolve import "./weightedPalette.js"`.

- [ ] **Step 3: Write the allocation half**

  Create `client/src/lib/weightedPalette.js`:

  ```js
  import { hexToRgb, rgbToOklab, oklabToRgb, lerpOklabPolar } from '../jukebox/components/AlbumGradientMesh.jsx'

  // Weighted-palette engine: 2-3 colors plus weights -> a full ring hue
  // assignment and a theme color set.
  //
  // THE ONE RULE THIS FILE EXISTS TO ENFORCE: weights ALLOCATE, they do not
  // BLEND. A 60/25/15 palette gives 8 of 13 stations the first colour, 3 the
  // second, 2 the third — it does not tint every station 60% toward colour
  // one. Averaging N weighted colours into one is precisely the mud that
  // AlbumGradientMesh.jsx's header documents a week of tuning spent escaping
  // ("an average of many colors structurally can't read as two colors
  // colliding, it just trends toward one blended pastel"). The single place
  // this file blends at all is the near-black background field, where a
  // weighted mean is the correct operation and, at L about 0.06, mud is not
  // physically reachable.

  // HSL hue, not OKLab hue. ringPrimitives.js consumes the station hue as
  // `hsla(hue, S%, L%, a)`, so it must be an HSL hue angle or the rendered
  // station will not match the swatch the host picked. Transcribed from
  // api/palette.js's hexToHue (that file imports `sharp`, so it cannot be
  // imported into the client — this is a deliberate 12-line copy with
  // provenance, not an accident; keep them in sync by hand if either moves).
  export function hexToHslHue(hex) {
    const [r, g, b] = hexToRgb(hex).map(v => v / 255)
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    if (d === 0) return 0
    let h
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    return h < 0 ? h + 360 : h
  }

  export function hueDelta(a, b) {
    const d = Math.abs(a - b) % 360
    return d > 180 ? 360 - d : d
  }

  // Largest-remainder (Hamilton) apportionment, with a floor of 1 per colour.
  // The floor is a controllability requirement, not a rounding nicety: a
  // colour the host deliberately picked must own at least one station, or
  // dragging the third swatch below ~4% makes it silently vanish.
  export function allocate(weights, n) {
    const total = weights.reduce((a, b) => a + b, 0) || 1
    const raw = weights.map(w => (w / total) * n)
    const counts = raw.map(Math.floor)
    const order = raw
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac)
    let short = n - counts.reduce((a, b) => a + b, 0)
    for (let k = 0; short > 0; k++, short--) counts[order[k % order.length].i]++
    // Floor pass: take from the largest to pay any colour sitting at zero.
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] !== 0) continue
      const big = counts.indexOf(Math.max(...counts))
      counts[big]--
      counts[i]++
    }
    return counts
  }

  // Evenly interleave each colour's stations around the ring so no colour
  // clumps into a visible block. Greedy "furthest behind its entitlement"
  // walk, then a cyclic repair pass.
  //
  // The repair pass is NOT optional polish. The greedy walk alone is a LINEAR
  // even-distribution and the ring is CYCLIC — station 12 neighbours station 0
  // (midnightGalaxy.ring.js's own family-spacing comment states this). Verified
  // 2026-08-31: greedy alone produces 0120120120120 for counts [5,4,4], which
  // reads as perfectly even until you notice both ends are colour 0. A
  // non-cyclic check would call that a pass. The repair closes the seam.
  //
  // When one colour owns more than half the stations some adjacency is
  // arithmetically forced — a colour owning c of n can be broken into at most
  // n - c blocks, so at least max(0, 2c - n) adjacent pairs survive. This hits
  // that floor exactly rather than pretending to avoid it, and derivePalette
  // reports the surviving count in `warnings`.
  export function spread(counts) {
    const n = counts.reduce((a, b) => a + b, 0)
    const acc = counts.map(() => 0)
    const out = []
    for (let i = 0; i < n; i++) {
      let best = 0, bestScore = -Infinity
      for (let c = 0; c < counts.length; c++) {
        if (acc[c] >= counts[c]) continue
        const score = (i + 1) * (counts[c] / n) - acc[c]
        if (score > bestScore) { bestScore = score; best = c }
      }
      acc[best]++
      out.push(best)
    }
    return repairCyclic(out, counts)
  }

  // Swap-repair toward the arithmetic adjacency floor. Terminates on the first
  // pass that cannot improve, so it is bounded and cannot spin.
  function repairCyclic(out, counts) {
    const n = out.length
    const bad = i => out[i] === out[(i + 1) % n]
    const countAdj = () => { let a = 0; for (let i = 0; i < n; i++) if (bad(i)) a++; return a }
    const floorAdj = Math.max(0, 2 * Math.max(...counts) - n)
    for (let pass = 0; pass < n; pass++) {
      const before = countAdj()
      if (before <= floorAdj) break
      let improved = false
      outer:
      for (let i = 0; i < n; i++) {
        if (!bad(i)) continue
        for (let j = 0; j < n; j++) {
          if (out[j] === out[i]) continue
          ;[out[i], out[j]] = [out[j], out[i]]
          if (countAdj() < before) { improved = true; break outer }
          ;[out[i], out[j]] = [out[j], out[i]]
        }
      }
      if (!improved) break
    }
    return out
  }

  // k evenly-spaced offsets across +/- halfWindow, so a colour owning 8
  // stations renders 8 related-but-distinct hues rather than 8 identical
  // ones. At k=7, halfWindow=18 the step is exactly 6 degrees — the same
  // separation the shipped world already uses between comet (208) and
  // binary pair (214).
  export function hueLadder(k, halfWindow) {
    if (k <= 1) return [0]
    const step = (2 * halfWindow) / (k - 1)
    return Array.from({ length: k }, (_, i) => -halfWindow + i * step)
  }

  // Rec.709 relative luminance of the ring engine's representative station
  // colour, hsl(hue, 72%, 62%). See this plan's finding 4 for why hue alone
  // moves this by up to 2.21x, and Step 5's honesty note for what it cannot
  // see.
  export function lumaProxy(hue) {
    const s = 0.72, l = 0.62
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
    const m = l - c / 2
    let r, g, b
    if (hue < 60) [r, g, b] = [c, x, 0]
    else if (hue < 120) [r, g, b] = [x, c, 0]
    else if (hue < 180) [r, g, b] = [0, c, x]
    else if (hue < 240) [r, g, b] = [0, x, c]
    else if (hue < 300) [r, g, b] = [x, 0, c]
    else [r, g, b] = [c, 0, x]
    return (0.2126 * (r + m) + 0.7152 * (g + m) + 0.0722 * (b + m)) * 255
  }
  ```

- [ ] **Step 4: Write the derivation half**

  Append to `client/src/lib/weightedPalette.js`:

  ```js
  const ANCHOR_WINDOW = 25   // spec section 4's stated maximum
  const LADDER_HALF   = 18   // stay inside the window with 7 degrees of margin

  // Set a colour's OKLab lightness while keeping its hue and chroma. Used to
  // drop a picked colour into a role (accent, highlight, background) whose
  // lightness the theme already had right — allocation again, not blending.
  function atLightness(hex, targetHex) {
    const [, a, b] = rgbToOklab(hexToRgb(hex))
    const [L] = rgbToOklab(hexToRgb(targetHex))
    const [r, g, bb] = oklabToRgb([L, a, b])
    return '#' + [r, g, bb].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
  }

  // The one legitimate blend in this file. Folds the palette into a single
  // weighted OKLab mean via lerpOklabPolar — the proven function, not a
  // per-channel RGB lerp, which is exactly what produces a muddy grey
  // midpoint between two near-complementary picks (AlbumGradientMesh.jsx's
  // lerpOklabPolar header documents that bug and its fix in full). Correct
  // here specifically because the result is then crushed to the theme's own
  // near-black background lightness, where only a faint hue cast survives.
  function foldOklab(colors, weights) {
    let acc = rgbToOklab(hexToRgb(colors[0]))
    let accW = weights[0]
    for (let i = 1; i < colors.length; i++) {
      const w = weights[i]
      const t = (accW + w) > 0 ? w / (accW + w) : 0
      acc = lerpOklabPolar(acc, rgbToOklab(hexToRgb(colors[i])), t)
      accW += w
    }
    const [r, g, b] = oklabToRgb(acc)
    return '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
  }

  export function derivePalette({ colors, weights, stationCount = 13, baseTheme, currentHues = [] }) {
    const counts     = allocate(weights, stationCount)
    const assignment = spread(counts)
    const anchors    = colors.map(hex => ({ deg: Math.round(hexToHslHue(hex)), window: ANCHOR_WINDOW }))

    // Ladder offsets, handed out so that ring-CONSECUTIVE members of the same
    // colour get the FURTHEST-APART offsets (outside-in alternation). Two
    // neighbours forced to share a colour at least read as two distinct
    // shades of it rather than as one 2-station-wide smear.
    const ladders = counts.map(k => hueLadder(k, LADDER_HALF))
    const seen    = counts.map(() => 0)
    const hues    = assignment.map(c => {
      const k = counts[c]
      const j = seen[c]++
      const pick = j % 2 === 0 ? Math.floor(j / 2) : k - 1 - Math.floor(j / 2)
      const h = anchors[c].deg + ladders[c][pick]
      return ((Math.round(h) % 360) + 360) % 360
    })

    const themeColors = {
      accent:    atLightness(colors[0], baseTheme.colors.accent),
      highlight: atLightness(colors[0], baseTheme.colors.highlight),
      bg:        atLightness(foldOklab(colors, weights), baseTheme.colors.bg),
      bgDeep:    atLightness(foldOklab(colors, weights), baseTheme.colors.bgDeep),
    }

    const advisory = hues.map((h, i) => {
      const from = currentHues[i] ?? h
      return {
        index: i,
        fromHue: from, toHue: h,
        fromLuma: Math.round(lumaProxy(from)),
        toLuma: Math.round(lumaProxy(h)),
        delta: Math.round(lumaProxy(h) - lumaProxy(from)),
      }
    })

    const warnings = []
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        if (hueDelta(anchors[i].deg, anchors[j].deg) < 2 * ANCHOR_WINDOW) {
          warnings.push(`Colors ${i + 1} and ${j + 1} are ${Math.round(hueDelta(anchors[i].deg, anchors[j].deg))}° apart — their anchor windows overlap, so the world will read as one family.`)
        }
      }
    }
    let adjacent = 0
    for (let i = 0; i < stationCount; i++) {
      if (assignment[i] === assignment[(i + 1) % stationCount]) adjacent++
    }
    if (adjacent > 0) {
      warnings.push(`${adjacent} neighbouring station pair${adjacent === 1 ? '' : 's'} share a color — unavoidable at these weights, since one color owns ${Math.max(...counts)} of ${stationCount} stations. Even out the weights to reduce it.`)
    }
    const rising = advisory.filter(a => a.delta > 25).length
    if (rising > 0) {
      warnings.push(`${rising} station${rising === 1 ? '' : 's'} move toward a brighter hue (proxy only — run the gate).`)
    }

    return { hues, hueAnchors: anchors, themeColors, assignment, counts, advisory, warnings }
  }
  ```

- [ ] **Step 5: Run the tests until green**

  ```bash
  cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/weightedPalette.test.js
  ```

  Expected: all PASS.

  **Honesty note that must survive into the code as a comment, not just this plan.** `lumaProxy` is an advisory, never a verdict. It measures one flat swatch at one representative saturation and lightness. The gate measures composited, scrimmed, frozen-at-peak frames of a full DOM. The proxy is structurally blind to: per-element alpha, the ~104 distinct `hsla()` call sites with S from 60–84 and L from 54–90, `makePrim`'s `LB()` lightness boost of up to +26 at low fill, layer stacking, the scrim, and the breathe/twinkle peak the `safeBox` check is actually measured at. Instrument #5 in `ring-world-mistakes.md` is a metric that was structurally blind to its own target and read as authoritative for weeks. Do not let this become the ninth. Add above `lumaProxy`:

  ```js
  // ADVISORY ONLY — never a prediction of ring-verify's verdict. Blind to
  // alpha, layer stacking, the scrim, LB()'s up-to-+26 lightness boost at
  // low fill, the ~104 distinct S/L combinations ringPrimitives.js actually
  // uses, and the breathe/twinkle peak the safeBox cap is measured at. Its
  // only honest claim is directional: "this palette pushes stations toward
  // brighter hues than the shipped one." Run the gate.
  ```

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
  git add client/src/lib/weightedPalette.js client/src/lib/weightedPalette.test.js
  git commit -m "Add weighted-palette engine: weights allocate stations, they don't blend them"
  ```

---

## Task 2: The picker UI — `WorldPaletteEditor.jsx`

**What the control is, concretely.** Two rows and nothing else:

1. **Swatches.** Two native `<input type="color">` swatches, always present, plus an optional third with a "+ add a third color" / "×" toggle. Native inputs, matching `ThemeCustomizeControls.jsx`'s existing pattern exactly — no custom color wheel, no eyedropper (there is no cover art to sample here, unlike the jukebox).
2. **One weight bar.** A single horizontal stacked bar, full width, each segment filled with its color and labelled with its live percentage. Between segments sit draggable dividers: **2 colors → 1 divider, 3 colors → 2 dividers.** Dragging a divider moves weight between exactly its two neighbours. Weights sum to 100% by construction — there is no way to make them not sum, so there is no renormalisation to explain and no "these don't add up" error state to design. Percentages snap to 5%. Removing the third color folds its weight into its left neighbour.

That is the entire control: pick colors, drag dividers. Below it sits a live preview and a read-only consequences panel.

**Files:**
- Create: `client/src/components/host/WorldPaletteEditor.jsx`
- Modify: `client/src/components/host/ThemePickerModal.jsx`

**Interfaces:**
- Consumes: `derivePalette` from Task 1; `midnightGalaxyRing` from `client/src/worlds/midnightGalaxy.ring.js`; `RingAmbient` (default export, `worldData` and `stationOverride` props, per `AmbientAudit.jsx`'s existing usage).
- Produces: `<WorldPaletteEditor onClose={fn} baseTheme={theme} onApplyThemeColors={fn} />`. `onApplyThemeColors(colorsObject)` is wired in Task 3; pass a no-op in this task.

- [ ] **Step 1: The weight bar**

  ```jsx
  import { useState, useMemo, useRef } from 'react'
  import { derivePalette } from '../../lib/weightedPalette.js'
  import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
  import RingAmbient from '../display/RingAmbient.jsx'

  const SNAP = 0.05
  const MIN_WEIGHT = 0.05

  // Cumulative divider positions, so dragging one divider moves weight
  // between exactly its two neighbours and the total is 1 by construction.
  function WeightBar({ colors, weights, onChange }) {
    const barRef = useRef(null)
    const cuts = weights.slice(0, -1).map((_, i) =>
      weights.slice(0, i + 1).reduce((a, b) => a + b, 0))

    function dragCut(index, clientX) {
      const rect = barRef.current.getBoundingClientRect()
      const raw = (clientX - rect.left) / rect.width
      const lo = (index === 0 ? 0 : cuts[index - 1]) + MIN_WEIGHT
      const hi = (index === cuts.length - 1 ? 1 : cuts[index + 1]) - MIN_WEIGHT
      const snapped = Math.round(Math.min(hi, Math.max(lo, raw)) / SNAP) * SNAP
      const next = [...cuts]
      next[index] = snapped
      const bounds = [0, ...next, 1]
      onChange(bounds.slice(1).map((v, i) => +(v - bounds[i]).toFixed(2)))
    }

    return (
      <div ref={barRef} className="relative h-12 w-full rounded-lg overflow-hidden select-none flex">
        {weights.map((w, i) => (
          <div
            key={i}
            className="h-full flex items-center justify-center text-xs font-semibold text-white"
            style={{ width: `${w * 100}%`, background: colors[i], textShadow: '0 1px 3px rgba(0,0,0,.7)' }}
          >
            {Math.round(w * 100)}%
          </div>
        ))}
        {cuts.map((c, i) => (
          <div
            key={i}
            role="separator"
            aria-label={`Weight between color ${i + 1} and color ${i + 2}`}
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId)
              const move = ev => dragCut(i, ev.clientX)
              const up = ev => {
                ev.currentTarget?.releasePointerCapture?.(e.pointerId)
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', up)
              }
              window.addEventListener('pointermove', move)
              window.addEventListener('pointerup', up)
            }}
            className="absolute top-0 h-full w-3 -ml-1.5 cursor-col-resize"
            style={{ left: `${c * 100}%` }}
          >
            <div className="mx-auto h-full w-0.5 bg-white/90 shadow" />
          </div>
        ))}
      </div>
    )
  }
  ```

- [ ] **Step 2: The editor shell, swatches, and the 2-vs-3 color toggle**

  ```jsx
  const CURRENT_HUES = midnightGalaxyRing.stations.map(s => s.hue)

  export default function WorldPaletteEditor({ onClose, baseTheme, onApplyThemeColors }) {
    const [colors, setColors]   = useState(['#a855f7', '#3b82f6'])
    const [weights, setWeights] = useState([0.65, 0.35])

    function addThird() {
      setColors([...colors, '#f97316'])
      // Take the new colour's share from the largest existing weight, so the
      // bar never jumps to an unrecognisable layout on add.
      const big = weights.indexOf(Math.max(...weights))
      const next = [...weights]
      next[big] = +(next[big] - 0.15).toFixed(2)
      setWeights([...next, 0.15])
    }

    function removeThird() {
      setColors(colors.slice(0, 2))
      setWeights([+(weights[0] + weights[2]).toFixed(2), weights[1]])
    }

    const derived = useMemo(() => derivePalette({
      colors, weights, stationCount: CURRENT_HUES.length,
      baseTheme, currentHues: CURRENT_HUES,
    }), [colors, weights, baseTheme])

    const previewWorldData = useMemo(() => ({
      ...midnightGalaxyRing,
      hueAnchors: derived.hueAnchors,
      stations: midnightGalaxyRing.stations.map((st, i) => ({ ...st, hue: derived.hues[i] })),
    }), [derived])

    const [previewStation, setPreviewStation] = useState(0)

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: 1040, maxWidth: '96vw', maxHeight: '90vh' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <h2 className="text-sm font-semibold text-gray-800">World palette — Midnight Galaxy</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-sm">✕</button>
          </div>

          <div className="px-5 py-4 border-b border-gray-100 shrink-0 space-y-3">
            <div className="flex items-center gap-3">
              {colors.map((c, i) => (
                <input
                  key={i}
                  type="color"
                  value={c}
                  aria-label={`Palette color ${i + 1}`}
                  onChange={e => setColors(colors.map((v, j) => j === i ? e.target.value : v))}
                  className="w-10 h-10 border border-gray-200 rounded-lg cursor-pointer"
                />
              ))}
              {colors.length === 2
                ? <button onClick={addThird} className="text-xs font-medium text-gray-500 hover:text-gray-900 underline">+ add a third color</button>
                : <button onClick={removeThird} className="text-xs font-medium text-gray-500 hover:text-gray-900 underline">remove third color</button>}
            </div>
            <WeightBar colors={colors} weights={weights} onChange={setWeights} />
          </div>

          {/* preview + consequences — Steps 3 and 4 */}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 3: The live preview, in an isolated `RingAmbient`**

  Insert where the placeholder comment sits. This mounts a **second, throwaway** `RingAmbient` fed a cloned `worldData` — never the show's real instance, which keeps reading the unmutated `midnightGalaxyRing` import. `ParticleBackground.jsx`'s "never re-mounts" rule governs that live instance, not this modal-scoped clone.

  ```jsx
  <div className="flex flex-1 min-h-0 overflow-hidden">
    <div className="w-52 shrink-0 border-r border-gray-100 overflow-y-auto py-2">
      {midnightGalaxyRing.stations.map((st, i) => (
        <button
          key={st.key}
          onClick={() => setPreviewStation(i)}
          className={`w-full text-left px-4 py-2 text-xs capitalize flex items-center gap-2 ${
            i === previewStation ? 'bg-gray-900 text-white font-semibold' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: `hsl(${derived.hues[i]}, 72%, 62%)` }} />
          {st.key}
        </button>
      ))}
    </div>
    <div className="flex-1 bg-[#050505] flex items-center justify-center overflow-hidden">
      <div style={{ width: 640, height: 360, position: 'relative', overflow: 'hidden', borderRadius: 12 }}>
        <RingAmbient key="palette-preview" worldData={previewWorldData} stationOverride={previewStation} />
      </div>
    </div>
  </div>
  ```

- [ ] **Step 4: The consequences panel**

  ```jsx
  <div className="px-5 py-3 border-t border-gray-100 shrink-0 max-h-56 overflow-y-auto">
    {derived.warnings.map((w, i) => (
      <div key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2">{w}</div>
    ))}
    <table className="w-full text-[11px] font-mono">
      <thead className="text-gray-400">
        <tr><th className="text-left font-normal">station</th><th className="text-right font-normal">hue</th><th className="text-right font-normal">luma now</th><th className="text-right font-normal">luma after</th><th className="text-right font-normal">Δ</th></tr>
      </thead>
      <tbody>
        {derived.advisory.map(a => (
          <tr key={a.index} className={a.delta > 25 ? 'text-amber-700' : 'text-gray-600'}>
            <td className="text-left capitalize">{midnightGalaxyRing.stations[a.index].key}</td>
            <td className="text-right">{a.fromHue}° → {a.toHue}°</td>
            <td className="text-right">{a.fromLuma}</td>
            <td className="text-right">{a.toLuma}</td>
            <td className="text-right">{a.delta > 0 ? '+' : ''}{a.delta}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="text-[11px] text-gray-400 mt-2 font-sans">
      Luma is an advisory proxy for one flat swatch, not a prediction of the gate.
      The “luma now” column is the shipped world — if those numbers ever stop matching
      the values pinned in weightedPalette.test.js, the proxy is broken, not the palette.
      Run <code>npm run verify:ring</code> for the real answer.
    </p>
  </div>
  ```

  That "luma now" column is the known-answer probe `ring-world-mistakes.md`'s rule zero requires of any new automated check: a reference the reader can eyeball against a pinned constant every single time the panel is opened.

- [ ] **Step 5: Add the entry point in `ThemePickerModal.jsx`**

  Add `const [paletteOpen, setPaletteOpen] = useState(false)` alongside the modal's existing state, then near `ThemeCustomizeControls` in the footer:

  ```jsx
  {previewId === 'midnight-galaxy' && (
    <button
      onClick={() => setPaletteOpen(true)}
      className="text-sm font-medium text-gray-600 hover:text-gray-900 underline"
    >
      World palette
    </button>
  )}
  {paletteOpen && (
    <WorldPaletteEditor
      baseTheme={baseTheme}
      onApplyThemeColors={() => {}}
      onClose={() => setPaletteOpen(false)}
    />
  )}
  ```

- [ ] **Step 6: Manual verification — render it, do not assume it**

  1. `npm run dev`, open `/host`, load a Midnight Galaxy show, Theme → World palette.
  2. Drag the divider from 65/35 to 40/60. Confirm the station list's dots re-colour, the preview re-renders live, and the advisory table's Δ column updates.
  3. Add the third color. Confirm the bar becomes three segments with two dividers, still summing to 100%.
  4. Set two colors 20° apart. Confirm the "one family" warning appears.
  5. Set weights to 90/5/5. Confirm every color still owns at least one station (the allocation floor).
  6. **Confirm `/display` for that show is completely unaffected while the modal is open** — the preview instance must never share state with the live one. Screenshot both.

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
  git add client/src/components/host/WorldPaletteEditor.jsx client/src/components/host/ThemePickerModal.jsx
  git commit -m "Add weighted world-palette picker: 2-3 colors, one weight bar, live isolated preview"
  ```

---

## Task 3: Wire the theme half live (the ungated exit)

**Why this half needs no gate:** every combination of `theme.colors` values is safe by construction — they are CSS colors on text and backgrounds, and `applyOverrides()` re-derives its contrast floor from the merged result, so even a hostile `bg` is corrected downstream. Nothing about them can break a rendering assumption the way a station hue interacts with luminance-based safe-box math. This is the same pipeline the superseded plan's Tasks 1–2 already proved end to end.

**Files:**
- Modify: `client/src/components/host/WorldPaletteEditor.jsx`, `client/src/components/host/ThemePickerModal.jsx`

**Interfaces:**
- Consumes: `ThemePickerModal`'s existing `setTextColor(field, color)` and `onUpdateOverrides(next)` — unchanged signatures.
- Produces: `onApplyThemeColors(colorsObject)` where `colorsObject` is `{ bg, bgDeep, accent, highlight }` — exactly `derived.themeColors`.

- [ ] **Step 1: Add the handler in `ThemePickerModal.jsx`**

  ```jsx
  function applyPaletteColors(nextColors) {
    const next = { ...overrides, colors: { ...overrides.colors, ...nextColors } }
    setOverrides(next)
    onUpdateOverrides(next)
  }
  ```

  Pass it down: `<WorldPaletteEditor ... onApplyThemeColors={applyPaletteColors} />`. It merges rather than replaces, so a `text`/`textMuted`/`shinyBg`/`shinyAccent` override the host set by hand in `ThemeCustomizeControls` survives a palette apply.

- [ ] **Step 2: Add the button in `WorldPaletteEditor.jsx`**

  ```jsx
  <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-100 shrink-0">
    <div className="flex items-center gap-2 text-xs text-gray-500">
      Theme colors:
      {['bg', 'bgDeep', 'accent', 'highlight'].map(k => (
        <span key={k} className="flex items-center gap-1">
          <span className="w-4 h-4 rounded border border-gray-200" style={{ background: derived.themeColors[k] }} />
          <code className="text-[10px]">{derived.themeColors[k]}</code>
        </span>
      ))}
    </div>
    <button
      onClick={() => onApplyThemeColors(derived.themeColors)}
      className="ml-auto text-sm font-semibold px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700"
    >
      Apply to this show's theme
    </button>
  </div>
  ```

  This applies **only** the theme half. The ring half is Task 4 and is deliberately a separate button with a separate mechanism.

- [ ] **Step 3: Manual verification**

  1. Pick a palette, click Apply. Confirm `ThemePickerModal`'s own preview backdrop changes.
  2. Open `/display` for that show. Confirm a real slide renders the new background and accent, with no reload.
  3. Set `text` by hand in Customize first, then apply a palette. Confirm the hand-set `text` survives (the merge, not a replace).
  4. Click the global Reset. Confirm the show returns to the base Midnight Galaxy theme.
  5. Confirm the **ring on `/display` is unchanged** — the theme apply must not move a single station hue. This is the load-bearing check that the two halves really are separate.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
  git add client/src/components/host/WorldPaletteEditor.jsx client/src/components/host/ThemePickerModal.jsx
  git commit -m "Apply the weighted palette's theme half live through the existing overrides pipeline"
  ```

---

## Task 4: The ring half — paste-block and verify handoff (NOT tonight; see Scope)

**What a host actually does, end to end.** Pick a palette, watch the preview, then click "Get the ring edit." The panel renders three copy blocks and one command. Nothing is written by the browser: there is no backend that could do it safely from a deployed session, and even a local-dev file write would still need a human to read the gate's output, so automating the write buys nothing while removing a checkpoint.

**Files:**
- Modify: `client/src/components/host/WorldPaletteEditor.jsx`

**Interfaces:**
- Consumes: `derived.hues`, `derived.hueAnchors` from Task 1.
- Produces: nothing consumed by later tasks — terminal.

- [ ] **Step 1: Render the paste blocks**

  ```jsx
  const CONST_NAMES = [
    'RINGED_PLANET_HUE', 'SPIRAL_GALAXY_HUE', 'STAR_CLUSTER_HUE', 'AMBER_PLANET_HUE',
    'LIT_PLANET_HUE', 'PULSAR_HUE', 'ROSE_NEBULA_HUE', 'COMET_HUE', 'BINARY_PAIR_HUE',
    'ASTEROID_FIELD_HUE', 'RECORD_HUE', 'AURORA_RIBBON_HUE', 'SUPERNOVA_HUE',
  ]

  const blockConstants = CONST_NAMES
    .map((n, i) => `export const ${n.padEnd(19)} = ${derived.hues[i]}`)
    .join('\n')

  const blockAnchors = 'hueAnchors: [\n'
    + derived.hueAnchors.map(a => `  { deg: ${a.deg}, window: ${a.window} },`).join('\n')
    + '\n],'

  const blockHtml = midnightGalaxyRing.stations
    .map((st, i) => `  ${st.key}: hue ${st.hue} -> ${derived.hues[i]}`)
    .join('\n')
  ```

- [ ] **Step 2: Render the instructions with the blocks**

  ```jsx
  {ringOpen && (
    <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 text-xs overflow-y-auto" style={{ maxHeight: 340 }}>
      <p className="font-semibold text-gray-800 mb-1">Before you edit anything, capture the current baseline:</p>
      <pre className="bg-white border border-gray-200 rounded p-2 mb-3 whitespace-pre-wrap">npm run verify:ring 2&gt;&amp;1 | tee /tmp/ring-before.txt</pre>

      <p className="font-semibold text-gray-800 mb-1">1. client/src/worlds/midnightGalaxy.ring.js — replace the 13 hue constants at the top of the file:</p>
      <pre className="bg-white border border-gray-200 rounded p-2 mb-3 whitespace-pre-wrap">{blockConstants}</pre>

      <p className="font-semibold text-gray-800 mb-1">2. Same file — replace the hueAnchors array:</p>
      <pre className="bg-white border border-gray-200 rounded p-2 mb-3 whitespace-pre-wrap">{blockAnchors}</pre>

      <p className="font-semibold text-gray-800 mb-1">
        3. concepts/world-07-ring.html — apply the same hues and the same hueAnchors to its own independent copy of the station array.
        <span className="text-red-700"> This is the file `npm run verify:ring` actually reads. Skip it and the gate certifies the old colors.</span>
      </p>
      <pre className="bg-white border border-gray-200 rounded p-2 mb-3 whitespace-pre-wrap">{blockHtml}</pre>

      <p className="font-semibold text-gray-800 mb-1">4. Run the gate and diff it against the baseline:</p>
      <pre className="bg-white border border-gray-200 rounded p-2 mb-3 whitespace-pre-wrap">npm run verify:ring 2&gt;&amp;1 | tee /tmp/ring-after.txt
  diff /tmp/ring-before.txt /tmp/ring-after.txt</pre>

      <p className="text-gray-700 mb-1"><strong>If the regression tier got worse:</strong> re-weight the bar, nudge a palette color, or pick a different color, and run it again. Do not touch a threshold, ring-spec.lock.json, or ring-verify.mjs — those are Ben&rsquo;s call, not an agent&rsquo;s (references/ring-world-continuity.md §4). Do not loop an optimizer against the gate; a gate optimized against stops being a gate.</p>
      <p className="text-gray-700 mb-1"><strong>To undo everything:</strong> <code>git checkout -- client/src/worlds/midnightGalaxy.ring.js concepts/world-07-ring.html</code></p>
      <p className="text-gray-700"><strong>Numbers are not acceptance.</strong> A green gate says nothing broke; it does not say the world looks right. That judgement happens on the real taproom TV and it is Ben&rsquo;s.</p>
    </div>
  )}
  ```

- [ ] **Step 3: Flag the three region-source stations explicitly**

  `pulsar` (aurora), `record` (disco), and `supernova` (ember) carry `regionSource: true`. Their hue lights a sky region spanning neighbouring stations, so a change to any of them has a wider blast radius than a normal station — `RECORD_HUE`'s own comment already says it "needs a ring-verify re-run and a live screenshot check before it moves off 300." Add above the paste blocks:

  ```jsx
  {[5, 10, 12].some(i => derived.hues[i] !== CURRENT_HUES[i]) && (
    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
      This palette moves a region-source station ({[5, 10, 12]
        .filter(i => derived.hues[i] !== CURRENT_HUES[i])
        .map(i => midnightGalaxyRing.stations[i].key).join(', ')}).
      Their hue lights a sky region across neighbouring stations, so the gate&rsquo;s numbers are not
      the whole check here — take a live screenshot of the neighbours too.
    </div>
  )}
  ```

- [ ] **Step 4: End-to-end verification, with Ben, not alone**

  1. Pick a palette, open the ring block, paste all three edits into the two real files.
  2. Run the gate. **Report the actual regression-tier line, before and after, verbatim.** Do not summarise it as "passing."
  3. Update `client/src/lib/ringEngine.test.js`'s pinned hue list in the same commit, since the shipped hues genuinely changed.
  4. Screenshot the real `/display` at several stations. Ben looks at it on the taproom TV.
  5. If the gate got worse, or Ben does not like it: `git checkout` the two files and re-weight. Nothing is half-applied — the whole thing is 14 lines in two files.

- [ ] **Step 5: Commit (only after a clean gate run and Ben's sign-off)**

  ```bash
  cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
  git add client/src/components/host/WorldPaletteEditor.jsx client/src/worlds/midnightGalaxy.ring.js concepts/world-07-ring.html client/src/lib/ringEngine.test.js
  git commit -m "Ring palette: <describe the palette>; verify:ring regression tier <before> -> <after>"
  ```

---

## Scope: tonight vs. later

The show is tomorrow. The honest split, with reasons rather than reassurance:

**Ships tonight — Tasks 0 through 3.** All of it is additive or provably inert:

- **Task 0** is a rename with a test pinning the values byte-identical. It changes no pixel. It also fixes a live bug in tonight's uncommitted work.
- **Task 1** is a new pure module plus its tests. Nothing imports it yet.
- **Task 2** is a new modal that writes nothing anywhere. Its `RingAmbient` preview is a throwaway clone; the show's own instance never sees it.
- **Task 3** writes only `theme_overrides.colors`, through the pipeline that has been live and ungated all along.

None of that can touch what renders on a TV tomorrow unless Ben deliberately clicks Apply, and even then it moves only theme colors, which are safe by construction and reversible with the existing Reset button.

**Does not ship tonight — Task 4.** Not because it is large; the code is a few paste blocks and it is the shortest task here. Because of what running it costs on show eve:

1. The ring is now genuinely in production (finding 1). `RING_WORLDS['midnight-galaxy']` routes every Midnight Galaxy show through `RingAmbient`. A palette applied tonight is on the TV tomorrow.
2. `scripts/ship.sh:77` now blocks shipping on regression-tier structural failures. A palette that moves the gate the wrong way does not just look wrong — it blocks every subsequent deploy, including an unrelated emergency fix at 6pm tomorrow.
3. The gate's own baseline is not clean today (`ring-world-mistakes.md` records 2/34 regression-tier FAIL on safe-box luminance at two stations, plus a documented `[react-live]` boot flake that can make a run go quiet). Interpreting a moved number against that baseline is the "interpreting an ambiguous run" item on the STAYS-HUMAN list. It needs Ben awake, not an agent at midnight.
4. Acceptance is a TV test, not a number. `ring-world-mistakes.md` has an outstanding item for exactly this: put the build on the real taproom screen and sort the stations by eye. A recolour of all 13 stations is the change that most needs that test, and it cannot happen tonight.

So: build the instrument tonight, pull the trigger after the show, with Ben at the TV. That ordering costs nothing — Tasks 0–3 are the work; Task 4 is fifteen minutes of pasting once someone is looking at a screen.

**What this plan does not attempt at all:**
- A live, per-show, instantly-saved ring hue override (a `theme_overrides`-shaped pipeline for station hues). Its save step bypasses `ring-verify` entirely. Named in the superseded plan as an explicit decision for Ben; still his call, still not built.
- Any change to the ring's sky palette (`skyFromTheme`).
- Any change to `ring-verify.mjs`, `ring-spec.lock.json`, or `ship.sh`.
- Extracting the ring gate's prose rules (hue anchors, family spacing) into mechanical checks. Real, valuable, and out of scope — that is editing check logic, which is Ben's call.

---

## Flags for Ben (raised, deliberately not fixed)

1. **`references/ring-world-mistakes.md`'s "Live state" section is stale on the two facts that matter most here.** It says the ring gate is non-blocking in `ship.sh` *because `RingAmbient.jsx` is not mounted in production*. Both halves have since changed: `ParticleBackground.jsx:1167-1248` mounts it live for `midnight-galaxy`, and `ship.sh:77` blocks on regression-tier structural failures. Flagging per that file's own process note rather than editing it.
2. **Twelve of the thirteen new hue constants are dead** (finding 2). Task 0 fixes it, but the header comment's "pure rename, no behavior change" claim was not true as written and is worth knowing about, since it is the sort of claim that gets trusted later.
3. **"12 stations" is wrong throughout the docs and in tonight's ask** (finding 3). There are 13; 12 is the turn count. Worth one correction pass at the source someday.

---

## Self-Review

**Spec coverage.** Q1, the picker: Task 2, Steps 1–2 — two or three native swatches, one stacked weight bar with 1 or 2 draggable dividers, sums to 100% by construction, third color optional with a defined add/remove weight rule. Q2, the math: Task 1 — allocation not blending (`allocate` + `spread` + `hueLadder`), with OKLab confined to the one place a weighted mean is correct (`foldOklab` into a near-black background), plus the finding that family spacing is untouched by construction because only `hue` fields are rewritten, plus in-code enforcement of the ±25° anchor window the gate does not check. Q3, verify: Task 4 — baseline capture, three paste blocks including the HTML file the gate actually reads, `npm run verify:ring`, a diff against the baseline, defined FAIL behaviour that re-weights rather than re-thresholds, an explicit `git checkout` undo, a region-source warning, and "numbers are not acceptance." Q4, scope: the Scope section, with four named reasons the ring half waits and an explicit statement that the wait costs nothing.

**Placeholder scan.** No TBD or TODO. Every code step carries literal code; every verification step carries a literal command with an expected result. Two intentional fill-ins remain and are correct as such: the commit message in Task 4 Step 5 (which must quote the real before/after numbers, unknowable now) and `<describe the palette>` in the same line.

**Executed, not just written.** `allocate`, `spread`, `repairCyclic`, and `hueLadder` were run as standalone JS before this plan was saved, against every case the test file asserts. Two results are load-bearing: `allocate([0.60, 0.25, 0.15], 13)` really does return `[8, 3, 2]`, and the greedy walk alone really did fail the cyclic seam on `[5, 4, 4]` — the repair pass and its regression pin exist because the first version of this plan asserted `0` adjacency and would have shipped a visible same-colour pair at the ring's wrap. With the repair, all six tested allocation shapes land exactly on the `max(0, 2c - n)` floor with counts preserved. `lumaProxy`'s four pinned values are the same numbers in this plan's finding-4 table, produced by the same formula.

**Type consistency.** `derivePalette({ colors, weights, stationCount, baseTheme, currentHues })` returns `{ hues, hueAnchors, themeColors, assignment, counts, advisory, warnings }` in Task 1 and is consumed with exactly those names in Tasks 2, 3, and 4. `onApplyThemeColors(colorsObject)` takes `derived.themeColors` — `{ bg, bgDeep, accent, highlight }` — in both its stub (Task 2) and its wiring (Task 3). `hueLadder(k, halfWindow)`, `allocate(weights, n)`, `spread(counts)`, `lumaProxy(hue)`, and `hexToHslHue(hex)` keep one signature each across the test file and both call sites. `CONST_NAMES` in Task 4 is ordered to match `midnightGalaxyRing.stations` index-for-index — verified against the array in Task 0 Step 2.

**One thing I would want a reviewer to attack.** `lumaProxy` is a new number in a project whose defining lesson is that eight instruments have lied. It is mitigated three ways — labelled advisory in the UI, in the code comment, and in this plan; pinned to measured reference values in the test; and displayed beside a live known-answer column the reader sees every time. It is still a new number. If a reviewer thinks it should not exist at all, shipping Tasks 0–3 without it costs only the warning text and is a defensible call.
