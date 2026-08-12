import { THEMES } from '../themes/index.js'
import { floorContrast } from '../lib/contrast.js'
import { skyFromTheme } from '../lib/ringEngine.js'

const theme = THEMES.find(t => t.id === 'midnight-galaxy')
if (!theme) throw new Error('midnightGalaxy.ring.js: no THEMES entry with id "midnight-galaxy"')

export const midnightGalaxyRing = {
  id: 'midnight-galaxy',
  type: 'space',
  name: 'Midnight Galaxy',
  phase: 5,
  // Derived from the theme (ringEngine.js's skyFromTheme — single source,
  // shared with concepts/world-07-ring.html) so a host's per-show color
  // override (ThemeProvider's applyOverrides) reaches this world too,
  // instead of silently no-op'ing.
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
    { key: 'ringed planet', prim: 'ring', hue: 256, accent: false }, // was st9 — radial mass
    { key: 'spiral galaxy', prim: 'lens', hue: 276, accent: false }, // was st3 — spiral/disc
    { key: 'star cluster', prim: 'dots', hue: 268, accent: false }, // was st1 — scattered cluster
    { key: 'orange nebula', prim: 'blob', hue: 28, accent: true }, // was st0 — diffuse cloud
    { key: 'lit planet', prim: 'planet', hue: 140, accent: false }, // NEW — radial mass
    { key: 'pulsar', prim: 'pulsar', hue: 120, accent: false }, // NEW — radiant burst
    { key: 'rose nebula', prim: 'nebulaCloud', hue: 330, accent: true }, // was st8 — asymmetric cloud, 2026-08-12
    { key: 'comet', prim: 'streak', hue: 208, accent: false }, // was st4 — elongated streak
    { key: 'binary pair', prim: 'binary', hue: 214, accent: false }, // was st7 — radial mass
    { key: 'asteroid field', prim: 'asteroidField', hue: 160, accent: false }, // NEW — scattered cluster
    { key: 'supernova', prim: 'spikes', hue: 36, accent: true }, // was st2 — radiant burst
    { key: 'aurora ribbon', prim: 'ribbon', hue: 196, accent: false }, // was st11 (unchanged) — elongated streak
  ],
}
