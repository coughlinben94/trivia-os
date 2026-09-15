import { applyPhoneScoreUpdates } from './scoreboardMath.js'
import { hashSeed, mulberry32 } from './seededRandom.js'

// A matching submission is scored purely from its own shape — no answer-key
// lookup needed. Each pair in slide.data.pairs shares one `id` between its
// left and right column entries — a CORRECT match is the same id tapped on
// both sides, so scoring is just leftId === rightId. This only works because
// MatchingBoard.jsx's connections map is keyed by side (`left:id`/`right:id`,
// see buildMatchAnswer below) — without the side tag, a left id and an
// unrelated right id sharing the same raw pair id would collapse together.

export function scoreMatchingSubmission(answer, pointsPerMatch) {
  if (!Array.isArray(answer)) return 0
  const correctCount = answer.filter(
    pair => pair && pair.leftId != null && pair.leftId === pair.rightId
  ).length
  return correctCount * (Number(pointsPerMatch) || 0)
}

// connections is { [`${side}:${itemId}`]: colorIndex } — side-tagged because
// left and right items share the same id space (see top-of-file note). Two
// entries sharing a color form a pair; only a left+right pair counts (two
// same-side taps, or a lone tap, are incomplete and dropped).
export function buildMatchAnswer(connections) {
  const byColor = {}
  for (const [key, color] of Object.entries(connections ?? {})) {
    const [side, itemId] = key.split(':')
    byColor[color] = byColor[color] ?? {}
    if (side === 'left') byColor[color].leftId = itemId
    if (side === 'right') byColor[color].rightId = itemId
  }
  return Object.values(byColor).filter(p => p.leftId != null && p.rightId != null)
}

// Fisher-Yates, seeded by `seed` (typically a slide id) so the shuffle is
// stable per question but not a predictable mirror of the left column — the
// naive `sort().reverse()` this replaced produced an exact mirror for any
// 2-pair question, making it solvable without reading it.
//
// Re-rolls if any item lands back in its own (matched) slot, for n >= 3 —
// found live 2026-08-18: a fixed point pre-reveals that pair by position
// (it's already sitting in its matched row) and, on the display TV, never
// animates at reveal since it doesn't move. n=2 is exempt: its only
// fixed-point-free permutation is the full mirror, which is exactly the
// "solvable without reading it" pattern the shuffle exists to avoid — see
// the mirror test below. Capped at 50 tries so a pathological seed can't
// loop forever; the tiny leftover fixed-point risk beyond that is far
// better than never terminating.
export function seededShuffle(items, seed) {
  const rand = mulberry32(hashSeed(String(seed)))
  function shuffleOnce() {
    const arr = [...items]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
  let arr = shuffleOnce()
  if (items.length >= 3) {
    for (let tries = 0; tries < 50 && arr.some((item, i) => item === items[i]); tries++) {
      arr = shuffleOnce()
    }
  }
  return arr
}

// Pure fold-in: given phone_answers + live team registrations + the admin
// scoreboard, compute the scoreboard_teams rows to upsert. team_id <-> team
// name matching is case-insensitive/trimmed since `teams` (phone) and
// `scoreboard_teams` (host-typed) have no FK relationship. Skips anything
// that can't be attributed rather than guessing. Writes only THIS slide's
// entry into the round's phoneBySlide bucket (see normalizeRoundScore) —
// same reasoning as computeWagerScoreUpdates: a second phone-scored question
// in the same round must add its points, not overwrite the first one's.
export function computeMatchingScoreUpdates({ answers, teams, scoreboardTeams, roundKey, pointsPerMatch, slideId }) {
  const results = (answers ?? []).map(ans => ({
    teamId: ans.team_id,
    points: scoreMatchingSubmission(ans.answer, pointsPerMatch),
  }))
  return applyPhoneScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
}
