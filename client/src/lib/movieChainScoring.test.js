import { describe, it, expect } from 'vitest'
import { scoreMovieChainSubmission, computeMovieChainScoreUpdates } from './movieChainScoring.js'

const credits = new Map([
  ['Q1', new Set(['Q11', 'Q12'])],
  ['Q2', new Set(['Q11', 'Q13'])],
  ['Q3', new Set(['Q13', 'Q14'])],
  ['Q4', new Set(['Q14', 'Q12'])],
  ['Q5', new Set(['Q12'])],
])
const config = { startId: 'Q1', endId: 'Q4', announcedCount: 4, castByMovie: credits }
const chain = { movies: ['Q1', 'Q2', 'Q3', 'Q4'], performers: ['Q11', 'Q13', 'Q14'] }

describe('movie chain scoring', () => {
  it('counts both endpoint movies and gives 15 for the announced length', () => {
    expect(scoreMovieChainSubmission(chain, config)).toMatchObject({ valid: true, finalConnected: true, movieCount: 4, points: 15 })
  })

  it('gives 15 to a valid chain shorter than the host announced', () => {
    const shorter = { movies: ['Q1', 'Q4'], performers: ['Q12'] }
    expect(scoreMovieChainSubmission(shorter, config)).toMatchObject({ valid: true, movieCount: 2, points: 15, beatAnnounced: true })
  })

  it('gives 10 for plus one, and zero beyond it', () => {
    const plusOne = { movies: ['Q1', 'Q5', 'Q4', 'Q3', 'Q4'], performers: ['Q12', 'Q12', 'Q14', 'Q14'] }
    // Repeats are forbidden even if the cast graph would support them.
    expect(scoreMovieChainSubmission(plusOne, config).points).toBe(0)
    const longerConfig = { ...config, announcedCount: 3 }
    expect(scoreMovieChainSubmission(chain, longerConfig).points).toBe(10)
    expect(scoreMovieChainSubmission(chain, { ...config, announcedCount: 2 }).points).toBe(0)
  })

  it('rejects repeated movies and performers', () => {
    expect(scoreMovieChainSubmission({ movies: ['Q1', 'Q2', 'Q1'], performers: ['Q11', 'Q11'] }, config).valid).toBe(false)
    expect(scoreMovieChainSubmission({ movies: ['Q1', 'Q2', 'Q4'], performers: ['Q11', 'Q11'] }, config).valid).toBe(false)
  })

  it('rejects malformed chains and changed endpoints', () => {
    expect(scoreMovieChainSubmission({ movies: ['Q1', 'Q4'], performers: [] }, config).points).toBe(0)
    expect(scoreMovieChainSubmission({ movies: ['Q5', 'Q4'], performers: ['Q12'] }, config).points).toBe(0)
    expect(scoreMovieChainSubmission({ movies: ['Q1', 'Q9'], performers: ['Q12'] }, config).points).toBe(0)
  })

  it('reports the final connection even when an earlier edge was tampered with', () => {
    const invalid = { movies: ['Q1', 'Q3', 'Q4'], performers: ['Q11', 'Q14'] }
    expect(scoreMovieChainSubmission(invalid, config)).toMatchObject({ valid: false, finalConnected: true, points: 0, reason: 'earlier-link' })
  })

  it('does not call a missing cast a wrong answer', () => {
    expect(() => scoreMovieChainSubmission(chain, { ...config, castByMovie: new Map([['Q1', credits.get('Q1')]]) })).toThrow('Missing credits')
  })

  it('folds points into the existing per-slide score bucket without double counting', () => {
    const teams = [{ id: 'team1', name: 'Foxes' }]
    const scoreboardTeams = [{ id: 'score1', show_id: 'show1', name: 'Foxes', scores: { r_round1: { written: 4, phone: { otherSlide: 5 } } } }]
    const args = { results: [{ teamId: 'team1', points: 15 }], teams, scoreboardTeams, roundKey: 'r_round1', slideId: 'movieSlide' }
    const first = computeMovieChainScoreUpdates(args)
    const again = computeMovieChainScoreUpdates({ ...args, scoreboardTeams: first })
    expect(again[0].scores.r_round1).toEqual({ written: 4, phone: { otherSlide: 5, movieSlide: 15 } })
  })
})
