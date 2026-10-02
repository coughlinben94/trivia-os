// client/src/components/display/slides/BendleRevealList.jsx
// Every team's Bendle guess on the TV after the host's A on step 3. Drawn
// from bendleResults on the step-3 slide (already sorted: points, then
// teams with a guess, then name). One column up to 10 teams, then two; text
// 2.2vmin (two columns) / 2.8vmin (one column) before fitting. Names and
// guesses wrap instead of being cut. One column shares its tracks across rows
// (subgrid) so the name column fits the longest name, capped at 30%.
//
// Fit to the stage: the list gets the height left under the heading and answer
// line (a flex item that may shrink) and is scaled (transform only, origin top
// center, never above 1) to fit it. Two columns try, in order:
//   a. 3-line cells as they are;  b. 3-line cells scaled, if scale >= 0.8;
//   c. 2-line cells scaled, if scale >= 0.8;  d. 2-line cells at 0.8 (the list
//   then runs past the stage edge instead of the text shrinking further).
// 0.8 keeps two-column text >= 1.76vmin. One column has 2-line cells and only
// scales, floor 0.7 (2.8vmin -> 1.96vmin). The decision re-runs from the
// 3-line tier on every resize of the room or the list, so a short-lived
// squeeze (e.g. a loading line) never locks in the 2-line tier.
import { useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { guessLabel } from '../../../lib/bendleGuessScoring.js'

const ONE_COLUMN_MAX = 10
const NAME_COLUMN = 'fit-content(30%)'
export const TWO_COLUMN_FLOOR = 0.8
export const ONE_COLUMN_FLOOR = 0.7

// One column: scale only.
export function fitScale(avail, natural, floor = ONE_COLUMN_FLOOR) {
  if (!avail || !natural || natural <= avail) return 1
  return Math.max(floor, avail / natural)
}

// The room the list may use: the parent column's inner height minus its other
// in-flow children and gaps. Measured from the parent, not from this flex item,
// because the item is only as tall as the list when the list fits, and that
// would hide spare room (the old 2-line latch).
export function roomFor(outer) {
  const parent = outer.parentElement
  if (!parent) return outer.clientHeight
  const cs = getComputedStyle(parent)
  let room = parent.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
  let inFlow = 0
  for (const child of parent.children) {
    const c = getComputedStyle(child)
    if (c.position === 'absolute' || c.position === 'fixed' || c.display === 'none') continue
    inFlow += 1
    if (child !== outer) room -= child.offsetHeight
  }
  return room - (parseFloat(cs.rowGap) || 0) * Math.max(0, inFlow - 1)
}

// Two columns: the tier from the room and the natural heights measured so far
// for 3-line and 2-line cells. A missing height means "render that tier and
// measure it" (the caller re-runs once it has the number).
export function fitTier({ avail, natural3, natural2 }) {
  if (!avail || !natural3) return { lines: 3, scale: 1 }
  const s3 = avail / natural3
  if (s3 >= 1) return { lines: 3, scale: 1 }
  if (s3 >= TWO_COLUMN_FLOOR) return { lines: 3, scale: s3 }
  if (!natural2) return { lines: 2, scale: 1 }
  return { lines: 2, scale: fitScale(avail, natural2, TWO_COLUMN_FLOOR) }
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
  const outerRef = useRef(null)
  const contentRef = useRef(null)
  const [fit, setFit] = useState({ lines: 3, scale: 1 })
  const lines = twoCol ? fit.lines : 2
  const scale = fit.scale
  const linesRef = useRef(lines)
  linesRef.current = lines
  // Natural (unscaled) height per line tier, valid for one team count and width.
  const naturals = useRef({ key: '' })
  // Same pattern as ShinyExampleFrame's useFitScale: measure, then transform.
  useLayoutEffect(() => {
    const outer = outerRef.current
    const content = contentRef.current
    if (!outer || !content || typeof ResizeObserver === 'undefined') return undefined
    let dead = false
    const recompute = () => {
      if (dead) return
      const key = `${rows.length}|${outer.clientWidth}`
      if (naturals.current.key !== key) naturals.current = { key }
      naturals.current[linesRef.current] = content.offsetHeight // transform does not change it
      const avail = roomFor(outer)
      const next = twoCol
        ? fitTier({ avail, natural3: naturals.current[3], natural2: naturals.current[2] })
        : { lines: 2, scale: fitScale(avail, naturals.current[2]) }
      setFit(f => (f.lines === next.lines && f.scale === next.scale ? f : next))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(content)
    // The stage and its other lines (heading, answer, a status line) set the room.
    const parent = outer.parentElement
    if (parent) { ro.observe(parent); for (const child of parent.children) if (child !== outer) ro.observe(child) }
    else ro.observe(outer)
    // Web fonts change every height: forget them and decide again from 3 lines.
    document.fonts?.ready?.then(() => { naturals.current = { key: '' }; recompute() })
    return () => { dead = true; ro.disconnect() }
  }, [rows.length, twoCol, lines])
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
