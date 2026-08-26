// Single source of truth for the scoreboard's round columns, team totals, and
// medal emoji — used by ScoreboardModal (host), ScoreboardOverlay (TV), Join's
// scores drawer (phone), and ShowDetail (post-show history) so all four
// surfaces agree.

export const MEDALS = ['🥇', '🥈', '🥉']

// `+ Team` inserts a row with name: '' until the host types one in. The PYL
// Picker animations (BoxingRing/ChestDuel/CardPick/BattleshipDuel)
// pick a random winner from whatever list they're handed and render its name
// with no fallback, so a not-yet-named team could get picked and "win" with
// a blank name on the TV. Every picker call site must filter through this
// before building its candidates list.
export function pickableTeams(teams) {
  return teams.filter(t => t.name && t.name.trim())
}

// The one place a round's on-screen label ("SW"/"PYL"/"R{n}") gets computed —
// shared by deriveRoundCols (scoreboard columns + Quick Entry's numeric
// resolution) and any display surface that shows a round badge next to a
// question (QuestionCounter, RoundSidebar). Before this was extracted, those
// display surfaces each derived a round's number from its live ARRAY
// POSITION instead of calling this — so a Swing/PYL round always showed a
// bogus "R{position}" badge (never "SW"/"PYL"), and dragging any round to a
// new position silently relabeled it to match its new slot, disagreeing with
// what Quick Entry (which reads this same function) already called it. Using
// one shared function for every surface means there's nothing left to drift.
export function roundLabel(round, slides) {
  // roundType is stamped by AddRoundWizard and the Swing/PYL auto-create
  // paths and is the authoritative signal — the Swing auto-create makes a
  // round with only question slides (no swing-round-intro), which the
  // slide-type sniffing below mislabeled as R{n}, breaking Quick Entry's
  // "SW" input. Slide-type detection stays as a fallback for legacy rounds
  // created before roundType existed.
  if (round.roundType === 'swing') return 'SW'
  if (round.roundType === 'pyl') return 'PYL'
  const roundSlides = (slides ?? []).filter(s => s.roundId === round.id)
  if (roundSlides.some(s => s.type === 'swing-round-intro')) return 'SW'
  if (roundSlides.some(s => s.type === 'pyl-reveal')) return 'PYL'
  return `R${round.number ?? '?'}`
}

export function deriveRoundCols(show) {
  const sorted = (show.rounds ?? []).slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  const cols = sorted.map(round => ({ key: `r_${round.id}`, label: roundLabel(round, show.slides) }))
  cols.push({ key: 'bonus', label: '?' })
  return cols
}

// A round's stored score value is EITHER a legacy plain number (every show
// created before 2026-07-28) or a { written, phone } split (new — see
// docs/superpowers/specs/2026-07-28-phone-answer-scoring-design.md). This is
// the one place that ambiguity gets resolved — every consumer of a round
// value, read or write, must go through this first. Never read
// `scores[key]` directly anywhere else in the codebase.
//
// `phone` itself has the same legacy/current split, one level down: either a
// plain number (every phone score written before 2026-08-17) or an object
// keyed by slide id (current — one entry per phone-scored question in the
// round, so a second wager/matching question in the same round adds instead
// of overwriting the first — see computeWagerScoreUpdates/
// computeMatchingScoreUpdates). `phoneBySlide` is the bucket a fold-in should
// merge its own slide's entry into and write back whole, so a legacy flat
// number never gets silently dropped when it's touched again — it's wrapped
// under a `__legacy` key rather than discarded.
export function normalizeRoundScore(raw) {
  if (raw != null && typeof raw === 'object') {
    const rawPhone = raw.phone
    let phoneBySlide
    if (rawPhone != null && typeof rawPhone === 'object') {
      phoneBySlide = rawPhone
    } else {
      const legacy = Number(rawPhone) || 0
      phoneBySlide = legacy > 0 ? { __legacy: legacy } : {}
    }
    const phone = Object.values(phoneBySlide).reduce((sum, v) => sum + (Number(v) || 0), 0)
    return { written: Number(raw.written) || 0, phone, phoneBySlide }
  }
  const n = Number(raw)
  return { written: Number.isFinite(n) ? n : 0, phone: 0, phoneBySlide: {} }
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
