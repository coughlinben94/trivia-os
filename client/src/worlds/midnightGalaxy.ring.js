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
  ],
  stations: [
    { key: 'orange nebula', prim: 'blob', hue: 28, accent: true },
    { key: 'star cluster', prim: 'dots', hue: 268, accent: false },
    { key: 'supernova', prim: 'spikes', hue: 36, accent: true },
    { key: 'spiral galaxy', prim: 'lens', hue: 276, accent: false },
    { key: 'comet', prim: 'streak', hue: 208, accent: false },
    { key: 'violet nebula', prim: 'blob', hue: 282, accent: false },
    { key: 'dust ribbon', prim: 'ribbon', hue: 264, accent: false },
    { key: 'binary pair', prim: 'binary', hue: 214, accent: false },
    { key: 'rose nebula', prim: 'blob', hue: 330, accent: true },
    // was 250° — 26° from the violet anchor, 1° outside its own window and
    // not marked accent; a second, unflagged outlier the spec-coverage
    // audit missed. Nudged 6° (imperceptible) to land inside the window
    // with margin instead of introducing a 4th accent for a 1° miss.
    { key: 'ringed lens', prim: 'ring', hue: 256, accent: false },
    { key: 'open cluster', prim: 'dots', hue: 224, accent: false },
    // was 'green nebula' at 140° — 74° from the nearer (blue) anchor, the
    // spec-coverage audit's flagged outlier. Marking it a 3rd accent isn't
    // available: orange nebula/supernova/rose nebula already fill the
    // ≤3-station accent budget, and green would be a second, unrelated
    // complementary direction on top of that one (the spec allows ONE
    // deliberate opposite, not two). Re-hued into the blue anchor's window,
    // but stopped at its cool (cyan) edge rather than jumping to violet —
    // pulling it to 250-260° would sit it directly on top of ringed lens/
    // dust ribbon/spiral galaxy/violet nebula, an already-dense 5-station
    // cluster, and would flatten exactly the "different part of the sky"
    // reader review praised. At 196° it's still legibly cooler/greener
    // than the violet cluster, 12° clear of comet (208°, a different
    // primitive/silhouette anyway), and inside the blue anchor's window
    // with an 18° margin. Renamed to match — a teal/cyan blob still
    // labelled "green" would be a stale key.
    // Task 3 step 4: blob was the headline on stations 1, 6, 9 AND this one
    // - 4 times in 12, with 12->1 cyclically adjacent (spec §6.2/§10 bans
    // both: >3 headline appearances, and any two on adjacent stations).
    // Reassigned this station (the one already flagged above as the odd one
    // out) from blob to ribbon - a wide, dim, low-alpha gas band (after
    // this session's ribbon fix) reads as a filamentary nebula at least as
    // well as a cloud-blob does, so the noun survives, just reshaped.
    // Leaves blob at 1/6/9 only (pairwise cyclic distances 5, 3, 4 - none
    // adjacent) and puts ribbon at 2 stations (this one and station 7's
    // dust ribbon), cyclic distance 5, not adjacent. Renamed the key from
    // "teal nebula" to "teal filament" since the noun itself changed, not
    // just the hue (spec §10: the largest element's noun must change, not
    // just its color).
    { key: 'teal filament', prim: 'ribbon', hue: 196, accent: false },
  ],
}
