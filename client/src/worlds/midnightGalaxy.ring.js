import { THEMES } from '../themes/index.js'
import { floorContrast } from '../lib/contrast.js'
import { skyFromTheme } from '../lib/ringEngine.js'

const theme = THEMES.find(t => t.id === 'midnight-galaxy')
if (!theme) throw new Error('midnightGalaxy.ring.js: no THEMES entry with id "midnight-galaxy"')

// ── Station hue constants ──────────────────────────────────────────────────
// Pure rename, no behavior change: every value below is identical to the
// literal it replaced in the stations array. One named constant per station,
// and every station reads its own constant — this is the single seam a
// deliberate future palette edit (weighted-palette Task 4, deferred
// post-show) writes to. The shipped values are pinned byte-for-byte in
// midnightGalaxy.ring.test.js; changing any of them requires updating that
// pin in the same commit, after an `npm run verify:ring` run against
// concepts/world-07-ring.html (the file the gate actually reads — a hue
// changed only here is a hue the gate never sees).
export const RINGED_PLANET_HUE  = 256
export const SPIRAL_GALAXY_HUE  = 170
export const STAR_CLUSTER_HUE   = 268
export const AMBER_PLANET_HUE   = 28
export const LIT_PLANET_HUE     = 140
export const PULSAR_HUE         = 120
export const ROSE_NEBULA_HUE    = 330
export const COMET_HUE          = 208
export const BINARY_PAIR_HUE    = 214
export const ASTEROID_FIELD_HUE = 160
export const RECORD_HUE         = 300
export const AURORA_RIBBON_HUE  = 196
export const SUPERNOVA_HUE      = 36

export const midnightGalaxyRing = {
  id: 'midnight-galaxy',
  type: 'space',
  name: 'Midnight Galaxy',
  phase: 5,
  // Derived from the theme (ringEngine.js's skyFromTheme — single source,
  // shared with concepts/world-07-ring.html) so the sky palette isn't a
  // second hand-copied set of hex values.
  // This does NOT make per-show color overrides reach the ring: the
  // `THEMES.find` above runs once at module load, and ThemeProvider's
  // applyOverrides returns a new spread object without mutating THEMES, so
  // an override resolved later never reaches this value. Ring worlds are
  // palette-fixed by design — see references/themes.md ("palette-fixed").
  sky: skyFromTheme(theme),
  // Never source question text from theme.colors.accent — it's a UI-surface
  // color (buttons/panels), not tuned for text legibility. For Midnight
  // Galaxy that was #4a1a8f, ~1.8:1 against the display bg. Both colors run
  // through the same legibility floor ThemeProvider already uses for
  // textMuted (spec §9) — 7:1, bar-distance/motion floor, not the bare 4.5:1
  // WCAG minimum.
  qColours: [
    floorContrast(theme.colors.highlight, [theme.colors.bgDeep], 7),
    floorContrast(theme.colors.text ?? theme.colors.highlight, [theme.colors.bgDeep], 7),
  ],
  // Two anchors, not one 34°-of-highlight window (spec §4): Midnight Galaxy
  // is genuinely a violet/purple family (the theme's own highlight, 276°)
  // plus a cool-blue family that's already live across three stations
  // (comet 208°, binary pair 214°, open cluster 224°) — stretching one
  // window to cover both would either exclude the blues or blur the two
  // apart. orange nebula/supernova/rose nebula stay the world's one warm
  // complementary accent (≤3 stations, cap already met — see below).
  hueAnchors: [
    { deg: 276, window: 25 }, // violet/purple - the theme's own highlight
    { deg: 214, window: 25 }, // cool blue - comet, open cluster, binary pair already live here
    // 3rd anchor (spec §4 allows 1-3), added 2026-08-09 for this round's 3
    // new objects — lit planet(140)/pulsar(120)/asteroid field(160) all
    // land inside its window rather than being 3 more scattered one-offs.
    { deg: 140, window: 25 },
  ],
  // Reshuffled 2026-08-09 (Ben's silhouette-family spacing correction), kept
  // in sync with concepts/world-07-ring.html's own independent copy of this
  // array — see that file's own comment on why both need the same fix by
  // hand. Grouped every station by shape family (radial mass / diffuse
  // cloud / scattered cluster / radiant burst / elongated streak / spiral-
  // disc) and required same-family stations sit >=3 apart cyclically. The
  // prior ordering had radial mass (lit planet, binary pair, ringed lens)
  // at 5/7/9 — pairwise distance 2 — a third of the ring reading as the
  // same silhouette. Every noun/prim/hue/accent bundle moved as a unit
  // (comments below note each entry's prior station). Family spacing
  // achieved: radial mass {0,4,8}=4/4/4, diffuse cloud {3,6}=3, scattered
  // cluster {2,9}=5, radiant burst {5,10}=5, elongated streak {7,11}=4 —
  // all >=3. Also retired: violet nebula (was st5, replaced by lit planet),
  // dust-ribbon/open-cluster (were st6/st10, the zigzag-deletion stopgap,
  // now replaced by asteroid field / supernova's old slot). st0/st3's
  // orange+rose nebula were a deliberate duplicate (`blob` both), left for
  // "next round" — that round is this one: st3 kept `blob` (fixed by
  // adding makeNebulaRing around it), st6 moved to its own `nebulaCloud`
  // kind (2026-08-12, full asymmetric-silhouette reconstruction — see that
  // branch's own comment in ringPrimitives.js) — no longer the same recipe.
  stations: [
    { key: 'ringed planet', prim: 'ring', hue: RINGED_PLANET_HUE, accent: false, maxDetail: 2 }, // was st9 — radial mass; maxDetail 2026-08-26 (ring-verify Bug A: measured 7, over the 2-5 band — see RingAmbient.jsx's maxDetail comment)
    { key: 'spiral galaxy', prim: 'lens', hue: SPIRAL_GALAXY_HUE, accent: false, companionKind: 'dots', maxDetail: 1 }, // was st3 — spiral/disc; hue 276->170 2026-08-12, synced from world-07-ring.html (Ben: "still hate the oval purple color"); companionKind 2026-08-13 synced (Ben: "cluster of random blue shapes... trashed and redone"); maxDetail 2026-08-26 (Bug A: measured 8)
    { key: 'star cluster', prim: 'dots', hue: STAR_CLUSTER_HUE, accent: false, companionUpper: true, maxDetail: 1 }, // was st1 — scattered cluster; companionUpper 2026-08-14 synced from world-07-ring.html (Ben: "move the spiral bottom right to top right" — companion joins the headline's top band, still the opposite corner); maxDetail 2026-08-26 (Bug A: measured 8)
    { key: 'amber planet', prim: 'ring', variant: 'dust', hue: AMBER_PLANET_HUE, accent: true, maxDetail: 1 }, // was st0, was 'orange nebula'/blob+ring:true — rebuilt 2026-08-13 as a dust-ringed planet on st0's `ring` anatomy (Ben: "that saturn like planet needs a reworking"); synced from world-07-ring.html, see that file's st3 comment for the family-spacing tradeoff flag; maxDetail 2026-08-26 (Bug A: measured 8)
    { key: 'lit planet', prim: 'planet', hue: LIT_PLANET_HUE, accent: false, region: 'aurora', maxDetail: 1 }, // NEW — radial mass; `region` replaces greenWash 2026-08-16, synced from world-07-ring.html (see ringPrimitives.js's SKY_REGIONS block for why the wash was retired outright rather than re-tuned a fifth time); maxDetail 2026-08-26 (Bug A: measured 7)
    { key: 'pulsar', prim: 'pulsar', hue: PULSAR_HUE, accent: false, region: 'aurora', regionSource: true, noCompanion: true }, // NEW — radiant burst; regionSource: the pulsar IS the light source the aurora sky leans toward (its own glow gets the anchored light-field); noCompanion 2026-08-13 (Ben: "still a background circle" — this station's own companion, mis-marked as bleed by round-6, see world-07-ring.html's identical comment)
    { key: 'rose nebula', prim: 'nebulaCloud', hue: ROSE_NEBULA_HUE, accent: true, cornerLeft: false, companionBoost: true }, // was st8 — asymmetric cloud, 2026-08-12; cornerLeft:false synced from world-07-ring.html (Ben: "needs to be on other bottom corner"); companionBoost 2026-08-13 synced (Ben: "too blank, add something" — near-trough loudness left the companion invisible; see RingAmbient's companion block)
    { key: 'comet', prim: 'streak', hue: COMET_HUE, accent: false, cornerLeft: false, companionBoost: true, companionKind: 'lens' }, // was st4 — elongated streak; cornerLeft:false 2026-08-13, synced from world-07-ring.html (redesigned streak reorders the corner draw; comet pinned to the right corner); companionBoost + companionKind:'lens' 2026-08-13 synced (Ben: "need something else bottom left" — quietest ARC station, companion alpha bottomed out; rolled 'dots' stays illegible even boosted, forced to lens)
    { key: 'binary pair', prim: 'binary', hue: BINARY_PAIR_HUE, accent: false }, // was st7 — radial mass; orangeWash REMOVED 2026-08-16 (synced from world-07-ring.html): an orange wash over a blue object had no visible cause, which is the whole reason it read as a filter. The warm region moved to st10, whose own object (the supernova) is already amber — fixed at the data level, not by re-tuning alpha.
    { key: 'asteroid field', prim: 'asteroidField', hue: ASTEROID_FIELD_HUE, accent: false }, // NEW — scattered cluster; fillCorner (Ben: "need something here" on the bottom-left) REMOVED 2026-08-26 (ring-verify Bug B + Bug A): it drew via makeOccluder, a subtractive element — banned outright on this station by spec §7.2 (st9 is one of the bottom-third-by-arc quietest stations), and cutting it also brings st9's own element count from 6 into the 2-5 band (Bug A) in the same edit. See RingAmbient.jsx's fillCorner removal for the full reasoning.
    { key: 'record', prim: 'record', hue: RECORD_HUE, accent: false, region: 'disco', regionSource: true, maxDetail: 1 }, // was st12 — swapped with the supernova 2026-08-16 (Ben: "it can just flip it with another station"), synced from world-07-ring.html; see that file's entry for the full spacing arithmetic. At st12 the disc sat 1 station from the ringed planet (st0). Here both neighbours are the world's two least-round silhouettes (asteroid field, aurora ribbon). Residual, flagged not hidden: d(10,8)=2 to the binary pair — >=3 from every radial mass is arithmetically impossible at PANES=13 with {0,3,4,8} fixed. Also flagged: st10's arc is quieter than st12's (11.8 vs 21.3), so the record's own headline renders dimmer; the disco region + source glow are weight-driven (full at the member station) and lose nothing. regionSource: the record's label lights the disco sky, same contract as the pulsar/supernova. accent:false — warm-complementary cap (<=3) already met by st3/st6/st12. maxDetail 2026-08-26 (Bug A: measured 7, plus the st9 spanning-headline bleed-in that Bug C's placement fix also removes)
    { key: 'aurora ribbon', prim: 'ribbon', hue: AURORA_RIBBON_HUE, accent: false, bandUpper: false, maxDetail: 1 }, // was st11 (unchanged) — elongated streak; bandUpper:false synced from world-07-ring.html (Ben: "move to bottom right"); maxDetail 2026-08-26 (Bug A: measured 6)
    { key: 'supernova', prim: 'spikes', hue: SUPERNOVA_HUE, accent: true, region: 'ember', regionSource: true, maxDetail: 1 }, // was st2, then st10; swapped with the record 2026-08-16 — radiant burst, family {5,12} now d=6 (was {5,10}=5). The loudest accent object lands on a louder arc slot (21.3 vs st10's 11.8) — suits it. `region:'ember'` (2026-08-16, moved from st8): an exploding star is an undeniable source for a warm sky; single-station core, so st11 previews at 0.25 and st0 fades out at 0.5 (skyRegionWeights). maxDetail 2026-08-26 (Bug A: measured 7)
  ],
}
