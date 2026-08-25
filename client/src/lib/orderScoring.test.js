import { describe, it, expect } from 'vitest'
import { scoreOrderSubmission, seededShuffle, computeOrderScoreUpdates } from './orderScoring.js'

describe('scoreOrderSubmission', () => {
  it('scores full points for a correct order match', () => {
    const answer = ['p1', 'p2', 'p3']
    const correctOrder = ['p1', 'p2', 'p3']
    expect(scoreOrderSubmission(answer, correctOrder, 10)).toBe(10)
  })

  it('scores zero if one item is in the wrong position', () => {
    const answer = ['p1', 'p3', 'p2']
    const correctOrder = ['p1', 'p2', 'p3']
    expect(scoreOrderSubmission(answer, correctOrder, 10)).toBe(0)
  })

  it('scores zero if the answer array is shorter than correctOrder', () => {
    const answer = ['p1', 'p2']
    const correctOrder = ['p1', 'p2', 'p3']
    expect(scoreOrderSubmission(answer, correctOrder, 10)).toBe(0)
  })

  it('scores zero if the answer array is longer than correctOrder', () => {
    const answer = ['p1', 'p2', 'p3', 'p4']
    const correctOrder = ['p1', 'p2', 'p3']
    expect(scoreOrderSubmission(answer, correctOrder, 10)).toBe(0)
  })

  it('scores zero for an empty answer array', () => {
    const answer = []
    const correctOrder = ['p1', 'p2', 'p3']
    expect(scoreOrderSubmission(answer, correctOrder, 10)).toBe(0)
  })

  it('scores zero when correctOrder is empty, even against an empty answer', () => {
    // An empty answer key can never be "correct" — without an explicit
    // guard, [].every(...) on two empty arrays is vacuously true and would
    // score full points for a question that never got an answer key set
    // (2026-08-25 review finding).
    expect(scoreOrderSubmission([], [], 10)).toBe(0)
    expect(scoreOrderSubmission(['p1'], [], 10)).toBe(0)
  })

  it('scores zero for a null answer', () => {
    expect(scoreOrderSubmission(null, ['p1', 'p2'], 10)).toBe(0)
  })

  it('scores zero for an undefined answer', () => {
    expect(scoreOrderSubmission(undefined, ['p1', 'p2'], 10)).toBe(0)
  })

  it('scores zero if not an array', () => {
    expect(scoreOrderSubmission('p1,p2,p3', ['p1', 'p2', 'p3'], 10)).toBe(0)
    expect(scoreOrderSubmission({ 0: 'p1', 1: 'p2', 2: 'p3' }, ['p1', 'p2', 'p3'], 10)).toBe(0)
  })

  it('handles non-numeric points by coercing to number', () => {
    const answer = ['p1', 'p2']
    const correctOrder = ['p1', 'p2']
    expect(scoreOrderSubmission(answer, correctOrder, '5')).toBe(5)
    expect(scoreOrderSubmission(answer, correctOrder, null)).toBe(0)
    expect(scoreOrderSubmission(answer, correctOrder, undefined)).toBe(0)
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

  it('produces different orders for different seeds', () => {
    const a = seededShuffle(items, 'slide_abc').map(i => i.id)
    const b = seededShuffle(items, 'slide_def').map(i => i.id)
    expect(a).not.toEqual(b)
  })

  it('never returns the exact correctOrder for n >= 3', () => {
    // Order's giveaway isn't a single fixed point (that's Matching's
    // concern) — it's the WHOLE shuffled row already matching the answer
    // key, which would show teams the answer before they tap anything.
    const threeItems = [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }]
    const correctOrder = ['p0', 'p1', 'p2']
    for (let i = 0; i < 50; i++) {
      const shuffled = seededShuffle(threeItems, `seed_${i}`, correctOrder)
      const matchesAnswer = shuffled.every((item, idx) => item.id === correctOrder[idx])
      expect(matchesAnswer).toBe(false)
    }
  })

  it('skips the re-roll check when no correctOrder is given (e.g. a preview row before an answer key exists)', () => {
    const threeItems = [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }]
    // No assertion beyond "doesn't throw and still returns a full permutation"
    // — without an answer key there's nothing to avoid giving away.
    const shuffled = seededShuffle(threeItems, 'seed_x')
    expect(shuffled.map(i => i.id).sort()).toEqual(['p0', 'p1', 'p2'])
  })

  it('does not mutate the input array', () => {
    const copy = [...items]
    seededShuffle(items, 'seed')
    expect(items).toEqual(copy)
  })
})

describe('computeOrderScoreUpdates', () => {
  const teams = [{ id: 'team_1', name: 'The Sequencers' }]
  const scoreboardTeams = [
    { id: 'sb_1', show_id: 'show_1', name: '  the sequencers  ', scores: { r_1: { written: 5, phone: 0 } }, sort_order: 0 },
  ]
  const correctOrder = ['img1', 'img2', 'img3']

  it('scores a full correct submission and updates the round', () => {
    const answers = [{ team_id: 'team_1', answer: ['img1', 'img2', 'img3'] }]
    const updates = computeOrderScoreUpdates({
      answers,
      teams,
      scoreboardTeams,
      roundKey: 'r_1',
      points: 20,
      correctOrder,
      slideId: 'slide_order',
    })
    expect(updates).toEqual([
      {
        id: 'sb_1',
        show_id: 'show_1',
        name: '  the sequencers  ',
        scores: { r_1: { written: 5, phone: { slide_order: 20 } } },
        sort_order: 0,
      },
    ])
  })

  it('scores zero for a wrong order submission', () => {
    const answers = [{ team_id: 'team_1', answer: ['img2', 'img1', 'img3'] }]
    const updates = computeOrderScoreUpdates({
      answers,
      teams,
      scoreboardTeams,
      roundKey: 'r_1',
      points: 20,
      correctOrder,
      slideId: 'slide_order',
    })
    expect(updates).toEqual([
      {
        id: 'sb_1',
        show_id: 'show_1',
        name: '  the sequencers  ',
        scores: { r_1: { written: 5, phone: { slide_order: 0 } } },
        sort_order: 0,
      },
    ])
  })

  it('skips a team_id that has no live team registration', () => {
    const answers = [{ team_id: 'ghost_team', answer: ['img1', 'img2', 'img3'] }]
    expect(
      computeOrderScoreUpdates({
        answers,
        teams,
        scoreboardTeams,
        roundKey: 'r_1',
        points: 20,
        correctOrder,
        slideId: 'slide_order',
      })
    ).toEqual([])
  })

  it('skips a team with no matching scoreboard_teams row', () => {
    const answers = [{ team_id: 'team_1', answer: ['img1', 'img2', 'img3'] }]
    expect(
      computeOrderScoreUpdates({
        answers,
        teams,
        scoreboardTeams: [],
        roundKey: 'r_1',
        points: 20,
        correctOrder,
        slideId: 'slide_order',
      })
    ).toEqual([])
  })

  it('skips a team that never submitted (no phone_answers row)', () => {
    // A team exists in both teams and scoreboardTeams but has no entry in
    // answers — they never submitted. Should produce no update entry.
    const answers = [] // team_1 never answered
    expect(
      computeOrderScoreUpdates({
        answers,
        teams,
        scoreboardTeams,
        roundKey: 'r_1',
        points: 20,
        correctOrder,
        slideId: 'slide_order',
      })
    ).toEqual([])
  })

  it('preserves other rounds already on the scoreboard row', () => {
    const sbWithOtherRound = [{ ...scoreboardTeams[0], scores: { r_0: 10, r_1: { written: 5, phone: 0 } } }]
    const answers = [{ team_id: 'team_1', answer: ['img1', 'img2', 'img3'] }]
    const [update] = computeOrderScoreUpdates({
      answers,
      teams,
      scoreboardTeams: sbWithOtherRound,
      roundKey: 'r_1',
      points: 20,
      correctOrder,
      slideId: 'slide_order',
    })
    expect(update.scores.r_0).toBe(10)
  })

  it('adds to, rather than overwrites, a different phone-scored slide already in the round', () => {
    const sbWithWager = [
      { ...scoreboardTeams[0], scores: { r_1: { written: 5, phone: { slide_wager: 15 } } } },
    ]
    const answers = [{ team_id: 'team_1', answer: ['img1', 'img2', 'img3'] }]
    const [update] = computeOrderScoreUpdates({
      answers,
      teams,
      scoreboardTeams: sbWithWager,
      roundKey: 'r_1',
      points: 20,
      correctOrder,
      slideId: 'slide_order',
    })
    expect(update.scores.r_1).toEqual({ written: 5, phone: { slide_wager: 15, slide_order: 20 } })
  })

  it('dedupes by id instead of crashing when two scoreboard rows collide on the same normalized name', () => {
    const collidingTeams = [
      { id: 'team_1', name: 'The Sequencers' },
      { id: 'team_2', name: '  THE SEQUENCERS  ' },
    ]
    const collidingScoreboard = [
      { id: 'sb_1', show_id: 'show_1', name: 'the sequencers', scores: {}, sort_order: 0 },
    ]
    const answers = [
      { team_id: 'team_1', answer: ['img1', 'img2', 'img3'] },
      { team_id: 'team_2', answer: [] },
    ]
    const updates = computeOrderScoreUpdates({
      answers,
      teams: collidingTeams,
      scoreboardTeams: collidingScoreboard,
      roundKey: 'r_1',
      points: 20,
      correctOrder,
      slideId: 'slide_order',
    })
    expect(updates).toHaveLength(1)
    const ids = updates.map(u => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
