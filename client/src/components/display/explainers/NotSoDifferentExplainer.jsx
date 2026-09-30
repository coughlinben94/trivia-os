import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { explainerImageUrls } from '../../../lib/shinyExplainers.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

// "We're not so different, you and I..." — how it works, ~10s, plays once and
// holds its last frame until the host presses Next. An easy sample question:
// four faces land one at a time (the four images appear in order), then the
// question — what connects them — and the answer. Deliberately no
// rules/scoring text. Reduced motion: same content, opacity only, all at once.
const PHOTOS = explainerImageUrls('fmt_not_so_different')
const TILE_AT = [0.8, 2.2, 3.6, 5.0]   // seconds; 1.4s apart so each face registers
const ASK_AT = 7.0
const ANSWER_AT = 9.0

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
      alignItems: 'center', justifyContent: 'center', gap: '3vmin',
      fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`, color: SHINY_GOLD, textAlign: 'center',
    }}>
      <motion.p {...enter(0.1, 8)} style={{ margin: 0, fontSize: '7vmin', textShadow: `0 0 3vmin ${SHINY_GOLD_GLOW}` }}>
        Four faces.
      </motion.p>
      <div style={{ display: 'flex', gap: '3vmin' }}>
        {PHOTOS.map((src, i) => (
          <motion.div
            key={src}
            {...enter(TILE_AT[i])}
            style={{
              position: 'relative', width: '19vmin', height: '19vmin', borderRadius: '2vmin', overflow: 'hidden',
              border: `0.5vmin solid ${SHINY_GOLD}`, boxShadow: `0 0 4vmin ${SHINY_GOLD_GLOW}55`,
            }}
          >
            <img src={src} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <span style={{
              position: 'absolute', top: '1vmin', left: '1vmin', width: '4.4vmin', height: '4.4vmin', borderRadius: '50%',
              display: 'grid', placeItems: 'center', fontSize: '3vmin', lineHeight: 1,
              background: 'rgba(0,0,0,0.65)', border: `0.25vmin solid ${SHINY_GOLD}`,
            }}>
              {i + 1}
            </span>
          </motion.div>
        ))}
      </div>
      <motion.p {...enter(ASK_AT, 8)} style={{ margin: 0, fontSize: '5vmin', opacity: 0.85 }}>
        What connects them?
      </motion.p>
      <motion.p {...enter(ANSWER_AT, 8)} style={{ margin: 0, fontSize: '9vmin', textShadow: `0 0 4vmin ${SHINY_GOLD_GLOW}` }}>
        One Direction
      </motion.p>
    </div>
  )
}
