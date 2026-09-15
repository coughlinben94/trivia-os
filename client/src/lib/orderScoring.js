import { applyPhoneScoreUpdates } from './scoreboardMath.js'
import { hashSeed, mulberry32 } from './seededRandom.js'

// Host-set default for a fresh Order format/slide (shiny_formats.input_schema's
// pointsForOrder, and SlideEditor/LiveMode's per-slide fallback) — one shared
// constant instead of the literal `10` duplicated in both places.
export const DEFAULT_ORDER_POINTS = 10

// Order submission is an array where each element's position matters.
// A CORRECT submission has the exact same elements in the exact same order
// as correctOrder. No partial credit — any element out of place or mismatched
// length fails the whole submission.

export function scoreOrderSubmission(answer, correctOrder, points) {
  if (!Array.isArray(answer)) return 0
  if (!Array.isArray(correctOrder)) return 0
  // An empty answer key can never be "correct" — without this, an empty
  // answer against an empty correctOrder is vacuously true (`[].every(...)`)
  // and scores FULL points for a question nobody ever set an answer key on
  // (found in review 2026-08-25: a host who never touches the position
  // controls never gets correctOrder persisted at all).
  if (correctOrder.length === 0) return 0
  if (answer.length !== correctOrder.length) return 0
  if (answer.every((id, i) => id === correctOrder[i])) return Number(points) || 0
  return 0
}

// Fisher-Yates, seeded by `seed` (typically a slide id) so the shuffle is
// stable per question but not a predictable mirror of the original order — the
// naive `sort().reverse()` this replaces produced predictable patterns,
// making questions solvable without reading.
//
// Copied from matchingScoring.js's seededShuffle (see the plan's "copy
// verbatim" instruction), but the re-roll condition is Order-specific: for
// Matching, any single item landing back in its own slot pre-reveals that
// pair. For Order there's no per-item "matched slot" — the actual giveaway
// is the WHOLE shuffled row already landing in the correct answer sequence,
// which would show teams the answer before they tap anything. So this
// re-rolls only when the entire shuffle equals `correctOrder` element-for-
// element (not merely a single fixed point), for n >= 3 — n=2's only
// alternative to identity is the full mirror, which for Order IS a full
// match against correctOrder half the time and would loop needlessly; the
// odds of a 2-item shuffle landing on the exact answer are already only
// 50/50 to begin with, an acceptable, unavoidable floor. `correctOrder` is
// optional — callers building a preview row before an answer key exists
// pass nothing, and shuffling just skips the re-roll check. Capped at 50
// tries so a pathological seed can't loop forever; the tiny leftover
// giveaway risk beyond that is far better than never terminating.
export function seededShuffle(items, seed, correctOrder) {
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
  const hasCorrectOrder = Array.isArray(correctOrder) && correctOrder.length === items.length
  if (items.length >= 3 && hasCorrectOrder) {
    const matchesCorrectOrder = a => a.every((item, i) => item.id === correctOrder[i])
    for (let tries = 0; tries < 50 && matchesCorrectOrder(arr); tries++) {
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
export function computeOrderScoreUpdates({ answers, teams, scoreboardTeams, roundKey, points, correctOrder, slideId }) {
  const results = (answers ?? []).map(ans => ({
    teamId: ans.team_id,
    points: scoreOrderSubmission(ans.answer, correctOrder, points),
  }))
  return applyPhoneScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
}
