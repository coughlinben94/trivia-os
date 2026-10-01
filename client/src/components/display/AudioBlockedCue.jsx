import { useState, useCallback, useEffect, useRef } from 'react'
import { reportBlocked } from '../../lib/audioBlocked.js'

// "Click for sound" — shown on /display when a clip was asked to play but made no
// sound (Chrome blocks UNMUTED playback on a tab with no click/key since load;
// the 2026-09-29 runner-up cause). A click is a real user gesture, so it recovers.
// The hook owns the state and the Sentry report; slides call markBlocked(kind,
// check) from their play-start watch and clearBlocked() when playback stops.
// `check` is the same "is it really sounding?" test the watch used: while the cue
// is up it is re-run every second, so a SLOW start that finally sounds clears the
// cue by itself instead of leaving it over a clip that is playing.
export function useBlockedCue(slideId, part = 0) {
  const [blocked, setBlocked] = useState(false)
  const checkRef = useRef(null)
  const markBlocked = useCallback((kind, check) => {
    reportBlocked(kind, { slideId, part })
    checkRef.current = check ?? null
    setBlocked(true)
  }, [slideId, part])
  const clearBlocked = useCallback(() => {
    checkRef.current = null
    setBlocked(false)
  }, [])
  useEffect(() => {
    if (!blocked) return
    const t = setInterval(() => {
      try { if (checkRef.current?.()) clearBlocked() } catch { /* never break the show */ }
    }, 1000)
    return () => clearInterval(t)
  }, [blocked, clearBlocked])
  return { blocked, markBlocked, clearBlocked }
}

export default function AudioBlockedCue({ show, onRetry, theme }) {
  if (!show) return null
  return (
    <button
      type="button"
      data-no-step // a click here must never advance the show (Display's click-to-step ignores it)
      onClick={onRetry}
      className="rounded-full px-8 py-3 cursor-pointer"
      style={{
        // fixed, not in flow: appearing must never push the question text around
        position: 'fixed',
        left: '50%',
        bottom: '6%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        background: theme.colors.accent,
        color: theme.colors.text,
        fontFamily: `'${theme.fonts.body}', sans-serif`,
        fontSize: '1.6rem',
        fontWeight: 700,
        border: `2px solid ${theme.colors.highlight}`,
      }}
    >
      🔊 Click for sound
    </button>
  )
}
