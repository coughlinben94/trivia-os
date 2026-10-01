# Forest world Phase 3b: generator port, ForestAmbient, wiring, verifier

Date: 2026-10-01. Spec: `docs/superpowers/specs/2026-09-29-haunted-forest-walk-design.md` (r6). Phase 3a (camera contract tests, `lib/stationCamera.js`, motion sampler) shipped at `048622c`. Source of truth for look and motion: `concepts/haunted-forest-walk-v3.html` (724 lines). PORT, do not redesign. Everything stays behind `approved:false`. Stops at Ben's first look on real `/display` (gate 9, provisional).

Parity values for the whole of 3b: `walk = { durMs: 4000, stepM: 6 }`. The longer walk (7000/10) is Phase 3c.

## 3b-1 Generator module (pure)
`client/src/worlds/forest/forestGen.js`, ES module, no DOM, no globals.
- Move v3 lines ~122-600 verbatim where possible: seeded rng (`mulberry32`, `rngFor`), `bez`, geometry helpers, `treeItem/limbItem/fogShaft/groundFog`, ground items, 13 landmarks (`fenceItem` ... `signpost`), `moonSvg`, `groundSvg`, `groundKF`, the ITEMS/GITEMS/OCC/EXCL builders.
- Parametrize the v3 constants (`D`, `DUR`, `L`, `NS`) from `walk` and a `seed` argument (v3's implicit seed becomes `seed`, default = v3's). No `Math.random`, no `document`.
- Export `makeForest({ walk, seed }) -> { items, gitems, collect(c, walking), groundSvg(c), groundKF(name), moonSvg, names }`.
- Test: `makeForest({walk:{durMs:4000,stepM:6}})` item count equals v3's (68-80 per walk, `items`/`gitems` from `window.__forest` on v3); same seed twice deep-equal; `seed+1` differs; no `Math.random`/`document`/`window` in the module source (grep test).

## 3b-2 Mount + walk layer
`client/src/worlds/forest/forestScene.js`: the DOM half of v3 (`mount`, `build`, `render`, creep/idle, reduced-motion path, keyframe CSS generation), taking `{doc, forest, walk}`; no module-level state besides what the instance owns.

`client/src/components/display/ForestAmbient.jsx`: forwardRef with the SAME imperative handle as RingAmbient (`turn`, `jumpTo`, `station`) and the same props (`worldData, slideIndex, stationOverride, forceSnap, showId, exposeDebugGlobal, showStationDebug`). Reuses `ringNavAction`, `RING_RETURN`, and the stationOverride round trip exactly as RingAmbient does (same effects, same `returnStationRef`). Builds DOM in a ref. Camera = `createStationCamera({ panes: 13, queuePolicy: 'retarget', renderer })`:
- `startWalk(from,to,dir,done)`: v3 `advance()` body (animated build, bob/sway classes, `setCreep(false)`), timer `walk.durMs + 40` then rest render + `done()`; returns cancel (clears timer, removes walk classes).
- `snap(from,to)`: v3 `jump()` (rest render, `setCreep`).
- `cut(from,to,done)`: clone the outgoing scene frozen at its current animation time, render target rest frame under it, fade the clone out over 400 ms (opacity only, same mechanism as the v3 reduced-motion path), then remove the clone and `done()`; returns cancel (removes clone, snaps to `to`).
- Reduced motion: `startWalk` becomes the v3 `rmOn` path (clone + 400 ms fade) and completes through `done()`.
- Root: `data-forest-station` (live station), `window.__forest = { seed, setSeed(n), station, turn(), jumpTo(i), freeze(t), unfreeze() }` when `exposeDebugGlobal`; `freeze(t)` pauses every animation and sets `currentTime = t` (rest-time or walk-time).
- Unmount: `camera.dispose()`, clear timers, remove style element.

## 3b-3 World data and wiring (spec 2.4)
- `client/src/worlds/hauntedOctober.world.js`: `makeHauntedWorld()` returns `null` + `console.error` if the THEMES entry is missing; fields per spec 2.4 (`renderer:'forest'`, `id`, `type:'terrestrial'`, 13 `stations[].key`, `layers.stars:false`, `sky[4]`, warm `tints` with `starTint3`/`drift`, `musicStation:10`, `approved:false`, `walk`).
- `ringWorldFor.js`: register conditionally; return forest worlds BEFORE `paletteOnly`/`theme.ringWorld`/auto-draw. Tests: saved `worldPalette` and saved `ringWorld` leave the forest world unchanged and do not throw; import with THEMES entry removed, space still loads.
- `ParticleBackground.jsx` (~1257) and `AmbientAudit.jsx` (~117): branch on `world.renderer === 'forest'`. Key stays `ringWorldId ?? 'none'`.
- Retire from runtime: `hauntedOctober.ring.js`, `.slots.js`, `.art.js`. Update `hauntedOctober.ring.test.js` and `RingAmbient.worldSeams.test.jsx` to ring worlds only. `ring-verify.mjs` and `ring-baseline.mjs` skip `renderer === 'forest'` worlds. Note: editing `ring-verify.mjs` gating is check logic, which is STAYS-HUMAN (continuity doc section 4): propose the exact diff to Ben, do not self-approve.
- Tests: forest world-switch test (space<->haunted<->space; `data-forest-station` after each switch and each advance; pre-paint alignment at `slideIndex % 13`); `ParticleBackground.worldSwitch.test.jsx` for space stays green; space gates re-run (13 frames, `motion.json`, `camera-motion.json`, `verify:ring` findings).

## 3b-4 Forest verifier (gates 2-7, spec section 3)
`scripts/forest-verify.mjs` (bundled Chromium, own dev server port, real `/display` route at 1920 wide):
- Known-answer probes (gate 2/3): same station twice at the same frozen time = identical raster; station k vs k+1 differ; `setSeed(seed+1)` differs; station 0 after 13 `turn()`s = fresh station 0.
- Fidelity (gate 4): stations 0,1,3,5,10 and walk frames 0/25/50/75/100% vs goldens captured from `haunted-forest-walk-v3.html` the same way (`currentTime`). Metric and tolerance FIXED before the first comparison, probed with one deliberately wrong render. (Metric/tolerance choice is Ben's: STAYS-HUMAN. Propose, wait.)
- Safe box + contrast (gate 5), animation census (spec 2.3), strobe (gate 6), state/retarget/covered-cut checks (gate 7), each with its known-answer fixtures (gate 3b).
- Perf: grep no rAF/canvas; walk-start main-thread cost; item/animation counts.

## Order and stop points
3b-1 -> test -> commit. 3b-2 -> test -> commit. 3b-3 -> space gates -> commit. 3b-4 -> report. Independent critique after 3b-2 and after 3b-4. PROVISIONAL STOP: Ben looks at the forest on real `/display`. Do not set `approved:true`. Do not merge.

## STAYS-HUMAN items hit in 3b (name, then stop)
Fidelity metric/tolerance; any `ring-verify.mjs` pass/fail edit; any `allowedToMove` entry; aesthetic acceptance.
