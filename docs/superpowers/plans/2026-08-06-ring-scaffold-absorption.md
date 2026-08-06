# Ring Scaffold Absorption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `concepts/world-07-ring.html` (the verified, Ben-approved "the bones are really there" ring engine) from a standalone prototype into a wired-in-but-isolated dev preview, gated by a real verification tool, without touching the live `midnight-galaxy` production ambient.

**Architecture:** Extract the engine's pure math (hash, cylinder/period, value arc, primitive geometry) into a framework-agnostic module. Wrap it in a React component driven by an imperative station update (never a remounting prop — `ParticleBackground` is contractually mount-once). Preview it only through the existing dev-only `/ambient` route. Wire `concepts/tools/ring-verify.mjs` (already built and passing 14/14 this session) into the Stop-hook gate. The generator agent + Noun Atlas is scoped separately as a spec-writing task, not code — the doc that started this work calls it "the design-vein problem" and says naive templating or free rein both fail; it needs its own creative pass, not a bite-sized TDD task.

**Tech Stack:** Vanilla JS engine module, React 18 wrapper, existing `.claude/hooks/design-done-gate.mjs` Stop-hook, `client/src/lib/easings.js`, `client/src/lib/colorTint.js`.

**Status entering this plan (verified this session, not asserted):**
- `concepts/world-07-ring.html`: wrap-at-turn-12 rendered and visually clean (screenshots taken); stations 6-8 flat-brightness defect fixed (seeded ±10% jitter in `arcAt()`, seed `0x4217`); 576 DOM stars / 4309 total DOM nodes, 60fps sustained through a turn transition in headless Chromium.
- `concepts/tools/ring-verify.mjs`: built and passing 14/14 (layer arithmetic, parallax ratio, phase-0 sync at turns 12/24/36, integer arithmetic, content coverage, arc span 2.99x, no-flat-neighbours 8/8, WORLD.type validity, radial-only sky, visible-star count, console-clean, no stray Math.random).
- **NOT verified, and out of scope for this plan:** whether the six primitives (`blob dots spikes lens streak ribbon`) read as their nouns at 15 feet on the real venue TVs — that's a judgment call only Ben can make standing in the bar, not something a script can gate.

---

## File Structure

- Create: `client/src/lib/ringEngine.js` — pure functions ported from `concepts/world-07-ring.html`'s `<script>` block: `hash32`, `rng`, `lerp`, `cylinderOf`, `authorPeriodOf`, `arcAt`, `buildArc`, `noFlatNeighbours`. No DOM, no React — this is what makes it testable without a browser.
- Create: `client/src/lib/ringEngine.test.js` — plain assertions (this repo has no existing unit-test runner wired for `client/src/lib/*` — see Task 1 Step 2 for how this plan handles that) verifying the same 3 arithmetic facts `ring-verify.mjs` already checks against the live DOM build, so a future engine edit gets caught at the pure-function level before it ever needs a browser.
- Create: `client/src/components/display/RingAmbient.jsx` — the DOM-building half, ported from the same script's `buildLayerContent`/`makePrim`/`buildStars`. Takes `{ worldData, stationRef }` — `stationRef` is a ref object whose `.current` the component reads imperatively on an external "turn" signal, never a re-render-triggering prop (see Task 3).
- Create: `client/src/worlds/midnightGalaxy.ring.js` — the `WORLD` data object (stations, hues, sky colors) ported verbatim from `concepts/world-07-ring.html`, now sourcing `sky` from `THEMES.find(t => t.id === 'midnight-galaxy').colors` instead of a hardcoded array (Task 5).
- Modify: `client/src/views/AmbientAudit.jsx` — add a `?ring=1` query-param branch that mounts `RingAmbient` with a Next Turn button, entirely separate from the existing `?theme=` branch. Does not touch `ParticleBackground.jsx` or `AMBIENT_MAP`.
- Modify: `.claude/hooks/design-done-gate.mjs` — add `ring-verify.mjs` to the Stop-hook's check list for `concepts/world-*.html` and (once it exists) `client/src/worlds/*.ring.js` (Task 1).
- Create: `concepts/noun-atlas.json` + `concepts/GENERATOR-AGENT-SPEC.md` — the spec-writing task (Task 6), not implementation.

---

### Task 1: Wire the verification gate into the Stop-hook

**Files:**
- Modify: `.claude/hooks/design-done-gate.mjs`
- Test: manual — trigger the hook path directly, no test framework needed for a hook script

- [ ] **Step 1: Find the existing geometry-lint call site**

Run: `grep -n "geometry-lint" .claude/hooks/design-done-gate.mjs`

Read the ~15 lines around the first match to see how it invokes the child script and handles its exit code (this file is 2283 lines and has been through 10 hardening rounds — copy its existing pattern exactly rather than inventing a new one).

- [ ] **Step 2: Add a ring-verify call, scoped to ring-shaped files only**

Immediately after the geometry-lint call site found in Step 1, add:

```js
// ring-verify.mjs is a separate, ring-engine-specific gate (station/cylinder/
// arc checks that mean nothing for a non-ring concepts/*.html file) — see
// concepts/tools/ring-verify.mjs's own header for why this isn't folded into
// geometry-lint.mjs. Scope: files whose content actually defines window.__world.
const RING_FILE_RE = /(^|\/)concepts\/world-.*\.html$/;
for (const file of changedFiles) {  // reuse this file's existing changed-files list from Step 1's scope
  if (!RING_FILE_RE.test(file)) continue;
  const src = readFileSync(file, 'utf8');
  if (!src.includes('window.__world')) continue;
  const result = spawnSync('node', ['concepts/tools/ring-verify.mjs', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push(`ring-verify.mjs FAILED on ${file}:\n${result.stdout}`);
  }
}
```

Match `changedFiles`/`failures` to whatever the surrounding function in this file actually calls its own loop variable and failure-accumulator (read the 40 lines around the geometry-lint call site before writing this — the exact variable names matter, this file has been rewritten 10 times and has its own established names).

- [ ] **Step 3: Verify it fires**

Run: `node concepts/tools/ring-verify.mjs concepts/world-07-ring.html`
Expected: exit 0, `14 checks — 14 PASS, 0 WARN, 0 FAIL` (confirmed this session).

Then manually break one check to confirm the hook actually blocks — temporarily change `arcAt`'s jitter magnitude from `0.10` to `0` (reintroducing the flat-brightness defect), run the gate, confirm it FAILs the `no-flat-neighbours` check, then revert.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/design-done-gate.mjs
git commit -m "Wire ring-verify.mjs into the Stop-hook gate for ring-shaped world files"
```

---

### Task 2: Extract the pure engine

**Files:**
- Create: `client/src/lib/ringEngine.js`
- Create: `client/src/lib/ringEngine.test.js`

- [ ] **Step 1: Port the pure functions verbatim**

```js
// client/src/lib/ringEngine.js
// Pure math for the ring ambient model — no DOM. Ported from
// concepts/world-07-ring.html, which remains the source of truth for the
// DOM-building half (see RingAmbient.jsx). Any change here should be
// re-verified against concepts/tools/ring-verify.mjs on the reference build.

export function hash32(x, seed) {
  let h = (x | 0) ^ (seed | 0)
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

export function rng(i, seed) {
  let n = hash32(i, seed)
  return () => { n = hash32(n, 0x9E3779B9); return n / 4294967296 }
}

export const lerp = (a, b, t) => a + (b - a) * t

export const cylinderOf = (engine, layer) => engine.PANES * layer.surge
export const authorPeriodOf = (engine, layer) => cylinderOf(engine, layer) / layer.m

// Seeded ±10% jitter breaks up the cosine trough's flat neighbourhood — see
// concepts/world-07-ring.html's arcAt() comment for why (S1 defect: "nothing
// is a moment," reproducible at stations 6-8 without it).
export function arcAt(engine, world, i) {
  const { lo, hi, exp } = engine.ARC
  const t = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + world.phase) / engine.PANES)
  const base = lo + (hi - lo) * Math.pow(t, exp)
  const jitter = lerp(-0.10, 0.10, rng(i, 0x4217)())
  return base * (1 + jitter)
}

export function buildArc(engine, world) {
  return Array.from({ length: engine.PANES }, (_, i) => arcAt(engine, world, i))
}

export function loudnessOf(arc, i) {
  const min = Math.min(...arc), max = Math.max(...arc)
  return (arc[i] - min) / (max - min)
}
```

- [ ] **Step 2: Write assertions against the numbers `ring-verify.mjs` already confirmed live**

This repo's `package.json` has `test:e2e`/`test:smoke`/etc. (all Playwright, all browser-driven) but nothing for a plain-Node unit file. Rather than pull in a new test runner for 4 functions, write `ringEngine.test.js` as a `node --check`-able self-check in the same spirit as this repo's ponytail convention — a runnable assertion file, invoked directly with `node`:

```js
// client/src/lib/ringEngine.test.js — run: node client/src/lib/ringEngine.test.js
import assert from 'node:assert/strict'
import { cylinderOf, authorPeriodOf, buildArc, hash32, rng } from './ringEngine.js'

const ENGINE = { PANES: 12, ARC: { lo: 18, hi: 52, exp: 1.6 } }
const LAYERS = [
  { id: 'far', surge: 480, m: 1 },
  { id: 'mid', surge: 1920, m: 1 },
  { id: 'near', surge: 2880, m: 3 },
]
const WORLD = { phase: 5 }

// layer arithmetic — matches concepts/tools/ring-verify.mjs's live-DOM check
assert.equal(cylinderOf(ENGINE, LAYERS[0]), 5760, 'far cylinder')
assert.equal(cylinderOf(ENGINE, LAYERS[1]), 23040, 'mid cylinder')
assert.equal(cylinderOf(ENGINE, LAYERS[2]), 34560, 'near cylinder')
assert.equal(authorPeriodOf(ENGINE, LAYERS[2]), 11520, 'near authorPeriod (m=3)')

// value arc span — matches the 2.99x this session measured live
const arc = buildArc(ENGINE, WORLD)
const span = Math.max(...arc) / Math.min(...arc)
assert.ok(span >= 2.2 && span <= 4.0, `arc span ${span} out of 2.2-4.0 band`)

// determinism — same (i, seed) must always produce the same stream, or the
// world differs between reloads (the exact world-06 bug this engine exists to fix)
const a = rng(3, 0x4217), b = rng(3, 0x4217)
assert.equal(a(), b(), 'rng(i, seed) must be deterministic')

console.log('ringEngine.test.js: all assertions passed')
```

- [ ] **Step 3: Run it**

Run: `node client/src/lib/ringEngine.test.js`
Expected: `ringEngine.test.js: all assertions passed`

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/ringEngine.js client/src/lib/ringEngine.test.js
git commit -m "Extract pure ring-engine math into client/src/lib/ringEngine.js"
```

---

### Task 3: RingAmbient component (isolated, not wired to production)

**Files:**
- Create: `client/src/components/display/RingAmbient.jsx`

- [ ] **Step 1: Port the DOM-building half as an imperative, ref-driven component**

The critical constraint (from the doc this plan is based on, §9): the station index must never arrive as a React prop that triggers a re-render/remount, because `ParticleBackground` mounts once for an entire show and this component will eventually live inside it. So `RingAmbient` builds its DOM once on mount (identical to the reference build's own `(function build(){...})()` IIFE) and exposes an imperative `turn()`/`jumpTo()` pair via `useImperativeHandle`, exactly mirroring the reference build's own `window.__world.turn`/`jumpTo` contract:

```jsx
// client/src/components/display/RingAmbient.jsx
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { cylinderOf, authorPeriodOf, buildArc, rng, lerp } from '../../lib/ringEngine.js'

const ENGINE = {
  W: 1920, H: 1080, PANES: 12, SURGE_MS: 1700,
  LAYERS: [
    { id: 'sky', surge: 0, m: 1 },
    { id: 'far', surge: 480, m: 1 },
    { id: 'mid', surge: 1920, m: 1 },
    { id: 'near', surge: 2880, m: 3 },
  ],
  ARC: { lo: 18, hi: 52, exp: 1.6 },
}

const RingAmbient = forwardRef(function RingAmbient({ worldData }, ref) {
  const stageRef = useRef(null)
  const stateRef = useRef({ offset: { far: 0, mid: 0, near: 0 }, station: 0 })

  useEffect(() => {
    // one-time DOM build, same structure as concepts/world-07-ring.html's
    // build() IIFE — .lyr/.surge chassis per non-sky layer, m+1 copies each.
    // Full port deferred to implementation; this effect is the mount point.
  }, [worldData])

  useImperativeHandle(ref, () => ({
    turn() {
      const s = stateRef.current
      for (const L of ENGINE.LAYERS) {
        if (L.id === 'sky') continue
        s.offset[L.id] = (s.offset[L.id] + L.surge) % cylinderOf(ENGINE, L)
      }
      s.station = (s.station + 1) % ENGINE.PANES
      // write transforms directly to the DOM nodes captured at build time —
      // no setState, so no re-render, so ParticleBackground's mount-once
      // contract holds even though the ring visibly advances every turn.
    },
    get station() { return stateRef.current.station },
  }))

  return <div ref={stageRef} className="absolute inset-0 overflow-hidden" />
})

export default RingAmbient
```

- [ ] **Step 2: Port `buildLayerContent`/`makePrim`/`buildStars` into the mount effect**

Copy the reference build's `makePrim`, `buildStars`, and `buildLayerContent` functions from `concepts/world-07-ring.html` (lines ~376-610 as of this session) into the effect from Step 1, replacing `document.createElement`/`el()` calls with the same vanilla DOM calls (this stays vanilla DOM inside the ref, not JSX — React never re-renders this subtree, so there's nothing for JSX to buy here, and matching the reference build line-for-line is what makes `ring-verify.mjs`'s checks transferable).

- [ ] **Step 3: Manual verification — no automated test for this step**

This step produces visual output; per this project's own house rule ("render before you claim"), do not mark this step done without actually mounting the component (Task 4 provides the mount point) and watching it advance through at least one full 12-turn cycle in a real browser.

---

### Task 4: Dev-only preview in AmbientAudit

**Files:**
- Modify: `client/src/views/AmbientAudit.jsx`

- [ ] **Step 1: Add a `?ring=1` branch**

```jsx
// add near the top of AmbientAudit.jsx, alongside the existing imports
import { useRef } from 'react'
import RingAmbient from '../components/display/RingAmbient.jsx'
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'  // Task 5

// inside AmbientAudit(), before the existing `if (theme)` branch:
const ringMode = params.get('ring') === '1'
const ringRef = useRef(null)
if (ringMode) {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: '#000' }}>
      <RingAmbient ref={ringRef} worldData={midnightGalaxyRing} />
      <button
        onClick={() => ringRef.current?.turn()}
        style={{ position: 'absolute', top: 24, left: 24, zIndex: 30, padding: '10px 20px' }}
      >
        Turn ▶ (station {ringRef.current?.station ?? 0})
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Render it and watch a full cycle**

Run: `npm run dev` (or this repo's existing dev-server command from `SKILL.md`), navigate to `/ambient?ring=1`, click Turn 12 times, confirm the wrap is visually clean the same way this session confirmed it in the standalone HTML file. Screenshot before claiming done.

- [ ] **Step 3: Commit**

```bash
git add client/src/views/AmbientAudit.jsx
git commit -m "Add isolated /ambient?ring=1 dev preview for the ring engine"
```

**Explicitly NOT in this task:** adding `midnight-galaxy` (or any theme id) to `AMBIENT_MAP` in `ParticleBackground.jsx`. That file already has a shipped, live `MidnightGalaxyAmbient` for that exact theme id — swapping it is a product decision (does Ben want to replace a live ambient with the ring model, and does the ring model's station-per-slide mechanism even fit how `Display.jsx` currently drives `ParticleBackground` with zero slide-index awareness?) that needs Ben's sign-off before any code changes it, not something this plan decides unilaterally.

---

### Task 5: Route through real repo modules

**Files:**
- Create: `client/src/worlds/midnightGalaxy.ring.js`
- Modify: `client/src/lib/easings.js`
- Modify: `client/src/components/display/RingAmbient.jsx`

- [ ] **Step 1: Add the ring's surge curve to easings.js**

```js
// append to client/src/lib/easings.js
export const EASE_SURGE = [0.16, 0.62, 0.28, 1]  // ring-ambient turn transition
```

- [ ] **Step 2: Use it in RingAmbient's transition instead of an inline literal**

In the mount effect, set the surge transition via the imported curve rather than a hardcoded string:

```js
import { EASE_SURGE } from '../../lib/easings.js'
// ...
surgeEl.style.transition = `transform 1700ms cubic-bezier(${EASE_SURGE.join(',')})`
```

- [ ] **Step 3: Build the WORLD data module, sourcing sky from the real theme**

```js
// client/src/worlds/midnightGalaxy.ring.js
import { THEMES } from '../themes/index.js'

const theme = THEMES.find(t => t.id === 'midnight-galaxy')

export const midnightGalaxyRing = {
  id: 'midnight-galaxy',
  type: 'space',
  name: 'Midnight Galaxy',
  phase: 5,
  // was a hardcoded 4-stop array in concepts/world-07-ring.html; now derived
  // from the theme so a host's per-show color override (ThemeProvider's
  // applyOverrides) reaches this world too, instead of silently no-op'ing.
  sky: [theme.colors.bg, theme.colors.bgDeep, theme.colors.bgDeep, '#010109'],
  qColours: [theme.colors.highlight, theme.colors.accent],
  stations: [
    { key: 'orange nebula', prim: 'blob', hue: 28, accent: true },
    { key: 'star cluster', prim: 'dots', hue: 268, accent: false },
    { key: 'supernova', prim: 'spikes', hue: 36, accent: true },
    { key: 'spiral galaxy', prim: 'lens', hue: 276, accent: false },
    { key: 'comet', prim: 'streak', hue: 208, accent: false },
    { key: 'violet nebula', prim: 'blob', hue: 282, accent: false },
    { key: 'dust ribbon', prim: 'ribbon', hue: 264, accent: false },
    { key: 'binary pair', prim: 'dots', hue: 214, accent: false },
    { key: 'rose nebula', prim: 'blob', hue: 330, accent: true },
    { key: 'ringed lens', prim: 'lens', hue: 250, accent: false },
    { key: 'open cluster', prim: 'dots', hue: 224, accent: false },
    { key: 'green nebula', prim: 'blob', hue: 140, accent: false },
  ],
}
```

- [ ] **Step 4: Verify no visual change from the reference build**

Run `node concepts/tools/ring-verify.mjs concepts/world-07-ring.html` again (unaffected by this task — sanity check nothing in the repo edit path touched the reference file). Then visually compare `/ambient?ring=1` against the `concepts/world-07-ring.html` screenshots taken this session — sky colors will differ slightly (theme-derived vs. the reference build's own literal `#0b0a20` etc.), everything else should match.

- [ ] **Step 5: Commit**

```bash
git add client/src/worlds/midnightGalaxy.ring.js client/src/lib/easings.js client/src/components/display/RingAmbient.jsx
git commit -m "Route ring ambient's sky colors and easing through real theme/easings modules"
```

**Deliberately deferred, not done in this task:** `colorTint.js`'s `deriveTint()` for the station field hues. The doc's own §9 table says to route field colors through `tint()` "so per-show highlight overrides work," but every station hue in this world is a raw number (`hue: 28`) consumed by `hsla(hue, ...)` inside the primitive renderers, not a hex string — `deriveTint(baseAnchorHex, currentAnchorHex, originalColorStr)` operates on color strings, not hue degrees. Wiring this properly means either (a) deriving a hue-shift from the theme's own anchor-color delta the same way `deriveTint` does internally, or (b) converting each station's rendered `hsla()` output through `deriveTint` after the fact. Neither is a mechanical port — it's a real design decision about how per-show overrides should affect a 12-station hue palette, and belongs in its own follow-up, not bundled into this absorption pass.

---

### Task 6: Generator agent spec (not implementation)

This is explicitly the piece the handoff doc calls unsolved: "naive templating gives 21 recolours of one file, free rein gives 21 unrelated looks." That's a creative-direction problem, not a coding task — writing working code against an unsolved design problem would just be a 7th failed prototype wearing a new name (see `concepts/LESSONS.md` / `FAILURE-LEDGER.md` references). This task produces the spec a future session (ideally a `brainstorming` + `grilling` pass with Ben, per this project's own established pattern for exactly this kind of open creative-direction call) would implement against.

**Files:**
- Create: `concepts/noun-atlas.json`
- Create: `concepts/GENERATOR-AGENT-SPEC.md`

- [ ] **Step 1: Seed the Noun Atlas with the one theme already fully specified**

```json
{
  "space": {
    "nouns": ["nebula", "star cluster", "supernova", "spiral galaxy", "comet", "dust ribbon", "binary pair", "open cluster"],
    "primitiveMap": {
      "nebula": "blob",
      "star cluster": "dots",
      "supernova": "spikes",
      "spiral galaxy": "lens",
      "comet": "streak",
      "dust ribbon": "ribbon",
      "binary pair": "dots",
      "open cluster": "dots"
    },
    "bannedInThisType": ["vertical gradient (implies a horizon)"]
  }
}
```

This is `midnightGalaxy.ring.js`'s own station list, generalized into a noun→primitive map — the only theme this session has real, verified data for. The other 20 themes are explicitly out of scope here; each needs the same kind of grounded pass (what nouns actually belong, what primitive each maps to) that space got across 5 prototype rounds, not a single sitting.

- [ ] **Step 2: Write the spec doc naming the open questions, not resolving them**

`concepts/GENERATOR-AGENT-SPEC.md` should state, plainly, what this plan cannot decide unilaterally:
- Should the generator agent propose a Noun Atlas entry for a new theme as part of its own run, or must the atlas be human-authored per theme first (the "naive templating vs. free rein" tension the doc names)?
- What does `validateWorld` actually check? The handoff doc references `s2-world-engine.js`'s `validateWorld` as "the acceptance test" — this session searched the local filesystem and could not find `s2-world-engine.js`, `S1-art-direction.md`, `S2-engine.md`, `SCAFFOLD-TEAM-BRIEF.md`, `DRAFT-world-scaffold.md`, or `TT-02-doctrine-audit.md` anywhere under `~` (the doc says they live in "the Cowork outputs folder," a path this session couldn't locate). Before building a generator against a `validateWorld` contract, confirm those files still exist somewhere retrievable, or accept that `ring-verify.mjs` (built and verified this session) is the closest real substitute and extend it into that role explicitly.
- Does a "generator agent" mean a Claude Code subagent prompt (like the ones this repo already dispatches for round-journeys, per `QUEUE.md`'s Fable-audit pattern), or new application code? Given this repo's own established pattern of using dispatched agents for exactly this kind of "make me a themed asset that has to feel authored, not templated" work, the agent-prompt route is the better fit — but that's a recommendation for Ben to confirm, not a decision this plan makes.

- [ ] **Step 3: Do not commit code that doesn't exist yet**

Commit only the two files from Steps 1-2.

```bash
git add concepts/noun-atlas.json concepts/GENERATOR-AGENT-SPEC.md
git commit -m "Seed Noun Atlas with space theme, spec out open questions for the generator agent"
```

---

## Self-Review

**Spec coverage:** §11's "verification gate" — done this session (`ring-verify.mjs`, 14/14 PASS), wired via Task 1. §11's "generator agent" — Task 6 scopes it to a spec, explicitly not implementation, with the reasoning stated inline. §9's absorption table — `autoFitText.js` has no entry here because the reference build's own question-text fitting (`fitToBox`) is a separate concern from the ambient background and was not part of "the ring scaffold" the source doc's title is actually about; flagged here rather than silently dropped. §8's 5 defects — 4 resolved and verified this session (wrap, flat-brightness, node count, rendering), 1 (noun legibility at 15 feet) explicitly left to Ben, stated in the plan header.

**Placeholder scan:** Task 3 Step 1's component body has a comment marking where the DOM-build effect body goes rather than the full ~150-line port — flagged here rather than silently passed: pasting that full port correctly (matching `makePrim`/`buildStars`/`buildLayerContent` verbatim) is mechanical but long; Step 2 of that task names exactly which lines of the reference file to copy and the one substitution rule (`el()` → plain `document.createElement`), which is enough for an implementer to do it correctly without guessing, but is intentionally not inlined a second time at full length in this plan document.

**Type consistency:** `ENGINE`/`WORLD` shapes in Task 3's `RingAmbient.jsx` match `midnightGalaxy.ring.js` from Task 5 (`stations[]`, `sky[]`, `phase`, `type`, `qColours[]`) and match `ringEngine.js`'s function signatures from Task 2 (`cylinderOf(engine, layer)`, `authorPeriodOf(engine, layer)`, `arcAt(engine, world, i)` — consistent 3-arg/2-arg pattern throughout, no drift between tasks).
