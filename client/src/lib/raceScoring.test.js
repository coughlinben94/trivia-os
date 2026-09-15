import { describe, it, expect } from 'vitest'
import { scoreHorseRacePick, computeHorseRaceScoreUpdates } from './raceScoring.js'

describe('scoreHorseRacePick', () => {
  it('scores full points for a matching pick', () => {
    expect(scoreHorseRacePick('Secretariat', 'Secretariat', 10)).toBe(10)
  })

  it('scores zero for a wrong pick', () => {
    expect(scoreHorseRacePick('Man o War', 'Secretariat', 10)).toBe(0)
  })

  it('scores zero for a null/undefined/empty answer', () => {
    expect(scoreHorseRacePick(null, 'Secretariat', 10)).toBe(0)
    expect(scoreHorseRacePick(undefined, 'Secretariat', 10)).toBe(0)
    expect(scoreHorseRacePick('', 'Secretariat', 10)).toBe(0)
  })

  it('scores zero when there is no correct answer yet (a tie, or beats not filled in)', () => {
    // RaceEditor writes data.answer as '' on a tie — never point at a wrong
    // winner. A pick can never be "correct" against a blank answer key.
    expect(scoreHorseRacePick('Secretariat', '', 10)).toBe(0)
    expect(scoreHorseRacePick('Secretariat', null, 10)).toBe(0)
    expect(scoreHorseRacePick('Secretariat', undefined, 10)).toBe(0)
  })

  it('handles non-numeric points by coercing to number', () => {
    expect(scoreHorseRacePick('Secretariat', 'Secretariat', '5')).toBe(5)
    expect(scoreHorseRacePick('Secretariat', 'Secretariat', null)).toBe(0)
    expect(scoreHorseRacePick('Secretariat', 'Secretariat', undefined)).toBe(0)
  })
})

describe('computeHorseRaceScoreUpdates', () => {
  const teams = [{ id: 'team_1', name: 'The Pickers' }]
  const scoreboardTeams = [
    { id: 'sb_1', show_id: 'show_1', name: '  the pickers  ', scores: { r_1: { written: 5, phone: 0 } }, sort_order: 0 },
  ]
  const correctAnswer = 'Secretariat'

  it('scores a correct pick and updates the round', () => {
    const answers = [{ team_id: 'team_1', answer: 'Secretariat' }]
    const updates = computeHorseRaceScoreUpdates({
      answers, teams, scoreboardTeams, roundKey: 'r_1', points: 20, correctAnswer, slideId: 'slide_race',
    })
    expect(updates).toEqual([
      { id: 'sb_1', show_id: 'show_1', name: '  the pickers  ', scores: { r_1: { written: 5, phone: { slide_race: 20 } } }, sort_order: 0 },
    ])
  })

  it('scores zero for a wrong pick', () => {
    const answers = [{ team_id: 'team_1', answer: 'Man o War' }]
    const updates = computeHorseRaceScoreUpdates({
      answers, teams, scoreboardTeams, roundKey: 'r_1', points: 20, correctAnswer, slideId: 'slide_race',
    })
    expect(updates[0].scores.r_1.phone.slide_race).toBe(0)
  })

  it('skips a team_id that has no live team registration', () => {
    const answers = [{ team_id: 'ghost_team', answer: 'Secretariat' }]
    expect(
      computeHorseRaceScoreUpdates({ answers, teams, scoreboardTeams, roundKey: 'r_1', points: 20, correctAnswer, slideId: 'slide_race' })
    ).toEqual([])
  })

  it('skips a team with no matching scoreboard_teams row', () => {
    const answers = [{ team_id: 'team_1', answer: 'Secretariat' }]
    expect(
      computeHorseRaceScoreUpdates({ answers, teams, scoreboardTeams: [], roundKey: 'r_1', points: 20, correctAnswer, slideId: 'slide_race' })
    ).toEqual([])
  })

  it('adds to, rather than overwrites, a different phone-scored slide already in the round', () => {
    const sbWithChoice = [{ ...scoreboardTeams[0], scores: { r_1: { written: 5, phone: { slide_choice: 15 } } } }]
    const answers = [{ team_id: 'team_1', answer: 'Secretariat' }]
    const [update] = computeHorseRaceScoreUpdates({
      answers, teams, scoreboardTeams: sbWithChoice, roundKey: 'r_1', points: 20, correctAnswer, slideId: 'slide_race',
    })
    expect(update.scores.r_1).toEqual({ written: 5, phone: { slide_choice: 15, slide_race: 20 } })
  })

  it('dedupes by id instead of crashing when two scoreboard rows collide on the same normalized name', () => {
    const collidingTeams = [
      { id: 'team_1', name: 'The Pickers' },
      { id: 'team_2', name: '  THE PICKERS  ' },
    ]
    const collidingScoreboard = [{ id: 'sb_1', show_id: 'show_1', name: 'the pickers', scores: {}, sort_order: 0 }]
    const answers = [
      { team_id: 'team_1', answer: 'Secretariat' },
      { team_id: 'team_2', answer: '' },
    ]
    const updates = computeHorseRaceScoreUpdates({
      answers, teams: collidingTeams, scoreboardTeams: collidingScoreboard, roundKey: 'r_1', points: 20, correctAnswer, slideId: 'slide_race',
    })
    expect(updates).toHaveLength(1)
  })
})
