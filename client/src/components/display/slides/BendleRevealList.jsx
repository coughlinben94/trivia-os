// client/src/components/display/slides/BendleRevealList.jsx
// Every team's Bendle guess on the TV after the host's A on step 3. Drawn
// from bendleResults on the step-3 slide (already sorted: points, then
// teams with a guess, then name). One column up to 10 teams, then two; text
// never below 2.2vmin (~16px at 1280x720).
import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { guessLabel } from '../../../lib/bendleGuessScoring.js'

const ONE_COLUMN_MAX = 10

export default function BendleRevealList({ results, theme }) {
  const reduce = useReducedMotion()
  const rows = Array.isArray(results) ? results : []
  const twoCol = rows.length > ONE_COLUMN_MAX
  const perCol = Math.max(twoCol ? Math.ceil(rows.length / 2) : rows.length, 1)
  const text = theme?.colors?.text ?? '#ffffff'
  const bodyFont = `'${theme?.fonts?.body ?? 'DM Sans'}', 'DM Sans', sans-serif`
  return (
    <div
      role="list"
      aria-label="Every team's guess"
      data-columns={twoCol ? 2 : 1}
      style={{
        width: 'min(100%, 1700px)', display: 'grid', gridAutoFlow: 'column',
        gridTemplateRows: `repeat(${perCol}, auto)`,
        gridTemplateColumns: twoCol ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
        columnGap: '3vmin', rowGap: '0.6vmin',
        fontFamily: bodyFont, fontSize: twoCol ? '2.2vmin' : '2.8vmin',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.25,
      }}
    >
      {rows.map((r, i) => {
        const scored = r.points > 0
        const label = guessLabel(r.guess)
        return (
          <motion.div
            role="listitem"
            key={r.teamId}
            data-correct={scored ? 'true' : 'false'}
            aria-label={`${r.teamName}: ${label}, ${r.points} points`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: reduce ? 0 : Math.min(i * 0.04, 0.6), ease: EASE_OUT }}
            style={{
              display: 'grid', gridTemplateColumns: '1.4em minmax(0, 1fr) minmax(0, 1.5fr) 4.2em 2.6em',
              alignItems: 'baseline', columnGap: '1.2vmin', color: scored ? text : `${text}b3`,
            }}
          >
            <span aria-hidden="true" style={{ color: scored ? SHINY_GOLD : `${text}80` }}>{scored ? '✓' : '✗'}</span>
            <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: r.guess ? 'normal' : 'italic' }}>{label}</span>
            <span style={{ opacity: 0.8 }}>{r.guess && r.stepIndex != null ? `Step ${r.stepIndex + 1}` : ''}</span>
            <span style={{ color: scored ? SHINY_GOLD : `${text}80`, fontWeight: 700, textAlign: 'right' }}>{scored ? `+${r.points}` : '0'}</span>
          </motion.div>
        )
      })}
    </div>
  )
}
