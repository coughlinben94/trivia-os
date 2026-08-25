import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../shared/ThemeProvider.jsx'
import { LOCK_COUNTDOWN_MS } from '../../lib/slideStepping.js'
import { EASE_OUT } from '../../lib/easings.js'

// How long the lock mark holds on screen after the count reaches zero. The real
// lock write normally lands inside this window and clears the countdown fields
// off the slide, which unmounts this overlay early — this is the fallback
// ceiling so a dropped/slow write can't leave a lock parked over the TV forever.
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
// The padlock that closes the ceremony. Deliberately NOT the 🔒 emoji it
// replaced (2026-08-25 design critique): an emoji glyph ignores `color` and
// `fontFamily` entirely, so it rendered as the OS's own glossy brass padlock —
// pixel-identical across all 21 themes in a product where the theme drives
// everything else. Drawn instead of imported: this repo has no icon set, and a
// padlock is a rounded rect plus an arc. `currentColor` + em sizing mean it
// inherits the countdown glyph's own theme color and scale, so it lands at the
// same size the numbers do and re-tints per theme like every other mark.
function LockMark() {
  return (
    <svg
      data-lock-mark
      viewBox="0 0 24 24"
      role="img"
      aria-label="Answers locked"
      style={{ height: '0.86em', width: '0.86em', display: 'block' }}
    >
      <path
        d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect x="4.2" y="10.2" width="15.6" height="11.4" rx="2.6" fill="currentColor" />
      <circle cx="12" cy="15.1" r="1.7" fill="rgba(0,0,0,0.55)" />
      <rect x="11.15" y="15.1" width="1.7" height="3.6" rx="0.85" fill="rgba(0,0,0,0.55)" />
    </svg>
  )
}

// What every phone-scored mechanic shows once its answers are locked and
// scored but the room hasn't been told yet. Since 2026-08-25 that is a state
// the host holds for as long as he wants to talk (reveal moved to the A key),
// not the ~1s transitional flicker it used to be — so it needs to be alive,
// legible from across a bar, and still recede while he's the one talking.
//
// Continuity, not decoration: it is the SAME LockMark the 3-2-1 ceremony
// slams down on at zero, in the same theme color, so the overlay fading out
// reads as that lock settling onto the slide rather than one mark being
// swapped for a different one.
//
// The breathe is opacity only (compositor-only, no layout/paint), ~3.6s per
// cycle — slow enough to read as "still here, waiting" rather than as
// something asking to be looked at, which is the whole job while the host
// talks over it. prefers-reduced-motion gets the same mark held steady at the
// cycle's midpoint, not a dimmer or brighter version of it.
export function AnswersLockedBadge({ theme, label = 'Answers locked' }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      animate={reduce ? { opacity: 0.88 } : { opacity: [0.72, 1, 0.72] }}
      transition={reduce
        ? { duration: 0.3, ease: EASE_OUT }
        : { duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.55em',
        // Matches the typography ShinyOrderQuestion's StatusSlot was retuned
        // to in the 2026-08-25 design pass (its own comment measures why the
        // old 21.6px/27%-alpha status text was unreadable on a TV) — this
        // replaces that line on all three mechanics, so it inherits the fix
        // rather than reopening it.
        color: `${theme.colors.text}d9`,
        fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
        fontSize: 'clamp(1.6rem, 2vw, 2.3rem)',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        willChange: 'opacity',
      }}
    >
      <LockMark />
      <span>{label}</span>
    </motion.div>
  )
}

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
            // Flat near-opaque scrim + blur, NOT a radial gradient (2026-08-25
            // design critique): the gradient left the middle of the stage only
            // ~5% darkened, so the question headline underneath stayed fully
            // readable and collided with the ceremony — two live visual states
            // fighting. Blur is the right tool for masking one state under
            // another (emil-design-eng); the flat fill makes the darkening even
            // across the whole stage instead of brightening toward the corners.
            background: `${c.bgDeep}f5`,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          {/* Label — pinned near the top rather than stacked against the number,
              so it never lands on the question headline's own center band
              (2026-08-25 design critique). Sits still for the whole ceremony so
              the swapping number below is the only thing moving. */}
          <motion.p
            initial={{ opacity: 0, y: reduce ? 0 : -12 }}
            animate={{ opacity: 0.8, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            style={{
              position: 'absolute',
              top: '18%',
              left: 0,
              right: 0,
              textAlign: 'center',
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
                textShadow: isLock ? 'none' : `0 0 6vmin ${c.highlight}66`,
                filter: isLock ? `drop-shadow(0 0 3vmin ${c.highlight}66)` : 'none',
                willChange: 'transform, opacity',
              }}
            >
              {isLock ? <LockMark /> : frame}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
