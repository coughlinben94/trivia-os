import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import BaynesWatermark from '../BaynesWatermark.jsx'
import SlideElements from '../SlideElements.jsx'
import BreathingGradient from '../BreathingGradient.jsx'

const EASE_SNAP = [0.23, 1, 0.32, 1]

export default function StateOfUnionSlide({ slide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const message = slide.data?.message ?? "Welcome to Trivia Night at Baynes Apple Valley. Let's get into it."

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
            transition={{ duration: 0.4, ease: EASE_SNAP }}
          />
        )}

        {/* Typewriter text — RWB gradient fill, same spring + tilt as ShinyIntroScreen. */}
        <motion.p
          initial={{ opacity: 0, scale: reduce ? 1 : 0.85, rotate: reduce ? -6 : -14 }}
          animate={{ opacity: 1, scale: 1, rotate: -6 }}
          transition={reduce ? { duration: 0.3, ease: EASE_SNAP } : { type: 'spring', duration: 0.5, bounce: 0.25 }}
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            fontWeight: 700,
            fontSize: 'clamp(2.4rem, 5.5cqw, 5.2rem)',
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
      </div>

      <BaynesWatermark />

      <div className="absolute inset-0" style={{ zIndex: 2 }}>
        <SlideElements elements={slide.data?.elements} theme={theme} />
      </div>
    </div>
  )
}
