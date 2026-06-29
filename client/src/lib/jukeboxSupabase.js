import { createClient } from '@supabase/supabase-js'
import { JUKEBOX_LIBRARIES } from './jukeboxLibraries.js'

// Business Suite project (different project than Trivia OS's own). Read-only:
// reads the Jukebox's shared library list so the host dropdown self-updates.
const url = import.meta.env.VITE_JUKEBOX_SUPABASE_URL
const key = import.meta.env.VITE_JUKEBOX_SUPABASE_ANON_KEY
const jukeboxSupabase = url && key ? createClient(url, key) : null

// Returns [{ id, label }] from the live Jukebox sets.items, or null on any failure.
export async function fetchJukeboxLibraries() {
  if (!jukeboxSupabase) return null
  try {
    const { data, error } = await jukeboxSupabase
      .from('jukebox_state')
      .select('sets')
      .limit(1)
      .maybeSingle()
    if (error || !data?.sets?.items) return null
    const items = data.sets.items
    const libs = Object.keys(items).map(id => ({ id, label: items[id]?.name ?? id }))
    if (libs.length === 0) return null
    libs.sort((a, b) =>
      a.id === 'main' ? -1 : b.id === 'main' ? 1 : a.label.localeCompare(b.label)
    )
    return libs
  } catch {
    return null
  }
}
