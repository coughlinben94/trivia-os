import { useState, useCallback } from 'react'
import { reportBlocked } from '../../lib/audioBlocked.js'

// "Tap for sound" — shown on /display when a clip was asked to play but made no
// sound (Chrome blocks UNMUTED playback on a tab with no click/key since load;
// the 2026-09-29 runner-up cause). A tap is a real user gesture, so it recovers.
// The hook owns the state and the Sentry report; slides call markBlocked(kind)
// from their play-start watch and clearBlocked() when playback stops.
export function useBlockedCue(slideId, part = 0) {
  const [blocked, setBlocked] = useState(false)
  const markBlocked = useCallback(kind => {
    reportBlocked(kind, { slideId, part })
    setBlocked(true)
  }, [slideId, part])
  const clearBlocked = useCallback(() => setBlocked(false), [])
  return { blocked, markBlocked, clearBlocked }
}

export default function AudioBlockedCue({ show, onRetry, theme }) {
  if (!show) return null
  return (
    <button
      type="button"
      data-no-step // a tap here must never advance the show (Display's click-to-step ignores it)
      onClick={onRetry}
      className="relative z-10 rounded-full px-8 py-3 cursor-pointer"
      style={{
        background: theme.colors.accent,
        color: theme.colors.text,
        fontFamily: `'${theme.fonts.body}', sans-serif`,
        fontSize: '1.6rem',
        fontWeight: 700,
        border: `2px solid ${theme.colors.highlight}`,
      }}
    >
      🔊 Tap for sound
    </button>
  )
}
