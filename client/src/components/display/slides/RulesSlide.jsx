import { useEffect, useRef, useState } from 'react'
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

// Ben's chosen beep clip (public/rules-beep.mp3, ~1.62s) — played at 2×
// speed (2026-08-18, Ben: "cut in half... beginning and end are needed,
// should just be faster") so the full attack+decay survives, just
// compressed, rather than truncating the tail. Played three times back to
// back; the flash pulses further down are timed off this same effective
// duration so each flash lands on a beep, not against dead air.
const RULES_BEEP_SRC = '/rules-beep.mp3'
const RULES_BEEP_PLAYBACK_RATE = 2
export const RULES_BEEP_DURATION_S = 1.65 / RULES_BEEP_PLAYBACK_RATE

// Ben's recorded PSA line (public/rules-psa.mp3, ~4.0s) — replaced the
// browser speechSynthesis attempt entirely (2026-08-18): TTS can't do a
// specific "manly and intimidating" voice, a real recording just is one.
const RULES_PSA_SRC = '/rules-psa.mp3'
const RULES_PSA_DURATION_S = 4.0

// The whole point is a cinematic beat first (flashes + beeps + PSA line on a
// bare alert screen), THEN the rules content reveals — not both at once
// (2026-08-18, Ben). 3 sped-up beeps end at 3×0.825s≈2.5s; the PSA clip runs
// ~4s after that, so content starts once both are safely done.
const RULES_CONTENT_DELAY_S = RULES_BEEP_DURATION_S * 3 + 0.15 + RULES_PSA_DURATION_S + 0.3

function playThreeBeeps() {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const a = new Audio(RULES_BEEP_SRC)
      a.playbackRate = RULES_BEEP_PLAYBACK_RATE
      a.play().catch(() => {})
    }, i * RULES_BEEP_DURATION_S * 1000)
  }
}

function playPSA() {
  new Audio(RULES_PSA_SRC).play().catch(() => {})
}

function playAlertSequence() {
  playThreeBeeps()
  setTimeout(playPSA, RULES_BEEP_DURATION_S * 3 * 1000 + 150)
}

export default function RulesSlide({ slide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const { data } = slide
  const rules = data?.rules?.length ? data.rules : DEFAULT_RULES
  const title = data?.title || 'House Rules — Read Carefully'
  const firedRef = useRef(false)
  // Screen keeps strobing for the WHOLE cinematic phase — beeps AND the
  // spoken PSA line (2026-08-18, Ben: it was going dark and static during
  // the voice line, needed to keep flashing the entire time). Turns off the
  // instant content is about to reveal.
  const [alerting, setAlerting] = useState(!reduce)

  // Fire once per time this slide becomes current, not on every re-render.
  useEffect(() => {
    if (reduce || firedRef.current) return
    firedRef.current = true
    playAlertSequence()
    const t = setTimeout(() => setAlerting(false), RULES_CONTENT_DELAY_S * 1000)
    return () => clearTimeout(t)
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

      {/* Continuous strobe — covers the whole cinematic phase (beeps + PSA
          voice), so the screen stays alive with sound during the spoken
          line instead of going dark and static. */}
      {alerting && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none',
          background: WARN_RED,
          animation: 'rulesStrobe 480ms ease-in-out infinite',
        }} />
      )}

      {/* Three sharper punctuation flashes, one per beep, timed to RULES_BEEP_DURATION_S */}
      {!reduce && [0, 1, 2].map(i => (
        <div key={i} aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
          background: WARN_RED,
          animation: 'rulesFlashPulse 300ms ease-out forwards',
          animationDelay: `${i * RULES_BEEP_DURATION_S * 1000}ms`,
        }} />
      ))}
      <style>{`
        @keyframes rulesFlashPulse { 0%{opacity:0;} 22%{opacity:0.88;} 60%{opacity:0;} 100%{opacity:0;} }
        @keyframes rulesStrobe { 0%,100%{opacity:0.12;} 50%{opacity:0.5;} }
      `}</style>

      {/* Hazard-stripe header */}
      <div style={{
        position: 'relative', zIndex: 2, flexShrink: 0,
        background: 'repeating-linear-gradient(135deg, #ff4d6d 0 22px, #1a0004 22px 44px)',
        padding: '1.6% 0', display: 'flex', justifyContent: 'center',
      }}>
        <motion.span
          initial={{ opacity: 0, y: reduce ? 0 : -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: reduce ? 0 : RULES_CONTENT_DELAY_S }}
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
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT, delay: reduce ? 0 : RULES_CONTENT_DELAY_S + 0.4 + i * 0.4 }}
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
