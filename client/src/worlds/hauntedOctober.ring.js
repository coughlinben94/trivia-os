// haunted-october ring world — docs/superpowers/specs/2026-09-28-halloween-ring-world-design.md.
//
// STUB: replaced in Phase 2-4. Phase 1 only proves the per-world seams
// (config below) plug in; every station is a shared ringPrimitives.js kind
// standing in for its §3 noun. `approved: false` keeps it out of the host
// pickers until Ben signs the real world off.
import { THEMES } from '../themes/index.js'
import { floorContrast } from '../lib/contrast.js'
import { skyFromTheme } from '../lib/ringEngine.js'
import { BASE_TINTS } from '../lib/ringPrimitives.js'
import { SLOTS } from './hauntedOctober.slots.js'

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
  // here). STUB: one orange region; the real six-region model is Phase 2.
  skyRegions: {
    dusk: { hueOffset: 0, tintSat: 62, tintLight: 28, srcSat: 70, srcLight: 60, pos: '50% 112%', poolW: 58, poolH: 62 },
  },
  // Per-world primitive kinds (kind -> (dom, w, h, hue, alpha, r, isHeadline,
  // fill, variant) => element). Empty until Phase 3; shared kinds fall back
  // to ringPrimitives.js makePrim.
  prims: {},

  stations: [
    { key: 'bat flock',       prim: 'dots',          hue: 30,  accent: false },
    { key: "jack-o'-lantern", prim: 'planet',        hue: 28,  accent: false },
    { key: 'bare tree',       prim: 'streak',        hue: 20,  accent: false },
    { key: 'gravestone row',  prim: 'binary',        hue: 270, accent: false },
    { key: "will-o'-wisp",    prim: 'pulsar',        hue: 110, accent: false, noCompanion: true },
    { key: 'falling leaves',  prim: 'asteroidField', hue: 24,  accent: false },
    { key: 'spiderweb',       prim: 'lens',          hue: 40,  accent: false },
    { key: 'lantern',         prim: 'spikes',        hue: 36,  accent: false },
    { key: 'haunted house',   prim: 'ring',          hue: 0,   accent: false },
    { key: 'fog bank',        prim: 'nebulaCloud',   hue: 220, accent: false },
    { key: 'harvest moon',    prim: 'planet',        hue: 32,  accent: false, region: 'dusk', regionSource: true },
    { key: 'storm',           prim: 'ribbon',        hue: 260, accent: false },
    { key: 'crow',            prim: 'dots',          hue: 280, accent: false },
  ],
}
