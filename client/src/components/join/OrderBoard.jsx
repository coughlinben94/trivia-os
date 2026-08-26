import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'
import { seededShuffle } from '../../lib/orderScoring.js'

// preview: true mounts this component read-only-ish for a host building the
// question (SlideEditor's live phone preview) — taps still animate locally so
// the host can see the interaction, but nothing is written to or read from
// Supabase, since there's no real team/slide behind a preview render. Same
// contract as MatchingBoard's own preview prop.
export default function OrderBoard({ slide, team, theme, preview = false, onAnswered }) {
  const { data } = slide
  const items = data.items ?? []
  const locked = !!data.orderLocked
  const text = theme?.colors?.text ?? '#ffffff'
  const highlight = theme?.colors?.highlight ?? '#f5c842'
  const [saveFailed, setSaveFailed] = useState(false)

  // answer: item ids in tap order (position = sequence number - 1) — the
  // exact shape scoreOrderSubmission compares against correctOrder. This is
  // the instant local state every tap updates; `committedAnswer` only
  // advances once submit() confirms the write landed — same split as
  // MatchingBoard's connections/committedConnections, and for the same
  // reason: onAnswered must gate on a CONFIRMED save, or a team that
  // finishes on dead wifi gets released from force-delivery with nothing
  // actually in phone_answers.
  const [answer, setAnswer] = useState([])
  const [committedAnswer, setCommittedAnswer] = useState([])
  const [saving, setSaving] = useState(false)

  // Passing correctOrder so the phone's shuffle re-roll decision matches
  // the display's exactly — same items + same seed + same correctOrder is
  // required for both to land on the identical visual order (see
  // orderScoring.js's seededShuffle comment for why the re-roll depends on
  // correctOrder).
  const shuffled = seededShuffle(items, slide.id ?? 'preview', data.correctOrder)
  const itemsKey = items.map(i => i.id).join(',')

  // Preview-only: if the host edits items (adds/removes one) while the live
  // preview is mounted, clear any in-progress taps rather than carrying an
  // answer that references an item id that no longer exists.
  useEffect(() => {
    if (!preview) return
    setAnswer([])
  }, [preview, itemsKey])

  // Chained rather than fired-and-forgotten so two rapid taps (tap, then a
  // quick undo) can't land out of order — same class of bug MatchingBoard's
  // saveChainRef guards against, applied here to phone_answers writes.
  const saveChainRef = useRef(Promise.resolve())

  const submit = useCallback((nextAnswer) => {
    if (preview) return Promise.resolve(true)
    const run = saveChainRef.current.then(async () => {
      const upsert = supabase.from('phone_answers').upsert(
        // submitted_at stamped explicitly on every save, same reasoning as
        // MatchingBoard's: Postgres upsert only touches columns it's given,
        // so without this the column's default-on-insert value would freeze
        // at the FIRST tap and never move on later taps/undos.
        { show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id, answer: nextAnswer, submitted_at: new Date().toISOString() },
        { onConflict: 'slide_id,team_id' }
      )
      // Raced against a timeout, not just awaited — a request that never
      // settles would otherwise wedge every save queued behind it in the
      // chain. The abandoned fetch may still resolve later; nothing awaits
      // it by then, which is fine — we've already moved on.
      let error
      try {
        ;({ error } = await Promise.race([
          upsert,
          new Promise((_, reject) => setTimeout(() => reject(new Error('order save timed out')), 8000)),
        ]))
      } catch (err) {
        error = err
      }
      if (error) console.error('[OrderBoard] answer save failed:', error)
      setSaveFailed(!!error)
      return !error
    })
    saveChainRef.current = run.catch(() => false)
    return run
  }, [preview, slide.id, slide.showId, team.id, team.showId])

  // Builds the order LOCALLY — nothing saves until Lock In (below) is
  // tapped. Was autosave-per-tap with no explicit submit button (2026-08-25,
  // Ben, live: "there is nothing on people's phones for them to lock in") —
  // switched to MatchingBoard's build-then-lock pattern for consistency.
  function tapItem(itemId) {
    if (locked) return
    if (answer.includes(itemId)) return // already numbered — only unnumbered images are tappable
    setAnswer([...answer, itemId])
  }

  // "⌫ Undo last" — stack-pop only, removes the highest-numbered item
  // (Global Constraints: deliberate simplicity, no arbitrary mid-sequence
  // removal).
  function undoLast() {
    if (locked || answer.length === 0) return
    setAnswer(answer.slice(0, -1))
  }

  const allPlaced = items.length > 0 && answer.length >= items.length
  // Compares built order, not reference equality — restoring the exact same
  // order from the DB on mount must read as "not dirty", same reasoning as
  // MatchingBoard's own dirty check.
  const dirty = JSON.stringify(answer) !== JSON.stringify(committedAnswer)
  const hasLockedOnce = committedAnswer.length > 0

  function lockIn() {
    if (locked || !allPlaced || !dirty || saving) return
    setSaving(true)
    submit(answer).then(ok => {
      setSaving(false)
      if (ok) setCommittedAnswer(answer)
    })
  }

  useEffect(() => {
    if (preview) return
    let cancelled = false
    supabase
      .from('phone_answers')
      .select('answer')
      .eq('slide_id', slide.id)
      .eq('team_id', team.id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (cancelled || !Array.isArray(row?.answer)) return
        // A restored row IS a confirmed write by definition — it came from
        // the DB, not a local guess — so both states advance together here.
        setAnswer(row.answer)
        setCommittedAnswer(row.answer)
      })
    return () => { cancelled = true }
  }, [preview, slide.id, team.id])

  // Reports "every item placed" upward so LiveView can release a team back
  // to free browsing once they've finished — same contract as
  // MatchingBoard/WagerBoard. Gated on committedAnswer, not the instant
  // answer state, for the same dead-wifi reason noted above.
  useEffect(() => {
    onAnswered?.(items.length > 0 && committedAnswer.length >= items.length)
  }, [onAnswered, committedAnswer, items.length])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 480, width: '100%', margin: '0 auto' }}>
      {/* The ordering criterion — "by when the state joined the Union" — is the
          whole question, and until 2026-08-25 it only existed on the TV: a
          player looking down at their phone for 20+ seconds had no way to see
          what they were ordering BY without looking back up. Same block
          WagerBoard renders for its own prompt, same type scale. */}
      {data.text && (
        <p style={{
          color: text, fontSize: 'clamp(1.15rem, 4.5vw, 1.35rem)',
          lineHeight: 1.55, margin: 0, fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
        }}>
          {data.text}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
        {shuffled.map((item, i) => {
          const position = answer.indexOf(item.id)
          return (
            <OrderTile
              key={item.id}
              image={item.url}
              label={String.fromCharCode(65 + i)}
              number={position >= 0 ? position + 1 : null}
              disabled={locked || position >= 0}
              onTap={() => tapItem(item.id)}
              textColor={text}
              highlight={highlight}
            />
          )
        })}
      </div>
      {!locked && (
        <button
          onClick={undoLast}
          disabled={answer.length === 0}
          onPointerDown={e => { if (answer.length > 0) e.currentTarget.style.transform = 'scale(0.97)' }}
          onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          style={{
            width: '100%', minHeight: 52, borderRadius: 14,
            border: `1px solid ${text}20`,
            background: 'transparent',
            color: answer.length > 0 ? text : `${text}40`,
            fontSize: '1rem', fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
            cursor: answer.length > 0 ? 'pointer' : 'default',
            WebkitTapHighlightColor: 'transparent',
            transition: 'transform 140ms cubic-bezier(0.23,1,0.32,1)',
          }}
        >
          ⌫ Undo last
        </button>
      )}
      {!locked && (
        <button
          onClick={lockIn}
          disabled={!allPlaced || !dirty || saving}
          onPointerDown={e => { if (allPlaced && dirty && !saving) e.currentTarget.style.transform = 'scale(0.97)' }}
          onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          style={{
            width: '100%', minHeight: 60, borderRadius: 14,
            border: allPlaced && dirty ? `2px solid ${highlight}` : `1px solid ${text}20`,
            background: allPlaced && dirty ? `${highlight}26` : 'transparent',
            color: allPlaced && dirty ? text : `${text}40`,
            fontSize: '1rem', fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
            cursor: allPlaced && dirty && !saving ? 'pointer' : 'default',
            WebkitTapHighlightColor: 'transparent',
            transition: 'transform 140ms cubic-bezier(0.23,1,0.32,1)',
          }}
        >
          {/* !allPlaced checked before hasLockedOnce/dirty (2026-08-26,
              Sonnet re-review): a team restored from an old partial
              phone_answers row (pre-Lock-In autosave-per-tap data) can have
              committedAnswer non-empty but short of items.length with
              nothing locally changed — hasLockedOnce true, dirty false —
              which read "Order Locked" here while the status line below
              correctly said "N of M placed", a self-contradicting screen.
              The button is already disabled via !allPlaced above; the label
              just needs to agree. */}
          {saving ? 'Saving…' : (!allPlaced || !hasLockedOnce) ? '🔒 Lock In My Order' : dirty ? 'Update My Order' : 'Order Locked'}
        </button>
      )}
      <p style={{ color: `${text}b3`, fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
        {locked
          ? 'Answers locked'
          : answer.length === 0
            ? 'Tap the images in order'
            : !allPlaced
              ? `${answer.length} of ${items.length} placed`
              : dirty
                ? 'Tap Lock In to submit'
                : 'Locked in — you can still change it until Ben locks answers'}
      </p>
      {saveFailed && !locked && (
        <p style={{ color: '#ff6b6b', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
          Couldn't save — check your connection and tap Lock In again
        </p>
      )}
    </div>
  )
}

// Order's items are always images (see the plan's data shape) — one tile
// shape only, unlike MatchTile's image/text branch.
//
// Always carries the A/B/C… letter badge (same spot ShinyOrderQuestion.jsx
// stamps on the TV — String.fromCharCode(65 + i)) so the room can talk about
// "B" out loud; once tapped, the badge swaps to the position number, mirroring
// ShinyOrderQuestion's own letter-then-number swap between its unrevealed and
// revealed beats (2026-08-25 review finding — this board used to show no
// letter at all, only a number after tapping).
function OrderTile({ image, label, number, disabled, onTap, textColor, highlight }) {
  return (
    <button
      onClick={onTap}
      disabled={disabled}
      style={{
        position: 'relative',
        width: 'calc(50% - 0.4rem)',
        minHeight: 96,
        padding: 6,
        borderRadius: 14,
        // Selection ring is an OUTLINE, not a thicker border (2026-08-25 design
        // critique). Growing the border 1px -> 4px grew the tile's footprint,
        // which reflowed the row below it and shoved the Undo button ~6px down
        // on EVERY tap — the single most-repeated interaction on this screen.
        // outline doesn't participate in layout, so the board now sits
        // perfectly still; offset -4 pulls the ring inside the tile's own edge
        // so it reads as the border thickening the way it looks like it should.
        border: '1px solid rgba(255,255,255,0.15)',
        outline: number != null ? `4px solid ${highlight}` : 'none',
        outlineOffset: -4,
        background: 'rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <img src={image} alt={label} style={{ maxWidth: '100%', maxHeight: 84, objectFit: 'contain' }} />
      <span style={{
        position: 'absolute', top: -8, left: -8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '1.8rem', height: '1.8rem', borderRadius: '50%',
        background: number != null ? highlight : 'rgba(0,0,0,0.6)',
        color: number != null ? '#1a1a1a' : textColor,
        fontSize: '1rem', fontWeight: 700,
        boxShadow: number != null ? '0 2px 8px rgba(0,0,0,0.4)' : 'none',
      }}>
        {number != null ? number : label}
      </span>
    </button>
  )
}
