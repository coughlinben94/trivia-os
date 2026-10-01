import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { fitToBox, SHINY_CHOICE_Q_BOX } from '../../../lib/autoFitText.js'
import { dropOptions, dropSequence, survivorShifts } from '../../../lib/dropScoring.js'
import { AnswersLockedBadge } from '../LockCountdownOverlay.jsx'
import ShinySignal from '../ShinySignal.jsx'

// The TV side of The Drop. Four tiles pop in; teams split their points over
// them on their phones. Once Ben locks, each Next press drops one WRONG tile
// off the screen (data.dropStep, stepped by slideStepping.js) until only the
// correct tile is left standing and lights up.
//
// Only aggregates ever show here — how many teams have submitted, and at the
// end how many went all-in (data.dropResults, written by LiveMode at scoring
// time). /display is anonymous and phone_answers is private, so this never
// reads or displays any one team's split.
export default function ShinyDropQuestion({ slide, show, theme }) {
  const { data } = slide
  const options = useMemo(() => dropOptions(data), [data])
  const locked = !!data.dropLocked
  const revealed = !!data.dropRevealed
  const step = locked ? (data.dropStep ?? 0) : 0
  const droppedIds = useMemo(() => dropSequence(data).slice(0, step), [data, step])
  const reduce = useReducedMotion()

  // Survivors close up into a centred row. The shift is in tile pitches; the
  // pitch (tile width + gap) is measured off the live row so it stays right at
  // any TV size, and 0 until measured, so nothing moves before it is known.
  const rowRef = useRef(null)
  const [pitch, setPitch] = useState(0)
  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    const measure = () => {
      const [a, b] = row.children
      if (a && b) setPitch(b.offsetLeft - a.offsetLeft)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined // jsdom
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    return () => ro.disconnect()
  }, [options.length])
  const shifts = useMemo(
    () => survivorShifts(options.map(o => droppedIds.includes(o.id))),
    [options, droppedIds]
  )

  const [submittedCount, setSubmittedCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)

  // Polled aggregate, same as ShinyChoiceQuestion: phone_answers' SELECT never
  // opens to the anonymous TV, phone_answers_count is the narrow RPC for this.
  useEffect(() => {
    if (locked) return
    let cancelled = false
    async function load() {
      const { data: count } = await supabase.rpc('phone_answers_count', { p_slide_id: slide.id })
      if (!cancelled) setSubmittedCount(count ?? 0)
    }
    load()
    const interval = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [slide.id, locked])

  useEffect(() => {
    if (!show?.id || locked) return
    let cancelled = false
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('show_id', show.id)
      .then(({ count }) => { if (!cancelled) setTeamCount(count ?? 0) })
    return () => { cancelled = true }
  }, [show?.id, locked])

  const results = data.dropResults
  // What the whole room put on each tile — aggregate only, shown from the lock
  // on so the room sees where everyone went before the tiles start to fall.
  const roomTotals = locked ? results?.totals : null
  const noAnswerSet = locked && !options.some(o => o.id === data.correctId)

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col items-center justify-center gap-8 px-12 py-12" style={{ background: theme.colors.shinyBg }}>
      <ShinySignal />
      <QuestionText text={data.text} theme={theme} />
      <div ref={rowRef} style={{
        display: 'flex', gap: '1.6vw', width: '100%', maxWidth: 1500,
        flex: '1 1 0', minHeight: 0, alignItems: 'stretch', justifyContent: 'center',
      }}>
        {options.map((opt, i) => (
          <DropTile
            key={opt.id}
            opt={opt}
            letter={String.fromCharCode(65 + i)}
            index={i}
            dropped={droppedIds.includes(opt.id)}
            roomTotal={roomTotals?.[opt.id]}
            shiftPx={shifts[i] * pitch}
            winner={revealed && opt.id === data.correctId}
            theme={theme}
            reduce={reduce}
          />
        ))}
      </div>
      <StatusSlot theme={theme}>
        {noAnswerSet
          ? <span style={{ opacity: 0.7 }}>No correct tile was set for this question</span>
          : !locked
            ? <CountLine n={submittedCount} total={teamCount} />
            : !revealed
              ? <AnswersLockedBadge theme={theme} />
              : <AllInLine results={results} />}
      </StatusSlot>
    </div>
  )
}

// Same measure-to-fit question text as ShinyChoiceQuestion.
function QuestionText({ text, theme }) {
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)) }, [])
  const size = useMemo(
    () => fitToBox(text ?? '', { ...SHINY_CHOICE_Q_BOX, family: theme.fonts.display }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, theme.fonts.display, fontsReady]
  )
  if (!text) return null
  return (
    <div style={{ width: '100%', maxWidth: SHINY_CHOICE_Q_BOX.boxW, height: SHINY_CHOICE_Q_BOX.boxH, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{
        margin: 0, textAlign: 'center',
        fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
        fontSize: `${size}px`, lineHeight: 1.15, color: theme.colors.text,
      }}>
        {text}
      </p>
    </div>
  )
}

// Fixed-height slot so the count line / locked badge / all-in line never
// shift the tiles when they swap.
function StatusSlot({ theme, children }) {
  return (
    <div style={{
      minHeight: '3.4rem', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: `${theme.colors.text}d9`,
      fontSize: 'clamp(1.6rem, 2vw, 2.3rem)',
      fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
    }}>
      {children}
    </div>
  )
}

function CountLine({ n, total }) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {total > 0 ? `${n} of ${total} teams placed their points` : `${n} team${n === 1 ? '' : 's'} placed their points`}
    </motion.span>
  )
}

function AllInLine({ results }) {
  if (!results) return null
  const { allIn = 0 } = results
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.5 }}
      style={{ color: SHINY_GOLD, textShadow: `0 0 18px ${SHINY_GOLD_GLOW}66` }}
    >
      {allIn === 0 ? 'Nobody went all-in' : allIn === 1 ? '1 team went all-in' : `${allIn} teams went all-in`}
    </motion.span>
  )
}

// Two layers on purpose. The OUTER motion.div owns the one-time pop-in (a
// spring, staggered by tile index). The INNER plain div owns the drop with a
// CSS transition on transform + opacity only: it runs on the compositor, and
// a quick Prev/Next retargets mid-fall instead of restarting. A dropped tile
// keeps its slot (it falls, it doesn't collapse), so the survivors never
// shift sideways.
function DropTile({ opt, letter, index, dropped, roomTotal, shiftPx, winner, theme, reduce }) {
  const tilt = index % 2 === 0 ? -5 : 5
  return (
    <motion.div
      initial={{ opacity: 0, scale: reduce ? 1 : 0.92, y: reduce ? 0 : 28 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={reduce
        ? { duration: 0.25, delay: index * 0.05 }
        : { type: 'spring', duration: 0.55, bounce: 0.22, delay: index * 0.12 }}
      style={{ flex: '1 1 0', minWidth: 0, maxWidth: 400, display: 'flex' }}
    >
      <div style={{
        display: 'flex', width: '100%',
        // Survivors slide to the middle AFTER the fall has started clearing
        // the row (450ms lead). Under reduced motion they just re-centre, no travel.
        transform: shiftPx ? `translateX(${shiftPx}px)` : 'none',
        transition: reduce ? 'none' : 'transform 650ms cubic-bezier(0.23, 1, 0.32, 1) 450ms',
      }}>
      <div style={{
        position: 'relative', width: '100%',
        transform: dropped ? (reduce ? 'none' : `translateY(70vh) rotate(${tilt}deg)`) : 'none',
        opacity: dropped ? 0 : 1,
        transition: reduce
          ? 'opacity 300ms ease'
          : 'transform 760ms cubic-bezier(0.55, 0, 1, 0.45), opacity 760ms ease-in',
        pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 18, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.4rem',
          background: winner ? `${SHINY_GOLD}26` : 'rgba(255,255,255,0.07)',
          border: winner ? `4px solid ${SHINY_GOLD}` : '1px solid rgba(255,255,255,0.16)',
          boxShadow: winner ? `0 0 60px ${SHINY_GOLD_GLOW}88, 0 8px 28px rgba(0,0,0,0.45)` : '0 8px 28px rgba(0,0,0,0.45)',
          transition: 'background 500ms ease, border-color 500ms ease, box-shadow 500ms ease',
        }}>
          {opt.image
            ? <img src={opt.image} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : (
              <span style={{
                textAlign: 'center', color: theme.colors.text, lineHeight: 1.15,
                fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
                fontSize: 'clamp(1.8rem, 3.2vw, 3.6rem)', wordBreak: 'break-word',
              }}>
                {opt.label}
              </span>
            )}
        </div>
        {roomTotal != null && (
          <span style={{
            position: 'absolute', left: '50%', bottom: '1.1rem', zIndex: 2,
            transform: 'translateX(-50%)', whiteSpace: 'nowrap',
            padding: '0.35rem 1.1rem', borderRadius: 999,
            background: winner ? SHINY_GOLD : 'rgba(0,0,0,0.6)',
            color: winner ? '#1a1a1a' : `${theme.colors.text}e6`,
            fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`, fontWeight: 700,
            fontSize: 'clamp(1.2rem, 1.9vw, 2.2rem)', fontVariantNumeric: 'tabular-nums',
            border: winner ? 'none' : `1px solid ${SHINY_GOLD}55`,
          }}>
            {roomTotal} pts
          </span>
        )}
        <span style={{
          position: 'absolute', top: '-1rem', left: '-1rem', zIndex: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '4rem', height: '4rem', borderRadius: '50%',
          background: winner ? SHINY_GOLD : 'rgba(0,0,0,0.72)',
          color: winner ? '#1a1a1a' : theme.colors.text,
          fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
          fontSize: '2.2rem', fontWeight: 700, lineHeight: 1,
          border: winner ? 'none' : `2px solid ${SHINY_GOLD}55`,
          transition: 'background 400ms ease',
        }}>
          {winner ? '✓' : letter}
        </span>
      </div>
      </div>
    </motion.div>
  )
}
