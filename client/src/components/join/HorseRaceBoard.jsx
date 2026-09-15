import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'
import ShrinkToFit from './ShrinkToFit.jsx'

// The phone side of "And They're Off!" — pick one of 4 named contenders
// before the host starts the race. Single-select tap-then-Lock-In, same
// build-then-lock shape as ChoiceBoard's single-select path (structurally a
// simplified copy: no images, no multi-select, contenders instead of
// options, the contender's NAME submitted as the answer rather than an id —
// scoring compares directly against slide.data.answer, the same derived
// winner name RaceEditor already recomputes from contenders+beats, so the
// phone pick, the TV race, and the scoreboard can never disagree about who
// won). preview mounts read-only-ish for SlideEditor's live phone preview,
// same contract as every other Board.
export default function HorseRaceBoard({ slide, team, theme, preview = false, onAnswered }) {
  const { data } = slide
  const contenders = (data.contenders ?? []).filter(c => c?.name)
  const locked = !!data.raceLocked
  const text = theme?.colors?.text ?? '#ffffff'
  const highlight = theme?.colors?.highlight ?? '#f5c842'
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const [selected, setSelected] = useState(null)
  const [committedSelected, setCommittedSelected] = useState(null)

  const saveChainRef = useRef(Promise.resolve())

  const submit = useCallback((nextSelected) => {
    if (preview) return Promise.resolve(true)
    const run = saveChainRef.current.then(async () => {
      const upsert = supabase.from('phone_answers').upsert(
        { show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id, answer: nextSelected },
        { onConflict: 'slide_id,team_id' }
      )
      let error
      try {
        ;({ error } = await Promise.race([
          upsert,
          new Promise((_, reject) => setTimeout(() => reject(new Error('horse-race save timed out')), 8000)),
        ]))
      } catch (err) {
        error = err
      }
      if (error) console.error('[HorseRaceBoard] pick save failed:', error)
      setSaveFailed(!!error)
      return !error
    })
    saveChainRef.current = run.catch(() => false)
    return run
  }, [preview, slide.id, slide.showId, team.id, team.showId])

  function tapContender(name) {
    if (locked) return
    setSelected(selected === name ? null : name)
  }

  const hasSelection = !!selected
  const dirty = selected !== committedSelected
  const hasLockedOnce = !!committedSelected

  function lockIn() {
    if (locked || !hasSelection || !dirty || saving) return
    setSaving(true)
    submit(selected).then(ok => {
      setSaving(false)
      if (ok) setCommittedSelected(selected)
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
        if (cancelled || typeof row?.answer !== 'string' || !row.answer) return
        setSelected(row.answer)
        setCommittedSelected(row.answer)
      })
    return () => { cancelled = true }
  }, [preview, slide.id, team.id])

  useEffect(() => {
    onAnswered?.(!!committedSelected)
  }, [onAnswered, committedSelected])

  return (
    <ShrinkToFit disabled={preview}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', margin: '0 auto' }}>
        {data.text && (
          <p style={{
            color: text, fontSize: 'clamp(1.15rem, 4.5vw, 1.35rem)',
            lineHeight: 1.55, margin: 0, fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
          }}>
            {data.text}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {contenders.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => tapContender(c.name)}
              disabled={locked}
              style={{
                minHeight: 52, padding: '0.9rem 1.1rem', borderRadius: 12,
                border: selected === c.name ? `2px solid ${highlight}` : '1px solid rgba(255,255,255,0.15)',
                background: selected === c.name ? highlight : 'rgba(255,255,255,0.06)',
                color: selected === c.name ? '#1a1a1a' : text,
                fontSize: '1rem', fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
                textAlign: 'left', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span aria-hidden="true" style={{ marginRight: '0.6rem', opacity: selected === c.name ? 1 : 0.6 }}>
                {selected === c.name ? '●' : '○'}
              </span>
              {c.name}
            </button>
          ))}
        </div>
        {!locked && (
          <button
            onClick={lockIn}
            disabled={!hasSelection || !dirty || saving}
            onPointerDown={e => { if (hasSelection && dirty && !saving) e.currentTarget.style.transform = 'scale(0.97)' }}
            onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
            onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            style={{
              width: '100%', minHeight: 60, borderRadius: 14,
              border: hasSelection && dirty ? `2px solid ${highlight}` : `1px solid ${text}20`,
              background: hasSelection && dirty ? `${highlight}26` : 'transparent',
              color: hasSelection && dirty ? text : `${text}40`,
              fontSize: '1rem', fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
              cursor: hasSelection && dirty && !saving ? 'pointer' : 'default',
              WebkitTapHighlightColor: 'transparent',
              transition: 'transform 140ms cubic-bezier(0.23,1,0.32,1)',
            }}
          >
            {saving ? 'Saving…' : (!hasSelection || !hasLockedOnce) ? '🔒 Lock In My Pick' : dirty ? 'Update My Pick' : 'Pick Locked'}
          </button>
        )}
        <p style={{ color: `${text}b3`, fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
          {locked
            ? 'Picks locked — the race is about to start'
            : !hasSelection
              ? 'Tap who you think wins'
              : dirty
                ? 'Tap Lock In to submit'
                : 'Locked in — you can still change it until Ben locks picks'}
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
