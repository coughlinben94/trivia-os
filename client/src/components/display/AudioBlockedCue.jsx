// "Click for sound" — shown on /display when a clip was asked to play but made no
// sound (Chrome blocks UNMUTED playback on a tab with no click/key since load;
// the 2026-09-29 runner-up cause). A click is a real user gesture, so it recovers.
// Purely presentational: the audio director (audio/director.js) decides WHEN a clip is
// blocked and reports it; slides pass `show` from useClipPlayback().blocked and
// `onRetry` from its retry().
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
