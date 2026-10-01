// ForestAmbient: the haunted-forest world (Halloween spec §2.2, Phase 3b-2). Same props and
// imperative handle as RingAmbient so Display/AmbientAudit drive it unchanged. The DOM lives in
// worlds/forest/forestScene.js (port of concepts/haunted-forest-walk-v3.html); the station machine is
// lib/stationCamera.js with queuePolicy 'retarget' (a turn during a walk cuts straight to the target).
// The slideIndex and stationOverride effects are copied from RingAmbient with the same semantics:
// read RingAmbient.jsx for the full history behind each rule.
import { forwardRef, useEffect, useLayoutEffect, useImperativeHandle, useRef } from 'react'
import { ringNavAction } from '../../lib/ringStationIndex.js'
import { RING_RETURN } from '../../lib/ringStationOverride.js'
import { createStationCamera } from '../../lib/stationCamera.js'
import { makeForest, DEFAULT_SEED } from '../../worlds/forest/forestGen.js'
import { createForestScene } from '../../worlds/forest/forestScene.js'

const W = 1920, H = 1080, PANES = 13
const DEFAULT_WALK = { durMs: 4000, stepM: 6 }

const ForestAmbient = forwardRef(function ForestAmbient({ worldData, slideIndex, stationOverride, showStationDebug = false, forceSnap = false, exposeDebugGlobal = true, showId }, ref) {
  const stageElRef = useRef(null)
  const designElRef = useRef(null)
  const debugLabelRef = useRef(null)
  const sceneRef = useRef(null)
  const seedRef = useRef(worldData?.forestSeed ?? DEFAULT_SEED)
  const walkRef = useRef({ ...DEFAULT_WALK, ...(worldData?.walk || {}) })

  // Created once on first render, like RingAmbient's. The renderer reads sceneRef at call time: the
  // alignment jump below runs before the build effect, while there is no scene yet, and the build
  // effect then renders the camera's station (never a hard-coded 0).
  const camRef = useRef(null)
  if (!camRef.current) {
    camRef.current = createStationCamera({
      panes: PANES,
      queuePolicy: 'retarget',
      renderer: {
        startWalk(from, to, dir, done) { return sceneRef.current?.startWalk(from, to, done) },
        snap(from, to) { sceneRef.current?.renderRest(to) },
        cut(from, to, done) { return sceneRef.current?.cutTo(from, to, done) },
      },
    })
  }

  // data-forest-station and the debug label: plain DOM writes, never React state
  function syncStation() {
    const s = camRef.current.station
    if (stageElRef.current) stageElRef.current.dataset.forestStation = String(s)
    if (debugLabelRef.current) debugLabelRef.current.textContent = `S${s}`
  }
  function turn(dir = 1) { camRef.current.turn(dir); syncStation() }
  function jumpTo(i) { camRef.current.jumpTo(i); syncStation() }

  function makeScene() {
    return createForestScene({
      doc: designElRef.current.ownerDocument,
      root: designElRef.current,
      forest: makeForest({ walk: walkRef.current, seed: seedRef.current }),
      walk: walkRef.current,
    })
  }

  // slideIndex alignment: declared BEFORE the build effect so on mount the camera already sits at
  // slideIndex % 13 when the scene draws its first frame (layout effects run in declaration order).
  const lastSlideIndexRef = useRef(null)
  useLayoutEffect(() => {
    if (slideIndex == null) return
    const prev = lastSlideIndexRef.current
    lastSlideIndexRef.current = slideIndex
    const action = forceSnap ? 'jump' : ringNavAction(prev, slideIndex)
    if (action === 'turn') turn()
    else if (action === 'turn-back') turn(-1)
    else if (action === 'jump') jumpTo(slideIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideIndex, forceSnap])

  // build once on mount, before paint; never rebuilt on worldData change (same rule as RingAmbient)
  useLayoutEffect(() => {
    const stage = stageElRef.current
    const design = designElRef.current
    if (!stage || !design) return
    function fit() {
      const s = Math.max(stage.clientWidth / W, stage.clientHeight / H)
      design.style.transform = `scale(${s})`
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
    ro?.observe(stage)
    fit()
    sceneRef.current = makeScene()
    sceneRef.current.renderRest(camRef.current.station)
    syncStation()
    return () => {
      ro?.disconnect()
      camRef.current.dispose()
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!exposeDebugGlobal) return
    const api = {
      get seed() { return seedRef.current },
      setSeed(n) {
        const cam = camRef.current
        cam.jumpTo(cam.station) // cancel anything in flight first
        sceneRef.current?.dispose()
        seedRef.current = n
        sceneRef.current = makeScene()
        sceneRef.current.renderRest(cam.station)
        syncStation()
      },
      get station() { return camRef.current.station },
      turn, jumpTo,
      freeze(t) { sceneRef.current?.freeze(t) },
      unfreeze() { sceneRef.current?.unfreeze() },
    }
    window.__forest = api
    return () => { if (window.__forest === api) delete window.__forest }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exposeDebugGlobal])

  // stationOverride round trip (jukebox grading break), identical to RingAmbient's
  const returnStationRef = useRef(null)
  useEffect(() => {
    if (stationOverride == null) return
    if (stationOverride === RING_RETURN) {
      if (returnStationRef.current == null) return // never left: hold still
      jumpTo(returnStationRef.current)
      returnStationRef.current = null
      return
    }
    returnStationRef.current = camRef.current.station
    jumpTo(stationOverride)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationOverride])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({
    turn,
    jumpTo,
    get station() { return camRef.current.station },
  }), [])

  return (
    <div
      ref={stageElRef}
      className="forest-stage"
      aria-hidden
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#060708', pointerEvents: 'none' }}
    >
      <div
        ref={designElRef}
        style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', overflow: 'hidden' }}
      />
      {showStationDebug && (
        <div
          ref={debugLabelRef}
          style={{
            position: 'absolute', top: 8, left: 8, zIndex: 999,
            fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.55)',
            textShadow: '0 1px 2px rgba(0,0,0,0.9)', pointerEvents: 'none',
          }}
        >
          S0
        </div>
      )}
    </div>
  )
})

export default ForestAmbient
