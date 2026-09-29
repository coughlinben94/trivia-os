// haunted-october ring world — docs/superpowers/specs/2026-09-28-halloween-ring-world-design.md.
//
// Phase 2: sky regions, horizon band and station 10 (harvest moon) are real.
// The other 12 stations are still Phase 1 stubs: shared ringPrimitives.js
// kinds standing in for their §3 nouns until Phases 3-4. `approved: false` keeps it out of the host
// pickers until Ben signs the real world off.
import { THEMES } from '../themes/index.js'
import { floorContrast } from '../lib/contrast.js'
import { skyFromTheme } from '../lib/ringEngine.js'
import { BASE_TINTS } from '../lib/ringPrimitives.js'
import { SLOTS } from './hauntedOctober.slots.js'
import { harvestMoon, horizonBand } from './hauntedOctober.art.js'

const theme = THEMES.find(t => t.id === 'haunted-october')
if (!theme) throw new Error('hauntedOctober.ring.js: no THEMES entry with id "haunted-october"')

export const hauntedOctoberRing = {
  id: 'haunted-october',
  type: 'terrestrial', // one of ring-verify's WORLD.type values
  name: 'Haunted October',
  phase: 5,
  approved: false,
  sky: skyFromTheme(theme),
  qColours: [
    floorContrast(theme.colors.highlight, [theme.colors.bgDeep], 7),
    floorContrast(theme.colors.text, [theme.colors.bgDeep], 7),
  ],
  hueAnchors: [{ deg: 28, window: 25 }],
  // WarpTransition.jsx reads tints.starTint3/drift on every grading-break
  // warp, so a world must carry the table. STUB: shared defaults until Phase 2.
  tints: BASE_TINTS,

  // ── Per-world config (read by ringWorldFor / RingAmbient / Display). The
  // space world leaves these unset and gets its shipped values as defaults. ──
  // Fixed authored order: no auto-draw, no saved station overrides (spec §3).
  autoDraw: false,
  pinKey: 'harvest moon',
  pinAt: 10,
  musicStation: 10, // spec §0.4: the harvest moon
  slots: SLOTS,
  layers: { stars: false, drifter: false, shootingStars: false },
  // Sky-region set for this world (replaces ringPrimitives.js SKY_REGIONS
  // here; spec §2 look contract). Orange dusk leads (5 of 13 stations, the
  // harvest moon is its source). Every pool sits at or below the bottom edge
  // except moonlight, so the horizon band silhouettes against lit sky and the
  // centre stays dark. Region hue = first member's hue (or the regionSource
  // station's) + hueOffset, as for space (skyRegionHues).
  skyRegions: {
    dusk:   { hueOffset: -4, tintSat: 88, tintLight: 44, srcSat: 85, srcLight: 58, pos: '50% 108%', poolW: 110, poolH: 64 },
    bruise: { hueOffset: 0,  tintSat: 55, tintLight: 36, srcSat: 50, srcLight: 50, pos: '16% 106%', poolW: 80, poolH: 66 },
    sick:   { hueOffset: 0,  tintSat: 62, tintLight: 30, srcSat: 60, srcLight: 50, pos: '84% 108%', poolW: 70, poolH: 62 },
    blood:  { hueOffset: 0,  tintSat: 80, tintLight: 34, srcSat: 70, srcLight: 48, pos: '70% 106%', poolW: 76, poolH: 64 },
    fog:    { hueOffset: 0,  tintSat: 12, tintLight: 42, srcSat: 10, srcLight: 50, pos: '45% 104%', poolW: 120, poolH: 60 },
    moon:   { hueOffset: 0,  tintSat: 18, tintLight: 52, srcSat: 14, srcLight: 70, pos: '20% -8%', poolW: 56, poolH: 54 },
  },
  // Per-world primitive kinds (kind -> (dom, w, h, hue, alpha, r, isHeadline,
  // fill, variant) => element); anything not listed falls back to the shared
  // ringPrimitives.js makePrim. `planet` routes only the harvest moon
  // variant here; st1's stub planet still gets the shared one.
  prims: {
    planet: (dom, ...args) => args[7] === 'harvestMoon' ? harvestMoon(dom, ...args) : dom.makePrim('planet', ...args),
  },
  // Per-layer art (spec §2): the horizon band rides the far layer.
  layerArt: { far: horizonBand },

  // Stations 0-9, 11, 12 are Phase 1 stubs (shared kinds). Hues and regions
  // are the Halloween ones. Station 10 is the real harvest moon.
  stations: [
    { key: 'bat flock',       prim: 'dots',          hue: 28,  accent: false, region: 'dusk' },
    { key: "jack-o'-lantern", prim: 'planet',        hue: 30,  accent: false, region: 'dusk' },
    { key: 'bare tree',       prim: 'streak',        hue: 278, accent: false, region: 'bruise' },
    { key: 'gravestone row',  prim: 'binary',        hue: 270, accent: false, region: 'bruise' },
    { key: "will-o'-wisp",    prim: 'pulsar',        hue: 118, accent: false, region: 'sick', noCompanion: true },
    { key: 'falling leaves',  prim: 'asteroidField', hue: 24,  accent: false, region: 'dusk' },
    { key: 'spiderweb',       prim: 'lens',          hue: 40,  accent: false, region: 'moon' },
    { key: 'lantern',         prim: 'spikes',        hue: 36,  accent: false, region: 'dusk' },
    { key: 'haunted house',   prim: 'ring',          hue: 2,   accent: false, region: 'blood' },
    { key: 'fog bank',        prim: 'nebulaCloud',   hue: 220, accent: false, region: 'fog' },
    { key: 'harvest moon',    prim: 'planet',        hue: 32,  accent: false, region: 'dusk', regionSource: true, variant: 'harvestMoon', noCompanion: true },
    { key: 'storm',           prim: 'ribbon',        hue: 266, accent: false, region: 'bruise' },
    { key: 'crow',            prim: 'dots',          hue: 356, accent: false, region: 'blood' },
  ],
}
