//
// Today's 13 ring stations, reshaped as a draw pool for ringDraw.js
// (docs/superpowers/plans/2026-09-02-ring-station-variety.md §2.4). This is
// a read of midnightGalaxy.ring.js + midnightGalaxy.slots.js, not a second
// source of truth — if either of those files changes, ringPool.test.js's
// hue-constant checks and family assertions catch drift immediately.
//
// `record` stays in the pool as shipped. The 2026-09-05 decision to retire
// it for an `eclipse` noun (docs/superpowers/plans/
// 2026-09-05-ring-unified-noun-color-draw-design.md §11a item 4, still
// provisional pending Ben's TV sign-off) is separate art-project work — see
// that doc's §9 build-order step 1. This plan does not depend on it and
// does not pre-empt it.
import {
  RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
  PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, RECORD_HUE,
  AURORA_RIBBON_HUE, SUPERNOVA_HUE,
  midnightGalaxyRing,
} from './midnightGalaxy.ring.js'
import { SLOTS } from './midnightGalaxy.slots.js'

// Hue constants in the same order as the stations, to preserve explicit constant
// references for the test's drift-detection. Key, prim, and accent come from the
// stations array; family comes from SLOTS. This eliminates hand-typed literals.
const HUE_CONSTANTS = [
  RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
  PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, RECORD_HUE,
  AURORA_RIBBON_HUE, SUPERNOVA_HUE,
]

export const RING_POOL = midnightGalaxyRing.stations.map((station, i) => ({
  key: station.key,
  prim: station.prim,
  hue: HUE_CONSTANTS[i],
  accent: station.accent,
  family: SLOTS[i].family,
}))
