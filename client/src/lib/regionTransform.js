// Region drag/rotate/font-size overrides (`data._regionTransforms`) are
// recorded against the host editor's fixed 1920x1080 canvas reference frame
// (SlideCanvasEditor.jsx's INNER_W/INNER_H, ThemePickerModal.jsx's own pinned
// copy of the same numbers) but /display's real stage (StageFrame.jsx) is
// `100vw * STAGE_SCALE` wide, not always 1920 — a different browser/window
// size renders that stage at a different actual pixel size. The original
// implementation read dx/dy/fontSizePx back as raw verbatim CSS pixels,
// which silently drifted the WYSIWYG promise: a position centered at the
// 1920-reference only landed centered on /display when the real stage
// happened to also be exactly 1920px wide (AUDIT.md, RG-1 — Ben, 2026-09-15:
// "the text in preview isnt snapping to the middle... its site wide").
//
// Both the editor's canvas (CanvasIframe.jsx) and /display's real stage
// (StageFrame.jsx) already declare `container-type: size`, so cqw/cqh units
// already resolve correctly against each one's own actual box. Converting
// the stored reference-frame pixels into cqw/cqh (a fraction of whichever
// box is actually rendering) instead of emitting raw px fixes the drift
// with zero change to the stored data shape — existing `_regionTransforms`
// values keep meaning exactly what they meant before, they're just applied
// proportionally now instead of verbatim.
export const REGION_CANVAS_W = 1920
export const REGION_CANVAS_H = 1080

// `entry` is one field of `data._regionTransforms` (e.g. `rt.title`),
// possibly undefined. Returns the CSS transform string that field's region
// should render with, or '' when there's no override — matching every
// renderer's existing `entry ? {...} : {}` pattern (rotate/scale default to
// identity when absent, same as before this fix).
export function regionTransformCSS(entry) {
  if (!entry) return ''
  const dx = entry.dx ?? 0
  const dy = entry.dy ?? 0
  const rotate = entry.rotate ?? 0
  const scale = entry.scale ?? 1
  return `translate(calc(${dx} / ${REGION_CANVAS_W} * 100cqw), calc(${dy} / ${REGION_CANVAS_H} * 100cqh)) rotate(${rotate}deg) scale(${scale})`
}

// A region's font-size override, height-relative like every other cq size in
// this codebase (OverlayLayer's own "fontSize is % of canvas HEIGHT" law).
// Returns undefined when there's no override, so callers can `??` it against
// their own auto-fit fallback exactly as before.
export function regionFontSizeCSS(fontSizePx) {
  if (fontSizePx == null) return undefined
  return `calc(${fontSizePx} / ${REGION_CANVAS_H} * 100cqh)`
}
