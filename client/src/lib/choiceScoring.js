import { normalizeRoundScore } from './scoreboardMath.js'

// Host-set default for a fresh Choice format/slide (shiny_formats.input_schema's
// pointsForChoice, and SlideEditor/LiveMode's per-slide fallback) — one shared
// constant instead of a literal duplicated in both places.
export const DEFAULT_CHOICE_POINTS = 10

// A Choice submission is a set — order doesn't matter, only which ids were
// picked. Correct means the exact same set as correctIds, no more, no fewer.
// No partial credit (Ben's call, 2026-09-06): any extra or missing id fails
// the whole submission, same all-or-nothing rule as Order/Matching.
export function scoreChoiceSubmission(answer, correctIds, points) {
  if (!Array.isArray(answer)) return 0
  if (!Array.isArray(correctIds)) return 0
  // An empty answer key can never be "correct" — mirrors orderScoring's
  // guard: without it, two empty arrays compare vacuously equal and would
  // score full points for a question nobody ever set an answer key on.
  if (correctIds.length === 0) return 0
  if (answer.length !== correctIds.length) return 0
  const sortedAnswer = [...answer].sort()
  const sortedCorrect = [...correctIds].sort()
  if (sortedAnswer.every((id, i) => id === sortedCorrect[i])) return Number(points) || 0
  return 0
}

// Pure fold-in: given phone_answers + live team registrations + the admin
// scoreboard, compute the scoreboard_teams rows to upsert. Identical shape to
// computeOrderScoreUpdates/computeMatchingScoreUpdates — see orderScoring.js
// for the full reasoning (case-insensitive name matching, phoneBySlide
// additive merge, dedupe-by-id guard against colliding scoreboard rows).
export function computeChoiceScoreUpdates({ answers, teams, scoreboardTeams, roundKey, points, correctIds, slideId }) {
  const teamIdToName = new Map((teams ?? []).map(t => [t.id, t.name.trim().toLowerCase()]))
  const updates = []
  for (const ans of answers ?? []) {
    const teamName = teamIdToName.get(ans.team_id)
    if (!teamName) continue
    const sbTeam = (scoreboardTeams ?? []).find(t => t.name.trim().toLowerCase() === teamName)
    if (!sbTeam) continue
    const score = scoreChoiceSubmission(ans.answer, correctIds, points)
    const prevSplit = normalizeRoundScore(sbTeam.scores?.[roundKey])
    const nextPhone = { ...prevSplit.phoneBySlide, [slideId]: score }
    const nextScores = { ...sbTeam.scores, [roundKey]: { written: prevSplit.written, phone: nextPhone } }
    updates.push({ id: sbTeam.id, show_id: sbTeam.show_id, name: sbTeam.name, scores: nextScores, sort_order: sbTeam.sort_order })
  }
  return [...new Map(updates.map(u => [u.id, u])).values()]
}
