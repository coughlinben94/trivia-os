// client/src/components/host/BendleSongListStatus.jsx
// Bendle song fail-safe, host side: when the builder picks a song, make sure
// teams can find it in the phone song list, adding it if it is missing. A
// failure only shows a line with Retry; it never blocks building the slide.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { loadBendleCatalog } from '../../lib/bendleCatalog.js'
import { BENDLE_CATALOG_URL } from '../../lib/bendleCatalogVersion.js'
import { ensureSongInList, fetchExtras, songKey } from '../../lib/bendleSongExtras.js'

const DEBOUNCE_MS = 400
const TIMEOUT_MS = 10000
const settled = new Map() // song key -> 'present' | 'added' | 'no-artist'; once per distinct song per page

const LABELS = {
  checking: 'Checking the phone song list…',
  present: '✓ In song list',
  added: '✓ Added to song list',
  'no-artist': 'Not in the phone song list (this song has no artist). Teams can type the title.',
  'no-title': 'Not added to the phone song list: the title has nothing searchable once brackets are removed. Teams can type it.',
}

export default function BendleSongListStatus({ song, catalogUrl = BENDLE_CATALOG_URL, timeoutMs = TIMEOUT_MS }) {
  // `answer` is the cleaned title (no "- Remastered"); bendle_songs.title can be Spotify's raw one.
  const title = String(song?.answer || song?.title || '').trim()
  const artist = String(song?.artist ?? '').trim()
  const key = title ? songKey({ title, artist }) : ''
  const [state, setState] = useState({ key: '', status: null, message: '' })
  const [tries, setTries] = useState(0)

  useEffect(() => {
    if (!key) return undefined
    if (settled.has(key)) { setState({ key, status: settled.get(key), message: '' }); return undefined }
    let dead = false
    setState({ key, status: 'checking', message: '' })
    const t = setTimeout(async () => {
      let timer
      try {
        const work = (async () => {
          // Either read failing only costs one RPC: the add is idempotent.
          const [catalogRows, extras] = await Promise.all([
            catalogUrl ? loadBendleCatalog(catalogUrl).catch(() => []) : [],
            fetchExtras().catch(() => null),
          ])
          return ensureSongInList({ title, artist }, { catalogRows, extras, rpc: (fn, args) => supabase.rpc(fn, args) })
        })()
        const status = await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), timeoutMs) })])
        settled.set(key, status)
        if (!dead) setState({ key, status, message: '' })
      } catch (e) {
        if (!dead) setState({ key, status: 'error', message: e?.message ?? 'unknown error' })
      } finally { clearTimeout(timer) }
    }, DEBOUNCE_MS)
    return () => { dead = true; clearTimeout(t) }
  }, [key, tries]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!key || state.key !== key || !state.status) return null
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-xs text-red-600 mt-1">
        Could not add this song to the phone song list ({state.message}). The slide still works.{' '}
        <button type="button" onClick={() => setTries(n => n + 1)} className="font-semibold underline">Retry</button>
      </p>
    )
  }
  const tone = state.status === 'no-artist' || state.status === 'no-title' ? 'text-amber-600' : state.status === 'checking' ? 'text-gray-400' : 'text-[#1a6b4a]'
  return <p role="status" className={`text-xs mt-1 ${tone}`}>{LABELS[state.status]}</p>
}
