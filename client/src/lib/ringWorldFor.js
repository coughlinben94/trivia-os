// Resolves a theme's ring world (RingAmbient.jsx's worldData prop) from
// per-show overrides. Extracted from ParticleBackground.jsx (2026-09-24) so
// it's unit-testable without importing the whole component tree — no
// ringWorldFor test existed before this file. See design doc §7.1:
// docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'
import { resolveStations } from './drawWorld.js'
import { recolorWorld } from './ringRecolor.js'
import { RING_VERSION } from './ringCertification.js'
import { getTheme } from '../themes/index.js'

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

// theme.ringWorld (a drawn world: stations + palette) wins when present and
// its ringVersion is current; theme.worldPalette (palette-only) is the next
// fallback; the unmodified base world is the fallback of the fallback. A
// malformed saved value must never blank the TV — every failure mode below
// falls through to the next tier instead of throwing.
export function ringWorldFor(theme) {
  const base = RING_WORLDS[theme.id]
  if (!base) return base

  if (theme.ringWorld && theme.ringWorld.ringVersion === RING_VERSION) {
    const key = theme.id + '|world|' + JSON.stringify(theme.ringWorld)
    if (!worldCache.has(key)) {
      try {
        // Resolve against the FULL authored station objects, not RING_POOL —
        // RING_POOL is the reduced {key,prim,hue,accent,family} shape built
        // only for drawStations' noun-selection algorithm. Resolving a
        // drawn world's render data against it silently drops every field
        // RingAmbient.jsx reads by station identity (variant, region,
        // regionSource, noCompanion, companionKind) — see
        // references/ring-world-mistakes.md and
        // docs/superpowers/plans/2026-09-14-ring-world-shelf-stations.md.
        const stations = resolveStations(midnightGalaxyRing.stations, theme.ringWorld.stations)
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

  return paletteOnly(theme, base) ?? base
}
