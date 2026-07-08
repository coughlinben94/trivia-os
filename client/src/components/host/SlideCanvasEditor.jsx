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

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { nanoid } from 'nanoid'
import SlideRenderer from '../display/SlideRenderer.jsx'
import ParticleBackground from '../display/ParticleBackground.jsx'
import { DISPLAY_FONTS } from './ThemeCustomizeControls.jsx'
import { EASE_OUT } from '../../lib/easings.js'
import { SHINY_GOLD } from '../../lib/shinyGold.js'

const INNER_W = 1280
const INNER_H = 720
// Snap catch-radius, in PERCENT of canvas (width for x, height for y — the
// overlay coordinate space, never pixels). ~1% per the PowerPoint-style feel.
const SNAP_PCT = 1.2

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
// Overlay color tokens — resolution MUST match OverlayLayer.jsx exactly
// (WYSIWYG). Theme tokens read the active palette; fixed tokens are
// theme-independent. `gold` is the shiny signal made host-reachable; the
// per-theme `shinyAccent` stays for backward-compat and is relabelled
// "Theme Pop" in the picker so it no longer reads as "shiny".
const THEME_COLOR_TOKENS = ['text', 'textMuted', 'accent', 'highlight', 'shinyAccent']
const FIXED_COLOR_TOKENS = { gold: SHINY_GOLD }
const COLOR_SWATCHES = [
  { token: 'text',        label: 'Text' },
  { token: 'textMuted',   label: 'Muted' },
  { token: 'accent',      label: 'Accent' },
  { token: 'highlight',   label: 'Highlight' },
  { token: 'shinyAccent', label: 'Theme Pop' },
  { token: 'gold',        label: 'Gold — the shiny signal (same in every theme)' },
]
const tokenSwatchColor = (tok, theme) =>
  tok in FIXED_COLOR_TOKENS ? FIXED_COLOR_TOKENS[tok] : theme.colors[tok]
// Must match OverlayLayer's TEXT_SHADOW exactly (WYSIWYG). em-scaled.
const TEXT_SHADOW = '0 0.05em 0.35em rgba(0,0,0,0.55)'

export default function SlideCanvasEditor({
  slide, show, theme,
  data, setData, scheduleSave, change, flushSave, uploadMedia, getHostPhotos,
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
  // Layout mode is ON by default so the design toolbar above the canvas is live
  // the moment the editor opens — the strip is never dead space. The toolbar
  // itself houses the toggle to drop back to pure region editing if wanted.
  const [editLayout, setEditLayout] = useState(true)
  const [selectedOverlayId, setSelectedOverlayId] = useState(null)
  const [editingOverlayId, setEditingOverlayId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  // Snap guide positions in percent (x = vertical line's left%, y = horizontal
  // line's top%), or null when that axis isn't snapped. Editor-only chrome.
  const [guides, setGuides] = useState({ x: null, y: null })
  // Style applied to the NEXT inserted text box while nothing is selected — the
  // top toolbar's text controls edit this when there's no text overlay to target.
  const [textDefaults, setTextDefaults] = useState({
    fontFamily: 'display', fontSize: 5, color: 'text', align: 'center', weight: 700, italic: false, shadow: false,
  })
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
    // Undo/redo history is scoped to editing THIS slide — reset it on switch.
    setPast([])
    setFuture([])
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

  // ── undo / redo (in-memory, per-slide-editing session) ────────────────────
  // Mirror the latest committed overlays in a ref so a history snapshot is
  // never stale — correct even inside an async image insert or across a drag's
  // per-frame re-renders (where the closed-over `data` would lag).
  const overlaysRef = useRef(overlays)
  useEffect(() => { overlaysRef.current = data.overlays ?? [] }, [data.overlays])

  const MAX_HISTORY = 50
  const [past, setPast] = useState([])
  const [future, setFuture] = useState([])
  const cloneOverlays = (list) => (list ?? []).map(o => ({ ...o }))
  // Push the PRE-change overlays onto the undo stack and invalidate redo. The
  // updater is pure (StrictMode-safe); setFuture is a separate plain call.
  function pushHistorySnapshot(prevOverlays) {
    setPast(p => {
      const next = [...p, cloneOverlays(prevOverlays)]
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
    })
    setFuture([])
  }
  // Snapshot before any discrete overlay edit (create/delete/duplicate/style/z).
  function recordHistory() { pushHistorySnapshot(overlaysRef.current) }
  // Restore a snapshot through the SAME scheduleSave → chained updateSlide path
  // every other overlay edit uses, so the serialized write chain stays intact.
  function applyOverlaysSnapshot(snap) {
    const next = cloneOverlays(snap)
    setData(d => { const nd = { ...d, overlays: next }; scheduleSave({ data: nd }); return nd })
    setSelectedOverlayId(id => next.some(o => o.id === id) ? id : null)
    setEditingOverlayId(null)
  }
  function undo() {
    if (past.length === 0) return
    const prev = past[past.length - 1]
    setPast(past.slice(0, -1))
    setFuture([...future, cloneOverlays(overlaysRef.current)])
    applyOverlaysSnapshot(prev)
  }
  function redo() {
    if (future.length === 0) return
    const nextSnap = future[future.length - 1]
    setFuture(future.slice(0, -1))
    setPast([...past, cloneOverlays(overlaysRef.current)])
    applyOverlaysSnapshot(nextSnap)
  }

  function resolveFont(f) {
    if (f === 'display') return theme.fonts.display
    if (f === 'body') return theme.fonts.body
    return f || theme.fonts.display
  }
  function resolveColor(c) {
    if (!c) return theme.colors.text
    if (c in FIXED_COLOR_TOKENS) return FIXED_COLOR_TOKENS[c]
    return THEME_COLOR_TOKENS.includes(c) ? theme.colors[c] : c
  }

  // ── overlay CRUD ──────────────────────────────────────────────────────────
  function addTextAt(xPct, yPct) {
    recordHistory()
    const id = nanoid()
    commitOverlays(cur => [...cur, {
      id, kind: 'text',
      x: clamp(xPct, 0, 92), y: clamp(yPct, 0, 92),
      w: 26, rotation: 0, z: nextZ(cur),
      text: '', ...textDefaults,
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
        recordHistory()
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

  // Insert an image overlay from an already-hosted URL (Ben photo picker).
  // Centered horizontally at a comfortable third-height; w=30 → x=(100-30)/2.
  function addImageFromUrl(url) {
    if (!url) return
    recordHistory()
    const id = nanoid()
    commitOverlays(cur => [...cur, { id, kind: 'image', x: 35, y: 28, w: 30, rotation: 0, z: nextZ(cur), mediaUrl: url }])
    setSelectedOverlayId(id)
  }

  // record=false for the empty-text auto-prune (the box's creation already made
  // one history entry; a paired prune snapshot would add a no-op undo step).
  function deleteOverlay(id, record = true) {
    if (record) recordHistory()
    commitOverlays(cur => cur.filter(o => o.id !== id))
    if (selectedOverlayId === id) setSelectedOverlayId(null)
    if (editingOverlayId === id) setEditingOverlayId(null)
  }
  function duplicateOverlay(id) {
    recordHistory()
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
  // Text styling from the top toolbar: apply to the selected text overlay, or —
  // when nothing is selected — update the defaults the next inserted box uses.
  function applyTextStyle(patch) {
    if (selectedOverlay?.kind === 'text') { recordHistory(); patchDiscrete(selectedOverlay.id, patch) }
    else setTextDefaults(d => ({ ...d, ...patch }))
  }
  function bringToFront(id) {
    recordHistory()
    commitOverlays(cur => cur.map(o => o.id === id ? { ...o, z: nextZ(cur) } : o))
  }
  function sendToBack(id) {
    recordHistory()
    commitOverlays(cur => {
      const minZ = Math.min(0, ...cur.map(o => o.z ?? 0))
      return cur.map(o => o.id === id ? { ...o, z: minZ - 1 } : o)
    })
  }
  // One-click centering: put the overlay's CENTER point on the canvas midline,
  // accounting for its own width/height so the visual center lands at 50%.
  // Discrete ops — one undo snapshot each, functional commit (OV-2), persisted
  // through the same scheduleSave → chained updateSlide path.
  function centerOverlayH(id) {
    const o = overlaysRef.current.find(v => v.id === id)
    if (!o) return
    recordHistory()
    patchDiscrete(id, { x: clamp(50 - (o.w ?? 0) / 2, 0, 100) })
  }
  function centerOverlayV(id) {
    const el = overlayRef.current?.querySelector(`[data-ov-box="${id}"]`)
    const hpct = el ? el.offsetHeight / scaledH * 100 : 0
    recordHistory()
    patchDiscrete(id, { y: clamp(50 - hpct / 2, 0, 100) })
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
    const w = ov.w ?? 0
    // Dragged box height in percent-of-canvas — measured ONCE, synchronously
    // (e.currentTarget is reset after the event; can't read it inside onMove).
    const draggedHpct = e.currentTarget.offsetHeight / scaledH * 100
    // Precompute snap targets ONCE at drag start (per-move stays a handful of
    // comparisons against a fixed list): canvas center on each axis, plus every
    // OTHER overlay's left/center/right (x) and top/middle/bottom (y). All in
    // percent space (never pixels — Critical Rule 8).
    const xTargets = [50], yTargets = [50]
    overlayRef.current.querySelectorAll('[data-ov-box]').forEach(el => {
      const oid = el.dataset.ovBox
      if (oid === ov.id) return
      const o = overlaysRef.current.find(v => v.id === oid)
      if (!o) return
      const ohp = el.offsetHeight / scaledH * 100
      const ox = o.x ?? 0, oy = o.y ?? 0, ow = o.w ?? 0
      xTargets.push(ox, ox + ow / 2, ox + ow)
      yTargets.push(oy, oy + ohp / 2, oy + ohp)
    })
    // Snapshot the pre-drag state; committed on pointerup only if it moved, so a
    // plain click-to-select doesn't create a spurious undo step.
    const before = cloneOverlays(overlaysRef.current)
    let moved = false
    // Snap one axis: try each of the box's anchors (offsets) against every
    // target, return the closest within threshold + the guide line to draw.
    function snapAxis(raw, offsets, targets) {
      let best = SNAP_PCT, val = raw, guide = null
      for (const off of offsets) {
        for (const T of targets) {
          const d = Math.abs((raw + off) - T)
          if (d < best) { best = d; val = T - off; guide = T }
        }
      }
      return { val, guide }
    }
    function onMove(ev) {
      const dx = (ev.clientX - startX) / oRect.width * 100
      const dy = (ev.clientY - startY) / oRect.height * 100
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) moved = true
      let nx = clamp(startOvX + dx, 0, 95)
      let ny = clamp(startOvY + dy, 0, 95)
      let gx = null, gy = null
      // Alt/Option temporarily disables snapping (PowerPoint convention). x and
      // y snap independently — a box can be snapped on one axis, free on the other.
      if (!ev.altKey) {
        const sx = snapAxis(nx, [0, w / 2, w], xTargets)                     // left / center / right
        const sy = snapAxis(ny, [0, draggedHpct / 2, draggedHpct], yTargets) // top / middle / bottom
        nx = clamp(sx.val, 0, 95); gx = sx.guide
        ny = clamp(sy.val, 0, 95); gy = sy.guide
      }
      setGuides({ x: gx, y: gy })
      patchOverlay(ov.id, { x: nx, y: ny })
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      setGuides({ x: null, y: null })
      if (moved) pushHistorySnapshot(before)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  // ── keyboard: delete selected / Esc deselect (never while inline-editing) ──
  useEffect(() => {
    if (!editLayout) return
    function onKey(e) {
      // Bail while inline-editing a text box or with focus in any field, so
      // Cmd/Ctrl+Z there runs the browser's NATIVE text undo, not overlay undo.
      if (editingOverlayId) return
      const ae = document.activeElement
      if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return }
      if (e.key === 'Escape') { setSelectedOverlayId(null); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedOverlayId) {
        e.preventDefault()
        deleteOverlay(selectedOverlayId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editLayout, editingOverlayId, selectedOverlayId, overlays, past, future])

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
    if (!text) deleteOverlay(id, false)
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

  // Background click on the canvas: deselect only. Text is inserted from the
  // design toolbar's "Text" button (addTextAt), not by clicking bare canvas —
  // with layout mode ON by default, a stray click-to-add would otherwise spawn
  // a self-pruning empty box every time the host clicks to deselect or inspect.
  function onCanvasBackgroundPointerDown(e) {
    setSelectedRegionId(null)
    if (editingOverlayId) return // let the editable's blur commit first
    setSelectedOverlayId(null)
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
    fontStyle: ov.italic ? 'italic' : 'normal',
    textShadow: ov.shadow ? TEXT_SHADOW : 'none',
    textAlign: ov.align ?? 'center',
    lineHeight: 1.15,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  })

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── design toolbar (fills the strip above the canvas) ── */}
      <DesignToolbar
        editLayout={editLayout}
        onToggleLayout={toggleEditLayout}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onInsertText={() => addTextAt(37, 42)}
        onInsertImage={() => fileInputRef.current?.click()}
        getHostPhotos={getHostPhotos}
        uploadMedia={uploadMedia}
        onInsertPhoto={addImageFromUrl}
        uploading={uploading}
        uploadError={uploadError}
        theme={theme}
        fonts={fontOptions(show)}
        textStyle={selectedOverlay?.kind === 'text' ? selectedOverlay : (selectedOverlay ? null : textDefaults)}
        isDefaults={!selectedOverlay}
        onTextStyle={applyTextStyle}
        selectedOverlay={selectedOverlay}
        onCenterH={() => selectedOverlay && centerOverlayH(selectedOverlay.id)}
        onCenterV={() => selectedOverlay && centerOverlayV(selectedOverlay.id)}
        onFront={() => selectedOverlay && bringToFront(selectedOverlay.id)}
        onBack={() => selectedOverlay && sendToBack(selectedOverlay.id)}
        onDuplicate={() => selectedOverlay && duplicateOverlay(selectedOverlay.id)}
        onDelete={() => selectedOverlay && deleteOverlay(selectedOverlay.id)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { addImageFromFile(e.target.files?.[0]); e.target.value = '' }}
      />

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

            {/* ── snap guides (editor-only chrome — never rendered by OverlayLayer
                 or on /display; fixed high-contrast magenta + dark halo so it
                 reads on every theme background, not a theme token) ── */}
            {editLayout && guides.x != null && (
              <div style={{ position: 'absolute', left: `${guides.x}%`, top: 0, bottom: 0, width: 0, borderLeft: '1.5px dashed #ff2d95', boxShadow: '0 0 2px rgba(0,0,0,0.55)', pointerEvents: 'none', zIndex: 55 }} />
            )}
            {editLayout && guides.y != null && (
              <div style={{ position: 'absolute', top: `${guides.y}%`, left: 0, right: 0, height: 0, borderTop: '1.5px dashed #ff2d95', boxShadow: '0 0 2px rgba(0,0,0,0.55)', pointerEvents: 'none', zIndex: 55 }} />
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

            {/* Floating per-overlay toolbar removed: the persistent top design
                toolbar now owns all styling + arrange for the selected box, and
                the box keeps its on-canvas grammar (drag, corner-resize, rotate
                lollipop, double-click text to edit, Delete key). One editing
                grammar instead of two. */}
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
    const before = cloneOverlays(overlaysRef.current)
    let changed = false
    function onMove(ev) {
      changed = true
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
      if (changed) pushHistorySnapshot(before)
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
    const before = cloneOverlays(overlaysRef.current)
    let changed = false
    function onMove(ev) {
      changed = true
      let nr = startRot + (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI - startA)
      if (ev.shiftKey) nr = Math.round(nr / 15) * 15
      patchOverlay(ov.id, { rotation: Math.round(nr) })
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      if (changed) pushHistorySnapshot(before)
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

// ─────────────────────────────────────────────────────────────────────────────
// DesignToolbar — the persistent PowerPoint-style design strip above the canvas.
// It lives in this file (not SlideEditor) on purpose: every control it drives —
// overlay CRUD, the serialized write chain (scheduleSave), selection state,
// layout mode — is owned by SlideCanvasEditor. Lifting it up would mean lifting
// all that state with it. The strip renders at the top of SlideEditor's left
// column, so it's visually "above the canvas" while the state stays co-located.
//
// OV-1 rule: EVERY button preventDefaults on pointerdown, so clicking a toolbar
// control while a text overlay is being inline-edited never steals focus from
// the contenteditable (a blur there commits/empty-prunes the box mid-edit).
// ─────────────────────────────────────────────────────────────────────────────
// ── Icon set ──────────────────────────────────────────────────────────────
// One coherent 16px stroke set (no emoji-as-icon), currentColor + 1.6 stroke,
// round caps, drawn on a 20-unit grid. Replaces the old grab-bag of unicode
// arrows and emoji so the strip reads as a single instrument. B / I stay as
// typographic glyphs (the universal bold/italic controls, not emoji).
function Icon({ name, size = 16 }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const dot = (cx) => <circle cx={cx} cy="10" r="1.35" fill="currentColor" stroke="none" />
  const paths = {
    undo:        <><path {...s} d="M4.5 8.5h6.5a3.75 3.75 0 0 1 0 7.5H8" /><path {...s} d="M7 5.5 4 8.5l3 3" /></>,
    redo:        <><path {...s} d="M15.5 8.5H9a3.75 3.75 0 0 0 0 7.5h3" /><path {...s} d="M13 5.5l3 3-3 3" /></>,
    text:        <><path {...s} d="M4.5 5.5h11" /><path {...s} d="M10 5.5v10.5" /></>,
    image:       <><rect {...s} x="3.25" y="4.25" width="13.5" height="11.5" rx="2" /><circle {...s} cx="7.5" cy="8.25" r="1.25" /><path {...s} d="M4 13.5l3.4-3.1a1.5 1.5 0 0 1 2 0l6.4 5.3" /></>,
    photo:       <><circle {...s} cx="10" cy="7" r="3" /><path {...s} d="M4.5 16.5a5.5 5.5 0 0 1 11 0" /></>,
    alignLeft:   <><path {...s} d="M4 6h12M4 10h8M4 14h11" /></>,
    alignCenter: <><path {...s} d="M4 6h12M6 10h8M5 14h10" /></>,
    alignRight:  <><path {...s} d="M4 6h12M8 10h8M5 14h11" /></>,
    shadow:      <><path {...s} d="M7.5 14 10.5 5l3 9" /><path {...s} d="M8.7 11.2h3.6" /><path d="M6 16.4h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.35" /></>,
    front:       <><path {...s} d="M4.25 12.25v-6.5a1.5 1.5 0 0 1 1.5-1.5h6.5" strokeOpacity="0.45" /><rect {...s} x="7.25" y="7.25" width="8.5" height="8.5" rx="1.75" /></>,
    back:        <><rect {...s} x="4.25" y="4.25" width="8.5" height="8.5" rx="1.75" strokeOpacity="0.45" /><rect {...s} x="7.25" y="7.25" width="8.5" height="8.5" rx="1.75" /></>,
    duplicate:   <><rect {...s} x="7.25" y="7.25" width="8.5" height="8.5" rx="1.75" /><path {...s} d="M12.75 7.25V5.75a1.5 1.5 0 0 0-1.5-1.5h-5.5a1.5 1.5 0 0 0-1.5 1.5v5.5a1.5 1.5 0 0 0 1.5 1.5H7.25" /></>,
    trash:       <><path {...s} d="M4.75 6h10.5" /><path {...s} d="M8 6V4.6h4V6" /><path {...s} d="M6.1 6l.7 9.4A1.5 1.5 0 0 0 8.3 16.8h3.4a1.5 1.5 0 0 0 1.5-1.4L13.9 6" /></>,
    centerH:     <><path {...s} d="M10 3.25v13.5" strokeDasharray="1.6 2.2" strokeOpacity="0.6" /><rect {...s} x="5" y="7.5" width="10" height="5" rx="1.25" /></>,
    centerV:     <><path {...s} d="M3.25 10h13.5" strokeDasharray="1.6 2.2" strokeOpacity="0.6" /><rect {...s} x="7.5" y="5" width="5" height="10" rx="1.25" /></>,
    box:         <rect x="5" y="5" width="10" height="10" rx="2.5" fill="currentColor" stroke="none" />,
    more:        <>{dot(5)}{dot(10)}{dot(15)}</>,
    chevron:     <path {...s} d="M6.5 8.5 10 12l3.5-3.5" />,
    plus:        <path {...s} d="M10 5.25v9.5M5.25 10h9.5" />,
    minus:       <path {...s} d="M5.25 10h9.5" />,
    design:      <><path {...s} d="M4 16.25 5 12.5l7.25-7.25 2.5 2.5L7.5 15l-3.5 1.25Z" /><path {...s} d="M10.75 6.75 12.5 8.5" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 20 20" className="pointer-events-none block">{paths[name]}</svg>
}

// pointerdown focus-steal guard shared by every toolbar button (OV-1).
const tbPD = e => e.preventDefault()

// Every control sits on the same 28px-tall grid so the strip height is
// invariant across states — the scaled canvas below must never jump.
function btnCls({ active, disabled, danger } = {}) {
  const base = 'host-button inline-flex items-center justify-center h-7 rounded-md border text-[13px] font-medium leading-none shrink-0 select-none'
  if (disabled) return `${base} bg-white border-gray-100 text-gray-300 cursor-not-allowed`
  if (danger)   return `${base} bg-white border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600`
  if (active)   return `${base} bg-indigo-500 border-indigo-500 text-white`
  return `${base} bg-white border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300 hover:text-gray-900`
}
// Square icon button (w-7), or a labeled button (wide) — one primitive so
// heights/paddings/press-feedback stay identical everywhere.
function TbBtn({ title, onClick, active, disabled, danger, wide, innerRef, children }) {
  return (
    <button
      ref={innerRef}
      type="button"
      onPointerDown={tbPD}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active ? true : undefined}
      className={`${btnCls({ active, disabled, danger })} ${wide ? 'px-2.5 gap-1.5' : 'w-7'}`}
    >
      {children}
    </button>
  )
}
function TbSep() {
  return <span className="mx-1 h-5 w-px bg-gray-200/90 shrink-0" aria-hidden />
}

// ── Shared portal popover ───────────────────────────────────────────────────
// Home for every toolbar dropdown (font, color, Ben photo, overflow). Portal-
// rendered so the strip's clipping can never cut it; the panel clamps to the
// viewport's right edge so a far-right dropdown stays fully on-screen. Escape
// closes it in the CAPTURE phase (stopped) so it never bubbles up to close the
// whole SlideEditor (OV-3). The trigger preventDefaults on pointerdown and the
// panel stops pointerdown propagation, so opening/using it never blurs an
// in-progress inline edit (OV-1). Entrance is a 150ms origin-aware scale/fade,
// dropped to a plain fade under reduced motion.
function ToolbarPopover({ width = 180, renderTrigger, children, panelClass = '' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const reduce = useReducedMotion()

  function place() {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - width - 8))
    setPos({ top: Math.round(r.bottom + 6), left })
  }
  function toggle() { if (open) { setOpen(false); return } place(); setOpen(true) }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return; setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false) } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true) // capture phase (OV-3)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  return (
    <>
      {renderTrigger({ innerRef: btnRef, onClick: toggle, open })}
      {open && createPortal(
        <motion.div
          ref={popRef}
          onPointerDown={(e) => e.stopPropagation()}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 200, width, transformOrigin: 'top left' }}
          className={`rounded-xl border border-gray-200 bg-white shadow-[0_16px_40px_-12px_rgba(15,23,42,0.28)] ${panelClass}`}
        >
          {children({ close: () => setOpen(false) })}
        </motion.div>,
        document.body,
      )}
    </>
  )
}

// A labeled row inside a portal menu (overflow "⋯"). Icon + label + optional
// shortcut hint; preventDefaults on pointerdown like every toolbar control.
function MenuRow({ icon, label, hint, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      onPointerDown={tbPD}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[12px] transition-colors ${
        disabled ? 'text-gray-300 cursor-not-allowed' : danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <span className={disabled ? 'text-gray-300' : danger ? 'text-red-500' : 'text-gray-500'}><Icon name={icon} size={15} /></span>
      <span className="flex-1 text-left">{label}</span>
      {hint && <span className="text-[10px] text-gray-400 tabular-nums">{hint}</span>}
    </button>
  )
}
function MenuLabel({ children }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-2 pt-1.5 pb-1">{children}</p>
}

// Deterministic overflow budget. Each control sits on a fixed grid, so the
// width the strip NEEDS is a function of which groups are present (selection
// state) — not of rendered content, which sidesteps the scrollWidth feedback
// loop. When the measured strip is narrower than that, the lowest-priority
// groups collapse into a portal "⋯" menu; the strip is overflow-hidden so a
// slight mis-estimate can never surface a horizontal scrollbar cut.
const TB_GROUP_W = { design: 96, history: 66, insert: 104, text: 566, arrange: 208 }
const TB_SEP_W = 17
const TB_MORE_W = 34
const TB_COLLAPSE_ORDER = ['arrange', 'history'] // lowest priority collapses first

function DesignToolbar({
  editLayout, onToggleLayout,
  onUndo, onRedo, canUndo, canRedo,
  onInsertText, onInsertImage, getHostPhotos, uploadMedia, onInsertPhoto, uploading, uploadError,
  theme, fonts, textStyle, isDefaults, onTextStyle,
  selectedOverlay, onCenterH, onCenterV, onFront, onBack, onDuplicate, onDelete,
}) {
  const barRef = useRef(null)
  const [availW, setAvailW] = useState(0)
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAvailW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Which optional groups are present this render (drives the width budget).
  const present = editLayout
    ? ['design', 'history', 'insert', ...(textStyle ? ['text'] : []), ...(selectedOverlay ? ['arrange'] : [])]
    : ['design']

  // Collapse the lowest-priority present groups into the "⋯" menu until the
  // needed width fits the measured strip. Purely a function of `present` +
  // `availW`, so it can't feed back on its own rendered size.
  const collapsed = new Set()
  if (editLayout && availW > 0) {
    let needed = present.reduce((sum, g) => sum + TB_GROUP_W[g], 0) + Math.max(0, present.length - 1) * TB_SEP_W
    for (const g of TB_COLLAPSE_ORDER) {
      if (needed <= availW - 8) break
      if (!present.includes(g)) continue
      collapsed.add(g)
      needed -= TB_GROUP_W[g] + TB_SEP_W
      if (collapsed.size === 1) needed += TB_MORE_W + TB_SEP_W // add the ⋯ button once
    }
  }
  const inline = (g) => present.includes(g) && !collapsed.has(g)

  return (
    <div ref={barRef} className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 bg-white overflow-hidden">
      {/* Master toggle — always present (never clips), so the strip is never
          dead space and design mode is always toggleable. */}
      <TbBtn
        wide
        active={editLayout}
        onClick={onToggleLayout}
        title={editLayout ? 'Design tools on — click to hide overlay editing' : 'Turn on overlay design tools'}
      >
        <Icon name="design" /> Design
      </TbBtn>

      {editLayout && (
        <>
          {/* Inline groups live in a min-w-0/clip track so that, at widths too
              narrow even after collapsing, they clip their own trailing
              controls INSTEAD of pushing the pinned "⋯" off-screen — the
              collapsed groups therefore stay reachable at any width. */}
          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            {inline('history') && (
              <>
                <TbSep />
                <TbBtn disabled={!canUndo} onClick={onUndo} title="Undo (⌘Z / Ctrl+Z)"><Icon name="undo" /></TbBtn>
                <TbBtn disabled={!canRedo} onClick={onRedo} title="Redo (⇧⌘Z / Ctrl+Shift+Z)"><Icon name="redo" /></TbBtn>
              </>
            )}

            {inline('insert') && (
              <>
                <TbSep />
                <TbBtn onClick={onInsertText} title="Add a text box"><Icon name="text" /></TbBtn>
                <TbBtn onClick={onInsertImage} title="Upload an image"><Icon name="image" /></TbBtn>
                <BenPhotoInsert getHostPhotos={getHostPhotos} uploadMedia={uploadMedia} onInsert={onInsertPhoto} />
              </>
            )}
            {uploading && <span className="text-[11px] text-gray-400 shrink-0 px-1">Uploading…</span>}
            {uploadError && <span className="text-[11px] text-red-500 shrink-0 px-1 max-w-[140px] truncate" title={uploadError}>{uploadError}</span>}

            {/* TEXT — styles the selected text overlay, or the next-box defaults */}
            {textStyle && (
              <>
                <TbSep />
                <TextStyleGroup theme={theme} fonts={fonts} style={textStyle} isDefaults={isDefaults} onStyle={onTextStyle} />
              </>
            )}

            {inline('arrange') && (
              <>
                <TbSep />
                <TbBtn onClick={onCenterH} title="Center on canvas — horizontal (⌥-drag disables snapping)"><Icon name="centerH" /></TbBtn>
                <TbBtn onClick={onCenterV} title="Center on canvas — vertical (⌥-drag disables snapping)"><Icon name="centerV" /></TbBtn>
                <TbBtn onClick={onFront} title="Bring forward"><Icon name="front" /></TbBtn>
                <TbBtn onClick={onBack} title="Send backward"><Icon name="back" /></TbBtn>
                <TbBtn onClick={onDuplicate} title="Duplicate"><Icon name="duplicate" /></TbBtn>
                <TbBtn danger onClick={onDelete} title="Delete (Del)"><Icon name="trash" /></TbBtn>
              </>
            )}
          </div>

          {/* Overflow "⋯" — pinned (shrink-0), never clipped */}
          {collapsed.size > 0 && (
            <>
              <TbSep />
              <OverflowMenu
                collapsed={collapsed}
                canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo}
                onCenterH={onCenterH} onCenterV={onCenterV} onFront={onFront} onBack={onBack}
                onDuplicate={onDuplicate} onDelete={onDelete}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

// Overflow "⋯" — houses whichever low-priority groups didn't fit inline, as
// labeled rows in a portal menu (never clipped, always reachable). Repeatable
// actions (undo/redo/front/back) keep the menu open; one-shot actions close it.
function OverflowMenu({ collapsed, canUndo, canRedo, onUndo, onRedo, onCenterH, onCenterV, onFront, onBack, onDuplicate, onDelete }) {
  return (
    <ToolbarPopover
      width={196}
      renderTrigger={({ innerRef, onClick, open }) => (
        <TbBtn innerRef={innerRef} active={open} onClick={onClick} title="More tools"><Icon name="more" /></TbBtn>
      )}
    >
      {({ close }) => (
        <div className="p-1.5">
          {collapsed.has('history') && (
            <>
              <MenuLabel>History</MenuLabel>
              <MenuRow icon="undo" label="Undo" hint="⌘Z" disabled={!canUndo} onClick={onUndo} />
              <MenuRow icon="redo" label="Redo" hint="⇧⌘Z" disabled={!canRedo} onClick={onRedo} />
            </>
          )}
          {collapsed.has('arrange') && (
            <>
              {collapsed.has('history') && <div className="my-1 border-t border-gray-100" />}
              <MenuLabel>Arrange</MenuLabel>
              <MenuRow icon="centerH" label="Center horizontally" onClick={() => { onCenterH(); close() }} />
              <MenuRow icon="centerV" label="Center vertically" onClick={() => { onCenterV(); close() }} />
              <MenuRow icon="front" label="Bring forward" onClick={onFront} />
              <MenuRow icon="back" label="Send backward" onClick={onBack} />
              <MenuRow icon="duplicate" label="Duplicate" onClick={() => { onDuplicate(); close() }} />
              <MenuRow icon="trash" label="Delete" hint="Del" danger onClick={() => { onDelete(); close() }} />
            </>
          )}
        </div>
      )}
    </ToolbarPopover>
  )
}

// Ben Photo picker — the canonical home for dropping a host photo onto any
// slide. Fetches the show's trivia-host-photos bucket on open, click a thumb to
// insert it centered, or upload a new one (uploadMedia(file, true)). Rendered
// through the shared ToolbarPopover (portal, viewport-clamped, capture-phase
// Escape → OV-3, every control preventDefaults on pointerdown → OV-1).
function BenPhotoInsert({ getHostPhotos, uploadMedia, onInsert }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const fileRef = useRef(null)

  function load() {
    setErr(null); setLoading(true)
    Promise.resolve(getHostPhotos?.())
      .then(p => { setPhotos(Array.isArray(p) ? p : []); setLoading(false) })
      .catch(() => { setPhotos([]); setLoading(false) })
  }
  async function handleUpload(file, close) {
    if (!file) return
    setBusy(true); setErr(null)
    try {
      const res = await uploadMedia(file, true)
      if (res?.url) { setPhotos(prev => [{ url: res.url, filename: res.filename }, ...prev]); onInsert(res.url); close() }
      else setErr('Upload failed — no URL returned')
    } catch (e) { setErr(e?.message || 'Upload failed') }
    finally { setBusy(false) }
  }

  return (
    <ToolbarPopover
      width={300}
      renderTrigger={({ innerRef, onClick, open }) => (
        <TbBtn
          innerRef={innerRef}
          active={open}
          title="Insert a Ben photo"
          onClick={() => { if (!open) load(); onClick() }}
        >
          <Icon name="photo" />
        </TbBtn>
      )}
    >
      {({ close }) => (
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Ben Photos</span>
            <button onPointerDown={tbPD} onClick={close} className="text-gray-400 hover:text-gray-600 text-sm leading-none">✕</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { handleUpload(e.target.files?.[0], close); e.target.value = '' }} />
          <button
            onPointerDown={tbPD}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full text-xs font-medium px-2 py-1.5 mb-2 rounded-md border border-dashed border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors disabled:opacity-50"
          >
            {busy ? 'Uploading…' : 'Upload new…'}
          </button>
          {err && <p className="text-[11px] text-red-500 mb-2">{err}</p>}
          {loading ? (
            <p className="text-[11px] text-gray-400 text-center py-6">Loading…</p>
          ) : photos.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-6">No Ben photos yet — upload one above.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto">
              {photos.map(p => (
                <button
                  key={p.url}
                  onPointerDown={tbPD}
                  onClick={() => { onInsert(p.url); close() }}
                  title="Insert this photo"
                  className="aspect-square rounded-md overflow-hidden border border-gray-200 hover:border-indigo-400 transition-colors"
                >
                  <img src={p.url} alt="" className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </ToolbarPopover>
  )
}

// Text styling controls. Every control preventDefaults on pointerdown so
// styling a box mid-inline-edit never blurs the caret (OV-1).
//
// The leading TARGET CHIP is the fix for the silent font-change bug: the text
// controls always style EITHER the selected text overlay OR the next-box
// defaults, and the chip states which — unmistakably — instead of the old
// easy-to-miss "defaults" pill. Crucially, neither target is the slide's OWN
// built-in headline (that reads theme.fonts.display, a per-show override this
// toolbar must never touch), so the defaults chip's tooltip points the host at
// Theme for that. Routing is unchanged (SlideCanvasEditor.applyTextStyle) —
// only the signalling is made explicit.
function TextStyleGroup({ theme, fonts, style, isDefaults, onStyle }) {
  const size = style.fontSize ?? 5
  const weight = style.weight ?? 700
  const align = style.align ?? 'center'
  const step = (delta) => onStyle({ fontSize: clamp(+(size + delta).toFixed(1), 1, 40) })
  return (
    <>
      {/* target chip — what these controls are styling */}
      <span
        title={isDefaults
          ? 'Styling the NEXT text box you insert. The slide’s own text uses the show theme font — change that in Theme.'
          : 'Styling the selected text box.'}
        className={`inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] font-semibold shrink-0 select-none ${
          isDefaults ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
        }`}
      >
        <Icon name={isDefaults ? 'text' : 'box'} size={13} />
        <span className="max-w-[92px] truncate">{isDefaults ? 'New text box' : 'Selected text'}</span>
      </span>

      <FontDropdown value={style.fontFamily ?? 'display'} fonts={fonts} onChange={f => onStyle({ fontFamily: f })} />

      {/* size stepper — one bordered unit so it reads as a single control */}
      <div className="inline-flex items-center h-7 rounded-md border border-gray-200 bg-white shrink-0 overflow-hidden">
        <button type="button" onPointerDown={tbPD} onClick={() => step(-0.5)} title="Smaller" className="host-button h-full w-7 inline-flex items-center justify-center text-gray-600 hover:bg-gray-100"><Icon name="minus" size={14} /></button>
        <span className="w-8 text-center text-[11px] tabular-nums text-gray-700 select-none border-x border-gray-200 leading-[26px]" title="Font size (% of canvas height)">{size}</span>
        <button type="button" onPointerDown={tbPD} onClick={() => step(0.5)} title="Bigger" className="host-button h-full w-7 inline-flex items-center justify-center text-gray-600 hover:bg-gray-100"><Icon name="plus" size={14} /></button>
      </div>

      {/* bold / italic */}
      <TbBtn active={weight >= 700} onClick={() => onStyle({ weight: weight >= 700 ? 400 : 700 })} title="Bold"><span className="font-bold text-[13px] leading-none">B</span></TbBtn>
      <TbBtn active={!!style.italic} onClick={() => onStyle({ italic: !style.italic })} title="Italic"><span className="italic font-serif text-[13px] leading-none">I</span></TbBtn>

      {/* align — segmented control */}
      <div className="inline-flex items-center h-7 rounded-md border border-gray-200 bg-white shrink-0 overflow-hidden">
        {[['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignRight']].map(([a, ic], i) => (
          <button
            key={a}
            type="button"
            onPointerDown={tbPD}
            onClick={() => onStyle({ align: a })}
            title={`Align ${a}`}
            aria-pressed={align === a}
            className={`host-button h-full w-7 inline-flex items-center justify-center ${i > 0 ? 'border-l border-gray-200' : ''} ${align === a ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Icon name={ic} />
          </button>
        ))}
      </div>

      {/* shadow (TV readability) */}
      <TbBtn active={!!style.shadow} onClick={() => onStyle({ shadow: !style.shadow })} title="Text shadow — pops text off busy backgrounds on TV"><Icon name="shadow" /></TbBtn>

      {/* color */}
      <ColorControl theme={theme} value={style.color} onChange={(c) => onStyle({ color: c })} />
    </>
  )
}

// Color control — a single swatch button that opens a portal popover of the
// theme's color tokens plus a custom picker. Collapsing five inline swatches +
// a native input into one button is the biggest single width saving in the
// strip (a direct fix for the overflow defect) and reads cleaner. The native
// <input type="color"> lives inside the popover — it's the one focus-taking
// control, same accepted tradeoff as before, now out of the hot path.
function ColorControl({ theme, value, onChange }) {
  const swatchColor =
    value in FIXED_COLOR_TOKENS ? FIXED_COLOR_TOKENS[value]
    : THEME_COLOR_TOKENS.includes(value) ? theme.colors[value]
    : (typeof value === 'string' && value.startsWith('#') ? value : theme.colors.text)
  return (
    <ToolbarPopover
      width={208}
      renderTrigger={({ innerRef, onClick, open }) => (
        <button
          ref={innerRef}
          type="button"
          onPointerDown={tbPD}
          onClick={onClick}
          title="Text color"
          aria-pressed={open}
          className={`${btnCls({ active: open })} w-7`}
        >
          <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: swatchColor, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)' }} />
        </button>
      )}
    >
      {() => (
        <div className="p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Text color</p>
          <div className="flex items-center gap-1.5 mb-2.5">
            {COLOR_SWATCHES.flatMap(({ token, label }) => {
              const btn = (
                <button
                  key={token}
                  type="button"
                  onPointerDown={tbPD}
                  onClick={() => onChange(token)}
                  title={label}
                  className="w-6 h-6 rounded-full border border-gray-200 shrink-0"
                  style={{ background: tokenSwatchColor(token, theme), outline: value === token ? '2px solid #6366f1' : 'none', outlineOffset: 1 }}
                />
              )
              // Hairline divider separating the per-theme tokens from fixed Gold.
              return token === 'gold'
                ? [<span key="gold-div" aria-hidden className="w-px h-6 bg-gray-200 mx-0.5 shrink-0" />, btn]
                : [btn]
            })}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer">
            <input
              type="color"
              value={typeof value === 'string' && value.startsWith('#') ? value : '#ffffff'}
              onChange={(e) => onChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
            />
            Custom…
          </label>
        </div>
      )}
    </ToolbarPopover>
  )
}

// Focus-safe font picker (custom button popover, not a native <select> that
// would blur an in-progress inline edit). Uses the shared ToolbarPopover
// (portal, viewport-clamped, capture-phase Escape → OV-3, pointerdown-safe →
// OV-1). Each option previews in its own family.
function FontDropdown({ value, fonts, onChange }) {
  const options = [
    { value: 'display', label: 'Theme font' },
    { value: 'body', label: 'Theme body' },
    ...fonts.map(f => ({ value: f, label: f.startsWith('Custom-') ? 'Custom font' : f })),
  ]
  const current = options.find(o => o.value === value)
  const familyOf = (v) => (v && v !== 'display' && v !== 'body' ? `'${v}', sans-serif` : undefined)
  return (
    <ToolbarPopover
      width={168}
      renderTrigger={({ innerRef, onClick, open }) => (
        <button
          ref={innerRef}
          type="button"
          onPointerDown={tbPD}
          onClick={onClick}
          title="Font"
          aria-pressed={open}
          className={`${btnCls({ active: open })} w-28 px-2 gap-1 justify-between`}
          style={{ fontFamily: familyOf(value) }}
        >
          <span className="truncate text-left">{current?.label ?? 'Theme font'}</span>
          <Icon name="chevron" size={14} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="py-1 max-h-64 overflow-y-auto">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onPointerDown={tbPD}
              onClick={() => { onChange(o.value); close() }}
              className={`w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50 ${o.value === value ? 'text-indigo-600 font-semibold' : 'text-gray-700'}`}
              style={{ fontFamily: familyOf(o.value) }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </ToolbarPopover>
  )
}
