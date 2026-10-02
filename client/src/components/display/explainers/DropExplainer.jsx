import { motion, useReducedMotion } from 'framer-motion'
import { DEFAULT_DROP_TOTAL, dropSequence, scoreDropSubmission } from '../../../lib/dropScoring.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

// Synthetic question and split. The pool is host-set per slide; the example
// uses the default so the numbers add up on screen.
const QUESTION = 'Which planet is the biggest?'
const OPTIONS = [
  { id: 'saturn', label: 'Saturn' },
  { id: 'jupiter', label: 'Jupiter' },
  { id: 'neptune', label: 'Neptune' },
  { id: 'earth', label: 'Earth' },
]
const CORRECT = 'jupiter'
const TOTAL = DEFAULT_DROP_TOTAL
const SPLIT = { saturn: 10, jupiter: 15, neptune: 0, earth: 0 }
const IDS = OPTIONS.map(o => o.id)

// Scored by the real scorer; wrong tiles fall in the real (unseeded) order.
export const SAMPLE_DROP = {
  total: TOTAL,
  split: SPLIT,
  correct: OPTIONS.find(o => o.id === CORRECT),
  points: scoreDropSubmission(SPLIT, CORRECT, IDS, TOTAL),
  lost: OPTIONS.filter(o => o.id !== CORRECT && SPLIT[o.id] > 0),
  dropOrder: dropSequence({ options: OPTIONS, correctId: CORRECT }),
}

// Dropped tiles dim to this. Measured over the card's shinyBg backdrop on all
// 21 themes (worst: halloween): option label 5.24:1, letter badge 5.59:1, gold
// points 5.34:1, "0" (large, text d9) 4.10:1. "pts" is small text at 720p, so
// it uses full text color: 5.24:1, over the 4.5:1 bar (at text d0 it was
// 3.86:1). 0.45 measured 2.08:1.
const DIMMED = 0.65
const DROP_START = 1.3
const DROP_GAP = 0.55
const REVEAL = DROP_START + SAMPLE_DROP.dropOrder.length * DROP_GAP + 0.2

const lostText = SAMPLE_DROP.lost.map(o => `${SPLIT[o.id]} on ${o.label}`).join(' and ')
export const SAMPLE_DROP_RESULT = `${SAMPLE_DROP.correct.label} was right: keep ${SAMPLE_DROP.points}. The ${lostText} are lost.`

export default function DropExplainer() {
  const reduce = useReducedMotion()
  const { theme } = useTheme()
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const enter = (delay, y = 14) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, transform: `translateY(${y}px)` },
    animate: reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' },
    transition: { duration: 0.3, delay: reduce ? 0 : delay, ease: EASE_OUT },
  })
  // Reveal steps stay in sequence under reduced motion (they carry meaning);
  // only the travel is removed.
  const fadeIn = delay => ({
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3, delay, ease: EASE_OUT },
  })

  return (
    <div
      role="img"
      aria-label={`Example: ${QUESTION} A team split ${TOTAL} points: ${OPTIONS.map(o => `${SPLIT[o.id]} on ${o.label}`).join(', ')}. ${SAMPLE_DROP_RESULT}`}
      style={{
        width: 'min(100%, max(1500px, 139vmin))', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '2.4vmin', fontVariantNumeric: 'tabular-nums',
      }}
    >
      <motion.div {...enter(0.1)} style={{ display: 'flex', alignItems: 'baseline', gap: '2.4vmin', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ fontFamily: displayFont, fontSize: 'max(2rem, 3.4vmin)', lineHeight: 1.1, color: text }}>{QUESTION}</span>
        <span style={{ fontSize: 'max(1.3rem, 2.5vmin)', color: `${text}d9` }}>{TOTAL} points to split</span>
      </motion.div>

      <div style={{ display: 'flex', gap: '3vmin', width: '100%', justifyContent: 'center' }}>
        {OPTIONS.map((opt, i) => {
          const dropIndex = SAMPLE_DROP.dropOrder.indexOf(opt.id)
          const dropped = dropIndex >= 0
          const winner = opt.id === CORRECT
          const tilt = i % 2 === 0 ? -2.5 : 2.5
          return (
            <motion.div key={opt.id} {...enter(0.25 + i * 0.06, 18)} style={{ flex: '1 1 0', maxWidth: 'max(330px, 30.5vmin)', minWidth: 0 }}>
              <motion.div
                initial={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px) rotate(0deg)' }}
                animate={dropped
                  ? (reduce ? { opacity: DIMMED } : { opacity: DIMMED, transform: `translateY(24px) rotate(${tilt}deg)` })
                  : (reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px) rotate(0deg)' })}
                transition={{ duration: 0.5, delay: dropped ? DROP_START + dropIndex * DROP_GAP : 0, ease: EASE_OUT }}
                style={{
                  position: 'relative', height: '28vmin', borderRadius: 16,
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1vmin',
                }}
              >
                {winner && (
                  <motion.div {...fadeIn(REVEAL)} aria-hidden style={{
                    position: 'absolute', inset: 0, borderRadius: 16,
                    background: `${SHINY_GOLD}26`, outline: `4px solid ${SHINY_GOLD}`, outlineOffset: '-4px',
                    boxShadow: `0 0 5vmin ${SHINY_GOLD_GLOW}66`,
                  }} />
                )}
                <span style={{
                  position: 'absolute', top: '-1.6vmin', left: '-1.6vmin', width: '5.4vmin', height: '5.4vmin',
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.72)', border: `2px solid ${SHINY_GOLD}66`,
                  fontFamily: displayFont, fontSize: 'max(1.5rem, 3vmin)', lineHeight: 1, color: text,
                }}>
                  {String.fromCharCode(65 + i)}
                  {winner && (
                    <motion.span {...fadeIn(REVEAL)} aria-hidden style={{
                      position: 'absolute', inset: 0, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', background: SHINY_GOLD, color: '#1a1a1a',
                    }}>
                      ✓
                    </motion.span>
                  )}
                </span>
                <span style={{ position: 'relative', fontFamily: displayFont, fontSize: 'max(1.9rem, 3.4vmin)', lineHeight: 1.05, color: text }}>
                  {opt.label}
                </span>
                <span style={{
                  position: 'relative', fontFamily: displayFont, fontSize: 'max(2.4rem, 5vmin)', lineHeight: 1,
                  color: SPLIT[opt.id] > 0 ? SHINY_GOLD : `${text}d9`,
                }}>
                  {SPLIT[opt.id]}
                  <span style={{ fontSize: '0.45em', marginLeft: '0.3em', color: text }}>pts</span>
                </span>
              </motion.div>
            </motion.div>
          )
        })}
      </div>

      <motion.p {...fadeIn(reduce ? REVEAL : REVEAL + 0.25)} style={{
        margin: '1vmin 0 0', fontSize: 'max(1.4rem, 2.8vmin)', color: text, textWrap: 'balance',
      }}>
        {SAMPLE_DROP_RESULT}
      </motion.p>
    </div>
  )
}
