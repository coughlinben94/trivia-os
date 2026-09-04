import { describe, it, expect } from 'vitest'
import {
  BENDLE_TIERS, matchesBendleAnswer, resolveBendleTier,
  scoreBendleRound, computeBendleScoreUpdates,
} from './bendleScoring.js'

describe('matchesBendleAnswer', () => {
  it('matches the canonical answer case-insensitively', () => {
    expect(matchesBendleAnswer('bohemian rhapsody', 'Bohemian Rhapsody', [])).toBe(true)
  })
  it('matches an alias', () => {
    expect(matchesBendleAnswer('sweet child o\' mine', 'Sweet Child o\' Mine', ["sweet child o' mine", 'sweet child of mine'])).toBe(true)
  })
  it('trims whitespace before comparing', () => {
    expect(matchesBendleAnswer('  Hey Jude  ', 'Hey Jude', [])).toBe(true)
  })
  it('rejects a non-match', () => {
    expect(matchesBendleAnswer('yesterday', 'Hey Jude', [])).toBe(false)
  })
  it('rejects an empty guess', () => {
    expect(matchesBendleAnswer('', 'Hey Jude', [])).toBe(false)
  })
  it('rejects a null guess', () => {
    expect(matchesBendleAnswer(null, 'Hey Jude', [])).toBe(false)
  })
})

describe('resolveBendleTier', () => {
  const tiers = [
    { id: 'drums', label: 'Drums Only', atSeconds: 0, points: 40 },
    { id: 'bass', label: '+ Bass', atSeconds: 20, points: 30 },
    { id: 'other', label: '+ Everything Else', atSeconds: 40, points: 20 },
    { id: 'vocals', label: '+ Vocals', atSeconds: 60, points: 10 },
  ]
  it('returns the drums tier for elapsed=0', () => {
    expect(resolveBendleTier(0, tiers).id).toBe('drums')
  })
  it('returns the drums tier just before the bass boundary', () => {
    expect(resolveBendleTier(19.9, tiers).id).toBe('drums')
  })
  it('returns the bass tier exactly at its boundary', () => {
    expect(resolveBendleTier(20, tiers).id).toBe('bass')
  })
  it('returns the vocals tier for elapsed past the last boundary', () => {
    expect(resolveBendleTier(500, tiers).id).toBe('vocals')
  })
  it('returns the drums tier for negative elapsed (defensive)', () => {
    expect(resolveBendleTier(-5, tiers).id).toBe('drums')
  })
})

describe('scoreBendleRound', () => {
  const song = { answer: 'Hey Jude', aliases: [] }
  const tiers = BENDLE_TIERS

  it('awards the drums-tier points to a correct early guess', () => {
    const results = scoreBendleRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: 'Hey Jude', elapsedSeconds: 5 }],
      song,
    })
    expect(results[0]).toMatchObject({ teamId: 't1', correct: true, tierId: 'drums', points: 40 })
  })

  it('awards fewer points to a correct later guess', () => {
    const results = scoreBendleRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: 'Hey Jude', elapsedSeconds: 45 }],
      song,
    })
    expect(results[0]).toMatchObject({ tierId: 'other', points: 20 })
  })

  it('awards zero points to a wrong guess regardless of timing', () => {
    const results = scoreBendleRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: 'Yesterday', elapsedSeconds: 5 }],
      song,
    })
    expect(results[0]).toMatchObject({ correct: false, tierId: null, points: 0 })
  })

  it('awards zero points to a team that never guessed', () => {
    const results = scoreBendleRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: null, elapsedSeconds: null }],
      song,
    })
    expect(results[0]).toMatchObject({ correct: false, tierId: null, points: 0 })
  })

  it('matches an alias for full credit', () => {
    const aliasSong = { answer: 'Sweet Child o\' Mine', aliases: ['sweet child of mine'] }
    const results = scoreBendleRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: 'sweet child of mine', elapsedSeconds: 5 }],
      song: aliasSong,
    })
    expect(results[0].correct).toBe(true)
  })

  it('sorts correct-and-earliest first', () => {
    const results = scoreBendleRound({
      entries: [
        { teamId: 't1', teamName: 'Late', guess: 'Hey Jude', elapsedSeconds: 55 },
        { teamId: 't2', teamName: 'Early', guess: 'Hey Jude', elapsedSeconds: 2 },
        { teamId: 't3', teamName: 'Wrong', guess: 'Nope', elapsedSeconds: 1 },
      ],
      song,
    })
    expect(results.map(r => r.teamId)).toEqual(['t2', 't1', 't3'])
  })
})

describe('computeBendleScoreUpdates', () => {
  it('folds points into the round key, preserving other phone-scored slides in the same round', () => {
    const results = [{ teamId: 'team-1', teamName: 'Alpha', points: 40, correct: true, tierId: 'drums', guess: 'Hey Jude' }]
    const teams = [{ id: 'team-1', name: 'Alpha' }]
    const scoreboardTeams = [{
      id: 'sb-1', show_id: 'show-1', name: 'Alpha', sort_order: 0,
      scores: { r1: { written: 10, phone: { 'other-slide': 20 } } },
    }]
    const updates = computeBendleScoreUpdates({
      results, teams, scoreboardTeams, roundKey: 'r1', slideId: 'bendle-slide',
    })
    expect(updates).toHaveLength(1)
    expect(updates[0].scores.r1.phone).toEqual({ 'other-slide': 20, 'bendle-slide': 40 })
    expect(updates[0].scores.r1.written).toBe(10)
  })

  it('skips a result with no live team registration', () => {
    const results = [{ teamId: 'ghost', teamName: 'Ghost', points: 40, correct: true, tierId: 'drums', guess: 'x' }]
    const updates = computeBendleScoreUpdates({ results, teams: [], scoreboardTeams: [], roundKey: 'r1', slideId: 's1' })
    expect(updates).toEqual([])
  })
})
