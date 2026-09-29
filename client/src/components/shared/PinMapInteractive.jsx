// client/src/components/shared/PinMapInteractive.jsx
import { useEffect, useRef, useState } from 'react'
import UsMap, { PinMarker } from './UsMap.jsx'
import MapLoadRetry from './MapLoadRetry.jsx'
import { useUsMapData } from '../../hooks/useUsMapData.js'
import { mapToLonLat, MAP_W, MAP_H } from '../../lib/usMapGeo.js'
import { zoomAbout, clampView, screenToMap, MAX_K } from '../../lib/pinView.js'
import { isValidPin } from '../../lib/pinScoring.js'

const HOLD_MS = 350
const SLOP_PX = 8
const PIN_LIFT_PX = 48 // pin tip sits this far ABOVE the finger while dragging

const round6 = n => Math.round(n * 1e6) / 1e6

export default function PinMapInteractive({ pin, onPin, dropMode = 'hold', disabled = false, highlight = '#f5c842', ink = '#ffffff', showCities = false }) {
  const states = useUsMapData()
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 })
  const [drag, setDrag] = useState(null) // live pin (map coords) while the finger is still down
  const ref = useRef(null)
  const viewRef = useRef(view); viewRef.current = view
  const dragRef = useRef(null); dragRef.current = drag
  const g = useRef({ pointers: new Map(), mode: 'idle', timer: null, start: null, pan: null, pinch: null, last: null })

  // Zero/NaN width (unmounted or not laid out yet) -> null; callers bail out.
  function factor() {
    const w = ref.current?.getBoundingClientRect().width
    return w > 0 ? MAP_W / w : null
  }
  function toViewport(e, liftPx = 0) {
    const f = factor()
    if (f == null) return null
    const r = ref.current.getBoundingClientRect()
    return [(e.clientX - r.left) * f, (e.clientY - r.top - liftPx) * f]
  }
  function resetGesture() {
    const s = g.current
    cancelTimer(); s.pointers.clear(); s.mode = 'idle'; s.pinch = null; dragRef.current = null; setDrag(null)
  }
  function cancelTimer() { clearTimeout(g.current.timer); g.current.timer = null }

  function placeDrag(e, liftPx) {
    const p = toViewport(e, liftPx)
    if (!p) return
    const [mx, my] = screenToMap(viewRef.current, p[0], p[1])
    dragRef.current = { mx, my } // before setDrag: a pointerup before the re-render must still commit
    setDrag({ mx, my })
  }
  function commit(mx, my) {
    if (disabled) return
    const [lon, lat] = mapToLonLat(mx, my)
    const next = { lat: round6(lat), lon: round6(lon) }
    if (isValidPin(next)) onPin?.(next)
  }

  function onPointerDown(e) {
    if (disabled) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const s = g.current
    if (!s.pointers.has(e.pointerId) && s.pointers.size >= 2) return // third finger: ignore
    if (s.pointers.has(e.pointerId)) { // stale entry for this id: start over
      cancelTimer(); s.pointers.clear(); s.mode = 'idle'; s.pinch = null; dragRef.current = null; setDrag(null)
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    s.last = { clientX: e.clientX, clientY: e.clientY }
    if (s.pointers.size === 1) {
      s.mode = 'maybe'
      s.start = { x: e.clientX, y: e.clientY }
      s.pan = { x: e.clientX, y: e.clientY, view: viewRef.current }
      if (dropMode === 'hold') {
        s.timer = setTimeout(() => {
          if (s.mode !== 'maybe') return
          s.mode = 'drop'
          placeDrag(s.last, PIN_LIFT_PX)
        }, HOLD_MS)
      }
    } else if (s.pointers.size === 2) {
      cancelTimer(); setDrag(null)
      s.mode = 'pinch'
      const [a, b] = [...s.pointers.values()]
      const midPx = toViewport({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      if (!midPx) { s.mode = 'idle'; return }
      s.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: viewRef.current.k, m0: screenToMap(viewRef.current, midPx[0], midPx[1]) }
    }
  }

  function onPointerMove(e) {
    const s = g.current
    if (!s.pointers.has(e.pointerId)) return
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    s.last = { clientX: e.clientX, clientY: e.clientY }
    if (s.mode === 'maybe') {
      if (Math.hypot(e.clientX - s.start.x, e.clientY - s.start.y) <= SLOP_PX) return
      cancelTimer(); s.mode = 'pan'
    }
    if (s.mode === 'pan') {
      const f = factor()
      if (f == null) return
      setView(clampView({ k: s.pan.view.k, tx: s.pan.view.tx + (e.clientX - s.pan.x) * f, ty: s.pan.view.ty + (e.clientY - s.pan.y) * f }))
    } else if (s.mode === 'drop') {
      placeDrag(e, PIN_LIFT_PX)
    } else if (s.mode === 'pinch' && s.pointers.size >= 2) {
      const [a, b] = [...s.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const k = Math.max(1, Math.min(MAX_K, s.pinch.k0 * (dist / s.pinch.dist)))
      const mid = toViewport({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      if (!mid) return
      // keep the map point that started under the fingers under the fingers now
      setView(clampView({ k, tx: mid[0] - k * s.pinch.m0[0], ty: mid[1] - k * s.pinch.m0[1] }))
    }
  }

  function onPointerEnd(e) {
    const s = g.current
    if (!s.pointers.has(e.pointerId)) return
    s.pointers.delete(e.pointerId)
    cancelTimer()
    if (e.type === 'pointerup' && !disabled) {
      if (s.mode === 'drop' && dragRef.current) commit(dragRef.current.mx, dragRef.current.my)
      else if (s.mode === 'maybe' && dropMode === 'click') {
        const p = toViewport(e)
        if (p) { const [mx, my] = screenToMap(viewRef.current, p[0], p[1]); commit(mx, my) }
      }
    }
    if (disabled) resetGesture()
    else if (s.pointers.size === 0) { s.mode = 'idle'; dragRef.current = null; setDrag(null) }
    else if (s.pointers.size === 1 && s.mode === 'pinch') {
      const [p] = [...s.pointers.values()]
      s.mode = 'pan'; s.pan = { x: p.x, y: p.y, view: viewRef.current }
    }
  }

  // Wheel zoom (desktop / host picker). Native listener: React's onWheel is
  // passive, so preventDefault (stop the page scrolling) would be ignored.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      const p = toViewport(e)
      if (!p) return
      const [px, py] = p
      setView(v => zoomAbout(v, px, py, Math.exp(-e.deltaY * 0.0025)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  useEffect(() => () => cancelTimer(), [])

  // Touch pans must not also swipe the Join carousel (framer `drag` on an
  // ancestor listens natively for pointerdown). React handlers run at the root,
  // after that native listener, so the shield has to be native too, and it hands
  // the event to the React-side logic itself since stopping here starves the root.
  // ponytail: stops touch only; mouse keeps bubbling (host picker has no swipe parent).
  const downRef = useRef(null); downRef.current = onPointerDown
  const disabledRef = useRef(disabled); disabledRef.current = disabled
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = e => { downRef.current(e); if (e.pointerType === 'touch' && !disabledRef.current) e.stopPropagation() }
    el.addEventListener('pointerdown', h)
    return () => el.removeEventListener('pointerdown', h)
  }, [])

  const zoomBtn = (label, f) => (
    <button
      type="button"
      aria-label={f > 1 ? 'Zoom in' : 'Zoom out'}
      onPointerDown={e => e.stopPropagation()}
      onClick={() => setView(v => zoomAbout(v, MAP_W / 2, MAP_H / 2, f))}
      style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${ink}33`, background: 'rgba(0,0,0,0.45)', color: ink, fontSize: 22, fontWeight: 700, lineHeight: 1 }}
    >{label}</button>
  )

  const shown = drag ? (() => { const [lon, lat] = mapToLonLat(drag.mx, drag.my); return { lon, lat } })() : pin
  // Held past the US edge: the release will not drop, so show the preview faded.
  const outOfBounds = !!drag && !isValidPin(shown)
  return (
    <div style={{ width: '100%' }}>
      {!disabled && (
        // Outside the gesture surface: a button over the map would swallow a hold on whatever is under it (Miami at k=1).
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 6 }}>
          {zoomBtn('+', 1.6)}{zoomBtn('−', 1 / 1.6)}
        </div>
      )}
    <div
      ref={ref}
      data-pin-surface
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onContextMenu={e => e.preventDefault()}
      style={{
        position: 'relative', width: '100%', aspectRatio: `${MAP_W} / ${MAP_H}`, overflow: 'hidden', borderRadius: 16,
        background: 'rgba(255,255,255,0.05)', border: `1px solid ${ink}22`,
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
        cursor: disabled ? 'default' : 'crosshair',
      }}
    >
      <UsMap view={view} states={states} ink={ink} showCities={showCities}>
        {k => (shown && Number.isFinite(shown.lat) ? <g data-pin-preview opacity={outOfBounds ? 0.3 : 1}><PinMarker lon={shown.lon} lat={shown.lat} k={k} color={highlight} /></g> : null)}
      </UsMap>
      <MapLoadRetry states={states} ink={ink} />
    </div>
    </div>
  )
}
