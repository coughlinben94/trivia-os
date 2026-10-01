// Night-color-evolution — the live render layer for the duo walk
// (docs/superpowers/specs/2026-09-24-ring-world-night-color-evolution-design.md,
// docs/superpowers/plans/2026-09-26-ring-world-night-color-evolution-wiring.md).
// Decides, purely from (showId, ringVisibleSlideIndex), whether to render one
// world (the current duo) or two (a live split transition between the
// outgoing and incoming duo) — no stored state, same recompute-don't-store
// discipline duoWalk.js/duoTransition.js already use.
//
// Real bug found by an adversarial Codex review (2026-09-26) of the first
// version of this file, confirmed against RingAmbient.jsx's own documented
// contract before fixing: RingAmbient never re-runs on a worldData/slideIndex
// change after mount (its DOM is built once, forever, per instance) and its
// camera (stationRef) always starts at 0. The first version switched between
// returning a single <RingAmbient> and a <SplitTransition> wrapping two —
// different element types at the same tree position — so EVERY transition
// boundary unmounted whatever was playing and remounted two fresh instances
// at station 0, and a host multi-slide skip that landed on a new duo without
// ever rendering a transition frame silently kept the STALE duo (RingAmbient
// ignored the new worldData prop entirely). Fixed below by (1) keying the
// "current" slot by duo id so it's the SAME element instance for as long as
// that duo is actually showing — across the whole solo -> transitioning ->
// solo cycle, not just within one phase of it — and only truly remounting
// when the duo itself changes, and (2) snapping every freshly mounted
// instance to the correct station via RingAmbient's own exposed jumpTo()
// (see SyncedRingAmbient) instead of leaving it to drift from 0.
// (1) was only half the fix — see DuoLayer below for the settle-slide cut
// it still left, and the one-slide-either-side preload that replaced it.
import { useLayoutEffect, useRef } from 'react'
import RingAmbient from './RingAmbient.jsx'
import { recolorWorld } from '../../lib/ringRecolor.js'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
import { DUO_PALETTES, DUO_GRAPH } from '../../lib/duoGraph.js'
import { outgoingAndIncomingDuo } from '../../lib/duoTransition.js'
import { getTheme } from '../../themes/index.js'

// Same module-scope memo pattern as ringWorldFor.js's own worldCache — a
// duo's recolored world never changes (DUO_PALETTES is static), so this
// only ever computes 17 entries total across the whole app lifetime.
const duoWorldCache = new Map()
export function worldForDuo(duoId, arrangement) {
  const key = duoId + '|' + arrangement.stations.map(s => s.key).join(',')
  if (!duoWorldCache.has(key)) {
    duoWorldCache.set(key, recolorWorld(arrangement, DUO_PALETTES[duoId], getTheme('midnight-galaxy')))
  }
  return duoWorldCache.get(key)
}

// Wraps RingAmbient with a mount-once camera sync. RingAmbient's own
// slideIndex effect stays silent on mount (prev===next===slideIndex, see
// ringStationIndex.js's ringNavAction — it only reacts to CHANGES after
// mount), so a freshly mounted instance sits at station 0 until the next
// ordinary slide advance nudges it — a visible camera snap right when a new
// duo takes over, or on the incoming half of a split. jumpTo() (already
// exposed for exactly this "authoritative resync" purpose, per its own
// comment) fixes the camera to the correct station before first paint
// instead. useLayoutEffect (not useEffect) so it lands before the browser
// ever paints this instance's initial station-0 build.
function SyncedRingAmbient({ worldData, showId, slideIndex, stationOverride, showStationDebug, forceSnap, exposeDebugGlobal }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    ref.current?.jumpTo(slideIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <RingAmbient
      ref={ref} worldData={worldData} showId={showId} slideIndex={slideIndex}
      stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
      exposeDebugGlobal={exposeDebugGlobal}
    />
  )
}

// One duo per slide: the duo for this slide's walk step. Crossfade only —
// no wipe, no mask, no edge. Ben (2026-10-01): never two worlds on one slide,
// and the switch must flow seamlessly.
function duoAt(showId, i) {
  return outgoingAndIncomingDuo(showId, DUO_GRAPH, i).incoming
}

// Ben's spec (2026-10-01): the camera parks on the station with the old world
// showing, the old world fades to black, holds black a moment, then the new
// world fades in. Sequential, never overlapping.
const GLIDE_MS = 1700 // RingAmbient's camera glide (1.7s ease-out) — fades wait for it
const OUT_MS = 800
const HOLD_MS = 400
const IN_MS = 1200

// One wrapper per duo, always the same element type under the same parent,
// so a world keeps its RingAmbient instance while its role changes.
function DuoLayer({ current, children }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [glide, out, hold, inn] = reduced ? [0, 0, 0, 0] : [GLIDE_MS, OUT_MS, HOLD_MS, IN_MS]
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        opacity: current ? 1 : 0,
        transition: current
          ? `opacity ${inn}ms ease-in-out ${glide + out + hold}ms`
          : `opacity ${out}ms ease-in-out ${glide}ms`,
      }}
    >
      {children}
    </div>
  )
}

export default function EvolvingRingAmbient({ showId, slideIndex, arrangement = midnightGalaxyRing, stationOverride, showStationDebug, forceSnap }) {
  const current = duoAt(showId, slideIndex)

  // Also keep the duos one slide either side mounted, so the world arriving on
  // the next slide (and the one leaving) already glides with the camera
  // instead of mounting parked. A multi-slide jump still mounts fresh — it
  // snaps anyway (ringNavAction's 'jump').
  // ponytail: up to 3 live RingAmbient trees; drop the back-nav neighbor if
  // the venue TV can't carry it.
  const neighbors = Number.isInteger(slideIndex)
    ? [...(slideIndex > 0 ? [duoAt(showId, slideIndex - 1)] : []), duoAt(showId, slideIndex + 1)]
    : []

  // Sorted by duo id so React never has to MOVE a surviving wrapper's DOM
  // node (a detach cancels its running CSS transition).
  const duos = [...new Set([current, ...neighbors].filter(Boolean))].sort()

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      {duos.map(duo => (
        <DuoLayer key={duo} current={duo === current}>
          <SyncedRingAmbient
            worldData={worldForDuo(duo, arrangement)} showId={showId} slideIndex={slideIndex}
            stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
            exposeDebugGlobal={duo === current}
          />
        </DuoLayer>
      ))}
    </div>
  )
}
