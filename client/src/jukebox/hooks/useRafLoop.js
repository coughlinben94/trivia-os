import { useEffect, useRef } from 'react'

// Shared rAF lifecycle for the jukebox's canvas animations (AlbumGradientMesh,
// StationRingLayer) — both had near-identical mountedRef/activeRef/rafRef
// bookkeeping, a startLoop()/tick() split, and cancelAnimationFrame-on-unmount.
// Extracted 2026-09-07 (shared-function-cleanup audit, task 3).
//
// The hook owns the mounted/active refs, the rAF scheduling, and a
// reduced-motion short-circuit: startLoop() simply no-ops when
// `reducedMotion` is true, so nothing ever gets scheduled. It deliberately
// does NOT own "when to (re)start the loop" or "redraw one static frame for
// reduced motion" — those differ between the two current consumers
// (AlbumGradientMesh resets an extra ref of its own before every restart and
// has no reduced-motion handling at all; StationRingLayer redraws a static
// frame keyed off colors/progress changes) — those stay in each component's
// own effects, which call the `startLoop` this hook returns.
//
// callback(ts) is the per-frame draw/tick body, called with the same
// DOMHighResTimeStamp requestAnimationFrame provides. Return `true` from it
// to keep the loop running even while `active` is false — AlbumGradientMesh
// needs this so an in-flight color blend can finish after `active` flips off.
export function useRafLoop(callback, { active = true, reducedMotion = false } = {}) {
  const mountedRef = useRef(true)
  const activeRef = useRef(active)
  const rafRef = useRef(null)
  // Latest callback in a ref so tick() (a stable closure captured once per
  // startLoop() call) always invokes the current render's callback, not a
  // stale one from whenever the loop happened to (re)start.
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    activeRef.current = active
  }, [active])

  function startLoop() {
    if (reducedMotion) return
    rafRef.current = requestAnimationFrame(tick)
  }

  function tick(ts) {
    const keepGoing = callbackRef.current(ts)
    if (mountedRef.current && (activeRef.current || keepGoing)) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      rafRef.current = null
    }
  }

  useEffect(() => {
    // Re-set true on setup, not just useRef's initial value — React 18
    // StrictMode double-invokes mount effects in dev (setup, cleanup, setup
    // again), and without this the cleanup below would leave mountedRef
    // stuck false after the second setup, silently killing every future
    // startLoop() call. Both consumers already followed this exact pattern
    // for the same reason before this hook existed.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  return { startLoop, mountedRef, activeRef, rafRef }
}
