// client/src/components/join/PinBoard.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'
import { usePhoneAnswerSave } from '../../hooks/usePhoneAnswerSave.js'
import PinMapInteractive from '../shared/PinMapInteractive.jsx'
import { isValidPin } from '../../lib/pinScoring.js'

// Phone side of Pin It. Same build-then-lock shape as ChoiceBoard/HuesCuesBoard:
// the pin is local until Lock In; onAnswered fires only off a CONFIRMED save.
// Sizes itself (Join.jsx skips the global ShrinkToFit for phone mechanics).
export default function PinBoard({ slide, team, theme, preview = false, onAnswered }) {
  const { data } = slide
  const locked = !!data.pinLocked
  const text = theme?.colors?.text ?? '#ffffff'
  const highlight = theme?.colors?.highlight ?? '#f5c842'
  const [pin, setPin] = useState(null)
  const [committed, setCommitted] = useState(null)
  const [saving, setSaving] = useState(false)
  const { saveAnswer, saveFailed } = usePhoneAnswerSave({ preview, slide, team, board: 'PinBoard', noun: 'pin' })
  const save = useCallback(
    (next) => (preview ? Promise.resolve(true) : saveAnswer({ lat: next.lat, lon: next.lon })),
    [preview, saveAnswer]
  )
  const touchedRef = useRef(false)
  const same = (a, b) => !!a && !!b && a.lat === b.lat && a.lon === b.lon
  const dirty = !!pin && !same(pin, committed)

  // Restore this team's own pin after a reload (bar wifi). Never overrides a pin already dropped.
  useEffect(() => {
    if (preview) return
    let cancelled = false
    supabase.from('phone_answers').select('answer').eq('slide_id', slide.id).eq('team_id', team.id).maybeSingle()
      .then(({ data: row }) => {
        if (cancelled || touchedRef.current || !isValidPin(row?.answer)) return
        setPin(row.answer); setCommitted(row.answer)
      })
    return () => { cancelled = true }
  }, [preview, slide.id, team.id])

  useEffect(() => { onAnswered?.(!!committed) }, [onAnswered, committed])

  async function lockIn() {
    if (!dirty || saving || locked) return
    setSaving(true)
    // Always re-sends the CURRENT pin: a save that timed out may still land
    // later, and this makes the row converge on what the phone shows.
    const ok = await save(pin)
    setSaving(false)
    if (ok) setCommitted(pin)
  }

  // After reveal, ranks past the TV's top 12 never show up there: each phone reads its own row.
  const revealRow = data.pinRevealed && Array.isArray(data.pinResults) ? data.pinResults.find(r => r.teamId === team.id) ?? null : null
  const outcome = data.pinRevealed && Array.isArray(data.pinResults)
    ? (!revealRow ? 'No result recorded for your team' // no row: e.g. an unpaid team that is not on the scoreboard, so "no pin" would be a guess
      : revealRow.miles != null ? `Your pin: ${revealRow.miles.toLocaleString()} mi${revealRow.points > 0 ? ` · +${revealRow.points}` : ''}` : 'No pin locked in')
    : null

  const font = `'${theme?.fonts?.body ?? 'DM Sans'}', 'DM Sans', sans-serif`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', margin: '0 auto', fontFamily: font }}>
      {data.text && (
        <p style={{ color: text, fontSize: 'clamp(1.15rem, 4.5vw, 1.35rem)', lineHeight: 1.45, margin: 0, fontWeight: 500 }}>{data.text}</p>
      )}
      <PinMapInteractive
        pin={locked ? committed : pin}
        onPin={p => { touchedRef.current = true; setPin(p) }}
        disabled={locked}
        highlight={highlight}
        ink={text}
        showCities={false}
      />
      {!locked && (
        <button
          onClick={lockIn}
          disabled={!dirty || saving}
          style={{
            width: '100%', minHeight: 60, borderRadius: 14, fontSize: '1rem', fontWeight: 700, fontFamily: font,
            border: dirty ? `2px solid ${highlight}` : `1px solid ${text}20`,
            background: dirty ? `${highlight}26` : 'transparent',
            color: dirty ? text : `${text}40`,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {saving ? 'Saving…' : !pin || !committed ? '🔒 Lock In My Pin' : dirty ? 'Update My Pin' : 'Pin Locked'}
        </button>
      )}
      <p style={{ color: `${text}b3`, fontSize: '0.875rem', textAlign: 'center', margin: 0 }}>
        {locked
          ? (outcome ?? (committed ? 'Pins locked' : "You didn't lock in a pin"))
          : !pin
            ? 'Press and hold the map to drop your pin — pinch to zoom'
            : dirty
              ? 'Tap Lock In to submit'
              : 'Locked in — press and hold again to move it until the host locks pins'}
      </p>
      {saveFailed && !locked && (
        <p style={{ color: '#ff6b6b', fontSize: '0.875rem', textAlign: 'center', margin: 0 }}>
          Couldn't save — check your connection and tap Lock In again
        </p>
      )}
    </div>
  )
}
