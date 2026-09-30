import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

// "We're not so different, you and I..." — how it works, ~10s, plays once and
// holds its last frame until the host presses Next. Four numbered tiles land
// one at a time (the four images appear in order), then the question: what
// connects them. Deliberately no rules/scoring text. Reduced motion: same
// content, opacity only, all at once.
const TILE_AT = [0.9, 2.6, 4.3, 6.0]   // seconds; ~1.7s apart so each one registers
const FAMILY_AT = 7.6
const ASK_AT = 8.8

export default function NotSoDifferentExplainer() {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const enter = (at, dist = 14) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: dist, scale: 0.94 },
    animate: reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 },
    transition: { duration: reduce ? 0.3 : 0.5, delay: reduce ? 0 : at, ease: EASE_OUT },
  })
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '4vmin',
      fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`, color: SHINY_GOLD, textAlign: 'center',
    }}>
      <motion.p {...enter(0.1, 8)} style={{ margin: 0, fontSize: '7vmin', textShadow: `0 0 3vmin ${SHINY_GOLD_GLOW}` }}>
        Four things.
      </motion.p>
      <div style={{ display: 'flex', gap: '3vmin' }}>
        {TILE_AT.map((at, i) => (
          <motion.div
            key={i}
            {...enter(at)}
            style={{
              width: '18vmin', height: '18vmin', borderRadius: '2vmin', display: 'grid', placeItems: 'center',
              fontSize: '11vmin', border: `0.5vmin solid ${SHINY_GOLD}`, boxShadow: `0 0 4vmin ${SHINY_GOLD_GLOW}55`,
            }}
          >
            {i + 1}
          </motion.div>
        ))}
      </div>
      <motion.p {...enter(FAMILY_AT, 8)} style={{ margin: 0, fontSize: '7vmin', textShadow: `0 0 3vmin ${SHINY_GOLD_GLOW}` }}>
        One weird family.
      </motion.p>
      <motion.p {...enter(ASK_AT, 8)} style={{ margin: 0, fontSize: '5vmin', opacity: 0.85 }}>
        What connects them?
      </motion.p>
    </div>
  )
}
