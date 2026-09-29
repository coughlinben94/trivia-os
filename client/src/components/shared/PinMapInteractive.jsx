// client/src/components/shared/PinMapInteractive.jsx
import { useEffect, useRef, useState } from 'react'
import UsMap, { PinMarker } from './UsMap.jsx'
import { useUsMapData } from '../../hooks/useUsMapData.js'
import { mapToLonLat, MAP_W, MAP_H } from '../../lib/usMapGeo.js'
import { zoomAbout, clampView, screenToMap } from '../../lib/pinView.js'
import { isValidPin } from '../../lib/pinScoring.js'

const HOLD_MS = 350
const SLOP_PX = 8
const PIN_LIFT_PX = 48 // pin tip sits this far ABOVE the finger while dragging

const round6 = n => Math.round(n * 1e6) / 1e6

export default function PinMapInteractive({ pin, onPin, dropMode = 'hold', disabled = false, highlight = '#f5c842', ink = '#ffffff' }) {
  const states = useUsMapData()
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 })
  const [drag, setDrag] = useState(null) // live pin (map coords) while the finger is still down
  const ref = useRef(null)
  const viewRef = useRef(view); viewRef.current = view
  const dragRef = useRef(null); dragRef.current = drag
  const g = useRef({ pointers: new Map(), mode: 'idle', timer: null, start: null, pan: null, pinch: null, last: null })

  function factor() { return MAP_W / ref.current.getBoundingClientRect().width }
  function toViewport(e, liftPx = 0) {
    const r = ref.current.getBoundingClientRect(); const f = MAP_W / r.width
    return [(e.clientX - r.left) * f, (e.clientY - r.top - liftPx) * f]
  }
  function cancelTimer() { clearTimeout(g.current.timer); g.current.timer = null }

  function placeDrag(e, liftPx) {
    const [px, py] = toViewport(e, liftPx)
    const [mx, my] = screenToMap(viewRef.current, px, py)
    setDrag({ mx, my })
    return [mx, my]
  }
  function commit(mx, my) {
    const [lon, lat] = mapToLonLat(mx, my)
    const next = { lat: round6(lat), lon: round6(lon) }
    if (isValidPin(next)) onPin?.(next)
  }

  function onPointerDown(e) {
    if (disabled) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const s = g.current
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
      setView(clampView({ k: s.pan.view.k, tx: s.pan.view.tx + (e.clientX - s.pan.x) * f, ty: s.pan.view.ty + (e.clientY - s.pan.y) * f }))
    } else if (s.mode === 'drop') {
      placeDrag(e, PIN_LIFT_PX)
    } else if (s.mode === 'pinch' && s.pointers.size >= 2) {
      const [a, b] = [...s.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const k = Math.max(1, Math.min(8, s.pinch.k0 * (dist / s.pinch.dist)))
      const mid = toViewport({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      // keep the map point that started under the fingers under the fingers now
      setView(clampView({ k, tx: mid[0] - k * s.pinch.m0[0], ty: mid[1] - k * s.pinch.m0[1] }))
    }
  }

  function onPointerEnd(e) {
    const s = g.current
    if (!s.pointers.has(e.pointerId)) return
    s.pointers.delete(e.pointerId)
    cancelTimer()
    if (e.type === 'pointerup') {
      if (s.mode === 'drop' && dragRef.current) commit(dragRef.current.mx, dragRef.current.my)
      else if (s.mode === 'maybe' && dropMode === 'click') {
        const [px, py] = toViewport(e)
        const [mx, my] = screenToMap(viewRef.current, px, py)
        commit(mx, my)
      }
    }
    if (s.pointers.size === 0) { s.mode = 'idle'; setDrag(null) }
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
      const [px, py] = toViewport(e)
      setView(v => zoomAbout(v, px, py, Math.exp(-e.deltaY * 0.0025)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  useEffect(() => () => cancelTimer(), [])

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
  return (
    <div
      ref={ref}
      data-pin-surface
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onContextMenu={e => e.preventDefault()}
      style={{
        position: 'relative', width: '100%', aspectRatio: `${MAP_W} / ${MAP_H}`, overflow: 'hidden', borderRadius: 16,
        background: 'rgba(255,255,255,0.05)', border: `1px solid ${ink}22`,
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
        cursor: disabled ? 'default' : 'crosshair',
      }}
    >
      <UsMap view={view} states={states} ink={ink}>
        {k => (shown && Number.isFinite(shown.lat) ? <PinMarker lon={shown.lon} lat={shown.lat} k={k} color={highlight} /> : null)}
      </UsMap>
      {!disabled && (
        <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {zoomBtn('+', 1.6)}{zoomBtn('−', 1 / 1.6)}
        </div>
      )}
    </div>
  )
}
