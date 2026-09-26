import { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react'
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
// unguarded, unlike textMuted). `accent` stays unfloored — it's genuinely
// decorative (backdrop tints, borders). `highlight` was added 2026-09-14:
// ScoreboardOverlay.jsx renders the #1 team's name and total SCORE in
// `highlight` (not decoration — that's the actual number guests are there
// to see), so a host picking a low-contrast highlight blanked out the
// leading team's score on the TV (Ben, live show: "the changed color theme
// blocked out scores").
function floorReadableColors(colors) {
  const bgs = [colors.bg, colors.bgDeep]
  const flooredText = floorContrast(colors.text, bgs)
  const flooredMuted = floorContrast(colors.textMuted, bgs)
  const flooredHighlight = floorContrast(colors.highlight, bgs)
  if (flooredText === colors.text && flooredMuted === colors.textMuted && flooredHighlight === colors.highlight) return colors
  return { ...colors, text: flooredText, textMuted: flooredMuted, highlight: flooredHighlight }
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
        // Passed through untouched — floorReadableColors below never sees
        // either of these. ringWorldFor (client/src/lib/ringWorldFor.js) is
        // the main reader of both, but not the only one: ThemePickerModal's
        // live preview and WarpTransition.jsx also read theme.ringWorld off
        // this merged object.
        worldPalette: overrides?.worldPalette ?? undefined,
        ringWorld: overrides?.ringWorld ?? undefined,
      }
  const flooredColors = floorReadableColors(merged.colors)
  return flooredColors === merged.colors ? merged : { ...merged, colors: flooredColors }
}

export function ThemeProvider({ showThemeId, overrides, showId, children }) {
  const [themeId, setThemeId] = useState(showThemeId ?? DEFAULT_THEME_ID)
  const registeredFontRef = useRef(null)

  useEffect(() => {
    if (showThemeId) setThemeId(showThemeId)
  }, [showThemeId])

  // Memoized: every consumer down the tree reads this context, so recomputing
  // (and handing out a new object identity) on every unrelated parent render
  // would re-render the whole display/join tree for nothing. Same output
  // either way — pure re-render-count win, not a behavior change.
  const theme = useMemo(() => applyOverrides(getTheme(themeId), overrides), [themeId, overrides])

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

  // showId: the live show's own id, distinct from themeId (which theme is
  // active). ringWorldFor's auto-draw tier (client/src/lib/ringWorldFor.js)
  // uses it to seed a per-show station arrangement when no host has applied
  // an explicit ringWorld override. Absent on demo/preview/no-show-live
  // paths (Display.jsx passes no showId there) — ringWorldFor treats a
  // missing showId as "no auto-draw," same as today's behavior.
  const value = useMemo(() => ({ theme, themeId, setThemeId, showId }), [theme, themeId, showId])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
