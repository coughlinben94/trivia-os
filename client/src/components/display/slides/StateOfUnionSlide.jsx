import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import BaynesWatermark from '../BaynesWatermark.jsx'
import SlideElements from '../SlideElements.jsx'
import BreathingGradient from '../BreathingGradient.jsx'

const CHARS_PER_SECOND = 28
const EASE_SNAP = [0.23, 1, 0.32, 1]

export default function StateOfUnionSlide({ slide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const message = slide.data?.message ?? "Welcome to Trivia Night at Baynes Apple Valley. Let's get into it."
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    setDisplayed('')
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayed(message.slice(0, i))
      if (i >= message.length) clearInterval(interval)
    }, 1000 / CHARS_PER_SECOND)
    return () => clearInterval(interval)
  }, [message])

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

        {/* Typewriter text — plain, centered, no gold/tilt (not a shiny beat) */}
        <motion.p
          initial={{ opacity: 0, scale: reduce ? 1 : 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE_SNAP }}
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            fontWeight: 700,
            color: RWB_WHITE,
            textShadow: '0 2px 18px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.6)',
            fontSize: 'clamp(1.9rem, 3.6cqw, 3.4rem)',
            lineHeight: 1.35,
            textAlign: 'center',
            textWrap: 'balance',
            maxWidth: '72ch',
            minHeight: '8rem',
          }}
        >
          {displayed}
          {/* Blinking cursor */}
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
            style={{ color: RWB_WHITE, marginLeft: 2 }}
          >
            |
          </motion.span>
        </motion.p>
      </div>

      <BaynesWatermark />

      <div className="absolute inset-0" style={{ zIndex: 2 }}>
        <SlideElements elements={slide.data?.elements} theme={theme} />
      </div>
    </div>
  )
}
