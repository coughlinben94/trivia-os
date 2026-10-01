import { motion, useReducedMotion } from 'framer-motion'
import { scoreMatchingSubmission } from '../../../lib/matchingScoring.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

// First four of MatchingBoard.jsx's PALETTE (not exported there): the colors a
// phone paints a matched pair, each AA against the dark #1a1a1a label.
const PAIR_COLORS = ['#ff5c5c', '#3aa0e0', '#e0a020', '#a97ae0']
const MATCHED_TEXT = '#1a1a1a'

// Synthetic pairs. A correct match is the same id on both sides, exactly what
// the real scorer checks (leftId === rightId).
const LEFT = { dog: 'Dog', cow: 'Cow', cat: 'Cat', duck: 'Duck' }
const RIGHT = { dog: 'Woof', cow: 'Moo', cat: 'Meow', duck: 'Quack' }

// One sample team answer: two right, two swapped. Points per pair are
// host-set per slide, so the card shows "Scores" vs 0, never a number.
// pointsPerMatch 1 makes each row's score a plain correct/not flag.
export const SAMPLE_MATCH_ANSWER = [
  { leftId: 'dog', rightId: 'dog' },
  { leftId: 'cow', rightId: 'cow' },
  { leftId: 'cat', rightId: 'duck' },
  { leftId: 'duck', rightId: 'cat' },
].map(pair => ({ ...pair, scored: scoreMatchingSubmission([pair], 1) > 0 }))

export const SAMPLE_CORRECT_PAIRS = scoreMatchingSubmission(SAMPLE_MATCH_ANSWER, 1)

export default function MatchingExplainer() {
  const reduce = useReducedMotion()
  const { theme } = useTheme()
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const enter = (delay, from = 'translateY(14px)') => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, transform: from },
    animate: reduce ? { opacity: 1 } : { opacity: 1, transform: 'translate(0px, 0px)' },
    transition: { duration: 0.3, delay: reduce ? 0 : delay, ease: EASE_OUT },
  })

  const tile = color => ({
    padding: '1.3vmin 2.4vmin', borderRadius: 12, minWidth: 0,
    background: color, color: MATCHED_TEXT,
    fontFamily: displayFont, fontSize: 'clamp(1.8rem, 3.9vmin, 4rem)', lineHeight: 1.05,
  })

  return (
    <div
      role="img"
      aria-label={`Example matching answer: ${SAMPLE_CORRECT_PAIRS} correct pairs score; the 2 swapped pairs score 0.`}
      style={{
        width: 'min(100%, 1300px)', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', gap: '1.4vmin',
      }}
    >
      {SAMPLE_MATCH_ANSWER.map((pair, row) => {
        const base = 0.15 + row * 0.07
        const verdictAt = 1.1 + row * 0.07
        return (
          <div key={pair.leftId} style={{
            display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', alignItems: 'center', columnGap: '2vmin',
          }}>
            <motion.div {...enter(base)} style={tile(PAIR_COLORS[row])}>{LEFT[pair.leftId]}</motion.div>
            <motion.span {...enter(base + 0.25, 'translateX(-12px)')} aria-hidden="true" style={{
              fontSize: 'clamp(1.6rem, 3.4vmin, 3.4rem)', color: `${text}cc`, lineHeight: 1,
            }}>
              ↔
            </motion.span>
            <motion.div {...enter(base + 0.25, 'translateX(-24px)')} style={tile(PAIR_COLORS[row])}>{RIGHT[pair.rightId]}</motion.div>
            <motion.div {...enter(verdictAt, 'scale(0.96)')} style={{
              display: 'flex', alignItems: 'center', gap: '0.5em', width: '6em',
              padding: '0.9vmin 1.6vmin', borderRadius: 12,
              background: pair.scored ? `${SHINY_GOLD}24` : 'rgba(255,255,255,0.05)',
              outline: pair.scored ? `2px solid ${SHINY_GOLD}aa` : 'none', outlineOffset: '-2px',
              fontFamily: displayFont, fontSize: 'clamp(1.6rem, 3.4vmin, 3.4rem)', lineHeight: 1,
              color: pair.scored ? SHINY_GOLD : `${text}c8`,
            }}>
              <span aria-hidden="true">{pair.scored ? '✓' : '✗'}</span>
              {pair.scored ? 'Scores' : '0'}
            </motion.div>
          </div>
        )
      })}
    </div>
  )
}
