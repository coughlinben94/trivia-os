# Ring Duo Organic Transitions Implementation Plan

> **For agentic workers:** Use this plan task-by-task. Keep each change test-first.

**Goal:** Make the off-by-default Midnight Galaxy duo walk switch worlds every 3–4 slides, with a replayable, gently curved wipe whose angle, reveal side, and screen position vary per switch.

**Architecture:** Reuse the existing certified duo graph, seeded walk, and two-world renderer. Derive interval and wipe geometry from the show seed plus transition number, so refresh and back-navigation reproduce the same result. Replace the fixed straight gradient boundary with a feathered SVG mask path that can bow and vary during the transition. Do not alter duo colors, weights, certification, 15° hue floor, ring thresholds, or the off-by-default route gate.

**Tech Stack:** React, Vitest, existing `rng()`/`seedFrom()`, inline SVG mask, `requestAnimationFrame`, Playwright `runChecks`.

---

### Task 1: Set seeded world-switch intervals to 3–4 slides

**Files:**
- Modify: `client/src/lib/duoTransition.js`
- Test: `client/src/lib/duoTransition.test.js`

- [x] Change interval assertions first: for multiple show seeds, every consecutive transition boundary must be 3 or 4 slides apart; the same seed/index must reproduce the same step.
- [x] Run `npm run test:unit -- client/src/lib/duoTransition.test.js` and confirm the new 3–4 assertion fails against the current 2–3 implementation.
- [x] Change `MIN_GAP` to `3` and `MAX_GAP` to `4`; retain existing seeded recomputation and slide-index semantics.
- [x] Run the focused test again; require all boundaries in the sampled seeds to be exactly 3 or 4 slides apart.

### Task 2: Add deterministic per-transition wipe parameters

**Files:**
- Modify: `client/src/lib/duoTransition.js`
- Test: `client/src/lib/duoTransition.test.js`

- [x] Add a pure exported helper `transitionWipeFor(seed, stepIndex)` using `seedFrom(String(seed))` and a dedicated `rng()` salt. Return a stable angle, reveal center, direction, bulge, secondary warp, and feather for each transition number.
- [x] Add tests first for same-input stability, different transition steps producing varied parameters, valid finite ranges, and no dependence on call order.
- [x] Verify the tests fail before adding the helper, then implement it without `Math.random`.
- [x] Keep current min/max range choices as prototype values for Ben's visual review; do not edit any brightness or hue threshold.

### Task 3: Render a curved feathered transition boundary

**Files:**
- Modify: `client/src/components/display/EvolvingRingAmbient.jsx`
- Test: `client/src/components/display/EvolvingRingAmbient.test.jsx`

- [x] Pass the active transition number and `transitionWipeFor(showId, stepIndex)` into the incoming `DuoLayer`.
- [x] Replace the always-straight CSS gradient mask with an inline SVG mask path. Build the curved boundary from the seeded angle, vertical position, reveal side, bulge, and warp; animate only the path boundary while the incoming duo is in transition.
- [x] Keep one outgoing world fully opaque below the masked incoming world. Keep mask IDs unique per layer; clear mask state on role change/unmount.
- [x] Preserve the `prefers-reduced-motion` behavior as an immediate, full incoming-world reveal. No animation loop runs while a layer is current or hidden.
- [x] Add integration assertions that transition geometry reaches the incoming layer, ordinary slides have no mask, and reduced-motion path remains static.
- [x] Run the focused component tests and build before visual verification.

### Task 4: Verify the real transition and record the approved direction

**Files:**
- Update: `docs/superpowers/specs/2026-09-24-ring-world-night-color-evolution-design.md`
- Verify with: `concepts/tools/ring-verify.mjs` exported `runChecks()`

- [x] Update the spec's open cadence and wipe-shape decisions to: randomized 3–4 slide gaps; per-transition seeded angle/position; gentle curved/bulging boundary; duo graph chooses the connected next world; feature remains off by default.
- [x] Inspect the transition in the browser; confirm both worlds render together and final settle shows one full world with no uncovered frame. Final aesthetic acceptance remains Ben's.
- [ ] Confirm the 17 duo palette rows and their certified weights remain unchanged. The trusted `runChecks()` contract currently drives one `window.__world` via `.turn()`; it cannot measure this two-world, slide-driven transition route without changing gate semantics, which are STAYS-HUMAN. Do not report a transition brightness result from a different route or a custom sampler.
- [ ] Inspect the actual preview route at mid-wipe and after settle; confirm both worlds stay registered, curved boundary is visible, and no uncovered frame appears.
- [ ] Keep the feature off by default. Publish a preview for Ben's visual acceptance before any production enablement.
