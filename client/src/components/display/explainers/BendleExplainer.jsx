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
// Owner rule, 2026-10-02: ONE guess per team. The step a team guesses on sets
// its points if right (30 / 20 / 10). The sheet shows one blank line, never
// one line per step, so nothing reads as scoring on several steps. No penalty
// and no way of marking the step is stated (neither is defined in code).
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
      aria-label={`Example: the song plays in three steps, one more layer each. Each team writes one guess. Right on step 1: ${BENDLE_STEP_POINTS[0]} points; step 2: ${BENDLE_STEP_POINTS[1]}; step 3: ${BENDLE_STEP_POINTS[2]}.`}
      style={{
        width: 'min(100%, max(1500px, 139vmin))', display: 'flex', flexDirection: 'column',
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
            <span style={{ color: SHINY_GOLD, fontFamily: displayFont, fontSize: 'max(2rem, 3.4vmin)', lineHeight: 1, textShadow: `0 0 2vmin ${SHINY_GOLD_GLOW}55` }}>
              {stage.step}
            </span>
            {/* WaveformBars is an 80px box whose paused bars fill only its
                bottom ~40%; bottom-align it in a short box so the bars sit
                right under the step label instead of ~80px below it. */}
            <div style={{ height: '5.5vmin', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', transform: 'scale(1.35)', transformOrigin: 'bottom center' }}>
              <WaveformBars playing={false} barCount={stage.bars} />
            </div>
            <span style={{ color: `${text}e0`, fontSize: 'max(1.4rem, 2.4vmin)' }}>
              {index + 1} {index === 0 ? 'layer' : 'layers'}
            </span>
          </motion.div>
        ))}
      </div>

      {/* "Write it down", made concrete: ONE blank guess line, with the step
          values shown as the choice of when to guess. */}
      <motion.div {...enter(STEP_AT(0) + 0.15, 10)} style={{
        width: 'min(100%, max(1100px, 102vmin))', display: 'flex', flexDirection: 'column', gap: '1.4vmin',
        padding: '1.8vmin 3vmin 2.2vmin', borderRadius: 14,
        background: 'rgba(255,255,255,0.06)', border: `1px solid ${text}33`,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'end', columnGap: '2.4vmin', textAlign: 'left' }}>
          <span style={{ fontFamily: displayFont, fontSize: 'max(1.7rem, 3vmin)', lineHeight: 1.1 }}>Your one guess</span>
          <span aria-hidden="true" style={{ height: '0.2em', borderBottom: `3px solid ${text}66`, marginBottom: '0.35em' }} />
        </div>
        <span style={{ fontSize: 'max(1.4rem, 2.6vmin)', fontVariantNumeric: 'tabular-nums', color: `${text}e6` }}>
          Guess on{' '}
          {BENDLE_STEP_POINTS.map((points, index) => (
            <span key={index}>
              {index > 0 && ' · '}step {index + 1}: <strong style={{ fontFamily: displayFont, fontWeight: 400, color: SHINY_GOLD, fontSize: '1.15em' }}>{points}</strong>
            </span>
          ))}
        </span>
      </motion.div>
    </div>
  )
}
