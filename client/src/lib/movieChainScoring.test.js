import { describe, it, expect, vi } from 'vitest'
import { scoreMovieChainSubmission, computeMovieChainScoreUpdates, movieChainConfigError, resolveMovieChainAnswers, eligibleMovieChainAnswers } from './movieChainScoring.js'

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
  it('uses the original host lock time to exclude late writes', () => {
    const rows = [{ team_id: 'early', submitted_at: '2026-09-30T18:00:00Z' }, { team_id: 'late', submitted_at: '2026-09-30T18:00:01Z' }, { team_id: 'missing' }]
    expect(eligibleMovieChainAnswers(rows, '2026-09-30T18:00:00Z').map(row => row.team_id)).toEqual(['early'])
  })
  it('resolves all credited films and keeps each team result separate', async () => {
    const lookup = vi.fn(async id => ({ movie: { id, title: `Film ${id}` }, performers: [...credits.get(id)].map(person => ({ id: person, name: `Person ${person}` })) }))
    const rows = [{ team_id: 'team-1', answer: chain }, { team_id: 'team-2', answer: { movies: ['Q1', 'Q4'], performers: ['Q99'] } }]
    const results = await resolveMovieChainAnswers(rows, { startId: 'Q1', endId: 'Q4', announcedCount: 4 }, lookup)
    expect(results[0]).toMatchObject({ teamId: 'team-1', valid: true, points: 15, movieLabels: ['Film Q1', 'Film Q2', 'Film Q3', 'Film Q4'] })
    expect(results[1]).toMatchObject({ teamId: 'team-2', valid: false, points: 0 })
    expect(lookup).toHaveBeenCalledTimes(4)
  })
  it('scores a malformed or unknown-film row at zero without blocking other teams', async () => {
    const lookup = async id => {
      if (id === 'Q999') throw new Error('Movie not found')
      return { movie: { title: id }, performers: [...credits.get(id)].map(person => ({ id: person, name: person })) }
    }
    const rows = [
      { team_id: 'bad-shape', answer: { movies: ['Q1'], performers: [] } },
      { team_id: 'unknown', answer: { movies: ['Q1', 'Q999', 'Q4'], performers: ['Q11', 'Q14'] } },
      { team_id: 'good', answer: chain },
    ]
    const results = await resolveMovieChainAnswers(rows, { startId: 'Q1', endId: 'Q4', announcedCount: 4 }, lookup)
    expect(results.map(result => result.points)).toEqual([0, 0, 15])
  })
  it('does not assign a verdict when the credits service is unavailable', async () => {
    await expect(resolveMovieChainAnswers([{ team_id: 'team-1', answer: chain }],
      { startId: 'Q1', endId: 'Q4', announcedCount: 4 }, async () => { throw new Error('Wikidata unavailable') }, { retryDelayMs: 0 }))
      .rejects.toThrow('Wikidata unavailable')
  })
  it('retries a failed cast lookup before giving up', async () => {
    const calls = {}
    const lookup = async id => {
      calls[id] = (calls[id] ?? 0) + 1
      if (id === 'Q2' && calls[id] < 3) throw new Error('Wikidata unavailable')
      return { movie: { title: id }, performers: [...credits.get(id)].map(person => ({ id: person, name: person })) }
    }
    const results = await resolveMovieChainAnswers([{ team_id: 'team-1', answer: chain }],
      { startId: 'Q1', endId: 'Q4', announcedCount: 4 }, lookup, { retryDelayMs: 0 })
    expect(results[0].points).toBe(15)
    expect(calls.Q2).toBe(3)
  })
  it('never runs more than 4 cast lookups at once', async () => {
    let active = 0, peak = 0
    const ids = Array.from({ length: 12 }, (_, i) => `Q${100 + i}`)
    const lookup = async id => {
      active++; peak = Math.max(peak, active)
      await new Promise(r => setTimeout(r, 2))
      active--
      return { movie: { title: id }, performers: [] }
    }
    const rows = ids.map((id, i) => ({ team_id: `t${i}`, answer: { movies: ['Q1', id, 'Q4'], performers: ['Q11', 'Q14'] } }))
    await resolveMovieChainAnswers(rows, { startId: 'Q1', endId: 'Q4', announcedCount: 4 }, lookup, { retryDelayMs: 0 })
    expect(peak).toBeLessThanOrEqual(4)
  })
  it('blocks live play until distinct endpoint movies and a count are set', () => {
    expect(movieChainConfigError({})).toMatch(/starting movie/i)
    expect(movieChainConfigError({ movieChainStart: { id: 'Q1' } })).toMatch(/ending movie/i)
    expect(movieChainConfigError({ movieChainStart: { id: 'Q1' }, movieChainEnd: { id: 'Q1' }, movieChainCount: 3 })).toMatch(/different/i)
    expect(movieChainConfigError({ movieChainStart: { id: 'Q1' }, movieChainEnd: { id: 'Q2' }, movieChainCount: 1 })).toMatch(/at least 2/i)
    expect(movieChainConfigError({ movieChainStart: { id: 'Q1' }, movieChainEnd: { id: 'Q2' }, movieChainCount: 3 })).toBeNull()
  })
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
