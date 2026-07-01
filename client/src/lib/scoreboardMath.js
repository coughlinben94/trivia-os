// Single source of truth for the scoreboard's round columns and team totals —
// used by ScoreboardModal (host), ScoreboardOverlay (TV), Join's scores drawer
// (phone), and ShowDetail (post-show history) so all four surfaces agree.

export function deriveRoundCols(show) {
  const sorted = (show.rounds ?? []).slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  const cols = sorted.map(round => {
    const slides = (show.slides ?? []).filter(s => s.roundId === round.id)
    if (slides.some(s => s.type === 'swing-round-intro')) return { key: `r_${round.id}`, label: 'SW' }
    if (slides.some(s => s.type === 'pyl-reveal')) return { key: `r_${round.id}`, label: 'PYL' }
    return { key: `r_${round.id}`, label: `R${round.number ?? '?'}` }
  })
  cols.push({ key: 'bonus', label: '?' })
  return cols
}

// Sums only the keys present in `cols` — a team's scores object may carry
// stale keys from a since-deleted round, which must not count toward the total.
export function computeTotal(scores, cols) {
  if (!scores || typeof scores !== 'object') return 0
  return cols.reduce((sum, c) => sum + (Number(scores[c.key]) || 0), 0)
}
