// Reuse the active round only if it is the kind of round being added to;
// otherwise the caller creates a fresh one.
export function reusableRoundId(roundId, rounds, roundType) {
  const round = roundId ? rounds?.find(r => r.id === roundId) : null
  return round && (round.roundType ?? 'normal') === roundType ? round.id : null
}

// Local YYYY-MM-DD (toISOString is UTC and flips to tomorrow after ~5pm Pacific).
export function localDateString(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
