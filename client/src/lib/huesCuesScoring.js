import { chebyshevDistance, codeToColRow, colRowToCode } from './huesCuesGrid.js'
import { applyPhoneScoreUpdates } from './scoreboardMath.js'

// Absolute scoring, not room-relative like wager — every team is scored only
// against the true answer, never against each other. No ties to resolve.
//
// Sorted before returning — points descending, then distance ascending (a
// team with distance: null, i.e. no guess, sorts last) — so the reveal cascades
// in the order the host would actually read it out loud, same idea as
// scoreWagerRound's own closest-first sort (wagerScoring.js).
export function scoreHuesCuesRound({ entries, correctAnswer }) {
  const correct = codeToColRow(correctAnswer)
  const results = (entries ?? []).map(e => {
    const guess = e.guess
    const validGuess = guess && typeof guess.col === 'string' && Number.isInteger(guess.row)
    if (!correct || !validGuess) {
      return { teamId: e.teamId, teamName: e.teamName ?? null, guess: null, distance: null, points: 0 }
    }
    const distance = chebyshevDistance(guess, correct)
    const points = distance === 0 ? 20 : distance === 1 ? 10 : 0
    return { teamId: e.teamId, teamName: e.teamName ?? null, guess: colRowToCode(guess), distance, points }
  })
  return results.sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points
    if (a.distance == null) return b.distance == null ? 0 : 1
    if (b.distance == null) return -1
    return a.distance - b.distance
  })
}

// Same fold-in shape as computeWagerScoreUpdates/computeChoiceScoreUpdates:
// writes only this slide's entry into the round's phoneBySlide bucket,
// preserving every other phone-scored slide already in the round.
// Idempotent — re-running for the same slideId overwrites just that entry.
export function computeHuesCuesScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId }) {
  return applyPhoneScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
}
