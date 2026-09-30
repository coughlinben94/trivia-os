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
import { useId, useLayoutEffect, useMemo, useRef } from 'react'
import RingAmbient from './RingAmbient.jsx'
import { recolorWorld } from '../../lib/ringRecolor.js'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
import { DUO_PALETTES, DUO_GRAPH } from '../../lib/duoGraph.js'
import { isTransitionSlide, outgoingAndIncomingDuo, stepIndexForSlide, transitionWipeFor } from '../../lib/duoTransition.js'
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
function wipePath(wipe, progress) {
  if (progress <= 0) return 'M -300 -300 H -300 V 1300 H -300 Z'
  if (progress >= 1) return 'M -300 -300 H 1300 V 1300 H -300 Z'
  // direction +1 sweeps from left to right; -1 sweeps from right to left.
  const travel = wipe.direction > 0 ? -800 + progress * 2600 : 1800 - progress * 2600
  const slope = Math.tan(wipe.angleDeg * Math.PI / 180)
  const xAt = (y) => travel + slope * (y - 500)
    + Math.sign(wipe.direction) * wipe.bulge * 10 * Math.exp(-((y - wipe.centerY * 10) ** 2) / 180000)
    + wipe.warp * 10 * Math.sin((y / 1000) * Math.PI * 2)
  const ys = [0, 250, 500, 750, 1000]
  const points = ys.map(y => ({ x: xAt(y), y }))
  const curveThrough = (curvePoints) => curvePoints.slice(0, -1).map((point, i) => {
    const previous = curvePoints[Math.max(0, i - 1)]
    const next = curvePoints[i + 1]
    const after = curvePoints[Math.min(curvePoints.length - 1, i + 2)]
    const c1 = { x: point.x + (next.x - previous.x) / 6, y: point.y + (next.y - previous.y) / 6 }
    const c2 = { x: next.x - (after.x - point.x) / 6, y: next.y - (after.y - point.y) / 6 }
    return `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${next.x} ${next.y}`
  }).join(' ')
  const curves = curveThrough(points)
  const top = points[0].x, bottom = points.at(-1).x
  const revealLeft = wipe.direction > 0
  return revealLeft
    ? `M ${top} 0 L -300 0 L -300 1000 L ${bottom} 1000 ${curveThrough([...points].reverse())} Z`
    : `M ${top} 0 ${curves} L 1300 1000 L 1300 0 Z`
}

function DuoLayer({ role, children, wipe }) {
  const ref = useRef(null)
  const pathRef = useRef(null)
  const maskId = `duo-wipe-${useId().replaceAll(':', '')}`
  const filterId = `${maskId}-soften`
  const masked = role === 'incoming'

  useLayoutEffect(() => {
    const el = ref.current
    const setMask = (m) => { el.style.maskImage = m; el.style.webkitMaskImage = m }
    if (!masked || !wipe) { setMask(''); return }
    setMask(`url("#${maskId}")`)
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (pathRef.current) pathRef.current.setAttribute('d', 'M -300 -300 H 1300 V 1300 H -300 Z')
      return
    }
    let raf, cancelled = false
    const t0 = performance.now()
    function tick() {
      if (cancelled) return
      const progress = Math.min(1, (performance.now() - t0) / 1200)
      if (pathRef.current) pathRef.current.setAttribute('d', wipePath(wipe, progress))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelled = true; if (raf != null) cancelAnimationFrame(raf); setMask('') }
  }, [masked, wipe, maskId])

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', inset: 0,
        zIndex: masked ? 1 : 0,
        visibility: role === 'hidden' ? 'hidden' : 'visible',
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={wipe?.feather ? wipe.feather * 2 : 0} />
          </filter>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="-300" y="-300" width="1600" height="1600">
            <path ref={pathRef} d="M -300 -300 H 1300 V 1300 H -300 Z" fill="white" filter={`url(#${filterId})`} />
          </mask>
        </defs>
      </svg>
      {children}
    </div>
  )
}

export default function EvolvingRingAmbient({ showId, slideIndex, arrangement = midnightGalaxyRing, stationOverride, showStationDebug, forceSnap }) {
  const [current, incoming] = visibleDuosAt(showId, slideIndex)
  const transitioning = isTransitionSlide(showId, slideIndex)
  const wipe = useMemo(
    () => transitioning ? transitionWipeFor(showId, stepIndexForSlide(showId, slideIndex)) : null,
    [transitioning, showId, slideIndex],
  )

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
          <DuoLayer key={duo} role={role} wipe={role === 'incoming' ? wipe : null}>
            <SyncedRingAmbient
              worldData={worldForDuo(duo, arrangement)} showId={showId} slideIndex={slideIndex}
              stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
              exposeDebugGlobal={role === 'current'}
            />
          </DuoLayer>
        )
      })}
    </div>
  )
}
