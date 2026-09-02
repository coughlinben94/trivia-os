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

// ─── Shared TV layout: how many columns a roster needs ──────────────────────
// Past a team count where one column shrinks names below readable on a bar TV
// (2026-08-19, Ben: "couldn't even read [the names]... probably needs to be
// split into two"), both TV scoreboard surfaces — the S-key ScoreboardOverlay
// and the ScoreboardRevealSlide — split the roster into two side-by-side
// columns, each sized off half the count. One threshold, one split, so the
// two surfaces can never disagree about where a given team sits.
export const SPLIT_TEAM_THRESHOLD = 9

// 1..N runs DOWN the left column and continues DOWN the right (not serpentine,
// not left-right-left): a leaderboard is read top-to-bottom by rank, and this
// keeps the leader at top-left where the eye lands. The odd team goes left, so
// the left column is never shorter than the right.
export function splitByRank(ranked, isSplit) {
  if (!isSplit) return [ranked]
  const half = Math.ceil(ranked.length / 2)
  return [ranked.slice(0, half), ranked.slice(half)]
}

// ─── ScoreboardRevealSlide layout ──────────────────────────────────────────
// The slide stage is a `container-type: size` box (see StageFrame), so every
// size below is in cqh/cqw — a percentage of the STAGE, scaling with any TV
// instead of assuming 1080p. The old slide used rem/px row metrics in a single
// `overflow-y-auto` column: past ~10 teams the rest of the roster was simply
// below the fold, and nobody scrolls a TV mid-show (deferred 2026-09-01).
//
// Chrome above the rows: top padding + title line + title margin + bottom
// padding. Everything left over is divided among the rows.
export const REVEAL_CHROME_CQH = 19
// A 3-team board must not become three giant slabs, so the per-row pitch is
// capped rather than always filling the stage.
export const REVEAL_MAX_PITCH_CQH = 15
export const REVEAL_GAP_RATIO = 0.14

// Column geometry. The name track is the only one that stretches (1fr), so it
// absorbs whatever the column box has left — but the rank and score tracks are
// FIXED cqw, and cqw stays scoped to the FULL stage even inside a half-width
// split column (the exact trap that shipped once in ScoreboardOverlay, commit
// 3d1d5a5: "half the names are cut off", "no scores showing"). Deriving both
// from the column's own width instead of hardcoding a stage-relative number
// makes that mistake unrepresentable — the row keeps identical proportions in
// either mode, just resized to the box it's actually in.
//
// The columns live inside the slide's own horizontal padding, so the box they
// share is the CONTENT width, not the whole stage — deriving the split width
// from the same exported pad the container uses means the two can't drift
// apart if that padding is ever retuned.
export const REVEAL_STAGE_PAD_CQW = 3
export const REVEAL_SPLIT_GAP_CQW = 1.4
export const REVEAL_CONTENT_CQW = 100 - 2 * REVEAL_STAGE_PAD_CQW // 94
export const REVEAL_SPLIT_COLUMN_CQW = (REVEAL_CONTENT_CQW - REVEAL_SPLIT_GAP_CQW) / 2 // 46.3
export const REVEAL_SINGLE_COLUMN_CQW = 62
const REVEAL_RANK_FRACTION = 0.10
const REVEAL_SCORE_FRACTION = 0.17

export function revealColumnWidthCqw(isSplit) {
  return isSplit ? REVEAL_SPLIT_COLUMN_CQW : REVEAL_SINGLE_COLUMN_CQW
}

// Built by hand, never `repeat(n, …)`: `repeat(0, …)` is invalid CSS, and one
// invalid value makes the browser drop the whole grid-template-columns
// declaration — every cell then stacks into one implicit column and the row
// collapses. That shipped once on the overlay (590170c, a 21-team board live).
export function revealTemplate(isSplit = false) {
  const w = revealColumnWidthCqw(isSplit)
  const rank = +(w * REVEAL_RANK_FRACTION).toFixed(2)
  const score = +(w * REVEAL_SCORE_FRACTION).toFixed(2)
  return `${rank}cqw minmax(0, 1fr) ${score}cqw`
}

// Rows shrink to fit however many teams there are, with no floor: a small,
// still-legible row beats a row clipped off the bottom of the TV. Every text
// and bar size derives from the row height, so nothing can outgrow its row.
export function revealMetrics(teamCount) {
  const n = Math.max(teamCount, 1)
  const isSplit = n > SPLIT_TEAM_THRESHOLD
  const perColumn = isSplit ? Math.ceil(n / 2) : n
  const pitch = Math.min(REVEAL_MAX_PITCH_CQH, (100 - REVEAL_CHROME_CQH) / perColumn)
  const gap = pitch * REVEAL_GAP_RATIO
  const row = pitch - gap
  return {
    isSplit,
    columnCount: isSplit ? 2 : 1,
    perColumn,
    pitch,
    gap,
    row,
    name: row * 0.46,
    score: row * 0.50,
    rank: row * 0.38,
    crown: row * 0.55,
    bar: row * 0.10,
    radius: row * 0.22,
    padX: row * 0.20,
    padY: row * 0.09,
  }
}

// ─── ScoreboardRevealSlide choreography ────────────────────────────────────
// Rows stagger in lowest-rank-first so the board builds up to the leader. The
// old step was a flat 0.08s per row, which is fine at 6 teams and absurd at
// 21 (1.9s of dead stagger before the last row even starts) or 30 (2.7s). The
// step now compresses to fit a fixed window, so the reveal takes about the
// same time whatever the count — small boards keep the original 0.08 feel,
// big boards tighten instead of dragging.
export const REVEAL_STAGGER_BASE = 0.25
export const REVEAL_STAGGER_WINDOW = 1.0
export const REVEAL_STAGGER_MAX_STEP = 0.08
export const REVEAL_ROW_DURATION = 0.22
// The leader is the LAST row in, and its crown spring-drops after it lands —
// so the crown, not the final row, is what actually ends the reveal.
export const REVEAL_CROWN_OFFSET = 0.42
export const REVEAL_CROWN_SETTLE = 0.5
export const REVEAL_LEADER_TAIL = REVEAL_CROWN_OFFSET + REVEAL_CROWN_SETTLE

export function revealStagger(teamCount) {
  const n = Math.max(teamCount, 1)
  const step = n <= 1 ? 0 : Math.min(REVEAL_STAGGER_MAX_STEP, REVEAL_STAGGER_WINDOW / (n - 1))
  const span = step * (n - 1)
  return {
    base: REVEAL_STAGGER_BASE,
    step,
    span,
    last: REVEAL_STAGGER_BASE + span,
    total: REVEAL_STAGGER_BASE + span + REVEAL_LEADER_TAIL,
  }
}

// Delay is a pure function of RANK, not of array position — so the two split
// columns still reveal in one global lowest-to-highest sweep rather than each
// column running its own race.
export function revealRowDelay(rank, teamCount) {
  const { base, step } = revealStagger(teamCount)
  return base + (Math.max(teamCount, 1) - rank) * step
}
