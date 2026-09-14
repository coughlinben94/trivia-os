import { useState, useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { getHuesCuesGrid, getHuesCuesCell, HUES_CUES_COLS, HUES_CUES_ROWS } from '../../../lib/huesCuesGrid.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { EASE_OUT, EASE_DROP } from '../../../lib/easings.js'
import { useFitToBox, WAGER_Q_FLOOR, WAGER_Q_CEIL } from '../../../lib/autoFitText.js'
import { AnswersLockedBadge } from '../LockCountdownOverlay.jsx'

// The TV side of Hues and Cues. Mirrors ShinyWagerQuestion's beat structure
// (waiting -> locked -> reveal), minus wager's separate blind-tier phase —
// hues-cues has one guess, no tiers, so the clue + grid are up from the
// first frame:
//   1. Waiting  — clue + full color grid, teams guessing on their phones.
//   2. Locked   — held after "lock guesses" until the host presses A to reveal.
//   3. Reveal   — the answer code, then its swatch, then who was close.
export default function ShinyHuesCuesQuestion({ slide, show, theme }) {
  const { data } = slide
  const locked = !!data.huesCuesLocked
  const revealed = !!data.huesCuesRevealed
  const shouldReduceMotion = useReducedMotion()
  const grid = getHuesCuesGrid()

  const [submittedCount, setSubmittedCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)

  // Polled, not realtime — same reasoning ShinyChoiceQuestion/ShinyWagerQuestion
  // document: /display is anonymous, phone_answers' SELECT policy never opens
  // to it, so phone_answers_count(slide_id) is the generic SECURITY DEFINER
  // count every phone-scored mechanic reuses.
  useEffect(() => {
    if (locked || revealed) return
    let cancelled = false
    async function load() {
      const { data: count } = await supabase.rpc('phone_answers_count', { p_slide_id: slide.id })
      if (!cancelled) setSubmittedCount(count ?? 0)
    }
    load()
    const interval = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [slide.id, locked, revealed])

  useEffect(() => {
    if (!show?.id || revealed) return
    let cancelled = false
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('show_id', show.id)
      .then(({ count }) => { if (!cancelled) setTeamCount(count ?? 0) })
    return () => { cancelled = true }
  }, [show?.id, revealed])

  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`

  if (revealed) {
    return <HuesCuesReveal data={data} theme={theme} shouldReduceMotion={shouldReduceMotion} />
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '2rem 3rem', gap: '1.25rem', overflow: 'hidden',
    }}>
      <ClueText text={data.text} theme={theme} displayFont={displayFont} />

      {/* flex:1 + minHeight:0 lets the grid claim whatever vertical room the
          clue/status rows leave, and the aspect-ratio (matching the real
          16-col x 15-row shape) keeps it from stretching taller than its
          own width would allow — a fixed maxWidth alone (the brief's
          original approach) sized the grid at 900x844 regardless of
          available height and clipped off the bottom rows. */}
      <div style={{ flex: '1 1 auto', minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${HUES_CUES_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${HUES_CUES_ROWS}, 1fr)`,
          gap: 2,
          height: '100%', maxHeight: '100%',
          aspectRatio: `${HUES_CUES_COLS} / ${HUES_CUES_ROWS}`,
          maxWidth: '100%',
        }}>
          {grid.map(cell => (
            <div key={cell.code} style={{ background: cell.hex, borderRadius: 2 }} />
          ))}
        </div>
      </div>

      {locked ? (
        <AnswersLockedBadge theme={theme} />
      ) : (
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE_OUT }}
          style={{ margin: 0, color: `${theme.colors.text}70`, fontSize: '1.35rem', fontFamily: bodyFont, flexShrink: 0 }}
        >
          {teamCount > 0 ? `${submittedCount} of ${teamCount} teams guessed` : `${submittedCount} team${submittedCount === 1 ? '' : 's'} guessed`}
        </motion.p>
      )}
    </div>
  )
}

// Same measure-to-fit pattern ShinyChoiceQuestion/ShinyWagerQuestion's own
// QuestionText use: a fixed-box ref div (useFitToBox measures the REF's own
// clientWidth/Height, not the text node's — the brief's version put the ref
// directly on the <p>, which has no fixed box to measure against and would
// have fed the hook a moving target) sized to a real on-screen region, with
// floor/ceil in px (the *_FLOOR/*_CEIL constants are rem — every other call
// site multiplies by 16, the brief's own bare WAGER_Q_FLOOR/CEIL would have
// asked for an unreadable ~2px floor). family is the bare font name, not
// the quoted fallback-stack string — fitToBox builds its own `"${family}"`
// canvas font string internally.
function ClueText({ text, theme, displayFont }) {
  const boxRef = useRef(null)
  const size = useFitToBox(boxRef, text ?? '', {
    family: theme.fonts.display,
    floorPx: WAGER_Q_FLOOR * 16,
    ceilPx: WAGER_Q_CEIL * 16,
    maxLines: 3,
    lineHeight: 1.15,
  })
  if (!text) return null
  return (
    <div ref={boxRef} style={{ width: '100%', maxWidth: 1300, height: '22vh', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ margin: 0, textAlign: 'center', fontFamily: displayFont, fontSize: `${size}px`, lineHeight: 1.15, color: theme.colors.text }}>
        {text}
      </p>
    </div>
  )
}

// The payoff: the code lands first, the color swatch beneath it (per Ben's
// explicit call — flash the code, then the color, not dots-only), then each
// team's guess and how close it landed, cascading in the order the host
// would read them out loud. Structurally the same beat sequence as
// ShinyWagerQuestion's reveal (EASE_DROP land, staggered EASE_OUT rows).
function HuesCuesReveal({ data, theme, shouldReduceMotion }) {
  const results = data.huesCuesResults ?? []
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const twoCol = results.length > 8
  const answerCell = getHuesCuesCell(data.answer)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '3rem 4rem', gap: '1.75rem',
    }}>
      {data.text && (
        <p style={{ margin: 0, textAlign: 'center', maxWidth: 1200, fontFamily: bodyFont, fontSize: '1.4rem', lineHeight: 1.35, color: `${text}80` }}>
          {data.text}
        </p>
      )}

      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.94)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        transition={{ duration: 0.32, ease: EASE_DROP }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
      >
        <span style={{ fontFamily: bodyFont, fontSize: '1.15rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: `${text}60` }}>
          The answer
        </span>
        <span style={{ fontFamily: displayFont, fontSize: '6rem', lineHeight: 1, color: SHINY_GOLD, textShadow: `0 0 30px ${SHINY_GOLD_GLOW}77` }}>
          {data.answer ?? '—'}
        </span>
        <div style={{
          width: 80, height: 80, borderRadius: 12,
          background: answerCell?.hex ?? 'transparent',
          border: `2px solid ${SHINY_GOLD}66`,
        }} />
      </motion.div>

      {results.length === 0 ? (
        <p style={{ margin: 0, color: `${text}60`, fontFamily: bodyFont, fontSize: '1.3rem' }}>
          No answers were submitted.
        </p>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: twoCol ? '1fr 1fr' : '1fr', gap: '0.5rem 2.5rem',
          width: '100%', maxWidth: twoCol ? 1600 : 1000,
        }}>
          {results.map((r, i) => {
            const cell = r.guess ? getHuesCuesCell(r.guess) : null
            return (
              <motion.div
                key={`${r.teamName}-${i}`}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                transition={{ duration: 0.26, delay: 0.4 + i * 0.06, ease: EASE_OUT }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.65rem 1.1rem', borderRadius: 12,
                  background: r.points > 0 ? `${SHINY_GOLD}1f` : 'rgba(255,255,255,0.04)',
                  border: r.points > 0 ? `1px solid ${SHINY_GOLD}66` : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: cell?.hex ?? 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: displayFont, fontSize: '1.9rem', color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.teamName}
                </span>
                <span style={{ fontFamily: bodyFont, fontSize: '1.25rem', color: `${text}75`, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {r.guess ?? '—'}
                </span>
                <span style={{ minWidth: '4.5rem', textAlign: 'right', flexShrink: 0, fontFamily: displayFont, fontSize: '2rem', color: r.points > 0 ? SHINY_GOLD : `${text}40` }}>
                  {r.points > 0 ? `+${r.points}` : '0'}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
