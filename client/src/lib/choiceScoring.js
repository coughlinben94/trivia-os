import { applyPhoneScoreUpdates, scoreAllOrNothing } from './scoreboardMath.js'

// Host-set default for a fresh Choice format/slide (shiny_formats.input_schema's
// pointsForChoice, and SlideEditor/LiveMode's per-slide fallback) — one shared
// constant instead of a literal duplicated in both places.
export const DEFAULT_CHOICE_POINTS = 10

// A Choice submission is a set — order doesn't matter, only which ids were
// picked. Correct means the exact same set as correctIds, no more, no fewer.
// No partial credit (Ben's call, 2026-09-06): any extra or missing id fails
// the whole submission, same all-or-nothing rule as Order/Matching.
export function scoreChoiceSubmission(answer, correctIds, points) {
  return scoreAllOrNothing(answer, correctIds, points, (ans, key) => {
    const sortedAnswer = [...ans].sort()
    const sortedCorrect = [...key].sort()
    return sortedAnswer.every((id, i) => id === sortedCorrect[i])
  })
}

// Pure fold-in: given phone_answers + live team registrations + the admin
// scoreboard, compute the scoreboard_teams rows to upsert. Identical shape to
// computeOrderScoreUpdates/computeMatchingScoreUpdates — see orderScoring.js
// for the full reasoning (case-insensitive name matching, phoneBySlide
// additive merge, dedupe-by-id guard against colliding scoreboard rows).
export function computeChoiceScoreUpdates({ answers, teams, scoreboardTeams, roundKey, points, correctIds, slideId }) {
  const results = (answers ?? []).map(ans => ({
    teamId: ans.team_id,
    points: scoreChoiceSubmission(ans.answer, correctIds, points),
  }))
  return applyPhoneScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
}
