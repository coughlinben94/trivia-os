import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { getTheme, DEFAULT_THEME_ID } from '../../themes/index.js'
import { floorContrast } from '../../lib/contrast.js'

const ThemeContext = createContext(null)

// textMuted/text carry real game text (PYL point values, question captions,
// scoreboard labels, and the actual question/body copy) — not just
// decoration — see the audit's contrast finding (19 of 21 themes fail
// 4.5:1). 3:1 is the deliberately looser large-text/TV-at-distance floor,
// not the stricter 4.5:1 body-text minimum. This runs on the FINAL merged
// colors, after a per-show override is applied, not just the shipped theme
// default — a host free-picking a text color in ThemeCustomizeControls
// shouldn't be able to make the question itself unreadable on the TV.
// `text` was added to the floor 2026-08-26 (host-color-picker audit found it
// unguarded, unlike textMuted). `highlight`/`accent` stay intentionally
// unfloored — they're decorative (titles, UI accents), not the copy guests
// have to actually read to play.
function floorReadableColors(colors) {
  const bgs = [colors.bg, colors.bgDeep]
  const flooredText = floorContrast(colors.text, bgs)
  const flooredMuted = floorContrast(colors.textMuted, bgs)
  if (flooredText === colors.text && flooredMuted === colors.textMuted) return colors
  return { ...colors, text: flooredText, textMuted: flooredMuted }
}

// Exported (2026-08-26) so ThemePickerModal's live preview can use the exact
// same merge+floor the real TV does, instead of hand-duplicating the merge
// without the floor — that duplication was caught by an independent review:
// a host picking a low-contrast `text` color saw their raw pick in the
// preview, then a different (floored) color on the actual TV.
export function applyOverrides(baseTheme, overrides) {
  const merged = (!overrides || Object.keys(overrides).length === 0)
    ? baseTheme
    : {
        ...baseTheme,
        fonts: { ...baseTheme.fonts, ...(overrides.fonts ?? {}) },
        colors: { ...baseTheme.colors, ...(overrides.colors ?? {}) },
      }
  const flooredColors = floorReadableColors(merged.colors)
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
