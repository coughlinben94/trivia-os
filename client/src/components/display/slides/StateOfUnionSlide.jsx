import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import BaynesWatermark from '../BaynesWatermark.jsx'
import SlideElements from '../SlideElements.jsx'

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

  // Breathing-gradient engine, fed the RWB palette instead of theme.colors.
  // Base wash + crossfade layer are both blue-family, same fixed angle
  // always — only their opacity crosses over (the "stop-shift"), never
  // their direction. Red and white never enter the linear gradient itself;
  // they're the two radial glow pulses below, so the result reads as a
  // deep blue field breathing red/white light, never a flag-stripe block.
  const gradA = `linear-gradient(135deg, ${RWB_BLUE_DEEP} 0%, ${RWB_BLUE} 100%)`
  const gradB = `linear-gradient(135deg, ${RWB_BLUE} 0%, ${RWB_BLUE_DEEP} 100%)`

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-24 overflow-hidden">
      {/* Base wash — locked, no animation, always visible under the
          crossfading layer below. */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ zIndex: 0, background: gradA }} />

      {/* Stop-shift — same angle as gradA, only opacity crosses over. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 0, background: gradB }}
        animate={reduce ? { opacity: 0.35 } : { opacity: [0.15, 0.55, 0.15] }}
        transition={reduce ? undefined : { duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Red accent glow — off-center, breathing on its own faint cycle. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: `radial-gradient(ellipse 65% 55% at 28% 32%, ${RWB_RED} 0%, transparent 70%)`,
        }}
        animate={reduce ? { opacity: 0.12 } : { opacity: [0.05, 0.18, 0.05] }}
        transition={reduce ? undefined : { duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* White highlight glow — offset from the red so the two never fully
          overlap into a blend; different period so they drift in and out
          of phase instead of pulsing in lockstep. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: `radial-gradient(ellipse 70% 60% at 62% 60%, ${RWB_WHITE} 0%, transparent 70%)`,
        }}
        animate={reduce ? { opacity: 0.09 } : { opacity: [0.04, 0.14, 0.04] }}
        transition={reduce ? undefined : { duration: 9.5, repeat: Infinity, ease: 'easeInOut' }}
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
