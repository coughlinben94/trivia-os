// Slot table — Phase 1 of docs/superpowers/plans/2026-09-02-ring-station-variety.md.
//
// Placement grammar (cornerLeft/bandUpper/companionUpper/companionBoost/
// maxDetail) lives HERE, indexed by ring SLOT (position 0-12), not on the
// station/noun data in midnightGalaxy.ring.js. Today a station's corner and
// band come from `rng(i, seed)` keyed by station INDEX, but the coin-flips
// happen after makePrim() has already consumed an unknown, prim-dependent
// number of draws from the shared rHeadline stream — put a different noun in
// slot 7 and its corner draw changes (RingAmbient.jsx's own "the redesigned
// streak draws more seeded points, which reordered this station's corner
// draw" comment documents exactly this). Pinning placement to the SLOT means
// a future noun draw (2026-09-02-ring-station-variety.md, Phase 2-3) can put
// a different noun in a slot without re-rolling where it sits.
//
// Every value below is the shipped world's CURRENT EFFECTIVE value — either
// an explicit per-station override (cornerLeft/bandUpper on stations 6, 7,
// 11; companionUpper on station 2; companionBoost on stations 6, 7) or,
// where none exists, the value `rng()` actually rolls today. `bandUpper` and
// `companionUpper` are pure functions of `rng(i, 0x5EED2)` (the very first
// and only draw on that station's own independent stream, unconditioned by
// primitive kind) and were computed directly, not read off a render.
// `cornerLeft` is NOT: it depends on how many rHeadline() draws makePrim()
// consumes internally for that station's specific primitive, which this
// file does not (and should not) re-derive by hand — captured instead from
// a live render's `headlineCornerLeft` (temporary instrumentation, removed
// before this file was written; cross-checked against stations 6/7's known
// explicit overrides, which matched exactly). `maxDetail` needs no roll at
// all — it is `station.maxDetail ?? 4` today, a plain authored number.
//
// `companionUpper`/`companionBoost` are inert (unused) on station 5 (pulsar,
// `noCompanion: true` — no companion is ever drawn there, so nothing reads
// these) — carried anyway so every slot has the same shape; their values
// there are whatever the formula would produce, not meaningful.
//
// `family` — silhouette family, for Phase 2-3's spacing lanes only; nothing
// in Phase 1 reads it. Groupings per the shipped world's own comments
// (midnightGalaxy.ring.js header, 2026-08-16 supernova/record swap note) and
// docs/superpowers/plans/2026-09-02-ring-station-variety.md §3/§4: radial
// mass {0,3,4,8} plus record's disc (10, softly grouped — the tier table's
// own "keep >=3 from ringed, amber, lit, binary, record" groups it there);
// cluster {2,9}; burst {5,12} (post-swap — the old {5,10} in early comments
// predates the 2026-08-16 record/supernova station swap); streak {7,11};
// cloud {6}; lens {1}. Seeded with today's actual groupings, not a fresh
// judgment call.
export const SLOTS = [
  { cornerLeft: false, bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 2, family: 'radial-mass' }, // 0 ringed planet
  { cornerLeft: false, bandUpper: false, companionUpper: true,  companionBoost: false, maxDetail: 1, family: 'lens' },        // 1 spiral galaxy
  { cornerLeft: true,  bandUpper: true,  companionUpper: true,  companionBoost: false, maxDetail: 1, family: 'cluster' },     // 2 star cluster
  { cornerLeft: true,  bandUpper: false, companionUpper: true,  companionBoost: false, maxDetail: 1, family: 'radial-mass' }, // 3 amber planet
  { cornerLeft: true,  bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 1, family: 'radial-mass' }, // 4 lit planet
  { cornerLeft: true,  bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 4, family: 'burst' },       // 5 pulsar (noCompanion — companionUpper/Boost unused)
  { cornerLeft: false, bandUpper: false, companionUpper: true,  companionBoost: true,  maxDetail: 4, family: 'cloud' },       // 6 rose nebula
  { cornerLeft: false, bandUpper: true,  companionUpper: false, companionBoost: true,  maxDetail: 4, family: 'streak' },      // 7 comet
  { cornerLeft: true,  bandUpper: false, companionUpper: true,  companionBoost: false, maxDetail: 4, family: 'radial-mass' }, // 8 binary pair
  { cornerLeft: true,  bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 4, family: 'cluster' },     // 9 asteroid field
  { cornerLeft: false, bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 1, family: 'radial-mass' }, // 10 record
  { cornerLeft: false, bandUpper: false, companionUpper: true,  companionBoost: false, maxDetail: 1, family: 'streak' },      // 11 aurora ribbon
  { cornerLeft: true,  bandUpper: false, companionUpper: true,  companionBoost: false, maxDetail: 1, family: 'burst' },       // 12 supernova
]
