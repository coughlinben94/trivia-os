import { useEffect, useRef, useState } from 'react'
import { createRateLimitedSearch } from '../../lib/placeSearch.js'

// Host-only place search for the Pin It true-spot picker. Button / Enter only
// (Nominatim policy: no autocomplete, max 1 request/second).
export default function PlaceSearch({ fetchImpl, onPick, disabled }) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState({ status: 'idle', results: [] })
  const limiter = useRef(null)
  const abortRef = useRef(null)
  if (!limiter.current) limiter.current = createRateLimitedSearch({ fetchImpl })
  useEffect(() => () => abortRef.current?.abort(), [])

  async function run() {
    const q = query.trim()
    if (!q || disabled) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setState({ status: 'loading', results: [] })
    try {
      const results = await limiter.current.search(q, ac.signal)
      if (ac.signal.aborted) return
      setState({ status: results.length ? 'results' : 'empty', results })
    } catch (e) {
      if (ac.signal.aborted) return
      setState({ status: 'error', results: [] })
    }
  }

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <input
          type="text" value={query} disabled={disabled}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); run() } }}
          placeholder="Search a place (US)"
          className="w-64 rounded border border-gray-300 px-2 py-1 text-xs"
        />
        <button type="button" disabled={disabled} onClick={run} className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">Search</button>
      </div>
      {state.status === 'loading' && <p className="text-xs text-gray-500 mt-1">Searching…</p>}
      {state.status === 'empty' && <p className="text-xs text-gray-500 mt-1">Nothing found — try adding the state</p>}
      {state.status === 'error' && <p className="text-xs text-red-500 mt-1">Search unavailable — paste lat, lon or click the map</p>}
      {state.status === 'results' && (
        <ul className="mt-1 flex flex-col gap-1">
          {state.results.map((r, i) => (
            <li key={i}>
              <button
                type="button" data-testid="place-result" disabled={!r.valid}
                onClick={() => { onPick({ lat: r.lat, lon: r.lon, label: r.label }); setState({ status: 'idle', results: [] }); setQuery('') }}
                className={`w-full text-left rounded px-2 py-1 text-xs ${r.valid ? 'bg-gray-50 hover:bg-gray-200' : 'text-gray-400 cursor-not-allowed'}`}
              >{r.label}{r.valid ? '' : ' (outside the lower 48)'}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
