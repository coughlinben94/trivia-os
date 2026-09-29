# Haunted October: forward-walking forest renderer (DRAFT r0, pivot spec)

Date: 2026-09-29. Supersedes the RENDERER and ART parts of `2026-09-28-halloween-ring-world-design.md` (Phase 2 look rejected by Ben: "too close to the ambient background bs we did in the past... i want to feel like im wandering through a haunted forest... walking forward"). Keeps that spec's decisions on: theme id `haunted-october`, 13 stations, harvest moon = jukebox picture at index 10 (`musicStation`), 80" TVs gate at 30 ft (min stroke 7px on 1920x1080), phone plan (§4.11 there), branch/worktree, gates on the space world. Not built. Ben has not approved this spec.

## 1. Idea (Ben's words: "the same concept as the ring station, just moving forward instead of sideways")

13 stations, one per slide, world closes into a loop. Instead of a cylinder that turns sideways, the viewer walks forward along a path through a haunted forest. Each slide advance = walk to the next clearing (a station with one landmark). At rest the trees sway a little and fog drifts. After station 12 the path leads back to station 0.

## 2. Renderer

- New component `ForestAmbient.jsx`, a 2D canvas (1920x1080 logical, DPR 1) that fakes depth: every tree has a world position (x lateral, z along the path); screen position = projection of x/z, scale = 1/z, alpha/tint by depth (fog).
- Same imperative contract as `RingAmbient` where the rest of the app touches it (ref `turn()`, `station`, slide-index alignment to `slideIndex % 13` before first paint, `stationOverride` for the jukebox break). Phase 1 seams (`ringStationOverride`, world-switch remount key, station alignment) are reused unchanged.
- Selection: a world declares `renderer: 'forward'`; `ParticleBackground` picks `ForestAmbient` for such worlds and `RingAmbient` otherwise (space world has no field, default 'ring', unchanged).
- Deterministic forest: trees placed by hashing a z-bucket with the world seed (`rng`/`hash32` from `ringEngine.js`), never `Math.random`. Loop length L = 13 x D (D = distance between stations); position hashing is modulo L so the world closes exactly and station 0 after 13 turns is the same frame as the start.
- Tree art: ~6 seeded procedural silhouette variants (trunk + recursive branches, bare, some leaning), pre-rendered once to offscreen canvases and drawn scaled. Near trees near-black, far trees fog-lit. No generated or vectorized art; code only.
- Path: a pale worn strip narrowing to the horizon. Center corridor kept free of trees (|x| < corridor half-width scaled by depth) so the middle 60% x 45% stays open and dark for question text.
- Fog: 3-4 soft depth bands drifting slowly; light sources (lantern, moon shaft, cabin window) are radial glows drawn at their landmark's depth.
- Walk: on `turn()`, camera z advances D over ~2.2 s (ease in/out), trees stream past; landmark of the next station ends centered-ahead-left/right, never in the safe box. Rest: tiny sway (sin, <= 6px near layer), fog drift; canvas redraws at ~15 fps at rest, 60 fps during a walk.
- Reduced motion: no sway, no fog drift, walk becomes a 400 ms crossfade to the new station.
- Rules check for Codex: Critical Rule 2 (GPU-only animation, transform/opacity) governs CSS keyframes; this is a canvas draw loop. Rule 1 (ParticleBackground never remounts on slide advance) holds: the canvas persists; only a world change remounts (Phase 1 key).

## 3. Stations (13, kept from the ring spec, adapted to forest; index = slide mod 13)

Each station = one landmark in a clearing beside the path, with a light source. Noun test applies as before: write `PASS = a fresh viewer names this as ___` in a code comment before drawing.

| Idx | Landmark | Light | Class |
|-----|----------|-------|-------|
| 0 | fence gate at the forest edge | dusk glow behind | iconic |
| 1 | jack-o'-lantern on a stump | its own glow | iconic |
| 2 | dead tree with hanging branches | bruise-purple sky gap | iconic (uses the tree generator) |
| 3 | gravestone row | low moon shaft | iconic |
| 4 | will-o'-wisps over a bog | green glow | iconic |
| 5 | falling leaves in a shaft of light | amber shaft | iconic |
| 6 | spiderweb strung between trunks | pale moonlight | iconic |
| 7 | lantern on a post | its own glow | iconic |
| 8 | haunted cabin with lit windows | window glow | FIGURATIVE (two-strike protocol) |
| 9 | fog bank across the path | grey glow | iconic |
| 10 | harvest moon through a gap (jukebox picture) | moon | iconic |
| 11 | bats crossing a clearing | moon | iconic |
| 12 | crow on a branch | dim moon | FIGURATIVE (two-strike protocol) |

Figurative failure path (per `OBJECT-RENDERING-PROTOCOL.md`): a landmark failing a fresh visual read twice escalates to tighter reference-tracing, still hand-built; if that fails, stop and ask Ben.

## 4. Reuse from the ring work

Kept: per-world config (`musicStation`, `pinKey/pinAt`, `autoDraw: false`), the pure `ringStationOverride` resolver, world-switch remount key + station alignment, `ring-baseline.mjs` frozen space frames, `ringWorldFor` snapshot, theme entry and palette, picker `approved` flag. Dropped: Phase 2's sky regions, horizon band, and harvest-moon prim (still in git history on the branch). `hauntedOctober.ring.js` becomes forest world data (stations, landmarks, palette, `renderer: 'forward'`, `approved: false`).

## 5. Gates

1. Space unchanged: all 13 frames + motion.json identical to `~/Projects/baynes-trivia/ring-baselines/space-08f249c-v2`; `ringWorldFor` snapshot unchanged; unit suite green (2 relay files fail only for the missing `ws` package, pre-existing); `verify:ring` FAIL/WARN names unchanged from main.
2. Determinism: same seed produces identical forest; loop closure: frame at station 0 after 13 turns equals the start frame within a tolerance.
3. Depth read: a frame-sequence of one walk (sampled at 0, 25, 50, 75, 100%) reviewed by looking; tree scale/order monotonic; no popping when a tree recycles (test: no tree appears or vanishes inside the visible frustum).
4. Safe box: centre 60% x 45% mean luminance <= 34 and p99.5 <= 68 at every station (same cap as the ring spec), text contrast >= 7:1 measured against the render.
5. 30 ft check: Gaussian blur sigma ~2.9 px; each landmark and the tree line still read. Min stroke 7px.
6. Performance: p95 frame time during a walk <= 16.7 ms and idle CPU low, measured in bundled Chromium on this Mac; canvas paused when tab hidden.
7. PROOF SCENE GATE: before any landmark beyond one clearing, Ben watches the proof scene (path + streaming trees + fog + one clearing, walk between two stops) in his browser and approves. Nothing further is built before that.

## 6. Phases

P0 (done): baseline. P1 (done): seams. P2' proof scene (this spec): `ForestAmbient` + procedural trees + path + fog + one clearing, wired via `renderer: 'forward'`, behind `approved: false`. Stop for Ben. P3': easy landmarks (0,1,3,4,5,6,7,9,10,11). P4': figurative (2 is tree-generator based, 8 cabin, 12 crow). P5': phone Tier 1 + Tier 2 (from the ring spec §4.11). P6': real-TV check.

## 7. Open questions for Ben

Walk length per slide (default ~2.2 s); whether the stop should hold a slow forward creep instead of a full stop; whether daylight-orange dusk or full night is the lead sky (default: deep night, warm light sources, faint orange horizon glow).
