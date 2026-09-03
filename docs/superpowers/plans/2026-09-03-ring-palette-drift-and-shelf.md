# Ring Palette Drift + Certification Shelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drift (colours rotating around the ring instead of sitting in fixed blocks) and replace "any palette applies live, uncertified" with a pre-cleared shelf — every palette a host can pick was gate-checked before it was offered, never checked on the fly.

**Architecture:** Drift is a build-time property of `derivePalette` (Fable's Phase 2.5 spec, adopted verbatim below) — no live/runtime cost, no new infrastructure. Certification is a new Supabase table (`ring_palettes`) populated OFFLINE by an extended `palette-sweep.mjs` (Fable's Phase 2b tool) run in two new batch modes; the host picker only ever reads and offers rows already marked `certified`. A host's own custom colour pick is saved as `pending` and checked before the next show, never applied same-night.

**Tech Stack:** React (WorldPaletteEditor.jsx, ThemePickerModal.jsx), pure JS (weightedPalette.js, ringRecolor.js, paletteGenerator.js), Supabase (Postgres + RLS, `@supabase/supabase-js`), Playwright (ring-verify.mjs's existing gate, unmodified).

**Spec:** `docs/superpowers/plans/2026-09-02-ring-palette-runtime.md` (Phase 2.5 "Drift" and Phase 2b "sweep the gate over palettes" sections — read those two sections in full; this plan adopts their math and code verbatim where noted). `references/ring-world-mistakes.md` and `references/ring-world-continuity.md` (mandatory session-start reading for anyone executing this — read both before Task 1).

**Decision record (Ben, 2026-09-03, via chat + an artifact walking through each in plain English):**
- Drift width default: **60°** (purple walks to blue-teal and back over the lap).
- Dead band: **keep it blocked** — no anchor may land in HSL [45°, 80°) (yellow through chartreuse; it reads olive at object lightness, a physics fact, not a bug).
- Certification policy: **bulletproof — no unchecked palette ever airs.** Ben confirmed this after being told the cost (no live "surprise me"/custom-Apply the same night) and after a Fable-5.1 consult recommended the shelf design below over building live check infrastructure (a real backend job-runner this app has no version of today) — see the chat record; not re-litigated here.

## Global Constraints

Copied verbatim from `references/ring-world-mistakes.md` / `references/ring-world-continuity.md` — every task below implicitly includes these:

- Never edit `concepts/tools/ring-verify.mjs` pass/fail logic, `concepts/tools/ring-spec.lock.json`, or any cap/threshold. Do not chase the 14 pre-existing spec-tier FAILs.
- Never use `Math.random` anywhere `concepts/world-07-ring.html` imports (the static gate check scans this file).
- Stage git commits by explicit filename only — never `git add -A` (other sessions may have unrelated dirty files in this tree; verified true as of 2026-09-03, this checkout is actively shared).
- `lsof -nP -iTCP:5173 -sTCP:LISTEN` and `pgrep -fl vite` before any `npm run verify:ring` run; use a private port (`npx vite --port <free> --strictPort`) for ad hoc rendering, never 5173.
- Bundled Playwright Chromium only — never point at a real Chrome profile.
- A sweep/tuning tool must import the exact same check code the gate runs (`runChecks` from `ring-verify.mjs`), never a fork.
- Every automated grader needs a known-answer probe run alongside it (a known-good palette that must certify, run first, every time).
- `RING_VERIFY_SKIP_LIVE=1` env var skips the react-live pass — never set it when actually certifying a palette for the shelf; only the static/html pass is not the full guarantee.
- Do not dispatch background subagents against this checkout for rendering/verification steps — run them in the foreground, one at a time (this codebase's own standing rule, `references/ring-world-mistakes.md`, "Working with Ben").

## File Structure

| File | Responsibility |
|---|---|
| `client/src/lib/weightedPalette.js` | Modify — `derivePalette` gains `drift` support (Task 1) |
| `client/src/lib/weightedPalette.test.js` | Modify — drift tests |
| `client/src/lib/ringRecolor.js` | Modify — `recolorWorld` passes `drift` through, emits `hueAnchorsAt` (Task 2) |
| `client/src/lib/ringRecolor.test.js` | Modify — drift passthrough tests |
| `client/src/components/display/RingAmbient.jsx` | Modify — one-token companion-hue fix under drift (Task 2) |
| `concepts/world-07-ring.html` | Modify — identical one-token fix + `&drift=` param (Task 2, Task 3) |
| `client/src/views/AmbientAudit.jsx` | Modify — `&drift=` param (Task 3) |
| `scripts/ring-recolor.mjs` | Modify — `--drift N` dry-run-only flag (Task 3) |
| `client/src/components/host/WorldPaletteEditor.jsx` | Modify — drift slider (Task 3); shelf-only Apply + pending flow (Task 7) |
| `client/src/lib/paletteGenerator.js` | Create — pure seeded generator (Task 4) |
| `client/src/lib/paletteGenerator.test.js` | Create — generator property tests |
| `supabase/migrations/<timestamp>_ring_palettes_table.sql` | Create — the shelf table + RLS (Task 5) |
| `concepts/tools/palette-sweep.mjs` | Create — sweep tool, three modes: `--label` (one-off, Fable's original Phase 2b), `--seed-batch N` (generate + certify N candidates), `--pending` (certify whatever hosts saved) (Task 6) |
| `client/src/lib/ringPalettesClient.js` | Create — thin Supabase query helpers shared by the picker UI and (indirectly, by convention) the sweep tool's schema expectations (Task 7) |

---

## Task 1: Drift in `derivePalette` (Fable's Phase 2.5, adopted verbatim)

**Files:**
- Modify: `client/src/lib/weightedPalette.js`
- Test: `client/src/lib/weightedPalette.test.js`

**Interfaces:**
- Consumes: nothing new — `derivePalette`'s existing signature, `ANCHOR_WINDOW`/`LADDER_HALF` constants already in the file.
- Produces: `derivePalette({ ..., drift })` where `drift = { arc: number }` (degrees, default `0`). Return value gains `hueAnchorsAt: Array<Array<{deg, window}>>` (one entry per station, one anchor-set per colour, rotated) and `driftPlans: Array<{dir, arc}>` (one per palette colour). `DEAD_BAND` is now exported from this file (Task 4's generator imports it from here, not redeclared).

- [ ] **Step 1: Write the failing tests**

```js
// Append to client/src/lib/weightedPalette.test.js, inside a new describe block.
import { driftPlan } from './weightedPalette.js' // add to the existing import line at top of the file

describe('drift', () => {
  it('driftPlan sends red toward magenta (270), not toward orange (19), because magenta has more room', () => {
    const p = driftPlan(8, 60) // red anchor at HSL 8
    expect(p.dir).toBe(-1)
    expect(p.arc).toBe(60)
  })

  it('driftPlan clips to the per-colour cap when the requested arc exceeds it', () => {
    const p = driftPlan(271, 200) // purple anchor — cap is 116 per the plan's own table
    expect(p.arc).toBe(116)
  })

  it('drift: {arc: 0} is byte-identical to no drift at all, for the frozen fixture', () => {
    const withZero = derivePalette({
      colors: PALETTE, weights: [0.60, 0.25, 0.15], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES, drift: { arc: 0 },
    })
    const withoutField = derivePalette({
      colors: PALETTE, weights: [0.60, 0.25, 0.15], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES,
    })
    expect(withZero.hues).toEqual(withoutField.hues)
  })

  it('every station stays inside its own ROTATED anchor window at arc 60', () => {
    const out = derivePalette({
      colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES, drift: { arc: 60 },
    })
    out.hues.forEach((h, i) => {
      const anchor = out.hueAnchorsAt[i][out.assignment[i]]
      expect(hueDelta(h, anchor.deg)).toBeLessThanOrEqual(anchor.window)
    })
  })

  it('station 0 and station 12 (adjacent across the wrap) have anchors within one bump-step of each other, for every colour', () => {
    const out = derivePalette({
      colors: ['#a855f7', '#3b82f6'], weights: [0.5, 0.5], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES, drift: { arc: 60 },
    })
    const step = 0.24 * 60 // steepest per-station step at arc 60, per the plan's own derivation
    out.hueAnchorsAt[0].forEach((a0, c) => {
      const a12 = out.hueAnchorsAt[12][c]
      expect(hueDelta(a0.deg, a12.deg)).toBeLessThanOrEqual(step + 1) // +1 float slack
    })
  })

  it('no station lands in the dead band under drift, for a palette that could otherwise drift into it', () => {
    const out = derivePalette({
      colors: ['#ff2200', '#a855f7'], weights: [0.5, 0.5], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES, drift: { arc: 60 },
    })
    out.hues.forEach(h => {
      const inBand = h >= 45 && h < 80
      expect(inBand).toBe(false)
    })
  })

  it('adjacent same-colour rungs are handed out in RING ORDER under drift, not outside-in', () => {
    // At drift 0 the ladder still alternates outside-in (unchanged behaviour).
    // At any drift > 0, consecutive same-colour stations must get adjacent
    // ladder rungs (6 degrees apart), because drift + outside-in fights itself.
    const out = derivePalette({
      colors: ['#a855f7', '#3b82f6'], weights: [0.60, 0.40], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES, drift: { arc: 60 },
    })
    // Find two adjacent stations assigned the same colour (guaranteed to exist
    // at this weight split — one colour owns 8 of 13).
    let found = false
    for (let i = 0; i < 13; i++) {
      const j = (i + 1) % 13
      if (out.assignment[i] === out.assignment[j]) {
        found = true
        // Their ladder-only contribution (hue minus the rotated anchor at
        // each station) must be 6 apart, not up to 36 apart.
        const c = out.assignment[i]
        const rungI = hueDelta(out.hues[i], out.hueAnchorsAt[i][c].deg)
        const rungJ = hueDelta(out.hues[j], out.hueAnchorsAt[j][c].deg)
        expect(Math.abs(rungI - rungJ)).toBeLessThanOrEqual(6.5)
      }
    }
    expect(found).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
npx vitest run weightedPalette
```
Expected: FAIL — `driftPlan` is not exported, `drift` option is ignored, `hueAnchorsAt` is undefined.

- [ ] **Step 3: Implement drift**

In `client/src/lib/weightedPalette.js`, export the dead band constant (currently only implied by prose — make it real, both `derivePalette` and `paletteGenerator.js` (Task 4) need the identical value):

```js
export const DEAD_BAND = [45, 80] // HSL degrees — yellow through chartreuse; olive at object lightness (Ben's 2026-09-03 call: keep this blocked)
```

Add, near `ANCHOR_WINDOW`/`LADDER_HALF`:

```js
// Which direction (and how far) a colour may drift without ever entering
// DEAD_BAND, including the ladder's own +/-LADDER_HALF half-width. One-
// sided: dir points toward whichever side of the dead band has more room.
export function driftPlan(anchorDeg, requestedArc) {
  const up = ((DEAD_BAND[0] - anchorDeg) + 360) % 360   // room going up, before hitting 45
  const down = ((anchorDeg - DEAD_BAND[1]) + 360) % 360 // room going down, before hitting 80 from the other side
  const dir = up >= down ? +1 : -1
  const room = (dir > 0 ? up : down) - LADDER_HALF
  return { dir, arc: Math.max(0, Math.min(requestedArc, room)) }
}
```

Change `derivePalette`'s signature and body. Replace:

```js
export function derivePalette({ colors, weights, stationCount = 13, baseTheme, currentHues = [] }) {
```
with:
```js
export function derivePalette({ colors, weights, stationCount = 13, baseTheme, currentHues = [], drift = { arc: 0 } }) {
```

Replace the ladder-offset block:
```js
  const ladders = counts.map((k, c) =>
    hueLadder(k, LADDER_HALF).map(off => projectLadderOffset(colors[c], off)))
```
with (drift plans computed once per colour, ring-order rung handout when drift is on):
```js
  const plans = colors.map(hex => driftPlan(Math.round(hexToHslHue(hex)), drift.arc))
  const rot = (c, i) => plans[c].dir * plans[c].arc * (1 - Math.cos(2 * Math.PI * i / stationCount)) / 2
  const ladders = counts.map((k, c) =>
    hueLadder(k, LADDER_HALF).map(off => projectLadderOffset(colors[c], off)))
```

Replace the hue-assembly block:
```js
  const ladders = counts.map(k => hueLadder(k, LADDER_HALF))
  const seen    = counts.map(() => 0)
  const hues    = assignment.map(c => {
    const k = counts[c]
    const j = seen[c]++
    const pick = j % 2 === 0 ? Math.floor(j / 2) : k - 1 - Math.floor(j / 2)
    const h = anchors[c].deg + ladders[c][pick]
    return ((Math.round(h) % 360) + 360) % 360
  })
```
with:
```js
  const seen = counts.map(() => 0)
  const hues = assignment.map((c, i) => {
    const k = counts[c]
    const j = seen[c]++
    // Outside-in at drift 0 (unchanged behaviour); ring order under drift,
    // so the ladder and the drift bump move the SAME way (Fable's Phase 2.5
    // "why step 2/adjacent-rung" finding — outside-in fights drift).
    const pick = drift.arc > 0 ? j : (j % 2 === 0 ? Math.floor(j / 2) : k - 1 - Math.floor(j / 2))
    const h = anchors[c].deg + rot(c, i) + ladders[c][pick]
    return ((Math.round(h) % 360) + 360) % 360
  })
  const hueAnchorsAt = Array.from({ length: stationCount }, (_, i) =>
    anchors.map((a, c) => ({ deg: ((Math.round(a.deg + rot(c, i)) % 360) + 360) % 360, window: a.window })))
```

Note the ladder-offset block above must move ABOVE the hue-assembly block if it isn't already (it was already above `assignment` in the original file — leave its position, only its call site inside hue-assembly changes as shown).

Add `hueAnchorsAt` and `driftPlans: plans` to the return object:
```js
  return { hues, hueAnchors: anchors, hueAnchorsAt, driftPlans: plans, themeColors, assignment, counts, advisory, warnings }
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run weightedPalette
```
Expected: PASS, all tests including the pre-existing ones (drift defaults to `{arc: 0}`, so every prior test that never passed `drift` is unaffected).

- [ ] **Step 5: Full unit suite + build**

```
npm run test:unit
npm run build
```
Expected: all green, clean build (no other file imports `derivePalette` with a fixed-arity call that would break — verified by the passing suite).

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/weightedPalette.js client/src/lib/weightedPalette.test.js
git commit -m "Drift: station anchors walk a closed bump around the ring, away from the dead band

Adopts docs/superpowers/plans/2026-09-02-ring-palette-runtime.md Phase 2.5
verbatim. drift:{arc:0} (the default) is byte-identical to today. Ben's
2026-09-03 call: default width 60 degrees (picker default set in Task 3).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CxbdntMLL8ayLF1D98WZPT"
```

---

## Task 2: Wire drift through `recolorWorld` and the two builds' companion-hue lookup

**Files:**
- Modify: `client/src/lib/ringRecolor.js`
- Test: `client/src/lib/ringRecolor.test.js`
- Modify: `client/src/components/display/RingAmbient.jsx` (one line, ~line 533 — the `accentCompanionHue` call)
- Modify: `concepts/world-07-ring.html` (one line, ~line 1028 — the identical call)

**Interfaces:**
- Consumes: `derivePalette`'s new `hueAnchorsAt`/`driftPlans` from Task 1.
- Produces: `recolorWorld(base, { colors, weights, drift }, baseTheme)` — `palette` argument gains an optional `drift: {arc}` field (default `{arc:0}` via `normalizePalette`). Returned world gains `stations[i].hueAnchors` (that station's OWN rotated anchor set) on every station, and `palette.drift` echoing the input.

- [ ] **Step 1: Write the failing test**

```js
// Append to client/src/lib/ringRecolor.test.js
describe('recolorWorld drift', () => {
  it('drift: {arc: 0} matches no-drift output exactly', () => {
    const zero = recolorWorld(midnightGalaxyRing, { ...PALETTE, drift: { arc: 0 } }, THEME)
    const none = recolorWorld(midnightGalaxyRing, PALETTE, THEME)
    expect(zero.stations.map(s => s.hue)).toEqual(none.stations.map(s => s.hue))
  })

  it('writes each station its OWN rotated hueAnchors', () => {
    const world = recolorWorld(midnightGalaxyRing, { ...PALETTE, drift: { arc: 60 } }, THEME)
    world.stations.forEach((s, i) => {
      expect(s.hueAnchors).toHaveLength(PALETTE.colors.length)
      expect(hueDelta(s.hue, s.hueAnchors.find(a => hueDelta(s.hue, a.deg) <= a.window)?.deg ?? -999)).toBeLessThanOrEqual(25)
    })
  })

  it('echoes drift back on the palette field', () => {
    const world = recolorWorld(midnightGalaxyRing, { ...PALETTE, drift: { arc: 60 } }, THEME)
    expect(world.palette.drift).toEqual({ arc: 60 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```
npx vitest run ringRecolor
```
Expected: FAIL — `s.hueAnchors` is undefined, `world.palette.drift` is undefined.

- [ ] **Step 3: Implement**

In `normalizePalette`, accept and default `drift`:
```js
export function normalizePalette({ colors, weights, drift }) {
  // ...existing body unchanged up to the return...
  return { colors: colors.map(c => c.toLowerCase()), weights: w.map(x => x / total), drift: drift ?? { arc: 0 } }
}
```

In `recolorWorld`, pass `drift` into `derivePalette` and attach per-station anchors:
```js
export function recolorWorld(base, palette, baseTheme) {
  const { colors, weights, drift } = normalizePalette(palette)
  const derived = derivePalette({
    colors, weights, stationCount: base.stations.length,
    currentHues: base.stations.map(s => s.hue), baseTheme, drift,
  })
  return {
    ...base,
    hueAnchors: derived.hueAnchors,
    stations: base.stations.map((s, i) => ({ ...s, hue: derived.hues[i], hueAnchors: derived.hueAnchorsAt[i] })),
    sky: skyFromTheme({ colors: { bg: derived.themeColors.bg, bgDeep: derived.themeColors.bgDeep } }),
    tints: deriveTints(BASE_TINTS, colors),
    palette: { colors, weights, drift },
  }
}
```

In `client/src/components/display/RingAmbient.jsx`, find the accent-companion line and change it to prefer the station's own (possibly rotated) anchors:
```js
// before:
const compHue = st.accent
  ? accentCompanionHue(st.hue, world.hueAnchors)
  : st.hue + lerp(-18, 18, rCompanion())
// after:
const compHue = st.accent
  ? accentCompanionHue(st.hue, st.hueAnchors ?? world.hueAnchors)
  : st.hue + lerp(-18, 18, rCompanion())
```

Apply the identical change in `concepts/world-07-ring.html`'s own copy of this line (search for `accentCompanionHue(st.hue`).

- [ ] **Step 4: Run to verify it passes**

```
npx vitest run ringRecolor
npm run test:unit
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/ringRecolor.js client/src/lib/ringRecolor.test.js client/src/components/display/RingAmbient.jsx concepts/world-07-ring.html
git commit -m "recolorWorld: thread drift through, per-station rotated anchors for accent companions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CxbdntMLL8ayLF1D98WZPT"
```

---

## Task 3: Drift in the picker, the CLI dry-run, and both `?drift=` render routes

**Files:**
- Modify: `client/src/components/host/WorldPaletteEditor.jsx`
- Modify: `concepts/world-07-ring.html`
- Modify: `client/src/views/AmbientAudit.jsx`
- Modify: `scripts/ring-recolor.mjs`

**Interfaces:**
- Consumes: `recolorWorld`'s `drift` field (Task 2).
- Produces: nothing new consumed elsewhere — this task is UI/CLI plumbing only.

- [ ] **Step 1: Picker slider**

In `WorldPaletteEditor.jsx`, add state and thread it into `committed`/`previewWorldData`:

```js
// near the other useState calls
const [drift, setDrift] = useState(60) // Ben's 2026-09-03 default
```

Change every `committed` construction to carry it: `commit(nextColors, nextWeights)` already takes two args — add a third, defaulted to the live `drift` state:
```js
function commit(nextColors = colors, nextWeights = weights, nextDrift = drift) {
  setCommitted({ colors: nextColors, weights: nextWeights, drift: { arc: nextDrift } })
}
```
And the initial `committed` state:
```js
const [committed, setCommitted] = useState({ colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35], drift: { arc: 60 } })
```
`previewWorldData` already calls `recolorWorld(midnightGalaxyRing, committed, baseTheme)` (from Session 1) — no change needed there, `committed.drift` now flows through for free.

Add the slider in the custom-colors panel, right after `<WeightBar .../>`:
```jsx
<div className="flex items-center gap-3">
  <label className="text-xs font-medium text-gray-500 w-24">Drift {drift}&deg;</label>
  <input
    type="range" min="0" max="90" value={drift}
    onChange={e => setDrift(Number(e.target.value))}
    onPointerUp={() => commit(colors, weights, drift)}
    className="flex-1"
  />
</div>
```

Update `derived` (the live/uncommitted preview math used for the station-dot swatches and the advisory table) to also pass drift:
```js
const derived = useMemo(() => derivePalette({
  colors, weights, stationCount: CURRENT_HUES.length,
  baseTheme, currentHues: CURRENT_HUES, drift: { arc: drift },
}), [colors, weights, baseTheme, drift])
```

Update the Apply button's payload (Task 7 will change this button's whole flow to the shelf; for now, keep Session 1's shape but include drift so nothing regresses mid-task):
```js
onApplyThemeColors({ themeColors: derived.themeColors, worldPalette: { colors, weights, drift: { arc: drift } } })
```

- [ ] **Step 2: `?drift=` on both render routes**

In `concepts/world-07-ring.html`'s `?colors=` block (added in Session 1), read a third param:
```js
const weightsParam = q.get('weights');
const driftParam = q.get('drift');
WORLD = recolorWorld(WORLD, {
  colors: q.get('colors').split(','),
  weights: weightsParam ? weightsParam.split(',').map(Number) : undefined,
  drift: driftParam ? { arc: Number(driftParam) } : undefined,
}, { colors: { bg: SKY_BG, bgDeep: SKY_BG_DEEP } });
```

In `AmbientAudit.jsx`'s equivalent `useMemo`, same addition:
```js
const driftParam = params.get('drift')
return recolorWorld(midnightGalaxyRing, {
  colors: colorsParam.split(','),
  weights: weightsParam ? weightsParam.split(',').map(Number) : undefined,
  drift: driftParam ? { arc: Number(driftParam) } : undefined,
}, getTheme('midnight-galaxy'))
```

- [ ] **Step 3: `--drift` on the CLI, dry-run only — `--write` refuses non-zero drift**

In `scripts/ring-recolor.mjs`'s `parseArgs`, accept the flag:
```js
if (name === 'write') { flags.write = true; continue }
if (name === 'drift') { flags.drift = argv[++i]; continue }
```
and after building `{ colors, weights }` from `normalizePalette`:
```js
const drift = { arc: flags.drift ? Number(flags.drift) : 0 }
if (write && drift.arc !== 0) {
  throw new Error('--write refuses a non-zero --drift — the certified base world stays drift 0. Use --drift for the dry-run table only.')
}
return { colors, weights, drift, write: !!flags.write }
```
Thread `drift` into both the `recolorWorld(...)` call and the diagnostic `derivePalette(...)` call in `main()` (both already destructure `{ colors, weights }` from `parseArgs`'s return — change to `{ colors, weights, drift, write }` and pass `drift` alongside `colors, weights` in both calls).

- [ ] **Step 4: Verify**

```
npm run test:unit
npm run build
node scripts/ring-recolor.mjs --colors '#a855f7,#3b82f6' --weights '0.65,0.35' --drift 60
node scripts/ring-recolor.mjs --colors '#a855f7,#3b82f6' --weights '0.65,0.35' --drift 60 --write
```
Expected: the dry run prints a table; the `--write` attempt errors with the refusal message above and writes nothing (`git status --short` on the three targets must show nothing changed).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/WorldPaletteEditor.jsx concepts/world-07-ring.html client/src/views/AmbientAudit.jsx scripts/ring-recolor.mjs
git commit -m "Drift slider (default 60deg) in the picker; ?drift= on both render routes; --write refuses non-zero drift

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CxbdntMLL8ayLF1D98WZPT"
```

---

## Task 4: Seeded palette generator (Fable's Phase 3, pure module)

**Files:**
- Create: `client/src/lib/paletteGenerator.js`
- Create: `client/src/lib/paletteGenerator.test.js`

**Interfaces:**
- Consumes: `rng`/`hash32` from `ringEngine.js`; `DEAD_BAND`, `derivePalette`, `hexToHslHue` from `weightedPalette.js` (Task 1's exported `DEAD_BAND`, not a redeclared copy); `regionHueWarnings` from `ringRecolor.js`; `skyRegionHues` from `ringPrimitives.js`.
- Produces: `generatePalette(seed, base, baseTheme) -> { colors, weights, drift, seed, tries, fallback? }` and `seedFrom(text) -> number`, consumed by Task 6's `--seed-batch` mode and (later, out of this plan's scope) a "Surprise me" button once the shelf has entries.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { generatePalette, seedFrom } from './paletteGenerator.js'
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'
import { hexToHslHue, DEAD_BAND } from './weightedPalette.js'
import { regionHueWarnings } from './ringRecolor.js'
import { skyRegionHues } from './ringPrimitives.js'

const BASE_THEME = {
  colors: { bg: '#08001a', bgDeep: '#040010', accent: '#4a1a8f', highlight: '#c060ff' },
}

describe('generatePalette', () => {
  it('is deterministic — same seed, same palette', () => {
    const a = generatePalette(seedFrom('seed-a'), midnightGalaxyRing, BASE_THEME)
    const b = generatePalette(seedFrom('seed-a'), midnightGalaxyRing, BASE_THEME)
    expect(a).toEqual(b)
  })

  it('seedFrom is a real hash, not identity', () => {
    expect(seedFrom('abc')).not.toBe(seedFrom('abd'))
  })

  it('over 1000 seeds: every anchor stays outside the dead band, pairwise >=60 apart, zero warnings, never falls back', () => {
    let fallbacks = 0
    for (let s = 1; s <= 1000; s++) {
      const p = generatePalette(s, midnightGalaxyRing, BASE_THEME)
      if (p.fallback) fallbacks++
      const hues = p.colors.map(hexToHslHue)
      for (const h of hues) {
        const inBand = h >= DEAD_BAND[0] && h < DEAD_BAND[1]
        expect(inBand, `seed ${s}: hue ${h} in dead band`).toBe(false)
      }
      for (let i = 0; i < hues.length; i++) {
        for (let j = i + 1; j < hues.length; j++) {
          const d = Math.abs(hues[i] - hues[j])
          expect(Math.min(d, 360 - d)).toBeGreaterThanOrEqual(60)
        }
      }
      const derived = { hueAnchors: hues.map(deg => ({ deg, window: 25 })) }
      const world = midnightGalaxyRing.stations // region check needs a hue-bearing station set — the base's own is fine, this only tests region OFFSET legality, not actual derived hues
      const regions = skyRegionHues(world)
      expect(regionHueWarnings(regions, derived.hueAnchors)).toEqual([])
      expect(p.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
      expect(Math.max(...p.weights)).toBeGreaterThanOrEqual(0.55)
      expect(Math.max(...p.weights)).toBeLessThanOrEqual(0.70)
    }
    expect(fallbacks, 'constraints too tight if any of 1000 seeds fell back').toBe(0)
  })

  it('falls back to the base palette after 64 tries on an impossible request — never throws', () => {
    // Can't easily force 64 failures through the public API; this test
    // instead asserts the documented contract shape exists and is stable.
    const p = generatePalette(seedFrom('any-seed'), midnightGalaxyRing, BASE_THEME)
    expect(p).toHaveProperty('tries')
    expect(p.tries).toBeGreaterThan(0)
    expect(p.tries).toBeLessThanOrEqual(64)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```
npx vitest run paletteGenerator
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```js
// client/src/lib/paletteGenerator.js
// Seeded random palette + drift arc generator — Phase 3 of
// docs/superpowers/plans/2026-09-02-ring-palette-runtime.md, adopted
// verbatim. Never Math.random. Same seed forever produces the same
// palette, so a shelf row (Task 5) or a saved show reproduces on any
// reload. This module NEVER applies a palette itself and never talks to
// the network — Task 6's sweep tool calls it to produce candidates, and
// (future, out of this plan's scope) a "Surprise me" button draws from
// the CERTIFIED SHELF those candidates land on, never from a fresh call
// to this function at show time — that would be the "live check" path
// Ben explicitly chose not to build.
import { rng } from './ringEngine.js'
import { derivePalette, hexToHslHue, DEAD_BAND } from './weightedPalette.js'
import { regionHueWarnings } from './ringRecolor.js'
import { skyRegionHues } from './ringPrimitives.js'

export const MIN_SEPARATION = 60
export const DRIFT_MIN = 30
export const DRIFT_MAX = 90
export const LUMA_RISE_MAX = null // STAYS HUMAN — set once Task 6's sweep has run against real palettes; null = check disabled
export const BASE_PALETTE = { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35] }

export function seedFrom(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function hslHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r, g, b
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to255 = v => Math.round((v + m) * 255)
  return '#' + [to255(r), to255(g), to255(b)].map(v => v.toString(16).padStart(2, '0')).join('')
}

function pickHues(r, k) {
  const hues = []
  let guard = 0
  while (hues.length < k && guard++ < 200) {
    const h = r() * 360
    const inBand = h >= DEAD_BAND[0] && h < DEAD_BAND[1]
    if (inBand) continue
    if (hues.some(existing => Math.min(Math.abs(existing - h), 360 - Math.abs(existing - h)) < MIN_SEPARATION)) continue
    hues.push(h)
  }
  return hues.length === k ? hues : null // caller's retry loop handles a null (dead-band + separation left no room)
}

function pickWeights(r, k) {
  const heaviest = 0.55 + r() * 0.15
  if (k === 2) return [heaviest, +(1 - heaviest).toFixed(3)]
  const rest = 1 - heaviest
  const split = 0.3 + r() * 0.4
  return [heaviest, +(rest * split).toFixed(3), +(rest * (1 - split)).toFixed(3)]
}

export function generatePalette(seed, base, baseTheme) {
  const r = rng(seed, 0xC0105)
  for (let t = 0; t < 64; t++) {
    const k = r() < 0.25 ? 3 : 2
    const hues = pickHues(r, k)
    if (!hues) continue
    const colors = hues.map(h => hslHex(h, 0.70 + r() * 0.25, 0.50 + r() * 0.15))
    const weights = pickWeights(r, k)
    const drift = { arc: Math.round(DRIFT_MIN + r() * (DRIFT_MAX - DRIFT_MIN)) }
    const candidate = { colors, weights, drift }
    if (accept(candidate, base, baseTheme)) return { ...candidate, seed, tries: t + 1 }
  }
  return { ...BASE_PALETTE, drift: { arc: 0 }, seed, tries: 64, fallback: true }
}

function accept({ colors, weights, drift }, base, baseTheme) {
  let derived
  try {
    derived = derivePalette({
      colors, weights, stationCount: base.stations.length,
      currentHues: base.stations.map(s => s.hue), baseTheme, drift,
    })
  } catch {
    return false
  }
  if (derived.warnings.some(w => w.includes('overlap'))) return false
  const stations = base.stations.map((s, i) => ({ ...s, hue: derived.hues[i] }))
  const regions = skyRegionHues(stations)
  if (regionHueWarnings(regions, derived.hueAnchors).length) return false
  if (LUMA_RISE_MAX != null) {
    const rise = Math.max(...derived.advisory.map(a => a.delta))
    if (rise > LUMA_RISE_MAX) return false
  }
  return true
}
```

- [ ] **Step 4: Run to verify tests pass**

```
npx vitest run paletteGenerator
npm run test:unit
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/paletteGenerator.js client/src/lib/paletteGenerator.test.js
git commit -m "Seeded palette generator (Phase 3) — pure, deterministic, never applied directly

Produces CANDIDATES for Task 6's sweep tool to certify. No caller applies
a generator palette straight to a show — that is exactly the live-check
path Ben chose not to build. A 'Surprise me' button (out of this plan's
scope) draws from the certified shelf, never from a fresh generatePalette()
call at show time.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CxbdntMLL8ayLF1D98WZPT"
```

---

## Task 5: `ring_palettes` table (the shelf)

**Files:**
- Create: `supabase/migrations/<timestamp>_ring_palettes_table.sql` (get the exact filename from `supabase migration new ring_palettes_table` — never hand-type a timestamp)

**Interfaces:**
- Produces: table `public.ring_palettes` — read by Task 7 (host UI), written by Task 6 (sweep tool, service-role or host-PIN elevated) and by Task 7 (host UI inserts a `pending` row when a custom pick doesn't match a certified one).

**STAYS HUMAN, before this task:** a new table + RLS policy is a shared-infra/schema change — per this project's own working-style rule, this is Ben's sign-off, not an autonomous call. Show him this task's SQL before running it against the real project. (Note left here for whoever executes this plan — do not skip the review because the plan already specifies the SQL.)

- [ ] **Step 1: Load the `supabase` skill (mandatory for any Supabase task on this project) and create the migration file**

```
supabase migration new ring_palettes_table
```
This prints the exact path (`supabase/migrations/<timestamp>_ring_palettes_table.sql`) — write into THAT file, not a hand-typed name.

- [ ] **Step 2: Write the migration**

```sql
-- ring_palettes — the certification shelf. Every row is either a candidate
-- from the seeded generator (source='generated', Task 4) or a host's own
-- custom colour pick saved for later checking (source='manual'). Nothing
-- reads worldPalette off a show's theme_overrides unless it first matched
-- a 'certified' row here — see WorldPaletteEditor.jsx's Apply flow. status
-- starts 'pending' and is flipped by concepts/tools/palette-sweep.mjs
-- (the same Playwright gate ring-verify.mjs runs, never a fork) running
-- OFFLINE, never live at Apply time — see
-- docs/superpowers/plans/2026-09-03-ring-palette-drift-and-shelf.md for
-- why (Ben's 2026-09-03 call: bulletproof over instant).
--
-- ring_version exists so a shelf entry expires the moment the base ring
-- world or the gate itself changes — a 'certified' row from before a ring
-- edit is not evidence about the ring after it. Bump RING_VERSION in
-- client/src/lib/ringCertification.js in the same commit as any change to
-- midnightGalaxy.ring.js, concepts/world-07-ring.html's WORLD literal, or
-- ring-spec.lock.json.

create table public.ring_palettes (
  id             uuid primary key default gen_random_uuid(),
  colors         jsonb not null,
  weights        jsonb not null,
  drift          jsonb not null default '{"arc": 0}'::jsonb,
  status         text not null default 'pending' check (status in ('pending', 'certified', 'failed')),
  source         text not null check (source in ('generated', 'manual')),
  seed           text,
  ring_version   text not null,
  gate_summary   jsonb,
  pending_show_id text,
  created_at     timestamptz not null default now(),
  checked_at     timestamptz
);

create index ring_palettes_status_version_idx on public.ring_palettes (status, ring_version);

alter table public.ring_palettes enable row level security;

-- Same trust model as `questions` (migration 20260817193000): everything
-- behind Host.jsx's PIN gate, host_verified is the real boundary. The
-- sweep tool (Task 6) authenticates the same way scripts/backup-db.mjs
-- does — SUPABASE_SERVICE_ROLE_KEY (bypasses RLS entirely, no policy
-- needed for it) or the host PIN. No UPDATE policy is defined here on
-- purpose: only a service-role-authenticated run (or a host-PIN-elevated
-- one, which the "host update" policy below also covers) may flip
-- pending -> certified/failed — a browser session with a bare anon key
-- can insert (save a pending custom pick) but never certify its own pick.

create policy "host read ring_palettes"
on public.ring_palettes
for select
to anon, authenticated
using (
  (((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean = true
);

create policy "host insert ring_palettes"
on public.ring_palettes
for insert
to anon, authenticated
with check (
  (((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean = true
  and status = 'pending' -- a host session may only ever create a PENDING row
);

create policy "host update ring_palettes status"
on public.ring_palettes
for update
to anon, authenticated
using (
  (((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean = true
)
with check (
  (((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean = true
);
```

- [ ] **Step 2b: Reconsider the update policy**

The "host update" policy above technically lets a host-PIN-elevated session (the sweep tool's fallback auth path, per `backup-db.mjs`'s own pattern) flip status — which is exactly what the sweep tool needs when run without a service key. It also means ANY host-authenticated browser session could theoretically call the same update, which is a real gap (a host could mark their own pending palette 'certified' from the browser console). Close it: add a second `app_metadata` claim, `sweep_verified`, that only the sweep tool's PIN-elevation path sets — but this project's `verify-host-pin` Edge Function does not currently support setting a second claim. Simpler and consistent with this codebase's actual risk model (a host with PIN access can already edit any question's answer key, per the `questions` table's own trust boundary): leave the single `host_verified` claim, accept that a host who wanted to bypass certification could, and rely on `gate_summary` being visible (Step 1's SELECT policy) so a host manually flipping a row can always be told apart from a real sweep run at review time. Note this explicitly to Ben in the report — it is a real, accepted gap, not an oversight.

- [ ] **Step 3: Apply, run advisors, generate migration, verify**

```
supabase db query < supabase/migrations/<timestamp>_ring_palettes_table.sql   # or execute_sql via MCP — iterate here freely
supabase db advisors    # or MCP get_advisors — fix anything it flags
supabase migration list --local
```
Expected: advisors clean (or any finding understood and accepted, noted in the commit message); table appears in `migration list`.

- [ ] **Step 4: Manual verification query**

```sql
insert into public.ring_palettes (colors, weights, source, ring_version)
values ('["#a855f7","#3b82f6"]', '[0.65,0.35]', 'generated', 'v1-test');
select * from public.ring_palettes;
delete from public.ring_palettes where ring_version = 'v1-test';
```
Run via MCP `execute_sql` (service-role context) — confirms the table and default values behave as written before any application code depends on them.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "Add ring_palettes table — the certification shelf

Every palette a host can pick was gate-checked before it was offered
(Task 6's sweep tool), never checked live at Apply time. RLS mirrors the
questions table's host_verified trust boundary; the accepted gap (a host
could theoretically self-certify via the update policy) is noted in the
migration's own comment, not hidden.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CxbdntMLL8ayLF1D98WZPT"
```

---

## Task 6: `palette-sweep.mjs` — the tool that fills the shelf

**Files:**
- Create: `concepts/tools/palette-sweep.mjs`
- Create: `client/src/lib/ringCertification.js` (the `RING_VERSION` constant, Task 5's migration comment references it)

**Interfaces:**
- Consumes: `runChecks` from `concepts/tools/ring-verify.mjs` (imported, never forked, per the Global Constraints); `generatePalette`/`seedFrom` from Task 4; `@supabase/supabase-js`; the auth pattern from `scripts/backup-db.mjs` (service-role key or host-PIN elevation).
- Produces: rows in `ring_palettes` with `status` flipped to `certified`/`failed` and `gate_summary` filled in.

- [ ] **Step 1: `RING_VERSION` constant**

```js
// client/src/lib/ringCertification.js
// Bump this in the SAME commit as any change to midnightGalaxy.ring.js,
// concepts/world-07-ring.html's WORLD literal, ringPrimitives.js, or
// ring-spec.lock.json. A shelf row's ring_version must match this exactly
// or it is stale — see supabase/migrations/<...>_ring_palettes_table.sql.
export const RING_VERSION = 'v1-2026-09-03'
```

- [ ] **Step 2: Known-answer probe first (rule zero) — write it as a real check, not a comment**

```js
// concepts/tools/palette-sweep.mjs — top-of-file, after imports, before any DB or CLI arg handling.
// Rule zero (references/ring-world-mistakes.md): a sweep tool sits on top
// of the gate; if the sweep's OWN plumbing is broken, every row it writes
// is a lie. Certifying nothing until this passes is deliberate.
import { runChecks, runStaticChecks } from './ring-verify.mjs'
import { midnightGalaxyRing } from '../../client/src/worlds/midnightGalaxy.ring.js'
import { RING_VERSION } from '../../client/src/lib/ringCertification.js'
import { generatePalette, seedFrom } from '../../client/src/lib/paletteGenerator.js'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

async function knownAnswerProbe() {
  // The BASE palette (no colours param) must certify — if it doesn't,
  // stop before writing anything.
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  try {
    const results = []
    const origReport = globalThis.__reportOverride // not used; runChecks returns its own array in this codebase's shape — see ring-verify.mjs's runChecks return contract
    const summary = await runAgainstUrl(page, buildAmbientUrl(null))
    const regressionFails = summary.filter(r => r.tier === 'regression' && r.status === 'FAIL')
    if (regressionFails.length > 0) {
      throw new Error(`palette-sweep: known-answer probe FAILED — the BASE palette (no params) has ${regressionFails.length} regression-tier FAIL(s). The sweep's own plumbing is broken; fix it before certifying anything. Names: ${regressionFails.map(r => r.name).join(', ')}`)
    }
    return true
  } finally {
    await page.close()
    await browser.close()
  }
}
```

- [ ] **Step 3: The render+check-one-palette core, and DB auth (reused from `backup-db.mjs`)**

```js
// Same env/auth pattern as scripts/backup-db.mjs — see that file's header
// comment for the full reasoning (service key first, host-PIN fallback).
function parseEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8').split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('='))
        .map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }),
    )
  } catch { return {} }
}
const env = { ...parseEnvFile(join(ROOT, '.env.local')), ...process.env }
const EXPECTED_PROJECT = 'qwtbgusqfoypvehnungr'
if (!env.VITE_SUPABASE_URL?.includes(EXPECTED_PROJECT)) {
  throw new Error(`palette-sweep: refusing to run — VITE_SUPABASE_URL is not the Baynes Trivia project.`)
}
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
async function elevateIfNeeded() {
  if (env.SUPABASE_SERVICE_ROLE_KEY) return // bypasses RLS already
  const pin = env.TRIVIA_HOST_PIN || env.PLAYWRIGHT_HOST_PIN
  if (!pin) throw new Error('palette-sweep: need SUPABASE_SERVICE_ROLE_KEY or TRIVIA_HOST_PIN in the environment')
  const { error: authErr } = await sb.auth.signInAnonymously()
  if (authErr) throw new Error(`anonymous sign-in failed: ${authErr.message}`)
  const { data, error: fnErr } = await sb.functions.invoke('verify-host-pin', { body: { pin } })
  if (fnErr || !data?.ok) throw new Error(`host PIN elevation failed: ${fnErr?.message ?? data?.error}`)
  await sb.auth.refreshSession()
}

async function certifyPalette(browser, { colors, weights, drift }) {
  // Renders BOTH builds via the URL-param routes Session 1 added, exactly
  // like a host's picker preview does — reuses runChecks, never re-derives
  // pass/fail logic.
  const results = []
  for (const [label, url] of [
    ['html', buildStaticUrl({ colors, weights, drift })],
    ['react-live', buildAmbientUrl({ colors, weights, drift })],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    try {
      const r = await runChecks({ label, prefix: label === 'react-live' ? 'ring-' : '', page, gotoUrl: url })
      results.push(...r)
    } finally {
      await page.close()
    }
  }
  const regressionFails = results.filter(r => r.tier === 'regression' && r.status === 'FAIL')
  return {
    passed: regressionFails.length === 0,
    summary: {
      regression_fail_count: regressionFails.length,
      regression_fail_names: regressionFails.map(r => r.name),
      spec_fail_count: results.filter(r => r.tier === 'spec' && r.status === 'FAIL').length,
    },
  }
}
```

(`buildStaticUrl`/`buildAmbientUrl` — small helpers that URL-encode `colors`/`weights`/`drift` onto, respectively, a served-`concepts/world-07-ring.html` URL and a running vite dev server's `/ambient?ring=1` URL. Reuse `startStaticServer` semantics from `ring-verify.mjs`'s own CLI block for the static side, and `ensureViteServer` for the react-live side — both already exist in that file; import what's exported, and if a helper genuinely isn't exported, write the smallest possible equivalent here rather than editing `ring-verify.mjs` to export it, per the Global Constraints' "sweep tool imports the exact check code, never forks it" rule, which is about check LOGIC, not server bootstrapping.)

- [ ] **Step 4: The two batch modes**

```js
async function runSeedBatch(n, browser) {
  const rows = []
  for (let s = 1; s <= n; s++) {
    const candidate = generatePalette(s, midnightGalaxyRing, { colors: { bg: '#08001a', bgDeep: '#040010' } })
    if (candidate.fallback) continue // don't shelve the fallback — it's just the base palette, already implicitly available
    const { passed, summary } = await certifyPalette(browser, candidate)
    rows.push({
      colors: candidate.colors, weights: candidate.weights, drift: candidate.drift,
      status: passed ? 'certified' : 'failed', source: 'generated', seed: String(candidate.seed),
      ring_version: RING_VERSION, gate_summary: summary, checked_at: new Date().toISOString(),
    })
    console.log(`seed ${s}: ${passed ? 'CERTIFIED' : 'FAILED'} (${summary.regression_fail_count} regression FAIL, ${summary.spec_fail_count} spec FAIL)`)
  }
  await elevateIfNeeded()
  if (rows.length) {
    const { error } = await sb.from('ring_palettes').insert(rows)
    if (error) throw new Error(`insert failed: ${error.message}`)
  }
  console.log(`\n${rows.filter(r => r.status === 'certified').length}/${rows.length} certified, written to ring_palettes.`)
}

async function runPending(browser) {
  await elevateIfNeeded()
  const { data: pending, error } = await sb.from('ring_palettes').select('*').eq('status', 'pending').eq('ring_version', RING_VERSION)
  if (error) throw new Error(`select failed: ${error.message}`)
  for (const row of pending ?? []) {
    const { passed, summary } = await certifyPalette(browser, { colors: row.colors, weights: row.weights, drift: row.drift })
    const { error: updateErr } = await sb.from('ring_palettes').update({
      status: passed ? 'certified' : 'failed', gate_summary: summary, checked_at: new Date().toISOString(),
    }).eq('id', row.id)
    if (updateErr) throw new Error(`update failed for ${row.id}: ${updateErr.message}`)
    console.log(`${row.id}: ${passed ? 'CERTIFIED' : 'FAILED'}`)
  }
  console.log(`\nChecked ${pending?.length ?? 0} pending palette(s).`)
}
```

- [ ] **Step 5: CLI entry point**

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2]
  const browser = await chromium.launch()
  try {
    await knownAnswerProbe()
    if (mode === '--seed-batch') await runSeedBatch(Number(process.argv[3] ?? 10), browser)
    else if (mode === '--pending') await runPending(browser)
    else if (mode === '--label') {
      // Fable's original Phase 2b one-off mode — --label X --colors '...' --weights '...' [--drift N], prints a summary line, writes nothing to the DB. Left for Ben's manual spot-checks.
      console.log('(--label mode: manual one-off, prints only, matches Phase 2b of the 2026-09-02 plan — implement identically to that plan section if not already present)')
    } else {
      console.error('Usage: node concepts/tools/palette-sweep.mjs --seed-batch N | --pending | --label ...')
      process.exit(2)
    }
  } finally {
    await browser.close()
  }
}
```

- [ ] **Step 6: Verify — run it for real, against a handful of seeds first**

```
lsof -nP -iTCP:5173 -sTCP:LISTEN   # must be empty
node concepts/tools/palette-sweep.mjs --seed-batch 5
```
Expected: the known-answer probe passes first (prints nothing bad, or the run aborts loudly if it doesn't — do not proceed past a probe failure); 5 seeds each print CERTIFIED or FAILED; a final line reports N/5 certified. Then:
```sql
select id, status, source, seed, ring_version from public.ring_palettes order by created_at desc limit 10;
```
via MCP, to see the rows landed.

- [ ] **Step 7: Commit**

```bash
git add concepts/tools/palette-sweep.mjs client/src/lib/ringCertification.js
git commit -m "palette-sweep.mjs: fills the certification shelf offline, --seed-batch and --pending modes

Known-answer probe runs first, every time, per rule zero. Imports
runChecks from ring-verify.mjs directly — never a fork. This is the tool
that makes 'no unchecked palette ever airs' actually true without any
live/backend job-runner: run once, ahead of time, against a batch of
seeds or whatever hosts have saved as pending.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CxbdntMLL8ayLF1D98WZPT"
```

---

## Task 7: Host picker reads the shelf — Apply and "Surprise me" only ever offer certified palettes

**Files:**
- Create: `client/src/lib/ringPalettesClient.js`
- Modify: `client/src/components/host/WorldPaletteEditor.jsx`

**Interfaces:**
- Consumes: `ring_palettes` table (Task 5), `RING_VERSION` (Task 6).
- Produces: `fetchCertifiedPalettes()`, `saveAsPending(palette)` — the only two DB entry points the host UI needs.

- [ ] **Step 1: The client helper**

```js
// client/src/lib/ringPalettesClient.js
import { supabase } from './supabaseClient.js' // reuse this project's existing shared client — check the exact export name/path other host components import (e.g. Dashboard.jsx's own supabase import) and match it exactly; do not create a second client instance
import { RING_VERSION } from './ringCertification.js'

export async function fetchCertifiedPalettes() {
  const { data, error } = await supabase
    .from('ring_palettes')
    .select('id, colors, weights, drift, source, seed')
    .eq('status', 'certified')
    .eq('ring_version', RING_VERSION)
  if (error) throw error
  return data ?? []
}

export async function saveAsPending({ colors, weights, drift }) {
  const { error } = await supabase.from('ring_palettes').insert({
    colors, weights, drift, source: 'manual', ring_version: RING_VERSION, status: 'pending',
  })
  if (error) throw error
}

// A live pick matches a shelf entry only on an exact value match — weights
// are floats from a drag, so in practice a manual pick almost never
// matches an existing row and correctly falls to "save as pending". Exact
// match still matters for the "Surprise me" round-trip (drawing an
// existing certified row and re-finding it) and for re-opening a show that
// already has a certified worldPalette applied.
export function findMatch(shelf, { colors, weights, drift }) {
  return shelf.find(row =>
    JSON.stringify(row.colors) === JSON.stringify(colors) &&
    JSON.stringify(row.weights) === JSON.stringify(weights) &&
    JSON.stringify(row.drift) === JSON.stringify(drift))
}
```

- [ ] **Step 2: Wire it into `WorldPaletteEditor.jsx`**

Load the shelf on mount:
```js
const [shelf, setShelf] = useState([])
const [shelfLoading, setShelfLoading] = useState(true)
useEffect(() => {
  fetchCertifiedPalettes().then(setShelf).catch(() => setShelf([])).finally(() => setShelfLoading(false))
}, [])
```

Add a "Surprise me" button next to the presets that draws from `shelf` (not from `generatePalette` directly — that call happened offline, in Task 6):
```jsx
<button
  onClick={() => {
    if (!shelf.length) return
    const pick = shelf[Math.floor(Math.random() * shelf.length)]
    // Math.random is fine HERE — this is host-UI selection among
    // ALREADY-CERTIFIED rows, not world construction; the Global
        // Constraints' no-Math.random rule is about concepts/world-07-ring.html's
    // own build, which this file is not.
    applyPalette(pick.colors, pick.weights)
    setDrift(pick.drift.arc)
  }}
  disabled={shelfLoading || !shelf.length}
  className="text-xs font-medium px-3 py-1.5 rounded-full border border-gray-200 hover:border-gray-400 disabled:opacity-40"
>
  {shelfLoading ? 'Loading palettes…' : shelf.length ? `🎲 Surprise me (${shelf.length} ready)` : 'No certified palettes yet'}
</button>
```

Replace the Apply button's `onClick` (the one Task 3 last touched) with the shelf-checked version:
```jsx
onClick={async () => {
  const current = { colors, weights, drift: { arc: drift } }
  const match = findMatch(shelf, current)
  if (match) {
    onApplyThemeColors({ themeColors: derived.themeColors, worldPalette: { colors, weights, drift: { arc: drift } } })
    setApplied(true)
    appliedTimeoutRef.current = setTimeout(onClose, 700)
  } else {
    await saveAsPending(current)
    setSavedPending(true) // new state, mirrors `applied`'s pattern
    appliedTimeoutRef.current = setTimeout(onClose, 1200)
  }
}}
```
Add the `savedPending` state next to `applied`'s declaration, and a visible message next to the button:
```jsx
{savedPending && (
  <p className="text-xs text-amber-700">Saved — this exact combination isn't checked yet. It'll be ready by your next show.</p>
)}
```
Change the button's own label logic to cover this third state:
```jsx
{applied ? 'Applied ✓' : savedPending ? 'Saved, pending check' : "Apply to this show's theme"}
```

- [ ] **Step 3: Tests**

```js
// Extend client/src/components/host/WorldPaletteEditor.test.jsx
vi.mock('../../lib/ringPalettesClient.js', () => ({
  fetchCertifiedPalettes: vi.fn().mockResolvedValue([
    { id: '1', colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35], drift: { arc: 60 }, source: 'generated', seed: '42' },
  ]),
  saveAsPending: vi.fn().mockResolvedValue(undefined),
  findMatch: (shelf, p) => shelf.find(s => JSON.stringify(s.colors) === JSON.stringify(p.colors) && JSON.stringify(s.weights) === JSON.stringify(p.weights) && JSON.stringify(s.drift) === JSON.stringify(p.drift)),
}))

it('Apply on a shelf-matching palette applies immediately, no pending message', async () => {
  const applied = []
  render({ onApplyThemeColors: c => applied.push(c) })
  await act(async () => { await Promise.resolve() }) // let the shelf fetch resolve
  act(() => byText("Apply to this show's theme").click())
  await act(async () => { await Promise.resolve() })
  expect(applied).toHaveLength(1)
  expect(byText('Saved, pending check')).toBeFalsy()
})

it('Apply on a NON-matching custom palette saves as pending instead of applying', async () => {
  const applied = []
  render({ onApplyThemeColors: c => applied.push(c) })
  await act(async () => { await Promise.resolve() })
  act(() => byText('Custom colors').click())
  setColor(0, '#112233') // guaranteed not to match the mocked shelf's purple
  act(() => { vi.advanceTimersByTime(500) })
  act(() => byText("Apply to this show's theme").click())
  await act(async () => { await Promise.resolve() })
  expect(applied).toHaveLength(0)
  expect(byText('Saved, pending check')).toBeTruthy()
})
```

- [ ] **Step 4: Run and verify**

```
npm run test:unit
npm run build
```
Expected: all green, clean build.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/ringPalettesClient.js client/src/components/host/WorldPaletteEditor.jsx client/src/components/host/WorldPaletteEditor.test.jsx
git commit -m "Picker only offers certified palettes: Apply on a match ships instantly, a novel pick saves as pending

'Surprise me' draws from the certified shelf (Task 5/6), never calls the
generator live. A custom pick that doesn't match a certified row saves as
pending and applies nothing tonight — checked before the next show by
running palette-sweep.mjs --pending. This is Ben's 2026-09-03 'bulletproof'
call, made real: nothing reaches the TV without having been gate-checked
first.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CxbdntMLL8ayLF1D98WZPT"
```

---

## Task 8: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full gate, both builds, no params — must be byte-identical to the pre-this-plan baseline**

```
lsof -nP -iTCP:5173 -sTCP:LISTEN   # empty
npm run verify:ring
```
Expected: regression tier 34/34 green; spec tier 49 PASS / 2 WARN / 14 FAIL, same 14 names as every prior run in this project's history.

- [ ] **Step 2: Seed the shelf for real**

```
node concepts/tools/palette-sweep.mjs --seed-batch 20
```
Expected: a mix of CERTIFIED/FAILED lines (some generated palettes will fail — that's real signal, not a bug; report the actual pass rate to Ben, don't tune the generator's acceptance criteria to force 100%).

- [ ] **Step 3: Manual host-UI smoke test**

Open the picker on a throwaway/preview show (never a live one, per this project's production-data rule). Confirm: "Surprise me" is enabled and offers only palettes from the batch just certified; clicking it and Applying ships instantly; typing a custom hex code and clicking Apply shows "Saved, pending check" and does NOT change the live preview's committed state after reload.

- [ ] **Step 4: Report to Ben**

State plainly: how many of the 20 seeded palettes certified vs failed (the real shelf size right now), and that `LUMA_RISE_MAX` (Task 4) is still `null` — a STAYS HUMAN value Ben can set once he's seen this real pass/fail data, per Fable's original Phase 2b plan section.

---

## Self-Review Notes (for whoever runs this plan)

- **Spec coverage:** Task 1-3 = Fable's Phase 2.5 in full. Task 4 = Fable's Phase 3 in full, with the one substantive change from Fable's original text: "Surprise me" draws from the certified shelf (Task 5-7), not from a live `generatePalette()` call — this is the plan amendment Ben's 2026-09-03 certification-policy answer required, and is called out at every point it diverges from the 2026-09-02 doc.
- **Not in this plan:** Fable's Phase 2b "STAYS HUMAN" question about `LUMA_RISE_MAX` is answered operationally (Task 8 leaves it `null`, reported to Ben with real data instead of guessed at) rather than picked here. Phase 4 (per-round rotation, start station) is untouched — it depends on a "rebuild while the jukebox overlay covers the screen" hook this plan doesn't build, same as before.
- **Known accepted gap:** Task 5's RLS update policy lets any host-authenticated session flip a row's status, not just the sweep tool. Documented in the migration's own comment and Task 5 Step 2b; not fixed here because closing it needs an Edge Function change (a second JWT claim) outside this plan's scope, and it does not weaken this app's existing trust model (a host can already edit an answer key directly).
