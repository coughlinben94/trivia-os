import { useState } from 'react'

export const DISPLAY_FONTS = ['Boogaloo', 'Handters', 'Roquen', 'DM Sans']

// Every field theme.colors actually has (themes/index.js) — grouped by what
// a host recognizes on screen, not by the underlying variable names. Before
// 2026-08-31 this only listed accent/highlight/text/textMuted; bg/bgDeep/
// shinyBg/shinyAccent were real, already-working override fields
// (ThemeProvider's applyOverrides merges + contrast-floors all 8) with no
// swatch to reach them from this modal.
const COLOR_GROUPS = [
  { label: 'Background', fields: [
    { key: 'bg', label: 'Background' },
    { key: 'bgDeep', label: 'Background (deep)' },
  ] },
  { label: 'Text', fields: [
    { key: 'accent', label: 'Accent' },
    { key: 'highlight', label: 'Highlight' },
    { key: 'text', label: 'Text' },
    { key: 'textMuted', label: 'Muted text' },
  ] },
  { label: 'Shiny questions', fields: [
    { key: 'shinyBg', label: 'Background' },
    { key: 'shinyAccent', label: 'Accent' },
  ] },
]

function ColorSwatch({ field, overrides, baseTheme, onSetTextColor }) {
  return (
    <label className="flex flex-col items-center gap-1 text-center" title={field.label}>
      <input
        type="color"
        value={overrides.colors?.[field.key] ?? baseTheme.colors[field.key]}
        onChange={e => onSetTextColor(field.key, e.target.value)}
        className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
      />
      <span className="text-[10px] leading-none text-gray-500 whitespace-nowrap">{field.label}</span>
    </label>
  )
}

export default function ThemeCustomizeControls({ overrides, baseTheme, onSetDisplayFont, onUploadFont, onSetTextColor, onReset, onDone }) {
  const hasColorOverrides = !!(overrides.colors && Object.keys(overrides.colors).length > 0)
  // Starts open when the show already has customized colors, so reopening
  // the modal doesn't hide the fact that colors were touched — collapsed
  // only for the common case of a show that's never customized colors.
  const [showColors, setShowColors] = useState(hasColorOverrides)
  const hasOverrides = hasColorOverrides ||
    !!(overrides.fonts && Object.keys(overrides.fonts).length > 0)
  return (
    <div className="border-t border-gray-100 shrink-0">
      <div className="flex items-center gap-4 px-5 py-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
          Display font
          <select
            value={overrides.fonts?.display ?? baseTheme.fonts.display}
            onChange={e => onSetDisplayFont(e.target.value)}
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
                await onUploadFont(file)
              } catch (err) {
                alert(err.message)
              }
            }}
            className="text-xs"
          />
        </label>
      </div>
      <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-50 flex-wrap">
        <button
          onClick={() => setShowColors(v => !v)}
          className="text-xs font-medium text-gray-500 hover:text-gray-900 underline"
        >
          {showColors ? 'Hide individual colors' : 'Advanced: edit individual colors'}
        </button>
        <div className="ml-auto flex items-center gap-2 shrink-0 self-center">
          <button
            onClick={onReset}
            disabled={!hasOverrides}
            title="Restore theme's default font and colors"
            className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-default"
          >
            Reset
          </button>
          <button
            onClick={onDone}
            className="bg-gray-900 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
      {showColors && (
        <div className="flex items-end gap-5 px-5 py-3 border-t border-gray-50 flex-wrap">
          {COLOR_GROUPS.map((group, i) => (
            <div key={group.label} className={`flex items-end gap-3 ${i > 0 ? 'pl-5 border-l border-gray-100' : ''}`}>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</span>
                <div className="flex items-start gap-3">
                  {group.fields.map(field => (
                    <ColorSwatch key={field.key} field={field} overrides={overrides} baseTheme={baseTheme} onSetTextColor={onSetTextColor} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
