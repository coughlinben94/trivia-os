import { useTheme } from '../shared/ThemeProvider.jsx'
import { roundLabel } from '../../lib/scoreboardMath.js'

export default function QuestionCounter({ slide, show }) {
  const { theme } = useTheme()

  if (!slide || slide.type !== 'question') return null

  // roundLabel (SW/PYL/R{round.number}) — the SAME function the scoreboard
  // and Quick Entry use — not the round's array position. Position-based
  // labeling always showed a bogus "R{n}" for Swing/PYL rounds and went
  // stale the instant a round got dragged to a new spot.
  const round = (show?.rounds ?? []).find(r => r.id === slide.roundId)
  const roundBadge = round ? roundLabel(round, show?.slides) : null
  const baseLabel = slide.data?.questionLabel ?? `Q${slide.data?.questionNumber ?? ''}`
  const parts = slide.data?.parts
  // Multi-part series: Q6a/Q6b/Q6c instead of one static label for the whole slide.
  const label = Array.isArray(parts) && parts.length > 1
    ? `${baseLabel}${String.fromCharCode(97 + Math.min(Math.max(slide.data.currentPart ?? 0, 0), parts.length - 1))}`
    : baseLabel
  const counter = roundBadge ? `${label} · ${roundBadge}` : label

  return (
    <div
      className="absolute top-6 right-6 z-50 pointer-events-none"
      style={{
        color: theme.colors.accent,
        opacity: 0.9,
        fontFamily: `'${theme.fonts.ui}', 'Inter', system-ui, sans-serif`,
        fontSize: '1.15rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        textShadow: '0 2px 8px rgba(0,0,0,0.6)',
      }}
    >
      {counter}
    </div>
  )
}
