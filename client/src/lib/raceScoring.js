import { applyPhoneScoreUpdates } from './scoreboardMath.js'

// Host-set default for a horse-race pick (same shape as
// DEFAULT_CHOICE_POINTS) — flat correct/incorrect, no partial credit for
// "close" since a race only has one winner.
export const DEFAULT_RACE_POINTS = 10

// The winner is never a second typed field here — `data.answer` is already
// the derived winner name RaceEditor recomputes from contenders+beats via
// raceMath's computeWinner on every edit (see RaceEditor's own comment,
// SlideEditor.jsx), the exact same source the TV race animation itself
// reads. Scoring against it directly means the phone pick, the TV race, and
// the scoreboard can never disagree about who won.
export function scoreHorseRacePick(answer, correctAnswer, points) {
  if (!answer || !correctAnswer) return 0
  return answer === correctAnswer ? (Number(points) || 0) : 0
}

// Pure fold-in, identical shape to computeChoiceScoreUpdates — the shared
// applyPhoneScoreUpdates does the name matching, phoneBySlide merge and dedupe
// (see scoreboardMath.js).
export function computeHorseRaceScoreUpdates({ answers, teams, scoreboardTeams, roundKey, points, correctAnswer, slideId }) {
  const results = (answers ?? []).map(ans => ({
    teamId: ans.team_id,
    points: scoreHorseRacePick(ans.answer, correctAnswer, points),
  }))
  return applyPhoneScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
}
