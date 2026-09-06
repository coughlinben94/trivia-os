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
export const ECLIPSE_HUE        = 300
export const AURORA_RIBBON_HUE  = 196
// The music station's hue under its old name. client/src/jukebox/components/
// LiveScreen.jsx reads it for the jukebox's own ring-mode scrim tint ("one
// source of truth for what colour the music station is"); the jukebox code
// is out of scope for the 2026-09-06 record->eclipse swap, so the alias stays
// until that import is renamed. Same value, never diverges.
export const RECORD_HUE         = ECLIPSE_HUE
export const SUPERNOVA_HUE      = 36

// ── Sky source ─────────────────────────────────────────────────────────────
// The base sky's two source colours, GENERATED the same way the hues above
// are: scripts/ring-recolor.mjs rewrites both from the palette, so a recolour
// no longer leaves a purple sky over a red world. Shipped values are the
// midnight-galaxy theme's own bg/bgDeep, so this renders byte-identical to
// the `skyFromTheme(theme)` call it replaced. Both files carry them and
// ringRecolor.test.js fails if the two ever disagree.
export const SKY_BG      = '#08001a'
export const SKY_BG_DEEP = '#040010'

// ── Near-white tints ───────────────────────────────────────────────────────
// GENERATED, like the hues and the two sky sources above: ring-recolor
// rotates ringPrimitives.js's BASE_TINTS onto the palette (same lightness and
// chroma, new hue) and writes the result here and into the identical table in
// concepts/world-07-ring.html. Shipped values ARE the baseline, so this
// renders byte-identical to the literals it replaced. Pure whites aren't
// here — a hot core reads white under any sky.
export const TINTS = {
  halo:      '#fdf7ff',
  coreWarm:  '#fffaf0',
  coreDim:   '#fff6e6',
  dustWarm:  '#fff3e0',
  glareCool: '#eaf5ff',
  starTint1: '#f6e6ff',
  starTint2: '#fff3e2',
  starTint3: '#eaf0ff',
  drift:     '#ffd9a0',
  driftGlow: '#ffb76e',
  shoot:     '#fff8ec',
  shootTail: '#fff6e2',
}

export const midnightGalaxyRing = {
  id: 'midnight-galaxy',
  type: 'space',
  name: 'Midnight Galaxy',
  phase: 5,
  // Built by ringEngine.js's skyFromTheme — single ramp function, shared
  // with concepts/world-07-ring.html — from the two GENERATED source hexes
  // above, not from the theme. A recolour moves the sky with the world.
  // This still does NOT make per-show color overrides reach the ring: the
  // sources are module-load constants, and ThemeProvider's applyOverrides
  // returns a new spread object without mutating anything here. Ring worlds
  // are palette-fixed by design — see references/themes.md ("palette-fixed").
  sky: skyFromTheme({ colors: { bg: SKY_BG, bgDeep: SKY_BG_DEEP } }),
  tints: TINTS,
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
  // Anchors are GENERATED, not authored: scripts/ring-recolor.mjs derives one
  // anchor per palette colour and rewrites this block, so the count and the
  // degrees below track whatever palette was last applied. Spec §4 allows
  // 1–3 anchors, which is the only constraint that survives a recolour —
  // everything specific in the reasoning that follows describes the
  // 2026-09-02 purple/blue palette that is shipped today, not a rule.
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
    { key: 'eclipse', prim: 'eclipse', hue: ECLIPSE_HUE, accent: false, region: 'corona', regionSource: true, maxDetail: 1 }, // The music station (Display.jsx MUSIC_STATION = 10). Total eclipse since 2026-09-06, replacing the record — Ben's call, final: the drawn record sat under the real Jukebox player every grading break (docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md, header + §5). Built corona-first (makePrim's `eclipse` branch): the ink is a bright >=4px annulus, a Baily's bead and three short streamers; the dark disc is the sky through the hole, not a painted body, so no makeOccluder-class element is involved and spec §7.2's subtractive ban on bottom-third-by-arc slots never applies (st10 is 5th-quietest, one rank above that band anyway — §5.1). Family radial-mass only, not a burst hybrid: as a burst it would sit d=2 from the supernova (st12) and re-create the signed-exception pattern; under the three-lane reading radial-mass owns lane B {1,4,7,10}, so the pin at 10 is a consequence of the lane, not a special case (§5.2). A quiet slot suits it — "renders dimmer at 10" was a defect for a record and is the noun for an eclipse; headline-ink floor (0.04) is the number to watch. Hue 300 carried over from the record: inside the world's violet family, between the sky (268) and the rose accent (330). region:'corona' + regionSource — the corona lights its own sky, same contract as the pulsar/supernova; see SKY_REGIONS for why it is quieter than `disco` was. accent:false — warm-complementary cap (<=3) already met by st3/st6/st12. maxDetail 1 carried over (2026-08-26 Bug A). Synced with concepts/world-07-ring.html's st10 entry. Placement at 10 is Ben's OPEN call (§11a item 4, "idk") — a working default until he sees it on the TV, not an approval.
    { key: 'aurora ribbon', prim: 'ribbon', hue: AURORA_RIBBON_HUE, accent: false, bandUpper: false, maxDetail: 1 }, // was st11 (unchanged) — elongated streak; bandUpper:false synced from world-07-ring.html (Ben: "move to bottom right"); maxDetail 2026-08-26 (Bug A: measured 6)
    { key: 'supernova', prim: 'spikes', hue: SUPERNOVA_HUE, accent: true, region: 'ember', regionSource: true, maxDetail: 1 }, // was st2, then st10; swapped with the record 2026-08-16 — radiant burst, family {5,12} now d=6 (was {5,10}=5). The loudest accent object lands on a louder arc slot (21.3 vs st10's 11.8) — suits it. `region:'ember'` (2026-08-16, moved from st8): an exploding star is an undeniable source for a warm sky; single-station core, so st11 previews at 0.25 and st0 fades out at 0.5 (skyRegionWeights). maxDetail 2026-08-26 (Bug A: measured 7)
  ],
}
