// client/src/lib/bendleSongExtras.js
// Bendle song fail-safe: songs the host picks that the Wikidata song list
// lacks go into bendle_song_extras (migration 20261002130000), and phones
// merge them into search. Rows carry no show or night, so nothing marks
// which one is tonight's answer.
import { supabase } from './supabase.js'
import { buildCatalogIndex } from './bendleCatalog.js'
import { normalizeText } from './bendleGuessScoring.js'

// Same key scripts/build-bendle-catalog.mjs buildRows dedupes on.
export const songKey = ({ title, artist }) => `${normalizeText(title)}|${normalizeText(artist)}`

// Extras rank with the least-known catalog songs (the build keeps 3+ articles).
const EXTRA_RANK = 3

// Read through an RPC sorted by norm_key: the table itself is not readable, so
// neither row order nor any id/date can hint which song was added last.
export async function fetchExtras(client = supabase) {
  const { data, error } = await client.rpc('list_bendle_song_extras')
  if (error) throw new Error(error.message ?? 'could not load song list extras')
  return data ?? []
}

// Phones: one fetch per page load, like the catalog. A failure is not kept,
// so the next board mount tries again.
let extrasCache = null
export function loadExtras(client = supabase) {
  if (!extrasCache) {
    extrasCache = fetchExtras(client)
    extrasCache.catch(() => { extrasCache = null })
  }
  return extrasCache
}
export function clearExtrasCache() { extrasCache = null }

export function isInSongList(song, catalogRows, extras) {
  const key = songKey(song)
  return (extras ?? []).some(e => (e.norm_key ?? songKey(e)) === key)
    || (catalogRows ?? []).some(r => songKey(r) === key)
}

// 'present' | 'added' | 'no-artist' (missing, and a row needs an artist) |
// 'no-title' (nothing searchable left after normalizing); throws if the add fails.
export async function ensureSongInList(song, { catalogRows, extras, rpc }) {
  if (!normalizeText(song.title)) return 'no-title'
  if (isInSongList(song, catalogRows, extras)) return 'present'
  const title = String(song.title ?? '').trim()
  const artist = String(song.artist ?? '').trim()
  if (!normalizeText(artist)) return 'no-artist'
  const { data, error } = await rpc('add_bendle_song_extra', { p_title: title, p_artist: artist, p_norm_key: songKey(song) })
  if (error) throw new Error(error.message ?? 'could not add the song')
  return data === false ? 'present' : 'added'
}

// The phone's search index plus any extras it lacks, still ranked by article count.
export function mergeExtras(index, extras) {
  if (!extras?.length) return index
  const have = new Set(index.map(songKey))
  const fresh = extras.filter(e => !have.has(songKey(e))).map(e => [e.title, e.artist, EXTRA_RANK])
  if (!fresh.length) return index
  return [...index, ...buildCatalogIndex(fresh)].sort((a, b) => b.rank - a.rank)
}
