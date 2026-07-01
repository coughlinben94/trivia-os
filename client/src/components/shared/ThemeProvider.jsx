import { createContext, useContext, useState, useEffect } from 'react'
import { getTheme, DEFAULT_THEME_ID } from '../../themes/index.js'

const ThemeContext = createContext(null)

function applyOverrides(baseTheme, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return baseTheme
  return {
    ...baseTheme,
    fonts: { ...baseTheme.fonts, ...(overrides.fonts ?? {}) },
    colors: { ...baseTheme.colors, ...(overrides.colors ?? {}) },
  }
}

export function ThemeProvider({ showThemeId, overrides, children }) {
  const [themeId, setThemeId] = useState(showThemeId ?? DEFAULT_THEME_ID)

  useEffect(() => {
    if (showThemeId) setThemeId(showThemeId)
  }, [showThemeId])

  const theme = applyOverrides(getTheme(themeId), overrides)

  useEffect(() => {
    const url = theme.fonts.displayUrl
    const family = theme.fonts.display
    if (!url || !family) return
    const fontFace = new FontFace(family, `url(${url})`)
    fontFace.load().then(loaded => {
      document.fonts.add(loaded)
    }).catch(() => {
      // Font failed to load — text falls back to the next font in the stack, no crash
    })
  }, [theme.fonts.displayUrl, theme.fonts.display])

  return (
    <ThemeContext.Provider value={{ theme, themeId, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
