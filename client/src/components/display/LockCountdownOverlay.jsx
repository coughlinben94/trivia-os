import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../shared/ThemeProvider.jsx'
import { LOCK_COUNTDOWN_MS } from '../../lib/slideStepping.js'
import { EASE_OUT } from '../../lib/easings.js'

// How long the 🔒 holds on screen after the count reaches zero. The real lock
// write normally lands inside this window and clears the countdown fields off
// the slide, which unmounts this overlay early — this is the fallback ceiling
// so a dropped/slow write can't leave a 🔒 parked over the TV forever.
const LOCK_FLASH_MS = 1200

// What the overlay should be showing at `now`: 3 | 2 | 1 | 'lock' | null.
//
// Derived from the SHARED `startedAt` timestamp every time, never from a local
// timer that starts at 0 on mount — /display may mount or re-render partway
// through a countdown the OTHER window started (it picks the timestamp up over
// realtime), and a from-scratch local timer would restart the ceremony at 3
// every time that happened.
export function countdownFrame(startedAt, now) {
  if (!startedAt) return null
  const total = LOCK_COUNTDOWN_MS / 1000
  const elapsed = now - startedAt
  // Negative elapsed = the two windows' wall clocks disagree slightly (the one
  // that pressed Next stamped it). Clamp rather than render "4" or a blank.
  if (elapsed < 0) return total
  if (elapsed >= LOCK_COUNTDOWN_MS + LOCK_FLASH_MS) return null
  if (elapsed >= LOCK_COUNTDOWN_MS) return 'lock'
  return total - Math.floor(elapsed / 1000)
}

/**
 * The 3-2-1-🔒 ceremony that plays on /display when Next is pressed on a
 * phone-scored question whose answers are still open.
 *
 * Props:
 *   startedAt  — slide.data.lockCountdownStartedAt (ms). Falsy renders nothing,
 *                so the mount site is a plain unconditional render.
 *   onComplete — optional, fired once when the count reaches zero. Purely
 *                informational for the display; the ACTUAL lock+score is
 *                driven by LiveMode.jsx's own timer, never by this callback
 *                (only /host can perform it, and /display must not need to be
 *                open for a show to lock).
 */
export default function LockCountdownOverlay({ startedAt, onComplete }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const [now, setNow] = useState(() => Date.now())
  const firedFor = useRef(null)

  // Wake exactly on the next frame boundary rather than polling: three or four
  // timeouts for the whole ceremony instead of ~30 re-renders of a full-screen
  // overlay on a TV that is also running the ambient scene.
  useEffect(() => {
    if (!startedAt) return
    const elapsed = Date.now() - startedAt
    const end = LOCK_COUNTDOWN_MS + LOCK_FLASH_MS
    if (elapsed >= end) return
    const nextAt = elapsed < 0 ? 0
      : elapsed < LOCK_COUNTDOWN_MS ? (Math.floor(elapsed / 1000) + 1) * 1000
      : end
    const t = setTimeout(() => setNow(Date.now()), Math.max(nextAt - elapsed, 0))
    return () => clearTimeout(t)
  }, [startedAt, now])

  const frame = countdownFrame(startedAt, now)

  useEffect(() => {
    if (!startedAt || frame !== 'lock' || firedFor.current === startedAt) return
    firedFor.current = startedAt
    onComplete?.()
  }, [startedAt, frame, onComplete])

  const c = theme.colors
  const isLock = frame === 'lock'

  return (
    <AnimatePresence>
      {frame !== null && (
        <motion.div
          key="lock-countdown"
          data-lock-countdown
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.15 : 0.3, ease: EASE_OUT }}
          className="absolute inset-0 z-[70] flex flex-col items-center justify-center pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 70% 70% at 50% 50%, ${c.bgDeep}f2 0%, ${c.bgDeep}d9 55%, ${c.bgDeep}b3 100%)`,
          }}
        >
          {/* Label — sits still for the whole ceremony so the swapping number
              below is the only thing moving. */}
          <motion.p
            initial={{ opacity: 0, y: reduce ? 0 : -12 }}
            animate={{ opacity: 0.8, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            style={{
              fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
              color: c.textMuted,
              fontSize: 'clamp(1rem, 3vmin, 2.2rem)',
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            {isLock ? 'Answers locked' : 'Locking answers'}
          </motion.p>

          {/* The count itself. A rare, once-per-question ceremony, so it gets a
              real spring slam (RoundIntroSlide's round number, same house
              pattern) — reduced motion cross-fades the same glyphs instead. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={String(frame)}
              initial={reduce ? { opacity: 0 } : { scale: 2.4, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
              transition={reduce
                ? { duration: 0.25, ease: EASE_OUT }
                : { type: 'spring', duration: 0.42, bounce: isLock ? 0.4 : 0.22 }}
              style={{
                fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
                color: isLock ? c.highlight : c.text,
                fontSize: 'clamp(7rem, 34vmin, 24rem)',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                textShadow: `0 0 6vmin ${c.highlight}66`,
                willChange: 'transform, opacity',
              }}
            >
              {isLock ? '🔒' : frame}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
