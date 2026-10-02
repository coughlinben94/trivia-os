// client/src/components/join/BendleBoard.jsx
// Bendle on /join (spec 2026-10-02): search the song list or type a title,
// lock ONE guess for the whole three-step Bendle. The database (trigger
// guard_bendle_phone_answers) accepts it only at the live step, once per team
// per group, never after the host locks. No correctness shows before the reveal.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { loadBendleCatalog, searchCatalog } from '../../lib/bendleCatalog.js'
import { BENDLE_CATALOG_URL } from '../../lib/bendleCatalogVersion.js'
import { bendleLockSlide, bendleStepIds, guessLabel, parseGuess } from '../../lib/bendleGuessScoring.js'

const MAX_SAVE_MS = 8000
const SEARCH_DEBOUNCE_MS = 100
// Join remounts the board on every step; this keeps a team's half-done pick.
const drafts = new Map()

export function saveErrorKind(error) {
  const msg = String(error?.message ?? '')
  if (msg.includes('bendle_not_live')) return 'moved'
  if (msg.includes('bendle_locked')) return 'locked'
  if (msg.includes('bendle_already_guessed') || msg.includes('bendle_no_update') || error?.code === '23505') return 'duplicate'
  if (msg.includes('bendle_no_group')) return 'config'
  return 'network'
}

export default function BendleBoard({ slide, slides, team, theme, preview = false, onAnswered, catalogUrl = BENDLE_CATALOG_URL }) {
  const { data } = slide
  const all = slides ?? [slide]
  const lockData = (bendleLockSlide(all, slide) ?? slide).data ?? {}
  const stepIds = useMemo(() => bendleStepIds(all, slide), [all, slide])
  const idsKey = stepIds.filter(Boolean).join('|')
  const stepIndex = data.bendleStepIndex ?? 0
  const groupLocked = !!lockData.bendleLocked
  const revealed = !!lockData.bendleRevealed
  const draftKey = `${team?.id}:${data.shinyGroupId ?? slide.id}`
  const draft = drafts.get(draftKey)

  const [query, setQuery] = useState(draft?.query ?? '')
  const [choice, setChoice] = useState(draft?.choice ?? null) // { source:'catalog', title, artist } | { source:'typed' } | null
  const [artist, setArtist] = useState(draft?.artist ?? '')
  const [catalog, setCatalog] = useState(null) // null loading | 'none' (no list built) | 'error' | index
  const [results, setResults] = useState([])
  const [saved, setSaved] = useState(null) // { stepIndex, guess }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recheck, setRecheck] = useState(0)
  const [lockOns, setLockOns] = useState(0)
  const prevLocked = useRef(groupLocked)
  const readGen = useRef(0) // bumped on Unlock: any read started before it is stale
  const readbackRef = useRef(false) // next read is the read-back after a duplicate save
  const lockedBoxRef = useRef(null)
  const justLocked = useRef(false)
  const busyRef = useRef(false) // state lags a same-tick double tap; the ref does not

  const ink = theme?.colors?.text ?? '#fff'
  const accent = theme?.colors?.highlight ?? '#f5c842'
  const guess = choice?.source === 'typed'
    ? (query.trim() ? { title: query.trim().slice(0, 200), artist: artist.trim().slice(0, 200) || null, source: 'typed', qid: null } : null)
    : choice ? { title: choice.title, artist: choice.artist, source: 'catalog', qid: null } : null

  useEffect(() => {
    if (!catalogUrl) { setCatalog('none'); return undefined }
    let dead = false
    loadBendleCatalog(catalogUrl).then(ix => { if (!dead) setCatalog(ix) }, () => { if (!dead) setCatalog('error') })
    return () => { dead = true }
  }, [catalogUrl])

  useEffect(() => {
    if (preview || !team?.id || !idsKey) return undefined
    let dead = false
    const gen = readGen.current
    const readback = readbackRef.current
    readbackRef.current = false
    const ids = idsKey.split('|')
    const missing = () => { if (!dead && readback && gen === readGen.current) setError('Already locked in. Reload to see your guess.') }
    supabase.from('phone_answers').select('slide_id, answer').eq('team_id', team.id).in('slide_id', ids)
      .then(({ data: rows }) => {
        if (dead || gen !== readGen.current) return
        const best = (rows ?? [])
          .map(r => ({ stepIndex: stepIds.indexOf(r.slide_id), guess: parseGuess(r.answer) }))
          .filter(r => r.stepIndex >= 0)
          .sort((a, b) => a.stepIndex - b.stepIndex)[0]
        if (best) setSaved(best)
        else missing()
      }, missing)
    return () => { dead = true }
    // Reads on mount, after a duplicate save, and when the host locks; never on
    // Unlock (the host's delete may not have committed, so it would read the old row).
  }, [preview, team?.id, idsKey, recheck, lockOns]) // eslint-disable-line react-hooks/exhaustive-deps

  // Host Unlock deletes every guess: a phone that was locked starts over, and
  // a read already in flight must not put the old guess back.
  useEffect(() => {
    if (!prevLocked.current && groupLocked) setLockOns(n => n + 1)
    if (prevLocked.current && !groupLocked) { readGen.current += 1; setSaved(null) }
    prevLocked.current = groupLocked
  }, [groupLocked])

  useEffect(() => {
    if (saved && justLocked.current) { justLocked.current = false; lockedBoxRef.current?.focus() }
  }, [saved])

  useEffect(() => { onAnswered?.(!!saved) }, [saved, onAnswered])

  useEffect(() => {
    if (!Array.isArray(catalog)) { setResults([]); return undefined }
    const t = setTimeout(() => setResults(searchCatalog(catalog, query, 8)), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [catalog, query])

  useEffect(() => { drafts.set(draftKey, { query, choice, artist }) }, [draftKey, query, choice, artist])

  async function lockIn() {
    if (!guess || saved || groupLocked || busyRef.current) return
    if (preview) { setSaved({ stepIndex, guess }); return }
    busyRef.current = true
    setBusy(true); setError('')
    try {
      const { error: saveError } = await Promise.race([
        supabase.from('phone_answers').insert({ show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id, answer: guess }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), MAX_SAVE_MS)),
      ])
      if (saveError) throw saveError
      justLocked.current = true
      setSaved({ stepIndex, guess })
      drafts.delete(draftKey)
    } catch (caught) {
      const kind = saveErrorKind(caught)
      if (kind === 'duplicate') { readbackRef.current = true; setRecheck(n => n + 1) } // already locked (maybe another phone): read it back
      else if (kind === 'moved') setError('The step moved on. Tap Lock In again.')
      else if (kind === 'locked') setError('Guesses are locked.')
      else if (kind === 'config') setError('This Bendle is not set up right. Ask the host to recreate it.')
      else setError('Could not save your guess. Check your connection and try again.')
    } finally { busyRef.current = false; setBusy(false) }
  }

  const box = { padding: '0.9rem', border: `1px solid ${accent}`, borderRadius: 14 }
  const rowBtn = { textAlign: 'left', minHeight: 44, padding: '0.7rem 0.75rem', borderRadius: 10, color: ink, border: `1px solid ${ink}44`, background: 'transparent', fontSize: 16 }
  const field = { width: '100%', minHeight: 44, padding: '0.75rem', borderRadius: 10, color: '#111', fontSize: 16 }
  const display = `'${theme?.fonts?.display ?? 'Boogaloo'}', 'Boogaloo', sans-serif`
  const result = revealed && Array.isArray(lockData.bendleResults) ? lockData.bendleResults.find(r => r.teamId === team?.id) : null

  return (
    <section style={{ color: ink, display: 'grid', gap: '0.9rem', fontFamily: `'${theme?.fonts?.body ?? 'DM Sans'}', 'DM Sans', sans-serif` }}>
      <p style={{ margin: 0, fontSize: '1.1rem', lineHeight: 1.35 }}>{data.text || 'Name that song.'}</p>

      {revealed ? (
        <div style={box} role="status">
          {result?.guess ? <>
            <p style={{ margin: 0 }}>Your guess: <strong>{guessLabel(result.guess)}</strong> (step {result.stepIndex + 1})</p>
            <p style={{ margin: '0.4rem 0 0', fontWeight: 700 }}>{result.points > 0 ? `+${result.points} points` : 'Not this time · 0 points'}</p>
          </> : <p style={{ margin: 0 }}>No guess from your team{result?.points > 0 ? ` · +${result.points} points` : ''}.</p>}
        </div>
      ) : saved ? (
        <div style={box} role="status" tabIndex={-1} ref={lockedBoxRef}>
          <p style={{ margin: 0, fontFamily: display, fontSize: '1.3rem' }}>✓ Locked in at step {saved.stepIndex + 1}</p>
          <p style={{ margin: '0.4rem 0 0' }}>Your guess: {guessLabel(saved.guess)}</p>
          <p style={{ margin: '0.4rem 0 0', opacity: 0.8 }}>Waiting for the reveal.</p>
        </div>
      ) : groupLocked ? (
        <p role="status" style={{ margin: 0 }}>Guesses are locked. No guess from your team.</p>
      ) : <>
        {/* One live region per countdown; only its text follows the pick. */}
        {data.lockCountdownStartedAt && <p role="status" style={{ margin: 0, fontFamily: display, fontSize: '1.3rem', color: accent }}>{guess ? '⏱ Lock in now!' : ''}</p>}
        <input
          type="search" aria-label="Search for the song" value={query} placeholder="Song title or artist"
          autoComplete="off" autoCorrect="off" spellCheck={false}
          onChange={e => { setQuery(e.target.value); if (choice?.source !== 'typed') setChoice(null) }}
          style={field}
        />
        {catalog === 'error' && <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.85 }}>Song list did not load. Type the title and tap "Use what I typed".</p>}
        <div style={{ display: 'grid', gap: 6 }}>
          {results.map((r, i) => {
            const picked = choice?.source === 'catalog' && choice.title === r.title && choice.artist === r.artist
            return (
              <button type="button" key={`${i}|${r.title}|${r.artist}`} aria-pressed={picked} onClick={() => { setChoice({ source: 'catalog', title: r.title, artist: r.artist }); setError('') }}
                style={{ ...rowBtn, borderColor: picked ? accent : `${ink}44`, borderWidth: picked ? 2 : 1 }}>
                {picked && <span aria-hidden="true">✓ </span>}<strong>{r.title}</strong>{r.artist ? <span style={{ opacity: 0.8 }}> - {r.artist}</span> : null}
              </button>
            )
          })}
          {query.trim() && (
            <button type="button" aria-pressed={choice?.source === 'typed'} onClick={() => { setChoice({ source: 'typed' }); setError('') }}
              style={{ ...rowBtn, borderStyle: 'dashed', borderColor: choice?.source === 'typed' ? accent : `${ink}66`, borderWidth: choice?.source === 'typed' ? 2 : 1 }}>
              {choice?.source === 'typed' && <span aria-hidden="true">✓ </span>}Use what I typed: “{query.trim()}”
            </button>
          )}
        </div>
        {choice?.source === 'typed' && (
          <input aria-label="Artist (optional)" value={artist} placeholder="Artist (optional)" autoComplete="off"
            onChange={e => setArtist(e.target.value)} style={field} />
        )}
        {guess && <p style={{ margin: 0 }}>Your guess: <strong>{guessLabel(guess)}</strong></p>}
        <button type="button" onClick={lockIn} disabled={!guess || busy}
          style={{ color: ink, border: `2px solid ${accent}`, borderRadius: 12, minHeight: 48, padding: '0.9rem', fontFamily: display, fontSize: '1.2rem', opacity: !guess || busy ? 0.5 : 1 }}>
          {busy ? 'Saving…' : `Lock In at step ${stepIndex + 1}`}
        </button>
        <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.75 }}>One guess for the whole Bendle. Earlier steps score more.</p>
      </>}
      {error && <p role="alert" style={{ color: '#ff8888', margin: 0 }}>{error}</p>}
    </section>
  )
}
