import { applyPhoneScoreUpdates } from './scoreboardMath.js'

const QID = /^Q[1-9]\d*$/
const qid = value => typeof value === 'string' && QID.test(value)

export function movieChainConfigError(data) {
  const start = data?.movieChainStart?.id
  const end = data?.movieChainEnd?.id
  if (!qid(start)) return 'Choose a starting movie first'
  if (!qid(end)) return 'Choose an ending movie first'
  if (start === end) return 'Choose two different movies'
  if (!Number.isInteger(data.movieChainCount) || data.movieChainCount < 2) return 'Shortest chain must be at least 2 movies'
  return null
}

function invalid(reason, movieCount = null, finalConnected = false) {
  return { valid: false, finalConnected, movieCount, points: 0, beatAnnounced: false, reason }
}

function structureError(answer, { startId, endId, announcedCount }) {
  const movies = answer?.movies
  const performers = answer?.performers
  if (!Array.isArray(movies) || !Array.isArray(performers) || movies.length < 2 || performers.length !== movies.length - 1) return invalid('shape')
  if (!movies.every(qid) || !performers.every(qid)) return invalid('shape')
  if (movies[0] !== startId || movies.at(-1) !== endId) return invalid('endpoints', movies.length)
  if (new Set(movies).size !== movies.length || new Set(performers).size !== performers.length) return invalid('repeat', movies.length)
  if (!Number.isInteger(announcedCount) || announcedCount < 2) return invalid('configuration', movies.length)
  return null
}

export function scoreMovieChainSubmission(answer, { startId, endId, announcedCount, castByMovie }) {
  const early = structureError(answer, { startId, endId, announcedCount })
  if (early) return early
  const { movies, performers } = answer

  let earlierValid = true
  let finalConnected = false
  for (let i = 0; i < performers.length; i++) {
    const left = castByMovie.get(movies[i])
    const right = castByMovie.get(movies[i + 1])
    if (!left || !right) throw new Error(`Missing credits for ${!left ? movies[i] : movies[i + 1]}`)
    const connected = left.has(performers[i]) && right.has(performers[i])
    if (i === performers.length - 1) finalConnected = connected
    else if (!connected) earlierValid = false
  }
  if (!earlierValid) return invalid('earlier-link', movies.length, finalConnected)
  if (!finalConnected) return invalid('final-link', movies.length)

  const points = movies.length <= announcedCount ? 15 : movies.length === announcedCount + 1 ? 10 : 0
  return {
    valid: true,
    finalConnected: true,
    movieCount: movies.length,
    points,
    beatAnnounced: movies.length < announcedCount,
    reason: points === 0 ? 'too-long' : null,
  }
}

export function computeMovieChainScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId }) {
  return applyPhoneScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
}

export function eligibleMovieChainAnswers(rows, lockedAt) {
  if (!lockedAt) return []
  const cutoff = Date.parse(lockedAt)
  if (!Number.isFinite(cutoff)) return []
  return (rows ?? []).filter(row => row.submitted_at && Date.parse(row.submitted_at) <= cutoff)
}

const LOOKUP_CONCURRENCY = 4
const LOOKUP_TRIES = 3

async function lookupWithRetry(lookupCast, id, retryDelayMs) {
  for (let attempt = 1; ; attempt++) {
    try { return await lookupCast(id) }
    catch (error) {
      if (error.message === 'Movie not found' || attempt >= LOOKUP_TRIES) throw error
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
    }
  }
}

export async function resolveMovieChainAnswers(rows, { startId, endId, announcedCount }, lookupCast, { retryDelayMs = 500 } = {}) {
  const config = { startId, endId, announcedCount }
  const ids = [...new Set((rows ?? []).flatMap(row => structureError(row.answer, config) ? [] : row.answer.movies))]
  const details = new Map()
  const queue = [...ids]
  // Small worker pool: Wikidata rate-limits bursts, so never fan out all films at once.
  await Promise.all(Array.from({ length: Math.min(LOOKUP_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift()
      try { details.set(id, await lookupWithRetry(lookupCast, id, retryDelayMs)) }
      catch (error) {
        if (error.message !== 'Movie not found') throw error
        details.set(id, null)
      }
    }
  }))
  const castByMovie = new Map([...details].filter(([, value]) => value).map(([id, value]) => [id, new Set(value.performers.map(person => person.id))]))
  return (rows ?? []).map(row => {
    const unknown = !structureError(row.answer, config) && row.answer.movies.some(id => !details.get(id))
    const verdict = unknown ? invalid('unknown-film', row.answer.movies.length) : scoreMovieChainSubmission(row.answer, { ...config, castByMovie })
    return {
      teamId: row.team_id,
      ...verdict,
      movies: row.answer?.movies ?? [],
      performers: row.answer?.performers ?? [],
      movieLabels: (row.answer?.movies ?? []).map(id => details.get(id)?.movie?.title ?? id),
      performerLabels: (row.answer?.performers ?? []).map((id, index) => details.get(row.answer?.movies?.[index])?.performers.find(person => person.id === id)?.name ?? id),
    }
  })
}
