import { motion, useReducedMotion } from 'framer-motion'
import { BENDLE_STEP_POINTS } from '../../../lib/bendleScoring.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import WaveformBars from '../WaveformBars.jsx'

// How Bendle is played: the mix gains one layer per step, and teams write the
// song title on paper. Visual only — no audio, no phone entry, and never which
// stem plays at which step (that is per slide).
//
// Grading rule (Ben, 2026-10-02: "bendle is 30 20 10", card must show it): the
// step you get it right on sets your points. The registry copy states that;
// any penalty for a wrong early guess is NOT stated (none is defined in code).
const STAGES = [
  { step: 'Step 1', bars: 12 },
  { step: 'Step 2', bars: 20 },
  { step: 'Step 3', bars: 28 },
]
const STEP_AT = index => 0.25 + index * 0.65

export default function BendleExplainer() {
  const reduce = useReducedMotion()
  const { theme } = useTheme()
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const enter = (delay, y = 14) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, transform: `translateY(${y}px)` },
    animate: reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' },
    transition: { duration: 0.4, delay: reduce ? 0 : delay, ease: EASE_OUT },
  })

  return (
    <div
      role="img"
      aria-label={`Example: the song plays in three steps, one more layer each. Write the title on your answer sheet: step 1, ${BENDLE_STEP_POINTS[0]} points; step 2, ${BENDLE_STEP_POINTS[1]}; step 3, ${BENDLE_STEP_POINTS[2]}.`}
      style={{
        width: 'min(100%, 1500px)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '3vmin', color: text,
      }}
    >
      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '3.5vmin' }}>
        {STAGES.map((stage, index) => (
          <motion.div
            key={stage.step}
            {...enter(STEP_AT(index), 18)}
            style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.6vmin' }}
          >
            <span style={{ color: SHINY_GOLD, fontFamily: displayFont, fontSize: 'clamp(2rem, 3.4vmin, 3.8rem)', lineHeight: 1, textShadow: `0 0 2vmin ${SHINY_GOLD_GLOW}55` }}>
              {stage.step}
            </span>
            <div style={{ height: '11vmin', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(1.35)', transformOrigin: 'center' }}>
              <WaveformBars playing={false} barCount={stage.bars} />
            </div>
            <span style={{ color: `${text}e0`, fontSize: 'clamp(1.4rem, 2.4vmin, 2.6rem)' }}>
              {index + 1} {index === 0 ? 'layer' : 'layers'}
            </span>
          </motion.div>
        ))}
      </div>

      {/* "Write it down", made concrete: a blank answer sheet. */}
      <motion.div {...enter(STEP_AT(0) + 0.15, 10)} style={{
        width: 'min(100%, 1100px)', display: 'flex', flexDirection: 'column', gap: '1.2vmin',
        padding: '1.8vmin 3vmin 2.2vmin', borderRadius: 14,
        background: 'rgba(255,255,255,0.06)', border: `1px solid ${text}33`,
      }}>
        <span style={{ fontFamily: displayFont, fontSize: 'clamp(1.7rem, 3vmin, 3.2rem)', lineHeight: 1.1 }}>
          Your answer sheet
        </span>
        {STAGES.map((stage, index) => (
          <motion.div key={stage.step} {...enter(STEP_AT(index) + 0.2, 8)} style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'end', columnGap: '2.4vmin',
            fontSize: 'clamp(1.4rem, 2.6vmin, 2.8rem)', fontVariantNumeric: 'tabular-nums', textAlign: 'left',
          }}>
            <span style={{ color: `${text}e0` }}>{stage.step}</span>
            <span aria-hidden="true" style={{ height: '0.2em', borderBottom: `3px solid ${text}66`, marginBottom: '0.25em' }} />
            <span style={{ fontFamily: displayFont, color: SHINY_GOLD, fontSize: '1.15em', lineHeight: 1 }}>
              {BENDLE_STEP_POINTS[index]} pts
            </span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
