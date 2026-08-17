import { JUKEBOX_LIBRARIES } from './jukeboxLibraries.js'
import { supabase } from './supabase.js'

// VITE_JUKEBOX_SUPABASE_URL/ANON_KEY are actually identical to trivia-os's
// own main Supabase project — this used to spin up a second GoTrueClient on
// the same project, which shares a browser storage key with the main client
// and risks auth-state collision for the host_verified RLS claim (this file
// is imported on /host). Reuse the single client instead. Read-only: reads
// the Jukebox's shared library list so the host dropdown self-updates.

// Returns [{ id, label }] from the live Jukebox sets.items, or null on any failure.
export async function fetchJukeboxLibraries() {
  try {
    const { data, error } = await supabase
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
