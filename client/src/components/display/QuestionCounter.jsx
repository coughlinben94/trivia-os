import { useTheme } from '../shared/ThemeProvider.jsx'

export default function QuestionCounter({ slide, show }) {
  const { theme } = useTheme()

  if (!slide || slide.type !== 'question') return null

  const roundIdx = (show?.rounds ?? []).findIndex(r => r.id === slide.roundId)
  const roundNum = roundIdx >= 0 ? roundIdx + 1 : null
  const baseLabel = slide.data?.questionLabel ?? `Q${slide.data?.questionNumber ?? ''}`
  const parts = slide.data?.parts
  // Multi-part series: Q6a/Q6b/Q6c instead of one static label for the whole slide.
  const label = Array.isArray(parts) && parts.length > 1
    ? `${baseLabel}${String.fromCharCode(97 + Math.min(Math.max(slide.data.currentPart ?? 0, 0), parts.length - 1))}`
    : baseLabel
  const counter = roundNum ? `${label} · R${roundNum}` : label

  return (
    <div
      className="absolute top-5 right-5 z-50 pointer-events-none"
      style={{
        color: theme.colors.accent,
        opacity: 0.7,
        fontFamily: `'${theme.fonts.ui}', 'Inter', system-ui, sans-serif`,
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
    >
      {counter}
    </div>
  )
}
