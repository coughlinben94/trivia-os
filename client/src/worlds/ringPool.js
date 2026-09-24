//
// Full station objects for the 13 authored (fixed default ring) plus the
// pool-only candidates in midnightGalaxy.candidates.js — this is the pool
// client/src/lib/ringDraw.js's drawStations draws from. Carries every
// render field (variant/region/regionSource/noCompanion/companionKind),
// not a reduced {key,prim,hue,accent,family} projection: resolving a drawn
// world's render data against a reduced pool silently dropped those
// fields at render time — fixed 2026-09-24, see
// references/ring-world-mistakes.md and client/src/lib/ringWorldFor.js's
// own comment. `family` still comes from SLOTS[i] for the 13 authored
// entries (reading a reshuffle of stations can't silently pair the wrong
// hue/family to the wrong station); the six candidates carry their own
// family directly, since they have no SLOTS entry — they're never part of
// the fixed default ring, only ever pool-drawn.
import { midnightGalaxyRing } from './midnightGalaxy.ring.js'
import { SLOTS } from './midnightGalaxy.slots.js'
import { CANDIDATE_STATIONS } from './midnightGalaxy.candidates.js'

export const RING_POOL = [
  ...midnightGalaxyRing.stations.map((station, i) => ({ ...station, family: SLOTS[i].family })),
  ...CANDIDATE_STATIONS,
]
