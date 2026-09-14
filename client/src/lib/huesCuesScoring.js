import { chebyshevDistance, codeToColRow, colRowToCode } from './huesCuesGrid.js'
import { normalizeRoundScore } from './scoreboardMath.js'

// Absolute scoring, not room-relative like wager — every team is scored only
// against the true answer, never against each other. No ties to resolve.
export function scoreHuesCuesRound({ entries, correctAnswer }) {
  const correct = codeToColRow(correctAnswer)
  return (entries ?? []).map(e => {
    const guess = e.guess
    const validGuess = guess && typeof guess.col === 'string' && Number.isInteger(guess.row)
    if (!correct || !validGuess) {
      return { teamId: e.teamId, teamName: e.teamName ?? null, guess: null, distance: null, points: 0 }
    }
    const distance = chebyshevDistance(guess, correct)
    const points = distance === 0 ? 20 : distance === 1 ? 10 : 0
    return { teamId: e.teamId, teamName: e.teamName ?? null, guess: colRowToCode(guess), distance, points }
  })
}

// Same fold-in shape as computeWagerScoreUpdates/computeChoiceScoreUpdates:
// writes only this slide's entry into the round's phoneBySlide bucket,
// preserving every other phone-scored slide already in the round.
// Idempotent — re-running for the same slideId overwrites just that entry.
export function computeHuesCuesScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId }) {
  const teamIdToName = new Map((teams ?? []).map(t => [t.id, t.name.trim().toLowerCase()]))
  const updates = []
  for (const r of results ?? []) {
    const teamName = teamIdToName.get(r.teamId)
    if (!teamName) continue // no live registration — nothing to attribute this to
    const sbTeam = (scoreboardTeams ?? []).find(t => t.name.trim().toLowerCase() === teamName)
    if (!sbTeam) continue // host hasn't added this team to the admin scoreboard yet
    const prevSplit = normalizeRoundScore(sbTeam.scores?.[roundKey])
    const nextPhone = { ...prevSplit.phoneBySlide, [slideId]: r.points }
    const nextScores = { ...sbTeam.scores, [roundKey]: { written: prevSplit.written, phone: nextPhone } }
    updates.push({ id: sbTeam.id, show_id: sbTeam.show_id, name: sbTeam.name, scores: nextScores, sort_order: sbTeam.sort_order })
  }
  // Dedupe by scoreboard team id (last write wins) — guards against a
  // host data-entry accident (two rows normalizing to the same name)
  // making the upsert's ON CONFLICT fail and scoring nothing for the round.
  return [...new Map(updates.map(u => [u.id, u])).values()]
}
