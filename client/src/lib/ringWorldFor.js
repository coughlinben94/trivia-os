// Resolves a theme's ring world (RingAmbient.jsx's worldData prop) from
// per-show overrides. Extracted from ParticleBackground.jsx (2026-09-24) so
// it's unit-testable without importing the whole component tree — no
// ringWorldFor test existed before this file. See design doc §7.1:
// docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'
import { RING_POOL } from '../worlds/ringPool.js'
import { resolveStations, assertWorld } from './drawWorld.js'
import { drawStations } from './ringDraw.js'
import { recolorWorld } from './ringRecolor.js'
import { RING_VERSION } from './ringCertification.js'
import { getTheme } from '../themes/index.js'
import { seedFrom } from './paletteGenerator.js'
import { hash32 } from './ringEngine.js'

// Plug-and-play: every ring-based ambient registers here by theme id -> its
// worldData module. ENGINE (frame geometry, layer config, SURGE_MS) stays
// module-scoped inside RingAmbient.jsx, not derived per-world — a world
// that reuses that geometry is a two-line drop-in; one that needs different
// geometry is a RingAmbient.jsx change, not just a registry entry.
export const RING_WORLDS = {
  'midnight-galaxy': midnightGalaxyRing,
}

// Memoized at module scope (not per-component state) so WarpTransition.jsx
// can read the identical recolored object ParticleBackground built, without
// either side recomputing it.
const worldCache = new Map()

function paletteOnly(theme, base) {
  if (!theme.worldPalette) return null
  const key = theme.id + '|palette|' + JSON.stringify(theme.worldPalette)
  if (!worldCache.has(key)) {
    try {
      worldCache.set(key, recolorWorld(base, theme.worldPalette, getTheme(theme.id)))
    } catch (err) {
      console.warn('[ring] bad worldPalette, using base:', err.message)
      worldCache.set(key, base)
    }
  }
  return worldCache.get(key)
}

const AUTO_DRAW_SALT = 0x41445257 // 'ADRW'
const AUTO_DRAW_MAX_ATTEMPTS = 20

// Deterministically draws a per-show station arrangement (2026-09-25, Ben:
// "go turn it on" — the pool/draw/assertRing machinery below already
// shipped 2026-09-24 but had never been wired into a live show; every real
// show up to tonight rendered the fixed authored order every time). Seeded
// from showId, not Math.random, so a /display reload mid-show never re-rolls
// the arrangement a room full of people already saw (same reproducible-
// recompute pattern as duoWalk.js and TeamPickerSlide's seededShuffle).
//
// Deliberately does NOT run this draw through the color-evolution duo
// system or any new certification model — that combination was reviewed
// this session and found to fail assertWorld on the large majority of
// arrangement/palette pairs (0/300 sampled arrangements passed all 15
// duos). Scope held to station SELECTION only:
//   - No theme.worldPalette set (the common case: no host has applied a
//     custom palette): stations keep their own authored per-station hues,
//     same as the base world always has. assertWorld's dead-band check
//     never runs, because no recolor happens — nothing to reject.
//   - theme.worldPalette set: recolor against it and require assertWorld to
//     pass, retrying deterministic seeds up to AUTO_DRAW_MAX_ATTEMPTS (same
//     retry shape as WorldPaletteEditor.jsx's reRollObjects), falling back
//     to paletteOnly (today's fixed-order + palette combination) on
//     exhaustion.
// Never throws: any failure at any attempt falls back to the tier below,
// same "never blank the TV" contract every tier in this file already keeps.
function autoDrawWorld(theme, base, showId) {
  const showSeed = seedFrom(showId)
  for (let attempt = 0; attempt < AUTO_DRAW_MAX_ATTEMPTS; attempt++) {
    try {
      const seed = hash32(showSeed, AUTO_DRAW_SALT ^ attempt)
      const stations = drawStations(RING_POOL, { seed, slots: base.stations.length, pinKey: 'eclipse', pinAt: 10 })
      if (!theme.worldPalette) return { ...base, stations }
      const world = recolorWorld({ ...base, stations }, theme.worldPalette, getTheme(theme.id))
      assertWorld(world)
      return world
    } catch {
      // Try the next deterministic seed.
    }
  }
  console.warn(`[ring] auto-draw exhausted ${AUTO_DRAW_MAX_ATTEMPTS} attempts for show ${showId}, falling back`)
  return paletteOnly(theme, base) ?? base
}

// theme.ringWorld (a drawn world: stations + palette) wins when present and
// its ringVersion is current; a per-show auto-draw (above) is the next
// fallback when showId is known; theme.worldPalette (palette-only, fixed
// authored order) is the fallback after that; the unmodified base world is
// the fallback of the fallback. A malformed saved value must never blank
// the TV — every failure mode below falls through to the next tier instead
// of throwing.
export function ringWorldFor(theme, showId) {
  const base = RING_WORLDS[theme.id]
  if (!base) return base

  if (theme.ringWorld && theme.ringWorld.ringVersion === RING_VERSION) {
    const key = theme.id + '|world|' + JSON.stringify(theme.ringWorld)
    if (!worldCache.has(key)) {
      try {
        // Resolve against RING_POOL, which carries the full station objects
        // (variant, region, regionSource, noCompanion, companionKind), not a
        // reduced projection. Before 2026-09-24, a reduced {key,prim,hue,accent,
        // family} pool silently dropped those fields at render time — see
        // references/ring-world-mistakes.md.
        const stations = resolveStations(RING_POOL, theme.ringWorld.stations)
        // Structural crash-safety: a stations array that resolves cleanly
        // but is the wrong length or has a duplicate key still reaches
        // RingAmbient.jsx (fixed station count, no such check), which can
        // throw there instead of here — and ParticleBackground.jsx's error
        // boundary swallows that, blanking the whole ambient background
        // instead of falling back through this chain. NOT assertRing: it
        // also enforces family-spacing/prim-adjacency rules that the real
        // SHIPPED authored order itself already fails (drawWorld.js's own
        // comment — "a future fall-back-to-authored path must not re-run
        // assertWorld against it"), so calling it here would reject every
        // legitimate saved ringWorld, including the authored order itself.
        if (stations.length !== base.stations.length) {
          throw new Error(`ringWorldFor: expected ${base.stations.length} stations, got ${stations.length}`)
        }
        if (new Set(stations.map(s => s.key)).size !== stations.length) {
          throw new Error('ringWorldFor: duplicate station keys in a resolved ringWorld')
        }
        worldCache.set(key, recolorWorld({ ...base, stations }, theme.ringWorld.palette, getTheme(theme.id)))
      } catch (err) {
        console.warn('[ring] bad ringWorld, falling back:', err.message)
        worldCache.set(key, paletteOnly(theme, base) ?? base)
      }
    }
    return worldCache.get(key)
  }

  if (showId) {
    const key = theme.id + '|autodraw|' + showId + '|' + JSON.stringify(theme.worldPalette ?? null)
    if (!worldCache.has(key)) {
      worldCache.set(key, autoDrawWorld(theme, base, showId))
    }
    return worldCache.get(key)
  }

  return paletteOnly(theme, base) ?? base
}
