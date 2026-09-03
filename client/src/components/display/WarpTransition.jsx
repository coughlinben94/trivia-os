import { useEffect, useRef, useMemo } from 'react'
import { ringWorldFor } from './ParticleBackground.jsx'
import { useTheme } from '../shared/ThemeProvider.jsx'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
import { withHueOf } from '../../lib/weightedPalette.js'
import { hexToRgb } from '../../lib/oklab.js'

// Vortex transition for the jukebox grading break (2026-08-17, Ben: "like
// the grading break itself has an Sx station tied to it. then after the slide
// is there for 10 seconds, it 'warps' to the jukebox, then when done, warps
// back to round 2 slide Sx").
//
// 2026-08-17, second pass: the first build of this file was a lightspeed
// star-streak warp — stars radiating outward on a perspective divide. Ben
// rejected that direction outright ("i meant like a spinning warp, not
// lightspeed warp") and picked a swirling vortex instead: "the whole scene
// rotates and pulls toward center in a spiral, screen-wide... more dramatic
// and chaotic... no hard-edged shape." Water down a drain, not a hyperspace
// jump, and specifically NOT a clean ring — a ring shape was the option he
// passed over. Follow-up note the same day: it has to read cinematic, not
// like a functional geometric effect. See the "cinematic beats" section.
//
// Two directions, one loop:
//   dir='out'  — the vortex winds up, spins into a spiral pull, flashes at
//                peak force, and the drain core swallows the screen to opaque
//                black. Display mounts JukeboxBreakOverlay (and jumps the ring
//                onto the record) in the commit onDone triggers, so the
//                station change lands behind a full-black frame.
//   dir='back' — the true time-reverse. Opens on that same black core mid-
//                flash, which blooms open as the vortex unwinds and flings its
//                material back outward, decaying to nothing as the canvas
//                lifts. The ring's jump back to Sx happens under the opaque
//                opening frames, same commit this mounts.
//
// ── Why this technique (and not the obvious ones) ──
//
// The bar is 1920x1080 at 60fps over live show content; a dropped frame here
// is visible on the TV. Three approaches were weighed:
//
//   1. Per-pixel polar remap (the textbook "swirl distortion": inverse-map
//      each destination pixel through a radius-dependent rotation and sample
//      the source). Correct-looking, and far too slow — 2.07M pixels/frame,
//      and because the swirl amount changes every frame you cannot bake one
//      static displacement LUT. getImageData/putImageData alone costs several
//      ms before a single sample is taken. Rejected on cost.
//   2. WebGL, where that remap is free. Rejected on precedent: grep for
//      getContext across client/src returns '2d' at every single call site
//      (StateOfUnion, WinnerReveal, TeamPicker, StationRingLayer,
//      AlbumGradientMesh, autoFitText). Introducing a second rendering
//      paradigm for one 1.25s transition is not worth the surface area.
//   3. Concentric clipped ring redraws — what the throwaway preview artifact
//      used to sketch the concept for Ben. 64 nested save/clip/rotate/
//      drawImage/restore per frame, i.e. the whole scene bitmap redrawn 64
//      times per frame. That was built to show the IDEA in a few minutes, not
//      to ship, and it also produces exactly the hard-edged banding Ben said
//      he did not want.
//
// What ships instead is a **feedback (echo) loop plus advected particles**,
// the classic way this effect is actually done in real time:
//
//   - Each frame the previous frame is drawn back onto the canvas once,
//     rotated a few degrees and scaled slightly toward center, at ~0.90
//     alpha. That single full-screen composite is what makes "the whole
//     scene rotate and pull toward center" literally true — every mark
//     already on the canvas gets swept inward again, compounding into smooth
//     spiral smear. It is GPU-backed and costs one textured blit, not 64.
//   - A rigid rotation alone would read as a spinning disc, not a drain. The
//     shear — the thing that makes it a vortex — comes from ~1200 motes whose
//     angular velocity rises sharply as radius falls (SWIRL_Q below), each
//     drawn as one short trail. The feedback loop then smears those
//     differential paths into curved arms. Cost is O(motes), not O(pixels),
//     and the trails are batched into LAYERS x BANDS Path2Ds so the frame
//     issues 12 stroke() calls rather than 1200.
//   - Soft luminous blobs ride the same flow field so the mass reads as
//     fluid rather than as a swarm of dots, and per-mote angular turbulence
//     keeps it chaotic instead of a polite set of concentric circles.
//
// ── Cinematic beats (2026-08-17 follow-up) ──
//
//   - **Parallax depth.** The motes are split across three depth layers with
//     their own speed, brightness and stroke weight: dim, thick, slow haze
//     behind; crisp, fast, bright debris in front. A single flat field is the
//     main thing that makes a CG vortex read as a diagram; the speed
//     differential between layers is what buys perceived depth, and it costs
//     nothing but a multiplier because the layers are already separate paths.
//   - **Velocity-proportional smear.** Each trail is drawn from the mote's
//     genuine previous position, so its length is already proportional to
//     local angular velocity — the inner core self-blurs into long streaks
//     while the rim stays near-static. Trails whose angular step is large
//     enough to visibly cut the corner get one mid-point inserted, so fast
//     inner motes render as curved arcs instead of straight chords. That is
//     both the smear and a real correctness fix, for two trig calls.
//   - **Colour grade.** The ground is a CSS radial vignette on the canvas
//     element itself (cool centre, near-black rim) — a real graded backdrop
//     for zero per-frame cost. Mote colour is graded from cold blue toward
//     warm white as the pull deepens, so the vortex visibly heats up under
//     load rather than staying one flat accent blue.
//   - **Wind-up, then force.** Intensity is not a monotonic ease. The first
//     ~30% is nearly held — plus a small *counter*-rotation on the feedback
//     pass, a genuine anticipation beat — and then force builds steeply. The
//     eye reads the hold as something gathering.
//   - **The snap.** At peak pull the spin spikes and a warm bloom fires from
//     the core, and the drain swallows it a few frames later. That beat is
//     what makes this land as an event rather than a smooth fade, and 'back'
//     opens on its release.
//
// Frame budget, against the 16.6ms at 60fps: two full-screen composites (the
// feedback blit and the snapshot copy) plus the clamped core gradient
// dominate at a few ms combined; the JS is ~3600 trig ops and ~1200 short
// polylines, well under a millisecond. The bloom is one extra clamped
// gradient and only paints inside its own ~0.28-wide window. Comfortable
// headroom, and every added beat above is a multiplier or a single extra
// fill — none of them reintroduce per-pixel work.
//
// ── Why this paints its own imagery instead of distorting the real scene ──
//
// This canvas is an overlay: the ring world and the current slide are live DOM
// underneath it, not pixels it owns. Genuinely distorting them would mean
// rasterizing the page to a bitmap every frame, which is not something a 2D
// canvas can do at all. Both siblings solve the same "sits over live content"
// problem the same way — JukeboxBreakOverlay simply covers with its own
// opaque black, and this file's own previous (lightspeed) version painted a
// self-contained star field rather than touching the scene. Same call here:
// the vortex is generated imagery that reads as reality spiralling away, and
// the real cut happens underneath it while the frame is opaque.
//
// Nothing here reaches into ringPrimitives.js or RingAmbient.jsx — this stays
// a sibling overlay, and the ring's own station jump is coordinated entirely
// through Display.jsx's onDone commit, exactly as before.
//
// Colours follow the RING WORLD, never the show theme — same call the previous
// version made, now actually wired instead of hardcoded to the world's colours
// as they happened to be. This reads as the ring world's own night sky being
// pulled under; a warm show theme tinting it makes it read as confetti
// instead, so `theme` is deliberately not consulted here. What changed: the
// world is recolourable now (scripts/ring-recolor.mjs), and a blue-black
// vortex under a red ring is the same mismatch by a different route. The
// sky stops come straight from the world; the mote bands and the warm grade
// are the authored ramps rotated onto the world's own cool and warm tints
// (withHueOf: same lightness and chroma, new hue), so the ramp's shape —
// cold rim, hot core, warming as the pull deepens — survives any palette.

// 2026-08-17, Ben, after seeing it live: "both in and out need to be twice
// as long." Was 1250ms. Every timing beat below (wind-up threshold, snap
// window, drain-open point, veil saturation point) is expressed as a
// FRACTION of this duration, not an absolute ms value, so doubling it here
// stretches the whole choreography proportionally -- the wind-up still
// holds for the first 22%, the snap still peaks at t=0.82, etc. -- rather
// than needing every beat retuned by hand.
const DURATION_MS = 2500
const W = 1920
const H = 1080
const CX = W / 2
const CY = H / 2
const TAU = Math.PI * 2
// Spawns sit just past the 1101px half-diagonal so nothing pops into being
// inside the frame.
const R_MAX = 1320
const MOTES = 1500
const BLOBS = 10
const ARMS = 3

// Flow field. All rates are per 60fps frame at full warp; dtn scales them.
const SPIN = 0.055 // base angular step
const SWIRL_Q = 1.35 // differential shear — inner radii spin ~5x the rim
const INFLOW = 0.021 // fraction of radius eaten per frame
const TURB = 0.030 // chaotic angular wobble, kills concentric-circle regularity
const G_SPIN = 0.038 // whole-frame feedback rotation
const G_PULL = 0.0075 // whole-frame feedback scale toward center
const DECAY = 0.90 // feedback alpha retention — sets trail length

// Parallax layers, back to front: dim thick slow haze, mid body, fast crisp
// debris. `share` is cumulative, so the ranges partition the mote array.
const LAYERS = [
  { share: 0.36, speed: 0.55, alpha: 0.42, width: 2.30 },
  { share: 0.76, speed: 1.00, alpha: 0.88, width: 1.00 },
  { share: 1.00, speed: 1.62, alpha: 1.15, width: 0.70 },
]
// Radius bands: cold at the rim, hot white in the core, graded toward WARM as
// the pull deepens. The four authored steps and the warm target keep their
// lightness and chroma; only their hue rotates, onto the ring world's own cool
// star tint and warm drifter. Under the shipped purple world that lands within
// a channel or two of the literals these replaced.
const rotate = (rgb, ref) => hexToRgb(withHueOf(
  '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join(''), ref))

const isReduced = () =>
  typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function WarpTransition({ dir = 'out', onDone }) {
  const canvasRef = useRef(null)
  // onDone is an inline arrow in Display's JSX (new identity every render) —
  // held in a ref so the loop below never restarts because of it.
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  const { theme } = useTheme()
  // The same recoloured (or base) world ParticleBackground froze at mount —
  // ringWorldFor's own cache means this is the identical object, not a
  // second recolour computed from scratch. Recomputed only if theme/palette
  // identity changes (it doesn't mid-warp; this component remounts per warp).
  // Fallback to midnightGalaxyRing: the grading-break warp fires on EVERY
  // theme (Display.jsx's breakEligible has no theme check), but RING_WORLDS
  // only has a midnight-galaxy entry — ringWorldFor returns undefined for
  // the other 20 themes. Pre-this-file's-palette-runtime-change behavior was
  // to hardcode midnightGalaxyRing unconditionally; this preserves that,
  // rather than throwing (a throw here is swallowed by Display.jsx's
  // ErrorBoundary, but onDone never fires and the grading break gets stuck).
  const world = useMemo(() => ringWorldFor(theme) ?? midnightGalaxyRing, [theme])
  // Same stop RingAmbient paints its stage ground with — the world's own
  // terminal sky, not a second near-black to keep in sync by hand.
  const BG = world.sky[world.sky.length - 1]
  // Graded ground rather than a flat fill — cool core, near-black rim, from
  // the world's own sky ramp. On the element's own CSS background so it
  // costs nothing per frame and rides the same opacity veil as the canvas
  // pixels.
  const GROUND = `radial-gradient(ellipse at 50% 50%, ${world.sky[2]} 0%, ${BG} 58%, #000005 100%)`
  // Radius bands: cold at the rim, hot white in the core, graded toward WARM
  // as the pull deepens. The four authored steps and the warm target keep
  // their lightness and chroma; only their hue rotates, onto the ring
  // world's own cool star tint and warm drifter.
  const COOL_REF = world.tints.starTint3
  const WARM_REF = world.tints.drift
  const BANDS = useMemo(() => [
    { c: (rotate([118, 146, 255], COOL_REF)), a: 0.42, w: 1.0 },
    { c: (rotate([156, 186, 255], COOL_REF)), a: 0.62, w: 1.5 },
    { c: (rotate([206, 226, 255], COOL_REF)), a: 0.84, w: 2.1 },
    { c: (rotate([246, 251, 255], COOL_REF)), a: 1.00, w: 3.0 },
  ], [COOL_REF])
  const WARM = useMemo(() => rotate([255, 206, 146], WARM_REF), [WARM_REF])

  useEffect(() => {
    // Reduced motion: no vortex at all, instant cut — the codebase's standing
    // fallback (RingAmbient's isReduced(), ParticleBackground's own guards).
    // onDone still fires, so the break sequence is byte-identical in ordering,
    // just not animated: the jukebox still opens, the ring still returns.
    if (isReduced()) {
      const t = setTimeout(() => doneRef.current?.(), 0)
      return () => clearTimeout(t)
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) { doneRef.current?.(); return }
    canvas.width = W
    canvas.height = H

    // Feedback buffer. The previous frame has to be read while the visible
    // canvas is being cleared, so it lives in its own bitmap rather than
    // relying on a canvas drawing onto itself.
    const scratch = document.createElement('canvas')
    scratch.width = W
    scratch.height = H
    const sctx = scratch.getContext('2d')
    if (!sctx) { doneRef.current?.(); return }

    const out = dir !== 'back'

    // ── Flow-field state, flat arrays so the loop never allocates or GCs ──
    const mr = new Float32Array(MOTES) // radius
    const ma = new Float32Array(MOTES) // angle
    const ms = new Float32Array(MOTES) // per-mote speed jitter
    const mk = new Float32Array(MOTES) // turbulence phase seed
    const ml = new Uint8Array(MOTES) // parallax layer
    const mx = new Float32Array(MOTES) // previous x — the trail's tail
    const my = new Float32Array(MOTES)
    // Deferred per-frame segment endpoints. Path2D has no reset/clear API, so
    // building 12 fresh Path2Ds a frame (~1000+ short-lived objects per break
    // at 60fps) is a GC-pause risk on the live TV — exactly what this file
    // says elsewhere it's trying to avoid. These arrays are allocated once
    // and reused every frame instead: pass 1 (physics) writes each mote's new
    // endpoint and path-group index here without touching the canvas; pass 2
    // strokes each of the 12 groups with the context's own resettable path
    // (beginPath), filtering these arrays instead of allocating Path2Ds.
    const mnx = new Float32Array(MOTES) // this frame's new x, written before mx/my update
    const mny = new Float32Array(MOTES)
    const mMidX = new Float32Array(MOTES)
    const mMidY = new Float32Array(MOTES)
    const mHasMid = new Uint8Array(MOTES)
    const mGroup = new Int16Array(MOTES) // layer*BANDS.length + band, -1 = no segment this frame

    // Arms spawn as spirals (the r term) and drift, so the vortex has visible
    // structure without any of it being a hard-edged shape.
    const armAngle = (r, phase) =>
      (Math.random() * ARMS | 0) * (TAU / ARMS)
      + phase
      + (Math.random() - 0.5) * (TAU / ARMS) * 0.75
      + r * 0.0026

    for (let i = 0; i < MOTES; i++) {
      // sqrt keeps the initial scatter uniform per unit AREA — a plain
      // random() radius piles everything into the middle.
      const r = R_MAX * Math.sqrt(Math.random())
      const q = i / MOTES
      mr[i] = r
      ma[i] = armAngle(r, 0)
      ms[i] = 0.62 + Math.random() * 0.85
      mk[i] = Math.random() * TAU
      ml[i] = q < LAYERS[0].share ? 0 : q < LAYERS[1].share ? 1 : 2
      mx[i] = CX + Math.cos(ma[i]) * r
      my[i] = CY + Math.sin(ma[i]) * r
    }

    const br = new Float32Array(BLOBS)
    const ba = new Float32Array(BLOBS)
    const bs = new Float32Array(BLOBS)
    const bz = new Float32Array(BLOBS)
    for (let i = 0; i < BLOBS; i++) {
      br[i] = R_MAX * (0.20 + 0.78 * Math.random())
      ba[i] = Math.random() * TAU
      bs[i] = 0.55 + Math.random() * 0.8
      bz[i] = 120 + Math.random() * 145
    }

    // 'back' opens on an already-opaque frame: the ring jumps to Sx in the
    // same React commit this mounts, so the canvas must be covering before
    // the first rAF lands. veil is t*t and t starts at 1 for 'back', so this
    // only pre-empts the one-frame gap before the loop sets it itself.
    canvas.style.opacity = out ? '0' : '1'

    let start = 0
    let last = 0
    let raf = 0
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      // Watchdog can fire ahead of a throttled/paused rAF loop (OS lock,
      // alt-tab, RDP glitch) — force the guaranteed-opaque cover before the
      // caller snaps station state, or the handoff shows a raw flash instead
      // of a covered cut.
      //
      // `out` ONLY (fixed 2026-08-18). finish() also runs at the natural end
      // of a 'back' warp, where the loop has just eased veil to 0 to reveal
      // the world again — forcing opacity to 1 there re-covers the screen
      // with this canvas's opaque GROUND background for one frame. onDone →
      // setWarp(null) is a React state update scheduled from a rAF callback,
      // so it lands after the current frame paints: the black frame is
      // guaranteed to show. That put a hard black blink on the tail of every
      // jukebox-break RETURN, i.e. once per grading break, all show. The
      // opaque-cover rationale above is specific to 'out' (cover, then let
      // the caller snap station state underneath); 'back' wants the opposite
      // ending in both the natural and watchdog cases.
      if (out) canvas.style.opacity = '1'
      doneRef.current?.()
    }

    const draw = (now) => {
      if (!start) { start = now; last = now }
      const dtn = Math.min(26, now - last) / 16.6667 // frame-rate independent, capped
      last = now
      const p = Math.min(1, (now - start) / DURATION_MS)
      // Intensity ramps in on 'out' and decays on 'back' — the same curve read
      // in opposite directions, which is what makes the pair read as one round
      // trip rather than two effects.
      const t = out ? p : 1 - p
      // Wind-up, then force. Not a plain ease: the first 22% is nearly held
      // (0 -> 0.10) so the vortex reads as gathering, then power builds hard.
      // The two halves meet at exactly 0.10, so the curve is continuous and
      // there is no visible kink at the handover.
      const warp = t < 0.22
        ? t * (0.10 / 0.22)
        : 0.10 + Math.pow((t - 0.22) / 0.78, 1.45) * 0.90
      // Veil: how much of the screen the canvas owns. Squared so the scene
      // stays readable while the vortex spins up, then the cover slams on.
      // Deliberately saturates at t=0.94 rather than 1.0: rAF timestamps
      // almost never land exactly on DURATION_MS, so a veil that only reaches
      // 1 in the limit leaves the real final frame at ~0.97 and the live scene
      // ghosts through the handover. Reaching full cover early makes the
      // "ends fully opaque" contract hold regardless of where frames fall.
      const veil = Math.min(1, Math.pow(t / 0.94, 2))
      // The snap: a spin spike and a warm bloom at peak pull, just before the
      // drain closes over it. 'back' opens on this beat releasing.
      const pl = Math.max(0, 1 - Math.abs(t - 0.82) / 0.13)
      const pulse = pl * pl
      // The drain. Sits as a small soft hole for most of the run, then from
      // t=0.82 expands to swallow the frame, so 'out' genuinely ends opaque
      // and the cut to JukeboxBreakOverlay's own black is invisible. It opens
      // just after the bloom peaks, so the flash reads before it is eaten.
      // Denominator matches veil's own 0.94 saturation point (t=0.82+0.12),
      // not veil's 0.18-wide predecessor: the drain's opaque radius must
      // reach the 1101px corner distance by the same t where veil declares
      // full cover, or the TV corners go briefly uncovered on 'back's open.
      const sw = Math.max(0, (t - 0.82) / 0.12)
      const elapsed = (now - start) / 1000

      // ── 1. Feedback: sweep the whole previous frame inward one notch ──
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, W, H)
      if (start !== now) {
        // Anticipation: during the held wind-up the whole field creeps
        // backwards a touch before the pull takes hold.
        const windUp = t < 0.22 ? -0.16 * (1 - t / 0.22) : 0
        const spin = (out ? 1 : -1) * G_SPIN * (warp * (1 + pulse * 1.7) + windUp) * dtn
        const pull = 1 + (out ? -1 : 1) * G_PULL * warp * (1 + pulse) * dtn
        ctx.globalAlpha = DECAY
        ctx.translate(CX, CY)
        ctx.rotate(spin)
        ctx.scale(pull, pull)
        ctx.translate(-CX, -CY)
        ctx.drawImage(scratch, 0, 0)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = 1
      }

      // ── 2. Advect the motes (pass 1: physics only, no canvas touched) ──
      ctx.globalCompositeOperation = 'lighter'
      const armPhase = elapsed * 1.7
      for (let i = 0; i < MOTES; i++) {
        const layer = LAYERS[ml[i]]
        const a0 = ma[i]
        let r = mr[i]
        const rn = r / R_MAX
        // Angular velocity climbs as radius falls — this differential shear is
        // the difference between a vortex and a spinning plate. Layer speed on
        // top of it is the parallax.
        const w = SPIN * warp * ms[i] * layer.speed
          * (0.30 + 1 / (Math.pow(rn, SWIRL_Q) * 2.2 + 0.20))
        let a = a0
          + (out ? w : -w) * dtn
          + TURB * warp * Math.sin(r * 0.011 + elapsed * 2.7 + mk[i]) * dtn
        // Radial motion is multiplicative, so the path is a true log spiral
        // that tightens forever instead of overshooting the center.
        const rate = INFLOW * warp * ms[i] * layer.speed * (0.6 + 0.7 * (1 - rn)) * dtn
        r *= out ? (1 - rate) : (1 + rate)

        if (out ? r < 14 : r > R_MAX) {
          r = out ? R_MAX : 14
          a = armAngle(r, armPhase)
          const nx = CX + Math.cos(a) * r
          const ny = CY + Math.sin(a) * r
          mr[i] = r; ma[i] = a; mx[i] = nx; my[i] = ny
          mGroup[i] = -1 // no segment across the respawn jump
          continue
        }

        const x = CX + Math.cos(a) * r
        const y = CY + Math.sin(a) * r
        const band = Math.min(BANDS.length - 1, ((1 - rn) * BANDS.length) | 0)
        mGroup[i] = ml[i] * BANDS.length + band
        // Fast inner motes swing far enough in one frame that a straight chord
        // visibly cuts the corner. One mid-point turns the trail into an arc
        // that follows the flow — the smear reads as motion blur along the
        // rotation, which is exactly where it belongs.
        const da = a - a0
        if (da > 0.09 || da < -0.09) {
          mHasMid[i] = 1
          const am = a0 + da * 0.5
          const rm = (mr[i] + r) * 0.5
          mMidX[i] = CX + Math.cos(am) * rm
          mMidY[i] = CY + Math.sin(am) * rm
        } else {
          mHasMid[i] = 0
        }
        mnx[i] = x
        mny[i] = y
        mr[i] = r; ma[i] = a
      }
      // Brightness collapses into the drain as it swallows, so the last frames
      // resolve to flat black rather than snapping there. Colour grades from
      // cold blue toward warm white as the pull deepens and at the snap, so
      // the vortex heats up under load.
      const glow = 1 - sw * 0.92
      // Capped at 0.50: the grade should read as the vortex heating up under
      // load, not as a sepia wash over the ring world's cool night sky.
      const warmth = Math.min(0.50, Math.pow(t, 2.2) * 0.5 + pulse * 0.5)
      // Pass 2: stroke each of the 12 layer x band groups using the context's
      // own resettable path (beginPath), filtering the flat arrays pass 1
      // wrote — zero Path2D allocations. mx/my (the trail tail) only update
      // to this frame's new position here, after they've been read as the
      // segment start.
      for (let li = 0; li < LAYERS.length; li++) {
        const layer = LAYERS[li]
        for (let bi = 0; bi < BANDS.length; bi++) {
          const band = BANDS[bi]
          const group = li * BANDS.length + bi
          const rr = Math.round(band.c[0] + (WARM[0] - band.c[0]) * warmth)
          const gg = Math.round(band.c[1] + (WARM[1] - band.c[1]) * warmth)
          const bb = Math.round(band.c[2] + (WARM[2] - band.c[2]) * warmth)
          const al = band.a * layer.alpha * glow * (1 + pulse * 0.5)
          ctx.strokeStyle = `rgba(${rr},${gg},${bb},${Math.min(1, al).toFixed(3)})`
          ctx.lineWidth = band.w * layer.width
          ctx.beginPath()
          for (let i = 0; i < MOTES; i++) {
            if (mGroup[i] !== group) continue
            ctx.moveTo(mx[i], my[i])
            if (mHasMid[i]) ctx.lineTo(mMidX[i], mMidY[i])
            ctx.lineTo(mnx[i], mny[i])
          }
          ctx.stroke()
        }
      }
      for (let i = 0; i < MOTES; i++) {
        if (mGroup[i] === -1) continue
        mx[i] = mnx[i]; my[i] = mny[i]
      }

      // ── 3. Blobs on the same flow field, for fluid mass ──
      for (let i = 0; i < BLOBS; i++) {
        let r = br[i]
        const rn = r / R_MAX
        const w = SPIN * warp * bs[i] * (0.30 + 1 / (Math.pow(rn, SWIRL_Q) * 2.2 + 0.20))
        let a = ba[i] + (out ? w : -w) * dtn
        const rate = INFLOW * warp * bs[i] * (0.6 + 0.7 * (1 - rn)) * dtn
        r *= out ? (1 - rate) : (1 + rate)
        if (out ? r < 60 : r > R_MAX) { r = out ? R_MAX : 60; a = Math.random() * TAU }
        br[i] = r; ba[i] = a
        const x = CX + Math.cos(a) * r
        const y = CY + Math.sin(a) * r
        const rad = bz[i] * (0.55 + 0.75 * (1 - rn))
        const al = 0.085 * warp * glow
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
        g.addColorStop(0, `rgba(96,132,236,${al.toFixed(4)})`)
        g.addColorStop(1, 'rgba(96,132,236,0)')
        ctx.fillStyle = g
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
      }

      // ── 4. The snap — warm bloom out of the core at peak pull ──
      if (pulse > 0.002) {
        const fr = 260 + 760 * pulse
        const gf = ctx.createRadialGradient(CX, CY, 0, CX, CY, fr)
        gf.addColorStop(0, `rgba(255,232,198,${(0.85 * pulse).toFixed(4)})`)
        gf.addColorStop(0.35, `rgba(255,186,138,${(0.34 * pulse).toFixed(4)})`)
        gf.addColorStop(1, 'rgba(255,160,110,0)')
        ctx.fillStyle = gf
        const fx = Math.max(0, CX - fr)
        const fy = Math.max(0, CY - fr)
        ctx.fillRect(fx, fy, Math.min(W - fx, fr * 2), Math.min(H - fy, fr * 2))
      }

      // ── 5. The drain core ──
      ctx.globalCompositeOperation = 'source-over'
      const coreR = 40 + 1560 * sw * sw
      const edge = coreR + 340
      const gc = ctx.createRadialGradient(CX, CY, 0, CX, CY, edge)
      gc.addColorStop(0, BG)
      gc.addColorStop(Math.min(0.985, coreR / edge), BG)
      gc.addColorStop(1, 'rgba(1,1,10,0)')
      ctx.fillStyle = gc
      // Clamped to the gradient's own extent — no point filling 1920x1080 while
      // the hole is 380px across.
      const x0 = Math.max(0, CX - edge)
      const y0 = Math.max(0, CY - edge)
      ctx.fillRect(x0, y0, Math.min(W - x0, edge * 2), Math.min(H - y0, edge * 2))

      // ── 6. Snapshot for the next frame's feedback pass ──
      sctx.globalCompositeOperation = 'copy'
      sctx.drawImage(canvas, 0, 0)

      canvas.style.opacity = String(veil)

      if (p >= 1) { finish(); return }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    // rAF stops entirely in a backgrounded tab, which would strand the break
    // sequence waiting on an onDone that never comes. finish() is idempotent,
    // so this only ever fires when the loop genuinely didn't.
    const watchdog = setTimeout(finish, DURATION_MS + 400)

    return () => { cancelAnimationFrame(raf); clearTimeout(watchdog) }
  }, [dir])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 z-[80] pointer-events-none"
      style={{ width: '100%', height: '100%', opacity: 0, background: GROUND }}
    />
  )
}
