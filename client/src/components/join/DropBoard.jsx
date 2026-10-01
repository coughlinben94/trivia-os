import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase.js'
import ShrinkToFit from './ShrinkToFit.jsx'
import { DEFAULT_DROP_TOTAL, dropChip, dropOptions, dropSequence, isValidAlloc } from '../../lib/dropScoring.js'

// The phone side of The Drop. Every team gets `dropTotal` points to split over
// the options. Tap a tile = +chip points on it, the small − takes them back.
// Nothing saves until Lock In, and Lock In only turns on once every point is
// placed (the pool counter reaches 0). After Ben locks, wrong tiles fall off
// here in step with the TV (data.dropStep) and the correct one lights up.
//
// preview: true mounts this for a host building the question (SlideEditor's
// phone preview) — same contract as every other Board.
export default function DropBoard({ slide, team, theme, preview = false, onAnswered }) {
  const { data } = slide
  const options = useMemo(() => dropOptions(data), [data])
  const optionIds = useMemo(() => options.map(o => o.id), [options])
  const total = data.dropTotal ?? DEFAULT_DROP_TOTAL
  // Points per tap is the team's own call (1 to 5, only sizes that fit the
  // pool). The default is dropChip(total); a team that wants fine control or a
  // fast fill changes it, and the last tap always places just what is left.
  const stepChoices = useMemo(() => [1, 2, 3, 4, 5].filter(n => n <= total), [total])
  const [pickedStep, setPickedStep] = useState(null)
  const chip = stepChoices.includes(pickedStep) ? pickedStep : dropChip(total)
  const locked = !!data.dropLocked
  const step = data.dropStep ?? 0
  const droppedIds = useMemo(() => (locked ? dropSequence(data).slice(0, step) : []), [locked, data, step])
  const revealed = !!data.dropRevealed
  const text = theme?.colors?.text ?? '#ffffff'
  const highlight = theme?.colors?.highlight ?? '#f5c842'

  const [alloc, setAlloc] = useState({})
  const [committed, setCommitted] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const placed = optionIds.reduce((sum, id) => sum + (alloc[id] ?? 0), 0)
  const remaining = total - placed
  const complete = remaining === 0
  const dirty = JSON.stringify(normalize(alloc, optionIds)) !== JSON.stringify(normalize(committed ?? {}, optionIds))
  const hasLockedOnce = committed != null

  // Preview-only: host edits options while the preview is mounted — drop any
  // in-progress taps that reference ids that may no longer exist.
  const optionsKey = optionIds.join(',')
  useEffect(() => {
    if (!preview) return
    setAlloc({})
  }, [preview, optionsKey])

  function tapAdd(id) {
    const amt = Math.min(chip, remaining)
    if (locked || amt <= 0) return
    setAlloc(a => ({ ...a, [id]: (a[id] ?? 0) + amt }))
  }
  function tapSub(id) {
    const amt = Math.min(chip, alloc[id] ?? 0)
    if (locked || amt <= 0) return
    setAlloc(a => ({ ...a, [id]: a[id] - amt }))
  }

  const saveChainRef = useRef(Promise.resolve())
  const submit = useCallback((next) => {
    if (preview) return Promise.resolve(true)
    const run = saveChainRef.current.then(async () => {
      const upsert = supabase.from('phone_answers').upsert(
        { show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id, answer: next },
        { onConflict: 'slide_id,team_id' }
      )
      let error
      try {
        ;({ error } = await Promise.race([
          upsert,
          new Promise((_, reject) => setTimeout(() => reject(new Error('drop save timed out')), 8000)),
        ]))
      } catch (err) {
        error = err
      }
      if (error) console.error('[DropBoard] answer save failed:', error)
      setSaveFailed(!!error)
      return !error
    })
    saveChainRef.current = run.catch(() => false)
    return run
  }, [preview, slide.id, slide.showId, team.id, team.showId])

  function lockIn() {
    if (locked || !complete || !dirty || saving) return
    const next = normalize(alloc, optionIds)
    setSaving(true)
    submit(next).then(ok => {
      setSaving(false)
      if (ok) setCommitted(next)
    })
  }

  // Rehydrate a saved split after a reload / reconnect.
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
        if (cancelled || !row?.answer || Array.isArray(row.answer)) return
        // A split that no longer fits (the host changed the pool, or blanked a
        // tile the team had points on) is dropped, not half-restored: the
        // counter would go negative and the team couldn't tap their way out.
        const saved = normalize(row.answer, optionIds)
        if (!isValidAlloc(saved, optionIds, total)) return
        setAlloc(saved)
        setCommitted(saved)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, slide.id, team.id])

  // "Has a locked-in answer" upward, same contract as every other Board.
  useEffect(() => {
    onAnswered?.(committed != null)
  }, [onAnswered, committed])

  const ready = complete && dirty && !saving
  return (
    <ShrinkToFit disabled={preview}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', width: '100%', margin: '0 auto' }}>
        {data.text && (
          <p style={{
            color: text, fontSize: 'clamp(1.15rem, 4.5vw, 1.35rem)',
            lineHeight: 1.5, margin: 0, fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
          }}>
            {data.text}
          </p>
        )}

        {/* The pool. Big, because it's the whole game: points left to place. */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.5rem' }}>
          <span style={{
            fontSize: '2.6rem', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            color: complete ? highlight : text, transition: 'color 160ms ease',
            fontFamily: `'${theme?.fonts?.display ?? 'Boogaloo'}', 'Boogaloo', sans-serif`,
          }}>
            {remaining}
          </span>
          <span style={{ color: `${text}b3`, fontSize: '0.95rem', fontFamily: 'DM Sans, sans-serif' }}>
            {complete ? 'all placed' : 'left to place'}
          </span>
        </div>

        {!locked && stepChoices.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <span style={{ color: `${text}b3`, fontSize: '0.8rem', fontFamily: 'DM Sans, sans-serif' }}>Per tap</span>
            {stepChoices.map(n => (
              <button
                key={n}
                onClick={() => setPickedStep(n)}
                aria-pressed={chip === n}
                aria-label={`${n} ${n === 1 ? 'point' : 'points'} per tap`}
                style={{
                  minWidth: 48, height: 36, borderRadius: 999, padding: '0 0.8rem',
                  border: chip === n ? `2px solid ${highlight}` : `1px solid ${text}30`,
                  background: chip === n ? `${highlight}26` : 'transparent',
                  color: chip === n ? highlight : text, fontSize: '0.9rem', fontWeight: 700,
                  fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
          {options.map((opt, i) => (
            <DropTile
              key={opt.id}
              opt={opt}
              letter={String.fromCharCode(65 + i)}
              points={alloc[opt.id] ?? 0}
              locked={locked}
              dropped={droppedIds.includes(opt.id)}
              winner={revealed && opt.id === data.correctId}
              canAdd={!locked && remaining > 0}
              canSub={!locked && (alloc[opt.id] ?? 0) > 0}
              chip={chip}
              onAdd={() => tapAdd(opt.id)}
              onSub={() => tapSub(opt.id)}
              textColor={text}
              highlight={highlight}
            />
          ))}
        </div>

        {!locked && (
          <button
            onClick={lockIn}
            disabled={!ready}
            onPointerDown={e => { if (ready) e.currentTarget.style.transform = 'scale(0.97)' }}
            onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
            onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            style={{
              width: '100%', minHeight: 60, borderRadius: 14,
              border: ready ? `2px solid ${highlight}` : `1px solid ${text}20`,
              background: ready ? `${highlight}26` : 'transparent',
              color: ready ? text : `${text}40`,
              fontSize: '1rem', fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
              cursor: ready ? 'pointer' : 'default',
              WebkitTapHighlightColor: 'transparent',
              transition: 'transform 140ms cubic-bezier(0.23,1,0.32,1)',
            }}
          >
            {saving ? 'Saving…' : !complete ? `Place ${remaining} more` : !hasLockedOnce ? '🔒 Lock In My Split' : dirty ? 'Update My Split' : 'Split Locked'}
          </button>
        )}

        <p style={{ color: `${text}b3`, fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
          {locked
            ? (revealed ? 'That’s the drop!' : 'Answers locked — watch the screen')
            : !complete
              ? `Tap a tile to place ${chip} points. Tap − to take them back.`
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
    </ShrinkToFit>
  )
}

// A full { id: n } map over exactly the current option ids, zeros included, so
// a save and a rehydrate always compare and score the same shape.
function normalize(alloc, optionIds) {
  const out = {}
  for (const id of optionIds) out[id] = Number.isInteger(alloc?.[id]) ? alloc[id] : 0
  return out
}

function DropTile({ opt, letter, points, locked, dropped, winner, canAdd, canSub, chip, onAdd, onSub, textColor, highlight }) {
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => { setImgFailed(false) }, [opt.image])
  const active = points > 0
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 16,
        border: winner ? `3px solid ${highlight}` : active && !locked ? `2px solid ${highlight}` : '1px solid rgba(255,255,255,0.15)',
        background: winner ? `${highlight}26` : 'rgba(255,255,255,0.06)',
        boxShadow: winner ? `0 0 24px ${highlight}66` : 'none',
        opacity: dropped ? 0.28 : 1,
        // GPU-only: a dropped tile sinks and fades, it never reflows the grid.
        transform: dropped ? 'translateY(14px) scale(0.96)' : 'none',
        transition: 'opacity 420ms cubic-bezier(0.25,1,0.25,1), transform 420ms cubic-bezier(0.25,1,0.25,1)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onAdd}
        disabled={!canAdd}
        aria-label={`Add ${chip} points to ${opt.label || `option ${letter}`}`}
        style={{
          width: '100%', minHeight: 132, padding: '0.7rem 0.6rem 2.6rem',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
          background: 'transparent', border: 'none', color: textColor,
          cursor: canAdd ? 'pointer' : 'default',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {opt.image && !imgFailed ? (
          <img
            src={opt.image} alt="" onError={() => setImgFailed(true)}
            style={{ maxWidth: '100%', maxHeight: 64, objectFit: 'contain' }}
          />
        ) : null}
        <span style={{
          fontSize: '0.95rem', fontWeight: 600, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.2,
          wordBreak: 'break-word', textAlign: 'center',
        }}>
          <span style={{ opacity: 0.6, marginRight: '0.3rem' }}>{letter}</span>{opt.label}
        </span>
        <span style={{
          fontSize: '2rem', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
          color: active ? highlight : `${textColor}55`,
          fontFamily: 'DM Sans, sans-serif',
        }}>
          {points}
        </span>
      </button>
      {!locked && (
        <button
          onClick={onSub}
          disabled={!canSub}
          aria-label={`Remove ${chip} points from ${opt.label || `option ${letter}`}`}
          style={{
            position: 'absolute', left: 8, bottom: 8, width: 44, height: 36, borderRadius: 10,
            border: `1px solid ${textColor}30`, background: 'rgba(0,0,0,0.25)',
            color: canSub ? textColor : `${textColor}30`, fontSize: '1.3rem', fontWeight: 700, lineHeight: 1,
            cursor: canSub ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent',
          }}
        >
          −
        </button>
      )}
    </div>
  )
}
