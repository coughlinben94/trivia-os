// OverlayLayer — dumb, type-agnostic renderer for freeform text/image
// overlays any slide's `data.overlays` array may carry.
//
// Mounted exactly once, by SlideRenderer.jsx, for every slide type. Never
// imported by an individual slide component — that per-type-mount pattern
// is what the predecessor (SlideElements.jsx, data.elements) did, and it's
// exactly what this file replaces. See references/slides.md "Overlay
// System" for the full coordinate law and the "renderers stay untouched"
// rule this file exists to enforce.
//
// Coordinate law: every position/size value is a PERCENT of the 16:9
// canvas — x/w against canvas width, y against canvas height, fontSize
// against canvas height. Never pixels. This wrapper opens a CSS size
// container so children can use `cqh`/`cqw` (container query units):
// "6cqh" means "6% of THIS container's rendered height," automatically
// correct whether the container is a 220px Build Mode preview thumbnail
// or a fullscreen 1080p TV — no JS measurement, no ResizeObserver, and
// the preview and /display are guaranteed to agree by construction.
//
// Zero interactivity, zero edit affordances, under every condition —
// including inside SlideCanvasEditor's scaled preview. That's what makes
// this component's output the WYSIWYG ground truth: /display renders this
// exact tree, so if the preview renders this exact tree too, they cannot
// drift. Overlay text intentionally does NOT go through autoFitText —
// the host chose the size in the editor; render it as stored.

import { SHINY_GOLD } from '../../lib/shinyGold.js'

// Theme tokens resolve through the active theme's palette; fixed tokens are
// theme-independent. `gold` is the shiny signal made host-reachable (see
// references/themes.md fixed-gold law) — constant in every theme, unlike the
// per-theme `shinyAccent` (kept for backward-compat with overlays that already
// reference it by name).
const THEME_COLOR_TOKENS = ['text', 'textMuted', 'accent', 'highlight', 'shinyAccent']
const FIXED_COLOR_TOKENS = { gold: SHINY_GOLD }

// Text-shadow in em so it scales with the (cqh-sized) font — the preview and
// /display stay pixel-identical. Absent `shadow` → no shadow (graceful default).
const TEXT_SHADOW = '0 0.05em 0.35em rgba(0,0,0,0.55)'

function resolveFont(fontFamily, theme) {
  if (fontFamily === 'display') return theme.fonts.display
  if (fontFamily === 'body') return theme.fonts.body
  return fontFamily || theme.fonts.display
}

function resolveColor(color, theme) {
  if (!color) return theme.colors.text
  if (color in FIXED_COLOR_TOKENS) return FIXED_COLOR_TOKENS[color]
  return THEME_COLOR_TOKENS.includes(color) ? theme.colors[color] : color
}

function TextOverlay({ ov, theme }) {
  if (!ov.text) return null
  return (
    <p
      style={{
        position: 'absolute',
        left: `${ov.x}%`,
        top: `${ov.y}%`,
        width: `${ov.w}%`,
        zIndex: ov.z ?? 0,
        transform: `rotate(${ov.rotation ?? 0}deg)`,
        margin: 0,
        fontFamily: `'${resolveFont(ov.fontFamily, theme)}', sans-serif`,
        fontSize: `${ov.fontSize ?? 6}cqh`,
        color: resolveColor(ov.color, theme),
        textAlign: ov.align ?? 'center',
        fontWeight: ov.weight ?? 700,
        fontStyle: ov.italic ? 'italic' : 'normal',
        textShadow: ov.shadow ? TEXT_SHADOW : 'none',
        lineHeight: 1.15,
        wordWrap: 'break-word',
        whiteSpace: 'pre-wrap',
      }}
    >
      {ov.text}
    </p>
  )
}

function ImageOverlay({ ov }) {
  if (!ov.mediaUrl) return null
  return (
    <img
      src={ov.mediaUrl}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: `${ov.x}%`,
        top: `${ov.y}%`,
        width: `${ov.w}%`,
        height: 'auto',
        zIndex: ov.z ?? 0,
        transform: `rotate(${ov.rotation ?? 0}deg)`,
        display: 'block',
      }}
    />
  )
}

export default function OverlayLayer({ overlays, theme }) {
  if (!overlays || overlays.length === 0) return null
  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 50, pointerEvents: 'none', containerType: 'size' }}
    >
      {overlays.map(ov => (
        ov.kind === 'text'
          ? <TextOverlay key={ov.id} ov={ov} theme={theme} />
          : <ImageOverlay key={ov.id} ov={ov} />
      ))}
    </div>
  )
}
