const API_URL = 'https://www.wikidata.org/w/api.php'
const FILM_ID = 'Q11424'
const QID = /^Q[1-9]\d*$/

export function isQid(value) {
  return typeof value === 'string' && QID.test(value)
}

function claimIds(entity, property) {
  return (entity?.claims?.[property] ?? [])
    .map(claim => claim?.mainsnak?.datavalue?.value?.id)
    .filter(isQid)
}

function englishLabel(entity) {
  return entity?.labels?.en?.value ?? entity?.id ?? ''
}

function movieYear(entity) {
  const time = entity?.claims?.P577?.[0]?.mainsnak?.datavalue?.value?.time
  const year = Number(String(time ?? '').slice(1, 5))
  return Number.isInteger(year) && year > 1800 ? year : null
}

function isFilm(entity) {
  return claimIds(entity, 'P31').includes(FILM_ID)
}

async function request(params, fetcher) {
  const url = new URL(API_URL)
  for (const [key, value] of Object.entries({ ...params, format: 'json', origin: '*' })) {
    url.searchParams.set(key, value)
  }
  let result
  try {
    result = await fetcher(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'TriviaOS/1.0 (movie-chain question)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
    return await result.json()
  } catch (error) {
    throw new Error('Wikidata unavailable', { cause: error })
  }
}

async function entities(ids, fetcher) {
  if (ids.length === 0) return {}
  const merged = {}
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const data = await request({ action: 'wbgetentities', ids: batch.join('|'), props: 'claims|labels|descriptions', languages: 'en' }, fetcher)
    Object.assign(merged, data.entities ?? {})
  }
  return merged
}

function movieSummary(entity) {
  return { id: entity.id, title: englishLabel(entity), year: movieYear(entity) }
}

export async function searchMovies(query, fetcher = fetch) {
  const text = String(query ?? '').trim()
  if (text.length < 2) return []
  const data = await request({ action: 'wbsearchentities', search: text.slice(0, 100), language: 'en', type: 'item', limit: '20' }, fetcher)
  const ids = (data.search ?? []).map(row => row.id).filter(isQid)
  const details = await entities(ids, fetcher)
  return ids.map(id => details[id]).filter(entity => entity && isFilm(entity)).map(movieSummary).slice(0, 10)
}

export async function getMovieCast(movieId, fetcher = fetch) {
  if (!isQid(movieId)) throw new Error('Invalid movie ID')
  const film = (await entities([movieId], fetcher))[movieId]
  if (!film || !isFilm(film)) throw new Error('Movie not found')
  const ids = [...new Set([...claimIds(film, 'P161'), ...claimIds(film, 'P725')])]
  const people = await entities(ids, fetcher)
  return {
    movie: movieSummary(film),
    performers: ids.map(id => ({ id, name: englishLabel(people[id] ?? { id }) })),
  }
}

export async function checkMiddleCredit(movieId, personId, destinationId, fetcher = fetch) {
  if (!isQid(movieId) || !isQid(personId) || !isQid(destinationId)) throw new Error('Invalid ID')
  if (movieId === destinationId) return { kind: 'destination' }
  const { performers } = await getMovieCast(movieId, fetcher)
  return { kind: performers.some(person => person.id === personId) ? 'valid' : 'invalid' }
}
