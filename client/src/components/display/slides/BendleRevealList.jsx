// client/src/components/display/slides/BendleRevealList.jsx
// Every team's Bendle guess on the TV after the host's A on step 3. Drawn
// from bendleResults on the step-3 slide (already sorted: points, then
// teams with a guess, then name). One column up to 10 teams, then two; text
// never below 2.2vmin (~16px at 1280x720). In two columns a name or guess may
// wrap to a second line instead of being cut (20 teams still fit at 720p).
// One column shares its tracks across rows (subgrid) so the name column fits
// the longest name, capped at 40%.
import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { guessLabel } from '../../../lib/bendleGuessScoring.js'

const ONE_COLUMN_MAX = 10
const NAME_COLUMN = 'fit-content(40%)'

const cut = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const wrap2 = { overflow: 'hidden', whiteSpace: 'normal', overflowWrap: 'anywhere', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }

// Drawn, not a font glyph: DM Sans has no ✓, so the browser fell back to √.
// Decorative: the row or line around it carries the meaning in words.
export function BendleMark({ right }) {
  return (
    <svg aria-hidden="true" focusable="false" data-mark={right ? 'right' : 'wrong'} viewBox="0 0 16 16" width="0.9em" height="0.9em" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-0.08em' }}>
      {right ? <path d="M2.5 8.5l3.5 3.5 7.5-8" /> : <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />}
    </svg>
  )
}

export default function BendleRevealList({ results, theme }) {
  const reduce = useReducedMotion()
  const rows = Array.isArray(results) ? results : []
  const twoCol = rows.length > ONE_COLUMN_MAX
  const perCol = Math.max(twoCol ? Math.ceil(rows.length / 2) : rows.length, 1)
  const text = theme?.colors?.text ?? '#ffffff'
  const bodyFont = `'${theme?.fonts?.body ?? 'DM Sans'}', 'DM Sans', sans-serif`
  const cell = twoCol ? wrap2 : cut
  return (
    <div
      role="list"
      aria-label="Every team's guess"
      data-columns={twoCol ? 2 : 1}
      data-name-column={twoCol ? undefined : NAME_COLUMN}
      style={{
        width: 'min(100%, 1700px)', display: 'grid',
        ...(twoCol
          ? { gridAutoFlow: 'column', gridTemplateRows: `repeat(${perCol}, auto)`, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: '3vmin' }
          : { gridTemplateColumns: `1.4em ${NAME_COLUMN} minmax(0, 1fr) 4.2em 2.6em`, columnGap: '1.2vmin' }),
        rowGap: '0.6vmin',
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
            aria-label={`${r.teamName}: ${label}, ${r.points} points${r.overridden ? ', changed by the host' : ''}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: reduce ? 0 : Math.min(i * 0.04, 0.6), ease: EASE_OUT }}
            style={{
              display: 'grid', alignItems: 'baseline', color: scored ? text : `${text}b3`,
              ...(twoCol
                ? { gridTemplateColumns: '1.4em minmax(0, 1fr) minmax(0, 1.5fr) 4.2em 2.6em', columnGap: '1.2vmin' }
                : { gridColumn: '1 / -1', gridTemplateColumns: 'subgrid' }),
            }}
          >
            <span aria-hidden="true" style={{ color: scored ? SHINY_GOLD : `${text}b3` }}><BendleMark right={scored} /></span>
            <span style={{ fontWeight: 700, ...cell }}>{r.teamName}</span>
            <span style={{ ...cell, fontStyle: r.guess ? 'normal' : 'italic' }}>{label}</span>
            <span style={scored ? { opacity: 0.8 } : undefined}>
              {r.guess && r.stepIndex != null ? `Step ${r.stepIndex + 1}` : ''}
              {r.overridden && <span style={{ display: 'block' }}>(host)</span>}
            </span>
            <span style={{ color: scored ? SHINY_GOLD : `${text}b3`, fontWeight: 700, textAlign: 'right' }}>{scored ? `+${r.points}` : '0'}</span>
          </motion.div>
        )
      })}
    </div>
  )
}
