# Haunted October: forest walk as a real Trivia OS world (r1)

Date: 2026-09-29. Replaces r0 of this file (canvas renderer, rejected by the Fable critique: ART-DIRECTION-SPEC §8 and themes.md rule 4 ban an always-on rAF/canvas background). Supersedes the RENDERER and ART parts of `2026-09-28-halloween-ring-world-design.md`; keeps its decisions: theme id `haunted-october`, 13 stations (one per slide, loop), harvest moon at index 10 = `musicStation`, TVs (two 80in gate at 30 ft, min stroke 7px on 1920x1080; 40in advisory), phone plan (§4.11 there: Tier 1 palette + Tier 2 backdrop), branch `feat/haunted-october-world` in worktree `~/Projects/baynes-trivia/trivia-os-haunted`, the frozen space-world gates. Ben's verdict on the prototype: v3 "looks awesome" (2026-09-29). Not built. Not approved for merge.

## 1. Source of truth

`concepts/haunted-forest-walk-v3.html` (commit 8672a7c and ancestors, 724 lines) is the visual and motion reference. Ben liked it; the job is to PORT it into the app, not redesign it. The port must reproduce v3's rest frames and walk closely (gate 3). v3 facts: pure CSS transform/opacity keyframes plus chained `setTimeout`, zero `requestAnimationFrame`/`Math.random`/canvas, content is a pure function of the integer station 0..12, seeded generator, DUR 4000 ms, 24 keyframe stops, 68-80 items and 143-178 animations per walk, `advance()` median 8 ms.

## 2. Design

### 2.1 Extract the station state machine first (Fable finding 2)
The station logic is private to `RingAmbient.jsx`: alignment on mount (`lastSlideIndexRef` seeded null + `ringNavAction`), the stationOverride round trip with `returnStationRef`, busy/queued turns, `forceSnap`. Extract it into one hook `useStationCamera({ slideIndex, stationOverride, forceSnap, stationCount, onTurn(dir), onJump(i) })` used by BOTH renderers. Gate: the space world must stay byte-identical (frozen 13 frames + motion.json, `ringWorldFor` snapshot, `ParticleBackground.worldSwitch.test.jsx`, `RingAmbient.worldSeams.test.jsx`, existing suite). Nothing else in Phase 3a.

### 2.2 ForestAmbient (DOM/CSS, rule-compliant)
`client/src/components/display/ForestAmbient.jsx` builds the DOM imperatively in a ref like RingAmbient and runs v3's world generator, walk (generated CSS keyframes) and rest life (creep, idle sway, lantern flicker, fog drift) on it. No rAF, no canvas, no WebGL: CSS transform/opacity + chained setTimeout only. Every animated element has a prefers-reduced-motion path (v3: jump with a 400 ms opacity crossfade). It consumes `useStationCamera`.

### 2.3 Wiring (Fable finding 3; every caller that assumes a ring)
- `world.renderer: 'forest'` (space has none = 'ring'). `ParticleBackground.jsx:~1257` branches on it (today it hardcodes RingAmbient); its key remains `ringWorldId ?? 'none'`.
- `AmbientAudit.jsx` mounts RingAmbient directly at ~117: give it the same branch or `?world=haunted-october` throws in `makePrim(undefined)`.
- World data fields that MUST exist for forest worlds: `id`, `type:'terrestrial'`, `stations[].key` (13), `layers.stars:false`, `sky[4]`, `tints` (WarmTints: `WarpTransition` reads `sky[2]`, `sky[last]`, `tints.starTint3`, `tints.drift`; today `BASE_TINTS` gives blue-white motes over an orange forest), `musicStation`, `approved:false`. `pinKey/pinAt/slots/prims/layerArt/skyRegions` are dead for a forest world and are removed from `hauntedOctober.ring.js`; Phase 2's ring art (`hauntedOctober.art.js`, harvest-moon prim, sky regions, horizon band) is dropped from the runtime (stays in git history).
- `hauntedOctober.ring.js` module-load throw if its THEMES entry is missing (Phase 1 review #5): downgrade to `console.error` + skip registration so the space show cannot be taken down.
- `ring-baseline.mjs` (frames, `animations:'disabled'`, DOM counts) does not apply to forest frames; forest gets its own capture in §3.
- Theme pickers gate on `approved`; stub must stay hidden until Ben signs off.

### 2.4 Safe box (Fable finding 4)
v3 numbers are the acceptance floor: text-box (left 20%, top 28%, width 60%, height 44%) mean <= 34 and p99.5 <= 68 at every rest frame AND every sampled walk frame; v3's worst was 59.2. Trunk branches sweep the box as z falls, so the spec keeps v3's rule that nothing closer than 1 m is drawn at rest and near items fade over the last 400 ms; the port must not regress these (gate 4).

### 2.5 Jukebox picture (Fable finding 12)
Station 10 (harvest moon) stays `musicStation` for continuity, but the jukebox overlay paints an opaque layer over it: do not spend art effort on the "behind the jukebox" framing. Confirm against `JukeboxBreakOverlay.jsx` / LiveScreen during Phase 3b.

## 3. Gates

1. SPACE UNCHANGED (every phase): 13 frames + motion.json identical to `~/Projects/baynes-trivia/ring-baselines/space-08f249c-v2` via `scripts/ring-baseline.mjs`; `ringWorldFor` snapshot unchanged; unit suite green (the two relay files fail only for the missing `ws` package, pre-existing); `verify:ring` FAIL/WARN names unchanged from main (13 FAIL, 2 WARN).
2. Hook for tests: `window.__forest = { seed, station, turn(), jumpTo(i), freeze(t) }`. Known-answer probes: same station twice = 0 diff; different station must differ; seed+1 must fail equality; station 0 after 13 turns equals a fresh station 0 EXACTLY with time frozen (no tunable tolerance; v3's 0.196 mean difference came from time-based motion).
3. FIDELITY: ported rest frames for stations 0, 1, 3, 10, 5 and walk frames at 0/25/50/75/100% compared numerically to golden frames captured from `haunted-forest-walk-v3.html` (metric and numeric tolerance fixed BEFORE the first comparison and probed with one deliberately wrong render).
4. SAFE BOX + CONTRAST: every rest frame (13) and mid-walk frames (walks 0->1, 2->3, 9->10, 12->0) at mean <= 34, p99.5 <= 62 (headroom), text contrast >= 7:1 measured against the render.
5. WALK/PERF: no rAF/canvas (grep); walk main-thread cost under ~10 ms median; layer/animation counts no worse than v3; measured in the REAL /display route with a slide transition running (ART §8), not only /ambient; on the real rig before merge, with `window.innerWidth === 1920` asserted or backing sized to the stage.
6. STATE: alignment on mount at slideIndex % 13; live world switch space<->haunted<->space mid-show with visible station index asserted after each switch and advance; grading-break round trip (warp out -> override 10 -> RING_RETURN); rapid double advance; reload mid-show.
7. MOTION QUALITY: Emil/Impeccable review of the ported renderer (same reviewers as v3); strobe check on the sample-and-hold TV (peak bright-layer speed <= ~8 px/frame at 60 Hz).
8. PROOF: Ben watches the ported world in the real /display route (not the prototype) before any polish beyond parity.

## 4. Phases

3a extract `useStationCamera` (space frozen). 3b port ForestAmbient + wiring behind `approved:false` + `window.__forest` + verifier + gates 1-6. STOP for Ben. 3c polish (crow visibility, denser canopy at rest, dread option, walk 3.2 vs 4.0 s; Ben decides). 3d phones: shared station resolver (host live position) + Tier 1 palette + Tier 2 static backdrop, phone audit at 375/390/430. 3e real-TV run: full 13-station auto-play for judder and dropped frames; `approved:true` only after Ben signs off.

## 5. Open questions for Ben

Walk duration 3.2 s vs the 4.0 s v3 shipped (its origin is unclear: the builder found DUR=4000 set before its first write); how much dread vs Jackbox-cute; whether the 13 landmarks stay as built.

## 6. Deferred

True 3D / three.js (needs an rAF waiver; the reviewer estimates CSS already closes ~70% of the gap); Halloween jukebox tint; picker UI; recolor script.
