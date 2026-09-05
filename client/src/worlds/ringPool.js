//
// Today's 13 ring stations, reshaped as a draw pool for ringDraw.js
// (docs/superpowers/plans/2026-09-02-ring-station-variety.md §2.4). This is
// a read of midnightGalaxy.ring.js + midnightGalaxy.slots.js, not a second
// source of truth — if either of those files changes, ringPool.test.js's
// hue-constant check catches drift immediately.
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
} from './midnightGalaxy.ring.js'

export const RING_POOL = [
  { key: 'ringed planet',  prim: 'ring',          hue: RINGED_PLANET_HUE,  accent: false, family: 'radial-mass' },
  { key: 'spiral galaxy',  prim: 'lens',           hue: SPIRAL_GALAXY_HUE,  accent: false, family: 'lens' },
  { key: 'star cluster',   prim: 'dots',           hue: STAR_CLUSTER_HUE,   accent: false, family: 'cluster' },
  { key: 'amber planet',   prim: 'ring',           hue: AMBER_PLANET_HUE,   accent: true,  family: 'radial-mass' },
  { key: 'lit planet',     prim: 'planet',         hue: LIT_PLANET_HUE,     accent: false, family: 'radial-mass' },
  { key: 'pulsar',         prim: 'pulsar',         hue: PULSAR_HUE,         accent: false, family: 'burst' },
  { key: 'rose nebula',    prim: 'nebulaCloud',    hue: ROSE_NEBULA_HUE,    accent: true,  family: 'cloud' },
  { key: 'comet',          prim: 'streak',         hue: COMET_HUE,          accent: false, family: 'streak' },
  { key: 'binary pair',    prim: 'binary',         hue: BINARY_PAIR_HUE,    accent: false, family: 'radial-mass' },
  { key: 'asteroid field', prim: 'asteroidField',  hue: ASTEROID_FIELD_HUE, accent: false, family: 'cluster' },
  { key: 'record',         prim: 'record',         hue: RECORD_HUE,         accent: false, family: 'radial-mass' },
  { key: 'aurora ribbon',  prim: 'ribbon',         hue: AURORA_RIBBON_HUE,  accent: false, family: 'streak' },
  { key: 'supernova',      prim: 'spikes',         hue: SUPERNOVA_HUE,      accent: true,  family: 'burst' },
]
