import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { EASE_OUT } from '../../../lib/easings.js'

// Fixed hazard-broadcast palette — like StateOfUnionSlide's locked RWB, this
// slide is an identity ("emergency bulletin"), not a themed moment, so it
// reads the same on all 21 ambient themes. Only the display font follows theme.
const WARN_BG   = '#050007'
const WARN_RED  = '#ff4d6d'
const WARN_TEXT = '#e8d0ff'
const WARN_DIM  = '#8f6aa8'

export const DEFAULT_RULES = [
  "This ain't just your mommas trivia....",
  'Teams up to 6 — extra players cost you points. 20 for the first extra, 10 each after.',
  'Whatever the quizmaster says, goes.',
  'Phones down. Cheating gets your phone thrown in the river.',
  "Have fun, and don't yell at me — I'm not a professional trivia writer!",
]

// Three beeps timed to the three screen flashes below (300ms apart). Web
// Audio, not an asset — matches the app's existing pattern of synthesizing
// rather than shipping sound files (see ScoreboardRevealSlide's tick). Relies
// on the same standing user-activation every other /display audio (walkout
// songs, grading-break jukebox) already depends on — this is never the first
// slide of a show, so the AudioContext is never starting cold.
function playThreeBeeps() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC()
    ;[0, 0.3, 0.6].forEach(startAt => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt)
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + startAt + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + 0.15)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + startAt)
      osc.stop(ctx.currentTime + startAt + 0.16)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1200)
  } catch { /* AudioContext unavailable — flash still runs silently */ }
}

export default function RulesSlide({ slide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const { data } = slide
  const rules = data?.rules?.length ? data.rules : DEFAULT_RULES
  const title = data?.title || 'House Rules — Read Carefully'
  const firedRef = useRef(false)

  // Fire once per time this slide becomes current, not on every re-render.
  useEffect(() => {
    if (reduce || firedRef.current) return
    firedRef.current = true
    playThreeBeeps()
  }, [reduce])

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ background: WARN_BG }}
    >
      {/* CRT scanlines */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, mixBlendMode: 'overlay',
        background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 3px)',
      }} />

      {/* Three flash pulses, 300ms apart, timed with playThreeBeeps() above */}
      {!reduce && [0, 1, 2].map(i => (
        <div key={i} aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
          background: WARN_RED,
          animation: 'rulesFlashPulse 300ms ease-out forwards',
          animationDelay: `${i * 300}ms`,
        }} />
      ))}
      <style>{`@keyframes rulesFlashPulse { 0%{opacity:0;} 22%{opacity:0.88;} 60%{opacity:0;} 100%{opacity:0;} }`}</style>

      {/* Hazard-stripe header */}
      <div style={{
        position: 'relative', zIndex: 2, flexShrink: 0,
        background: 'repeating-linear-gradient(135deg, #ff4d6d 0 22px, #1a0004 22px 44px)',
        padding: '1.6% 0', display: 'flex', justifyContent: 'center',
      }}>
        <motion.span
          initial={{ opacity: 0, y: reduce ? 0 : -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          style={{
            background: '#050007', padding: '0.4em 1.4em', borderRadius: 4,
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            letterSpacing: '0.02em', color: '#fff',
            fontSize: 'clamp(1.4rem, 3.6vw, 2.5rem)',
          }}
        >
          {title}
        </motion.span>
      </div>

      {/* Rules — type on one at a time */}
      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2.6%', padding: '0 9%' }}>
        {rules.map((rule, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduce ? { duration: 0.2 } : { duration: 0.01, delay: 1 + i * 0.45 }}
            style={{ display: 'flex', gap: '1.1rem', alignItems: 'baseline' }}
          >
            <span style={{
              fontFamily: `'${theme.fonts.display}', sans-serif`,
              color: WARN_RED, fontSize: 'clamp(1rem, 2.2vw, 1.5rem)', flexShrink: 0, width: '2ch',
            }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{
              color: WARN_TEXT, fontSize: 'clamp(1rem, 2.3vw, 1.5rem)', lineHeight: 1.35, fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {rule}
            </span>
          </motion.div>
        ))}
      </div>

      <p style={{ position: 'relative', zIndex: 2, textAlign: 'center', color: WARN_DIM, fontSize: '0.8rem', margin: '0 0 2%' }}>
        Baynes Apple Valley Trivia Night
      </p>
    </div>
  )
}
