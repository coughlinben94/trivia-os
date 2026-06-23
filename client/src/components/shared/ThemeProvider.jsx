import { createContext, useContext, useState, useEffect } from 'react'
import { getTheme, DEFAULT_THEME_ID } from '../../themes/index.js'

const ThemeContext = createContext(null)

export function ThemeProvider({ showThemeId, children }) {
  const [themeId, setThemeId] = useState(showThemeId ?? DEFAULT_THEME_ID)

  useEffect(() => {
    if (showThemeId) setThemeId(showThemeId)
  }, [showThemeId])

  const theme = getTheme(themeId)

  return (
    <ThemeContext.Provider value={{ theme, themeId, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
