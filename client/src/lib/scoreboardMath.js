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

// A round's stored score value is EITHER a legacy plain number (every show
// created before 2026-07-28) or a { written, phone } split (new — see
// docs/superpowers/specs/2026-07-28-phone-answer-scoring-design.md). This is
// the one place that ambiguity gets resolved — every consumer of a round
// value, read or write, must go through this first. Never read
// `scores[key]` directly anywhere else in the codebase.
export function normalizeRoundScore(raw) {
  if (raw != null && typeof raw === 'object') {
    return { written: Number(raw.written) || 0, phone: Number(raw.phone) || 0 }
  }
  const n = Number(raw)
  return { written: Number.isFinite(n) ? n : 0, phone: 0 }
}

// Single-round scalar for display (history chips, exports) — same shape
// resolution as normalizeRoundScore, collapsed to one number.
export function roundScoreTotal(raw) {
  const { written, phone } = normalizeRoundScore(raw)
  return written + phone
}

// ScoreboardModal's debounced save merges onto a fresh DB read instead of
// upserting the client's whole local copy — the local copy can be stale on
// round keys the host isn't currently editing (e.g. LiveMode's phone-answer
// fold-in writing a different round between this modal's load and its next
// save). `fresh` is null on a failed refetch — fall back to `local` whole
// rather than writing just the one edited key and dropping every other round.
export function mergeScoreEdit(fresh, local, fieldKey) {
  if (!fresh) return local
  return { ...fresh, [fieldKey]: local[fieldKey] }
}

// Sums only the keys present in `cols` — a team's scores object may carry
// stale keys from a since-deleted round, which must not count toward the total.
export function computeTotal(scores, cols) {
  if (!scores || typeof scores !== 'object') return 0
  return cols.reduce((sum, c) => {
    const { written, phone } = normalizeRoundScore(scores[c.key])
    return sum + written + phone
  }, 0)
}
