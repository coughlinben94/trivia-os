import { motion, useReducedMotion } from 'framer-motion'
import { BENDLE_STEP_POINTS } from '../../../lib/bendleScoring.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import WaveformBars from '../WaveformBars.jsx'

// How Bendle is played: the mix gains one layer per step, and each team
// searches the song on its phone and locks ONE guess. Visual only — no audio,
// and never which stem plays at which step (that is per slide).
//
// Owner rule, 2026-10-02: one guess per team. The step that is live when a
// team locks sets its points if right (30 / 20 / 10, from BENDLE_STEP_POINTS).
// Each stage shows its own value, so nothing reads as scoring on several steps.
const STAGES = [
  { step: 'Step 1', bars: 12 },
  { step: 'Step 2', bars: 20 },
  { step: 'Step 3', bars: 28 },
]
const STEP_AT = index => 0.25 + index * 0.65
// Sample search, as the phone board shows it: typed text, then a title +
// artist row picked, then Lock In.
const SAMPLE_QUERY = 'mr blue sk'
const SAMPLE_SONG = { title: 'Mr. Blue Sky', artist: 'Electric Light Orchestra' }

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
      aria-label={`Example: the song plays in three steps, one more layer each. A team searches the song on its phone and locks in one guess. Right when locked on step 1: ${BENDLE_STEP_POINTS[0]} points; step 2: ${BENDLE_STEP_POINTS[1]}; step 3: ${BENDLE_STEP_POINTS[2]}.`}
      style={{
        width: 'min(100%, max(1500px, 139vmin))', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '3vmin', color: text,
      }}
    >
      {/* Full width: WaveformBars are fixed-px bars, so the three stages need
          the whole row (a phone beside them made 28 bars overrun at 720p). */}
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
            <span style={{ fontSize: 'max(1.4rem, 2.4vmin)', fontVariantNumeric: 'tabular-nums', color: `${text}e6` }}>
              Lock here: <strong style={{ fontFamily: displayFont, fontWeight: 400, color: SHINY_GOLD, fontSize: '1.2em' }}>{BENDLE_STEP_POINTS[index]}</strong>
            </span>
          </motion.div>
        ))}
      </div>

      {/* The phone board, made concrete: search box, one title + artist
          result picked, Lock In. */}
      <motion.div {...enter(STEP_AT(0) + 0.15, 10)} style={{
        width: 'max(320px, 40vmin)', display: 'flex', flexDirection: 'column', gap: '1.4vmin',
        padding: '2.2vmin 2vmin', borderRadius: '3.2vmin', textAlign: 'left',
        background: 'rgba(255,255,255,0.06)', border: `2px solid ${text}40`,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1vmin', padding: '1vmin 1.4vmin', borderRadius: 10,
          background: 'rgba(0,0,0,0.28)', border: `1px solid ${text}40`, fontSize: 'max(1.3rem, 2.4vmin)',
        }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: '1em', height: '1em', flexShrink: 0 }} fill="none" stroke={`${text}b0`} strokeWidth="2.5" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 21 21" />
          </svg>
          <span style={{ color: `${text}e6` }}>{SAMPLE_QUERY}</span>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '0.4vmin', padding: '1.2vmin 1.4vmin', borderRadius: 10,
          background: `${SHINY_GOLD}1f`, border: `2px solid ${SHINY_GOLD}`,
        }}>
          <span style={{ fontFamily: displayFont, fontSize: 'max(1.6rem, 2.9vmin)', lineHeight: 1.05 }}>{SAMPLE_SONG.title}</span>
          <span style={{ color: `${text}d0`, fontSize: 'max(1.2rem, 2.2vmin)', lineHeight: 1.15 }}>{SAMPLE_SONG.artist}</span>
        </div>
        <div style={{
          padding: '1.1vmin', borderRadius: 10, textAlign: 'center', background: SHINY_GOLD, color: '#1a1a1a',
          fontFamily: displayFont, fontSize: 'max(1.6rem, 2.9vmin)', lineHeight: 1.05,
        }}>
          Lock in
        </div>
      </motion.div>
    </div>
  )
}
