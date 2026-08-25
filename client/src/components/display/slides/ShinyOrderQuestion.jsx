import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { EASE_PANEL, EASE_OUT } from '../../../lib/easings.js'
import { seededShuffle } from '../../../lib/orderScoring.js'

// The TV side of an Order Up question. Same two-beat pan mechanic as
// ShinyMatchingQuestion.jsx (see that file's own comment for the
// pixel-exact -50% pan rationale): a 200%-tall track holding both beats
// stacked, panning by exactly one stage-height lands pixel-exact on beat 2
// regardless of actual stage size. Beat 1 is the shuffled row teams see
// while submitting; scoring flips data.orderRevealed, panning up to beat 2
// (correct sequence, gold rank badges). Order has one row of images, not
// Matching's two paired columns, so the row/tile layout below is new, but
// the pan/reveal skeleton is copied straight from Matching.
export default function ShinyOrderQuestion({ slide, show, theme }) {
  const { data } = slide
  const items = data.items ?? []
  const correctOrder = data.correctOrder ?? []
  const locked = !!data.orderLocked
  const revealed = !!data.orderRevealed
  const reduce = useReducedMotion()

  const shuffled = seededShuffle(items, slide.id ?? 'preview', correctOrder)
  // correctOrder is the answer key (item ids in the right sequence); fall
  // back to items as-authored if it's missing/malformed so a bad slide
  // still renders something instead of an empty reveal row.
  const revealedItems = correctOrder.length
    ? correctOrder.map(id => items.find(i => i.id === id)).filter(Boolean)
    : items

  const [submittedCount, setSubmittedCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)

  // Polled aggregate, not a postgres_changes subscription — /display is a
  // fully anonymous browser (never goes through the host PIN gate) and
  // phone_answers' SELECT policy only opens to the owning team or a
  // host-verified session, so Realtime would never deliver a change event
  // here (same reasoning as ShinyWagerQuestion's own counts). Unlike
  // Wager, this doesn't need a bespoke RPC — phone_answers_count(slide_id)
  // is already a generic SECURITY DEFINER count, provisioned back in
  // 20260817171310_lock_down_phone_answers_select.sql for exactly this
  // ("a submitted-count (ShinyMatchingQuestion.jsx)") but never actually
  // wired up until now.
  useEffect(() => {
    // Stops on `locked`, not just `revealed` — the live count is only ever
    // rendered pre-lock (the locked branch below swaps it for "Locked —
    // scoring…"), so polling past that point just burns a request every 2s
    // for a number nothing displays (2026-08-25 review finding).
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

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.colors.shinyBg }}>
      <motion.div
        className="absolute left-0 right-0 top-0"
        style={{ height: '200%' }}
        animate={{ y: revealed ? '-50%' : '0%' }}
        transition={{ duration: reduce ? 0 : 0.85, ease: EASE_PANEL }}
      >
        {/* Beat 1 — shuffled, unrevealed */}
        <div className="w-full flex flex-col items-center justify-center gap-10 px-24" style={{ height: '50%' }}>
          <QuestionText text={data.text} theme={theme} />
          <OrderRow items={shuffled} theme={theme} revealed={false} />
          {/* Barely-visible transitional state (2026-08-25): Order has no
              extra locked-only visual, same as Matching — locking just
              stops the count from climbing further. Swap the live count
              for a "scoring" line once locked, same text-swap
              ShinyWagerQuestion's guessesLocked branch already uses. */}
          {!locked ? (
            <CountLine n={submittedCount} total={teamCount} theme={theme} />
          ) : (
            <p style={{ margin: 0, color: `${theme.colors.text}45`, fontSize: '1.2rem', fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif` }}>
              Locked — scoring…
            </p>
          )}
        </div>

        {/* Beat 2 — correct sequence, revealed by the pan */}
        <div className="w-full flex flex-col items-center justify-center gap-10 px-24" style={{ height: '50%' }}>
          <QuestionText text={data.text} theme={theme} />
          <OrderRow items={revealedItems} theme={theme} revealed />
        </div>
      </motion.div>
    </div>
  )
}

function QuestionText({ text, theme }) {
  if (!text) return null
  return (
    <p style={{
      margin: 0, textAlign: 'center', maxWidth: 1300,
      fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
      fontSize: 'clamp(1.8rem, 3.2vw, 3.2rem)', lineHeight: 1.15, color: theme.colors.text,
    }}>
      {text}
    </p>
  )
}

function CountLine({ n, total, theme }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      style={{ margin: 0, color: `${theme.colors.text}70`, fontSize: '1.35rem', fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif` }}
    >
      {total > 0 ? `${n} of ${total} teams submitted` : `${n} team${n === 1 ? '' : 's'} submitted`}
    </motion.p>
  )
}

// A single row of image tiles — Order's items are always images (see the
// plan's data shape), so unlike MatchColumn there's no text-tile branch to
// carry. Unrevealed tiles get a letter badge (A/B/C…, so teams and the room
// can talk about "B" without needing to point); revealed tiles swap that
// for the same gold rank badge Matching's own revealed image tiles use.
function OrderRow({ items, theme, revealed }) {
  return (
    <div style={{ display: 'flex', gap: '1.5vw', width: '100%', maxWidth: 1500, justifyContent: 'center' }}>
      {items.map((item, i) => (
        <div key={item.id} style={{ position: 'relative', flex: '1 1 0', minWidth: 0, maxWidth: 320 }}>
          <div style={{
            position: 'relative', width: '100%', aspectRatio: '3 / 2', borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 6px 22px rgba(0,0,0,0.45)', background: 'rgba(255,255,255,0.06)', padding: '0.6rem',
            border: revealed ? `2px solid ${SHINY_GOLD}88` : '1px solid rgba(255,255,255,0.12)',
          }}>
            <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          {/* Badge lives on the OUTER wrapper (no overflow:hidden), not the
              rounded/clipped inner frame above — sitting it inside that inner
              div at top:-8/left:-8 clipped the badge under its own rounded
              corner (2026-08-25 review finding; more visible here than on
              Matching's equivalent since Order shows this badge on every tile
              in both beats, not only on reveal). */}
          <span style={{
            position: 'absolute', top: -8, left: -8, zIndex: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '1.8rem', height: '1.8rem', borderRadius: '50%',
            background: revealed ? SHINY_GOLD : 'rgba(0,0,0,0.6)',
            color: revealed ? '#1a1a1a' : theme.colors.text,
            fontSize: '1rem', fontWeight: 700,
            boxShadow: revealed ? `0 2px 8px rgba(0,0,0,0.4)` : 'none',
            textShadow: revealed ? 'none' : `0 0 10px ${SHINY_GOLD_GLOW}55`,
          }}>
            {revealed ? i + 1 : String.fromCharCode(65 + i)}
          </span>
        </div>
      ))}
    </div>
  )
}
