// Resolves a theme's ring world (RingAmbient.jsx's worldData prop) from
// per-show overrides. Extracted from ParticleBackground.jsx (2026-09-24) so
// it's unit-testable without importing the whole component tree — no
// ringWorldFor test existed before this file. See design doc §7.1:
// docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'
import { RING_POOL } from '../worlds/ringPool.js'
import { resolveStations } from './drawWorld.js'
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
// Only ever called for arrangementKind 'drawn' (below: no worldPalette, no
// colorEvolution, no forceFixedArrangement) — a host-picked palette was only ever certified against the
// FIXED authored order (palette-sweep.mjs's --seed-batch shelf rows carry
// stations=null), never against a drawn arrangement. Recoloring a fresh
// draw with that palette and only checking assertWorld's cheap hue rules
// (2026-09-28 finding: "gap C" — the real Playwright brightness gate never
// ran on that combination) could put an uncertified picture on a real TV.
// Scoped to station SELECTION only: stations keep their own authored
// per-station hues, same as the base world always has. No recolor means
// assertWorld's dead-band check never runs — nothing to reject, nothing
// to falsely certify either.
// Never throws: any failure (drawStations running out of valid seeds) falls
// back to the tier below, same "never blank the TV" contract every tier in
// this file already keeps.
function autoDrawWorld(base, showId) {
  const showSeed = seedFrom(showId)
  for (let attempt = 0; attempt < AUTO_DRAW_MAX_ATTEMPTS; attempt++) {
    try {
      const seed = hash32(showSeed, AUTO_DRAW_SALT ^ attempt)
      const stations = drawStations(RING_POOL, { seed, slots: base.stations.length, pinKey: 'eclipse', pinAt: 10 })
      return { ...base, stations }
    } catch {
      // Try the next deterministic seed.
    }
  }
  console.warn(`[ring] auto-draw exhausted ${AUTO_DRAW_MAX_ATTEMPTS} attempts for show ${showId}, falling back`)
  return base
}

// The ONE place that decides "which stations, in what order": 'fixed'
// (authored order), 'saved' (a current theme.ringWorld), or 'drawn' (per-show
// auto-draw). resolveArrangement and ringWorldFor both branch on this, so the
// decision can't drift between them (gap C's own root cause was two places
// deciding the same thing; Task 7 then had to add forceFixedArrangement in
// both).
function arrangementKind(theme, showId) {
  // Host's "Fixed layout" pick (ThemePickerModal): no draw, no saved order.
  // colorEvolution gets the same rule worldPalette gets: duos were only ever
  // certified against the fixed authored order (certify-duos.mjs,
  // stations: null). Duo colors on a fresh draw is gap C again — Task 9's
  // live check measured that combination at 80.9 vs the 68 brightness cap.
  if (theme.forceFixedArrangement || theme.colorEvolution) return 'fixed'
  if (theme.ringWorld && theme.ringWorld.ringVersion === RING_VERSION) return 'saved'
  // A host-picked palette was only ever certified against the fixed order
  // (palette-sweep.mjs's shelf rows carry stations=null) — never auto-draw
  // under one (2026-09-28, "gap C").
  if (showId && !theme.worldPalette) return 'drawn'
  return 'fixed'
}

// True when the color-evolution renderer (EvolvingRingAmbient) applies.
// colorEvolution on a theme with no ring world is ignored.
export function isEvolving(theme) {
  return Boolean(theme.colorEvolution && RING_WORLDS[theme.id])
}

// Resolves ONLY the station arrangement (see arrangementKind) — no coloring
// applied. Both the ordinary path (ringWorldFor, below) and the
// color-evolution path (EvolvingRingAmbient.jsx) call this.
export function resolveArrangement(theme, showId) {
  const base = RING_WORLDS[theme.id]
  if (!base) return base
  const kind = arrangementKind(theme, showId)
  if (kind === 'drawn') return autoDrawWorld(base, showId)

  if (kind === 'saved') {
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
        throw new Error(`resolveArrangement: expected ${base.stations.length} stations, got ${stations.length}`)
      }
      if (new Set(stations.map(s => s.key)).size !== stations.length) {
        throw new Error('resolveArrangement: duplicate station keys in a resolved ringWorld')
      }
      return { ...base, stations }
    } catch (err) {
      console.warn('[ring] bad ringWorld arrangement, falling back:', err.message)
      return base
    }
  }

  return base
}

// Adds coloring on top of resolveArrangement's arrangement — it never decides
// the arrangement itself (arrangementKind does):
//   'saved' -> the saved ringWorld.palette painted on the saved order;
//   'drawn' -> the drawn stations with their own authored hues (no recolor);
//   'fixed' -> worldPalette on the fixed order (paletteOnly), else base.
// forceFixedArrangement makes a saved ringWorld 'fixed' (its drawn order is
// exactly what the host opted out of), landing on paletteOnly —
// worldPalette is always written alongside ringWorld, so colors survive.
// A malformed saved value must never blank the TV — every failure mode
// below falls through to the next tier instead of throwing.
export function ringWorldFor(theme, showId) {
  const base = RING_WORLDS[theme.id]
  if (!base) return base
  const kind = arrangementKind(theme, showId)

  if (kind === 'saved') {
    const key = theme.id + '|world|' + JSON.stringify(theme.ringWorld)
    if (!worldCache.has(key)) {
      const arrangement = resolveArrangement(theme, showId)
      try {
        // For 'saved', resolveArrangement returns `base` itself (by
        // identity) ONLY when the saved arrangement failed — a valid one is
        // always a fresh {...base, stations}. A failed arrangement must fall
        // back to paletteOnly/base, never get the saved palette painted onto
        // the authored order (an uncertified pair).
        if (arrangement === base) throw new Error('saved arrangement did not resolve')
        worldCache.set(key, recolorWorld(arrangement, theme.ringWorld.palette, getTheme(theme.id)))
      } catch (err) {
        console.warn('[ring] bad ringWorld, falling back:', err.message)
        worldCache.set(key, paletteOnly(theme, base) ?? base)
      }
    }
    return worldCache.get(key)
  }

  if (kind === 'drawn') {
    const key = theme.id + '|autodraw|' + showId
    if (!worldCache.has(key)) {
      worldCache.set(key, resolveArrangement(theme, showId))
    }
    return worldCache.get(key)
  }

  return paletteOnly(theme, base) ?? base
}
