import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../shared/ThemeProvider.jsx'
import AudioBlockedCue from './AudioBlockedCue.jsx'
import { EASE_OUT, EASE_EXIT } from '../../lib/easings.js'
import { timerView, shouldChime, calibrateOffset, TIMES_UP } from '../../lib/showTimer.js'
import { playTimerChime, unlockTimerAudio } from '../../lib/timerChime.js'

// Host countdown timer, a layer over whatever slide is live (not a slide type).
// Mounted ONCE in Display.jsx inside the stage, next to ScoreboardOverlay.
// Top-left corner on purpose: QuestionCounter owns top-right, and the question
// safe area (middle 60% x 45%) starts at 20% from the left and 27.5% from the top,
// so this panel, kept under ~24cqh tall, never touches it. Sizes are cqw/cqh
// (the stage is a size container), so it scales with the TV. State and clock-skew
// handling live in lib/showTimer.js.
const OFFSET_KEY = 'trivia.timerClockOffset'
const MAX_OFFSET_STEP_MS = 3000
const PLAYED_KEY = 'trivia.timerChimed'

function readStore(key) {
  try { return sessionStorage.getItem(key) } catch { return null }
}
function writeStore(key, value) {
  try { sessionStorage.setItem(key, String(value)) } catch { /* private mode: fine */ }
}

// Each character in its own fixed-width cell. A proportional font (and many display
// fonts ignore tabular-nums) makes "1:11" wider than "0:09", so the panel's right
// edge would twitch every second. Cell widths are font-agnostic.
function FixedDigits({ label }) {
  return [...label].map((ch, i) => (
    <span key={i} data-timer-cell style={{ display: 'inline-block', width: ch === ':' ? '0.32em' : '0.62em', textAlign: 'center' }}>{ch}</span>
  ))
}

export default function TimerOverlay({ show }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const timer = show?.special_event?.timer ?? null

  // Clock offset (this TV minus host). Learned only from a timer that CHANGES
  // while this page is open (it just arrived over realtime, so sentAt is ~now on
  // the host clock). A timer already there at load keeps the offset saved from
  // an earlier one in this tab, else 0.
  //
  // A write that arrives late (a realtime reconnect refetch after the TV's wifi
  // blipped) carries an OLD sentAt, and its age would be mistaken for clock skew.
  // Once an offset is known, a clock only drifts a little, so a sample more than
  // MAX_OFFSET_STEP_MS away from it is a late delivery, not a new skew: ignore it.
  // The very first sample is always taken (the skew can legitimately be many seconds).
  const offsetRef = useRef(Number(readStore(OFFSET_KEY)) || 0)
  const calibratedRef = useRef(readStore(OFFSET_KEY) != null)
  const firstSentAtRef = useRef(timer?.sentAt)
  useEffect(() => {
    if (!timer || timer.sentAt === firstSentAtRef.current) return
    const sample = calibrateOffset(Date.now(), timer)
    if (calibratedRef.current && Math.abs(sample - offsetRef.current) > MAX_OFFSET_STEP_MS) return
    calibratedRef.current = true
    offsetRef.current = sample
    writeStore(OFFSET_KEY, offsetRef.current)
  }, [timer?.sentAt]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tick only while there is something to show. 200ms keeps the seconds honest
  // without a render per frame.
  const [now, setNow] = useState(() => Date.now())
  const active = !!timer
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [active, timer?.id, timer?.sentAt])

  const view = timerView(timer, now, offsetRef.current)

  // Unlock audio on the first click/key in this tab, so the chime can ring later.
  useEffect(() => {
    const unlock = () => unlockTimerAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Chime exactly once per timer id (ref + sessionStorage, so a reload cannot ring
  // it again), and never for a TV that loads long after zero (shouldChime).
  const playedRef = useRef(readStore(PLAYED_KEY))
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    if (!shouldChime(view, playedRef.current)) return
    playedRef.current = view.id
    writeStore(PLAYED_KEY, view.id)
    playTimerChime().then(ok => {
      if (ok) return
      setBlocked(true) // the director already reported why (once)
    })
  }, [view.phase, view.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view.phase !== 'done') setBlocked(false) }, [view.phase])
  const retry = useCallback(() => {
    playTimerChime().then(ok => { if (ok) setBlocked(false) })
  }, [])

  const phase = view.phase
  const urgent = phase === 'urgent'
  const done = phase === 'done'
  const long = view.label.length > 5

  // The pulses are CSS animations (index.css: transform/opacity only, still under
  // prefers-reduced-motion), not framer's main-thread scale.
  const pulseClass = urgent ? 'timer-pulse-urgent' : done ? 'timer-pulse-done' : undefined

  return (
    <>
      <AnimatePresence>
        {phase !== 'idle' && (
          <motion.div
            key="timer-overlay"
            data-timer-overlay
            data-phase={phase}
            role="timer"
            aria-label={done ? TIMES_UP : `Timer ${view.label}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.22, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE_EXIT } }}
            className="absolute z-[70] pointer-events-none"
            style={{
              // clear of the shiny sparkle (top 28px, left 30px) that owns this corner
              left: '6cqw',
              top: '3cqh',
              transformOrigin: 'top left',
              padding: '1.6cqh 2.4cqh',
              borderRadius: '2.4cqh',
              background: `${theme.colors.bgDeep}f2`,
              border: `0.5cqh solid ${urgent || done ? theme.colors.highlight : theme.colors.accent}`,
              boxShadow: '0 1cqh 3cqh rgba(0,0,0,0.55)',
              color: theme.colors.text,
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            <div className={pulseClass} style={{ transformOrigin: 'center' }}>
              {done ? (
                <div style={{ fontFamily: `'${theme.fonts.display}', sans-serif`, fontSize: '10cqh', lineHeight: 1.05, color: theme.colors.highlight }}>
                  {TIMES_UP}
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: `'${theme.fonts.display}', sans-serif`,
                    fontSize: long ? '10cqh' : '15cqh',
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                    color: urgent ? theme.colors.highlight : theme.colors.text,
                  }}
                >
                  <FixedDigits label={view.label} />
                </div>
              )}
              {phase === 'paused' && (
                <div style={{ fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`, fontSize: '4cqh', lineHeight: 1, fontWeight: 700, letterSpacing: '0.2em', color: theme.colors.textMuted, marginTop: '0.6cqh' }}>
                  PAUSED
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AudioBlockedCue show={blocked && done} onRetry={retry} theme={theme} />
    </>
  )
}
