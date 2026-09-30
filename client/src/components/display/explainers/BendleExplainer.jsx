import { motion, useReducedMotion } from 'framer-motion'
import { BENDLE_STEP_POINTS } from '../../../lib/bendleScoring.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import WaveformBars from '../WaveformBars.jsx'

const STAGES = [
  { step: 'Step 1', bars: 12 },
  { step: 'Step 2', bars: 20 },
  { step: 'Step 3', bars: 28 },
]

export default function BendleExplainer() {
  const reduce = useReducedMotion()
  const { theme } = useTheme()
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  return (
    <div style={{
      width: 'min(100%, 1500px)', height: '100%', maxHeight: '42vmin',
      display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      alignItems: 'center', gap: '3.5vmin',
    }}>
      {STAGES.map((stage, index) => (
        <motion.div
          key={stage.step}
          initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(18px)' }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
          transition={{ duration: 0.45, delay: reduce ? 0 : 0.25 + index * 0.65, ease: EASE_OUT }}
          style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2vmin' }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.3vmin', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: `${SHINY_GOLD}cc`, fontSize: 'clamp(1.2rem, 2vmin, 2.2rem)', fontWeight: 700, letterSpacing: '0.04em' }}>
              {stage.step}
            </span>
            <span style={{ color: SHINY_GOLD, fontFamily: displayFont, fontSize: 'clamp(2.2rem, 4.8vmin, 5.4rem)', lineHeight: 1, textShadow: `0 0 2vmin ${SHINY_GOLD_GLOW}66` }}>
              {BENDLE_STEP_POINTS[index]} pts
            </span>
          </div>
          <div style={{ height: '11vmin', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(1.35)', transformOrigin: 'center' }}>
            <WaveformBars playing={false} barCount={stage.bars} />
          </div>
          <span style={{ color: `${SHINY_GOLD}b8`, fontSize: 'clamp(1.1rem, 1.8vmin, 1.8rem)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {index + 1} {index === 0 ? 'layer' : 'layers'}
          </span>
        </motion.div>
      ))}
    </div>
  )
}
