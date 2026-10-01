import { applyPhoneScoreUpdates } from './scoreboardMath.js'

// The Drop: every team gets `total` points to split across the options on
// their phone. Points left on the correct option are the team's score for the
// question; points on any other option are lost. The submission must place
// every point (the phone enforces it; scoring re-checks, since phone_answers
// is client-written).
export const DEFAULT_DROP_TOTAL = 30

// One tap on the phone moves this many points. 5 when it divides the total
// (a 30-point pool is exactly 6 taps), else 1 so any total stays reachable.
export function dropChip(total) {
  return total % 5 === 0 ? 5 : 1
}

// A usable option has text or a photo — same blank filter as ChoiceBoard.
export function dropOptions(data) {
  return (data?.options ?? []).filter(o => o.label?.trim() || o.image)
}

// answer is { [optionId]: wholeNumber }. Missing ids count as 0; unknown ids,
// negatives, fractions, arrays and a wrong sum all invalidate it.
export function isValidAlloc(alloc, optionIds, total) {
  if (!alloc || typeof alloc !== 'object' || Array.isArray(alloc)) return false
  let sum = 0
  for (const [id, n] of Object.entries(alloc)) {
    if (!optionIds.includes(id)) return false
    if (!Number.isInteger(n) || n < 0) return false
    sum += n
  }
  return sum === total
}

export function scoreDropSubmission(alloc, correctId, optionIds, total) {
  if (!correctId || !optionIds.includes(correctId)) return 0
  if (!isValidAlloc(alloc, optionIds, total)) return 0
  return alloc[correctId] ?? 0
}

// The tiles that fall off the TV, in order: authored option order, correct
// tile skipped. With no correct tile set every tile is a candidate.
export function dropSequence(data) {
  return dropOptions(data).map(o => o.id).filter(id => id !== data?.correctId)
}

export function dropStepCount(data) {
  return dropSequence(data).length
}

// Aggregate shown on the TV and nothing else: points the room put on each
// tile, how many valid teams went all-in on the correct one. Never per-team.
export function summarizeDrop(answers, optionIds, correctId, total) {
  const totals = Object.fromEntries(optionIds.map(id => [id, 0]))
  let allIn = 0
  let teams = 0
  for (const ans of answers ?? []) {
    if (!isValidAlloc(ans.answer, optionIds, total)) continue
    teams += 1
    for (const id of optionIds) totals[id] += ans.answer[id] ?? 0
    if (correctId && ans.answer[correctId] === total) allIn += 1
  }
  return { totals, allIn, teams }
}

// Scores every REGISTERED team (a team that never submitted is a real 0, not
// a skip) and folds the result into the scoreboard — see
// applyPhoneScoreUpdates for the name matching and phoneBySlide merge.
export function computeDropScoreUpdates({ answers, teams, scoreboardTeams, roundKey, correctId, optionIds, total, slideId }) {
  const byTeam = new Map((answers ?? []).map(a => [a.team_id, a.answer]))
  const results = (teams ?? []).map(t => ({
    teamId: t.id,
    points: scoreDropSubmission(byTeam.get(t.id), correctId, optionIds, total),
  }))
  return applyPhoneScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
}
