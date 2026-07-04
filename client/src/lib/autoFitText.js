import { useState, useLayoutEffect } from 'react'

// PowerPoint-style discrete-tier text autofit.
//
// Ben's own mental model from the old deck: 55pt for a normal-length
// question, dropping to 48pt for longer ones — a manual, two-step version
// of PowerPoint's "shrink text on overflow" autofit. This is the automatic
// equivalent: pick from a small set of fixed size bands by character count
// instead of continuously measuring/shrinking. Predictable, cheap (no
// layout measurement, no ResizeObserver), and — the actual point of this
// module — using the SAME tier table across every slide type that shows
// host-typed prose is what makes text feel consistent slide to slide,
// instead of each component having its own hand-tuned clamp() range.
//
// Each tier's value is a cqw (container-query-width) number, resolved
// against StageFrame's stage-relative box (client/src/display/stage.js,
// STAGE_SCALE = 0.85 of the viewport) — not vw. Half the slide components
// were on raw vw before this pass; cqw is the current direction of travel
// (see the "Stage boundary infrastructure" commits) and keeps text at a
// consistent scale relative to the actual TV-safe stage box rather than
// the full browser viewport.
//
// autoFitClamp() still returns a clamp(floor, tier, ceiling) string — the
// floor/ceiling remain a safety net for unusual screen sizes; the tier
// picked by length is just the *preferred* middle value clamp() scales
// from.

function pickTier(text, tiers) {
  const len = (text ?? '').length
  return tiers.find(t => len <= t.maxChars) ?? tiers[tiers.length - 1]
}

export function autoFitClamp(text, tiers, floorRem, ceilRem) {
  const tier = pickTier(text, tiers)
  return `clamp(${floorRem}rem, ${tier.cqw}cqw, ${ceilRem}rem)`
}

// ─── Shared tier tables ─────────────────────────────────────────────────────

// Single block of prose filling most of the slide: questions, Grading Break,
// Custom body, Pixelate Series hint. Ceiling anchored to the existing
// QuestionSlide max (4.5rem ≈ 54pt) — already matched Ben's 55pt reference
// before this pass, so it's the anchor everything else now aligns to instead
// of each file inventing its own range.
export const PARAGRAPH_TIERS = [
  { maxChars: 60,       cqw: 4.5 },  // one-liner — "What is the capital of France?"
  { maxChars: 110,      cqw: 3.8 },  // ~Ben's old 48pt step-down
  { maxChars: 170,      cqw: 3.1 },
  { maxChars: 240,      cqw: 2.5 },
  { maxChars: Infinity, cqw: 2.1 },
]
export const PARAGRAPH_FLOOR = 1.8
export const PARAGRAPH_CEIL  = 4.5

// Short, dramatic title-card line — State of the Union's patriotic tagline.
// NOT paragraph prose: this is a one-line announcement meant to dominate the
// screen like a title slide, so it keeps its own bigger range rather than
// PARAGRAPH_TIERS's. Floor/ceiling match this slide's original hardcoded
// clamp(2.4rem, 5.5cqw, 5.2rem) — that was a single fixed value with no
// length-based step-down at all; these tiers keep the same top-end size for
// a short line but still shrink gracefully if a host types something long.
export const TITLE_CARD_TIERS = [
  { maxChars: 30,       cqw: 5.5 },
  { maxChars: 60,       cqw: 4.6 },
  { maxChars: 90,       cqw: 3.8 },
  { maxChars: Infinity, cqw: 3.0 },
]
export const TITLE_CARD_FLOOR = 2.4
export const TITLE_CARD_CEIL  = 5.2

// Multiple items sharing one screen (Multi-Question, PYL Reveal answer
// list) — inherently smaller than a single dominant question since several
// rows compete for the same space. Scaled down from PARAGRAPH_TIERS by
// roughly the same per-item ceiling these slides already used.
export const LIST_ITEM_TIERS = [
  { maxChars: 40,       cqw: 2.6 },
  { maxChars: 80,       cqw: 2.1 },
  { maxChars: 130,      cqw: 1.7 },
  { maxChars: Infinity, cqw: 1.4 },
]
export const LIST_ITEM_FLOOR = 1.1
export const LIST_ITEM_CEIL  = 2.5

// Short single lines that are still host-typed and length-variable, but
// never a full paragraph — round-intro subtitles/catchphrases.
export const LINE_TIERS = [
  { maxChars: 24,       cqw: 4.2 },
  { maxChars: 44,       cqw: 3.4 },
  { maxChars: 70,       cqw: 2.8 },
  { maxChars: Infinity, cqw: 2.3 },
]
export const LINE_FLOOR = 1.3
export const LINE_CEIL  = 3.0

// The dramatic winner-name reveal — normally one short team name, but ties
// join multiple names together ("Team A & Team B & Team C") and can run
// long enough to blow past a fixed clamp ceiling. Same mechanism, much
// bigger numbers since this is meant to dominate the screen when short.
export const REVEAL_TIERS = [
  { maxChars: 16,       cqw: 11 },
  { maxChars: 32,       cqw: 8.5 },
  { maxChars: 55,       cqw: 6.5 },
  { maxChars: Infinity, cqw: 4.8 },
]
export const REVEAL_FLOOR = 2.5
export const REVEAL_CEIL  = 10

// Prose sharing the frame with a full-height image — shiny visual question's
// half-width portrait column, or the bottom-third scrim band in landscape.
// Genuinely less room than a full-bleed question, so its own ceiling (kept
// at the existing 3.5rem this slide already used) rather than PARAGRAPH's.
export const VISUAL_CAPTION_TIERS = [
  { maxChars: 60,       cqw: 3.5 },
  { maxChars: 110,      cqw: 3.0 },
  { maxChars: 170,      cqw: 2.4 },
  { maxChars: 240,      cqw: 2.0 },
  { maxChars: Infinity, cqw: 1.7 },
]
export const VISUAL_CAPTION_FLOOR = 1.5
export const VISUAL_CAPTION_CEIL  = 3.5

/* ── font-agnostic measure-to-fit ──────────────────────────────────────────
   Measures real glyph width instead of counting chars, so it snaps correctly
   for ANY display font. Retires the per-surface *_TIERS tables. */

let _measureCtx = null
function _ctx() {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d')
  return _measureCtx
}

// greedy word-wrap at a given px size → array of line strings
function wrapToWidth(text, family, sizePx, maxW, letterSpacing = 0) {
  const c = _ctx()
  c.font = `${sizePx}px "${family}"`
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

function _fits(text, family, sizePx, boxW, boxH, maxLines, lineHeight, letterSpacing) {
  const lines = wrapToWidth(text, family, sizePx, boxW, letterSpacing)
  if (lines.length > maxLines) return false
  const c = _ctx()
  c.font = `${sizePx}px "${family}"`
  for (const ln of lines) {
    const w = c.measureText(ln).width + Math.max(0, ln.length - 1) * letterSpacing
    if (w > boxW) return false            // a single word wider than the box
  }
  return lines.length * sizePx * lineHeight <= boxH
}

/**
 * Largest px size in [floorPx, ceilPx] at which `text` fits the box.
 * Font-agnostic by construction. Sync — safe as a drop-in for autoFitClamp.
 */
export function fitToBox(text, {
  family, boxW, boxH,
  floorPx, ceilPx,
  maxLines = 4,
  lineHeight = 1.12,
  letterSpacing = 0,
}) {
  if (!String(text).trim()) return ceilPx
  if (_fits(text, family, ceilPx, boxW, boxH, maxLines, lineHeight, letterSpacing)) return ceilPx
  let lo = floorPx, hi = ceilPx
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2
    if (_fits(text, family, mid, boxW, boxH, maxLines, lineHeight, letterSpacing)) lo = mid
    else hi = mid
  }
  return Math.max(floorPx, lo)
}

// Title-card box (State of the Union). Fixed area — adjust the two dims if the
// real region differs. rem→px at 16px root, matching the shipped TITLE_CARD floor/ceil.
export const TITLE_CARD_BOX = {
  boxW: 1728,       // 1920 stage − px-24 (96px) each side
  boxH: 560,        // vertically-centered band
  floorPx: 2.4 * 16,
  ceilPx:  5.2 * 16,
  maxLines: 4,
  lineHeight: 1.12,
}

// ── per-surface fit boxes (font-agnostic fitToBox) ──────────────────────────
// Each reuses the surface's EXISTING floor/ceil — bounds unchanged from the tier era.
// Only boxW/boxH/maxLines are new; tune boxH/maxLines live if shrink engages too early/late.

// Grading break: full-screen relaxed multi-sentence message. Wants to breathe, wrap freely.
export const GRADING_BREAK_BOX = {
  boxW: 1728, boxH: 620, floorPx: PARAGRAPH_FLOOR * 16, ceilPx: PARAGRAPH_CEIL * 16,
  maxLines: 6, lineHeight: 1.2,
}

// Custom slide body: prose under a title (title eats the top band → shorter box).
export const CUSTOM_BODY_BOX = {
  boxW: 1728, boxH: 480, floorPx: PARAGRAPH_FLOOR * 16, ceilPx: PARAGRAPH_CEIL * 16,
  maxLines: 6, lineHeight: 1.2,
}

// Question text: the prompt line(s), above the answer area. Full width, tighter line budget.
export const QUESTION_BOX = {
  boxW: 1728, boxH: 400, floorPx: PARAGRAPH_FLOOR * 16, ceilPx: PARAGRAPH_CEIL * 16,
  maxLines: 4, lineHeight: 1.18,
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
 */
export function useFitListToBox(listRef, items, { family, floorPx, ceilPx, gapPx = 0, rowInset = 0, maxLinesPerRow = 2, lineHeight = 1.3, letterSpacing = 0 }) {
  const [size, setSize] = useState(ceilPx)
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || !items || items.length === 0) return
    let cancelled = false
    const recompute = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (!w || !h) return
      const n = items.length
      const perRowH = (h - gapPx * (n - 1)) / n
      // longest item drives the shared size (worst case must fit its row box)
      let best = floorPx
      const longest = items.reduce((a, b) => (String(b).length > String(a).length ? b : a), items[0] ?? '')
      best = fitToBox(longest, { family, boxW: Math.max(0, w - rowInset), boxH: perRowH, floorPx, ceilPx, maxLines: maxLinesPerRow, lineHeight, letterSpacing })
      if (!cancelled) setSize(best)
    }
    document.fonts.ready.then(() => { if (!cancelled) recompute() })
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => { cancelled = true; ro.disconnect() }
  }, [listRef, items, family, floorPx, ceilPx, gapPx, rowInset, maxLinesPerRow, lineHeight, letterSpacing])
  return size
}
