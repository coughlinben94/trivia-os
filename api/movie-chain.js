import { searchMovies, getMovieCast, checkMiddleCredit, isQid } from './_lib/wikidata.js'

const cache = new Map()
const CACHE_MS = 5 * 60 * 1000

async function cached(key, load) {
  const item = cache.get(key)
  if (item && item.expires > Date.now()) return item.value
  const value = await load()
  if (cache.size > 500) cache.clear()
  cache.set(key, { value, expires: Date.now() + CACHE_MS })
  return value
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { action, q, movieId, personId, destinationId } = req.query ?? {}
  try {
    if (action === 'search') {
      if (typeof q !== 'string' || q.trim().length < 2) return res.status(400).json({ error: 'Enter at least two letters' })
      return res.status(200).json(await cached(`search:${q.trim().toLowerCase()}`, () => searchMovies(q)))
    }
    if (action === 'cast') {
      if (!isQid(movieId)) return res.status(400).json({ error: 'Invalid movie ID' })
      return res.status(200).json(await cached(`cast:${movieId}`, () => getMovieCast(movieId)))
    }
    if (action === 'check') {
      if (![movieId, personId, destinationId].every(isQid)) return res.status(400).json({ error: 'Invalid ID' })
      if (movieId === destinationId) return res.status(200).json({ kind: 'destination' })
      const cast = await cached(`cast:${movieId}`, () => getMovieCast(movieId))
      return res.status(200).json({ kind: cast.performers.some(person => person.id === personId) ? 'valid' : 'invalid' })
    }
    return res.status(400).json({ error: 'Unknown action' })
  } catch (error) {
    const status = error.message === 'Movie not found' ? 404 : 502
    return res.status(status).json({ error: status === 404 ? error.message : 'Wikidata unavailable — retry in a moment' })
  }
}
