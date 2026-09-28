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

// Which duos are on screen at slide i, bottom layer first: [current] when
// solo, [outgoing, incoming] on a transition slide.
function visibleDuosAt(showId, i) {
  const { outgoing, incoming } = outgoingAndIncomingDuo(showId, DUO_GRAPH, i)
  return isTransitionSlide(showId, i) ? [outgoing, incoming] : [incoming]
}

// v4 (Astra/Codex review, 2026-09-24, against the throwaway spike in
// AmbientAudit.jsx's ?split=1 branch): outgoing world stays fully opaque and
// UNMASKED underneath — masking both layers over black double-attenuates the
// overlap. Only the incoming (top) layer gets the animated mask.
//
// One wrapper per duo, always the same element type under the same parent,
// whatever its role — so a world keeps its RingAmbient instance while its
// role changes (hidden -> incoming -> current, and back). Before 2026-09-26
// the incoming world lived under its own <IncomingMask> parent and the
// current one under another; React only reuses keyed elements among
// siblings of ONE parent, so at settle the incoming world was thrown away
// and a fresh instance took over — a hard cut instead of a glide.
//
// useLayoutEffect, not useEffect: the mask has to be on before the first
// paint as incoming (else one full-screen frame of the new world) and off
// before the first paint as current (else one frame of the masked-out
// region showing bare backdrop, the outgoing world already being gone).
function DuoLayer({ role, children }) {
  const ref = useRef(null)
  const masked = role === 'incoming'

  useLayoutEffect(() => {
    const el = ref.current
    const setMask = (m) => { el.style.maskImage = m; el.style.webkitMaskImage = m }
    if (!masked) { setMask(''); return }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMask('linear-gradient(90deg, black 0%, black 100%)')
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
      setMask(`linear-gradient(${angle}deg, transparent ${lo}%, black ${hi}%, black 100%)`)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelled = true; cancelAnimationFrame(raf); setMask('') }
  }, [masked])

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', inset: 0,
        zIndex: masked ? 1 : 0,
        visibility: role === 'hidden' ? 'hidden' : 'visible',
      }}
    >
      {children}
    </div>
  )
}

export default function EvolvingRingAmbient({ showId, slideIndex, stationOverride, showStationDebug, forceSnap }) {
  const [current, incoming] = visibleDuosAt(showId, slideIndex)

  // Also keep the duos shown one slide either side mounted, hidden. Every
  // world that appears on an ordinary Next/Prev was then already mounted on
  // the slide before and turned with the rest (every instance gets the same
  // slideIndex), so it glides in instead of arriving as a fresh, already-
  // parked mount. Back-nav is the mirror case: stepping back onto a
  // transition slide needs the outgoing world, which the forward direction
  // had already unmounted. A multi-slide jump still mounts fresh — it snaps
  // anyway (ringNavAction's 'jump').
  // ponytail: up to 3 live RingAmbient trees (vs. 2 before); drop the
  // back-nav neighbor if the venue TV can't carry it.
  const neighbors = Number.isInteger(slideIndex)
    ? [...(slideIndex > 0 ? visibleDuosAt(showId, slideIndex - 1) : []), ...visibleDuosAt(showId, slideIndex + 1)]
    : []

  // Sorted by duo id, not walk order: a fixed global order means React never
  // has to MOVE a surviving wrapper's DOM node (it only inserts/removes
  // around it), and a browser cancels a node's running CSS transitions when
  // it's detached — which would kill the very glide this is protecting.
  // Paint order comes from zIndex instead.
  const duos = [...new Set([current, incoming, ...neighbors].filter(Boolean))].sort()

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {duos.map(duo => {
        const role = duo === incoming ? 'incoming' : duo === current ? 'current' : 'hidden'
        return (
          <DuoLayer key={duo} role={role}>
            <SyncedRingAmbient
              worldData={worldForDuo(duo)} showId={showId} slideIndex={slideIndex}
              stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
              exposeDebugGlobal={role === 'current'}
            />
          </DuoLayer>
        )
      })}
    </div>
  )
}
