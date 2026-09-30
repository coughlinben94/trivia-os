import { useEffect, useState } from 'react'
import { movieChainRequest } from '../../lib/movieChainApi.js'
import { movieChainConfigError } from '../../lib/movieChainScoring.js'

function MovieField({ label, field, value, onChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [castInfo, setCastInfo] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const movie = value

  useEffect(() => {
    if (!movie?.id) { setCastInfo(null); return }
    let cancelled = false
    movieChainRequest('cast', { movieId: movie.id }).then(cast => {
      if (!cancelled) setCastInfo({ id: movie.id, count: cast.performers.length })
    }).catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [movie?.id])

  async function search() {
    if (query.trim().length < 2 || busy) return
    setBusy(true); setError('')
    try { setResults(await movieChainRequest('search', { q: query.trim() })) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function choose(movie) {
    setResults([]); setQuery('')
    onChange(field, movie)
    setCastInfo(null); setError('')
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800">{label}</label>
      {movie && <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">{movie.title} {movie.year ? `(${movie.year})` : ''}</div>}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); search() } }}
          placeholder={`Search ${label.toLowerCase()}`}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
        />
        <button type="button" aria-label={`Search ${label.toLowerCase()}`} onClick={search} disabled={busy || query.trim().length < 2}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Searching…' : 'Search'}</button>
      </div>
      {results.length > 0 && <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white">
        {results.map(result => <button type="button" key={result.id} data-movie-id={result.id} onClick={() => choose(result)}
          className="block w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100">
          {result.title} {result.year ? `(${result.year})` : ''}
        </button>)}
      </div>}
      {castInfo && castInfo.id === movie?.id && <p className="text-xs text-gray-500">{castInfo.count} credited performer{castInfo.count === 1 ? '' : 's'} in Wikidata</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export default function MovieChainEditor({ data, onChange }) {
  const issue = movieChainConfigError(data)
  return <div className="space-y-5">
    <p className="text-xs leading-relaxed text-gray-600">Teams connect these two movies through cast members. Show the shortest movie count on the question. Both movies count.</p>
    <MovieField label="Starting movie" field="movieChainStart" value={data.movieChainStart} onChange={onChange} />
    <MovieField label="Ending movie" field="movieChainEnd" value={data.movieChainEnd} onChange={onChange} />
    <div>
      <label className="mb-1 block text-sm font-semibold text-gray-800" htmlFor="movie-chain-count">Shortest chain — movies</label>
      <input id="movie-chain-count" type="number" min="2" max="12" value={data.movieChainCount ?? ''}
        onChange={event => onChange('movieChainCount', event.target.value === '' ? null : Number(event.target.value))}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900" />
      <p className="mt-1 text-xs text-gray-500">15 points at this length or shorter, 10 one movie longer, 0 beyond.</p>
    </div>
    {issue && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{issue}</p>}
  </div>
}
