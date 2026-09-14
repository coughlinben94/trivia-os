import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { getHuesCuesGrid, getHuesCuesCell, HUES_CUES_COLS, HUES_CUES_ROWS } from '../../lib/huesCuesGrid.js'
import { EASE_PANEL } from '../../lib/easings.js'
import ShrinkToFit from './ShrinkToFit.jsx'

const COL_LETTERS = Array.from({ length: HUES_CUES_COLS }, (_, i) => String.fromCharCode(65 + i))
const ROW_NUMBERS = Array.from({ length: HUES_CUES_ROWS }, (_, i) => i + 1)

// Two phases, mirroring the two-phase intent Ben asked for explicitly:
//   1. Browse — the full grid, free pan/zoom, no selection state at all.
//   2. Pick   — an "I'm Ready" sheet with two tap rows (letter, number),
//      never typed input (fat-finger risk on a phone keyboard ruled this
//      out — see the design spec). Locking in follows the same
//      committed-vs-local / explicit-commit / restore-on-mount contract
//      every other phone board (ChoiceBoard, WagerBoard) already uses.
export default function HuesCuesBoard({ slide, team, theme, preview = false, onAnswered }) {
  const { data } = slide
  const locked = !!data.huesCuesLocked
  const text = theme?.colors?.text ?? '#ffffff'
  const highlight = theme?.colors?.highlight ?? '#f5c842'
  const shouldReduceMotion = useReducedMotion()
  const grid = getHuesCuesGrid()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [col, setCol] = useState(null)
  const [row, setRow] = useState(null)
  const [committedCol, setCommittedCol] = useState(null)
  const [committedRow, setCommittedRow] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  // Pan/zoom state for the browse phase — plain CSS transform, no library.
  const [pan, setPan] = useState({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef(null)
  const pinchRef = useRef(null)
  const pointersRef = useRef(new Map())

  const saveChainRef = useRef(Promise.resolve())

  const save = useCallback((nextCol, nextRow) => {
    if (preview) return Promise.resolve(true)
    const run = saveChainRef.current.then(async () => {
      const upsert = supabase.from('phone_answers').upsert(
        {
          show_id: slide.showId ?? team.showId,
          slide_id: slide.id,
          team_id: team.id,
          answer: { col: nextCol, row: nextRow },
        },
        { onConflict: 'slide_id,team_id' }
      )
      let error
      try {
        ;({ error } = await Promise.race([
          upsert,
          new Promise((_, reject) => setTimeout(() => reject(new Error('hues-cues save timed out')), 8000)),
        ]))
      } catch (err) {
        error = err
      }
      if (error) console.error('[HuesCuesBoard] guess save failed:', error)
      setSaveFailed(!!error)
      return !error
    })
    saveChainRef.current = run.catch(() => false)
    return run
  }, [preview, slide.id, slide.showId, team.id, team.showId])

  // Restore this team's own row so a phone reload mid-question keeps its pick.
  useEffect(() => {
    if (preview) return
    let cancelled = false
    supabase
      .from('phone_answers')
      .select('answer')
      .eq('slide_id', slide.id)
      .eq('team_id', team.id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (cancelled || !row?.answer) return
        if (row.answer.col) { setCol(row.answer.col); setCommittedCol(row.answer.col) }
        if (row.answer.row) { setRow(row.answer.row); setCommittedRow(row.answer.row) }
      })
    return () => { cancelled = true }
  }, [preview, slide.id, team.id])

  const dirty = col !== committedCol || row !== committedRow
  const hasPick = col != null && row != null

  async function handleLockIn() {
    if (!hasPick || !dirty || saving || locked) return
    setSaving(true)
    const ok = await save(col, row)
    setSaving(false)
    if (ok) {
      setCommittedCol(col)
      setCommittedRow(row)
    }
  }

  // onAnswered fires only off the CONFIRMED (committed) pick, never the
  // optimistic local tap — same rule every other board follows so a failed
  // save can't release a team from forceInteractive with nothing recorded.
  useEffect(() => {
    if (!onAnswered) return
    onAnswered(committedCol != null && committedRow != null)
  }, [onAnswered, committedCol, committedRow])

  const previewCell = hasPick ? getHuesCuesCell(`${col}${row}`) : null

  // --- Pan/zoom handlers (browse phase) ---
  // Pan is bounded relative to zoom — at scale:1 the whole grid already fits
  // its box (per the fit-baseline comment below), so no pan offset is ever
  // needed or allowed; the bound grows linearly with zoom so there's always
  // room to reach every corner of a zoomed-in view. Without this, a drag or
  // pinch could fling the grid fully off-screen with no way back except a
  // page reload — "move around with ease" means never getting lost, not
  // just having drag/pinch wired up.
  const PAN_BOUND_PER_SCALE_UNIT = 180
  function clampPan(v, scale) {
    const bound = Math.max(0, scale - 1) * PAN_BOUND_PER_SCALE_UNIT
    return Math.max(-bound, Math.min(bound, v))
  }
  // pointersRef tracks every currently-down pointer by id (Pointer Events
  // unify mouse/touch/pen — one finger drags, two fingers pinch). onWheel
  // alone (mouse/trackpad only) was the brief's original plan, but a real
  // touchscreen never fires `wheel` for a pinch gesture (that's desktop
  // trackpad/mouse-only behavior) — verified against how iOS/Android
  // actually dispatch pinch (gesturechange / nothing, never wheel). Without
  // this, a phone — the ONLY device this board ships to — could pan but had
  // no way to zoom in at all.
  function onPointerDown(e) {
    if (pickerOpen) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 1) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pan.x, originY: pan.y }
    } else if (pointersRef.current.size === 2) {
      dragRef.current = null // a second finger landing ends single-finger drag, starts a pinch
      const [a, b] = [...pointersRef.current.values()]
      pinchRef.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y), startScale: pan.scale }
    }
  }
  function onPointerMove(e) {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const ratio = dist / pinchRef.current.startDist
      const scale = Math.max(0.5, Math.min(4, pinchRef.current.startScale * ratio))
      setPan(p => ({ x: clampPan(p.x, scale), y: clampPan(p.y, scale), scale }))
      return
    }
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setPan(p => ({ ...p, x: clampPan(dragRef.current.originX + dx, p.scale), y: clampPan(dragRef.current.originY + dy, p.scale) }))
  }
  function onPointerUp(e) {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 1) {
      // One finger still down after the other lifts — resume a plain drag
      // from here instead of jumping back to the pre-pinch origin.
      const [[, pt]] = pointersRef.current.entries()
      dragRef.current = { startX: pt.x, startY: pt.y, originX: pan.x, originY: pan.y }
    } else {
      dragRef.current = null
    }
  }
  function onWheel(e) {
    if (pickerOpen) return
    e.preventDefault()
    setPan(p => {
      const scale = Math.max(0.5, Math.min(4, p.scale - e.deltaY * 0.001))
      return { x: clampPan(p.x, scale), y: clampPan(p.y, scale), scale }
    })
  }

  return (
    <ShrinkToFit disabled={preview}>
      {/* display:grid with every direct child stacked in the same 1/1 cell
          (not position:absolute) so the row's auto-height is the MAX of the
          canvas's natural height and the picker sheet's natural height —
          not just the canvas's. A fixed-height overflow:hidden box sized
          only from the browse-phase grid (the original approach here)
          silently clipped the picker sheet's top off-screen — letter grid,
          swatch preview and "Back to grid" unreachable, verified live via
          Playwright (a phone-width viewport left only rows 4-15 of the
          number grid visible, Lock In cut off) — the moment the sheet's
          content needed more height than the grid did. Only the canvas
          itself still needs its own overflow:hidden (pan/zoom must clip to
          its own box); the sheet is never clipped, it just makes this row —
          and via ShrinkToFit, the whole board — taller, which ShrinkToFit
          then scales down to fit the screen exactly like every other board. */}
      {data.text && (
        <p style={{
          color: text, fontSize: 'clamp(1.15rem, 4.5vw, 1.35rem)',
          lineHeight: 1.55, margin: '0 0 1rem', fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
        }}>
          {data.text}
        </p>
      )}
      <div style={{ display: 'grid', width: '100%' }}>
        {/* The clip boundary lives on this OUTER, never-transformed box.
            overflow:hidden clips to an element's own layout box — CSS
            transforms don't change layout size, only paint — so putting
            overflow:hidden on the SAME element as the pan/zoom transform
            (the original approach here) let the clip boundary itself grow
            with pan.scale: at 4x zoom the "clipped" box was 4x wider than
            the phone viewport, no longer actually clipping anything.
            Splitting the transform onto an unclipped inner child fixes it —
            the outer box's auto-height/width come from the inner grid's
            pre-transform natural size (transforms don't reflow ancestors),
            so the clip boundary stays pinned to the real viewport-fit size
            at every zoom level. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          style={{
            gridRow: 1, gridColumn: 1, alignSelf: 'start',
            overflow: 'hidden', touchAction: 'none',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${HUES_CUES_COLS}, 1fr)`,
              gap: 1,
              // 100% (not a hardcoded px canvas) so scale:1 means "whole grid
              // fits the phone's actual width" — verified live: a fixed
              // 600px canvas left ~40% of the grid (cols J-P) clipped off-
              // screen at 390px viewport width with zero visual hint more
              // columns existed. Zoom (pan.scale) still multiplies from this
              // fit baseline, so 4x still zooms in the same way.
              width: '100%',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`,
              transformOrigin: 'center center',
            }}
          >
            {grid.map(cell => (
              <div key={cell.code} style={{ aspectRatio: '1 / 1', background: cell.hex }} />
            ))}
          </div>
        </div>

        {!locked && !pickerOpen && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{
              gridRow: 1, gridColumn: 1, alignSelf: 'end', justifySelf: 'center', marginBottom: 16,
              // zIndex:1 (not just DOM order) because the canvas div's own
              // transform (pan/zoom) promotes IT into a stacking context —
              // without an explicit z-index here this button silently sits
              // BEHIND the canvas and eats no clicks (verified live via
              // Playwright's elementFromPoint: the canvas intercepted every
              // click at this button's own coordinates).
              zIndex: 1,
              padding: '0.9rem 2rem', borderRadius: 999, border: 'none',
              background: highlight, color: '#000', fontWeight: 700, fontSize: '1.1rem',
              transition: 'transform 160ms ease-out',
            }}
          >
            I'm Ready
          </button>
        )}

        <AnimatePresence>
          {pickerOpen && (
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(100%)' }}
              animate={{ opacity: 1, transform: 'translateY(0%)' }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(100%)' }}
              transition={{ duration: 0.3, ease: EASE_PANEL }}
              style={{
                gridRow: 1, gridColumn: 1, alignSelf: 'end', width: '100%', boxSizing: 'border-box',
                zIndex: 2, // above both the canvas and the "I'm Ready" button (zIndex:1)
                background: 'rgba(0,0,0,0.92)', borderRadius: '16px 16px 0 0',
                padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
              }}
            >
              <button type="button" onClick={() => setPickerOpen(false)} style={{ alignSelf: 'flex-end', color: text, background: 'none', border: 'none' }}>
                Back to grid
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 8,
                  background: previewCell?.hex ?? 'rgba(255,255,255,0.1)',
                  border: '2px solid rgba(255,255,255,0.3)',
                }} />
                <span style={{ color: text, fontSize: '1.3rem', fontWeight: 700 }}>
                  {hasPick ? `${col}${row}` : 'Pick a letter and number'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {COL_LETTERS.map(letter => (
                  <button
                    key={letter}
                    type="button"
                    disabled={locked}
                    onClick={() => setCol(letter)}
                    style={{
                      padding: '0.9rem 0', minHeight: 44, borderRadius: 8,
                      background: col === letter ? highlight : 'rgba(255,255,255,0.08)',
                      color: col === letter ? '#000' : text,
                      border: 'none', fontWeight: 700, fontSize: '1.1rem',
                      transition: 'transform 150ms ease-out',
                    }}
                  >
                    {letter}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {ROW_NUMBERS.map(n => (
                  <button
                    key={n}
                    type="button"
                    disabled={locked}
                    onClick={() => setRow(n)}
                    style={{
                      padding: '0.9rem 0', minHeight: 44, borderRadius: 8,
                      background: row === n ? highlight : 'rgba(255,255,255,0.08)',
                      color: row === n ? '#000' : text,
                      border: 'none', fontWeight: 700, fontSize: '1.1rem',
                      transition: 'transform 150ms ease-out',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={!hasPick || !dirty || saving || locked}
                onClick={handleLockIn}
                style={{
                  marginTop: 'auto', padding: '1rem', borderRadius: 12, border: 'none',
                  background: (!hasPick || !dirty || saving || locked) ? 'rgba(255,255,255,0.15)' : highlight,
                  color: (!hasPick || !dirty || saving || locked) ? text : '#000',
                  fontWeight: 700, fontSize: '1.15rem',
                }}
              >
                {saving ? 'Locking In…' : committedCol && !dirty ? '🔒 Locked In' : 'Lock In Guess'}
              </button>

              {saveFailed && (
                <p style={{ color: '#e8703a', fontSize: '0.9rem', textAlign: 'center' }}>
                  Guess didn't save — check your connection and try again.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status line, same pattern as ChoiceBoard/OrderBoard — covers locked,
          not-yet-picked, and (critically, since the grid itself carries no
          memory of a prior pick once the picker sheet closes) what a team
          already committed. */}
      <p style={{ color: `${text}b3`, fontSize: '0.85rem', textAlign: 'center', margin: '1rem 0 0' }}>
        {locked
          ? 'Answers locked'
          : committedCol && committedRow && !dirty
            ? `Your guess: ${committedCol}${committedRow}`
            : dirty && hasPick
              ? 'Tap Lock In to submit'
              : 'Tap "I\'m Ready" to pick a square'}
      </p>
    </ShrinkToFit>
  )
}
