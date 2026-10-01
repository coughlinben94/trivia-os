// haunted-october forest world data (Halloween forest spec §2.4, Phase 3b-3).
// Renderer-neutral: ForestAmbient draws it (renderer:'forest'); ringWorldFor
// returns it before any ring palette/draw logic. Replaces the Phase 1-2 ring
// stub (hauntedOctober.ring.js/.slots.js/.art.js, now only in git history).
// `approved: false` keeps it out of the host pickers until Ben signs it off.
import { THEMES } from '../themes/index.js'
import { skyFromTheme } from '../lib/ringEngine.js'

// forestGen.js's 13 landmark names, in station order (hauntedOctober.world.test
// pins the match); station 10 keeps the key 'harvest moon' that the music-station
// routing and its tests read.
const KEYS = [
  'forest edge, broken fence gate', 'lantern on a post', 'scarecrow with a pumpkin head',
  'leaning gravestone row', "row of jack-o'-lanterns", 'crow on a stump', 'stone well, glowing green',
  'abandoned cart', 'fallen log, glowing mushrooms', "will-o'-wisps over a bog", 'harvest moon',
  'cabin with a lit window', 'signpost with a skull',
]

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
  }
}
