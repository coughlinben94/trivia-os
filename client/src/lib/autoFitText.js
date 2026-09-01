import { useState, useLayoutEffect } from 'react'

// Font-agnostic text-fit sizing for display slides.
//
// Ben's own mental model from the old deck: 55pt for a normal-length
// question, dropping to 48pt for longer ones — a manual version of
// PowerPoint's "shrink text on overflow" autofit. This module automates
// that by measuring real glyph width via an offscreen canvas and
// binary-searching the largest font size that fits a given box — font-
// agnostic by construction, so it snaps correctly no matter which display
// font a show is using (the retired char-count approach this replaced was
// secretly calibrated to one specific font's metrics).
//
// Three entry points, in increasing order of how much runtime measurement
// they do:
//   fitToBox        — pure function. Caller supplies exact box dimensions.
//   useFitToBox     — hook. Measures its own ref's clientWidth/Height via
//                      ResizeObserver, for surfaces whose box isn't fixed.
//   useFitListToBox — hook. Same idea for a list of rows sharing one
//                      container; sizes every row to one shared value so a
//                      progressively-revealed list doesn't visibly resize
//                      as more rows appear.
//
// Each surface below keeps its own FLOOR/CEIL rem pair — the safety-net
// bounds fitToBox searches within — and (for fixed-box surfaces) a *_BOX
// const bundling those bounds with the surface's real on-screen box size.

// ─── Per-surface size bounds ────────────────────────────────────────────────

// Single block of prose filling most of the slide: questions, Grading Break,
// Custom body, Pixelate Series hint. Ceiling was 4.5rem (54pt), anchored to
// the old QuestionSlide max — bumped 2026-08-25 (Ben, live show: "text on
// the tvs are still soooooo small") to 5.5rem (66pt). All these surfaces
// have far more box height than the old ceiling ever used (see *_BOX below),
// so this was pure headroom left on the table, not a fit constraint.
export const PARAGRAPH_FLOOR = 2.0
export const PARAGRAPH_CEIL  = 5.5

// Short, dramatic title-card line — State of the Union's patriotic tagline.
// NOT paragraph prose: a one-line announcement meant to dominate the screen
// like a title slide, so it keeps its own bigger range rather than
// PARAGRAPH's. Bumped 2026-08-25 alongside PARAGRAPH so it still reads
// clearly larger than a paragraph ceiling.
export const TITLE_CARD_FLOOR = 2.6
export const TITLE_CARD_CEIL  = 6.0

// Multiple items sharing one screen (Multi-Question, PYL Reveal answer
// list) — inherently smaller than a single dominant question since several
// rows compete for the same space. Ceiling bumped 2026-08-25 to 4.4rem to
// match the value Ben hand-tuned live on the "First, Second, or Third"
// list surface that same night (QuestionSlide.jsx's rows list, see its
// ceilPx) — real-show-tested number, applied here for every other list
// surface too since a higher ceiling only helps short lists (tall lists
// still get sized down by their own row-height budget regardless).
export const LIST_ITEM_FLOOR = 1.3
export const LIST_ITEM_CEIL  = 4.4

// Short single lines that are still host-typed and length-variable, but
// never a full paragraph — round-intro subtitles/catchphrases.
export const LINE_FLOOR = 1.5
export const LINE_CEIL  = 3.6

// The dramatic winner-name reveal — normally one short team name, but ties
// join multiple names together ("Team A & Team B & Team C") and can run
// long enough to blow past a fixed ceiling. Already generous — not touched
// in the 2026-08-25 pass.
export const REVEAL_FLOOR = 2.5
export const REVEAL_CEIL  = 10

// Prose sharing the frame with a full-height image — shiny visual question's
// half-width portrait column, or the bottom-third scrim band in landscape.
// Genuinely less room than a full-bleed question. Bumped 2026-08-25.
export const VISUAL_CAPTION_FLOOR = 1.7
export const VISUAL_CAPTION_CEIL  = 4.0

// A wager question's prompt — the only content on the screen during the guess
// phase (the tier strip and submitted-count are chrome), so it can run larger
// than an ordinary question, but it's a full sentence, not a title. Bumped
// 2026-08-25 to actually deliver on that "larger than ordinary question"
// intent — it was previously only 0.1rem above PARAGRAPH_CEIL.
export const WAGER_Q_FLOOR = 2.0
export const WAGER_Q_CEIL  = 6.0

/* ── font-agnostic measure-to-fit ──────────────────────────────────────────
   Measures real glyph width instead of counting chars, so it snaps correctly
   for ANY display font. Retires the per-surface *_TIERS tables. */

let _measureCtx = null
function _ctx() {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d')
  return _measureCtx
}

// greedy word-wrap at a given px size → array of line strings
function wrapToWidth(text, family, sizePx, maxW, letterSpacing = 0, weight = '') {
  const c = _ctx()
  c.font = weight ? `${weight} ${sizePx}px "${family}"` : `${sizePx}px "${family}"`
  const measure = s => c.measureText(s).width + Math.max(0, s.length - 1) * letterSpacing
  const words = String(text).split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines = []
  let line = words[0]
  for (let i = 1; i < words.length; i++) {
    const test = line + ' ' + words[i]
    if (measure(test) <= maxW) line = test
    else { lines.push(line); line = words[i] }
  }
  lines.push(line)
  return lines
}

function _fits(text, family, sizePx, boxW, boxH, maxLines, lineHeight, letterSpacing, weight = '') {
  const lines = wrapToWidth(text, family, sizePx, boxW, letterSpacing, weight)
  if (lines.length > maxLines) return false
  const c = _ctx()
  c.font = weight ? `${weight} ${sizePx}px "${family}"` : `${sizePx}px "${family}"`
  for (const ln of lines) {
    const w = c.measureText(ln).width + Math.max(0, ln.length - 1) * letterSpacing
    if (w > boxW) return false            // a single word wider than the box
  }
  return lines.length * sizePx * lineHeight <= boxH
}

/**
 * Largest px size in [floorPx, ceilPx] at which `text` fits the box.
 * Font-agnostic by construction — measures real glyph metrics via canvas,
 * so it works for any display font. Synchronous; returns a plain number.
 */
export function fitToBox(text, {
  family, boxW, boxH,
  floorPx, ceilPx,
  maxLines = 4,
  lineHeight = 1.12,
  letterSpacing = 0,
  weight = '',
}) {
  if (!String(text).trim()) return ceilPx
  if (_fits(text, family, ceilPx, boxW, boxH, maxLines, lineHeight, letterSpacing, weight)) return ceilPx
  let lo = floorPx, hi = ceilPx
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2
    if (_fits(text, family, mid, boxW, boxH, maxLines, lineHeight, letterSpacing, weight)) lo = mid
    else hi = mid
  }
  const px = Math.max(floorPx, lo)
  // Bug (found 2026-08-13, auditing real question lengths against display
  // sizing): when nothing in [floorPx, ceilPx] satisfies maxLines even at
  // the floor, `lo` never moves off its initial floorPx value and this
  // returned it anyway, unverified. floorPx is still the right number —
  // it's the readability floor, and since a bigger size never needs FEWER
  // lines for the same text/width, nothing larger would pass either — the
  // fix isn't a different size, it's not silently pretending this one was
  // confirmed to fit when it wasn't. Surfaced as a dev warning so a
  // pathologically long question gets caught by whoever wrote it, not
  // discovered by chance on a live TV (confirmed real: 1 of 1514 questions
  // in the current DB hits this, and it's real prose, not a data error).
  if (!_fits(text, family, px, boxW, boxH, maxLines, lineHeight, letterSpacing, weight)) {
    console.warn(
      `[autoFitText] "${String(text).slice(0, 60)}${text.length > 60 ? '…' : ''}" ` +
      `doesn't fit its box even at the ${floorPx}px floor (${boxW}×${boxH}, max ${maxLines} lines). ` +
      `Rendering at floor size anyway — it'll run past the intended box.`
    )
  }
  return px
}

// Same "does it fit even at the floor" check fitToBox's own dev-console
// warning uses, exposed as a plain boolean with no console side effect —
// for a host-facing UI hint (SlideEditor's Question Text field) instead of
// a warning that only ever reaches someone with DevTools open, which this
// app's actual hosts never do. Deliberately re-derives via the same _fits
// call fitToBox uses internally rather than calling fitToBox and checking
// its return size, so this has zero risk of silently drifting from
// fitToBox's own real fit logic — one fit check, two call sites.
export function overflowsBox(text, {
  family, boxW, boxH, floorPx,
  maxLines = 4, lineHeight = 1.12, letterSpacing = 0,
}) {
  if (!String(text).trim()) return false
  return !_fits(text, family, floorPx, boxW, boxH, maxLines, lineHeight, letterSpacing)
}

// Title-card box (State of the Union). Fixed area — adjust the two dims if the
// real region differs. rem→px at 16px root, matching the shipped TITLE_CARD floor/ceil.
export const TITLE_CARD_BOX = {
  boxW: 1728,       // 1920 stage − px-24 (96px) each side
  boxH: 560,        // vertically-centered band
  floorPx: TITLE_CARD_FLOOR * 16,
  ceilPx:  TITLE_CARD_CEIL * 16,
  maxLines: 4,
  lineHeight: 1.12,
}

// ── per-surface fit boxes (font-agnostic fitToBox) ──────────────────────────
// Each reuses the surface's EXISTING floor/ceil — bounds unchanged from the tier era.
// Only boxW/boxH/maxLines are new; tune boxH/maxLines live if shrink engages too early/late.

// Grading break: full-screen relaxed multi-sentence message. Wants to breathe, wrap freely.
// boxW/lineHeight matched to the real render (GradingBreakSlide.jsx: `max-w-4xl px-24
// leading-relaxed` -> 896px container minus 192px padding = 704px content width, 1.625
// line-height) — the previous 1728/1.2 assumed a near-full-viewport box that was never
// actually rendered, so long custom messages sized ~2.45x too big for their real column.
export const GRADING_BREAK_BOX = {
  boxW: 704, boxH: 620, floorPx: PARAGRAPH_FLOOR * 16, ceilPx: PARAGRAPH_CEIL * 16,
  maxLines: 6, lineHeight: 1.625,
}

// Custom slide body: prose under a title (title eats the top band → shorter box).
export const CUSTOM_BODY_BOX = {
  boxW: 1728, boxH: 480, floorPx: PARAGRAPH_FLOOR * 16, ceilPx: PARAGRAPH_CEIL * 16,
  maxLines: 6, lineHeight: 1.2,
}

// Question text: the prompt line(s), above the answer area. Full width.
// boxH/maxLines/lineHeight bumped 2026-09-01 (Ben live, "text on actual
// questions is truly too small" — measured audit against tonight's real
// question lengths, 190-360 chars): the 4-line/400px box was the actual
// constraint, not the 5.5rem ceiling — nothing tonight got within 40px of
// it. lineHeight 1.25 matches the rendered <p>'s line-height (QuestionSlide.
// jsx dropped its mismatched `leading-relaxed` 1.625 for this same value) —
// they must agree or fitToBox okays a size the real DOM then wraps an extra
// line past, the actual overflow the audit caught on 4 of tonight's
// questions. weight: '500' matches the rendered <p>'s fontWeight — Boogaloo/
// DM Sans measure ~1.7% narrower at the browser's default 400.
export const QUESTION_BOX = {
  boxW: 1728, boxH: 600, floorPx: PARAGRAPH_FLOOR * 16, ceilPx: PARAGRAPH_CEIL * 16,
  maxLines: 6, lineHeight: 1.25, weight: '500',
}

// Shiny question quote/subtitle: sits above the question text as context (e.g.
// "here's a quote, now answer the question below it") — secondary to the
// question, so its ceiling stays well under QUESTION_BOX's so it never
// out-sizes the thing it's introducing, but it gets its own line budget since
// a quote can run longer than the old "Villain Laughs"-style short label.
export const QUOTE_BOX = {
  boxW: 1728, boxH: 220, floorPx: LINE_FLOOR * 16, ceilPx: PARAGRAPH_CEIL * 0.6 * 16,
  maxLines: 3, lineHeight: 1.25,
}

// Visual caption: short label under an image. Narrow region, 1–2 lines.
export const VISUAL_CAPTION_BOX = {
  boxW: 1280, boxH: 140, floorPx: VISUAL_CAPTION_FLOOR * 16, ceilPx: VISUAL_CAPTION_CEIL * 16,
  maxLines: 2, lineHeight: 1.15,
}

// Round-intro subtitle: one wide line under the round title. Full width, 1–2 lines.
export const LINE_BOX = {
  boxW: 1728, boxH: 160, floorPx: LINE_FLOOR * 16, ceilPx: LINE_CEIL * 16,
  maxLines: 2, lineHeight: 1.12,
}

// Winner name: short team name, centered, huge. Snaps only if a team picked a long name.
export const REVEAL_BOX = {
  boxW: 1600, boxH: 320, floorPx: REVEAL_FLOOR * 16, ceilPx: REVEAL_CEIL * 16,
  maxLines: 2, lineHeight: 1.1,
}

/**
 * Container-relative fit. Measures the referenced box at runtime (ResizeObserver)
 * and returns the fitToBox px size. For captions/cells/rows whose width isn't fixed.
 * boxRef → the element whose clientWidth/Height bounds the text.
 */
export function useFitToBox(boxRef, text, { family, floorPx, ceilPx, maxLines = 2, lineHeight = 1.15, letterSpacing = 0 }) {
  const [size, setSize] = useState(ceilPx)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    let cancelled = false
    const recompute = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (!w || !h) return
      const px = fitToBox(text, { family, boxW: w, boxH: h, floorPx, ceilPx, maxLines, lineHeight, letterSpacing })
      if (!cancelled) setSize(px)
    }
    // measure after fonts load so glyph metrics are real, not fallback
    document.fonts.ready.then(() => { if (!cancelled) recompute() })
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => { cancelled = true; ro.disconnect() }
  }, [boxRef, text, family, floorPx, ceilPx, maxLines, lineHeight, letterSpacing])
  return size
}

/**
 * Uniform fit for a vertical list of rows sharing one container. Sizes ALL rows
 * to a single px value so the whole list fits: fits the longest item to the
 * per-row height budget (containerH / itemCount) and the container width.
 * listRef → the element bounding all rows. items → array of row strings.
 *
 * `groups` (optional) extends that same "size to the hardest-to-fit member"
 * rule ACROSS sibling slides: pass every sibling list in the group (each as its
 * own array of row strings, INCLUDING this slide's) and the smallest of their
 * individual fits wins for all of them. Without it, two Multi-Question/PYL
 * slides in the same round each maximize independently and visibly pop
 * different row sizes when the host advances between them — the same problem
 * f7ddb51 fixed for question text across a round. Each group keeps its own row
 * COUNT (per-row height budget is n-dependent), so this can only ever pick a
 * size that already fits this slide.
 */
export function useFitListToBox(listRef, items, { family, floorPx, ceilPx, gapPx = 0, rowInset = 0, maxLinesPerRow = 2, lineHeight = 1.3, letterSpacing = 0, groups = null }) {
  const [size, setSize] = useState(ceilPx)
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || !items || items.length === 0) return
    let cancelled = false
    const recompute = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (!w || !h) return
      const boxW = Math.max(0, w - rowInset)
      // longest item drives the shared size (worst case must fit its row box)
      const fitGroup = (rows) => {
        const n = rows.length
        if (!n) return ceilPx
        const longest = rows.reduce((a, b) => (String(b).length > String(a).length ? b : a), rows[0] ?? '')
        return fitToBox(longest, { family, boxW, boxH: (h - gapPx * (n - 1)) / n, floorPx, ceilPx, maxLines: maxLinesPerRow, lineHeight, letterSpacing })
      }
      const pool = groups?.length ? groups : [items]
      const best = Math.min(...pool.map(fitGroup))
      if (!cancelled) setSize(best)
    }
    document.fonts.ready.then(() => { if (!cancelled) recompute() })
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => { cancelled = true; ro.disconnect() }
  }, [listRef, items, groups, family, floorPx, ceilPx, gapPx, rowInset, maxLinesPerRow, lineHeight, letterSpacing])
  return size
}
