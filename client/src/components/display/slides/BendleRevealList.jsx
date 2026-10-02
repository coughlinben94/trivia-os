// client/src/components/display/slides/BendleRevealList.jsx
// Every team's Bendle guess on the TV after the host's A on step 3. Drawn
// from bendleResults on the step-3 slide (already sorted: points, then
// teams with a guess, then name). One column up to 10 teams, then two; text
// never below 2.2vmin (~16px at 1280x720) before fitting. Names and guesses
// wrap instead of being cut: 2 lines, or 3 in two columns with at most 8 rows
// per column. One column shares its tracks across rows (subgrid) so the name
// column fits the longest name, capped at 30%.
//
// Fit to the stage: the list gets the height left under the heading and answer
// line (a flex item that may shrink). When its natural height is taller, it
// first drops the 3-line cells to 2 lines (two columns), then scales down
// (transform only, origin top center, never above 1, floor 0.7). Worst cases
// at 720p with ~420px left: 10 teams all 2-line ~543px -> 0.77; 20 teams all
// 2-line ~435px -> 0.97; 16 teams 3-line ~510px -> 2-line ~350px, no scale.
// The floor is reached at ~600px natural (~27 teams all 2-line at 720p);
// past that the list overflows the stage.
import { useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { guessLabel } from '../../../lib/bendleGuessScoring.js'

const ONE_COLUMN_MAX = 10
const NAME_COLUMN = 'fit-content(30%)'
const THREE_LINE_MAX_ROWS = 8
export const MIN_FIT_SCALE = 0.7

// One fit decision from the measured sizes: as is, else tighten (once), else scale.
export function fitStep({ avail, natural, tight, canTighten }) {
  if (!avail || !natural || natural <= avail) return { tight, scale: 1 }
  if (!tight && canTighten) return { tight: true, scale: 1 }
  return { tight, scale: Math.max(MIN_FIT_SCALE, avail / natural) }
}

const wrap = lines => ({ overflow: 'hidden', whiteSpace: 'normal', overflowWrap: 'anywhere', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines })

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
  const canTighten = twoCol && perCol <= THREE_LINE_MAX_ROWS
  const outerRef = useRef(null)
  const contentRef = useRef(null)
  // tight is per team count: a new count starts from 3-line cells again.
  const [fit, setFit] = useState({ count: rows.length, tight: false, scale: 1 })
  const tight = fit.count === rows.length && fit.tight
  const scale = fit.count === rows.length ? fit.scale : 1
  const tightRef = useRef(tight)
  tightRef.current = tight
  // Same pattern as ShinyExampleFrame's useFitScale: measure, then transform.
  useLayoutEffect(() => {
    const outer = outerRef.current
    const content = contentRef.current
    if (!outer || !content || typeof ResizeObserver === 'undefined') return undefined
    let dead = false
    const recompute = () => {
      if (dead) return
      const next = fitStep({ avail: outer.clientHeight, natural: content.offsetHeight, tight: tightRef.current, canTighten })
      setFit(f => (f.count === rows.length && f.tight === next.tight && f.scale === next.scale ? f : { count: rows.length, ...next }))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(outer)
    ro.observe(content)
    document.fonts?.ready?.then(recompute)
    return () => { dead = true; ro.disconnect() }
  }, [rows.length, canTighten, tight])
  const lines = canTighten && !tight ? 3 : 2
  const stepCol = rows.some(r => r.overridden) ? '6.5em' : '4.2em'
  return (
    // Flex item of the slide's column: may shrink (minHeight 0) to the space left.
    <div ref={outerRef} data-fit="outer" style={{ width: '100%', minHeight: 0, flex: '0 1 auto', display: 'flex', flexDirection: 'column' }}>
    <div ref={contentRef} data-fit="content" data-scale={String(scale)}
      style={{ width: '100%', display: 'flex', justifyContent: 'center', transform: `scale(${scale})`, transformOrigin: 'top center' }}>
    <div
      role="list"
      aria-label="Every team's guess"
      data-columns={twoCol ? 2 : 1}
      data-name-column={twoCol ? undefined : NAME_COLUMN}
      data-step-column={stepCol}
      style={{
        width: 'min(100%, 1700px)', display: 'grid',
        ...(twoCol
          ? { gridAutoFlow: 'column', gridTemplateRows: `repeat(${perCol}, auto)`, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: '3vmin' }
          : { gridTemplateColumns: `1.4em ${NAME_COLUMN} minmax(0, 1fr) ${stepCol} 2.6em`, columnGap: '1.2vmin' }),
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
                ? { gridTemplateColumns: `1.4em minmax(0, 1fr) minmax(0, 1.5fr) ${stepCol} 2.6em`, columnGap: '1.2vmin' }
                : { gridColumn: '1 / -1', gridTemplateColumns: 'subgrid' }),
            }}
          >
            <span aria-hidden="true" style={{ color: scored ? SHINY_GOLD : `${text}b3` }}><BendleMark right={scored} /></span>
            <span data-lines={lines} style={{ fontWeight: 700, ...wrap(lines) }}>{r.teamName}</span>
            <span data-lines={lines} style={{ ...wrap(lines), fontStyle: r.guess ? 'normal' : 'italic' }}>{label}</span>
            <span style={{ whiteSpace: 'nowrap', ...(scored ? { opacity: 0.8 } : null) }}>
              {r.guess && r.stepIndex != null ? `Step ${r.stepIndex + 1}` : ''}
              {r.overridden && <span style={{ display: 'inline', marginLeft: '0.3em' }}>(host)</span>}
            </span>
            <span style={{ color: scored ? SHINY_GOLD : `${text}b3`, fontWeight: 700, textAlign: 'right' }}>{scored ? `+${r.points}` : '0'}</span>
          </motion.div>
        )
      })}
    </div>
    </div>
    </div>
  )
}
