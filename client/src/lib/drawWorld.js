//
// Composition layer: one noun draw + one palette pick = one world. See
// docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md
// §2.3 for the exact mechanism this file implements.
import { assertRing } from './ringDraw.js'
import { skyRegionHues } from './ringPrimitives.js'
import { regionHueWarnings } from './ringRecolor.js'
import { DEAD_BAND } from './weightedPalette.js'

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
