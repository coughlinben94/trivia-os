// haunted-october forest world data (Halloween forest spec §2.4, Phase 3b-3).
// Renderer-neutral: ForestAmbient draws it (renderer:'forest'); ringWorldFor
// returns it before any ring palette/draw logic. Replaces the Phase 1-2 ring
// stub (hauntedOctober.ring.js/.slots.js/.art.js, now only in git history).
// `approved: false` keeps it out of the host pickers until Ben signs it off.
import { THEMES } from '../themes/index.js'
import { skyFromTheme } from '../lib/ringEngine.js'
import { hexToRgb, rgbToHex } from '../lib/oklab.js'

// forestGen.js's 13 landmark names, in station order (hauntedOctober.world.test
// pins the match); station 10 keeps the key 'harvest moon' that the music-station
// routing and its tests read.
const KEYS = [
  'forest edge, broken fence gate', 'lantern on a post', 'scarecrow with a pumpkin head',
  'leaning gravestone row', "row of jack-o'-lanterns", 'crow on a stump', 'stone well, glowing green',
  'abandoned cart', 'fallen log, glowing mushrooms', "will-o'-wisps over a bog", 'harvest moon',
  'cabin with a lit window', 'signpost with a skull',
]

// Phone backdrop skies (/join Tier 2, Phase 3d-3), DERIVED from the TV's own
// sky in forestScene.js, not invented. Every station starts from the shared
// base sky gradient (forestScene sky.innerHTML: '#08090b 48px', '#16171a
// 468px', '#28292b 738px' = top/mid/horizon). Only three stations carry a
// sky card (.sl data-st) there, so only those three tint; each card's peak
// color/alpha is alpha-composited over the matching band:
//   st 0  horizon glow  rgba(150,86,40,.32) over horizon
//   st 3  moonbeam      #b4c6de at .21 x its vertical mask (.45 top, 1 mid, .2 bottom)
//   st 10 harvest moon  forestGen moonSvg halo 'mh': #e88a3a @.4 over top, #c8662a @.15 over mid
// hauntedOctober.world.test pins these source strings and the composites.
const BASE_SKY = { top: '#08090b', mid: '#16171a', horizon: '#28292b' }
function over(baseHex, overHex, a) {
  const b = hexToRgb(baseHex), o = hexToRgb(overHex)
  return rgbToHex(b.map((v, i) => Math.round(v * (1 - a) + o[i] * a)))
}
const SKY_CARDS = {
  0: { horizon: ['#965628', 0.32] },
  3: { top: ['#b4c6de', 0.21 * 0.45], mid: ['#b4c6de', 0.21], horizon: ['#b4c6de', 0.21 * 0.2] },
  10: { top: ['#e88a3a', 0.4], mid: ['#c8662a', 0.15] },
}
export const PHONE_SKIES = KEYS.map((_, st) => {
  const sky = { ...BASE_SKY }
  for (const [band, [hex, a]] of Object.entries(SKY_CARDS[st] ?? {})) sky[band] = over(sky[band], hex, a)
  return sky
})

// Never throws: a missing THEMES entry must not take the space world down
// with it at import time (ringWorldFor imports this module).
export function makeHauntedWorld() {
  const theme = THEMES.find(t => t.id === 'haunted-october')
  if (!theme) {
    console.error('[hauntedOctober.world] no THEMES entry with id "haunted-october"; forest world not registered')
    return null
  }
  const c = theme.colors
  return {
    renderer: 'forest',
    id: 'haunted-october',
    type: 'terrestrial', // one of ring-verify's WORLD.type values
    name: 'Haunted October',
    approved: false,
    stations: KEYS.map(key => ({ key })),
    layers: { stars: false },
    // WarpTransition (grading-break warp) reads sky[2], sky[last].
    sky: skyFromTheme(theme),
    // WarpTransition rotates its cool bands onto starTint3's hue and its warm
    // target onto drift's: both warm here (peach highlight, pumpkin orange).
    tints: { starTint3: c.highlight, drift: c.shinyAccent },
    musicStation: 10, // the harvest moon
    walk: { durMs: 4000, stepM: 6 },
    phone: { skies: PHONE_SKIES },
  }
}
