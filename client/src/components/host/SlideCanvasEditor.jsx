// SlideCanvasEditor — the whole Build-Mode canvas area for one slide.
//
// It owns TWO independent editing systems that share one scaled-canvas DOM:
//
//   1. REGION editing (pre-existing, always-on) — makes a slide's OWN built-in
//      text fields (title, question text, message…) draggable / rotatable /
//      editable-in-place. Matched off `data-slide-region` attributes on the
//      real rendered slide DOM; writes to `data._regionTransforms`, which the
//      slide components themselves read on /display. Moved here VERBATIM from
//      SlideEditor.jsx — behavior unchanged. This is NOT the overlay feature
//      and is available regardless of the "Edit layout" toggle.
//
//   2. OVERLAY editing (this feature) — freeform text/image boxes layered on
//      top of ANY slide, stored in `data.overlays` (percent-of-canvas model,
//      see OverlayLayer.jsx). Gated behind the "✏️ Edit layout" toggle. The
//      preview literally renders `SlideRenderer` (which mounts OverlayLayer)
//      inside a `transform: scale(k)` wrapper, so the small preview and the
//      1920×1080 TV are the SAME render tree — WYSIWYG by construction. The
//      interactive boxes drawn here are TRANSPARENT geometric twins of what
//      OverlayLayer renders beneath; they exist only to carry handles/hit-area.
//
// Coordinate law (never store pixels): x/w are % of canvas WIDTH, y is % of
// canvas HEIGHT, fontSize is % of canvas HEIGHT. All screen-pixel pointer
// deltas are divided by the live scaled canvas size (scaledW/scaledH) to get
// back to percent — that division is the classic failure this file gets right
// once, in the gesture handlers below.

import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import SlideRenderer from '../display/SlideRenderer.jsx'
import ParticleBackground from '../display/ParticleBackground.jsx'
import { DISPLAY_FONTS } from './ThemeCustomizeControls.jsx'

const INNER_W = 1280
const INNER_H = 720

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
const THEME_COLOR_TOKENS = ['text', 'accent', 'highlight']

export default function SlideCanvasEditor({
  slide, show, theme,
  data, setData, scheduleSave, change, flushSave, uploadMedia,
}) {
  // ── scaled-canvas geometry ────────────────────────────────────────────────
  const leftPanelRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const [panelW, setPanelW] = useState(800)
  const [panelH, setPanelH] = useState(600)

  useEffect(() => {
    const el = leftPanelRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      setPanelW(Math.round(entry.contentRect.width))
      setPanelH(Math.round(entry.contentRect.height))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const dynScale = Math.min(panelW / INNER_W, panelH / INNER_H)
  const scaledW = Math.round(INNER_W * dynScale)
  const scaledH = Math.round(INNER_H * dynScale)

  // ── REGION editing state (verbatim) ───────────────────────────────────────
  const [regions, setRegions] = useState([])
  const [selectedRegionId, setSelectedRegionId] = useState(null)
  const [editingRegionId, setEditingRegionId] = useState(null)
  const [rotatingAngle, setRotatingAngle] = useState(null)
  const activeEditRef = useRef(null)
  const detectTimerRef = useRef(null)

  // ── OVERLAY editing state ─────────────────────────────────────────────────
  const [editLayout, setEditLayout] = useState(false)
  const [selectedOverlayId, setSelectedOverlayId] = useState(null)
  const [editingOverlayId, setEditingOverlayId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [guides, setGuides] = useState({ x: false, y: false })
  const editableRef = useRef(null)
  const fileInputRef = useRef(null)

  const overlays = data.overlays ?? []
  const selectedOverlay = overlays.find(o => o.id === selectedOverlayId) ?? null

  // Reset per-slide selection when the slide switches (keep editLayout sticky
  // so a host laying out several slides doesn't have to re-arm it each time).
  useEffect(() => {
    setSelectedRegionId(null)
    setEditingRegionId(null)
    setSelectedOverlayId(null)
    setEditingOverlayId(null)
    setUploadError(null)
  }, [slide.id])

  // ── overlay persistence helpers ───────────────────────────────────────────
  // Functional, like patchOverlay below — a version that spread the closed-over
  // `data` wrote stale snapshots under same-tick sequences (create → immediate
  // delete resurrected the deleted box in the DB during the 2026-07-05 audit).
  function commitOverlays(updater) {
    setData(d => {
      const cur = d.overlays ?? []
      const nd = { ...d, overlays: typeof updater === 'function' ? updater(cur) : updater }
      scheduleSave({ data: nd })
      return nd
    })
  }
  // Functional form — safe under rapid gesture updates (drag/resize/rotate)
  // where the closed-over `data` would be stale between pointermove frames.
  function patchOverlay(id, patch) {
    setData(d => {
      const nd = { ...d, overlays: (d.overlays ?? []).map(o => o.id === id ? { ...o, ...patch } : o) }
      scheduleSave({ data: nd })
      return nd
    })
  }
  const nextZ = (list) => Math.max(0, ...list.map(o => o.z ?? 0)) + 1

  function resolveFont(f) {
    if (f === 'display') return theme.fonts.display
    if (f === 'body') return theme.fonts.body
    return f || theme.fonts.display
  }
  function resolveColor(c) {
    if (!c) return theme.colors.text
    return THEME_COLOR_TOKENS.includes(c) ? theme.colors[c] : c
  }

  // ── overlay CRUD ──────────────────────────────────────────────────────────
  function addTextAt(xPct, yPct) {
    const id = nanoid()
    commitOverlays(cur => [...cur, {
      id, kind: 'text',
      x: clamp(xPct, 0, 92), y: clamp(yPct, 0, 92),
      w: 26, rotation: 0, z: nextZ(cur),
      text: '', fontFamily: 'display', fontSize: 5,
      color: 'text', align: 'center', weight: 700,
    }])
    setSelectedOverlayId(id)
    setEditingOverlayId(id)
  }

  async function addImageFromFile(file) {
    if (!file) return
    setUploading(true); setUploadError(null)
    try {
      const res = await uploadMedia(file)
      if (res?.url) {
        const id = nanoid()
        commitOverlays(cur => [...cur, { id, kind: 'image', x: 35, y: 30, w: 30, rotation: 0, z: nextZ(cur), mediaUrl: res.url }])
        setSelectedOverlayId(id)
      } else {
        setUploadError('Upload failed — no URL returned')
      }
    } catch (err) {
      setUploadError(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function deleteOverlay(id) {
    commitOverlays(cur => cur.filter(o => o.id !== id))
    if (selectedOverlayId === id) setSelectedOverlayId(null)
    if (editingOverlayId === id) setEditingOverlayId(null)
  }
  function duplicateOverlay(id) {
    const nid = nanoid()
    commitOverlays(cur => {
      const o = cur.find(x => x.id === id)
      if (!o) return cur
      return [...cur, { ...o, id: nid, x: clamp((o.x ?? 0) + 3, 0, 92), y: clamp((o.y ?? 0) + 3, 0, 92), z: nextZ(cur) }]
    })
    setSelectedOverlayId(nid)
  }
  function patchDiscrete(id, patch) {
    commitOverlays(cur => cur.map(o => o.id === id ? { ...o, ...patch } : o))
  }
  function bringToFront(id) {
    commitOverlays(cur => cur.map(o => o.id === id ? { ...o, z: nextZ(cur) } : o))
  }
  function sendToBack(id) {
    commitOverlays(cur => {
      const minZ = Math.min(0, ...cur.map(o => o.z ?? 0))
      return cur.map(o => o.id === id ? { ...o, z: minZ - 1 } : o)
    })
  }

  // ── overlay gestures (all divide screen-px by scaled canvas size) ──────────
  function startOverlayDrag(e, ov) {
    e.stopPropagation()
    setSelectedOverlayId(ov.id)
    if (editingOverlayId && editingOverlayId !== ov.id) setEditingOverlayId(null)
    // Don't hijack pointer while inline-editing this same box (let caret place).
    if (editingOverlayId === ov.id) return
    const oRect = overlayRef.current.getBoundingClientRect()
    const startX = e.clientX, startY = e.clientY
    const startOvX = ov.x ?? 0, startOvY = ov.y ?? 0
    let moved = false
    function onMove(ev) {
      const dx = (ev.clientX - startX) / oRect.width * 100
      const dy = (ev.clientY - startY) / oRect.height * 100
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) moved = true
      const nx = clamp(startOvX + dx, 0, 95)
      const ny = clamp(startOvY + dy, 0, 95)
      // center-snap guides (within ~1% of canvas center)
      const cx = nx + (ov.w ?? 0) / 2
      setGuides({ x: Math.abs(cx - 50) < 1.2, y: false })
      patchOverlay(ov.id, { x: nx, y: ny })
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      setGuides({ x: false, y: false })
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  // ── keyboard: delete selected / Esc deselect (never while inline-editing) ──
  useEffect(() => {
    if (!editLayout) return
    function onKey(e) {
      if (editingOverlayId) return
      const ae = document.activeElement
      if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return
      if (e.key === 'Escape') { setSelectedOverlayId(null); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedOverlayId) {
        e.preventDefault()
        deleteOverlay(selectedOverlayId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editLayout, editingOverlayId, selectedOverlayId, overlays])

  // ── inline text edit: focus the editable & place caret on enter ───────────
  useEffect(() => {
    if (!editingOverlayId) return
    const el = editableRef.current
    if (!el) return
    const ov = overlays.find(o => o.id === editingOverlayId)
    el.textContent = ov?.text ?? ''
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOverlayId])

  function commitInlineEdit() {
    const id = editingOverlayId
    setEditingOverlayId(null)
    if (!id) return
    // Read the live editable text (not the closed-over `overlays`, which can be
    // one render stale relative to the last keystroke) to decide pruning.
    const text = (editableRef.current?.textContent ?? '').trim()
    // Prune a text box left completely empty — matches "delete/re-add covers it".
    if (!text) deleteOverlay(id)
  }

  function toggleEditLayout() {
    setEditLayout(v => {
      const next = !v
      if (!next) {
        // leaving edit mode — drop selection & flush any pending overlay write
        setSelectedOverlayId(null)
        setEditingOverlayId(null)
        flushSave?.()
      }
      return next
    })
  }

  // Background click on the canvas: deselect, or (edit mode, nothing selected)
  // add a text box at the click point.
  function onCanvasBackgroundPointerDown(e) {
    setSelectedRegionId(null)
    if (editingOverlayId) return // let the editable's blur commit first
    if (!editLayout) return
    if (selectedOverlayId) { setSelectedOverlayId(null); return }
    // preventDefault is load-bearing: without it, this same click's default
    // focus action fires AFTER addTextAt's effect focuses the new inline
    // editable, blurring it immediately — and commitInlineEdit's empty-text
    // prune then deletes the box in the same tick. Net effect was "click
    // does nothing." Same bug class the region-select path already guards.
    e.preventDefault()
    const oRect = overlayRef.current.getBoundingClientRect()
    const x = (e.clientX - oRect.left) / scaledW * 100
    const y = (e.clientY - oRect.top) / scaledH * 100
    addTextAt(x, y)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGION editing — moved VERBATIM from SlideEditor.jsx (behavior unchanged)
  // ═══════════════════════════════════════════════════════════════════════════
  function detectRegions() {
    if (!canvasRef.current || !overlayRef.current) return
    const oRect = overlayRef.current.getBoundingClientRect()
    const els = canvasRef.current.querySelectorAll('[data-slide-region]')
    setRegions(Array.from(els).map(el => {
      const r = el.getBoundingClientRect()
      const id = el.dataset.slideRegion
      const rt = (data._regionTransforms ?? {})[id] ?? {}
      return { id, field: el.dataset.slideField, x: r.left - oRect.left, y: r.top - oRect.top, w: r.width, h: r.height, baselineDx: rt.dx ?? 0, baselineDy: rt.dy ?? 0, baselineRotate: rt.rotate ?? 0 }
    }))
  }

  function startRegionMove(e, region) {
    const rt = data._regionTransforms ?? {}
    const startDx = rt[region.id]?.dx ?? 0
    const startDy = rt[region.id]?.dy ?? 0
    const sX = e.clientX, sY = e.clientY
    function onMove(ev) {
      const ndx = startDx + (ev.clientX - sX) / dynScale
      const ndy = startDy + (ev.clientY - sY) / dynScale
      setData(d => { const c = d._regionTransforms ?? {}; const n = { ...d, _regionTransforms: { ...c, [region.id]: { ...c[region.id], dx: ndx, dy: ndy } } }; scheduleSave({ data: n }); return n })
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      setTimeout(detectRegions, 50)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  // Signed degrees in (-180, 180] — much easier to read than an unbounded
  // accumulated drag angle ("6°" instead of "-354°" after a full spin).
  function normalizeAngleDisplay(deg) {
    let d = ((deg % 360) + 360) % 360
    if (d > 180) d -= 360
    return Math.round(d)
  }

  function startRegionRotate(e, region) {
    e.stopPropagation()
    const oRect = overlayRef.current.getBoundingClientRect()
    const rt = data._regionTransforms ?? {}
    const curDx = rt[region.id]?.dx ?? 0
    const curDy = rt[region.id]?.dy ?? 0
    const extraX = (curDx - region.baselineDx) * dynScale
    const extraY = (curDy - region.baselineDy) * dynScale
    const cx = oRect.left + region.x + extraX + region.w / 2
    const cy = oRect.top + region.y + extraY + region.h / 2
    const startR = rt[region.id]?.rotate ?? 0
    const startA = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI
    function onMove(ev) {
      let nr = startR + (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI - startA)
      // Snap to flat/45°-family angles — the common case ("make this flat")
      // is hard to land by eye on a freehand drag without this. Radius has
      // to stay small: a wide dead zone (this was 4°) swallows the whole
      // 1-5° range and makes slight intentional tilts unreachable. Hold
      // Shift to disable snapping outright for fine control near a snap point.
      const snapEnabled = !ev.shiftKey
      const nearest45 = Math.round(nr / 45) * 45
      const snapped = snapEnabled && Math.abs(nr - nearest45) <= 1.2
      if (snapped) nr = nearest45
      setData(d => { const c = d._regionTransforms ?? {}; const n = { ...d, _regionTransforms: { ...c, [region.id]: { ...c[region.id], rotate: nr } } }; scheduleSave({ data: n }); return n })
      setRotatingAngle({ id: region.id, deg: normalizeAngleDisplay(nr), snapped, x: cx - oRect.left, y: cy - oRect.top - region.h / 2 - 40 })
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      setRotatingAngle(null)
      setTimeout(detectRegions, 50)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  // Edits the REAL rendered slide element in place — not a copy with
  // guessed-at styles — so gradient-clipped text, custom fonts, drop
  // shadows etc. all just work because it IS that element. Imperative
  // (not React state) since we don't want a re-render per keystroke.
  function enterEditMode(region) {
    const el = canvasRef.current?.querySelector(`[data-slide-region="${region.id}"]`)
    if (!el) return
    const canvasEl = canvasRef.current
    const originalOutline = el.style.outline
    const originalOffset = el.style.outlineOffset
    const originalCursor = el.style.cursor
    const originalElPE = el.style.pointerEvents
    const originalCanvasPE = canvasEl.style.pointerEvents
    let finished = false

    function finish(save) {
      if (finished) return
      finished = true
      el.removeEventListener('blur', onBlur)
      el.removeEventListener('keydown', onKeyDown)
      el.contentEditable = 'false'
      el.style.outline = originalOutline
      el.style.outlineOffset = originalOffset
      el.style.cursor = originalCursor
      el.style.pointerEvents = originalElPE
      canvasEl.style.pointerEvents = originalCanvasPE
      if (save) {
        const val = el.textContent.trim()
        if (val) change(region.field, val)
      } else {
        el.textContent = data[region.field] ?? ''
      }
      // Also clears selection, not just editing: the overlay's own
      // click-outside-to-deselect handler is disabled (pointerEvents:none)
      // for the whole time we're editing, so a click that exits via native
      // blur never reaches it — without this, selectedRegionId is left
      // stuck pointing at this region and the very next click on it jumps
      // straight back into edit mode instead of just selecting it.
      setEditingRegionId(null)
      setSelectedRegionId(null)
      setTimeout(detectRegions, 50)
    }
    function onBlur() { finish(true) }
    function onKeyDown(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); el.blur() }
      else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); el.blur() }
    }

    // Slide components render other full-bleed layers that sit at the same
    // z-index as text regions and come later in DOM order, so they silently
    // blanket the whole slide regardless of any z-index set on the region
    // itself. Rather than fight stacking order per slide type, disable
    // hit-testing on the whole canvas and opt just this one element back in —
    // pointer-events:none removes an element from hit-testing entirely,
    // independent of paint order.
    canvasEl.style.pointerEvents = 'none'
    el.style.pointerEvents = 'auto'
    el.contentEditable = 'true'
    el.style.outline = '2px solid #6366f1'
    el.style.outlineOffset = '4px'
    el.style.cursor = 'text'
    el.addEventListener('blur', onBlur)
    el.addEventListener('keydown', onKeyDown)
    activeEditRef.current = el
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)

    setEditingRegionId(region.id)
  }

  // Trigger region detection after slide/panel changes (350ms lets animations settle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    clearTimeout(detectTimerRef.current)
    detectTimerRef.current = setTimeout(detectRegions, 350)
    return () => clearTimeout(detectTimerRef.current)
  }, [slide.id, slide.type, panelW, panelH])

  // If the slide switches out from under an in-progress edit, drop the edit
  // state without touching the DOM node we no longer own.
  useEffect(() => {
    return () => { activeEditRef.current = null }
  }, [slide.id])

  // ── overlay box screen geometry (matches OverlayLayer exactly) ─────────────
  function overlayBoxStyle(ov) {
    return {
      position: 'absolute',
      left: `${(ov.x ?? 0) / 100 * scaledW}px`,
      top: `${(ov.y ?? 0) / 100 * scaledH}px`,
      width: `${(ov.w ?? 20) / 100 * scaledW}px`,
      transform: `rotate(${ov.rotation ?? 0}deg)`,
      transformOrigin: 'center',
      // Sit above the region handles (z-index 48) so an overlay dropped over a
      // slide's own text region is still grabbable in edit mode; relative ov.z
      // preserves overlay-vs-overlay hit priority. Regions stay fully grabbable
      // anywhere an overlay box isn't — and overlay boxes don't render at all
      // when Edit layout is off, so region editing is untouched then.
      zIndex: 62 + (ov.z ?? 0),
    }
  }

  const textBoxTypography = (ov) => ({
    margin: 0,
    fontFamily: `'${resolveFont(ov.fontFamily)}', sans-serif`,
    fontSize: `${(ov.fontSize ?? 6) / 100 * scaledH}px`,
    fontWeight: ov.weight ?? 700,
    textAlign: ov.align ?? 'center',
    lineHeight: 1.15,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  })

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── canvas toolbar ── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <button
          onClick={toggleEditLayout}
          className={`text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
            editLayout ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:text-gray-900'
          }`}
        >
          ✏️ Edit layout
        </button>
        {editLayout && (
          <>
            <span className="w-px h-4 bg-gray-200" />
            {/* onPointerDown preventDefault = same focus-steal guard as the
                canvas click: the button's mousedown default action would focus
                the button after the new box's editable grabs focus, blurring
                it → empty-prune delete. */}
            <button
              onPointerDown={e => e.preventDefault()}
              onClick={() => addTextAt(37, 42)}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-dashed border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors"
            >
              <span className="font-bold">T</span> Text
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-dashed border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors"
            >
              🖼 Image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { addImageFromFile(e.target.files?.[0]); e.target.value = '' }}
            />
            {uploading && <span className="text-xs text-gray-400">Uploading…</span>}
            {uploadError && <span className="text-xs text-red-500">{uploadError}</span>}
            {!uploading && !uploadError && (
              <span className="text-[11px] text-gray-300 ml-auto">Click empty canvas to add text · drag to move · Delete to remove</span>
            )}
          </>
        )}
      </div>

      {/* ── canvas viewport ── */}
      <div ref={leftPanelRef} className="flex-1 flex items-center justify-center min-h-0 overflow-hidden">
        {/* Wrapper: canvas is clipped; overlay is NOT, so handles near edges stay clickable */}
        <div style={{ width: scaledW, height: scaledH, position: 'relative', flexShrink: 0 }}>
          {/* Clipped, scaled canvas — the SAME render tree as /display */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <div ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: INNER_W, height: INNER_H, transform: `scale(${dynScale})`, transformOrigin: 'top left', overflow: 'hidden', background: theme.colors.bg }}>
              <ParticleBackground theme={theme} />
              <SlideRenderer slide={{ ...slide, data }} show={show} direction={1} isPreview />
            </div>
          </div>

          {/* Interactive overlay — overflow visible so handles aren't clipped.
              pointerEvents:none while editing a REGION: the real slide text
              being edited lives BELOW this blanket, so clicks/typing must pass
              through. Handles opt back in with pointerEvents:auto. */}
          <div
            ref={overlayRef}
            style={{ position: 'absolute', inset: 0, zIndex: 50, overflow: 'visible', pointerEvents: editingRegionId ? 'none' : 'auto' }}
            onPointerDown={onCanvasBackgroundPointerDown}
          >
            {/* ── region handles (verbatim behavior) ── */}
            {regions.map(region => {
              const isSelReg = selectedRegionId === region.id
              const isEditReg = editingRegionId === region.id
              if (isEditReg) return null
              const rt = data._regionTransforms ?? {}
              const curDx = rt[region.id]?.dx ?? 0
              const curDy = rt[region.id]?.dy ?? 0
              const curRot = rt[region.id]?.rotate ?? 0
              const extraX = (curDx - region.baselineDx) * dynScale
              const extraY = (curDy - region.baselineDy) * dynScale
              const hasTransform = !!(rt[region.id]?.dx || rt[region.id]?.dy || rt[region.id]?.rotate)
              return (
                <div
                  key={region.id}
                  style={{ position: 'absolute', left: region.x + extraX, top: region.y + extraY, width: region.w, height: region.h, transform: `rotate(${curRot}deg)`, transformOrigin: 'center', zIndex: 48 }}
                >
                  <div
                    style={{ position: 'absolute', inset: 0, border: isSelReg ? '2px solid rgba(99,102,241,0.9)' : '1px dashed transparent', borderRadius: 2, cursor: isSelReg ? 'move' : 'default', boxSizing: 'border-box', transition: 'border-color 0.15s', pointerEvents: 'auto' }}
                    onPointerEnter={e => { if (!isSelReg) e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)' }}
                    onPointerLeave={e => { if (!isSelReg) e.currentTarget.style.borderColor = 'transparent' }}
                    onPointerDown={e => {
                      e.stopPropagation()
                      if (selectedRegionId !== region.id) {
                        setSelectedRegionId(region.id); setSelectedOverlayId(null)
                      } else {
                        // preventDefault matters here: enterEditMode focuses the real
                        // element synchronously, but the browser's delayed compat
                        // 'mousedown' can still land on a stale target a few ms later
                        // (this div, before React removes it) and blur what we just
                        // focused — closing the box before it's even visible.
                        e.preventDefault()
                        enterEditMode(region); return
                      }
                      startRegionMove(e, region)
                    }}
                  />
                  {isSelReg && (
                    <div title="Rotate — drag; snaps near flat/45° angles (hold Shift to disable)" style={{ position: 'absolute', top: -20, right: -20, width: 16, height: 16, borderRadius: '50%', background: '#6366f1', border: '2px solid white', cursor: 'grab', zIndex: 1, pointerEvents: 'auto' }}
                      onPointerDown={e => startRegionRotate(e, region)} />
                  )}
                  {isSelReg && hasTransform && (
                    <div title="Reset position & rotation" style={{ position: 'absolute', top: -20, left: -20, width: 16, height: 16, borderRadius: '50%', background: '#ef4444', border: '2px solid white', cursor: 'pointer', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white', fontWeight: 700, pointerEvents: 'auto' }}
                      onPointerDown={e => { e.stopPropagation(); const c = data._regionTransforms ?? {}; const { [region.id]: _drop, ...rest } = c; change('_regionTransforms', rest); setTimeout(detectRegions, 50) }}>×</div>
                  )}
                </div>
              )
            })}
            {/* Live angle readout while dragging the region rotate handle */}
            {rotatingAngle && (
              <div style={{
                position: 'absolute', left: rotatingAngle.x, top: rotatingAngle.y, transform: 'translateX(-50%)',
                zIndex: 60, pointerEvents: 'none', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700,
                color: 'white', padding: '3px 9px', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                background: rotatingAngle.snapped ? '#16a34a' : '#1e1b4b',
              }}>
                {rotatingAngle.deg}°{rotatingAngle.snapped ? ' · flat' : ''}
              </div>
            )}

            {/* ── center snap guides ── */}
            {editLayout && guides.x && (
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(99,102,241,0.7)', pointerEvents: 'none', zIndex: 55 }} />
            )}
            {editLayout && guides.y && (
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(99,102,241,0.7)', pointerEvents: 'none', zIndex: 55 }} />
            )}

            {/* ── overlay interactive boxes (edit mode only) ── */}
            {editLayout && overlays.map(ov => {
              const isSel = ov.id === selectedOverlayId
              const isEditing = ov.id === editingOverlayId
              return (
                <div
                  key={ov.id}
                  data-ov-box={ov.id}
                  style={{
                    ...overlayBoxStyle(ov),
                    // Selected box (and its handles) jump above the floating
                    // toolbar (z-70) so the rotate lollipop, which sits right
                    // where the toolbar hovers, stays grabbable.
                    zIndex: isSel ? 90 : 62 + (ov.z ?? 0),
                    outline: isSel ? '2px solid #6366f1' : '1px dashed rgba(99,102,241,0.45)',
                    outlineOffset: 0,
                    cursor: isEditing ? 'text' : 'move',
                    pointerEvents: 'auto',
                  }}
                  onPointerDown={e => startOverlayDrag(e, ov)}
                  onDoubleClick={e => { if (ov.kind === 'text') { e.stopPropagation(); setSelectedOverlayId(ov.id); setEditingOverlayId(ov.id) } }}
                >
                  {ov.kind === 'text'
                    ? (isEditing
                        ? <div
                            ref={editableRef}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={e => patchOverlay(ov.id, { text: e.currentTarget.textContent })}
                            onBlur={commitInlineEdit}
                            onKeyDown={e => {
                              // stopPropagation as well as preventDefault: the blur
                              // unmounts this editable synchronously, so by the time
                              // the event reaches window-level Escape handlers their
                              // contenteditable guard can no longer see it — without
                              // this, Escape here also closed the whole SlideEditor.
                              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur() }
                              else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur() }
                            }}
                            onPointerDown={e => e.stopPropagation()}
                            style={{ ...textBoxTypography(ov), color: resolveColor(ov.color), outline: 'none', cursor: 'text' }}
                          />
                        // Transparent twin: sizes the box to match OverlayLayer's
                        // real render exactly, without double-painting the text.
                        : <div style={{ ...textBoxTypography(ov), color: 'transparent', userSelect: 'none' }}>
                            {ov.text || ' '}
                          </div>
                      )
                    : <img src={ov.mediaUrl} alt="" draggable={false} style={{ width: '100%', height: 'auto', display: 'block', opacity: 0, pointerEvents: 'none' }} />
                  }

                  {isSel && !isEditing && (
                    <OverlayHandles ov={ov} onResize={startOverlayResize} onRotate={startOverlayRotate} />
                  )}
                </div>
              )
            })}

            {/* ── floating toolbar ── */}
            {editLayout && selectedOverlay && !editingOverlayId && (
              <OverlayToolbar
                ov={selectedOverlay}
                theme={theme}
                fonts={fontOptions(show)}
                leftPx={(selectedOverlay.x ?? 0) / 100 * scaledW + (selectedOverlay.w ?? 20) / 100 * scaledW / 2}
                topPx={(selectedOverlay.y ?? 0) / 100 * scaledH}
                maxW={scaledW}
                onPatch={patch => patchDiscrete(selectedOverlay.id, patch)}
                onFront={() => bringToFront(selectedOverlay.id)}
                onBack={() => sendToBack(selectedOverlay.id)}
                onDuplicate={() => duplicateOverlay(selectedOverlay.id)}
                onDelete={() => deleteOverlay(selectedOverlay.id)}
                onEditText={() => setEditingOverlayId(selectedOverlay.id)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )

  // ── overlay resize (radial scale around box center — rotation-invariant) ──
  function startOverlayResize(e, ov) {
    e.stopPropagation(); e.preventDefault()
    const boxEl = e.currentTarget.closest('[data-ov-box]')
    if (!boxEl) return
    const bw = boxEl.offsetWidth, bh = boxEl.offsetHeight
    const oRect = overlayRef.current.getBoundingClientRect()
    const cx = oRect.left + (ov.x ?? 0) / 100 * scaledW + bw / 2
    const cy = oRect.top + (ov.y ?? 0) / 100 * scaledH + bh / 2
    const startDist = Math.hypot(e.clientX - cx, e.clientY - cy) || 1
    const startW = ov.w ?? 20
    const startFS = ov.fontSize ?? 6
    const startHpct = bh / scaledH * 100
    const cxPct = (ov.x ?? 0) + startW / 2
    const cyPct = (ov.y ?? 0) + startHpct / 2
    function onMove(ev) {
      const ratio = clamp(Math.hypot(ev.clientX - cx, ev.clientY - cy) / startDist, 0.15, 8)
      const newW = clamp(startW * ratio, 3, 100)
      const newHpct = startHpct * ratio
      const patch = { w: newW, x: clamp(cxPct - newW / 2, 0, 95), y: clamp(cyPct - newHpct / 2, 0, 95) }
      if (ov.kind === 'text') patch.fontSize = Math.max(1, startFS * ratio)
      patchOverlay(ov.id, patch)
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  // ── overlay rotate (lollipop handle; Shift snaps to 15°) ──
  function startOverlayRotate(e, ov) {
    e.stopPropagation(); e.preventDefault()
    const boxEl = e.currentTarget.closest('[data-ov-box]')
    if (!boxEl) return
    const bw = boxEl.offsetWidth, bh = boxEl.offsetHeight
    const oRect = overlayRef.current.getBoundingClientRect()
    const cx = oRect.left + (ov.x ?? 0) / 100 * scaledW + bw / 2
    const cy = oRect.top + (ov.y ?? 0) / 100 * scaledH + bh / 2
    const startRot = ov.rotation ?? 0
    const startA = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI
    function onMove(ev) {
      let nr = startRot + (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI - startA)
      if (ev.shiftKey) nr = Math.round(nr / 15) * 15
      patchOverlay(ov.id, { rotation: Math.round(nr) })
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }
}

// Resolve the font picker set: the 4 registered display fonts + the show's
// uploaded custom font (if any). Family name comes from the theme override.
function fontOptions(show) {
  const custom = show?.themeOverrides?.fonts?.display
  const list = [...DISPLAY_FONTS]
  if (custom && custom.startsWith('Custom-') && !list.includes(custom)) list.push(custom)
  return list
}

// Selection handles: 4 corner resize squares + a rotate lollipop above.
function OverlayHandles({ ov, onResize, onRotate }) {
  const corner = (pos) => ({
    position: 'absolute', width: 11, height: 11, background: 'white',
    border: '2px solid #6366f1', borderRadius: 2, pointerEvents: 'auto', zIndex: 2, ...pos,
  })
  return (
    <>
      <div style={corner({ left: -6, top: -6, cursor: 'nwse-resize' })} onPointerDown={e => onResize(e, ov)} />
      <div style={corner({ right: -6, top: -6, cursor: 'nesw-resize' })} onPointerDown={e => onResize(e, ov)} />
      <div style={corner({ left: -6, bottom: -6, cursor: 'nesw-resize' })} onPointerDown={e => onResize(e, ov)} />
      <div style={corner({ right: -6, bottom: -6, cursor: 'nwse-resize' })} onPointerDown={e => onResize(e, ov)} />
      {/* rotate lollipop */}
      <div style={{ position: 'absolute', left: '50%', top: -26, width: 1, height: 20, background: '#6366f1', transform: 'translateX(-50%)', pointerEvents: 'none' }} />
      <div
        title="Rotate — hold Shift to snap to 15°"
        style={{ position: 'absolute', left: '50%', top: -34, width: 14, height: 14, borderRadius: '50%', background: '#6366f1', border: '2px solid white', transform: 'translateX(-50%)', cursor: 'grab', pointerEvents: 'auto', zIndex: 2 }}
        onPointerDown={e => onRotate(e, ov)}
      />
    </>
  )
}

// Floating toolbar shown on selection — stays upright (not inside the rotated
// box) and clamped inside the canvas.
function OverlayToolbar({ ov, theme, fonts, leftPx, topPx, maxW, onPatch, onFront, onBack, onDuplicate, onDelete, onEditText }) {
  const isText = ov.kind === 'text'
  const btn = 'text-[11px] px-1.5 py-1 rounded border bg-gray-50 border-gray-200 text-gray-600 hover:text-gray-900 transition-colors'
  const btnActive = 'text-[11px] px-1.5 py-1 rounded border bg-indigo-500 border-indigo-500 text-white'
  const swatch = (token) => (
    <button
      key={token}
      title={token}
      onClick={() => onPatch({ color: token })}
      className="w-5 h-5 rounded-full border border-gray-300"
      style={{ background: theme.colors[token], outline: ov.color === token ? '2px solid #6366f1' : 'none', outlineOffset: 1 }}
    />
  )
  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: clamp(leftPx, 130, maxW - 130),
        // Sit clear of the rotate lollipop (which reaches ~34px above the box).
        top: Math.max(2, topPx - 60),
        transform: 'translateX(-50%)',
        zIndex: 70,
      }}
      className="flex items-center gap-1.5 bg-white rounded-lg shadow-lg border border-gray-200 px-2 py-1.5"
    >
      {isText && (
        <>
          <select
            value={ov.fontFamily ?? 'display'}
            onChange={e => onPatch({ fontFamily: e.target.value })}
            className="text-[11px] bg-gray-50 border border-gray-200 rounded px-1 py-0.5 max-w-[92px] focus:outline-none"
            title="Font"
          >
            <option value="display">Display (theme)</option>
            <option value="body">Body (theme)</option>
            {fonts.map(f => <option key={f} value={f}>{f.startsWith('Custom-') ? 'Custom font' : f}</option>)}
          </select>
          <div className="flex items-center">
            <button className={btn} title="Smaller" onClick={() => onPatch({ fontSize: Math.max(1, +( (ov.fontSize ?? 5) - 0.5).toFixed(1)) })}>A-</button>
            <span className="text-[10px] text-gray-400 w-6 text-center">{(ov.fontSize ?? 5)}</span>
            <button className={btn} title="Bigger" onClick={() => onPatch({ fontSize: Math.min(40, +((ov.fontSize ?? 5) + 0.5).toFixed(1)) })}>A+</button>
          </div>
          <button className={ov.weight >= 700 ? btnActive : btn} title="Bold" onClick={() => onPatch({ weight: ov.weight >= 700 ? 400 : 700 })}><b>B</b></button>
          <div className="flex items-center gap-0.5">
            {[['left', '▤'], ['center', '☰'], ['right', '▥']].map(([a, icon]) => (
              <button key={a} className={(ov.align ?? 'center') === a ? btnActive : btn} onClick={() => onPatch({ align: a })}>{icon}</button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            {THEME_COLOR_TOKENS.map(swatch)}
            <input
              type="color"
              value={typeof ov.color === 'string' && ov.color.startsWith('#') ? ov.color : '#ffffff'}
              onChange={e => onPatch({ color: e.target.value })}
              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
              title="Custom color"
            />
          </div>
          <button className={btn} title="Edit text" onClick={onEditText}>✎</button>
          <span className="w-px h-4 bg-gray-200" />
        </>
      )}
      {!isText && (
        <>
          <div className="flex items-center">
            <button className={btn} title="Narrower" onClick={() => onPatch({ w: Math.max(3, (ov.w ?? 30) - 2) })}>−</button>
            <span className="text-[10px] text-gray-400 w-8 text-center">{Math.round(ov.w ?? 30)}%</span>
            <button className={btn} title="Wider" onClick={() => onPatch({ w: Math.min(100, (ov.w ?? 30) + 2) })}>+</button>
          </div>
          <span className="w-px h-4 bg-gray-200" />
        </>
      )}
      <button className={btn} title="Bring to front" onClick={onFront}>⬆</button>
      <button className={btn} title="Send to back" onClick={onBack}>⬇</button>
      <button className={btn} title="Duplicate" onClick={onDuplicate}>⧉</button>
      <button className="text-[11px] px-1.5 py-1 rounded border bg-red-50 border-red-200 text-red-500 hover:bg-red-100 transition-colors" title="Delete" onClick={onDelete}>🗑</button>
    </div>
  )
}
