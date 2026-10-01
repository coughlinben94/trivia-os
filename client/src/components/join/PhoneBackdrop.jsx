// /join Tier 2 static backdrop for forest worlds (Halloween spec §4 item 11,
// Phase 3d-3). Static CSS gradient + inline SVG only: no canvas, no frame
// loop, no motion of any kind, no ring. The station's sky colors come from
// world.phone.skies (derived from the TV's sky cards, see
// hauntedOctober.world.js). Sits behind Join's content (zIndex -1, fixed),
// never takes taps, hidden from screen readers.
// Loaded only via phoneBackdropThemes.js's dynamic import (forest themes).
import { RING_WORLDS } from '../../lib/ringWorldFor.js'
import { sortSlides } from '../../lib/slideStepping.js'
import { resolveRingSlideIndex } from '../../lib/ringStationResolver.js'

// The show theme's world, only when it is a forest world; null for space and
// every other theme (Join mounts nothing and changes nothing for those).
export function phoneBackdropWorld(themeId) {
  const w = RING_WORLDS[themeId]
  return w?.renderer === 'forest' ? w : null
}

// The TV's station for the HOST's live slide (show.current_slide_index), never
// a phone's browsing position. Not live = station 0. The grading-break
// override and the TV's warp are deliberately not mirrored: a phone always
// shows the slide's own station.
export function phoneStationIndex(show, stationCount = 13) {
  if (!show?.is_live) return 0
  return resolveRingSlideIndex(sortSlides(show.slides), show.current_slide_index) % stationCount
}

export default function PhoneBackdrop({ world, stationIndex }) {
  if (world?.renderer !== 'forest') return null
  const skies = world.phone?.skies
  if (!skies?.length) return null
  const sky = skies[((stationIndex ?? 0) % skies.length + skies.length) % skies.length]
  return (
    <div
      aria-hidden="true"
      data-phone-backdrop={stationIndex ?? 0}
      style={{
        position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden',
        background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.mid} 55%, ${sky.horizon} 88%)`,
      }}
    >
      <svg
        viewBox="0 0 400 100" preserveAspectRatio="none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '22%', display: 'block' }}
      >
        {/* far treeline */}
        <path fill="#141414" d="M0 62 L18 58 L30 40 L36 57 L60 54 L74 30 L82 53 L120 56 L134 36 L141 55 L170 52 L190 26 L198 51 L240 55 L252 38 L258 54 L300 50 L316 28 L324 52 L360 55 L372 34 L379 54 L400 52 L400 100 L0 100 Z" />
        {/* near trunks */}
        <path fill="#0b0a09" d="M22 100 L26 18 L30 100 Z M96 100 L101 8 L106 100 Z M214 100 L218 22 L222 100 Z M338 100 L343 4 L348 100 Z" />
        {/* ground */}
        <path fill="#060504" d="M0 78 Q60 70 120 76 T240 74 T400 76 L400 100 L0 100 Z" />
      </svg>
    </div>
  )
}
