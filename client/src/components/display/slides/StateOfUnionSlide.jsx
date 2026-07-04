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
const RWB_WHITE     = '#f0ece0'
const RWB_BLUE      = '#1a2a6c'
const RWB_BLUE_DEEP = '#0d1536'

// ─── Waving flag background ───────────────────────────────────────────────────
// Canvas-based RAF animation. Pole is pinned at the left edge (zero amplitude);
// amplitude grows toward the right free end via a power curve so the billowing
// feels anchored, not oscillating uniformly. Renders all 13 stripes, the blue
// canton, and all 50 stars (9 rows alternating 6 and 5).
function WavingFlag({ reduce }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    canvas.width  = canvas.offsetWidth  || 1280
    canvas.height = canvas.offsetHeight || 720

    const W         = canvas.width
    const H         = canvas.height
    const STRIPES   = 13
    const stripeH   = H / STRIPES
    const cantonW   = W * 0.38
    const cantonH   = stripeH * 7
    const maxAmp    = reduce ? 5 : H * 0.034
    const k         = (2 * Math.PI) / (W * 0.45) // ~2.2 full waves across the flag
    const sliceW    = Math.max(1, Math.floor(W / 300))

    // 50 stars: 9 rows alternating 6 and 5
    const starRows  = [6, 5, 6, 5, 6, 5, 6, 5, 6]
    const starR     = Math.max(2, H * 0.009)
    const sPadX     = cantonW * 0.1
    const sPadY     = cantonH * 0.1
    const sSpcX     = (cantonW - 2 * sPadX) / 5.5
    const sSpcY     = (cantonH - 2 * sPadY) / 8

    let t     = 0
    const spd = reduce ? 0.25 : 1.0
    let rafId

    function draw() {
      ctx.fillStyle = RWB_BLUE_DEEP
      ctx.fillRect(0, 0, W, H)

      for (let x = 0; x <= W; x += sliceW) {
        // Amplitude grows from 0 at the pole (left) to maxAmp at the free end (right)
        const amp = maxAmp * Math.pow(x / W, 0.7)
        const dy  = Math.sin(k * x - t) * amp
        const sw  = sliceW + 1 // +1 closes gaps between slices

        for (let s = 0; s < STRIPES; s++) {
          ctx.fillStyle = s % 2 === 0 ? RWB_RED : RWB_WHITE
          ctx.fillRect(x, Math.round(s * stripeH + dy), sw, Math.ceil(stripeH) + 1)
        }

        if (x < cantonW) {
          ctx.fillStyle = RWB_BLUE
          ctx.fillRect(x, Math.round(dy), sw, Math.ceil(cantonH) + 1)
        }
      }

      // Stars — each gets its own wave offset at its x-position
      ctx.fillStyle = RWB_WHITE
      starRows.forEach((count, row) => {
        const offsetX = count === 6 ? 0 : sSpcX / 2
        const yBase   = sPadY + row * sSpcY
        for (let col = 0; col < count; col++) {
          const sx  = sPadX + offsetX + col * sSpcX
          const amp = maxAmp * Math.pow(sx / W, 0.7)
          const dy  = Math.sin(k * sx - t) * amp
          ctx.beginPath()
          ctx.arc(sx, yBase + dy, starR, 0, Math.PI * 2)
          ctx.fill()
        }
      })

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

      <WavingFlag reduce={reduce} />

      {/* Dark center vignette — keeps the tilted text readable against the flag */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 72% 62% at 50% 55%, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0.05) 100%)',
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
