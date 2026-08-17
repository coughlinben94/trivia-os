import { describe, it, expect } from 'vitest'
import { scoreMatchingSubmission, seededShuffle, computeMatchingScoreUpdates, buildMatchAnswer } from './matchingScoring.js'

describe('scoreMatchingSubmission', () => {
  it('scores zero for no pairs', () => {
    expect(scoreMatchingSubmission([], 2)).toBe(0)
  })
  it('scores zero for a null/undefined answer', () => {
    expect(scoreMatchingSubmission(null, 2)).toBe(0)
    expect(scoreMatchingSubmission(undefined, 2)).toBe(0)
  })
  it('counts only pairs where leftId matches rightId', () => {
    const answer = [
      { leftId: 'p1', rightId: 'p1' }, // correct
      { leftId: 'p2', rightId: 'p3' }, // wrong
      { leftId: 'p4', rightId: 'p4' }, // correct
    ]
    expect(scoreMatchingSubmission(answer, 2)).toBe(4)
  })
  it('gives partial credit for a partial submission', () => {
    expect(scoreMatchingSubmission([{ leftId: 'p1', rightId: 'p1' }], 3)).toBe(3)
  })
  it('ignores malformed entries rather than throwing', () => {
    const answer = [{ leftId: 'p1' }, { rightId: 'p2' }, null, {}]
    expect(scoreMatchingSubmission(answer, 5)).toBe(0)
  })
})

describe('seededShuffle', () => {
  const items = [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }, { id: 'p3' }]

  it('is a permutation — same elements, same length', () => {
    const shuffled = seededShuffle(items, 'slide_abc')
    expect(shuffled).toHaveLength(items.length)
    expect(shuffled.map(i => i.id).sort()).toEqual(items.map(i => i.id).sort())
  })
  it('is deterministic — same seed always gives the same order', () => {
    const a = seededShuffle(items, 'slide_abc').map(i => i.id)
    const b = seededShuffle(items, 'slide_abc').map(i => i.id)
    expect(a).toEqual(b)
  })
  it('is not just a mirror of the input for a 2-item case', () => {
    // The bug this replaces: sort().reverse() on 2 alphabetically-adjacent
    // ids always produces the exact reverse — solvable without reading it.
    // A real seeded shuffle should NOT reliably do that across many seeds.
    const twoItems = [{ id: 'p0' }, { id: 'p1' }]
    const mirrors = Array.from({ length: 20 }, (_, i) =>
      seededShuffle(twoItems, `slide_${i}`).map(x => x.id).join(',') === 'p1,p0'
    )
    expect(mirrors.some(m => !m)).toBe(true)
  })
  it('does not mutate the input array', () => {
    const copy = [...items]
    seededShuffle(items, 'seed')
    expect(items).toEqual(copy)
  })
})

describe('computeMatchingScoreUpdates', () => {
  const teams = [{ id: 'team_1', name: 'The Quizzlers' }]
  const scoreboardTeams = [
    { id: 'sb_1', show_id: 'show_1', name: '  the quizzlers  ', scores: { r_1: { written: 5, phone: 0 } }, sort_order: 0 },
  ]

  it('matches a team by case-insensitive, trimmed name and preserves the written half', () => {
    const answers = [{ team_id: 'team_1', answer: [{ leftId: 'p1', rightId: 'p1' }] }]
    const updates = computeMatchingScoreUpdates({ answers, teams, scoreboardTeams, roundKey: 'r_1', pointsPerMatch: 2, slideId: 'slide_matching' })
    expect(updates).toEqual([
      { id: 'sb_1', show_id: 'show_1', name: '  the quizzlers  ', scores: { r_1: { written: 5, phone: { slide_matching: 2 } } }, sort_order: 0 },
    ])
  })

  it('skips an answer whose team_id has no live team registration', () => {
    const answers = [{ team_id: 'ghost_team', answer: [{ leftId: 'p1', rightId: 'p1' }] }]
    expect(computeMatchingScoreUpdates({ answers, teams, scoreboardTeams, roundKey: 'r_1', pointsPerMatch: 2, slideId: 'slide_matching' })).toEqual([])
  })

  it('skips a team with no matching scoreboard_teams row', () => {
    const answers = [{ team_id: 'team_1', answer: [{ leftId: 'p1', rightId: 'p1' }] }]
    expect(computeMatchingScoreUpdates({ answers, teams, scoreboardTeams: [], roundKey: 'r_1', pointsPerMatch: 2, slideId: 'slide_matching' })).toEqual([])
  })

  it('does not disturb other rounds already on the scoreboard row', () => {
    const sbWithOtherRound = [{ ...scoreboardTeams[0], scores: { r_0: 10, r_1: { written: 5, phone: 0 } } }]
    const answers = [{ team_id: 'team_1', answer: [{ leftId: 'p1', rightId: 'p1' }] }]
    const [update] = computeMatchingScoreUpdates({ answers, teams, scoreboardTeams: sbWithOtherRound, roundKey: 'r_1', pointsPerMatch: 2, slideId: 'slide_matching' })
    expect(update.scores.r_0).toBe(10)
  })

  it('adds to, rather than overwrites, a different phone-scored slide already in the round', () => {
    const sbWithWager = [{ ...scoreboardTeams[0], scores: { r_1: { written: 5, phone: { slide_wager: 20 } } } }]
    const answers = [{ team_id: 'team_1', answer: [{ leftId: 'p1', rightId: 'p1' }] }]
    const [update] = computeMatchingScoreUpdates({ answers, teams, scoreboardTeams: sbWithWager, roundKey: 'r_1', pointsPerMatch: 2, slideId: 'slide_matching' })
    expect(update.scores.r_1).toEqual({ written: 5, phone: { slide_wager: 20, slide_matching: 2 } })
  })

  it('dedupes by id instead of crashing when two scoreboard rows collide on the same normalized name', () => {
    // Same data-entry accident as computeWagerScoreUpdates: two live teams
    // normalize to one scoreboard_teams row's name, so .find() resolves both
    // onto the same sbTeam.id — must not produce a duplicate-id upsert.
    const collidingTeams = [
      { id: 'team_1', name: 'The Quizzlers' },
      { id: 'team_2', name: '  THE QUIZZLERS  ' },
    ]
    const collidingScoreboard = [
      { id: 'sb_1', show_id: 'show_1', name: 'the quizzlers', scores: {}, sort_order: 0 },
    ]
    const answers = [
      { team_id: 'team_1', answer: [{ leftId: 'p1', rightId: 'p1' }] },
      { team_id: 'team_2', answer: [] },
    ]
    const updates = computeMatchingScoreUpdates({ answers, teams: collidingTeams, scoreboardTeams: collidingScoreboard, roundKey: 'r_1', pointsPerMatch: 2, slideId: 'slide_matching' })
    expect(updates).toHaveLength(1)
    const ids = updates.map(u => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('buildMatchAnswer', () => {
  // Bug this guards against: a left and right item can share the same raw
  // id (pairs.map(p => p.id) on both sides), so connections MUST be keyed
  // by side — a wrong match (left:p0 with right:p1) must never collapse
  // into a same-id pair that scores as correct.
  it('pairs a correct match — left and right tapped with the same color', () => {
    const connections = { 'left:p0': 0, 'right:p0': 0 }
    expect(buildMatchAnswer(connections)).toEqual([{ leftId: 'p0', rightId: 'p0' }])
  })

  it('a wrong match stays a wrong match — does not collapse to leftId === rightId', () => {
    const connections = { 'left:p0': 0, 'right:p1': 0 }
    const [pair] = buildMatchAnswer(connections)
    expect(pair.leftId).toBe('p0')
    expect(pair.rightId).toBe('p1')
    expect(pair.leftId).not.toBe(pair.rightId)
  })

  it('handles multiple pairs by color, correct and wrong mixed', () => {
    const connections = { 'left:p0': 0, 'right:p0': 0, 'left:p1': 1, 'right:p2': 1 }
    const answer = buildMatchAnswer(connections)
    expect(answer).toHaveLength(2)
    expect(answer).toContainEqual({ leftId: 'p0', rightId: 'p0' })
    expect(answer).toContainEqual({ leftId: 'p1', rightId: 'p2' })
  })

  it('omits an incomplete pair — only one side tapped for that color', () => {
    const connections = { 'left:p0': 0 }
    expect(buildMatchAnswer(connections)).toEqual([])
  })

  it('returns empty for no connections', () => {
    expect(buildMatchAnswer({})).toEqual([])
  })
})
