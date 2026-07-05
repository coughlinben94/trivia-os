// Single source of truth for the scoreboard's round columns, team totals, and
// medal emoji — used by ScoreboardModal (host), ScoreboardOverlay (TV), Join's
// scores drawer (phone), and ShowDetail (post-show history) so all four
// surfaces agree.

export const MEDALS = ['🥇', '🥈', '🥉']

export function deriveRoundCols(show) {
  const sorted = (show.rounds ?? []).slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  const cols = sorted.map(round => {
    // roundType is stamped by AddRoundWizard and the Swing/PYL auto-create
    // paths and is the authoritative signal — the Swing auto-create makes a
    // round with only question slides (no swing-round-intro), which the
    // slide-type sniffing below mislabeled as R{n}, breaking Quick Entry's
    // "SW" input. Slide-type detection stays as a fallback for legacy rounds
    // created before roundType existed.
    if (round.roundType === 'swing') return { key: `r_${round.id}`, label: 'SW' }
    if (round.roundType === 'pyl') return { key: `r_${round.id}`, label: 'PYL' }
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
