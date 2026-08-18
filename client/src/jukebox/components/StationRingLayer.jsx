import { useEffect, useMemo, useRef } from 'react'
import { blendDurationMs } from '../lib/gradientTuning.js'
import { lerpOklabPolar, rgbToOklab, oklabToRgb } from './AlbumGradientMesh.jsx'

// StationRingLayer — "Station Thirteen" ambient layer for the grading-break
// jukebox (ring-world fusion, 2026-08-16). Transparent ADDITIVE canvas that
// sits over AlbumGradientMesh's album wash (which stays exactly as-is — Ben:
// "album wash on s13 alone") and under LiveScreen's real record scene.
// Draws, in order, the pieces Ben kept from the Station Thirteen mockup
// (scratchpad/ring-world-jukebox.html, drawDemo3):
//   1. star field (ported makeStars/drawStars, tinted by colors[1])
//   2. concentric groove rings ("comet AND RINGS exactly like the artifact")
//      — the mockup's 21-ring, 6px-pitch, hue-tinted treatment, rendered as
//      an outer halo band radiating out from the REAL record's rim.
//      LiveScreen's own grooves (a faint dark repeating-radial-gradient ON
//      the art) are visually unrelated, so the two don't double-draw.
//   3. the inward-traveling needle comet (trail + glowing lead dot,
//      colors[0]), radius driven by REAL playback progress — it rides the
//      groove band inward as the song plays out
//   4. pulsar rim-spikes on a fixed decorative tempo (96bpm — no real BPM
//      data exists, per the build note; do not try to derive one)
// Deliberately absent, per Ben's build notes: the outer gold progress arc
// ("loading ring"), the vinyl disc itself (LiveScreen's real record owns
// that, exactly where LiveScreen already centers it), any background fill
// (the album wash owns the backdrop), the set-list island, and the station
// label plate.
//
// Mounted only when LiveScreen's ringMode prop is true (grading-break
// overlay); the standalone /music app never sees this layer.

const VALID_HEX = /^#[0-9a-f]{6}$/i
const LOADING_SENTINEL = '#080808'
// Same purple/pink family the rest of the jukebox falls back to pre-palette.
const FALLBACK_COLORS = ['#ff2fb0', '#7a5cf0']
// Mockup's fixed star color — real palette tints toward it (see starTint).
const STAR_BASE = [223, 226, 245]
// Mockup's own tuned constants (drawDemo3), kept verbatim where they port 1:1.
const BEAT_INTERVAL = 0.625 // 96bpm, decorative
const TRAIL_LEN = 12
const STAR_COUNT = 120
const STAR_SEED = 41
const GROOVE_COUNT = 21
const GROOVE_SEED = 99
const GROOVE_PITCH = 6      // px between rings at 1x scale, same as mockup
const GROOVE_INSET = 14     // px gap between the record rim and the first ring

// Event Horizon song-to-song transition (2026-08-17) — ported from the
// approved mockup (claude.ai artifact a831a530-6ac5-47ed-8486-66a2b3a53352,
// panel 1 "Event Horizon"): the needle comet's inward ride triggers the
// change — it strikes the spindle, the groove band draws in behind it, the
// record spirals into its own center and collapses in a flash, then the
// next record blooms back out of the same point. dur/phase fractions are
// the mockup's own `dur:2700` and its render()'s seg() boundaries — kept
// here as the single source of truth; LiveScreen.jsx imports both so its
// record-scale keyframes and its art/audio swap timing stay locked to
// exactly these canvas phases instead of drifting into their own numbers.
export const EH_DUR_MS = 2700
export const EH_PHASES = Object.freeze({
  lockEnd: 0.16,      // comet finishes its inward approach, strikes the spindle
  fallEnd: 0.46,      // old record fully collapsed into its own center
  flashStart: 0.46,
  flashEnd: 0.56,     // collapse flash / shockwave resolves
  emergeStart: 0.52,  // new record starts blooming open (overlaps flash's tail)
  emergeEnd: 0.86,    // new record at full size, band settled
})
const easeIn  = p => p * p * p
const easeOut = p => 1 - Math.pow(1 - p, 3)
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1)

function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const hexRgb = h => {
  const p = parseInt(h.slice(1), 16)
  return [p >> 16 & 255, p >> 8 & 255, p & 255]
}
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)))
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

function parseColors(colors) {
  const safe = i =>
    typeof colors?.[i] === 'string' &&
    VALID_HEX.test(colors[i]) &&
    colors[i].toLowerCase() !== LOADING_SENTINEL
      ? colors[i]
      : FALLBACK_COLORS[i]
  return [hexRgb(safe(0)), hexRgb(safe(1))]
}

// Static/authored record radius by breakpoint (Tailwind w-[352px] /
// sm:w-[391px]) — measure()'s existing no-DOM fallback below, and ALSO the
// fixed scale reference the Event Horizon transition computes its live
// recordR from (baseRecordR * current scale). bandInner/bandOuter must track
// the record's live collapse/bloom every frame during that sequence, not the
// once-a-second DOM read measure() normally does — a collapse that takes
// well under a second would otherwise be read through a stale rect.
const baseRecordR = w => (w >= 640 ? 391 : 352) / 2

// Comet dot + fading trail, shared by the idle ride-the-groove-band loop and
// Event Horizon's lock/settle beats below — same draw, parameterized by
// radius and an overall alpha (Event Horizon fades the comet in/out; idle
// playback is always alpha 1).
function drawCometAt(ctx, t, cx, cy, nr, c0, k, alpha) {
  const th = t * 1.15
  for (let i = TRAIL_LEN; i >= 1; i--) {
    const ta = th - i * 0.055
    ctx.globalAlpha = (1 - i / (TRAIL_LEN + 1)) * 0.5 * alpha
    ctx.fillStyle = rgba(c0, 1)
    ctx.beginPath()
    ctx.arc(cx + Math.cos(ta) * nr, cy + Math.sin(ta) * nr, 2.6 * k, 0, 7)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.save()
  ctx.shadowColor = rgba(c0, 0.9)
  ctx.shadowBlur = 16 * k
  ctx.globalAlpha = alpha
  ctx.fillStyle = rgba(c0, 1)
  ctx.beginPath()
  ctx.arc(cx + Math.cos(th) * nr, cy + Math.sin(th) * nr, 4.5 * k, 0, 7)
  ctx.fill()
  ctx.restore()
  ctx.globalAlpha = 1
}

// Event Horizon's own comet/groove/flash/pulsar drawing for the transition
// window — kept out of the idle draw() path below so neither can leak into
// the other (idle playback never calls this; this never runs outside an
// active transition). Reuses the same GROOVE_COUNT/grooveAlphas idle
// drawing uses, so the ring band reads as the same object, just live.
function drawEventHorizon(ctx, t, p, geom, rgbPair, grooveAlphas) {
  const { cx, cy, recordR, bandInner, bandOuter, k, R0 } = geom
  const [c0, c1] = rgbPair

  const lock   = seg(p, 0, EH_PHASES.lockEnd)
  const fall   = seg(p, EH_PHASES.lockEnd, EH_PHASES.fallEnd)
  const flash  = seg(p, EH_PHASES.flashStart, EH_PHASES.flashEnd)
  const settle = seg(p, EH_PHASES.emergeEnd, 1)

  // Grooves — bandInner/bandOuter already track the record's live collapse
  // (recordR, computed by the caller from the live scale prop), so no
  // separate "pull" easing is needed the way the mockup's own free-floating
  // canvas record needed one — the ring band shrinks in lockstep with the
  // real disc for free. Flash briefly brightens the whole band.
  ctx.lineWidth = 1.2 * k
  const grooveAlphaMul = 1 + flash * 1.4
  for (let i = 0; i < GROOVE_COUNT; i++) {
    ctx.strokeStyle = rgba(c1, grooveAlphas[i] * grooveAlphaMul)
    ctx.beginPath()
    ctx.arc(cx, cy, bandInner + i * GROOVE_PITCH * k, 0, 7)
    ctx.stroke()
  }

  // Comet — rides in to the record's own visible rim during lock (not the
  // true center, R0 * 0.16, which sat well under the opaque record and was
  // never actually seen — Ben's call, decision B over shipping the invisible
  // strike as-is). recordR holds steady through the whole lock phase
  // (recordScaleMV doesn't start shrinking until lockEnd), so this is a
  // fixed target for the entire ride, same shape as before, just aimed at
  // something that's actually on screen. Gone through the collapse (no comet
  // drawn p 0.22-0.86, matching the mockup), reappears riding back out to
  // the groove band during settle.
  if (p < 0.22) {
    drawCometAt(ctx, t, cx, cy, lerp(bandInner, recordR, easeIn(lock)), c0, k, 1)
  }
  if (settle > 0) {
    drawCometAt(ctx, t, cx, cy, lerp(R0 * 0.4, bandOuter, easeOut(settle)), c0, k, easeOut(settle))
  }

  // Collapse flash — expanding shockwave ring + a core glow, both additive.
  // Both anchor on R0 (the record's RESTING radius), not the live recordR:
  // the glow is meant to intensify into a bright POINT as the disc shrinks
  // away, not shrink away along with it.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  if (flash > 0 && flash < 1) {
    const fr = bandOuter * (0.15 + 1.35 * easeOut(flash))
    ctx.strokeStyle = rgba(mixRgb(c0, [255, 255, 255], 0.5), (1 - flash) * 0.85)
    ctx.lineWidth = (10 - 8 * flash) * k
    ctx.beginPath()
    ctx.arc(cx, cy, fr, 0, 7)
    ctx.stroke()
  }
  const glow = Math.max(easeIn(fall) * 0.7, flash > 0 ? (1 - flash) : 0)
  if (glow > 0.02 && p < 0.62) {
    const gr = R0 * (0.25 + glow * 0.9)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr)
    grad.addColorStop(0, rgba(mixRgb(c0, [255, 255, 255], 0.65), glow))
    grad.addColorStop(1, rgba(c0, 0))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, gr, 0, 7)
    ctx.fill()
  }
  ctx.restore()

  // Pulsar spikes — same rim-spike shape the idle loop draws, boosted for a
  // beat right through the flash.
  const bu = (t % BEAT_INTERVAL) / BEAT_INTERVAL
  const pulse = Math.exp(-4.5 * bu) * (1 + flash * (1 - flash) * 6)
  if (pulse > 0.03) {
    const rot = t * 0.35
    ctx.strokeStyle = rgba(c0, Math.min(0.9, 0.55 * pulse))
    ctx.lineWidth = 2 * k
    for (let s = 0; s < 8; s++) {
      const a = rot * 0.4 + s * Math.PI / 4
      const r1 = recordR + 6 * k
      const r2 = recordR + (10 + 30 * pulse) * k
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
      ctx.stroke()
    }
  }
}

export default function StationRingLayer({
  active = true, colors = [], progress = 0,
  // Event Horizon transition props (all optional — a plain idle mount, e.g.
  // the standalone jukebox never sets ringMode, never passes these):
  // `transitioning` gates the whole alternate draw path; `transitionStartMs`
  // is a performance.now() timestamp LiveScreen stamps once when the
  // sequence starts (this file derives p from wall-clock elapsed against it,
  // no per-frame prop traffic needed); `recordScaleMV` is the live Framer
  // Motion value driving the real record's CSS scale — read every frame
  // instead of polling the DOM for it (see baseRecordR's comment above).
  transitioning = false, transitionStartMs = null, recordScaleMV = null,
}) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const mountedRef = useRef(false)
  const activeRef = useRef(active)
  const progressRef = useRef(progress)
  const rgbRef = useRef(parseColors(colors))
  const sizeRef = useRef({ w: 0, h: 0 })
  const geomRef = useRef(null)      // { cx, cy, recordR } — measured from the real record box
  const lastMeasureRef = useRef(0)
  // Event Horizon transition state — refs, not direct closure reads, for the
  // same reason progressRef/rgbRef already are: draw()/tick() are redefined
  // every render but the rAF loop keeps calling whichever tick() closure was
  // captured when startLoop() last ran, so anything that changes over time
  // has to be read through a ref to stay current inside that stale closure.
  const transitioningRef = useRef(transitioning)
  const transitionStartRef = useRef(transitionStartMs)
  const recordScaleRef = useRef(recordScaleMV)

  // Seeded once — same star field for the whole session, never regenerated
  // per frame. Normalized coords (x in a 2.2x-wide wrap band, y in canvas
  // heights), scaled to real pixels at draw time.
  const stars = useMemo(() => {
    const r = mulberry(STAR_SEED)
    return Array.from({ length: STAR_COUNT }, () => ({
      x: r() * 2.2, y: r(), s: 0.5 + r() * 1.4,
      ph: r() * Math.PI * 2, sp: 0.5 + r() * 1.4,
    }))
  }, [])

  // Per-ring alpha, seeded once — mockup: 0.10 + rng() * 0.22.
  const grooveAlphas = useMemo(() => {
    const r = mulberry(GROOVE_SEED)
    return Array.from({ length: GROOVE_COUNT }, () => 0.10 + r() * 0.22)
  }, [])

  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  useEffect(() => { progressRef.current = clamp(progress, 0, 1) }, [progress])
  useEffect(() => {
    transitioningRef.current = transitioning
    transitionStartRef.current = transitionStartMs
    recordScaleRef.current = recordScaleMV
  }, [transitioning, transitionStartMs, recordScaleMV])

  // Ring color used to snap instantly on every colors-prop change while
  // AlbumGradientMesh's album wash crossfades the same track change over
  // blendDurationMs() (~7.5s) in OKLab — the ring would pop to the new hue
  // well before the backdrop caught up. Blend it the same way, over the same
  // duration, reusing the exact OKLab machinery AlbumGradientMesh already
  // proved out (see lerpOklabPolar's header comment for why per-pixel hue
  // stability doesn't matter here: our two endpoints are fixed for the life
  // of one blend, so the no-per-frame-drift branch applies directly).
  // First mount and reduced-motion both still snap: reduced motion has no
  // rAF loop to drive the blend (its own effect below redraws a single
  // static frame), and snapping on mount avoids a pointless fade in from the
  // fallback purple/pink before any real palette has ever been shown.
  const blendRef = useRef(null)
  const colorsMountedRef = useRef(false)
  useEffect(() => {
    const target = parseColors(colors)
    if (reducedMotion || !colorsMountedRef.current) {
      colorsMountedRef.current = true
      rgbRef.current = target
      blendRef.current = null
      return
    }
    blendRef.current = {
      fromOklab: rgbRef.current.map(rgbToOklab),
      toOklab: target.map(rgbToOklab),
      startMs: performance.now(),
      durMs: blendDurationMs(),
    }
  }, [colors, reducedMotion])

  // Locate the record scene so the ring band hugs the REAL disc.
  // ponytail: selector coupled to LiveScreen's record-box Tailwind classes
  // (w-[352px] / sm:w-[391px]); falls back to viewport-center + breakpoint
  // math if the markup ever changes. Pass a ref instead if this breaks twice.
  function measure() {
    const canvas = canvasRef.current
    if (!canvas) return
    const root = canvas.parentElement
    const box = root?.querySelector('[class*="w-[352px]"]')
    const cRect = canvas.getBoundingClientRect()
    if (box) {
      const r = box.getBoundingClientRect()
      geomRef.current = {
        cx: r.left + r.width / 2 - cRect.left,
        cy: r.top + r.height / 2 - cRect.top,
        recordR: r.width / 2,
      }
    } else {
      geomRef.current = {
        cx: sizeRef.current.w / 2,
        cy: sizeRef.current.h / 2,
        recordR: baseRecordR(sizeRef.current.w),
      }
    }
  }

  function draw(t) {
    const canvas = canvasRef.current
    if (!canvas) return
    const { w, h } = sizeRef.current
    if (!w || !h) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, w, h) // transparent layer — the album wash below owns the backdrop

    // Self-gated on reducedMotion too, not just relying on the caller never
    // setting transitioning while reduced motion is on (Critical Rule 3 —
    // canvas/JS animation needs its own explicit check, a CSS media query
    // can't reach in here).
    const eh = transitioningRef.current && !reducedMotion

    // Re-measure at most once a second — layout only shifts on resize or
    // when webfont load nudges the text block under the record. Skipped
    // entirely mid-transition: the record never translates during Event
    // Horizon (only scales around its own center), so the last idle
    // measurement is still good for cx/cy, and recordR is computed live
    // below instead of from this throttled read (see baseRecordR's comment).
    if (!geomRef.current) measure() // first frame ever needs SOME geometry
    else if (!eh && t - lastMeasureRef.current > 1) {
      measure()
      lastMeasureRef.current = t
    }
    const { cx, cy } = geomRef.current
    const R0 = baseRecordR(w)
    const recordR = eh && recordScaleRef.current
      ? R0 * clamp(recordScaleRef.current.get(), 0, 2)
      : geomRef.current.recordR

    if (blendRef.current) {
      const b = blendRef.current
      const p = Math.max(0, Math.min(1, (t * 1000 - b.startMs) / b.durMs))
      const eased = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p
      rgbRef.current = [
        oklabToRgb(lerpOklabPolar(b.fromOklab[0], b.toOklab[0], eased)),
        oklabToRgb(lerpOklabPolar(b.fromOklab[1], b.toOklab[1], eased)),
      ]
      if (p >= 1) blendRef.current = null
    }
    const [c0, c1] = rgbRef.current
    // Mockup math was tuned in a 960px-wide space — scale the dot/line
    // weights up with the real canvas so a TV doesn't get 2px specks.
    const k = Math.max(1, w / 960)

    // ── star field (drawStars port, tinted by colors[1]) ──
    const starTint = mixRgb(STAR_BASE, c1, 0.45)
    const band = w * 2.2
    const ox = -t * 4 * k // same slow drift as the mockup, scaled
    for (const s of stars) {
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(s.ph + t * s.sp))
      const x = ((s.x * w + ox) % band + band) % band - w * 0.6
      if (x < -10 || x > w + 10) continue
      ctx.globalAlpha = tw * 0.8
      ctx.fillStyle = rgba(starTint, 1)
      ctx.beginPath()
      ctx.arc(x, s.y * h, s.s * k, 0, 7)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // ── groove rings: the mockup's 21-ring hue-tinted treatment, as an
    //    outer halo band starting just past the real record's platter rim
    //    (platter is recordR + 9px in LiveScreen) ──
    const bandInner = recordR + GROOVE_INSET * k
    const bandOuter = bandInner + (GROOVE_COUNT - 1) * GROOVE_PITCH * k

    // Event Horizon owns grooves/comet/flash/pulsar entirely for the
    // duration of the transition window — idle drawing below never runs
    // while this is active. p comes from wall-clock elapsed against the
    // timestamp LiveScreen stamped once at sequence start, not a per-frame
    // prop (see the transitionStartMs prop comment above).
    if (eh && transitionStartRef.current != null) {
      const p = clamp((t * 1000 - transitionStartRef.current) / EH_DUR_MS, 0, 1)
      drawEventHorizon(ctx, t, p, { cx, cy, recordR, bandInner, bandOuter, k, R0 }, [c0, c1], grooveAlphas)
      return
    }

    ctx.lineWidth = 1.2 * k
    for (let i = 0; i < GROOVE_COUNT; i++) {
      ctx.strokeStyle = rgba(c1, grooveAlphas[i])
      ctx.beginPath()
      ctx.arc(cx, cy, bandInner + i * GROOVE_PITCH * k, 0, 7)
      ctx.stroke()
    }

    // ── needle comet riding the groove band inward (drawDemo3 ~774-793) ──
    const th = t * 1.15
    const nr = lerp(bandOuter, bandInner, progressRef.current)
    for (let i = TRAIL_LEN; i >= 1; i--) {
      const ta = th - i * 0.055
      ctx.globalAlpha = (1 - i / (TRAIL_LEN + 1)) * 0.5
      ctx.fillStyle = rgba(c0, 1)
      ctx.beginPath()
      ctx.arc(cx + Math.cos(ta) * nr, cy + Math.sin(ta) * nr, 2.6 * k, 0, 7)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.save()
    ctx.shadowColor = rgba(c0, 0.9)
    ctx.shadowBlur = 16 * k
    ctx.fillStyle = rgba(c0, 1)
    ctx.beginPath()
    ctx.arc(cx + Math.cos(th) * nr, cy + Math.sin(th) * nr, 4.5 * k, 0, 7)
    ctx.fill()
    ctx.restore()

    // ── pulsar rim-spikes, fixed ambient tempo (drawDemo3 ~795-810) —
    //    off the record's rim, shooting outward through the groove band ──
    const bu = (t % BEAT_INTERVAL) / BEAT_INTERVAL
    const pulse = Math.exp(-4.5 * bu)
    if (pulse > 0.03) {
      const rot = t * 0.35
      ctx.strokeStyle = rgba(c0, 0.55 * pulse)
      ctx.lineWidth = 2 * k
      for (let s = 0; s < 8; s++) {
        const a = rot * 0.4 + s * Math.PI / 4
        const r1 = recordR + 6 * k
        const r2 = recordR + (10 + 30 * pulse) * k
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
        ctx.stroke()
      }
    }
  }

  function startLoop() {
    rafRef.current = requestAnimationFrame(tick)
  }

  function tick() {
    draw(performance.now() / 1000)
    if (mountedRef.current && activeRef.current) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      rafRef.current = null
    }
  }

  // Same rAF-pause discipline as AlbumGradientMesh's active prop.
  useEffect(() => {
    activeRef.current = active
    if (reducedMotion) return
    if (active && !rafRef.current && mountedRef.current) startLoop()
  }, [active])

  // Reduced motion: one static settled frame, no rAF loop (same pattern the
  // mockup used — a representative frame, redrawn on resize/color change).
  useEffect(() => {
    if (!reducedMotion) return
    draw(5.1)
  }, [reducedMotion, active, colors, progress])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function resize() {
      const p = canvas.parentElement
      const w = Math.round((p ? p.clientWidth : 0) || window.innerWidth)
      const h = Math.round((p ? p.clientHeight : 0) || window.innerHeight)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { w, h }
      geomRef.current = null // force re-measure against the new layout
      draw(reducedMotion ? 5.1 : performance.now() / 1000)
    }
    resize()
    window.addEventListener('resize', resize)

    mountedRef.current = true
    if (activeRef.current && !rafRef.current && !reducedMotion) startLoop()

    return () => {
      mountedRef.current = false
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0, // same slot GradientBackground occupies; below the z-[1] cover/vignette
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  )
}
