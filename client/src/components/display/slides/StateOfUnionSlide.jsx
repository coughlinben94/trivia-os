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
          const diag = (((x / W + ey / H) / 2 + scrollT) % 1.0 + 1.0) % 1.0
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

      <div className="absolute inset-0" style={{ zIndex: 2 }}>
        <SlideElements elements={slide.data?.elements} theme={theme} />
      </div>
    </div>
  )
}
