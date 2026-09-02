# Ring recolor pipeline — one command from palette to both world files

**Date:** 2026-09-02
**Branch:** `feat/ring-recolor-pipeline` (worktree `.claude/worktrees/ring-recolor`, off `main` at `9cd6b0e`)
**Supersedes:** Task 4 of `2026-08-31-weighted-palette-system.md` (the paste-block handoff). That task's
one attempt, commit `88399d7` on `worktree-weighted-palette-system`, is NOT merged and stays there as
reference only — a hyper-critical review found it recolored the 13 station hues but left two other
hue-dependent systems hardcoded, producing green/magenta sky washes and cyan companions in a red/yellow
world. This plan fixes those two systems first, then builds the script.

**Spec (binding):** memory `project_ring_palette_self_service` + the ledger at
`.superpowers/sdd/2026-08-31-weighted-palette-system/progress.md` in the old worktree. Ben's ask,
verbatim: "the entire thought was to make that the custom part." Goal = an agent can go from
"Ben names 2-3 colors" to "both world files updated, gate run" in one command in one conversation.

## Why the old attempt failed (read before Task 1)

Three places carry a hue that is NOT one of the 13 station constants:

1. `client/src/lib/ringPrimitives.js` `SKY_REGIONS` — `aurora.hue=152`, `ember.hue=26`, `disco.hue=300`,
   hardcoded. Each region's light SOURCE is a station (`regionSource: true`): aurora ← pulsar (hue 120),
   ember ← supernova (36), disco ← record (300). In a red/yellow world the source turns red but the sky
   stays green. Same failure class `references/ring-world-mistakes.md` already records once (the
   "unmotivated wash" on old st8).
2. `client/src/components/display/RingAmbient.jsx:525` and `concepts/world-07-ring.html:991` —
   `compHue = st.hue + (st.accent ? 168 : lerp(-18, 18, r()))`. The `+168` assumed a cool world with a
   warm accent: it throws the accent station's companion into the cool family. In a red/yellow world the
   accents are yellow (~55) and `+168` lands on cyan.
3. `hueAnchors` in both `midnightGalaxy.ring.js` and `world-07-ring.html` — `88399d7` did update these.

## Global Constraints

- **Current world stays visually identical after Task 1 except the accent companions.** Sky-region hues
  for the shipped station data MUST compute to exactly `{ aurora: 152, ember: 26, disco: 300 }` — a
  unit test pins this. Companion hues on the 3 accent stations move by ≤ 18° (st3 28→ companion 196→214,
  st6 330→ 138→140, st12 36→ 204→214); 18° is the non-accent rule's own jitter band, so this is inside
  the design's existing noise. Rendered before/after screenshots of st3/st6/st12 are part of Task 4 for
  Ben's eye — aesthetic acceptance is his (STAYS HUMAN).
- **STAYS HUMAN (`references/ring-world-continuity.md` §4):** never edit `concepts/tools/ring-verify.mjs`
  pass/fail logic, `concepts/tools/ring-spec.lock.json`, any cap. Never move a threshold to make
  something pass. If a task would need to, stop and say so.
- **Both builds in lockstep.** `RingAmbient.jsx` and `concepts/world-07-ring.html` are two independent
  copies of the station loop; every rule change lands in both with a "synced" comment, same as every
  existing flag. The gate reads ONLY the HTML file for its `[html]` pass.
- **Seeded RNG stream:** never add or remove an `rCompanion()`/`rHeadline()`/`rDetail()` call. Changing
  the call count desyncs every downstream placement in that station (2026-08-08 bandY bug,
  2026-08-16 st9 spanning-field bug). `accentCompanionHue()` takes no random draw.
- **GPU-only animations, no re-mount of ParticleBackground** — unchanged from SKILL.md; nothing here
  touches animation.
- **No drive-by edits.** Stale comments you notice in files you don't own: list them in your report,
  don't fix them.
- **Stage by explicit filename**, never `git add -A`. Other sessions share this repo.
- **Tests:** `npm run test:unit` (vitest, ~2s, 478 passing at branch start) must stay green.
- **Gate:** `RING_VERIFY_SKIP_LIVE=1 npm run verify:ring` (~90s, HTML pass only) — regression tier must
  stay all-green (19/19 at branch start). Spec tier is 7/16 FAIL at branch start, pre-existing; report
  the number, don't chase it. Only Task 4 runs the full gate with the react-live pass.
- **Node-runnable:** `scripts/ring-recolor.mjs` runs under plain `node` (ESM), no vite, no JSX. Read the
  world file as TEXT for current hues; import only pure `.js` modules.

## File structure

```
client/src/lib/ringPrimitives.js        Task 1 — SKY_REGIONS hue → hueOffset; skyRegionHues(); accentCompanionHue(); makeSkyTints/makeSourceGlow take hues
client/src/components/display/RingAmbient.jsx   Task 1 — pass region hues; use accentCompanionHue
concepts/world-07-ring.html             Task 1 — same two changes, synced comments
client/src/lib/skyRegions.test.js       Task 1 — pin skyRegionHues + accentCompanionHue
client/src/lib/oklab.js                 Task 2 — NEW: pure color math extracted from AlbumGradientMesh.jsx
client/src/jukebox/components/AlbumGradientMesh.jsx   Task 2 — import + re-export from oklab.js (no behavior change)
client/src/lib/weightedPalette.js       Task 2 — import from oklab.js; baseTheme optional
client/src/lib/weightedPalette.test.js  Task 2 — import from oklab.js; CURRENT_HUES frozen literal
client/src/lib/ringRecolor.js           Task 2 — NEW: pure text transforms (unit tested)
client/src/lib/ringRecolor.test.js      Task 2 — NEW
scripts/ring-recolor.mjs                Task 2 — NEW: CLI wrapper (fs + argv only)
client/src/components/host/WorldPaletteEditor.jsx   Task 3 — copyable command replaces the "preview only" TODO panel
```

---

## Task 1: Sky regions and accent companions follow the palette

**Files:** `client/src/lib/ringPrimitives.js`, `client/src/components/display/RingAmbient.jsx`,
`concepts/world-07-ring.html`, `client/src/lib/skyRegions.test.js`.

### 1a. `SKY_REGIONS`: replace `hue` with `hueOffset`

In `ringPrimitives.js` (~line 2977), change the three entries:

```js
aurora: { hueOffset: 32,  tintSat: 60, ... }   // was hue: 152; source = pulsar (120): 120 + 32 = 152
ember:  { hueOffset: -10, tintSat: 66, ... }   // was hue: 26;  source = supernova (36): 36 - 10 = 26
disco:  { hueOffset: 0,   tintSat: 74, ... }   // was hue: 300; source = record (300)
```

Keep every other field byte-identical. Rewrite the block comment above it: hues are derived from the
region's source station at build time, offset preserved so the shipped world renders unchanged; a
palette change moves the sky with its source. Keep the existing disco reasoning paragraphs — they
still explain the *offset* choice (0) and saturation.

### 1b. New exports in `ringPrimitives.js`

```js
// Region hue = its source station's hue + the region's authored offset. Source
// = the member with regionSource:true; a region with members but no declared
// source falls back to its first member (never silently to a hardcode).
export function skyRegionHues(stations) {
  const hues = {}
  for (const key of Object.keys(SKY_REGIONS)) {
    const src = stations.find(s => s.region === key && s.regionSource)
      ?? stations.find(s => s.region === key)
    if (!src) continue
    hues[key] = (((src.hue + SKY_REGIONS[key].hueOffset) % 360) + 360) % 360
  }
  return hues
}

// Accent stations pair with a companion from the OTHER side of the palette:
// the hue anchor farthest (cyclically) from the station's own hue. Replaces
// the fixed +168, which assumed a cool world / warm accent and threw a yellow
// accent's companion into cyan under a red/yellow palette. No random draw —
// the seeded stream must not change.
export function accentCompanionHue(stationHue, hueAnchors) {
  if (!hueAnchors?.length) return stationHue + 168
  let best = hueAnchors[0].deg, bestD = -1
  for (const a of hueAnchors) {
    const d = 180 - Math.abs(((a.deg - stationHue) % 360 + 540) % 360 - 180) // cyclic distance 0..180
    if (d > bestD) { bestD = d; best = a.deg }
  }
  return best
}
```

(Corrected 2026-09-02 after Task 1: the first draft inverted the distance and picked the NEAREST anchor. The pins in 1e are the authority.)

### 1c. Thread hues through the two consumers in `ringPrimitives.js`

- `makeSkyTints(el)` → `makeSkyTints(el, regionHues)`; inside, `skyTintBackground({ ...SKY_REGIONS[key], hue: regionHues[key] })`.
  Skip a region with no hue (no member station) — do not create a tint layer for it.
- `makeSourceGlow(el, engine, regionKey, x0, cx, cy, size)` → add `hue` param after `regionKey`; use it
  where `cfg.hue` was read.
- Update the two bound wrappers in `ringDom()` (~line 3228) to forward the new params:
  `makeSkyTints: (regionHues) => makeSkyTints(el, regionHues)` and
  `makeSourceGlow: (regionKey, hue, x0, cx, cy, size) => ...`.
- `skyRegionWeights` is unchanged.

### 1d. Call sites — both builds, identical change

`RingAmbient.jsx`:
- Where `worldData.stations` is first available in the mount effect, compute
  `const regionHues = skyRegionHues(worldData.stations)` (import it next to `SKY_REGIONS`).
- ~line 447: `if (st.regionSource && SKY_REGIONS[st.region])` → keep, and pass
  `regionHues[st.region]` as the new second arg of `dom.makeSourceGlow(...)`.
- ~line 691: `dom.makeSkyTints()` → `dom.makeSkyTints(regionHues)`.
- ~line 525: `const compHue = st.accent ? accentCompanionHue(st.hue, worldData.hueAnchors) : st.hue + lerp(-18, 18, rCompanion())`.
  NOTE the `rCompanion()` call must still happen exactly once on the non-accent branch and zero times on
  the accent branch — that is the existing behavior (`lerp(...)` only evaluated when `!st.accent`).
  Confirm by reading the original line: `st.hue + (st.accent ? 168 : lerp(-18, 18, rCompanion()))`.

`concepts/world-07-ring.html`: same three edits at lines ~262 (import list: add `skyRegionHues,
accentCompanionHue`), ~462 (next to `skyWeights`, add `const regionHues = skyRegionHues(WORLD.stations);`),
~872 (`makeSourceGlow`), ~991 (`compHue`), ~1210 (`makeSkyTints(regionHues)`). Each edit gets a one-line
`// 2026-09-02 palette-aware, synced with RingAmbient.jsx` comment, matching the file's existing style.

### 1e. Tests — `client/src/lib/skyRegions.test.js`, add:

```js
import { skyRegionHues, accentCompanionHue, SKY_REGIONS } from './ringPrimitives.js'

describe('skyRegionHues', () => {
  it('reproduces the shipped region hues from the shipped station data', () => {
    expect(skyRegionHues(midnightGalaxyRing.stations)).toEqual({ aurora: 152, ember: 26, disco: 300 })
  })
  it('follows the source station when its hue moves', () => {
    const stations = midnightGalaxyRing.stations.map(s => s.key === 'pulsar' ? { ...s, hue: 10 } : s)
    expect(skyRegionHues(stations).aurora).toBe(42)
  })
  it('omits a region with no member station', () => {
    expect(skyRegionHues([{ hue: 5 }])).toEqual({})
  })
  it('SKY_REGIONS carries no hardcoded hue', () => {
    for (const cfg of Object.values(SKY_REGIONS)) expect(cfg).not.toHaveProperty('hue')
  })
})

describe('accentCompanionHue', () => {
  const anchors = midnightGalaxyRing.hueAnchors // 276, 214, 140
  it('picks the anchor farthest from the station hue', () => {
    expect(accentCompanionHue(28, anchors)).toBe(214)   // amber planet
    expect(accentCompanionHue(330, anchors)).toBe(140)  // rose nebula
    expect(accentCompanionHue(36, anchors)).toBe(214)   // supernova
  })
  it('two-color palette: the other color', () => {
    const ry = [{ deg: 0, window: 25 }, { deg: 55, window: 25 }]
    expect(accentCompanionHue(58, ry)).toBe(0)
    expect(accentCompanionHue(3, ry)).toBe(55)
  })
  it('falls back to +168 with no anchors', () => {
    expect(accentCompanionHue(30, [])).toBe(198)
  })
})
```

### 1f. Verify

1. `npm run test:unit` green.
2. `RING_VERIFY_SKIP_LIVE=1 npm run verify:ring` — regression tier all green; record spec-tier count.
3. Render proof: the gate leaves per-station PNGs under `concepts/.audit-shots/ring-verify-<ts>/`. Report
   the directory path. Eyeball st4/st5 (aurora), st12 (ember), st10 (disco): sky colors unchanged.
4. Commit: `Ring: sky regions + accent companions derive hue from the palette (was hardcoded)` — stage the
   4 files by name.

---

## Task 2: Node-runnable palette engine + `scripts/ring-recolor.mjs`

**Files:** `client/src/lib/oklab.js` (new), `client/src/jukebox/components/AlbumGradientMesh.jsx`,
`client/src/lib/weightedPalette.js`, `client/src/lib/weightedPalette.test.js`,
`client/src/lib/ringRecolor.js` (new), `client/src/lib/ringRecolor.test.js` (new), `scripts/ring-recolor.mjs` (new).

### 2a. Extract pure color math so `weightedPalette.js` imports no JSX

Move `hexToRgb`, `shortestDelta`, `lerpOklabPolar`, `rgbToOklab`, `oklabToRgb` (and any pure helper
they call) from `AlbumGradientMesh.jsx` into `client/src/lib/oklab.js`, byte-identical bodies.
`AlbumGradientMesh.jsx` imports them from there and re-exports them (`export { ... } from
'../../lib/oklab.js'`) so `StationRingLayer.jsx`'s import keeps working untouched.
`weightedPalette.js` and `weightedPalette.test.js` import from `../lib/oklab.js` / `./oklab.js`.
Proof it's pure: `node -e "import('./client/src/lib/weightedPalette.js').then(m => console.log(Object.keys(m)))"`
from the repo root prints the export list.

### 2b. `derivePalette`: `baseTheme` optional

`themeColors` becomes `baseTheme ? { ...as today } : null`. Nothing else changes. Existing tests pass
`baseTheme` and are unaffected.

### 2c. Freeze `CURRENT_HUES` in `weightedPalette.test.js`

Replace `const CURRENT_HUES = midnightGalaxyRing.stations.map(s => s.hue)` with the literal
`[256, 170, 268, 28, 140, 120, 330, 208, 214, 160, 300, 196, 36]` and drop the `midnightGalaxyRing`
import if nothing else uses it. Comment: the algorithm assertions describe THIS fixture, not the live
world — a recolor must not break the engine's own tests.

### 2d. `client/src/lib/ringRecolor.js` — pure text transforms

```js
export function readStationHues(ringJsSource)        // → [{ key, constName, hue }] ×13, in station order
export function rewriteRingJs(ringJsSource, hues, anchors)   // → new source
export function rewriteHtml(htmlSource, stationsByKey, anchors) // → new source
export function rewriteHuePin(testSource, stationsByKeyHue)  // → new source (midnightGalaxy.ring.test.js)
export function formatPlan(rows, warnings)             // → string table for the CLI
```

Rules for the transforms:
- `readStationHues`: parse `export const (\w+_HUE)\s*=\s*(\d+)` lines AND the `stations: [` block's
  `key: '...'` / `hue: (\w+_HUE)` pairs, in order; return the 13 rows. Throw if count ≠ 13 or a
  constant is unreferenced — a silent partial rewrite is the failure mode this replaces.
- `rewriteRingJs`: replace each constant's number in place (preserve alignment spaces); replace the
  whole `hueAnchors: [ ... ],` block with `hueAnchors: [\n    { deg: N, window: 25 },\n ... ],` plus a
  one-line comment `// written by scripts/ring-recolor.mjs — do not hand-edit`.
- `rewriteHtml`: for each station key, find the line containing `key:'<key>'` inside `stations: [` and
  replace its `hue:\s*\d+` with the new value; throw if a key is missing. Replace its `hueAnchors: [ ... ],`
  block the same way, keeping the existing "mirrors midnightGalaxy.ring.js" comment above it.
- `rewriteHuePin`: rewrite the `[key, hue]` pairs in the `toEqual([...])` literal.
- Every rewrite function is pure: string in, string out. No fs.

### 2e. `scripts/ring-recolor.mjs`

```
node scripts/ring-recolor.mjs --colors '#ff0000,#ffea00' --weights '0.55,0.45'          # dry run: prints table + warnings
node scripts/ring-recolor.mjs --colors '#ff0000,#ffea00' --weights '0.55,0.45' --write  # writes 3 files
```

- 2 or 3 colors; weights optional (default equal), must match color count, normalized.
- Reads `client/src/worlds/midnightGalaxy.ring.js` as text → `readStationHues` → `currentHues`.
- Calls `derivePalette({ colors, weights, stationCount: 13, currentHues })` (no baseTheme).
- Prints: one row per station `st<i> <key> <old>→<new>`, then `derived.warnings`, then the sky-region
  hues the new world will produce (`skyRegionHues` on stations with new hues — import from
  `ringPrimitives.js`; if that module cannot load under node, compute inline from `SKY_REGIONS` and
  say so in the report) and the accent companions for the 3 accent stations.
- `--write`: rewrites `client/src/worlds/midnightGalaxy.ring.js`, `concepts/world-07-ring.html`,
  `client/src/worlds/midnightGalaxy.ring.test.js`; then prints the next command verbatim:
  `npm run test:unit && npm run verify:ring`.
- Refuses to write if `git status --porcelain` shows any of the 3 target files already modified
  (protects another session's in-flight edit). Message names the file.
- Exit 1 on any thrown parse error; never write partially (compute all three new strings first, then
  write all three).

### 2f. Tests — `ringRecolor.test.js`

- Round-trip: `readStationHues(realRingJs)` returns the 13 shipped rows (read the real file with `fs`
  in the test — vitest allows it).
- `rewriteRingJs(realRingJs, sameHues, sameAnchors)` → re-parsing gives identical hues; anchors block
  present once.
- `rewriteHtml(realHtml, ...)`: every one of the 13 keys' `hue:` changes to the new value; the rest
  of the file is byte-identical outside those 13 lines and the anchors block (assert by line diff count).
- Throws on a source missing a station.
- `--write` refusal path: unit-test the guard function with a fake porcelain string.

### 2g. Verify

`npm run test:unit` green; the node import proof from 2a; a dry run with the red/yellow example prints
13 rows and the warnings. Commit: `Add scripts/ring-recolor.mjs: one command writes both world files
from a weighted palette`. Stage by name.

---

## Task 3: WorldPaletteEditor hands Ben the command

**File:** `client/src/components/host/WorldPaletteEditor.jsx`.

- Delete the `TODO(Task 4, post-show)` header comment; replace with two lines pointing at
  `scripts/ring-recolor.mjs`.
- Replace the "The hue column is a preview only. Applying these hues to the real ring is a …" panel
  (~line 305) with: a read-only `<code>` block containing
  `node scripts/ring-recolor.mjs --colors '<c1>,<c2>[,<c3>]' --weights '<w1>,<w2>[,<w3>]' --write && npm run test:unit && npm run verify:ring`
  built from the CURRENT committed colors/weights (2 decimals), a "Copy command" button
  (`navigator.clipboard.writeText`, flips to "Copied ✓" for 1.5s), and one sentence in plain words:
  "Paste this to Claude to recolor the ring itself. The theme half above applies instantly; the ring
  half needs a code change and a gate run."
- No other UI changes. The right rail / content rule doesn't apply (this is a modal).
- Verify: `npm run test:unit`; `npm run build` clean. Commit: `WorldPaletteEditor: copyable
  ring-recolor command replaces the dead-end preview note`.

---

## Task 4: Controller verification (not a subagent)

1. `node scripts/ring-recolor.mjs --colors '#ff0000,#ffea00' --weights '0.55,0.45'` — dry, compare to
   `88399d7`'s hues (should match: same engine, same inputs).
2. `--write`, `npm run test:unit`, full `npm run verify:ring` (react-live pass too; confirm nothing else
   on 5173 first: `lsof -nP -iTCP:5173 -sTCP:LISTEN`). Regression tier must be all green.
3. Screenshots from the gate's shot directory for st3, st4, st5, st6, st10, st12 — the six stations the
   old attempt got wrong. Copy them to `concepts/.audit-shots/recolor-red-yellow-2026-09-02/` for Ben.
   Also capture the same six on the purple baseline (before `--write`) for a before/after.
4. `git checkout -- client/src/worlds/midnightGalaxy.ring.js concepts/world-07-ring.html client/src/worlds/midnightGalaxy.ring.test.js`
   — the pipeline ships, the red/yellow palette does NOT; which palette runs live is Ben's call.
5. Final whole-branch review, then finishing-a-development-branch.

## Flags for Ben (raised, not decided here)

- Accent companion hues on the current world shift ≤ 18° (see Global Constraints). Screenshots in Task 4.
- The `[react-live]` pass of the gate shares port 5173 with any `npm run dev` — run the gate only with
  nothing else on that port.
- `88399d7` (red/yellow, old attempt) is left on its branch untouched; delete after this lands.
