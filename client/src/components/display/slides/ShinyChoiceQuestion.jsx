import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { AnswersLockedBadge } from '../LockCountdownOverlay.jsx'

// The TV side of a Choice question — Mandela Effect (single-select images)
// and Mixology 101 (multi-select ingredient chips) are both this one
// component. Each option renders as an image tile or a text chip based on
// ITS OWN opt.image (not a slide-wide switch) — Mixology is always text,
// Mandela Effect is always images in practice, but a slide that mixes the
// two no longer forces every option into one mode (2026-09-06 critique: a
// slide-wide `isImage` branch rendered broken-image icons for any text
// option once a single image was present). Unlike Order/Matching, there's no
// pan-to-beat-2: the tiles never move, revealing correctness re-styles the
// SAME tiles in place (gold ring on correct, dimmed on wrong), now with a
// staggered transition instead of an instant swap so the reveal reads as a
// beat, not a re-render.
export default function ShinyChoiceQuestion({ slide, show, theme }) {
  const { data } = slide
  // Same blank-option filter as ChoiceBoard.jsx (phone) — a host-authored
  // option with neither text nor a photo has nothing to show the room.
  const options = (data.options ?? []).filter(o => o.label?.trim() || o.image)
  const correctIds = data.correctIds ?? []
  const locked = !!data.choiceLocked
  const revealed = !!data.choiceRevealed
  const reduce = useReducedMotion()

  const [submittedCount, setSubmittedCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)

  // Polled aggregate — same reasoning as ShinyOrderQuestion's identical
  // effect: /display is anonymous, phone_answers' SELECT policy never opens
  // to it via Realtime, and phone_answers_count(slide_id) is already the
  // generic SECURITY DEFINER count every phone-scored mechanic reuses.
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

  // A revealed slide with no correct answer recorded (host never checked an
  // option — see ChoiceBuilder's own amber warning for the authoring-side
  // half of this fix) must say so, not just dim every tile uniformly — that
  // read as a broken reveal rather than an unset one (2026-09-06 critique).
  const noAnswerSet = revealed && correctIds.length === 0

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col items-center justify-center gap-8 px-12 py-12" style={{ background: theme.colors.shinyBg }}>
      <QuestionText text={data.text} theme={theme} />
      <ChoiceRow options={options} correctIds={correctIds} revealed={revealed} theme={theme} reduce={reduce} />
      <StatusSlot theme={theme}>
        {noAnswerSet
          ? <span style={{ opacity: 0.7 }}>No correct answer was set for this question</span>
          : !locked
            ? <CountLine n={submittedCount} total={teamCount} />
            : !revealed ? <AnswersLockedBadge theme={theme} /> : null}
      </StatusSlot>
    </div>
  )
}

function QuestionText({ text, theme }) {
  if (!text) return null
  return (
    <p style={{
      margin: 0, textAlign: 'center', maxWidth: 1300, flexShrink: 0,
      fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
      fontSize: 'clamp(1.8rem, 3.2vw, 3.2rem)', lineHeight: 1.15, color: theme.colors.text,
    }}>
      {text}
    </p>
  )
}

// Same fixed-height reserved slot as ShinyOrderQuestion's StatusSlot — keeps
// the count line / locked badge from shifting anything else when it
// disappears on reveal.
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
      {total > 0 ? `${n} of ${total} teams submitted` : `${n} team${n === 1 ? '' : 's'} submitted`}
    </motion.span>
  )
}

// One wrapping row for every option — image tiles (Mandela Effect, letter-
// badged so the room can say "B" out loud) and text chips (Mixology 101)
// side by side, dispatched per-option on opt.image rather than a slide-wide
// switch. Letters are assigned over the WHOLE row in order, image or chip,
// so a badge always matches the same option the phone shows under that
// letter (ChoiceBoard.jsx assigns letters the same way, over the same
// blank-filtered list).
//
// Reveal is staggered (each tile's gold/dim transition delayed by its index)
// instead of an instant style swap — a held beat instead of a re-render,
// same reasoning as Order/Matching's pan but achieved with a transition
// delay since these tiles never move. Skipped under reduced motion: every
// tile settles at once with a plain opacity/color fade.
function ChoiceRow({ options, correctIds, revealed, theme, reduce }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '1.5vw', width: '100%', maxWidth: 1400,
      flex: '1 1 0', minHeight: 0, alignItems: 'center', justifyContent: 'center',
    }}>
      {options.map((opt, i) => {
        const isCorrect = correctIds.includes(opt.id)
        const delayMs = reduce ? 0 : i * 120
        return opt.image
          ? (
            <ChoiceImageTile
              key={opt.id} opt={opt} letter={String.fromCharCode(65 + i)}
              isCorrect={isCorrect} revealed={revealed} theme={theme} delayMs={delayMs}
            />
          )
          : (
            <ChoiceChip
              key={opt.id} opt={opt}
              isCorrect={isCorrect} revealed={revealed} theme={theme} delayMs={delayMs}
            />
          )
      })}
    </div>
  )
}

function ChoiceImageTile({ opt, letter, isCorrect, revealed, theme, delayMs }) {
  const lit = revealed && isCorrect
  return (
    <div style={{ display: 'flex', flex: '1 1 0', minWidth: 240, height: '100%', maxWidth: 480, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 2', maxHeight: '100%' }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 6px 22px rgba(0,0,0,0.45)', background: 'rgba(255,255,255,0.06)', padding: '0.6rem',
          border: lit ? `2px solid ${SHINY_GOLD}88` : '1px solid rgba(255,255,255,0.12)',
          opacity: revealed && !isCorrect ? 0.4 : 1,
          transition: 'opacity 400ms ease, border-color 400ms ease',
          transitionDelay: `${delayMs}ms`,
        }}>
          <img src={opt.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <span style={{
          position: 'absolute', top: '-1rem', left: '-1rem', zIndex: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '4rem', height: '4rem', borderRadius: '50%',
          background: lit ? SHINY_GOLD : 'rgba(0,0,0,0.72)',
          color: lit ? '#1a1a1a' : theme.colors.text,
          fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
          fontSize: '2.2rem', fontWeight: 700, lineHeight: 1,
          border: lit ? 'none' : `2px solid ${SHINY_GOLD}55`,
          boxShadow: lit ? `0 2px 8px rgba(0,0,0,0.4)` : 'none',
          textShadow: lit ? 'none' : `0 0 10px ${SHINY_GOLD_GLOW}55`,
          transition: 'background 400ms ease, box-shadow 400ms ease',
          transitionDelay: `${delayMs}ms`,
        }}>
          {lit ? '✓' : letter}
        </span>
      </div>
    </div>
  )
}

function ChoiceChip({ opt, isCorrect, revealed, theme, delayMs }) {
  const lit = revealed && isCorrect
  return (
    <span style={{
      padding: '0.9rem 1.6rem', borderRadius: 999,
      fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
      fontSize: 'clamp(1.1rem, 1.8vw, 1.6rem)', fontWeight: 600,
      color: theme.colors.text,
      background: lit ? `${SHINY_GOLD}26` : 'rgba(255,255,255,0.06)',
      border: lit ? `2px solid ${SHINY_GOLD}` : '1px solid rgba(255,255,255,0.15)',
      opacity: revealed && !isCorrect ? 0.4 : 1,
      transition: 'opacity 400ms ease, background 400ms ease, border-color 400ms ease',
      transitionDelay: `${delayMs}ms`,
    }}>
      {lit ? '✓ ' : ''}{opt.label}
    </span>
  )
}
