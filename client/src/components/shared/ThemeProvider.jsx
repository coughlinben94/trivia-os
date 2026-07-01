import { createContext, useContext, useState, useEffect, useRef } from 'react'
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
  const registeredFontRef = useRef(null)

  useEffect(() => {
    if (showThemeId) setThemeId(showThemeId)
  }, [showThemeId])

  const theme = applyOverrides(getTheme(themeId), overrides)

  useEffect(() => {
    const url = theme.fonts.displayUrl
    const family = theme.fonts.display
    if (!url || !family) return

    const fontFace = new FontFace(family, `url(${url})`)
    let cancelled = false
    fontFace.load().then(loaded => {
      if (cancelled) return
      document.fonts.add(loaded)
      registeredFontRef.current = loaded
    }).catch(err => {
      console.warn(`Failed to load custom font "${family}":`, err)
    })

    return () => {
      cancelled = true
      if (registeredFontRef.current) {
        document.fonts.delete(registeredFontRef.current)
        registeredFontRef.current = null
      }
    }
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
