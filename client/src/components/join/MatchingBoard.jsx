import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { seededShuffle, buildMatchAnswer } from '../../lib/matchingScoring.js'

// A matched tile paints the whole button and switches its label to #1a1a1a,
// so every entry here has to clear AA against that near-black, not against
// the dark page behind it. The original Baynes red (#e02020, ~3.8:1) and
// purple (#8050c0, ~2.4:1) both failed that; these lightened versions read
// ~5.7:1 and ~5.4:1. The other four were already 4.7:1+ and are untouched.
const PALETTE = ['#ff5c5c', '#3aa0e0', '#e0a020', '#a97ae0', '#20a060', '#e05090']

// preview: true mounts this component read-only-ish for a host building the
// question (SlideEditor's live phone preview) — taps still animate locally so
// the host can see the interaction, but nothing is written to or read from
// Supabase, since there's no real team/slide behind a preview render. See
// docs/superpowers/plans/2026-07-28-phone-answer-scoring-implementation.md.
export default function MatchingBoard({ slide, team, theme, preview = false, onAnswered }) {
  const { data } = slide
  const pairs = data.pairs ?? []
  const locked = !!data.matchingLocked
  const text = theme?.colors?.text ?? '#ffffff'
  const highlight = theme?.colors?.highlight ?? '#f5c842'
  const [saving, setSaving] = useState(false)

  // connections: { [`${side}:${itemId}`]: colorIndex } — side-tagged because
  // left and right items share the same id space (pairs.map(p => p.id) is
  // identical for both columns), so an untagged key can't tell "left p0" from
  // "right p0" apart and a wrong match collapses into a same-id correct one.
  // A completed pair exists once a left key and a right key share a colorIndex.
  const [connections, setConnections] = useState({})
  // `connections` is the instant tap for visual feedback; `committedConnections`
  // only advances once submit() confirms the write landed — same split as
  // WagerBoard's tier/committedTier, and for the same reason: onAnswered must
  // gate on a CONFIRMED save, or a team that finishes on dead wifi gets
  // released from force-delivery with nothing actually in phone_answers.
  const [committedConnections, setCommittedConnections] = useState({})
  const [pendingSide, setPendingSide] = useState(null) // { side: 'left'|'right', itemId } — first tap of a pair, waiting for the second
  const [saveFailed, setSaveFailed] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  // Same quick 🔒 pop as WagerBoard's Lock In Guess — fires from the explicit
  // Lock Your Answers button below, not automatically (2026-08-18, Ben:
  // taps should only build/preview the match; nothing saves until the team
  // reviews it and locks it in themselves).
  const [showLockPop, setShowLockPop] = useState(false)
  const lockPopTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(lockPopTimerRef.current), [])

  const rightOrder = seededShuffle(pairs, slide.id ?? 'preview')
  const pairIdsKey = pairs.map(p => p.id).join(',')

  // Preview-only: if the host edits pairs (adds/removes one) while the live
  // preview is mounted, clear any in-progress taps rather than carrying
  // connections that reference a pair id that no longer exists.
  useEffect(() => {
    if (!preview) return
    setConnections({})
    setPendingSide(null)
  }, [preview, pairIdsKey])

  // Chained rather than fired-and-forgotten so two rapid taps (match, then a
  // quick untap) can't land out of order — same class of bug WagerBoard's
  // saveChainRef guards against, applied here to phone_answers writes.
  const saveChainRef = useRef(Promise.resolve())

  const submit = useCallback((nextConnections) => {
    if (preview) return Promise.resolve(true)
    const answer = buildMatchAnswer(nextConnections)
    const run = saveChainRef.current.then(async () => {
      const upsert = supabase.from('phone_answers').upsert(
        { show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id, answer },
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
          new Promise((_, reject) => setTimeout(() => reject(new Error('matching save timed out')), 8000)),
        ]))
      } catch (err) {
        error = err
      }
      if (error) console.error('[MatchingBoard] answer save failed:', error)
      setSaveFailed(!!error)
      return !error
    })
    saveChainRef.current = run.catch(() => false)
    return run
  }, [preview, slide.id, slide.showId, team.id, team.showId])

  // Purely local — builds/edits the match on screen. Nothing saves to
  // phone_answers until the team taps Lock Your Answers below (2026-08-18,
  // Ben: taps should let them look the matching over first, not auto-submit
  // on every pair).
  function tapItem(side, itemId) {
    if (locked) return
    const key = `${side}:${itemId}`
    const usedColors = new Set(Object.values(connections))
    const nextColor = PALETTE.findIndex((_, i) => !usedColors.has(i))

    // Already colored — tapping it again undoes that pair (both halves clear).
    if (connections[key] != null) {
      const color = connections[key]
      const next = { ...connections }
      Object.keys(next).forEach(k => { if (next[k] === color) delete next[k] })
      setConnections(next)
      return
    }
    if (!pendingSide) {
      setPendingSide({ side, itemId })
      return
    }
    if (pendingSide.side === side) {
      // Tapped same-side twice — switch the pending item instead of pairing with itself.
      setPendingSide({ side, itemId })
      return
    }
    if (nextColor === -1) return // no colors left (shouldn't happen — palette matches pair count)
    const next = { ...connections, [`${pendingSide.side}:${pendingSide.itemId}`]: nextColor, [key]: nextColor }
    setConnections(next)
    setPendingSide(null)
  }

  const allMatched = pairs.length > 0 && buildMatchAnswer(connections).length >= pairs.length
  // Compares the built pairs, not raw color-index equality — an undo/redo
  // can land the same pairing on a different palette index and shouldn't
  // read as "changed" when it isn't.
  const dirty = JSON.stringify(buildMatchAnswer(connections)) !== JSON.stringify(buildMatchAnswer(committedConnections))
  const hasLockedOnce = Object.keys(committedConnections).length > 0

  function lockAnswers() {
    if (locked || !allMatched || !dirty || saving) return
    setSaving(true)
    submit(connections).then(ok => {
      setSaving(false)
      if (ok) {
        setCommittedConnections(connections)
        setShowLockPop(true)
        clearTimeout(lockPopTimerRef.current)
        lockPopTimerRef.current = setTimeout(() => setShowLockPop(false), 700)
      }
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
        if (cancelled || !row?.answer) return
        const restored = {}
        row.answer.forEach((pair, i) => {
          restored[`left:${pair.leftId}`] = i
          restored[`right:${pair.rightId}`] = i
        })
        // A restored row IS a confirmed write by definition — it came from
        // the DB, not a local guess — so both states advance together here.
        setConnections(restored)
        setCommittedConnections(restored)
      })
    return () => { cancelled = true }
  }, [preview, slide.id, team.id])

  // Reports "every pair matched" upward so LiveView can release a team back
  // to free browsing once they've finished — same contract as WagerBoard.
  // Gated on committedConnections, not the instant connections state: a team
  // that finishes on dead wifi must not be released before the save actually
  // lands, or they'd be free to browse away with nothing recorded.
  useEffect(() => {
    onAnswered?.(pairs.length > 0 && buildMatchAnswer(committedConnections).length >= pairs.length)
  }, [onAnswered, committedConnections, pairs.length])

  return (
    // maxWidth keeps the two tile columns from stretching wide and sparse on
    // an iPad's ~560px content column — a no-op on phone widths.
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 480, width: '100%', margin: '0 auto' }}>
      <AnimatePresence>
        {showLockPop && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.9 }}
            transition={shouldReduceMotion
              ? { duration: 0.15 }
              : { type: 'spring', duration: 0.4, bounce: 0.35 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{
              fontSize: '5rem', lineHeight: 1,
              filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.45))',
            }}>
              🔒
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
          {pairs.map(p => (
            <MatchTile key={p.id} label={p.left} image={p.leftImage} color={connections[`left:${p.id}`] != null ? PALETTE[connections[`left:${p.id}`]] : null}
              pending={pendingSide?.side === 'left' && pendingSide.itemId === p.id}
              disabled={locked} onTap={() => tapItem('left', p.id)} textColor={text} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
          {rightOrder.map(p => (
            <MatchTile key={p.id} label={p.right} image={p.rightImage} color={connections[`right:${p.id}`] != null ? PALETTE[connections[`right:${p.id}`]] : null}
              pending={pendingSide?.side === 'right' && pendingSide.itemId === p.id}
              disabled={locked} onTap={() => tapItem('right', p.id)} textColor={text} />
          ))}
        </div>
      </div>
      {!locked && (
        <button
          onClick={lockAnswers}
          disabled={!allMatched || !dirty || saving}
          onPointerDown={e => { if (allMatched && dirty && !saving) e.currentTarget.style.transform = 'scale(0.97)' }}
          onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          style={{
            width: '100%', minHeight: 60, borderRadius: 14,
            border: allMatched && dirty ? `2px solid ${highlight}` : `1px solid ${text}20`,
            background: allMatched && dirty ? `${highlight}26` : 'transparent',
            color: allMatched && dirty ? text : `${text}40`,
            fontSize: '1rem', fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
            cursor: allMatched && dirty && !saving ? 'pointer' : 'default',
            WebkitTapHighlightColor: 'transparent',
            transition: 'transform 140ms cubic-bezier(0.23,1,0.32,1)',
          }}
        >
          {saving ? 'Saving…' : !hasLockedOnce ? 'Lock Your Answers' : dirty ? 'Update Answers' : 'Answers Locked'}
        </button>
      )}
      <p style={{ color: `${text}b3`, fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
        {locked
          ? 'Answers locked'
          : !allMatched
            ? 'Tap one from each side to match them'
            : dirty
              ? 'Tap Lock Your Answers to submit'
              : 'Locked in — you can still change it until Ben locks answers'}
      </p>
      {saveFailed && !locked && (
        <p style={{ color: '#ff6b6b', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
          Couldn't save — check your connection and tap Lock Your Answers again
        </p>
      )}
    </div>
  )
}

// A tile is EITHER an image or text, never both (2026-08-18, Ben) — an image
// tile can't also paint its whole background the matched color the way a
// text tile does (that would hide the image), so it gets a colored ring
// border instead. Text tiles are completely unchanged from before.
function MatchTile({ label, image, color, pending, disabled, onTap, textColor }) {
  if (image) {
    return (
      <button
        onClick={onTap}
        disabled={disabled}
        style={{
          minHeight: 96,
          padding: 6,
          borderRadius: 14,
          border: pending ? `3px solid ${textColor}` : color ? `4px solid ${color}` : '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <img src={image} alt={label || ''} style={{ maxWidth: '100%', maxHeight: 84, objectFit: 'contain' }} />
      </button>
    )
  }
  return (
    <button
      onClick={onTap}
      disabled={disabled}
      style={{
        minHeight: 64,
        padding: '0.9rem 1rem',
        borderRadius: 14,
        border: pending ? `3px solid ${textColor}` : '1px solid rgba(255,255,255,0.15)',
        background: color ?? 'rgba(255,255,255,0.06)',
        color: color ? '#1a1a1a' : textColor,
        fontSize: '1.05rem',
        fontWeight: 600,
        fontFamily: 'DM Sans, sans-serif',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  )
}
