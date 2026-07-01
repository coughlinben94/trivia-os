import { useState, useEffect, useRef } from 'react'
import { THEMES, getTheme } from '../../themes/index.js'
import ParticleBackground from '../display/ParticleBackground.jsx'

const INNER_W = 1280
const INNER_H = 720
const PREVIEW_W = 680
const PREVIEW_H = Math.round(PREVIEW_W * (9 / 16))
const SCALE = PREVIEW_W / INNER_W
const DISPLAY_FONTS = ['Boogaloo', 'Handters', 'Roquen', 'DM Sans']

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
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: INNER_W,
                  height: INNER_H,
                  transform: `scale(${SCALE})`,
                  transformOrigin: 'top left',
                  background: previewTheme.colors.bgDeep,
                  overflow: 'hidden',
                }}
              >
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
              </div>
            </div>
          </div>
        </div>

        {/* Customize */}
        <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-100 shrink-0 flex-wrap">
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            Display font
            <select
              value={overrides.fonts?.display ?? baseTheme.fonts.display}
              onChange={e => setDisplayFont(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1"
            >
              {DISPLAY_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            Upload font
            <input
              type="file"
              accept=".woff2,.woff,.ttf,.otf"
              onChange={async e => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const { familyName, url } = await onUploadFont(file)
                  const next = { ...overrides, fonts: { ...overrides.fonts, display: familyName, displayUrl: url } }
                  setOverrides(next)
                  onUpdateOverrides(next)
                } catch (err) {
                  alert(err.message)
                }
              }}
              className="text-xs"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            Text color
            <input
              type="color"
              value={overrides.colors?.text ?? baseTheme.colors.text}
              onChange={e => setTextColor('text', e.target.value)}
              className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            Muted text color
            <input
              type="color"
              value={overrides.colors?.textMuted ?? baseTheme.colors.textMuted}
              onChange={e => setTextColor('textMuted', e.target.value)}
              className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
            />
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: previewTheme.colors.highlight }} />
            <span className="text-sm font-semibold text-gray-800">{previewTheme.name}</span>
          </div>
          <button
            onClick={onClose}
            className="bg-gray-900 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
