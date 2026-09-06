import { describe, it, expect } from 'vitest'
import { scoreChoiceSubmission, computeChoiceScoreUpdates } from './choiceScoring.js'

describe('scoreChoiceSubmission', () => {
  it('scores full points for a single-select exact match', () => {
    expect(scoreChoiceSubmission(['opt2'], ['opt2'], 10)).toBe(10)
  })

  it('scores zero for a single-select wrong pick', () => {
    expect(scoreChoiceSubmission(['opt1'], ['opt2'], 10)).toBe(0)
  })

  it('scores full points for a multi-select exact set match regardless of tap order', () => {
    expect(scoreChoiceSubmission(['opt3', 'opt1'], ['opt1', 'opt3'], 10)).toBe(10)
  })

  it('scores zero if the answer is missing a correct option', () => {
    expect(scoreChoiceSubmission(['opt1'], ['opt1', 'opt3'], 10)).toBe(0)
  })

  it('scores zero if the answer includes an extra wrong option', () => {
    expect(scoreChoiceSubmission(['opt1', 'opt2', 'opt3'], ['opt1', 'opt3'], 10)).toBe(0)
  })

  it('scores zero for an empty answer array', () => {
    expect(scoreChoiceSubmission([], ['opt1'], 10)).toBe(0)
  })

  it('scores zero when correctIds is empty, even against an empty answer', () => {
    // An empty answer key can never be "correct" — mirrors orderScoring's
    // guard: without it, [].every(...) on two empty arrays is vacuously
    // true and would score full points for a question with no answer key.
    expect(scoreChoiceSubmission([], [], 10)).toBe(0)
    expect(scoreChoiceSubmission(['opt1'], [], 10)).toBe(0)
  })

  it('scores zero for a null or undefined answer', () => {
    expect(scoreChoiceSubmission(null, ['opt1'], 10)).toBe(0)
    expect(scoreChoiceSubmission(undefined, ['opt1'], 10)).toBe(0)
  })

  it('scores zero if not an array', () => {
    expect(scoreChoiceSubmission('opt1', ['opt1'], 10)).toBe(0)
  })

  it('handles non-numeric points by coercing to number', () => {
    expect(scoreChoiceSubmission(['opt1'], ['opt1'], '5')).toBe(5)
    expect(scoreChoiceSubmission(['opt1'], ['opt1'], null)).toBe(0)
    expect(scoreChoiceSubmission(['opt1'], ['opt1'], undefined)).toBe(0)
  })
})

describe('computeChoiceScoreUpdates', () => {
  const teams = [{ id: 'team_1', name: 'The Pickers' }]
  const scoreboardTeams = [
    { id: 'sb_1', show_id: 'show_1', name: '  the pickers  ', scores: { r_1: { written: 5, phone: 0 } }, sort_order: 0 },
  ]
  const correctIds = ['optA']

  it('scores a full correct submission and updates the round', () => {
    const answers = [{ team_id: 'team_1', answer: ['optA'] }]
    const updates = computeChoiceScoreUpdates({
      answers, teams, scoreboardTeams, roundKey: 'r_1', points: 20, correctIds, slideId: 'slide_choice',
    })
    expect(updates).toEqual([
      { id: 'sb_1', show_id: 'show_1', name: '  the pickers  ', scores: { r_1: { written: 5, phone: { slide_choice: 20 } } }, sort_order: 0 },
    ])
  })

  it('scores zero for a wrong submission', () => {
    const answers = [{ team_id: 'team_1', answer: ['optB'] }]
    const updates = computeChoiceScoreUpdates({
      answers, teams, scoreboardTeams, roundKey: 'r_1', points: 20, correctIds, slideId: 'slide_choice',
    })
    expect(updates[0].scores.r_1.phone.slide_choice).toBe(0)
  })

  it('skips a team_id that has no live team registration', () => {
    const answers = [{ team_id: 'ghost_team', answer: ['optA'] }]
    expect(
      computeChoiceScoreUpdates({ answers, teams, scoreboardTeams, roundKey: 'r_1', points: 20, correctIds, slideId: 'slide_choice' })
    ).toEqual([])
  })

  it('skips a team with no matching scoreboard_teams row', () => {
    const answers = [{ team_id: 'team_1', answer: ['optA'] }]
    expect(
      computeChoiceScoreUpdates({ answers, teams, scoreboardTeams: [], roundKey: 'r_1', points: 20, correctIds, slideId: 'slide_choice' })
    ).toEqual([])
  })

  it('adds to, rather than overwrites, a different phone-scored slide already in the round', () => {
    const sbWithWager = [{ ...scoreboardTeams[0], scores: { r_1: { written: 5, phone: { slide_wager: 15 } } } }]
    const answers = [{ team_id: 'team_1', answer: ['optA'] }]
    const [update] = computeChoiceScoreUpdates({
      answers, teams, scoreboardTeams: sbWithWager, roundKey: 'r_1', points: 20, correctIds, slideId: 'slide_choice',
    })
    expect(update.scores.r_1).toEqual({ written: 5, phone: { slide_wager: 15, slide_choice: 20 } })
  })

  it('dedupes by id instead of crashing when two scoreboard rows collide on the same normalized name', () => {
    const collidingTeams = [
      { id: 'team_1', name: 'The Pickers' },
      { id: 'team_2', name: '  THE PICKERS  ' },
    ]
    const collidingScoreboard = [{ id: 'sb_1', show_id: 'show_1', name: 'the pickers', scores: {}, sort_order: 0 }]
    const answers = [
      { team_id: 'team_1', answer: ['optA'] },
      { team_id: 'team_2', answer: [] },
    ]
    const updates = computeChoiceScoreUpdates({
      answers, teams: collidingTeams, scoreboardTeams: collidingScoreboard, roundKey: 'r_1', points: 20, correctIds, slideId: 'slide_choice',
    })
    expect(updates).toHaveLength(1)
  })
})
