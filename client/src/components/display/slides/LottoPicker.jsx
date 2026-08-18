import { useState, useEffect, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import ErrorBoundary from '../../ErrorBoundary.jsx'
import { SELECTION_ANIMATIONS } from './selectionAnimations.js'
import { EASE_OUT } from '../../../lib/easings.js'

/**
 * Trivia OS — "SURPRISE ME" lotto picker (Ben, 2026-08-18)
 * Contract: { candidates, winnerId, theme, onDone } — same as every other
 * selection animation, because this IS one as far as the registry and
 * PylRevealSlide are concerned.
 *
 * This is a PREFIX, not a replacement: it slot-machines through the five real
 * animations' icons, lands on one, then mounts that real animation with the
 * exact same props it was handed. onDone is never called by this component —
 * the chosen animation owns it, so the show advances when the real reveal
 * finishes, not when the spin does.
 *
 * The team pick is still decided upstream (winnerId is predetermined); the
 * only thing randomized here is WHICH of the five visuals plays.
 */

// Never let the lotto pick itself — that would recurse forever. Filtered by id
// rather than by array position because the registry order is free to change.
// Deliberately a function, not a module-level const: the registry imports THIS
// file, so reading SELECTION_ANIMATIONS during module evaluation would hit the
// const's temporal dead zone. By first render the circle is closed and it's fine.
const realAnimations = () => SELECTION_ANIMATIONS.filter((a) => a.id !== 'lotto')

const LAPS = 2            // full trips around the icon row before it starts landing
const TICK_BASE = 60      // ms between the first two ticks
const TICK_DECAY = 1.09   // each tick is ~9% slower than the last — wheel friction
const LAND_HOLD = 600     // beat on the winning icon before the real animation takes over
const STATIC_HOLD = 600   // reduced-motion: how long the "🎰 Name!" card sits there

export default function LottoPicker({ candidates, winnerId, theme, onDone }) {
  const C = theme.colors
  const reduce = useReducedMotion()

  // Locked on mount so a re-render can't reroll the animation mid-spin.
  const REAL = useMemo(realAnimations, [])
  const chosenIdx = useMemo(() => Math.floor(Math.random() * REAL.length), [REAL])
  const chosen = REAL[chosenIdx]

  const [active, setActive] = useState(0)
  const [landed, setLanded] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (reduce) {
      // No spinning under reduced motion — just name the winner and get on with it.
      setActive(chosenIdx)
      setLanded(true)
      const t = setTimeout(() => setPlaying(true), STATIC_HOLD)
      return () => clearTimeout(t)
    }

    // Walk forward a whole number of laps plus however far it is to the chosen
    // icon, so the decaying tick always comes to rest on the right one.
    const steps = LAPS * REAL.length + chosenIdx
    const timers = []
    let clk = 0
    for (let i = 1; i <= steps; i++) {
      clk += TICK_BASE * Math.pow(TICK_DECAY, i - 1)
      const idx = i % REAL.length
      timers.push(setTimeout(() => setActive(idx), clk))
    }
    timers.push(setTimeout(() => setLanded(true), clk))
    timers.push(setTimeout(() => setPlaying(true), clk + LAND_HOLD))
    return () => timers.forEach(clearTimeout)
  }, [reduce, chosenIdx])

  if (playing) {
    const Anim = chosen.Component
    // Same ErrorBoundary wrapper PylRevealSlide uses — a crash in whichever
    // animation the dice picked shouldn't take the whole reveal down with it.
    return (
      <ErrorBoundary>
        <Anim candidates={candidates} winnerId={winnerId} theme={theme} onDone={onDone} />
      </ErrorBoundary>
    )
  }

  return (
    // Inline styles, not Tailwind, to match the other five selection
    // animations — they render into the display stage and stand on their own.
    <div
      style={{
        width: '100%', height: '100%', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40,
        background: `radial-gradient(ellipse 72% 58% at 50% 44%, ${C.accent}2b 0%, transparent 62%), radial-gradient(ellipse at center, ${C.bg} 0%, ${C.bgDeep} 82%)`,
      }}
    >
      <p
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: C.textMuted,
          fontSize: '1.1rem',
          fontWeight: 700,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
        }}
      >
        🎰 Surprise Me
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        {REAL.map((anim, i) => {
          const on = i === active
          return (
            <motion.div
              key={anim.id}
              animate={{ scale: on ? (landed ? 1.45 : 1.25) : 0.9, opacity: on ? 1 : 0.35 }}
              transition={{ duration: 0.14, ease: EASE_OUT }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 132,
                height: 132,
                borderRadius: 28,
                fontSize: 68,
                background: on ? `${C.accent}55` : `${C.accent}18`,
                border: `3px solid ${on ? C.highlight : `${C.accent}44`}`,
                boxShadow: on ? `0 0 70px ${C.highlight}66` : 'none',
              }}
            >
              {anim.emoji}
            </motion.div>
          )
        })}
      </div>

      {/* Reserved height so the row doesn't jump when the name appears. */}
      <div style={{ height: 72, display: 'flex', alignItems: 'center' }}>
        {landed && (
          <motion.p
            initial={{ opacity: 0, y: reduce ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            style={{
              fontFamily: `'${theme.fonts.display}', sans-serif`,
              color: C.highlight,
              fontSize: '3rem',
              fontWeight: 700,
            }}
          >
            {chosen.label}!
          </motion.p>
        )}
      </div>
    </div>
  )
}
