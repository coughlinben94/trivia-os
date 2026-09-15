import { normalizeRoundScore } from './scoreboardMath.js'

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

// Pure fold-in, identical shape to computeChoiceScoreUpdates — see
// choiceScoring.js for the full reasoning (case-insensitive name matching,
// phoneBySlide additive merge, dedupe-by-id guard).
export function computeHorseRaceScoreUpdates({ answers, teams, scoreboardTeams, roundKey, points, correctAnswer, slideId }) {
  const teamIdToName = new Map((teams ?? []).map(t => [t.id, t.name.trim().toLowerCase()]))
  const updates = []
  for (const ans of answers ?? []) {
    const teamName = teamIdToName.get(ans.team_id)
    if (!teamName) continue
    const sbTeam = (scoreboardTeams ?? []).find(t => t.name.trim().toLowerCase() === teamName)
    if (!sbTeam) continue
    const score = scoreHorseRacePick(ans.answer, correctAnswer, points)
    const prevSplit = normalizeRoundScore(sbTeam.scores?.[roundKey])
    const nextPhone = { ...prevSplit.phoneBySlide, [slideId]: score }
    const nextScores = { ...sbTeam.scores, [roundKey]: { written: prevSplit.written, phone: nextPhone } }
    updates.push({ id: sbTeam.id, show_id: sbTeam.show_id, name: sbTeam.name, scores: nextScores, sort_order: sbTeam.sort_order })
  }
  return [...new Map(updates.map(u => [u.id, u])).values()]
}
