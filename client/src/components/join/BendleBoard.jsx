import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import ShrinkToFit from './ShrinkToFit.jsx'

export default function BendleBoard({ slide, team, theme, preview = false, onAnswered }) {
  const { data } = slide
  const guessesLocked = !!data.bendleGuessesLocked
  const revealed = !!data.bendleRevealed
  const [guess, setGuess] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  // Restore this team's own row so a phone that reloads mid-question keeps
  // its submitted state — skipped in preview (mirrors WagerBoard.jsx:116).
  useEffect(() => {
    if (preview) return
    let cancelled = false
    supabase.from('phone_answers').select('answer').eq('slide_id', slide.id).eq('team_id', team.id).maybeSingle()
      .then(({ data: row }) => { if (!cancelled && row) setSubmitted(true) })
    return () => { cancelled = true }
  }, [preview, slide.id, team.id])

  async function handleSubmit() {
    if (preview) return
    if (!guess.trim() || submitted || guessesLocked) return
    setError(null)
    // data.currentPart is the host's own live step (0/1/2), mirrored onto
    // this phone via the same Realtime sync every other slide field already
    // rides — not a client-side clock. Replaced the old Date.now()-based
    // elapsedSeconds (2026-09-08 rebuild to 3 host-advanced steps): that
    // approach reset to 0 on any phone reload mid-round, silently misscoring
    // a late guess into the earliest tier. Reading currentPart directly has
    // no local state to reset.
    const submittedAtPart = data.currentPart ?? 0
    const { error: upsertError } = await supabase.from('phone_answers').upsert({
      show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id,
      answer: { guess: guess.trim(), submittedAtPart },
    }, { onConflict: 'slide_id,team_id' })
    if (upsertError) { setError('Submission failed — check connection and retry'); return }
    setSubmitted(true)
    onAnswered?.()
  }

  if (revealed) {
    const mine = (data.bendleResults ?? []).find(r => r.teamId === team.id)
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '1.4rem', fontWeight: 700, color: theme.colors.text }}>
          {mine?.correct ? `You got it! +${mine.points}` : 'Not this time.'}
        </p>
      </div>
    )
  }

  return (
    <ShrinkToFit disabled={preview}>
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {submitted || guessesLocked ? (
        <p style={{ fontSize: '1.2rem', textAlign: 'center', color: theme.colors.text }}>
          {submitted ? "Locked in — good luck!" : 'Guesses are locked.'}
        </p>
      ) : (
        <>
          <input
            value={guess}
            onChange={e => setGuess(e.target.value)}
            placeholder="Name that song…"
            style={{ padding: '0.9rem', borderRadius: 12, border: '1px solid #ddd', fontSize: '1.1rem' }}
          />
          <button
            onClick={handleSubmit}
            disabled={!guess.trim()}
            style={{ padding: '0.9rem', borderRadius: 12, border: '2px solid #1a6b4a', color: '#1a6b4a', fontWeight: 700, background: 'white' }}
          >
            Lock In Guess
          </button>
          {error && <p style={{ color: '#c00', fontSize: '0.85rem', textAlign: 'center' }}>{error}</p>}
        </>
      )}
    </div>
    </ShrinkToFit>
  )
}
