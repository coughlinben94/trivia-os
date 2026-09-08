// client/src/components/host/BendleSongSearch.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'

export default function BendleSongSearch({ onPick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    let ignore = false // guards against an older, slower request overwriting a newer one's results
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/spotify-search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        const data = await res.json()
        if (!ignore) setResults(data.tracks ?? [])
      } catch {
        if (!ignore) setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => { ignore = true; clearTimeout(debounceRef.current) }
  }, [query])

  function handlePick(track) {
    setQuery('')
    setResults([])
    onPick(track)
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search a song on Spotify…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
      />
      {loading && <p className="text-xs text-gray-400">Searching…</p>}
      {results.length > 0 && (
        <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
          {results.map(track => (
            <li key={track.spotifyId}>
              <button
                onClick={() => handlePick(track)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
              >
                {track.artworkUrl && <img src={track.artworkUrl} alt="" className="w-8 h-8 rounded" />}
                <span>
                  <span className="block text-sm font-medium text-gray-900">{track.title}</span>
                  <span className="block text-xs text-gray-500">{track.artist}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
