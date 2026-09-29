# Haunted October: forest walk as a real Trivia OS world (r2)

Date: 2026-09-29. r1 reviewed by Codex (REVISE, 12 findings, all accepted; log: `2026-09-29-haunted-forest-walk-review-log.md`). Replaces r0 (canvas renderer, rejected by the Fable critique: ART-DIRECTION-SPEC §8 and themes.md rule 4 ban an always-on rAF/canvas background). Supersedes the RENDERER and ART parts of `2026-09-28-halloween-ring-world-design.md`; keeps its decisions: theme id `haunted-october`, 13 stations (one per slide, loop), harvest moon at index 10 = `musicStation`, TVs (two 80in gate at 30 ft, min stroke 7px on 1920x1080; 40in advisory), phone plan (§4.11 there: Tier 1 palette + Tier 2 backdrop), branch `feat/haunted-october-world` in worktree `~/Projects/baynes-trivia/trivia-os-haunted`, the frozen space-world gates. Ben (2026-09-29): v3 "looks awesome"; "make the walk longer between stations." Not built. Not approved for merge.

## 1. Source of truth

`concepts/haunted-forest-walk-v3.html` (commit 8672a7c and ancestors) is the visual and motion reference. PORT it; do not redesign it. v3 facts: CSS transform/opacity keyframes plus chained `setTimeout`, zero `requestAnimationFrame`/`Math.random`/canvas, content a pure function of station 0..12 via a seeded generator, DUR 4000 ms, D = 6 m per station, 24 keyframe stops, 68-80 items and 143-178 animations per walk, `advance()` median 8 ms. Known v3 behaviors that the port must NOT inherit: `advance()` and `jump()` DROP requests while a walk is running (the ring queues; see §2.1); its debug object is `window.__forest = {advance, jump}` only.

### 1.1 Longer walk (Ben)
Walk becomes a world field `walk: { durMs, stepM }`, default `durMs: 7000, stepM: 10` (about 1.4 m/s average, the same pace as v3's 4 s / 6 m but more forest per stop). Both are tunable by Ben on the prototype first (`concepts/haunted-forest-walk-v3-long.html` is a scratch copy with these two constants changed; its mid-walk frames are NOT yet verified: the builder's capture script failed to trigger the walk). Longer walks raise per-walk item/animation counts (trunks pass over more meters), lengthen the strobe/judder exposure window, and lengthen the time a queued advance waits: perf, safe-box and queue gates (§3) are re-run at the final values, not v3's.

## 2. Design

### 2.1 One imperative camera contract, defined BEFORE extraction (Codex 2)
The station logic in `RingAmbient.jsx` (alignment on mount via `lastSlideIndexRef` seeded null + `ringNavAction`; the stationOverride round trip with `returnStationRef`; `busy` + queued direction + timer cancellation; `forceSnap`; jump semantics) is renderer-internal, so a hook that only calls `onTurn/onJump` cannot guarantee the same outcomes. Phase 3a first WRITES the contract from the current code (read `RingAmbient.jsx` ~982-1063 and ~1266-1396) and pins it with a fake-clock state-sequence test that runs on the CURRENT RingAmbient before any change:
- `turn(dir)` while idle starts one walk; while busy, queues exactly one pending step per the ring's present rule (test states the rule; the forest adopts it instead of v3's drop).
- `jumpTo(i)` is authoritative: cancels timers and the queue, snaps, clears `busy`.
- alignment on mount = `slideIndex % 13` before first paint; stationOverride enter/exit restores the pre-break station.
Extraction then moves the machine into a renderer-neutral controller (`createStationCamera`, pure JS with an injected clock + renderer callbacks `startWalk(from,to,dir)`, `snapTo(i)`, `onSettled()`), used by both renderers; the space world must stay behavior-identical (gate 1 + this test on both sides of the refactor).

### 2.2 ForestAmbient (DOM/CSS, rule-compliant)
`client/src/components/display/ForestAmbient.jsx` builds the DOM imperatively in a ref (like RingAmbient) and runs v3's generator, walk (generated CSS keyframes), and rest life on it. No rAF/canvas/WebGL: CSS transform/opacity plus chained `setTimeout`. Every animated element has a prefers-reduced-motion path (v3: jump plus 400 ms opacity crossfade). Its root carries `data-forest-station` (visible truth for tests) and exposes `window.__forest` (§3.2).

### 2.3 Rules scoping (Codex 9)
ART-DIRECTION-SPEC §8 also restricts continuous opacity animation to a headline, twinkle and one drifter. Forest interpretation, recorded here and to be accepted by Ben: (a) no rAF/canvas: complied; (b) continuous rest motion allowed in the forest = fog drift (transform, slow), idle camera sway (transform, +-0.12deg / +-3px, 7.3 s), ONE lantern-halo flicker (opacity, amplitude <= 12%, < 3 Hz, one element at a time on screen), 40 s creep (transform); nothing else animates continuously at rest; (c) walk motion is transform/opacity only; (d) reduced motion disables all of (b) and shortens (c) to a 400 ms crossfade. A rest-frame animation census test asserts exactly this set (counts + names) so drift is caught.

### 2.4 World data and wiring (Fable 3, Codex 1/10/11)
- Forest data lives in a renderer-neutral module `client/src/worlds/hauntedOctober.world.js` (`renderer:'forest'`, `id`, `type:'terrestrial'`, `stations[].key` x13, `layers.stars:false`, `sky[4]`, warm `tints` (WarpTransition reads `sky[2]`, `sky[last]`, `tints.starTint3`, `tints.drift`), `musicStation`, `approved:false`, `walk`). It exports a VALIDATED value via `makeHauntedWorld()` that returns `null` if its THEMES entry is missing (log via `console.error`); `ringWorldFor.js` registers it conditionally (`if (world) RING_WORLDS[...]`); a test imports it with the THEMES entry removed and asserts space still loads. The old `hauntedOctober.ring.js` ring stub, `.slots.js`, and Phase 2 art (`hauntedOctober.art.js`, harvest-moon prim, sky regions) leave the runtime (git history keeps them).
- Update `hauntedOctober.ring.test.js` and `RingAmbient.worldSeams.test.jsx` to ring worlds only; add forest tests. `ring-verify.mjs` primitive scan and star-band checks apply only to `renderer !== 'forest'` worlds; forest gets its own verifier (§3.2). Preserve `ParticleBackground.worldSwitch.test.jsx` for space and add a forest world-switch test that reads `data-forest-station` and checks pre-paint alignment.
- `ParticleBackground.jsx` branches on `world.renderer` (today it hardcodes `<RingAmbient>` ~1257); key stays `ringWorldId ?? 'none'`. `AmbientAudit.jsx` (~117) gets the same branch. `Display.jsx` `ringStationOverride` untouched. Theme pickers gate on `approved`.
- `ring-baseline.mjs` does not apply to forest frames (animations disabled, ring DOM counts); forest capture in §3.

### 2.5 Safe box (single cap, Codex 8)
Hard gate: text box (left 20%, top 28%, width 60%, height 44%) mean <= 34 and p99.5 <= 68 on every sampled frame. 62 is the target headroom: a frame between 62 and 68 passes but is listed in the report. Sampled frames: rest at all 13 stations; every station transition 0->1 ... 11->12 and 12->0, each at 25/50/75% of the walk. v3's worst was 59.2 at DUR 4 s / D 6 m; re-measured at the final `walk` values.

### 2.6 Jukebox picture
Station 10 (harvest moon) stays `musicStation` for continuity, but the jukebox overlay paints an opaque layer over it (`JukeboxBreakOverlay.jsx`, LiveScreen): no art effort on the "behind the jukebox" framing; confirm in Phase 3b.

## 3. Gates

1. SPACE UNCHANGED (every phase):
   a. 13 frames + motion.json identical to `~/Projects/baynes-trivia/ring-baselines/space-08f249c-v2`; `ringWorldFor` snapshot unchanged; unit suite green (the two relay files fail only for the missing `ws` package, pre-existing).
   b. MOTION: new space motion samples: pause every animation on a space turn and set `currentTime` to 0/25/50/75/100%, record computed transforms/opacities (easing, direction, wrap glide) into a frozen JSON captured on pre-change code; plus the fake-clock state-sequence test of §2.1. (`animations:'disabled'` frames cannot see motion.)
   c. `verify:ring`: compare NAMED findings with their measured values (the full line text of every PASS/FAIL/WARN) against a frozen capture from origin/main; the only allowed differences are pre-declared (the primitive-name parity line lists one fewer registered ring world). Not a count.
2. FOREST DEBUG API (exact): `window.__forest = { seed, setSeed(n), station, turn(), jumpTo(i), freeze(t), unfreeze() }`. `setSeed` re-runs the generator with the new seed (plumbing added to the ported generator); `freeze(t)` pauses every animation and sets its `currentTime` to `t` ms of the current walk (or of rest time) so capture is deterministic.
3. Known-answer probes for forest gates, each with a same-scene control (must be identical) and a changed-scene control (must differ): same station twice at the same frozen time = identical raster; station k vs k+1 differ; `setSeed(seed+1)` differs; station 0 after 13 `turn()`s vs a fresh station 0 at the same frozen time = identical raster (pixels, not DOM; generated ids ignored).
4. FIDELITY: ported frames for stations 0, 1, 3, 5, 10 and walk frames at 0/25/50/75/100% (via `freeze`) compared to golden frames from `haunted-forest-walk-v3.html` captured the same way (same `currentTime` method, the prototype at its own 4 s / 6 m). Metric and tolerance are fixed BEFORE the first comparison and probed with one deliberately wrong render. Longer-walk values (§1.1) are judged by looking + gate 5, not by fidelity to v3.
5. SAFE BOX + CONTRAST per §2.5, text contrast >= 7:1 against the render.
6. PERF/WALK: no rAF/canvas (grep); walk start main-thread cost under ~10 ms median at the final `walk` values; item and animation counts reported; measured on the REAL `/display` route with a slide transition running (ART §8) and `window.innerWidth === 1920` asserted; then on the real rig before merge. Strobe: peak bright-layer speed <= ~8 px/frame at 60 Hz.
7. STATE (forest): alignment at `slideIndex % 13` before first paint; live world switch space<->haunted<->space mid-show with `data-forest-station` asserted after each switch and each advance; grading-break round trip (warp out -> override 10 -> RING_RETURN); rapid double advance and jump-during-walk per the §2.1 contract (queue one, jump cancels); reload mid-show.
8. MOTION QUALITY: Emil/Impeccable review of the ported renderer (same reviewers as v3), animation census test of §2.3.
9. Ben watches the ported world on the real `/display` route (provisional look after 3b; final sign-off only after phones, gate 10).
10. PHONES (before final approval, Codex 12): shared station resolver fed the HOST's live position (`show.current_slide_index`) with the break override, used by `Display.jsx` and `Join.jsx`; Tier 1 palette (contrast >= 7:1 via `floorContrast`); Tier 2 static backdrop (gradient + horizon strip, hue follows the station); phone audit at 375/390/430 together; every interactive board re-checked.

## 4. Phases

3a write + pin the camera contract on the current RingAmbient (state-sequence test, space motion samples, frozen `verify:ring` findings) THEN extract the controller (gate 1). 3b renderer-neutral world data + ForestAmbient port + `window.__forest` + forest verifier + wiring behind `approved:false` (gates 2-7). PROVISIONAL stop: Ben looks on real `/display`. 3c polish (crow visibility, denser canopy at rest, dread option; walk values). 3d phones (gate 10). 3e real-TV full 13-station auto-play; `approved:true` only after Ben's final sign-off (gates 8-10).

## 5. Open questions for Ben

Walk length/pace final values (default 7 s / 10 m; try `haunted-forest-walk-v3-long.html`); dread vs Jackbox-cute; whether the 13 landmarks stay as built; acceptance of the §2.3 rules interpretation.

## 6. Deferred

True 3D / three.js (needs an rAF waiver; reviewer estimates CSS closes ~70% of the gap); Halloween jukebox tint; picker UI; recolor script.
