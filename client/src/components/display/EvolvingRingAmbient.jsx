// Night-color-evolution — the live render layer for the duo walk
// (docs/superpowers/specs/2026-09-24-ring-world-night-color-evolution-design.md,
// docs/superpowers/plans/2026-09-26-ring-world-night-color-evolution-wiring.md).
// Decides, purely from (showId, ringVisibleSlideIndex), whether to render one
// world (the current duo) or two (a live split transition between the
// outgoing and incoming duo) — no stored state, same recompute-don't-store
// discipline duoWalk.js/duoTransition.js already use.
import { useEffect, useRef } from 'react'
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

// v4 (Astra/Codex review, 2026-09-24, against the throwaway spike in
// AmbientAudit.jsx's ?split=1 branch): outgoing world stays fully opaque and
// UNMASKED underneath — masking both layers over black double-attenuates the
// overlap. Only the incoming (top) layer gets the animated mask.
// No shared turn() scheduler here (the spike needed one; it had no real
// slide timeline to drive from) — both RingAmbients below receive the same
// real `slideIndex` prop and each independently derives its own camera
// position from it, so they stay in lockstep automatically. Verified live
// per docs/superpowers/plans/2026-09-26-.../Task 5.
function SplitTransition({ outgoingWorld, incomingWorld, slideIndex, stationOverride, showStationDebug, forceSnap }) {
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

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <RingAmbient
          worldData={outgoingWorld} slideIndex={slideIndex}
          stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
          exposeDebugGlobal={false}
        />
      </div>
      <div ref={maskRef} style={{ position: 'absolute', inset: 0 }}>
        <RingAmbient
          worldData={incomingWorld} slideIndex={slideIndex}
          stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
        />
      </div>
    </div>
  )
}

export default function EvolvingRingAmbient({ showId, slideIndex, stationOverride, showStationDebug, forceSnap }) {
  const transitioning = isTransitionSlide(showId, slideIndex)
  const { outgoing, incoming } = outgoingAndIncomingDuo(showId, DUO_GRAPH, slideIndex)

  if (!transitioning) {
    return (
      <RingAmbient
        worldData={worldForDuo(incoming)} slideIndex={slideIndex}
        stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
      />
    )
  }

  return (
    <SplitTransition
      outgoingWorld={worldForDuo(outgoing)} incomingWorld={worldForDuo(incoming)}
      slideIndex={slideIndex} stationOverride={stationOverride}
      showStationDebug={showStationDebug} forceSnap={forceSnap}
    />
  )
}
