import { useState, useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import BaynesWatermark from '../BaynesWatermark.jsx'
import SlideElements from '../SlideElements.jsx'
import { fitToBox, TITLE_CARD_BOX } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'

// Fixed RWB palette — deliberately NOT theme.colors, anywhere in this
// component. "State of the Union" is patriotic by identity; it must read
// the same red-white-blue on every one of the 21 themes, the same way a
// shiny question's gold doesn't shift with the ambient theme either.
const RWB_RED       = '#b22234'
const RWB_WHITE     = '#e8e0d8'
const RWB_BLUE      = '#1a2a6c'
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

    const maxAmp = reduce ? 3 : Math.round(H * 0.15)
    const k = (2 * Math.PI) / (W * 0.55)

    // Precompute 512-entry RGB LUT: red → white → blue along the diagonal
    const N = 512
    const lut = new Uint8Array(N * 3)
    const stops = [
      [0.00, 178,  34,  52],
      [0.20, 184,  60,  72],
      [0.35, 208, 148, 148],
      [0.50, 224, 210, 204],
      [0.65, 148, 160, 190],
      [0.80,  50,  72, 128],
      [1.00,  26,  42, 108],
    ]
    for (let i = 0; i < N; i++) {
      const d = i / (N - 1)
      let s = 0
      while (s < stops.length - 2 && d > stops[s + 1][0]) s++
      const p = (d - stops[s][0]) / (stops[s + 1][0] - stops[s][0])
      lut[i * 3]     = Math.round(stops[s][1] + (stops[s + 1][1] - stops[s][1]) * p)
      lut[i * 3 + 1] = Math.round(stops[s][2] + (stops[s + 1][2] - stops[s][2]) * p)
      lut[i * 3 + 2] = Math.round(stops[s][3] + (stops[s + 1][3] - stops[s][3]) * p)
    }

    const imgData = ctx.createImageData(W, H)
    const data = imgData.data

    let t = 0
    const spd = reduce ? 0.25 : 1.0
    let rafId

    function draw() {
      for (let x = 0; x < W; x++) {
        const waveShift = Math.sin(k * x - t) * maxAmp * Math.pow(x / W, 0.7)
        for (let y = 0; y < H; y++) {
          const ey   = y - waveShift
          const diag = Math.max(0, Math.min(1, (x / W + ey / H) / 2))
          const li   = Math.round(diag * (N - 1)) * 3
          const px   = (y * W + x) * 4
          data[px]     = lut[li]
          data[px + 1] = lut[li + 1]
          data[px + 2] = lut[li + 2]
          data[px + 3] = 255
        }
      }
      ctx.putImageData(imgData, 0, 0)
      t += 0.05 * spd
      rafId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(rafId)
  }, [reduce])

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
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
        background: 'radial-gradient(ellipse 72% 62% at 50% 55%, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.05) 100%)',
      }} />

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

        {/* Typewriter text — RWB gradient fill, same spring + tilt as ShinyIntroScreen. */}
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
              filter: 'drop-shadow(0 3px 0 rgba(0,0,0,0.5)) drop-shadow(0 0 32px rgba(0,0,0,0.7))',
            }}
          >
            <span style={{
              background: `linear-gradient(135deg, ${RWB_RED} 0%, ${RWB_WHITE} 50%, #3a6fcf 100%)`,
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

      <div className="absolute inset-0" style={{ zIndex: 2 }}>
        <SlideElements elements={slide.data?.elements} theme={theme} />
      </div>
    </div>
  )
}
