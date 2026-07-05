import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { getTheme, DEFAULT_THEME_ID } from '../../themes/index.js'
import { floorContrast } from '../../lib/contrast.js'

const ThemeContext = createContext(null)

// textMuted carries real game text (PYL point values, question captions,
// scoreboard labels), not just the watermark — see the audit's contrast
// finding (19 of 21 themes fail 4.5:1). 3:1 is the deliberately looser
// large-text/TV-at-distance floor, not the stricter 4.5:1 body-text minimum.
// This runs on the FINAL merged colors, after a per-show override is
// applied, not just the shipped theme default — a host picking their own
// "muted text color" shouldn't be able to make it unreadable either.
// Floors ONLY textMuted; text/accent/highlight are intentionally untouched.
function floorTextMuted(colors) {
  const floored = floorContrast(colors.textMuted, [colors.bg, colors.bgDeep])
  return floored === colors.textMuted ? colors : { ...colors, textMuted: floored }
}

function applyOverrides(baseTheme, overrides) {
  const merged = (!overrides || Object.keys(overrides).length === 0)
    ? baseTheme
    : {
        ...baseTheme,
        fonts: { ...baseTheme.fonts, ...(overrides.fonts ?? {}) },
        colors: { ...baseTheme.colors, ...(overrides.colors ?? {}) },
      }
  const flooredColors = floorTextMuted(merged.colors)
  return flooredColors === merged.colors ? merged : { ...merged, colors: flooredColors }
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
