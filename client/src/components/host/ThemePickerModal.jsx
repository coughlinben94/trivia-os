import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { THEMES, getTheme } from '../../themes/index.js'
import ParticleBackground from '../display/ParticleBackground.jsx'
import ThemeCustomizeControls from './ThemeCustomizeControls.jsx'

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
  const activeRef = useRef(null)
  const overrideDebounceRef = useRef(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [])

  const baseTheme = getTheme(previewId)
  const previewTheme = {
    ...baseTheme,
    fonts: { ...baseTheme.fonts, ...(overrides.fonts ?? {}) },
    colors: { ...baseTheme.colors, ...(overrides.colors ?? {}) },
  }

  function handlePick(id) {
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

  function resetToPreset() {
    const next = { ...overrides }
    delete next.colors
    delete next.fonts
    setOverrides(next)
    onUpdateOverrides(next)
  }

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
          <h2 className="text-sm font-semibold text-gray-800">Choose theme</h2>
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
            {THEMES.map(t => {
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
