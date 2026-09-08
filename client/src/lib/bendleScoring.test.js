import { describe, it, expect } from 'vitest'
import {
  BENDLE_TIERS, matchesBendleAnswer, resolveBendleTier,
  scoreBendleRound, computeBendleScoreUpdates,
  ROUND_LENGTH_SECONDS, clampBendleOffset,
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
    expect(results[0]).toMatchObject({ teamId: 't1', correct: true, tierId: 'drums', points: tiers[0].points })
  })

  // Earlier layers must pay strictly more, or the format trains everyone to
  // wait for vocals. (2026-09-08, Ben retuned 30/15/10 -> 20/15/10 — the
  // stricter "steep cliff always beats waiting at any confidence" property
  // this test used to assert no longer strictly holds at every confidence
  // level; his call, see bendleScoring.js's BENDLE_TIERS comment. Monotonic
  // decline is the invariant that still has to hold.)
  it('pays out strictly less at each later tier', () => {
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].points).toBeLessThan(tiers[i - 1].points)
    }
  })

  // House rule, not a Bendle preference (Ben: "all shiny step questions will
  // always be 3 steps"). Also guards the half of the contract that lives in
  // ShinyBendleQuestion: it fades in each tier's `stems` on the transport, so
  // every SCHEDULED stem must be a real bendle_songs column and must appear
  // exactly once — a typo or a duplicate would silently drop a layer from
  // playback or double-fade one, neither of which shows up as a test failure
  // anywhere else. `vocals` is deliberately absent — it plays only at reveal
  // (see BendleReveal), never scheduled into an in-round tier.
  it('is exactly three steps covering drums/bass/other once each, never vocals', () => {
    expect(BENDLE_TIERS).toHaveLength(3)
    const stems = BENDLE_TIERS.flatMap(t => t.stems)
    expect([...stems].sort()).toEqual(['bass', 'drums', 'other'])
    expect(BENDLE_TIERS.map(t => t.atSeconds)).toEqual([0, 20, 40])
  })

  it('awards fewer points to a correct later guess', () => {
    const results = scoreBendleRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: 'Hey Jude', elapsedSeconds: 45 }],
      song,
    })
    expect(results[0]).toMatchObject({ tierId: 'full', points: tiers[2].points })
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

it('ROUND_LENGTH_SECONDS is 20s past the last tier', () => {
  expect(ROUND_LENGTH_SECONDS).toBe(60)
})

describe('clampBendleOffset', () => {
  it('passes through an offset that leaves a full round of runway', () => {
    expect(clampBendleOffset(30, 200)).toBe(30)
  })

  it('clamps an offset that would run past the end of the stem', () => {
    // duration 100, round needs 60 -> latest legal offset is 40
    expect(clampBendleOffset(90, 100)).toBe(40)
  })

  it('never goes negative', () => {
    expect(clampBendleOffset(-5, 200)).toBe(0)
  })

  it('collapses to 0 when the stem is shorter than one round', () => {
    expect(clampBendleOffset(10, 45)).toBe(0)
  })

  it('treats a missing offset as 0', () => {
    expect(clampBendleOffset(undefined, 200)).toBe(0)
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
