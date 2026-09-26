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
import { useEffect, useLayoutEffect, useRef } from 'react'
import RingAmbient from './RingAmbient.jsx'
import { recolorWorld } from '../../lib/ringRecolor.js'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
import { DUO_PALETTES, DUO_GRAPH } from '../../lib/duoGraph.js'
import { isTransitionSlide, outgoingAndIncomingDuo } from '../../lib/duoTransition.js'
import { getTheme } from '../../themes/index.js'

// Same module-scope memo pattern as ringWorldFor.js's own worldCache — a
// duo's recolored world never changes (DUO_PALETTES is static), so this
// only ever computes 17 entries total across the whole app lifetime.
const duoWorldCache = new Map()
function worldForDuo(duoId) {
  if (!duoWorldCache.has(duoId)) {
    duoWorldCache.set(duoId, recolorWorld(midnightGalaxyRing, DUO_PALETTES[duoId], getTheme('midnight-galaxy')))
  }
  return duoWorldCache.get(duoId)
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
function SyncedRingAmbient({ worldData, slideIndex, stationOverride, showStationDebug, forceSnap, exposeDebugGlobal }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    ref.current?.jumpTo(slideIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <RingAmbient
      ref={ref} worldData={worldData} slideIndex={slideIndex}
      stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
      exposeDebugGlobal={exposeDebugGlobal}
    />
  )
}

// v4 (Astra/Codex review, 2026-09-24, against the throwaway spike in
// AmbientAudit.jsx's ?split=1 branch): outgoing world stays fully opaque and
// UNMASKED underneath — masking both layers over black double-attenuates the
// overlap. Only the incoming (top) layer gets the animated mask.
// No shared turn() scheduler here (the spike needed one; it had no real
// slide timeline to drive from) — both RingAmbients receive the same real
// `slideIndex` prop and (via SyncedRingAmbient) are already camera-aligned
// the moment they exist, so they stay in lockstep with no scheduler needed.
function IncomingMask({ children }) {
  const maskRef = useRef(null)

  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (maskRef.current) {
        maskRef.current.style.maskImage = 'linear-gradient(90deg, black 0%, black 100%)'
        maskRef.current.style.webkitMaskImage = maskRef.current.style.maskImage
      }
      return
    }
    let raf, cancelled = false
    const t0 = performance.now()
    function tick() {
      if (cancelled) return
      const t = (performance.now() - t0) / 1000
      // Layered, non-commensurate sine periods — organic drift, not a
      // metronome. Values match the validated v4 spike exactly.
      const angle = 90 + 25 * Math.sin(t * 0.11) + 10 * Math.sin(t * 0.037 + 1.7)
      const center = 50 + 18 * Math.sin(t * 0.07 + 0.6) + 7 * Math.sin(t * 0.023 + 3.1)
      const feather = 26 + 8 * Math.sin(t * 0.05 + 2.2)
      const lo = Math.max(0, center - feather), hi = Math.min(100, center + feather)
      if (maskRef.current) {
        const mask = `linear-gradient(${angle}deg, transparent ${lo}%, black ${hi}%, black 100%)`
        maskRef.current.style.maskImage = mask
        maskRef.current.style.webkitMaskImage = mask
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(raf) }
  }, [])

  return <div ref={maskRef} style={{ position: 'absolute', inset: 0 }}>{children}</div>
}

export default function EvolvingRingAmbient({ showId, slideIndex, stationOverride, showStationDebug, forceSnap }) {
  const transitioning = isTransitionSlide(showId, slideIndex)
  const { outgoing, incoming } = outgoingAndIncomingDuo(showId, DUO_GRAPH, slideIndex)

  // The persistent "current" slot: `outgoing` for the one render where
  // transitioning is true (the pre-existing world, mid-transition), else
  // `incoming` (settled). This value only changes when the walk genuinely
  // advances to a new duo — never twice for the same transition — so
  // keying on it means this slot's RingAmbient survives the whole
  // solo -> transitioning -> solo cycle as ONE instance, only truly
  // remounting when there's real new color data to show. Also fixes a
  // multi-slide host skip that lands on a new duo without ever rendering a
  // transition frame: `currentDuo` still changes value, so the key still
  // changes and the stale instance still gets replaced (RingAmbient itself
  // would otherwise silently ignore the new worldData prop forever).
  const currentDuo = transitioning ? outgoing : incoming

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <SyncedRingAmbient
          key={currentDuo}
          worldData={worldForDuo(currentDuo)} slideIndex={slideIndex}
          stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
          exposeDebugGlobal
        />
      </div>
      {transitioning && (
        <IncomingMask>
          <SyncedRingAmbient
            key={incoming}
            worldData={worldForDuo(incoming)} slideIndex={slideIndex}
            stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
            exposeDebugGlobal={false}
          />
        </IncomingMask>
      )}
    </div>
  )
}
