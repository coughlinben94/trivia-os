import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'
import ShrinkToFit from './ShrinkToFit.jsx'

// The phone side of a Choice question — Mandela Effect (single-select, pick
// the real image) and Mixology 101 (multi-select, tap every ingredient) are
// both this one component; only shinyInputSchema.multiSelect and
// optionKind ('image' | 'text') differ between them. Structurally a copy of
// OrderBoard.jsx's build-then-lock shape (local taps, nothing saves until
// Lock In), since there is no sequence to build here — just a set.
//
// preview: true mounts this read-only-ish for a host building the question
// (SlideEditor's live phone preview) — same contract as every other Board.
export default function ChoiceBoard({ slide, team, theme, preview = false, onAnswered }) {
  const { data } = slide
  // A host-authored option with neither a label nor a photo is a
  // content-less tappable pill — filter it out rather than render a blank
  // button teams could still tap and lock in (2026-09-06 critique).
  const options = (data.options ?? []).filter(o => o.label?.trim() || o.image)
  const multiSelect = !!data.shinyInputSchema?.multiSelect
  const locked = !!data.choiceLocked
  const text = theme?.colors?.text ?? '#ffffff'
  const highlight = theme?.colors?.highlight ?? '#f5c842'
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  // selected: option ids, unordered. committedSelected only advances once
  // submit() confirms the write landed — same split as every other Board's
  // instant/committed state pair, and for the same reason: onAnswered must
  // gate on a CONFIRMED save.
  const [selected, setSelected] = useState([])
  const [committedSelected, setCommittedSelected] = useState([])
  // "Clear all" sits right above Lock In; one mis-tap wiped a whole Mixology
  // selection with no undo. Two-tap arm — disarms itself after 2.5s or on
  // any option tap (2026-09-06 critique).
  const [clearArmed, setClearArmed] = useState(false)
  useEffect(() => {
    if (!clearArmed) return
    const t = setTimeout(() => setClearArmed(false), 2500)
    return () => clearTimeout(t)
  }, [clearArmed])

  const optionsKey = options.map(o => o.id).join(',')

  // Preview-only: if the host edits options while the live preview is
  // mounted, clear any in-progress taps rather than carrying a selection
  // that references an option id that no longer exists.
  useEffect(() => {
    if (!preview) return
    setSelected([])
  }, [preview, optionsKey])

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
          new Promise((_, reject) => setTimeout(() => reject(new Error('choice save timed out')), 8000)),
        ]))
      } catch (err) {
        error = err
      }
      if (error) console.error('[ChoiceBoard] answer save failed:', error)
      setSaveFailed(!!error)
      return !error
    })
    saveChainRef.current = run.catch(() => false)
    return run
  }, [preview, slide.id, slide.showId, team.id, team.showId])

  // Builds the selection LOCALLY — nothing saves until Lock In. Single-select
  // behaves like a radio (tapping a new option replaces the old one, tapping
  // the selected option again clears it); multi-select toggles in/out.
  function tapOption(id) {
    if (locked) return
    setClearArmed(false)
    if (multiSelect) {
      setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
    } else {
      setSelected(selected[0] === id ? [] : [id])
    }
  }

  const hasSelection = selected.length > 0
  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...committedSelected].sort())
  const hasLockedOnce = committedSelected.length > 0

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
        if (cancelled || !Array.isArray(row?.answer)) return
        setSelected(row.answer)
        setCommittedSelected(row.answer)
      })
    return () => { cancelled = true }
  }, [preview, slide.id, team.id])

  // Reports "has a locked-in selection" upward so LiveView can release a team
  // back to free browsing once they've finished — same contract as every
  // other Board. Gated on committedSelected, not the instant selected state.
  useEffect(() => {
    onAnswered?.(committedSelected.length > 0)
  }, [onAnswered, committedSelected])

  return (
    <ShrinkToFit disabled={preview}>
    {/* No maxWidth cap here — Join.jsx's .join-content wrapper already caps
        at 560px (Join.jsx:1493). A second, smaller cap here was pure waste:
        80px of unused width on every phone regardless of size (2026-09-06
        critique correction — an earlier pass claimed this scaled with screen
        size; it doesn't, the parent's cap already bounds it). */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', margin: '0 auto' }}>
      {data.text && (
        <p style={{
          color: text, fontSize: 'clamp(1.15rem, 4.5vw, 1.35rem)',
          lineHeight: 1.55, margin: 0, fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
        }}>
          {data.text}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: options.some(o => o.image) ? 'center' : 'flex-start' }}>
        {options.map((opt, i) => (
          <ChoiceTile
            key={opt.id}
            label={opt.label}
            image={opt.image}
            letter={String.fromCharCode(65 + i)}
            selected={selected.includes(opt.id)}
            multiSelect={multiSelect}
            disabled={locked}
            onTap={() => tapOption(opt.id)}
            textColor={text}
            highlight={highlight}
          />
        ))}
      </div>
      {/* Multi-select only — undoing a wrong Mixology tap-spree one option at
          a time (no equivalent to Order's "⌫ Undo last") was a real friction
          point on bad wifi under time pressure (2026-09-06 critique). */}
      {!locked && multiSelect && (
        <button
          onClick={() => {
            if (!clearArmed) { setClearArmed(true); return }
            setClearArmed(false)
            setSelected([])
          }}
          disabled={selected.length === 0}
          style={{
            width: '100%', minHeight: 44, borderRadius: 12,
            border: clearArmed ? '1px solid #ff6b6b' : `1px solid ${text}20`,
            background: 'transparent',
            color: clearArmed ? '#ff6b6b' : selected.length > 0 ? text : `${text}40`,
            fontSize: '0.85rem', fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
            cursor: selected.length > 0 ? 'pointer' : 'default',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {clearArmed ? 'Tap again to clear all' : 'Clear all'}
        </button>
      )}
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
          {saving ? 'Saving…' : (!hasSelection || !hasLockedOnce) ? '🔒 Lock In My Answer' : dirty ? 'Update My Answer' : 'Answer Locked'}
        </button>
      )}
      <p style={{ color: `${text}b3`, fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
        {locked
          ? 'Answers locked'
          : !hasSelection
            ? (multiSelect ? 'Tap every option that belongs' : 'Tap the one you think is real')
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

// Image options size/behave like OrderTile (letter badge, outline ring on
// selection); text options render as a wrapping chip, like MatchTile's text
// branch but with a single highlight color instead of a match-pair palette.
//
// Failed-load retry copied from MatchTile/QuestionImage's fix (2026-08-25,
// Ben live: "couldn't see pictures at all") — OrderTile never got this same
// fix and ChoiceTile was originally modeled on OrderTile's image branch
// verbatim, so it silently carried the same gap. A failed <img> used to
// leave blank space with no way to recover; this swaps the whole tile to a
// retry button instead.
function ChoiceTile({ label, image, letter, selected, multiSelect, disabled, onTap, textColor, highlight }) {
  const [imgFailed, setImgFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // A host swapping this option's image while the slide stays live must not
  // leave a phone that already failed on the OLD image stuck failed.
  useEffect(() => { setImgFailed(false); setAttempt(0) }, [image])

  if (image) {
    if (imgFailed) {
      return (
        <button
          onClick={() => { setImgFailed(false); setAttempt(a => a + 1) }}
          style={{
            position: 'relative',
            width: 'calc(50% - 0.3rem)',
            minHeight: 'clamp(96px, 13vw, 160px)',
            padding: 6,
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: `${textColor}99`, textAlign: 'center' }}>
            🖼️ Picture didn&apos;t load — tap to retry
          </span>
        </button>
      )
    }
    return (
      <button
        onClick={onTap}
        disabled={disabled}
        style={{
          position: 'relative',
          width: 'calc(50% - 0.3rem)',
          minHeight: 'clamp(96px, 13vw, 160px)',
          padding: 6,
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.15)',
          outline: selected ? `4px solid ${highlight}` : 'none',
          outlineOffset: -4,
          background: 'rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <img
          key={attempt}
          src={attempt ? `${image}${image.includes('?') ? '&' : '?'}retry=${attempt}` : image}
          alt={label || ''}
          onError={() => setImgFailed(true)}
          style={{ maxWidth: '100%', maxHeight: 'clamp(84px, 11vw, 140px)', objectFit: 'contain' }}
        />
        <span style={{
          position: 'absolute', top: -8, left: -8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '1.8rem', height: '1.8rem', borderRadius: '50%',
          background: selected ? highlight : 'rgba(0,0,0,0.6)',
          color: selected ? '#1a1a1a' : textColor,
          fontSize: '1rem', fontWeight: 700,
          boxShadow: selected ? '0 2px 8px rgba(0,0,0,0.4)' : 'none',
        }}>
          {letter}
        </span>
      </button>
    )
  }
  // Selected paints the whole chip solid with dark text (same treatment as
  // MatchTile's matched state) — the old 15%-alpha fill + thin ring was hard
  // to pick out at a glance across 10-12 wrapped Mixology chips. The leading
  // glyph doubles as the checkbox/radio affordance so multi vs single-select
  // reads on the tile itself, not only from the caption (2026-09-06 critique).
  const glyph = multiSelect ? (selected ? '☑' : '☐') : (selected ? '●' : '○')
  return (
    <button
      onClick={onTap}
      disabled={disabled}
      style={{
        minHeight: 52,
        maxWidth: '100%',
        padding: '0.7rem 1rem',
        borderRadius: 999,
        border: selected ? `2px solid ${highlight}` : '1px solid rgba(255,255,255,0.15)',
        background: selected ? highlight : 'rgba(255,255,255,0.06)',
        color: selected ? '#1a1a1a' : textColor,
        fontSize: '0.95rem',
        fontWeight: 600,
        fontFamily: 'DM Sans, sans-serif',
        wordBreak: 'break-word',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span aria-hidden="true" style={{ marginRight: '0.4rem', opacity: selected ? 1 : 0.6 }}>{glyph}</span>
      {label}
    </button>
  )
}
