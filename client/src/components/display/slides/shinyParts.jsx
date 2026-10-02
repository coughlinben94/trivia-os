import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { EASE_OUT } from '../../../lib/easings.js'

// Shared by the phone-scored Shiny TV questions (Choice/Order/Matching/Hues &
// Cues/Drop). QuestionText stays per file: each fits its own box.

// Re-fit question text once webfonts load (fitToBox measures with the real
// face). Used as a dep of the fitToBox useMemo.
export function useFontsReady() {
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)) }, [])
  return fontsReady
}

// Fixed-height reserved slot under the board — the count line / locked badge
// swap in and out without shifting anything else. Sized for a TV (2026-08-25
// design critique: 21.6px at ~3.1:1 was unreadable across a bar); `d9` alpha
// over a near-black shinyBg clears 10:1, past the 3:1 large-text floor
// contrast.js/ThemeProvider.jsx enforce on textMuted.
export function StatusSlot({ theme, children }) {
  return (
    <div style={{
      minHeight: '3.4rem', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: `${theme.colors.text}d9`,
      fontSize: 'clamp(1.6rem, 2vw, 2.3rem)',
      fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
    }}>
      {children}
    </div>
  )
}

// "N of M teams submitted" — Choice/Order/Matching. Hues & Cues ("guessed")
// and Drop ("placed their points") word it differently, so keep their own.
export function CountLine({ n, total }) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {total > 0 ? `${n} of ${total} teams submitted` : `${n} team${n === 1 ? '' : 's'} submitted`}
    </motion.span>
  )
}
