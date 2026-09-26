# Ring World Night Color Evolution — Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the validated v4 two-world split-screen transition into the real midnight-galaxy show, so the ring world visibly shifts through the curated duo graph every 2-3 ring-visible slides instead of staying one fixed palette all night.

**Architecture:** A new `EvolvingRingAmbient.jsx` component decides, purely from `(showId, ringVisibleSlideIndex)`, whether the current slide is an ordinary slide (render one `RingAmbient`, the current duo's world) or a transition slide (render two `RingAmbient`s — the outgoing duo underneath, opaque; the incoming duo on top, masked with the v4 organic boundary). `ParticleBackground.jsx` routes to it instead of the frozen single-world path, only when no host has set an explicit per-show palette/world override. No new database column, no new host UI, no new certification run — every duo is already a certified `ring_palettes` row, hardcoded into `duoGraph.js`, and this plan only decides *when* to show which one(s).

**Tech Stack:** React 18, existing `RingAmbient.jsx`/`ringRecolor.js`/`duoGraph.js`/`duoTransition.js` (already built and tested), CSS `mask-image`, `requestAnimationFrame`.

**Spec:** `docs/superpowers/specs/2026-09-24-ring-world-night-color-evolution-design.md` (§4 "Transition mechanism," "Suggested build order" step 3). This plan implements that step.

## Global Constraints

- Never touch `DEAD_BAND`, `ANCHOR_WINDOW`, or any `ring-verify.mjs` threshold (STAYS-HUMAN, `references/ring-world-continuity.md` §4).
- Never re-author `DUO_GRAPH`/`DUO_PALETTES` edges — that's Ben's call, already done (`client/src/lib/duoGraph.js`). This plan only consumes that graph.
- `ParticleBackground` (and everything it mounts) must never remount mid-show (Critical Rule 1, project `SKILL.md`) — the new component must not introduce a `key` on anything that would defeat this.
- Every animated element needs a `prefers-reduced-motion: reduce` guard (project `SKILL.md` Critical Rule 3) — the mask-animation effect must check this before starting its `requestAnimationFrame` loop.
- No `Math.random` for anything that must replay identically on reload/back-nav — only `rng()`/`seedFrom()` (this app's existing helpers).

## Scoping decision (made in this plan, not the spec — flagging why)

The spec's Architecture §1 says to store `{ mode, seed, graphVersion, ringVersion }` in `shows.theme_overrides`. This plan does **not** build that storage or a host on/off toggle: there is no host UI request for one yet, and building an opt-out switch nobody asked for is exactly the over-scoping the project's own working-style rules warn against. Instead, evolving mode is a pure function of `(showId, ringVisibleSlideIndex)` — same "recompute, never store" discipline `duoWalk.js`/`duoTransition.js` already use for the walk itself. `showId` is passed as the seed directly (same pattern `ringWorldFor.js`'s `autoDrawWorld` already uses: `seedFrom(showId)` internally, done automatically by `duoWalk`/`duoTransition`'s own `seedFrom(String(seed))` call). If Ben later wants a per-show opt-out, that is a small follow-up (a `theme_overrides.evolving = false` escape hatch checked in the `ParticleBackground.jsx` gate) — not built here because nothing today needs it.

Evolving mode only engages when **no explicit host override exists** (`!theme.worldPalette && !theme.ringWorld`) — a host who deliberately picked a fixed palette via `WorldPaletteEditor.jsx` keeps exactly what they picked, unaffected. This matches `ringWorldFor.js`'s own existing precedence (explicit override > auto tier > base) and needs no new field to express.

No new `ring-verify.mjs` run is needed: every duo rendered is already an independently-certified `ring_palettes` row (verified live, prior session). The split view is two already-certified single-world renders shown side by side — not a new, never-certified merged world state — so the certification gate's own model (one world, one safe-box check) doesn't apply to the composite view and isn't being bypassed.

---

### Task 1: `isTransitionSlide` — pure boundary-detection helper

**Files:**
- Modify: `client/src/lib/duoTransition.js`
- Test: `client/src/lib/duoTransition.test.js`

**Interfaces:**
- Consumes: `stepIndexForSlide(seed, ringVisibleIndex)` (already exported, this file).
- Produces: `isTransitionSlide(seed, ringVisibleIndex) -> boolean`, used by Task 3.

- [ ] **Step 1: Write the failing test**

```js
// add to the existing `describe('outgoingAndIncomingDuo', ...)` block's file,
// as a new top-level describe
describe('isTransitionSlide', () => {
  it('is false at slide 0 (nothing to transition from yet)', () => {
    expect(isTransitionSlide('show_h', 0)).toBe(false)
  })

  it('is true exactly at the slides where stepIndexForSlide changes', () => {
    let prevStep = stepIndexForSlide('show_i', 0)
    for (let i = 1; i < 60; i++) {
      const step = stepIndexForSlide('show_i', i)
      expect(isTransitionSlide('show_i', i)).toBe(step !== prevStep)
      prevStep = step
    }
  })

  it('agrees with itself walking backward then forward across the same boundary (back-nav safe)', () => {
    // Find a real boundary for this seed, then verify the flag is identical
    // whether you arrive at it from either direction — it's a pure function
    // of the index, so back-nav needs no special-case code.
    let boundary = -1
    for (let i = 1; i < 30 && boundary === -1; i++) {
      if (isTransitionSlide('show_j', i)) boundary = i
    }
    expect(boundary).toBeGreaterThan(0)
    expect(isTransitionSlide('show_j', boundary)).toBe(true)
    expect(isTransitionSlide('show_j', boundary)).toBe(true) // called again — must not flip
  })
})
```

Add `isTransitionSlide` to the existing `import { stepIndexForSlide, outgoingAndIncomingDuo } from './duoTransition.js'` line at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/lib/duoTransition.test.js`
Expected: FAIL — `isTransitionSlide is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

Add to `client/src/lib/duoTransition.js`, after `stepIndexForSlide`:

```js
// A slide is a transition slide iff the walk's step just changed arriving at
// it — i.e. this slide and the one before it belong to different steps.
// Pure function of the index: no ref, no stored "am I mid-transition" state,
// so back-nav (Stream Deck back button) just recomputes the same answer
// walking the other direction, for free — the same discipline duoWalk.js's
// own header comment already argues for.
export function isTransitionSlide(seed, ringVisibleIndex) {
  if (ringVisibleIndex <= 0) return false
  return stepIndexForSlide(seed, ringVisibleIndex) !== stepIndexForSlide(seed, ringVisibleIndex - 1)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/lib/duoTransition.test.js`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/duoTransition.js client/src/lib/duoTransition.test.js
git commit -m "feat(ring): add isTransitionSlide — pure boundary detection for the color-evolution walk"
```

---

### Task 2: `RingAmbient.jsx` — let a secondary instance skip the debug global

**Files:**
- Modify: `client/src/components/display/RingAmbient.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a new optional prop, `exposeDebugGlobal` (default `true`), consumed by Task 3's `SplitTransition`.

**Why:** `RingAmbient` sets `window.__world = {...}` at mount for live debugging (grep found this at line 817, deleted at line 836). Two `RingAmbient`s mounted at once — the real state during a transition slide — would have the second overwrite the first's debug hook. Only one instance (whichever is "becoming current") needs to own it during a transition.

- [ ] **Step 1: Read the current mount/cleanup code**

Read `client/src/components/display/RingAmbient.jsx` lines ~800-840 (the effect that sets and deletes `window.__world`) to get the exact current text before editing.

- [ ] **Step 2: Add the prop and guard both sites**

In the component signature (line 655):
```js
const RingAmbient = forwardRef(function RingAmbient({ worldData, slideIndex, stationOverride, showStationDebug = false, forceSnap = false, exposeDebugGlobal = true }, ref) {
```

Wrap the assignment (currently unconditional, ~line 817):
```js
if (exposeDebugGlobal) {
  window.__world = {
    // ...unchanged body...
  }
}
```

Wrap the cleanup delete (~line 836):
```js
if (exposeDebugGlobal && window.__world && window.__world.WORLD === worldData) delete window.__world
```

- [ ] **Step 3: Verify no regression**

This prop defaults to `true`, so every existing call site (`ParticleBackground.jsx`'s current single-`RingAmbient` branch, `AmbientAudit.jsx`'s dev tool) is unaffected — confirm by grepping for other `<RingAmbient` call sites and checking none pass a 6th positional/prop argument that would collide:

Run: `grep -rn "<RingAmbient" client/src --include="*.jsx"`
Expected: only `ParticleBackground.jsx` (Task 4 will change this one) and `AmbientAudit.jsx` (dev tool, untouched) — neither passes `exposeDebugGlobal` today, so both keep the default `true` behavior unchanged.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/display/RingAmbient.jsx
git commit -m "feat(ring): RingAmbient can skip window.__world — needed when two instances mount at once"
```

---

### Task 3: `EvolvingRingAmbient.jsx` — solo/split render + the v4 transition visual

**Files:**
- Create: `client/src/components/display/EvolvingRingAmbient.jsx`

**Interfaces:**
- Consumes: `isTransitionSlide`, `outgoingAndIncomingDuo` (`duoTransition.js`); `duoGraph`'s `DUO_PALETTES`/`DUO_GRAPH`; `recolorWorld` (`ringRecolor.js`); `midnightGalaxyRing` (`worlds/midnightGalaxy.ring.js`); `getTheme` (`themes/index.js`); `RingAmbient` (default export, this dir), now accepting `exposeDebugGlobal` (Task 2).
- Produces: default export `EvolvingRingAmbient({ showId, slideIndex, stationOverride, showStationDebug, forceSnap })` — same prop shape `ParticleBackground.jsx` already passes to `RingAmbient` today, plus `showId` (already available there as a prop).

This is presentation logic built on already-tested pure functions (Task 1, and the already-shipped `duoWalk`/`duoTransition`/`duoGraph`), and it composes `RingAmbient` the same way `AmbientAudit.jsx`'s `?split=1` spike already proved works on real hardware. Per this project's own convention, `RingAmbient` itself has no component-level vitest coverage (it's real imperative DOM building, verified live via `/display` and the Playwright `ring-verify.mjs` gate, not jsdom) — so this task has no test step; Task 5 is the real verification.

- [ ] **Step 1: Write the module-scope world cache + duo resolver**

```js
import { useEffect, useRef } from 'react'
import RingAmbient from './RingAmbient.jsx'
import { recolorWorld } from '../../lib/ringRecolor.js'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
import { DUO_PALETTES, DUO_GRAPH } from '../../lib/duoGraph.js'
import { isTransitionSlide, outgoingAndIncomingDuo } from '../../lib/duoTransition.js'
import { getTheme } from '../../themes/index.js'

// Same module-scope memo pattern as ringWorldFor.js's own worldCache — a
// duo's recolored world never changes (DUO_PALETTES is static), so this
// only ever computes 17 entries total across the whole app lifetime, not
// once per render.
const duoWorldCache = new Map()
function worldForDuo(duoId) {
  if (!duoWorldCache.has(duoId)) {
    duoWorldCache.set(duoId, recolorWorld(midnightGalaxyRing, DUO_PALETTES[duoId], getTheme('midnight-galaxy')))
  }
  return duoWorldCache.get(duoId)
}
```

- [ ] **Step 2: Write the SplitTransition sub-component (the v4 visual, ported)**

Ported from the validated spike (`client/src/views/AmbientAudit.jsx`'s `?split=1` v4, throwaway spike code — not copied verbatim, rebuilt against real props). Differs from the spike in one way: **no manual `scheduleTurn()`.** The spike needed one because `AmbientAudit` had no real slide timeline to drive `turn()` from. Here, both `RingAmbient`s already receive the same real `slideIndex` prop from `ParticleBackground`, and each independently derives its own camera position from that prop on mount and on every change (`RingAmbient`'s own `lastSlideIndexRef` effect) — so they stay in lockstep automatically, with no shared scheduler needed. Verify this holds in Task 5's manual pass; if the two cameras ever visibly diverge, that assumption was wrong and needs revisiting.

```js
function SplitTransition({ outgoingWorld, incomingWorld, slideIndex, stationOverride, showStationDebug, forceSnap }) {
  const maskRef = useRef(null)

  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Reduced motion: show the incoming world at a fixed, fully-open
      // feather instead of animating the boundary — still a real cut to the
      // new duo, no motion.
      if (maskRef.current) {
        maskRef.current.style.maskImage = 'linear-gradient(90deg, black 0%, black 100%)'
        maskRef.current.style.webkitMaskImage = maskRef.current.style.maskImage
      }
      return
    }
    let raf, cancelled = false
    const t0 = performance.now()
    function tick() {
      if (cancelled) return
      const t = (performance.now() - t0) / 1000
      // Layered, non-commensurate sine periods — organic drift, not a
      // metronome. Values match the validated v4 spike exactly.
      const angle = 90 + 25 * Math.sin(t * 0.11) + 10 * Math.sin(t * 0.037 + 1.7)
      const center = 50 + 18 * Math.sin(t * 0.07 + 0.6) + 7 * Math.sin(t * 0.023 + 3.1)
      const feather = 26 + 8 * Math.sin(t * 0.05 + 2.2)
      const lo = Math.max(0, center - feather), hi = Math.min(100, center + feather)
      if (maskRef.current) {
        const mask = `linear-gradient(${angle}deg, transparent ${lo}%, black ${hi}%, black 100%)`
        maskRef.current.style.maskImage = mask
        maskRef.current.style.webkitMaskImage = mask
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(raf) }
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Outgoing: fully opaque, unmasked, underneath — the v4 compositing
          fix (Codex/Astra review, 2026-09-24): masking BOTH layers over black
          double-attenuates the overlap. Only the top layer gets a mask. */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <RingAmbient
          worldData={outgoingWorld} slideIndex={slideIndex}
          stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
          exposeDebugGlobal={false}
        />
      </div>
      <div ref={maskRef} style={{ position: 'absolute', inset: 0 }}>
        <RingAmbient
          worldData={incomingWorld} slideIndex={slideIndex}
          stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the top-level component**

```js
export default function EvolvingRingAmbient({ showId, slideIndex, stationOverride, showStationDebug, forceSnap }) {
  const transitioning = isTransitionSlide(showId, slideIndex)
  const { outgoing, incoming } = outgoingAndIncomingDuo(showId, DUO_GRAPH, slideIndex)

  if (!transitioning) {
    return (
      <RingAmbient
        worldData={worldForDuo(incoming)} slideIndex={slideIndex}
        stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
      />
    )
  }

  return (
    <SplitTransition
      outgoingWorld={worldForDuo(outgoing)} incomingWorld={worldForDuo(incoming)}
      slideIndex={slideIndex} stationOverride={stationOverride}
      showStationDebug={showStationDebug} forceSnap={forceSnap}
    />
  )
}
```

- [ ] **Step 4: Sanity-check by hand**

Not a formal test (see Task header note), but before moving on, trace one real example by hand the same way the graph/transition tests already do — pick a seed, walk `isTransitionSlide`/`outgoingAndIncomingDuo` for indices 0-10, and confirm: exactly the indices flagged `transitioning=true` are where `outgoing !== incoming`, and every other index's rendered duo (`incoming`) matches what `duoWalk` alone would give. This is the same live-recompute check already done for `duoTransition.test.js`'s pinned regression case — reuse that technique, don't hand-derive.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/display/EvolvingRingAmbient.jsx
git commit -m "feat(ring): add EvolvingRingAmbient — solo/split render driven by the duo walk"
```

---

### Task 4: Wire `ParticleBackground.jsx` to the evolving path

**Files:**
- Modify: `client/src/components/display/ParticleBackground.jsx`

**Interfaces:**
- Consumes: `EvolvingRingAmbient` (Task 3, default export).
- Produces: no new exports — this is the routing change.

- [ ] **Step 1: Add the import**

Near the top, alongside the existing `RingAmbient` import:
```js
import EvolvingRingAmbient from './EvolvingRingAmbient.jsx'
```

- [ ] **Step 2: Add the evolving-eligibility check and branch**

In the component body, after `const ringWorld = ringWorldRef.current || null` (existing line ~1209), add:

```js
// Evolving color mode: only for midnight-galaxy, only when no host has set
// an explicit per-show override (WorldPaletteEditor's worldPalette, or a
// saved ringWorld) — an explicit host pick always wins, unchanged from
// today. No new theme_overrides field: this is a pure function of showId +
// slide position, same "recompute, never store" discipline the walk itself
// already uses. See docs/superpowers/plans/2026-09-26-ring-world-night-
// color-evolution-wiring.md, "Scoping decision," for why there's no on/off
// toggle yet.
const evolvingEligible = theme.id === 'midnight-galaxy' && !!showId && !theme.worldPalette && !theme.ringWorld
```

Change the render branch (existing ~line 1247):
```js
{gradientMood
  ? <BreathingGradient palette={theme.colors} mood={gradientMood} />
  : evolvingEligible
    ? <EvolvingRingAmbient showId={showId} slideIndex={slideIndex} stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap} />
    : ringWorld
      ? <RingAmbient worldData={ringWorld} slideIndex={slideIndex} stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap} />
      : AmbientComponent && <AmbientComponent tint={tint} />}
```

- [ ] **Step 3: Guard the now-unnecessary frozen-world computation**

The existing `ringWorldRef`/`ringWorldFor(theme, showId)` call (lines ~1205-1208) still runs unconditionally today. When `evolvingEligible` is true, computing and caching a frozen static world nobody will render is wasted work (small, but pointless). Guard it:

```js
const ringWorldRef = useRef(null)
if (ringWorldRef.current === null && !evolvingEligible) {
  ringWorldRef.current = ringWorldFor(theme, showId) ?? false
}
const ringWorld = ringWorldRef.current || null
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `cd client && npx vitest run`
Expected: PASS — no test targets `ParticleBackground.jsx` directly (confirmed no such test file exists), so this checks nothing regressed in `ringWorldFor.test.js`, `ringRecolor.test.js`, `duoTransition.test.js`, etc.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/display/ParticleBackground.jsx
git commit -m "feat(ring): route midnight-galaxy to the evolving color walk by default"
```

---

### Task 5: Real-browser verification (per this subsystem's standing rule — no unverified ring-world change ships)

**Files:** none (verification only).

- [ ] **Step 1: Local dev server**

Run: `vercel dev` (per project `SKILL.md`) from the repo root, or `cd client && npm run dev` if that's the faster local loop already in use this session — confirm which by checking `package.json` scripts if unsure.

- [ ] **Step 2: Open a real midnight-galaxy show on `/display`**

Use an existing show (or a fresh one) with theme `midnight-galaxy` and no `WorldPaletteEditor` override applied. Confirm in DevTools that `evolvingEligible` is true (temporarily add a `console.log` in Step 2's branch if needed, remove before commit).

- [ ] **Step 3: Advance through slides, watch for a real transition**

Advance the host through ring-visible slides (any slide that isn't excluded from the ring, per `isRingVisible`) at least 6-8 times. Confirm:
- Most slides show one world, one duo, no split.
- At least one slide shows the two-world split with the animated organic boundary (matches the v4 spike's live-approved look: "gotcha. looks good").
- After that slide, the display settles to a single world in the new duo — no lingering second layer.

- [ ] **Step 4: Back-nav across a transition**

At the exact slide identified in Step 3, use the host's Stream Deck **back** action (or the equivalent host-mode "previous slide" control) to step backward across that boundary, then forward again. Confirm the same split reappears identically each time you land on it, and disappears cleanly one slide off it in either direction — this is the "no special-case code, pure recompute" claim from Task 1/Task 3 under real navigation, not just the unit test.

- [ ] **Step 5: Perf check on real hardware**

Run this on the actual show laptop (not a dev machine), per the spec's own real-hardware confirmation requirement. Watch for stutter during the split slide specifically — the spec's measured real-hardware range was ~33-34.6fps for two worlds (comfortably above the 24fps floor), but confirm it still holds now that the split is driven by real slide navigation instead of the spike's synthetic timer.

- [ ] **Step 6: Confirm `window.__world` debug hook still resolves**

With DevTools console open during a split slide, run `window.__world` — confirm it exists and points at the incoming (about-to-be-current) world, not `undefined` and not stuck on the outgoing one after the transition passes (Task 2's fix).

- [ ] **Step 7: Full test suite**

Run: `cd client && npm run test:unit`
Expected: PASS (this is the blocking gate `scripts/ship.sh` already runs before any deploy, per project `SKILL.md`).

- [ ] **Step 8: Report findings to Ben**

Summarize what was actually seen (not "should work") — real transitions observed, real fps range, any visual roughness, any back-nav edge case. This is Ben's sign-off gate before the feature is considered done, matching every prior step of this project (v1-v4 sign-offs were all live, watched calls, not agent self-certification).
