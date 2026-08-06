import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase.js'
import { seededShuffle, buildMatchAnswer } from '../../lib/matchingScoring.js'

const PALETTE = ['#e02020', '#3aa0e0', '#e0a020', '#8050c0', '#20a060', '#e05090']

// preview: true mounts this component read-only-ish for a host building the
// question (SlideEditor's live phone preview) — taps still animate locally so
// the host can see the interaction, but nothing is written to or read from
// Supabase, since there's no real team/slide behind a preview render. See
// docs/superpowers/plans/2026-07-28-phone-answer-scoring-implementation.md.
export default function MatchingBoard({ slide, team, theme, preview = false }) {
  const { data } = slide
  const pairs = data.pairs ?? []
  const locked = !!data.matchingLocked
  const text = theme?.colors?.text ?? '#ffffff'

  // connections: { [`${side}:${itemId}`]: colorIndex } — side-tagged because
  // left and right items share the same id space (pairs.map(p => p.id) is
  // identical for both columns), so an untagged key can't tell "left p0" from
  // "right p0" apart and a wrong match collapses into a same-id correct one.
  // A completed pair exists once a left key and a right key share a colorIndex.
  const [connections, setConnections] = useState({})
  const [pendingSide, setPendingSide] = useState(null) // { side: 'left'|'right', itemId } — first tap of a pair, waiting for the second
  const [saveFailed, setSaveFailed] = useState(false)

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

  const submit = useCallback(async (nextConnections) => {
    if (preview) return
    const answer = buildMatchAnswer(nextConnections)
    const { error } = await supabase.from('phone_answers').upsert(
      { show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id, answer },
      { onConflict: 'slide_id,team_id' }
    )
    if (error) console.error('[MatchingBoard] answer save failed:', error)
    setSaveFailed(!!error)
  }, [preview, slide.id, slide.showId, team.id, team.showId])

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
      submit(next)
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
    submit(next)
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
        setConnections(restored)
      })
    return () => { cancelled = true }
  }, [preview, slide.id, team.id])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
          {pairs.map(p => (
            <MatchTile key={p.id} label={p.left} color={connections[`left:${p.id}`] != null ? PALETTE[connections[`left:${p.id}`]] : null}
              pending={pendingSide?.side === 'left' && pendingSide.itemId === p.id}
              disabled={locked} onTap={() => tapItem('left', p.id)} textColor={text} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
          {rightOrder.map(p => (
            <MatchTile key={p.id} label={p.right} color={connections[`right:${p.id}`] != null ? PALETTE[connections[`right:${p.id}`]] : null}
              pending={pendingSide?.side === 'right' && pendingSide.itemId === p.id}
              disabled={locked} onTap={() => tapItem('right', p.id)} textColor={text} />
          ))}
        </div>
      </div>
      <p style={{ color: `${text}55`, fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
        {locked ? 'Answers locked' : 'Tap one from each side to match them'}
      </p>
      {saveFailed && !locked && (
        <p style={{ color: '#ff6b6b', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
          Couldn't save — check your connection and tap a pair again
        </p>
      )}
    </div>
  )
}

function MatchTile({ label, color, pending, disabled, onTap, textColor }) {
  return (
    <button
      onClick={onTap}
      disabled={disabled}
      style={{
        minHeight: 56,
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
