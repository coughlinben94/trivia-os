// Bump this in the SAME commit as any change to midnightGalaxy.ring.js,
// concepts/world-07-ring.html's WORLD literal, ringPrimitives.js,
// ring-spec.lock.json, weightedPalette.js (drift math, station-colour
// assignment), ringRecolor.js, or RingAmbient.jsx. A shelf row's
// ring_version must match this exactly or it is stale — see
// supabase/migrations/<...>_ring_palettes_table.sql.
export const RING_VERSION = 'v1-2026-09-03'
