//
// Composition layer: one noun draw + one palette pick = one world. See
// docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md
// §2.3 for the exact mechanism this file implements.
import { assertRing, drawStations } from './ringDraw.js'
import { skyRegionHues } from './ringPrimitives.js'
import { recolorWorld, regionHueWarnings } from './ringRecolor.js'
import { DEAD_BAND } from './weightedPalette.js'
import { seedFrom } from './paletteGenerator.js'
import { hash32 } from './ringEngine.js'

export function assertWorld(world) {
  assertRing(world.stations, { slots: world.stations.length })

  const regionHues = skyRegionHues(world.stations)
  const warnings = regionHueWarnings(regionHues, world.hueAnchors)
  if (warnings.length) {
    throw new Error(`assertWorld: ${warnings.join(' ')}`)
  }

  for (const st of world.stations) {
    const h = ((st.hue % 360) + 360) % 360
    if (h >= DEAD_BAND[0] && h < DEAD_BAND[1]) {
      throw new Error(`assertWorld: station "${st.key}" hue ${h}deg is inside the dead band [${DEAD_BAND[0]},${DEAD_BAND[1]})`)
    }
  }

  return true
}

const NOUN_SALT = 0x4E4F554E // 'NOUN'
const COLR_SALT = 0x434F4C52 // 'COLR'

export function drawWorld({ base, pool, shelf, showId, baseTheme, pinKey = 'record', pinAt = 10 }) {
  if (!shelf.length) throw new Error('drawWorld: no certified palettes on the shelf')

  const showSeed = seedFrom(showId)
  const nounSeed = hash32(showSeed, NOUN_SALT)
  const palSeed = hash32(showSeed, COLR_SALT)

  const stations = drawStations(pool, { seed: nounSeed, slots: base.stations.length, pinKey, pinAt })
  const palette = shelf[palSeed % shelf.length]

  const world = recolorWorld({ ...base, stations }, palette, baseTheme)
  assertWorld(world)

  return { world, showSeed, nounSeed, palSeed }
}
