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

// assertWorld validates a freshly-drawn world only. The real, shipped
// 13-station ring (midnightGalaxyRing + RING_POOL) fails the family-spacing
// rule below under all 9 shipped color presets — stations 3/4 ("amber
// planet"/"lit planet") are both family: 'radial-mass', 1 slot apart. This
// is a known, accepted tradeoff in the authored art (see
// worlds/midnightGalaxy.ring.js:126), not a bug here — a future
// fall-back-to-authored path must not re-run assertWorld against it.
export function assertWorld(world) {
  assertRing(world.stations)

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

  // Certified (Supabase ring_palettes, Playwright luminance/contrast gate)
  // does not mean assertWorld-passing: certification checks the palette's
  // own anchor colors, not each station's derived hue after derivePalette's
  // ±18° spread. At least 2 of the current 9 shelf presets ("Amber & Rose",
  // "Crimson & Gold") produce derived station hues inside the dead band and
  // will make assertWorld throw below. A future integration needs a shelf
  // pre-filter, a re-draw on a different seed, or certification extended to
  // check derived hues — not decided here.
  //
  // Also: this draw's real identity is (showId, pool contents, shelf
  // contents), not just showId — palSeed/nounSeed are reduced modulo the
  // current array lengths, so adding/removing one pool entry or shelf row
  // silently re-rolls every existing show's draw, not just new ones. A
  // future persistence layer needs to account for that.
  const palette = shelf[palSeed % shelf.length]

  const world = recolorWorld({ ...base, stations }, palette, baseTheme)
  assertWorld(world)

  return { world, showSeed, nounSeed, palSeed }
}
