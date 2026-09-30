import { applyPhoneScoreUpdates } from './scoreboardMath.js'

const QID = /^Q[1-9]\d*$/
const qid = value => typeof value === 'string' && QID.test(value)

function invalid(reason, movieCount = null, finalConnected = false) {
  return { valid: false, finalConnected, movieCount, points: 0, beatAnnounced: false, reason }
}

export function scoreMovieChainSubmission(answer, { startId, endId, announcedCount, castByMovie }) {
  const movies = answer?.movies
  const performers = answer?.performers
  if (!Array.isArray(movies) || !Array.isArray(performers) || movies.length < 2 || performers.length !== movies.length - 1) return invalid('shape')
  if (!movies.every(qid) || !performers.every(qid)) return invalid('shape')
  if (movies[0] !== startId || movies.at(-1) !== endId) return invalid('endpoints', movies.length)
  if (new Set(movies).size !== movies.length || new Set(performers).size !== performers.length) return invalid('repeat', movies.length)
  if (!Number.isInteger(announcedCount) || announcedCount < 2) return invalid('configuration', movies.length)

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
