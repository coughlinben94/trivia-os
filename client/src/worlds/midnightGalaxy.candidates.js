//
// Pool-only station candidates — never part of the fixed 13-station
// authored ring (client/src/worlds/midnightGalaxy.ring.js), never given a
// SLOTS entry. They exist only so client/src/worlds/ringPool.js's
// RING_POOL has real surplus for client/src/lib/ringDraw.js's drawStations
// to draw from. See docs/superpowers/plans/2026-09-24-ring-world-six-new-
// objects.md for the full architecture and why (the pool used to equal the
// authored 13 exactly, so drawStations had zero freedom and threw on every
// real seed — 5 authored stations share family 'radial-mass' against a cap
// of 4).
//
// Every entry needs the same fields the reduced RING_POOL projection used
// to drop before 2026-09-24's critique-fix pass: whatever
// client/src/components/display/RingAmbient.jsx reads by station identity
// (variant/region/regionSource/noCompanion/companionKind) for stations
// that need them. None of these do (deliberately kept simple for a
// first pass) — omitted fields default the same way an authored station
// omitting them does.
//
// Ben's aesthetic call on the self-render gallery (2026-09-24, same day):
// orion, wormhole, and dark nebula all rejected ("doesn't look good" /
// "suck") — pulled from the pool. Their primitive code (ringPrimitives.js's
// 'constellation' orion variant, 'wormhole' kind, 'darkNebula' kind) is
// left in place, unreachable from the pool, in case a future pass reworks
// and re-adds them — this file is the only place that needs editing to
// bring one back. Not a code defect, an aesthetic rejection.
export const CANDIDATE_STATIONS = [
  { key: 'big dipper', prim: 'constellation', variant: 'bigDipper', hue: 210, accent: false, family: 'constellation' },
  { key: 'cassiopeia', prim: 'constellation', variant: 'cassiopeia', hue: 180, accent: false, family: 'constellation' },
  { key: 'southern cross', prim: 'constellation', variant: 'southernCross', hue: 165, accent: false, family: 'constellation' },
]
