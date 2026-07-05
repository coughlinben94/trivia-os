export const DISPLAY_FONTS = ['Boogaloo', 'Handters', 'Roquen', 'DM Sans']

export default function ThemeCustomizeControls({ overrides, baseTheme, onSetDisplayFont, onUploadFont, onSetTextColor, onReset, onDone }) {
  const hasOverrides = !!(overrides.colors && Object.keys(overrides.colors).length > 0) ||
    !!(overrides.fonts && Object.keys(overrides.fonts).length > 0)
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-100 shrink-0 flex-wrap">
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
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        Accent color
        <input
          type="color"
          value={overrides.colors?.accent ?? baseTheme.colors.accent}
          onChange={e => onSetTextColor('accent', e.target.value)}
          className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        Highlight color
        <input
          type="color"
          value={overrides.colors?.highlight ?? baseTheme.colors.highlight}
          onChange={e => onSetTextColor('highlight', e.target.value)}
          className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        Text color
        <input
          type="color"
          value={overrides.colors?.text ?? baseTheme.colors.text}
          onChange={e => onSetTextColor('text', e.target.value)}
          className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        Muted text color
        <input
          type="color"
          value={overrides.colors?.textMuted ?? baseTheme.colors.textMuted}
          onChange={e => onSetTextColor('textMuted', e.target.value)}
          className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
        />
      </label>
      <div className="ml-auto flex items-center gap-2 shrink-0">
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
  )
}
