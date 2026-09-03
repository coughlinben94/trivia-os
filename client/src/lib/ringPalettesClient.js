// Verified 2026-09-03: every other host component (DatabaseAddPanels.jsx,
// LateTeamPopover.jsx, HostPinGate.jsx, LiveMode.jsx, ScorePanel.jsx, etc.)
// imports the SAME shared client from this exact path — never create a
// second client instance.
import { supabase } from './supabase.js'
import { RING_VERSION } from './ringCertification.js'

export async function fetchCertifiedPalettes() {
  const { data, error } = await supabase
    .from('ring_palettes')
    .select('id, colors, weights, drift, source, seed')
    .eq('status', 'certified')
    .eq('ring_version', RING_VERSION)
  if (error) throw error
  return data ?? []
}

export async function saveAsPending({ colors, weights, drift }) {
  const { error } = await supabase.from('ring_palettes').insert({
    colors, weights, drift, source: 'manual', ring_version: RING_VERSION, status: 'pending',
  })
  if (error) throw error
}

// A live pick matches a shelf entry only on an exact value match — weights
// are floats from a drag, so in practice a manual pick almost never
// matches an existing row and correctly falls to "save as pending". Exact
// match still matters for the "Surprise me" round-trip (drawing an
// existing certified row and re-finding it) and for re-opening a show that
// already has a certified worldPalette applied.
export function findMatch(shelf, { colors, weights, drift }) {
  return shelf.find(row =>
    JSON.stringify(row.colors) === JSON.stringify(colors) &&
    JSON.stringify(row.weights) === JSON.stringify(weights) &&
    JSON.stringify(row.drift) === JSON.stringify(drift))
}
