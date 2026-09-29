// The ring's station override (RingAmbient's `stationOverride` prop), pulled
// out of Display.jsx so it is one pure, tested function — the phones (/join)
// will call the same one in a later phase (Halloween spec §4.11 Tier 2).
//
//   break active     -> the world's music station (the jukebox's fixed picture)
//   warp going back  -> RING_RETURN (go back to the station the break left)
//   otherwise        -> null (no override; the ring follows the slides)
//
// Non-ring themes get 10 too: grading breaks run on every theme and the
// override was always the plain number there (the ring just isn't mounted to
// use it). The space world leaves `musicStation` unset — its object is pinned
// byte-for-byte by ringWorldFor.snapshot.test.js — so it falls to the same 10.

// Sentinel for "go back to the station you were on before the last numeric
// override". Lives here (not RingAmbient.jsx) so this module stays
// component-free; RingAmbient re-exports it.
export const RING_RETURN = 'return'

const DEFAULT_MUSIC_STATION = 10

export function ringStationOverride({ breakActive, warp, world }) {
  if (breakActive) return world?.musicStation ?? DEFAULT_MUSIC_STATION
  return warp === 'back' ? RING_RETURN : null
}
