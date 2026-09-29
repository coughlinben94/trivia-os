import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { THEMES, getTheme } from '../../themes/index.js'
import ParticleBackground from '../display/ParticleBackground.jsx'
import ThemeCustomizeControls from './ThemeCustomizeControls.jsx'
import WorldPaletteEditor from './WorldPaletteEditor.jsx'
import { applyOverrides } from '../shared/ThemeProvider.jsx'

// Matches the real /display TV output (see Display.jsx's ticker comment:
// "always fills the full 1920px width") — fixed-px ambient details (stars,
// motes, glints, blur radii) need this to be the true reference resolution,
// not just any 16:9 box, or they'll render as a larger fraction of the
// preview canvas than they actually are on the real display.
const INNER_W = 1920
const INNER_H = 1080
const PREVIEW_W = 680
const PREVIEW_H = Math.round(PREVIEW_W * (9 / 16))
const SCALE = PREVIEW_W / INNER_W

// Every ambient theme positions elements in vw/vh, which always resolve
// against the real document viewport — never against an ancestor's CSS
// transform:scale(). Without a genuinely separate browsing context here,
// anything anchored low/wide on the canvas (water lines, stage floors, low
// balloon lanes) renders at the wrong size/position, and on a large monitor
// can be pushed entirely past the 720px box and clipped. An iframe gives
// vw/vh a real 1280x720 viewport to resolve against, independent of the
// host page's actual window size. The only Tailwind class ParticleBackground
// itself depends on (its own top-level wrapper) is hand-written below since
// Tailwind isn't loaded inside the iframe's own document; every ambient
// sub-component past that point uses inline styles + self-contained
// prefixed <style> blocks that travel with the portaled tree.
function PreviewFrame({ background, children }) {
  const iframeRef = useRef(null)
  const [frameBody, setFrameBody] = useState(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    doc.open()
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Boogaloo&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        html,body{width:100%;height:100%;overflow:hidden;background:#000;}
        .absolute{position:absolute;} .inset-0{inset:0;}
        .overflow-hidden{overflow:hidden;} .pointer-events-none{pointer-events:none;}
      </style>
    </head><body></body></html>`)
    doc.close()
    setFrameBody(doc.body)
  }, [])

  return (
    <>
      <iframe
        ref={iframeRef}
        title="theme-preview"
        style={{
          position: 'absolute', top: 0, left: 0, width: INNER_W, height: INNER_H,
          border: 0, transform: `scale(${SCALE})`, transformOrigin: 'top left',
        }}
      />
      {frameBody && createPortal(
        <div style={{ position: 'absolute', inset: 0, background, overflow: 'hidden' }}>
          {children}
        </div>,
        frameBody,
      )}
    </>
  )
}

export default function ThemePickerModal({ show, onClose, onSelectTheme, onUpdateOverrides, onUploadFont }) {
  const [previewId, setPreviewId] = useState(show.theme)
  const [overrides, setOverrides] = useState(show.themeOverrides ?? {})
  const [paletteOpen, setPaletteOpen] = useState(false)
  const activeRef = useRef(null)
  const overrideDebounceRef = useRef(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [])

  const baseTheme = getTheme(previewId)
  // Same merge+contrast-floor the real TV runs (ThemeProvider's
  // applyOverrides) — a hand-duplicated merge here previously skipped the
  // floor, so a host could pick an unreadable `text` color and see it look
  // fine in preview, then floored to something different on the actual TV.
  const previewTheme = applyOverrides(baseTheme, overrides)

  function handlePick(id) {
    if (id === previewId) return
    // Clear per-show overrides when switching themes. Overrides are tuned for
    // one specific theme's palette; keeping them on a different theme produces
    // wrong colors (e.g. Pure Michigan's green text bleeding onto Autumn Harvest).
    const cleared = {}
    setOverrides(cleared)
    onUpdateOverrides(cleared)
    setPreviewId(id)
    onSelectTheme(id)
  }

  function setDisplayFont(font) {
    const next = { ...overrides, fonts: { ...overrides.fonts, display: font, displayUrl: undefined } }
    setOverrides(next)
    onUpdateOverrides(next)
  }

  function setTextColor(field, color) {
    const next = { ...overrides, colors: { ...overrides.colors, [field]: color } }
    setOverrides(next)
    // <input type="color"> fires onChange continuously while dragging, so debounce the write
    clearTimeout(overrideDebounceRef.current)
    overrideDebounceRef.current = setTimeout(() => onUpdateOverrides(next), 600)
  }

  async function handleUploadFont(file) {
    const { familyName, url } = await onUploadFont(file)
    const next = { ...overrides, fonts: { ...overrides.fonts, display: familyName, displayUrl: url } }
    setOverrides(next)
    onUpdateOverrides(next)
  }

  // Weighted-palette apply: merges the derived color set into the existing
  // overrides rather than replacing them, so a text/textMuted/shinyBg/
  // shinyAccent override the host set by hand in Customize survives a
  // palette apply. Same single write path as every other override
  // (useShow.js's updateShowMeta via onUpdateOverrides) — no second one.
  // worldPalette rides along in the same write (2026-09-03) — the ring is
  // now a per-show runtime value, not a file a human edits separately; see
  // ParticleBackground.jsx's ringWorldFor.
  function applyPaletteColors({ themeColors, worldPalette, ringWorld }) {
    const next = { ...overrides, colors: { ...overrides.colors, ...themeColors }, worldPalette }
    if (ringWorld) next.ringWorld = ringWorld
    else delete next.ringWorld
    // Mutually exclusive with a palette: ParticleBackground checks
    // colorEvolution first, so leaving it set would silently hide this palette.
    delete next.colorEvolution
    setOverrides(next)
    onUpdateOverrides(next)
  }

  // Ring coloring: 'authored' (no overrides), 'custom' (worldPalette via
  // WorldPaletteEditor), or 'evolution' (colorEvolution). Exactly one is
  // ever saved — see applyPaletteColors for the other half of that rule.
  const colorMode = overrides.colorEvolution ? 'evolution' : overrides.worldPalette ? 'custom' : 'authored'

  function setColorMode(mode) {
    if (mode === 'custom') { setPaletteOpen(true); return }
    const next = { ...overrides }
    delete next.worldPalette
    delete next.ringWorld
    if (mode === 'evolution') next.colorEvolution = true
    else delete next.colorEvolution
    setOverrides(next)
    onUpdateOverrides(next)
  }

  function setFixedArrangement(fixed) {
    const next = { ...overrides }
    if (fixed) {
      next.forceFixedArrangement = true
      // A saved ringWorld carries its own drawn order; worldPalette (always
      // written alongside it) keeps the colors on the fixed order instead.
      delete next.ringWorld
    } else {
      delete next.forceFixedArrangement
    }
    setOverrides(next)
    onUpdateOverrides(next)
  }

  function resetToPreset() {
    const next = { ...overrides }
    delete next.colors
    delete next.fonts
    delete next.worldPalette
    delete next.ringWorld
    delete next.colorEvolution
    delete next.forceFixedArrangement
    setOverrides(next)
    onUpdateOverrides(next)
  }

  const optionClass = on => `text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
    on ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
  }`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 960, maxWidth: '96vw', maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">Choose world</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Theme list */}
          <div className="w-56 shrink-0 border-r border-gray-100 overflow-y-auto py-2">
            {/* Only Midnight Galaxy is a real, finished "world" right now —
                the other 20 legacy themes stay defined in THEMES (nothing
                deleted, still fully customizable via ThemeCustomizeControls
                below if a show is already on one of them) but aren't
                surfaced as pickable options until they get the same
                ring-world treatment. */}
            {THEMES.filter(t => t.id === 'midnight-galaxy' || t.id === show.theme).map(t => {
              const isActive = t.id === show.theme
              const isPreviewing = t.id === previewId
              return (
                <button
                  key={t.id}
                  ref={isPreviewing ? activeRef : null}
                  onClick={() => handlePick(t.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                    isPreviewing
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className={isPreviewing ? 'font-semibold' : isActive ? 'font-semibold text-baynes-forest' : ''}>
                    {t.name}
                  </span>
                  {isActive && !isPreviewing && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-baynes-forest shrink-0">
                      On
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Preview panel */}
          <div className="flex-1 bg-[#050505] flex items-center justify-center overflow-hidden">
            <div
              style={{
                width: PREVIEW_W,
                height: PREVIEW_H,
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 12,
                flexShrink: 0,
              }}
            >
              <PreviewFrame background={previewTheme.colors.bgDeep}>
                <ParticleBackground theme={previewTheme} />

                {/* Ambient glow */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `radial-gradient(ellipse 70% 55% at 50% 50%, ${previewTheme.colors.accent}28 0%, transparent 70%)`,
                    pointerEvents: 'none',
                  }}
                />

                {/* Sample question text */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '80px 120px',
                    zIndex: 1,
                  }}
                >
                  <p style={{
                    color: previewTheme.colors.text,
                    fontFamily: `'${previewTheme.fonts.body}', 'DM Sans', sans-serif`,
                    fontSize: 64,
                    fontWeight: 500,
                    lineHeight: 1.4,
                    textAlign: 'center',
                  }}>
                    This is what your questions look like on screen.
                  </p>
                </div>

                {/* Theme name — bottom center */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 40,
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    zIndex: 2,
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 22,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: `${previewTheme.colors.text}35`,
                  }}>
                    {previewTheme.name}
                  </span>
                </div>
              </PreviewFrame>
            </div>
          </div>
        </div>

        {/* World palette — Midnight Galaxy only: the one real ring world.
            Opens the weighted 2-3-color picker; its Apply writes only
            theme_overrides.colors (the ungated theme half). The ring's
            station hues are untouched by anything in that editor. */}
        {previewId === 'midnight-galaxy' && (
          <div className="flex items-center gap-5 px-5 py-2 border-t border-gray-100 shrink-0 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
              Layout
              {/* Color evolution always renders the fixed layout
                  (ringWorldFor.js's arrangementKind) — show that, and don't
                  offer a draw it would ignore. */}
              <button onClick={() => setFixedArrangement(true)} className={optionClass(overrides.forceFixedArrangement || colorMode === 'evolution')}>Fixed layout</button>
              <button
                onClick={() => setFixedArrangement(false)}
                disabled={colorMode === 'evolution'}
                className={`${optionClass(!overrides.forceFixedArrangement && colorMode !== 'evolution')} disabled:opacity-40 disabled:pointer-events-none`}
              >Random draw</button>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
              Colors
              <button onClick={() => setColorMode('authored')} className={optionClass(colorMode === 'authored')}>Authored colors</button>
              <button onClick={() => setColorMode('custom')} className={optionClass(colorMode === 'custom')}>Custom palette</button>
              <button onClick={() => setColorMode('evolution')} className={optionClass(colorMode === 'evolution')}>Color evolution</button>
            </div>
            {/* ringWorldFor never auto-draws under a plain worldPalette (gap C) */}
            {colorMode === 'custom' && !overrides.ringWorld && !overrides.forceFixedArrangement && (
              <span className="text-[11px] text-gray-400">Custom palettes always use the fixed layout.</span>
            )}
            {colorMode === 'evolution' && (
              <span className="text-[11px] text-gray-400">Color evolution always uses the fixed layout.</span>
            )}
          </div>
        )}
        {paletteOpen && (
          <WorldPaletteEditor
            baseTheme={baseTheme}
            showId={show.id}
            onApplyThemeColors={applyPaletteColors}
            onClose={() => setPaletteOpen(false)}
          />
        )}

        {/* Customize + Done */}
        <ThemeCustomizeControls
          overrides={overrides}
          baseTheme={baseTheme}
          onSetDisplayFont={setDisplayFont}
          onUploadFont={handleUploadFont}
          onSetTextColor={setTextColor}
          onReset={resetToPreset}
          onDone={onClose}
        />
      </div>
    </div>
  )
}
