import { useState, useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import BaynesWatermark from '../BaynesWatermark.jsx'
import { fitToBox, TITLE_CARD_BOX } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'

// Fixed RWB palette — deliberately NOT theme.colors, anywhere in this
// component. "State of the Union" is patriotic by identity; it must read
// the same red-white-blue on every one of the 21 themes, the same way a
// shiny question's gold doesn't shift with the ambient theme either.
const RWB_RED       = '#b22234'
const RWB_WHITE     = '#e8e0d8'
const RWB_BLUE      = '#2a50c0'
const RWB_BLUE_DEEP = '#0d1536'

// ─── Billowing gradient background ───────────────────────────────────────────
// Per-pixel ImageData at quarter resolution (320×180) — CSS scaling blurs it
// smooth. Each pixel's color is determined by its diagonal position
// (x/W + ey/H)/2 where ey is y shifted by the wave. This gives all three
// bands (red / white / blue) simultaneously at the correct diagonal angle,
// with the wave making the whole field billow from the anchored left edge.
function WavingGradient({ reduce }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const W = 320, H = 180
    canvas.width = W
    canvas.height = H

    const maxAmp = reduce ? 3 : Math.round(H * 0.18)
    const k  = (2 * Math.PI) / (W * 0.55)
    const k2 = k * 1.65  // secondary harmonic — higher freq, different phase speed

    // Cyclic LUT: red → white → blue → white → red (seamless loop).
    // Going back through white avoids a purple seam at the loop boundary.
    // Vivid rose + periwinkle intermediates keep transitions saturated.
    // Smoothstep within each segment makes colors linger near their vivid peaks.
    const N = 512
    const lut = new Uint8Array(N * 3)
    const stops = [
      [0.000, 178,  34,  52],
      [0.125, 224,  68,  86],
      [0.250, 242, 234, 228],
      [0.375, 100, 120, 210],
      [0.500,  52,  78, 195],
      [0.625, 100, 120, 210],
      [0.750, 242, 234, 228],
      [0.875, 224,  68,  86],
      [1.000, 178,  34,  52],
    ]
    for (let i = 0; i < N; i++) {
      const d = i / (N - 1)
      let s = 0
      while (s < stops.length - 2 && d > stops[s + 1][0]) s++
      let p = (d - stops[s][0]) / (stops[s + 1][0] - stops[s][0])
      p = p * p * (3 - 2 * p)
      lut[i * 3]     = Math.round(stops[s][1] + (stops[s + 1][1] - stops[s][1]) * p)
      lut[i * 3 + 1] = Math.round(stops[s][2] + (stops[s + 1][2] - stops[s][2]) * p)
      lut[i * 3 + 2] = Math.round(stops[s][3] + (stops[s + 1][3] - stops[s][3]) * p)
    }

    const imgData = ctx.createImageData(W, H)
    const data = imgData.data

    let t = 0        // wave phase
    let scrollT = 0  // color scroll — independent of wave, loops via modulo
    let rafId

    function draw() {
      for (let x = 0; x < W; x++) {
        const env = Math.pow(x / W, 0.7)
        const wave = (Math.sin(k * x - t) + 0.22 * Math.sin(k2 * x - t * 1.38)) / 1.22
        const waveShift = wave * maxAmp * env
        for (let y = 0; y < H; y++) {
          const ey   = y - waveShift
          const diag = ((x / W * 1.39 + ey / H * 0.62 - scrollT) % 1.0 + 1.0) % 1.0
          const li   = Math.round(diag * (N - 1)) * 3
          const px   = (y * W + x) * 4
          data[px]     = lut[li]
          data[px + 1] = lut[li + 1]
          data[px + 2] = lut[li + 2]
          data[px + 3] = 255
        }
      }
      ctx.putImageData(imgData, 0, 0)
      t       += reduce ? 0.007  : 0.028   // wave: ~3.8s period
      scrollT += reduce ? 0.0003 : 0.0014  // scroll: one full RWB cycle ≈ 12s
      rafId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(rafId)
  }, [reduce])

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
}

// ─── Ambient star field — reads the background more explicitly as "USA" ─────
// Purely additive: sits above the billow, below the title (z-index 1, same
// tier as the vignette but painted after it so it's on top of that too).
// Tunable dials below. "Count" isn't its own constant — it's
// STAR_POSITIONS.length, so dialing the count means adding/removing an
// edge-safe {x, y, sizeRatio} entry rather than two numbers going stale
// against each other.
const STAR_SIZE_MIN      = 10   // px, smallest star
const STAR_SIZE_MAX      = 22   // px, largest star
const STAR_OPACITY_MIN   = 0.35 // twinkle floor
const STAR_OPACITY_MAX   = 0.85 // twinkle ceiling
const STAR_DRIFT_PX      = 5    // max drift distance, any direction
const STAR_TWINKLE_MIN_S = 2.6  // per-star twinkle period range — staggered
const STAR_TWINKLE_MAX_S = 4.2  // below so nothing syncs up into a grid

// Handpicked so every star sits in an edge/corner band (x<18% or x>82%, OR
// y<24% or y>76%) — the title's center safe-area stays completely clear.
// sizeRatio (0–1) picks where each star falls between STAR_SIZE_MIN/MAX.
const STAR_POSITIONS = [
  { x: 6,  y: 8,  sizeRatio: 0.35 },
  { x: 13, y: 17, sizeRatio: 0.05 },
  { x: 4,  y: 22, sizeRatio: 0.70 },
  { x: 94, y: 7,  sizeRatio: 0.50 },
  { x: 87, y: 15, sizeRatio: 0.10 },
  { x: 96, y: 23, sizeRatio: 0.90 },
  { x: 5,  y: 91, sizeRatio: 0.45 },
  { x: 14, y: 84, sizeRatio: 0.20 },
  { x: 8,  y: 96, sizeRatio: 0.80 },
  { x: 95, y: 89, sizeRatio: 0.30 },
  { x: 88, y: 95, sizeRatio: 0.65 },
  { x: 92, y: 80, sizeRatio: 0.05 },
  { x: 9,  y: 46, sizeRatio: 1.00 },
  { x: 91, y: 52, sizeRatio: 0.40 },
]

// Deterministic per-star stagger (no Math.random, so the scatter is stable
// and reviewable across renders) — spreads twinkle duration/delay evenly
// across the tunable range, and gives each star its own drift direction via
// golden-angle spacing (137.5°), which scatters directions evenly without
// ever repeating a visible pattern.
function starTiming(index, count) {
  const frac = index / count
  const duration = STAR_TWINKLE_MIN_S + frac * (STAR_TWINKLE_MAX_S - STAR_TWINKLE_MIN_S)
  const delay = frac * STAR_TWINKLE_MAX_S
  const angleRad = ((index * 137.5) % 360) * Math.PI / 180
  return {
    duration,
    delay,
    dx: +(STAR_DRIFT_PX * Math.cos(angleRad)).toFixed(1),
    dy: +(STAR_DRIFT_PX * Math.sin(angleRad)).toFixed(1),
  }
}

// One 5-point star polygon, generated once at module load — cleaner and far
// less error-prone than hand-typing ten decimal coordinate pairs.
const STAR_POLYGON_POINTS = (() => {
  const cx = 50, cy = 50, outerR = 48, innerR = 48 * 0.382
  const pts = []
  for (let i = 0; i < 5; i++) {
    const outerA = (-90 + i * 72) * Math.PI / 180
    const innerA = (-90 + i * 72 + 36) * Math.PI / 180
    pts.push(`${(cx + outerR * Math.cos(outerA)).toFixed(2)},${(cy + outerR * Math.sin(outerA)).toFixed(2)}`)
    pts.push(`${(cx + innerR * Math.cos(innerA)).toFixed(2)},${(cy + innerR * Math.sin(innerA)).toFixed(2)}`)
  }
  return pts.join(' ')
})()

// GPU rule: only transform + opacity are ever animated. Reduced motion gets
// two belt-and-suspenders guards — a plain CSS media query (for real OS
// settings) and a class driven by this slide's own useReducedMotion() value
// (reused, not reimplemented), so the stars go static under either signal.
const SOTU_STAR_STYLE = `
@keyframes sotu-star-twinkle {
  0%, 100% { opacity: var(--sotu-op-lo); transform: translate(0, 0) scale(1); }
  50%      { opacity: var(--sotu-op-hi); transform: translate(var(--sotu-dx), var(--sotu-dy)) scale(1.15); }
}
.sotu-star { animation: sotu-star-twinkle var(--sotu-dur) ease-in-out var(--sotu-delay) infinite; }
@media (prefers-reduced-motion: reduce) {
  .sotu-star { animation: none !important; opacity: var(--sotu-op-hi) !important; }
}
.sotu-stars-reduced .sotu-star { animation: none !important; opacity: var(--sotu-op-hi) !important; }
`

function StarField({ reduce }) {
  const count = STAR_POSITIONS.length
  return (
    <div
      aria-hidden
      className={reduce ? 'sotu-stars-reduced' : undefined}
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
    >
      <style>{SOTU_STAR_STYLE}</style>
      {STAR_POSITIONS.map((p, i) => {
        const { duration, delay, dx, dy } = starTiming(i, count)
        const size = STAR_SIZE_MIN + p.sizeRatio * (STAR_SIZE_MAX - STAR_SIZE_MIN)
        return (
          <svg
            key={i}
            className="sotu-star"
            viewBox="0 0 100 100"
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: size,
              height: size,
              '--sotu-op-lo': STAR_OPACITY_MIN,
              '--sotu-op-hi': STAR_OPACITY_MAX,
              '--sotu-dx': `${dx}px`,
              '--sotu-dy': `${dy}px`,
              '--sotu-dur': `${duration}s`,
              '--sotu-delay': `${delay}s`,
            }}
          >
            <polygon points={STAR_POLYGON_POINTS} fill="#ffffff" />
          </svg>
        )
      })}
    </div>
  )
}

export default function StateOfUnionSlide({ slide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const message = slide.data?.message ?? "Welcome to Trivia Night at Baynes Apple Valley. Let's get into it."
  const rt = slide.data?._regionTransforms ?? {}
  const xf = id => { const t = rt[id]; return t ? { transform: `translate(${t.dx??0}px,${t.dy??0}px) rotate(${t.rotate??0}deg)`, transformOrigin: 'center', display: 'inline-block' } : {} }

  // fitToBox measures via canvas — a first paint before the display font
  // loads measures fallback-font metrics. This flips once web fonts are
  // ready purely to force the re-render that re-runs the inline fitToBox
  // call below with real glyph metrics; the value itself is never read.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)) }, [])

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-24 overflow-hidden"
      style={{ background: RWB_BLUE_DEEP }}>

      <WavingGradient reduce={reduce} />

      {/* Dark center vignette — keeps the tilted text readable */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 72% 62% at 50% 55%, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.18) 55%, rgba(0,0,0,0.03) 100%)',
      }} />

      <StarField reduce={reduce} />

      <div className="relative flex flex-col items-center" style={{ zIndex: 2 }}>
        {/* Optional Ben photo */}
        {slide.data?.photoUrl && (
          <motion.img
            src={slide.data.photoUrl}
            alt="Host"
            className="mb-10 rounded-2xl object-cover"
            style={{ height: '28vh', width: 'auto', maxWidth: '100%', opacity: 0.85 }}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 0.85, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          />
        )}

        {/* Message — RWB gradient text, springs in tilted like a campaign sign */}
        <span data-slide-region="message" data-slide-field="message" style={xf('message')}>
          <motion.p
            initial={{ opacity: 0, scale: reduce ? 1 : 0.85, rotate: reduce ? -6 : -14 }}
            animate={{ opacity: 1, scale: 1, rotate: -6 }}
            transition={reduce ? { duration: 0.3, ease: EASE_OUT } : { type: 'spring', duration: 0.5, bounce: 0.25 }}
            style={{
              fontFamily: `'${theme.fonts.display}', sans-serif`,
              fontWeight: 700,
              fontSize: fitToBox(message, { ...TITLE_CARD_BOX, family: theme.fonts.display }),
              lineHeight: 1.15,
              textAlign: 'center',
              textWrap: 'balance',
              maxWidth: '22ch',
              filter: 'drop-shadow(0 2px 1px rgba(0,0,20,0.75)) drop-shadow(0 0 28px rgba(0,0,20,0.6))',
            }}
          >
            <span style={{
              background: `linear-gradient(135deg, ${RWB_RED} 0%, ${RWB_WHITE} 48%, ${RWB_BLUE} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              {message}
            </span>
          </motion.p>
        </span>
      </div>

      <BaynesWatermark />
    </div>
  )
}
