import { motion, useReducedMotion } from 'framer-motion'
import { DEFAULT_ORDER_POINTS, scoreOrderSubmission } from '../../../lib/orderScoring.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

// Synthetic items. Real Order items are pictures; words stand in here so the
// card needs no assets. Shown shuffled with A–D letters, like the real board.
const PROMPT = 'Smallest to biggest'
const ITEMS = [
  { id: 'horse', label: 'Horse' },
  { id: 'mouse', label: 'Mouse' },
  { id: 'whale', label: 'Whale' },
  { id: 'cat', label: 'Cat' },
]
const CORRECT = ['mouse', 'cat', 'horse', 'whale']
const letterOf = id => String.fromCharCode(65 + ITEMS.findIndex(item => item.id === id))
const labelOf = id => ITEMS.find(item => item.id === id).label

// Two sample answers, scored by the real scorer: one exact, one with a
// single swap. Points are host-set per slide, so only score vs 0 is shown.
export const SAMPLE_ORDER_ANSWERS = [
  { order: CORRECT, note: 'All in the right spot' },
  { order: ['mouse', 'horse', 'cat', 'whale'], note: 'Cat and Horse swapped' },
].map(answer => ({ ...answer, points: scoreOrderSubmission(answer.order, CORRECT, DEFAULT_ORDER_POINTS) }))

export default function OrderExplainer() {
  const reduce = useReducedMotion()
  const { theme } = useTheme()
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const enter = (delay, y = 14) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, transform: `translateY(${y}px)` },
    animate: reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' },
    transition: { duration: 0.3, delay: reduce ? 0 : delay, ease: EASE_OUT },
  })

  return (
    <div
      role="img"
      aria-label={`Example order question: ${PROMPT}. The exact order scores; one swap scores 0.`}
      style={{
        width: 'min(100%, 1400px)', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '2.4vmin',
      }}
    >
      <motion.p {...enter(0.15)} style={{ margin: 0, fontFamily: displayFont, fontSize: 'clamp(2rem, 4.2vmin, 4.4rem)', lineHeight: 1, color: text }}>
        {PROMPT}
      </motion.p>

      <div style={{ display: 'flex', gap: '2.4vmin', width: '100%', justifyContent: 'center' }}>
        {ITEMS.map((item, index) => (
          <motion.div key={item.id} {...enter(0.3 + index * 0.06)} style={{
            position: 'relative', flex: '0 1 22%', aspectRatio: '3 / 2', maxHeight: '23vmin',
            display: 'grid', placeItems: 'center', borderRadius: 12,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.22)',
            fontFamily: displayFont, fontSize: 'clamp(2rem, 4.6vmin, 4.8rem)', color: text,
          }}>
            {item.label}
            <span style={{
              position: 'absolute', top: '-1.4vmin', left: '-1.4vmin',
              display: 'grid', placeItems: 'center', width: '5vmin', height: '5vmin', minWidth: 40, minHeight: 40,
              borderRadius: '50%', background: 'rgba(0,0,0,0.78)', border: `2px solid ${SHINY_GOLD}88`,
              color: text, fontSize: 'clamp(1.3rem, 2.8vmin, 2.8rem)', lineHeight: 1,
              textShadow: `0 0 1vmin ${SHINY_GOLD_GLOW}55`,
            }}>
              {String.fromCharCode(65 + index)}
            </span>
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2vmin', width: 'min(100%, 1400px)' }}>
        {SAMPLE_ORDER_ANSWERS.map((answer, row) => {
          const scored = answer.points > 0
          return (
            <motion.div key={answer.note} {...enter(0.9 + row * 0.55, 10)} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', columnGap: '2vmin',
              padding: '1.3vmin 2.4vmin', borderRadius: 12, textAlign: 'left',
              background: scored ? `${SHINY_GOLD}24` : 'rgba(255,255,255,0.05)',
              outline: scored ? `2px solid ${SHINY_GOLD}aa` : 'none', outlineOffset: '-2px',
              fontSize: 'clamp(1.4rem, 2.9vmin, 3rem)', color: text,
            }}>
              <span aria-hidden="true" style={{ fontFamily: displayFont, fontSize: '1.4em', lineHeight: 1, color: scored ? SHINY_GOLD : `${text}c8` }}>
                {scored ? '✓' : '✗'}
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4em 1.1em', fontVariantNumeric: 'tabular-nums' }}>
                {answer.order.map((id, position) => {
                  const misplaced = id !== CORRECT[position]
                  return (
                    <span key={id} style={{ whiteSpace: 'nowrap', textDecoration: misplaced ? 'underline wavy' : 'none', textUnderlineOffset: '0.25em' }}>
                      <strong style={{ color: SHINY_GOLD }}>{position + 1}</strong> {letterOf(id)} {labelOf(id)}
                    </span>
                  )
                })}
              </span>
              <span style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontFamily: displayFont, fontSize: '1.3em', lineHeight: 1, color: scored ? SHINY_GOLD : `${text}c8` }}>
                  {scored ? 'Scores' : '0'}
                </span>
                <span style={{ fontSize: '0.75em', color: `${text}cc`, whiteSpace: 'nowrap' }}>{answer.note}</span>
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
