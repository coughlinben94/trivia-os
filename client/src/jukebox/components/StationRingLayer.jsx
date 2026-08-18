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

export default function StationRingLayer({ active = true, colors = [], progress = 0 }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const mountedRef = useRef(false)
  const activeRef = useRef(active)
  const progressRef = useRef(progress)
  const rgbRef = useRef(parseColors(colors))
  const sizeRef = useRef({ w: 0, h: 0 })
  const geomRef = useRef(null)      // { cx, cy, recordR } — measured from the real record box
  const lastMeasureRef = useRef(0)

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
      const w = sizeRef.current.w
      geomRef.current = {
        cx: sizeRef.current.w / 2,
        cy: sizeRef.current.h / 2,
        recordR: (w >= 640 ? 391 : 352) / 2,
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

    // Re-measure at most once a second — layout only shifts on resize or
    // when webfont load nudges the text block under the record.
    if (!geomRef.current || t - lastMeasureRef.current > 1) {
      measure()
      lastMeasureRef.current = t
    }
    const { cx, cy, recordR } = geomRef.current

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
