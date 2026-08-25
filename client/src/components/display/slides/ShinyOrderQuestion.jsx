import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { EASE_PANEL, EASE_OUT } from '../../../lib/easings.js'
import { seededShuffle } from '../../../lib/orderScoring.js'
import { AnswersLockedBadge } from '../LockCountdownOverlay.jsx'

// The TV side of an Order Up question. Same two-beat pan mechanic as
// ShinyMatchingQuestion.jsx (see that file's own comment for the
// pixel-exact -50% pan rationale): a 200%-tall track holding both beats
// stacked, panning by exactly one stage-height lands pixel-exact on beat 2
// regardless of actual stage size. Beat 1 is the shuffled row teams see
// while submitting; the host's A key flips data.orderRevealed, panning up to beat 2
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
    // rendered pre-lock (the locked branch below swaps it for the held
    // "Answers locked" badge), so polling past that point just burns a
    // request every 2s for a number nothing displays (2026-08-25 review
    // finding).
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
        <div className="w-full flex flex-col items-center gap-8 px-12 py-12" style={{ height: '50%' }}>
          <QuestionText text={data.text} theme={theme} />
          <OrderRow items={shuffled} theme={theme} revealed={false} />
          {/* Locked-and-waiting is a real held state now (2026-08-25, reveal
              moved to the host's A key), not the ~1s gap before scoring
              landed that the old "Locked — scoring…" line described. The
              shared badge says so and keeps breathing while the host talks —
              and it says the same thing the countdown ceremony's own last
              frame said, in the same mark. Gated on !revealed too, matching
              ShinyMatchingQuestion's guard — beat 1 stays mounted after the
              pan to beat 2, so without it the badge kept running its
              breathing animation panned off-screen for the rest of the
              slide (2026-08-25 review). */}
          <StatusSlot theme={theme}>
            {!locked
              ? <CountLine n={submittedCount} total={teamCount} />
              : !revealed ? <AnswersLockedBadge theme={theme} /> : null}
          </StatusSlot>
        </div>

        {/* Beat 2 — correct sequence, revealed by the pan */}
        <div className="w-full flex flex-col items-center gap-8 px-12 py-12" style={{ height: '50%' }}>
          <QuestionText text={data.text} theme={theme} />
          <OrderRow items={revealedItems} theme={theme} revealed />
          {/* Empty, but PRESENT (2026-08-25 design critique). Beat 1 has a
              status line and beat 2 doesn't; simply omitting it here left the
              two beats with a different number of children, so the shared
              justify-content re-centered the stack and the headline — which is
              identical in both beats and should sit perfectly still — jumped
              36px mid-pan. A reserved empty slot of the same height keeps both
              beats structurally identical, which is exactly why
              ShinyMatchingQuestion (two beats, same children) never had this. */}
          <StatusSlot theme={theme} />
        </div>
      </motion.div>
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

// The fixed-height band under the row that holds whichever status line this
// beat has — or nothing, in beat 2. Fixed height is the point: see the beat-2
// comment above for why an omitted status line jumped the headline mid-pan.
//
// Typography lives here, not on the children, so the live count and the
// locked-badge swap can't drift apart. Both were badly under-scaled for
// a TV before (2026-08-25 design critique measured 21.6px at ~3.1:1 and 19.2px
// at 27% alpha — unreadable from across a bar); `d9` alpha over a near-black
// shinyBg clears 10:1, comfortably past the 3:1 large-text floor
// contrast.js/ThemeProvider.jsx enforce on textMuted.
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

// A single row of image tiles — Order's items are always images (see the
// plan's data shape), so unlike MatchColumn there's no text-tile branch to
// carry. Unrevealed tiles get a letter badge (A/B/C…, so teams and the room
// can talk about "B" without needing to point); revealed tiles swap that
// for the same gold rank badge Matching's own revealed image tiles use.
function OrderRow({ items, theme, revealed }) {
  return (
    // flex:1/minHeight:0 inside the beat's full-height column, and no fixed
    // caps (2026-08-25 design critique): tiles were pinned at maxWidth 320 in a
    // row capped at 1500px, so the whole question filled ~78% of the TV's width
    // and ~37% of its height, with big dead bands above and below. Mirrors
    // ShinyMatchingQuestion's columns, which genuinely fill the stage for the
    // same reason. Tiles are still bounded by their 3:2 shape — maxHeight:100%
    // on the tile keeps a short row (2-3 items) from growing taller than the
    // band it has — so growing the row never crops or stretches art.
    <div style={{
      display: 'flex', gap: '1.5vw', width: '100%',
      flex: '1 1 0', minHeight: 0, alignItems: 'center', justifyContent: 'center',
    }}>
      {items.map((item, i) => (
        <div key={item.id} style={{
          display: 'flex', flex: '1 1 0', minWidth: 0, height: '100%',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Unclipped shape wrapper: owns the tile's 3:2 box and carries the
              badge, so the badge can hang off the corner (see below) while the
              image frame inside it still clips its own rounded corners. */}
          <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 2', maxHeight: '100%' }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden',
              boxShadow: '0 6px 22px rgba(0,0,0,0.45)', background: 'rgba(255,255,255,0.06)', padding: '0.6rem',
              border: revealed ? `2px solid ${SHINY_GOLD}88` : '1px solid rgba(255,255,255,0.12)',
            }}>
              <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            {/* Badge lives on the UNCLIPPED wrapper, not the rounded/clipped
                frame above — sitting it inside that frame at top:-8/left:-8
                clipped the badge under its own rounded corner (2026-08-25
                review finding; more visible here than on Matching's equivalent
                since Order shows this badge on every tile in both beats, not
                only on reveal).

                Sized for a TV, not a monitor (2026-08-25 design critique): the
                glyph measured 16px in a 28.8px badge, which is illegible from
                across a bar — and this badge's whole job is letting the room
                say "B" out loud without pointing. Display font too, so it
                matches the headline instead of falling back to the UI stack. */}
            <span style={{
              position: 'absolute', top: '-1rem', left: '-1rem', zIndex: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '4rem', height: '4rem', borderRadius: '50%',
              background: revealed ? SHINY_GOLD : 'rgba(0,0,0,0.72)',
              color: revealed ? '#1a1a1a' : theme.colors.text,
              fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
              fontSize: '2.2rem', fontWeight: 700, lineHeight: 1,
              border: revealed ? 'none' : `2px solid ${SHINY_GOLD}55`,
              boxShadow: revealed ? `0 2px 8px rgba(0,0,0,0.4)` : 'none',
              textShadow: revealed ? 'none' : `0 0 10px ${SHINY_GOLD_GLOW}55`,
            }}>
              {revealed ? i + 1 : String.fromCharCode(65 + i)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
