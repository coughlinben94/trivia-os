import { THEMES } from '../themes/index.js'
import { ensureLegibleTextColor } from '../lib/colorContrast.js'

const theme = THEMES.find(t => t.id === 'midnight-galaxy')
if (!theme) throw new Error('midnightGalaxy.ring.js: no THEMES entry with id "midnight-galaxy"')

// theme.colors only has 2 sky-relevant stops (bg, bgDeep); the reference
// build's sky is a continuous 4-stop ramp. Duplicating bgDeep for both
// middle stops (an earlier version of this file did that) renders a flat
// solid band from 46% to 78% of the gradient radius — a visible regression
// from the reference's smooth falloff. Interpolating a real midpoint keeps
// the ramp continuous instead.
const mixHex = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const ch = (shift) => Math.round((((pa >> shift) & 255) * (1 - t)) + (((pb >> shift) & 255) * t))
  return `#${[16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')}`
}

export const midnightGalaxyRing = {
  id: 'midnight-galaxy',
  type: 'space',
  name: 'Midnight Galaxy',
  phase: 5,
  // was a hardcoded 4-stop array in concepts/world-07-ring.html; now derived
  // from the theme so a host's per-show color override (ThemeProvider's
  // applyOverrides) reaches this world too, instead of silently no-op'ing.
  sky: [theme.colors.bg, mixHex(theme.colors.bg, theme.colors.bgDeep, 0.5), theme.colors.bgDeep, '#010109'],
  // Never source question text from theme.colors.accent — it's a UI-surface
  // color (buttons/panels), not tuned for text legibility. For Midnight
  // Galaxy that was #4a1a8f, ~1.4:1 against the display bg. Both colors run
  // through the legibility floor (spec §9).
  qColours: [
    ensureLegibleTextColor(theme.colors.highlight, theme.colors.bgDeep),
    ensureLegibleTextColor(theme.colors.text ?? theme.colors.highlight, theme.colors.bgDeep),
  ],
  stations: [
    { key: 'orange nebula', prim: 'blob', hue: 28, accent: true },
    { key: 'star cluster', prim: 'dots', hue: 268, accent: false },
    { key: 'supernova', prim: 'spikes', hue: 36, accent: true },
    { key: 'spiral galaxy', prim: 'lens', hue: 276, accent: false },
    { key: 'comet', prim: 'streak', hue: 208, accent: false },
    { key: 'violet nebula', prim: 'blob', hue: 282, accent: false },
    { key: 'dust ribbon', prim: 'ribbon', hue: 264, accent: false },
    { key: 'binary pair', prim: 'dots', hue: 214, accent: false },
    { key: 'rose nebula', prim: 'blob', hue: 330, accent: true },
    { key: 'ringed lens', prim: 'lens', hue: 250, accent: false },
    { key: 'open cluster', prim: 'dots', hue: 224, accent: false },
    { key: 'green nebula', prim: 'blob', hue: 140, accent: false },
  ],
}
