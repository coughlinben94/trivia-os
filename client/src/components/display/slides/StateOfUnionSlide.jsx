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

  const c = theme.colors

  // Same fixed angle on both gradient layers, always — only their opacity
  // crosses over, never their direction. That crossfade is the "stop-shift":
  // as A fades under B, the effective color distribution drifts smoothly
  // with zero rotation and nothing but opacity animating (GPU-only, matches
  // ambient-design-law). Built from this show's own theme.colors so the
  // background belongs to the same family as every ambient wash instead of
  // a one-off hardcoded palette.
  const gradA = `linear-gradient(135deg, ${c.bgDeep} 0%, ${c.bg} 55%, ${c.accent} 100%)`
  const gradB = `linear-gradient(135deg, ${c.bg} 0%, ${c.accent} 50%, ${c.highlight} 100%)`

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-24 overflow-hidden">
      {/* Base gradient — locked, no animation, always visible under the
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

      {/* Faint intensity pulse — theme highlight, opacity-only breathe. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: `radial-gradient(ellipse 70% 60% at 50% 45%, ${c.highlight} 0%, transparent 70%)`,
        }}
        animate={reduce ? { opacity: 0.1 } : { opacity: [0.05, 0.15, 0.05] }}
        transition={reduce ? undefined : { duration: 7, repeat: Infinity, ease: 'easeInOut' }}
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
            color: c.text,
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
            style={{ color: c.text, marginLeft: 2 }}
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
