import { useTheme } from '../shared/ThemeProvider.jsx'
import { THEMES } from '../../themes/index.js'

export default function ThemePicker({ onThemeChange }) {
  const { themeId } = useTheme()

  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Theme</p>
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => onThemeChange(t.id)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all"
            style={{
              background: themeId === t.id ? t.colors.bg : 'transparent',
              borderColor: themeId === t.id ? t.colors.highlight : '#e5e7eb',
              color: themeId === t.id ? t.colors.highlight : '#374151',
            }}
          >
            <span
              className="w-4 h-4 rounded-full shrink-0"
              style={{ background: t.colors.highlight }}
            />
            <span className="text-xs font-medium truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
