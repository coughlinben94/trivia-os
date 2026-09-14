import { describe, it, expect } from 'vitest'
import { scoreHuesCuesRound, computeHuesCuesScoreUpdates } from './huesCuesScoring.js'

describe('scoreHuesCuesRound', () => {
  const correctAnswer = 'H8'

  it('scores an exact match 20 points', () => {
    const results = scoreHuesCuesRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: { col: 'H', row: 8 } }],
      correctAnswer,
    })
    expect(results[0]).toMatchObject({ teamId: 't1', distance: 0, points: 20 })
  })

  it('scores each of the 8 adjacent squares 10 points', () => {
    const neighbors = [
      { col: 'G', row: 7 }, { col: 'H', row: 7 }, { col: 'I', row: 7 },
      { col: 'G', row: 8 },                        { col: 'I', row: 8 },
      { col: 'G', row: 9 }, { col: 'H', row: 9 }, { col: 'I', row: 9 },
    ]
    const entries = neighbors.map((guess, i) => ({ teamId: `t${i}`, teamName: `Team ${i}`, guess }))
    const results = scoreHuesCuesRound({ entries, correctAnswer })
    for (const r of results) {
      expect(r.distance).toBe(1)
      expect(r.points).toBe(10)
    }
  })

  it('scores distance 2+ as 0 points', () => {
    const results = scoreHuesCuesRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: { col: 'J', row: 8 } }],
      correctAnswer,
    })
    expect(results[0]).toMatchObject({ distance: 2, points: 0 })
  })

  it('a corner-square answer still scores its real neighbors at 10, no special case', () => {
    const results = scoreHuesCuesRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: { col: 'B', row: 2 } }],
      correctAnswer: 'A1',
    })
    expect(results[0]).toMatchObject({ distance: 1, points: 10 })
  })

  it('a team with no guess scores 0, not thrown out', () => {
    const results = scoreHuesCuesRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: null }],
      correctAnswer,
    })
    expect(results[0]).toMatchObject({ teamId: 't1', distance: null, points: 0 })
  })

  it('a malformed correctAnswer scores every entry 0 rather than throwing', () => {
    const results = scoreHuesCuesRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: { col: 'H', row: 8 } }],
      correctAnswer: 'not-a-code',
    })
    expect(results[0]).toMatchObject({ points: 0 })
  })
})

describe('computeHuesCuesScoreUpdates', () => {
  const teams = [{ id: 'team-1', name: 'Alpha ' }] // trailing space — case/whitespace insensitive match
  const scoreboardTeams = [
    { id: 'sb-1', show_id: 'show-1', name: 'alpha', scores: {}, sort_order: 0 },
  ]

  it('folds points into scoreboard_teams.scores[roundKey].phoneBySlide[slideId]', () => {
    const results = [{ teamId: 'team-1', teamName: 'Alpha', guess: 'H8', distance: 0, points: 20 }]
    const updates = computeHuesCuesScoreUpdates({
      results, teams, scoreboardTeams, roundKey: 'r_round1', slideId: 'slide-1',
    })
    expect(updates).toHaveLength(1)
    expect(updates[0].scores.r_round1.phone.phoneBySlide?.['slide-1']).toBeUndefined() // scores stores the raw shape, not normalized
    expect(updates[0].scores.r_round1.phone['slide-1']).toBe(20)
  })

  it('skips a result with no live team registration', () => {
    const results = [{ teamId: 'ghost-team', teamName: 'Ghost', guess: 'H8', distance: 0, points: 20 }]
    const updates = computeHuesCuesScoreUpdates({
      results, teams, scoreboardTeams, roundKey: 'r_round1', slideId: 'slide-1',
    })
    expect(updates).toHaveLength(0)
  })

  it('skips a result whose team has no scoreboard row yet', () => {
    const results = [{ teamId: 'team-1', teamName: 'Alpha', guess: 'H8', distance: 0, points: 20 }]
    const updates = computeHuesCuesScoreUpdates({
      results, teams, scoreboardTeams: [], roundKey: 'r_round1', slideId: 'slide-1',
    })
    expect(updates).toHaveLength(0)
  })

  it('re-scoring the same slideId overwrites just that entry, additive with other phone slides', () => {
    const scoreboardWithPriorSlide = [
      { id: 'sb-1', show_id: 'show-1', name: 'alpha', scores: { r_round1: { written: 5, phone: { 'other-slide': 10 } } }, sort_order: 0 },
    ]
    const results = [{ teamId: 'team-1', teamName: 'Alpha', guess: 'H8', distance: 0, points: 20 }]
    const updates = computeHuesCuesScoreUpdates({
      results, teams, scoreboardTeams: scoreboardWithPriorSlide, roundKey: 'r_round1', slideId: 'slide-1',
    })
    expect(updates[0].scores.r_round1.written).toBe(5)
    expect(updates[0].scores.r_round1.phone['other-slide']).toBe(10)
    expect(updates[0].scores.r_round1.phone['slide-1']).toBe(20)
  })

  it('dedupes by scoreboard team id when two rows normalize to the same name', () => {
    const dupScoreboard = [
      { id: 'sb-1', show_id: 'show-1', name: 'Alpha', scores: {}, sort_order: 0 },
      { id: 'sb-1', show_id: 'show-1', name: 'alpha', scores: {}, sort_order: 0 }, // same id, data-entry accident
    ]
    const results = [{ teamId: 'team-1', teamName: 'Alpha', guess: 'H8', distance: 0, points: 20 }]
    const updates = computeHuesCuesScoreUpdates({
      results, teams, scoreboardTeams: dupScoreboard, roundKey: 'r_round1', slideId: 'slide-1',
    })
    expect(updates).toHaveLength(1)
  })
})
