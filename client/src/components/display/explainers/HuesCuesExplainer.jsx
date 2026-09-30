import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { chebyshevDistance, getHuesCuesGrid, HUES_CUES_COLS, HUES_CUES_ROWS } from '../../../lib/huesCuesGrid.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

const TARGET = { col: 'H', row: 15 }
const GUESS = { col: 'I', row: 16 }
const COL_LETTERS = Array.from({ length: HUES_CUES_COLS }, (_, index) => String.fromCharCode(65 + index))
const COLUMN_RADIUS = 4
const ROW_RADIUS = 4

function columnIndex(col) {
  return col.charCodeAt(0) - 65
}

export default function HuesCuesExplainer() {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const cells = useMemo(() => {
    const byCode = new Map(getHuesCuesGrid().map(cell => [cell.code, cell]))
    const centerCol = columnIndex(TARGET.col)
    const minCol = Math.max(0, centerCol - COLUMN_RADIUS)
    const maxCol = Math.min(HUES_CUES_COLS - 1, centerCol + COLUMN_RADIUS)
    const minRow = Math.max(1, TARGET.row - ROW_RADIUS)
    const maxRow = Math.min(HUES_CUES_ROWS, TARGET.row + ROW_RADIUS)
    return {
      columns: COL_LETTERS.slice(minCol, maxCol + 1),
      rows: Array.from({ length: maxRow - minRow + 1 }, (_, index) => minRow + index),
      byCode,
    }
  }, [])

  const gridItems = []
  gridItems.push(<span key="corner" />)
  cells.columns.forEach(col => gridItems.push(
    <span key={`col-${col}`} style={{ display: 'grid', placeItems: 'center', color: `${theme.colors.text}c8`, fontSize: 'clamp(0.9rem, 1.45vmin, 1.4rem)', fontVariantNumeric: 'tabular-nums' }}>{col}</span>
  ))

  cells.rows.forEach(row => {
    gridItems.push(<span key={`row-${row}`} style={{ display: 'grid', placeItems: 'center', color: `${theme.colors.text}c8`, fontSize: 'clamp(0.9rem, 1.45vmin, 1.4rem)', fontVariantNumeric: 'tabular-nums' }}>{row}</span>)
    cells.columns.forEach(col => {
      const cell = cells.byCode.get(`${col}${row}`)
      const distance = chebyshevDistance(cell, TARGET)
      const isTarget = distance === 0
      const isGuess = cell.code === `${GUESS.col}${GUESS.row}`
      const outline = isTarget
        ? `3px solid ${SHINY_GOLD}`
        : distance === 1
          ? '2px solid rgba(255,255,255,0.96)'
          : distance === 2
            ? '1px dashed rgba(255,255,255,0.82)'
            : '1px solid rgba(0,0,0,0.28)'
      gridItems.push(
        <div key={cell.code} title={cell.code} style={{
          position: 'relative', minWidth: 0, minHeight: 0, display: 'grid', placeItems: 'center',
          background: cell.hex, boxShadow: `inset 0 0 0 ${isTarget ? 3 : distance === 1 ? 2 : 1}px ${isTarget ? SHINY_GOLD : distance === 1 ? 'rgba(255,255,255,0.96)' : 'rgba(0,0,0,0.28)'}`,
          outline: distance === 2 ? outline : 'none', outlineOffset: '-1px', zIndex: isTarget || isGuess ? 1 : 0,
        }}>
          {(isTarget || isGuess) && (
            <span style={{
              display: 'grid', placeItems: 'center', width: '2.3vmin', height: '2.3vmin', minWidth: 24, minHeight: 24,
              borderRadius: '50%', background: '#06100d', color: isTarget ? SHINY_GOLD : '#fff',
              border: `1px solid ${isTarget ? SHINY_GOLD : '#fff'}`, fontSize: 'clamp(0.8rem, 1.25vmin, 1.2rem)', fontWeight: 800,
            }}>
              {isTarget ? 'T' : 'G'}
            </span>
          )}
        </div>
      )
    })
  })

  return (
    <div style={{
      width: 'min(100%, 1350px)', height: '100%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: '5vmin', color: theme.colors.text,
      fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
    }}>
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(16px)' }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
        transition={{ duration: 0.45, delay: reduce ? 0 : 0.25, ease: EASE_OUT }}
        role="img"
        aria-label="Example crop of the color grid. H15 is the target; I16 is a diagonal neighboring guess."
        style={{
          width: 'min(55vh, 49vw)', maxHeight: '56vh', aspectRatio: '1', flexShrink: 0,
          display: 'grid', gridTemplateColumns: 'auto repeat(9, minmax(0, 1fr))',
          gridTemplateRows: 'auto repeat(9, minmax(0, 1fr))', gap: '0.25vmin',
        }}
      >
        {gridItems}
      </motion.div>

      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(14px)' }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
        transition={{ duration: 0.45, delay: reduce ? 0 : 0.9, ease: EASE_OUT }}
        style={{ maxWidth: '34%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1.4vmin', textAlign: 'left' }}
      >
        <span style={{ color: SHINY_GOLD, fontSize: 'clamp(1rem, 1.8vmin, 1.8rem)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Clue</span>
        <span style={{ fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`, fontSize: 'clamp(2rem, 4.1vmin, 4.4rem)', lineHeight: 1.08, textWrap: 'balance' }}>
          Fresh-cut grass
        </span>
        <span style={{ fontSize: 'clamp(1.1rem, 1.8vmin, 1.8rem)', color: `${theme.colors.text}cf` }}>
          Guess <strong style={{ color: '#fff' }}>I16</strong> lands diagonally beside target <strong style={{ color: SHINY_GOLD }}>H15</strong>.
        </span>
        <span style={{ color: SHINY_GOLD, fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`, fontSize: 'clamp(1.7rem, 2.7vmin, 2.8rem)' }}>
          +20 points
        </span>
        <span style={{ color: `${theme.colors.text}a8`, fontSize: 'clamp(0.95rem, 1.45vmin, 1.45rem)', lineHeight: 1.3 }}>
          T = exact target · G = guess. Solid outlines are one square away; dashed outlines are two.
        </span>
      </motion.div>
    </div>
  )
}
