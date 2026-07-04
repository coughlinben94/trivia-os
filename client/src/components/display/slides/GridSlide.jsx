import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import SlideElements from '../SlideElements.jsx'
import { autoFitClamp, VISUAL_CAPTION_TIERS, VISUAL_CAPTION_FLOOR, VISUAL_CAPTION_CEIL } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'

const SHINY_GOLD      = '#f0d890'
const SHINY_GOLD_GLOW = '#d4820c'

function Tile({ tile, size, reduce }) {
  const common = { width: size, height: size, borderRadius: 10, overflow: 'hidden', boxShadow: '0 6px 22px rgba(0,0,0,0.55)' }
  if (tile?.mediaUrl) {
    return <div style={common}><img src={tile.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
  }
  return <div style={{ ...common, background: tile?.color ?? '#222' }} />
}

export default function GridSlide({ slide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const { data } = slide
  const columns = Array.isArray(data.columns) ? data.columns : []
  const nCols = columns.length || 1
  const rows = columns[0]?.length || 1
  const intraGap = data.intraGap ?? 0
  const interGap = data.interGap ?? 84
  const showLabels = data.columnLabels ?? true

  const vBand = 720, hBand = 1520
  const maxByH = (vBand - intraGap * (rows - 1)) / rows
  const maxByW = (hBand - interGap * (nCols - 1)) / nCols
  const size = Math.min(360, Math.floor(Math.min(maxByH, maxByW)))

  const tIn = (i) => reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
    : { initial: { opacity: 0, scale: 0.94 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.4, delay: 0.06 * i, ease: EASE_OUT } }

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.colors.shinyBg }}>
      {/* Gold glow burst — fixed gold, theme-independent. No white flash: the
          shiny wrapper transition in SlideRenderer owns the entrance. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
        background: `radial-gradient(ellipse at center, ${SHINY_GOLD_GLOW}55 0%, transparent 58%)`,
        animation: 'shinyGlow 0.75s ease-out forwards',
      }} />

      <div style={{ position: 'absolute', top: 28, left: 30, zIndex: 40, fontSize: 40, filter: `drop-shadow(0 0 12px ${SHINY_GOLD_GLOW})` }}>✨</div>

      {/* Centered column group */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 130 }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: interGap }}>
          {columns.map((col, ci) => (
            <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: intraGap, alignItems: 'center' }}>
              {col.map((tile, ti) => (
                <motion.div key={ti} {...tIn(ci * rows + ti)}>
                  <Tile tile={tile} size={size} reduce={reduce} />
                </motion.div>
              ))}
              {showLabels && (
                <motion.div {...tIn(nCols * rows + ci)} style={{ marginTop: 14, width: size, textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 54, height: 54, borderRadius: '50%',
                    background: SHINY_GOLD, color: '#3a2600', fontWeight: 800, fontSize: 30,
                    fontFamily: `'${theme.fonts.display}', sans-serif`,
                    boxShadow: `0 0 18px ${SHINY_GOLD_GLOW}88`,
                  }}>{ci + 1}</span>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Question — bottom scrim */}
      {data.text && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: EASE_OUT }}
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 45,
            background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)',
            paddingBottom: 42, paddingTop: 110, paddingInline: 80,
          }}
        >
          <p style={{
            textAlign: 'center', color: theme.colors.text, lineHeight: 1.15,
            fontFamily: `'${theme.fonts.body}', sans-serif`,
            fontSize: autoFitClamp(data.text, VISUAL_CAPTION_TIERS, VISUAL_CAPTION_FLOOR, VISUAL_CAPTION_CEIL),
            fontWeight: 500, textShadow: '0 2px 16px rgba(0,0,0,0.9)',
          }}>{data.text}</p>
        </motion.div>
      )}

      <div className="absolute inset-0" style={{ zIndex: 25 }}>
        <SlideElements elements={data.elements} theme={theme} />
      </div>
    </div>
  )
}
