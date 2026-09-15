// Monday-of-week bucket key (YYYY-MM-DD) for a show's date — used by Shows
// and Dashboard to group weekly player-count charts. Was duplicated
// identically in both views.
export function getMondayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday.toISOString().slice(0, 10)
}

// Groups a show's question slides by round for post-show display (Shows'
// detail drawer, ShowDetail's full page). Was duplicated identically in
// both. `sortSlides` is passed in by the caller to avoid this file taking a
// dependency on slideStepping.js.
export function groupQuestionsByRound(rounds, slides, sortSlides) {
  const roundGroups = (rounds ?? [])
    .slice()
    .sort((a, b) => (a.roundNumber ?? a.number ?? 0) - (b.roundNumber ?? b.number ?? 0))
    .map(r => ({
      round: r,
      questions: sortSlides(
        (slides ?? []).filter(s => s.roundId === r.id && s.type === 'question')
      ),
    }))
    .filter(g => g.questions.length > 0)

  const orphanQuestions = sortSlides(
    (slides ?? []).filter(s => s.type === 'question' && !(rounds ?? []).find(r => r.id === s.roundId))
  )

  return { roundGroups, orphanQuestions }
}
