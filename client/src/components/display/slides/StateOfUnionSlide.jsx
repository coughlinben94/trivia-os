import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import BaynesWatermark from '../BaynesWatermark.jsx'
import SlideElements from '../SlideElements.jsx'
import BreathingGradient from '../BreathingGradient.jsx'
import { fitToBox, TITLE_CARD_BOX } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'

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

  // Fixed RWB palette — deliberately NOT theme.colors, anywhere in this
  // component. "State of the Union" is patriotic by identity; it must read
  // the same red-white-blue on every one of the 21 themes, the same way a
  // shiny question's gold doesn't shift with the ambient theme either.
  // RWB_BLUE_DEEP is ~50% luminance of RWB_BLUE, for the wash's dark end.
  const RWB_RED = '#b22234'
  const RWB_WHITE = '#f5f5f0'
  const RWB_BLUE = '#1a2a6c'
  const RWB_BLUE_DEEP = '#0d1536'

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-24 overflow-hidden">
      {/* BreathingGradient wired to the fixed RWB palette — same WAAPI engine
          as every other theme collapse target, just hardcoded colors instead
          of theme.colors. bg/bgDeep = navy base, accent = red, highlight = white. */}
      <BreathingGradient
        palette={{ bg: RWB_BLUE, bgDeep: RWB_BLUE_DEEP, accent: RWB_RED, highlight: RWB_WHITE }}
        mood="calm"
      />

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
              filter: 'drop-shadow(0 3px 0 rgba(0,0,0,0.4)) drop-shadow(0 0 24px rgba(178,34,52,0.55))',
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
