export const DISPLAY_FONTS = ['Boogaloo', 'Handters', 'Roquen', 'DM Sans']

export default function ThemeCustomizeControls({ overrides, baseTheme, onSetDisplayFont, onUploadFont, onSetTextColor, onDone }) {
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
      <button
        onClick={onDone}
        className="ml-auto bg-gray-900 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-gray-700 transition-colors shrink-0"
      >
        Done
      </button>
    </div>
  )
}
