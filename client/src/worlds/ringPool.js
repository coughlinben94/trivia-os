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
import { midnightGalaxyRing } from './midnightGalaxy.ring.js'
import { SLOTS } from './midnightGalaxy.slots.js'

// Key, prim, hue, and accent come straight from the stations array; family
// comes from SLOTS. Reading hue off the station (rather than a separate,
// position-matched constants array) means a reshuffle of stations can't
// silently pair the wrong hue to the wrong station.
export const RING_POOL = midnightGalaxyRing.stations.map((station, i) => ({
  key: station.key,
  prim: station.prim,
  hue: station.hue,
  accent: station.accent,
  family: SLOTS[i].family,
}))
