// Night-color-evolution — the live render layer for the duo walk
// (docs/superpowers/specs/2026-09-24-ring-world-night-color-evolution-design.md,
// docs/superpowers/plans/2026-10-01-ring-per-station-world-switch.md).
// ONE RingAmbient for the whole show. Which duo paints which pane of the ring
// is decided purely from (showId, slide, the ring's own station) by
// panePlanFor below — no stored state, same recompute-don't-store discipline
// duoWalk.js/duoTransition.js already use. RingAmbient repaints only the panes
// whose assignment changed (see applyPanes there); this file never mounts a
// second ring, never wipes, never fades.
//
// History: 2026-09-26 an adversarial Codex review found the first two-ring
// version remounted whatever was playing at every transition and left stale
// duos after multi-slide skips. 2026-10-01 Ben rejected the wipe and the
// fade-through-black that followed ("it should flow seamlessly"; "have the
// ring switch mid question, with a black space between the two worlds"), so
// the two-ring design was dropped entirely.
import { useLayoutEffect, useRef } from 'react'
import RingAmbient from './RingAmbient.jsx'
import { recolorWorld } from '../../lib/ringRecolor.js'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
import { DUO_PALETTES, DUO_GRAPH } from '../../lib/duoGraph.js'
import { outgoingAndIncomingDuo, isTransitionSlide, stepIndexForSlide, gapBleedFor } from '../../lib/duoTransition.js'
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
function SyncedRingAmbient({ worldData, showId, slideIndex, stationOverride, showStationDebug, forceSnap, exposeDebugGlobal, panePlan }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    ref.current?.jumpTo(slideIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <RingAmbient
      ref={ref} worldData={worldData} showId={showId} slideIndex={slideIndex}
      stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
      exposeDebugGlobal={exposeDebugGlobal} panePlan={panePlan}
    />
  )
}

// ONE continuous ring (Ben, 2026-10-01): each pane is painted in the duo of
// the slide that lands on it; the first slide of a new duo lands on an empty
// pane carrying the old world's light from its left edge and the new world's
// from its right, with dark between. No overlay, no wipe, no fade.
// Plan: docs/superpowers/plans/2026-10-01-ring-per-station-world-switch.md
const PANES = 13

function duoAt(showId, i) {
  return outgoingAndIncomingDuo(showId, DUO_GRAPH, Math.max(0, i)).incoming
}

// The 13 pane specs for the ring with `slide` sitting on `station`. Slides
// slide-6..slide+6 each land on exactly one pane. solidCenter (the grading-
// break override) paints the center pane with the slide's own world even on
// a gap slide, so the eclipse never comes up empty.
export function panePlanFor(showId, arrangement, slide, station, solidCenter = false) {
  const plan = new Array(PANES)
  for (let d = -6; d <= 6; d++) {
    const t = slide + d
    const pane = (((station + d) % PANES) + PANES) % PANES
    if (t > 0 && isTransitionSlide(showId, t) && !(solidCenter && d === 0)) {
      const { outgoing, incoming } = outgoingAndIncomingDuo(showId, DUO_GRAPH, t)
      const { left, right } = gapBleedFor(showId, stepIndexForSlide(showId, t))
      // Colour = the hue the neighbouring pane's own objects use, so the
      // bleed matches what is actually next to it, not just the duo's first swatch.
      const hueAt = (duoId, p) => worldForDuo(duoId, arrangement).stations[((p % PANES) + PANES) % PANES].hue
      plan[pane] = {
        empty: true,
        bleeds: [
          { side: 'left', color: `hsl(${hueAt(outgoing, pane - 1)} 65% 45%)`, reach: left },
          { side: 'right', color: `hsl(${hueAt(incoming, pane + 1)} 65% 45%)`, reach: right },
        ],
      }
    } else {
      plan[pane] = worldForDuo(duoAt(showId, t), arrangement)
    }
  }
  return plan
}

export default function EvolvingRingAmbient({ showId, slideIndex, arrangement = midnightGalaxyRing, stationOverride, showStationDebug, forceSnap }) {
  // Mount-only inside RingAmbient: the first world sets the sky; later
  // worlds arrive pane by pane through panePlan.
  const first = useRef(null)
  if (first.current == null) first.current = duoAt(showId, Number.isInteger(slideIndex) ? slideIndex : 0)
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <SyncedRingAmbient
        worldData={worldForDuo(first.current, arrangement)} showId={showId} slideIndex={slideIndex}
        stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap}
        panePlan={(slide, station, solid) => panePlanFor(showId, arrangement, slide, station, solid)}
        exposeDebugGlobal
      />
    </div>
  )
}
