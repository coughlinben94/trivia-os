import { THEMES } from '../themes/index.js'

const theme = THEMES.find(t => t.id === 'midnight-galaxy')

export const midnightGalaxyRing = {
  id: 'midnight-galaxy',
  type: 'space',
  name: 'Midnight Galaxy',
  phase: 5,
  // was a hardcoded 4-stop array in concepts/world-07-ring.html; now derived
  // from the theme so a host's per-show color override (ThemeProvider's
  // applyOverrides) reaches this world too, instead of silently no-op'ing.
  sky: [theme.colors.bg, theme.colors.bgDeep, theme.colors.bgDeep, '#010109'],
  qColours: [theme.colors.highlight, theme.colors.accent],
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
