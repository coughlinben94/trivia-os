import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { movieChainRequest } from '../../lib/movieChainApi.js'
import './MovieChainBoard.css'

const MAX_SAVE_MS = 8000

export default function MovieChainBoard({ slide, team, theme, preview = false, onAnswered }) {
  const { data } = slide
  const start = data.movieChainStart
  const end = data.movieChainEnd
  const locked = !!data.movieChainLocked
  const [movies, setMovies] = useState(start ? [start] : [])
  const [performers, setPerformers] = useState([])
  const [cast, setCast] = useState([])
  const [castBusy, setCastBusy] = useState(false)
  const [person, setPerson] = useState(null)
  const [personQuery, setPersonQuery] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [savedChain, setSavedChain] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const touchedRef = useRef(false)
  const current = movies.at(-1)
  const complete = movies.at(-1)?.id === end?.id && performers.length === movies.length - 1
  const committed = !!savedChain && complete
    && movies.map(item => item.id).join('|') === savedChain.movies.map(item => item.id).join('|')
    && performers.map(item => item.id).join('|') === savedChain.performers.map(item => item.id).join('|')
  const shownMovies = locked && savedChain ? savedChain.movies : movies
  const shownPerformers = locked && savedChain ? savedChain.performers : performers
  const maxMovies = Math.max(2, Number(data.movieChainCount || 2) + 1)
  const canAddMiddle = movies.length < maxMovies - 1
  const ink = theme?.colors?.text ?? '#fff'
  const accent = theme?.colors?.highlight ?? '#f5c842'
  const availableCast = cast.filter(candidate => !performers.some(used => used.id === candidate.id))
  const visibleCast = availableCast.filter(candidate => candidate.name.toLowerCase().includes(personQuery.trim().toLowerCase()))

  useEffect(() => {
    touchedRef.current = false
    setMovies(start ? [start] : [])
    setPerformers([]); setPerson(null); setPersonQuery(''); setSavedChain(null); setResults([]); setSearched(false); setError('')
  }, [slide.id, start?.id, end?.id])

  useEffect(() => {
    if (!current || complete) return
    let cancelled = false
    setCast([]); setCastBusy(true)
    movieChainRequest('cast', { movieId: current.id }).then(value => {
      if (!cancelled) { setCast(value.performers ?? []); setCastBusy(false) }
    }).catch(() => { if (!cancelled) { setCastBusy(false); setError('Credits unavailable. Reload to retry.') } })
    return () => { cancelled = true }
  }, [current?.id, complete])

  useEffect(() => {
    if (preview || !team?.id) return
    let cancelled = false
    supabase.from('phone_answers').select('answer').eq('slide_id', slide.id).eq('team_id', team.id).maybeSingle()
      .then(({ data: row }) => {
        const answer = row?.answer
        if (cancelled || touchedRef.current || !Array.isArray(answer?.movies) || !Array.isArray(answer?.performers)) return
        if (answer.movies[0] !== start?.id || answer.movies.at(-1) !== end?.id || answer.performers.length !== answer.movies.length - 1) return
        const labels = data.movieChainResults?.find(result => result.teamId === team.id)?.movieLabels
        const restoredMovies = answer.movies.map((id, index) => id === start.id ? start : id === end.id ? end : { id, title: labels?.[index] ?? id })
        const restoredPerformers = answer.performers.map(id => ({ id, name: id }))
        setMovies(restoredMovies); setPerformers(restoredPerformers)
        setSavedChain({ movies: restoredMovies, performers: restoredPerformers })
        Promise.all(answer.movies.map(id => movieChainRequest('cast', { movieId: id })))
          .then(details => {
            if (cancelled || touchedRef.current) return
            const namedMovies = details.map((detail, index) => index === 0 ? start : index === details.length - 1 ? end : detail.movie)
            const namedPerformers = answer.performers.map((id, index) => details[index].performers.find(person => person.id === id) ?? { id, name: id })
            setMovies(namedMovies); setPerformers(namedPerformers)
            setSavedChain({ movies: namedMovies, performers: namedPerformers })
          }).catch(() => {})
      }).catch(() => {})
    return () => { cancelled = true }
  }, [slide.id, team?.id, preview, start?.id, end?.id])

  useEffect(() => { onAnswered?.(!!savedChain) }, [savedChain, onAnswered])

  async function search() {
    if (locked || !person || query.trim().length < 2) return
    setBusy(true); setError(''); setResults([]); setSearched(false)
    try { setResults(await movieChainRequest('search', { q: query.trim() })); setSearched(true) }
    catch { setError('Movie search unavailable. Try again.') }
    finally { setBusy(false) }
  }

  async function addMiddle(movie) {
    if (locked || !person || movies.some(item => item.id === movie.id)) { setError('That movie is already in your chain.'); return }
    if (movie.id === end.id) { setError('Choose your final performer, then finish at the ending movie.'); return }
    setBusy(true); setError('')
    try {
      const check = await movieChainRequest('check', { movieId: movie.id, personId: person.id, destinationId: end.id })
      if (check.kind !== 'valid') { setError(check.kind === 'destination' ? 'Finish at the ending movie below.' : `${person.name} is not credited in ${movie.title}.`); return }
      touchedRef.current = true
      setMovies([...movies, movie]); setPerformers([...performers, person]); setPerson(null); setPersonQuery(''); setQuery(''); setResults([]); setSearched(false)
    } catch { setError('Could not verify that connection. Try again.') }
    finally { setBusy(false) }
  }

  function finish() {
    if (!person || locked || complete) return
    touchedRef.current = true
    setMovies([...movies, end]); setPerformers([...performers, person]); setPerson(null); setResults([]); setError('')
  }

  function undo() {
    if (locked || movies.length < 2) return
    touchedRef.current = true
    setMovies(movies.slice(0, -1)); setPerformers(performers.slice(0, -1)); setPerson(null); setPersonQuery(''); setError('')
  }

  async function lockIn() {
    if (!complete || locked || busy) return
    if (preview) { setSavedChain({ movies, performers }); return }
    setBusy(true); setError('')
    const answer = { movies: movies.map(item => item.id), performers: performers.map(item => item.id) }
    try {
      const { error: saveError } = await Promise.race([
        supabase.from('phone_answers').upsert({ show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id, answer }, { onConflict: 'slide_id,team_id' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), MAX_SAVE_MS)),
      ])
      if (saveError) throw saveError
      setSavedChain({ movies, performers })
    } catch (caught) {
      // The database refuses writes once the host locks; the earlier saved chain still counts.
      setError(String(caught?.message ?? '').includes('movie_chain_locked')
        ? 'Chains just locked. Your last saved chain still counts.'
        : 'Could not save your chain. Check your connection and try again.')
    }
    finally { setBusy(false) }
  }

  const result = data.movieChainRevealed && Array.isArray(data.movieChainResults)
    ? data.movieChainResults.find(item => item.teamId === team?.id) : null
  return <section className="movie-chain-board" style={{ '--movie-chain-accent': accent, '--movie-chain-rule': `${ink}33`, color: ink, display: 'grid', gap: '1rem', fontFamily: theme?.fonts?.body }}>
    <p style={{ margin: 0, fontSize: '1.1rem', lineHeight: 1.35 }}>{data.text || 'Connect these movies through credited performers.'}</p>
    <div style={{ padding: '0.9rem', border: `1px solid ${accent}`, borderRadius: 14 }}>
      <strong>{start?.title ?? 'Starting movie'}</strong><span aria-hidden="true"> → </span><strong>{end?.title ?? 'Ending movie'}</strong>
      <p style={{ margin: '0.4rem 0 0', fontSize: '0.875rem' }}>Shortest chain: {data.movieChainCount} movies · 15 points; one extra movie: 10 points</p>
    </div>
    <ol className="movie-chain-path" aria-label="Your movie chain">
      {shownMovies.map((movie, index) => <li key={`${movie.id}-${index}`}>
        <span aria-hidden="true" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', border: `1px solid ${accent}`, display: 'grid', placeItems: 'center', color: accent, fontSize: '0.875rem', fontWeight: 700 }}>{index + 1}</span>
        <span className="movie-chain-path-name" style={{ lineHeight: 1.3 }}>
          {index > 0 && <span style={{ display: 'block', color: accent, fontSize: '0.875rem', marginBottom: 2 }}>via {shownPerformers[index - 1]?.name ?? 'performer'}</span>}
          <strong style={{ fontWeight: 650 }}>{movie.title}</strong>
        </span>
      </li>)}
    </ol>
    {!locked && <>
      {movies.length > 1 && <button type="button" onClick={undo} disabled={busy} style={{ color: ink, border: `1px solid ${ink}66`, borderRadius: 10, padding: '0.6rem' }}>Undo last step</button>}
      {!complete && <>
        {person ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.7rem', padding: '0.5rem 0.7rem', border: `1px solid ${accent}`, borderRadius: 10, background: `${accent}22` }}>
          <div style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: '0.875rem', opacity: 0.8 }}>Selected performer</span><strong style={{ overflowWrap: 'anywhere' }}>{person.name}</strong></div>
          <button type="button" onClick={() => { setPerson(null); setQuery(''); setResults([]); setSearched(false) }} disabled={busy} style={{ flexShrink: 0, padding: '0.5rem', border: `1px solid ${ink}66`, borderRadius: 8, color: ink }}>Change</button>
        </div> : <>
          <p style={{ margin: 0 }}>Choose a performer credited in <strong>{current?.title}</strong>.</p>
          <input aria-label="Find a performer" value={personQuery} onChange={event => setPersonQuery(event.target.value)} placeholder="Find a performer" style={{ width: '100%', padding: '0.7rem', borderRadius: 8, color: '#111' }} />
          {castBusy && <p style={{ margin: 0, opacity: 0.8 }}>Loading credited performers…</p>}
          {!castBusy && visibleCast.length === 0 && <p style={{ margin: 0, opacity: 0.85, fontSize: '0.9rem' }}>{availableCast.length === 0 ? 'No unused credited performers are available for this movie.' : 'No performers match that search.'}</p>}
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 4 }}>
            {visibleCast.map(candidate => <button type="button" key={candidate.id} data-person-id={candidate.id} onClick={() => { setPerson(candidate); setError('') }}
              style={{ textAlign: 'left', padding: '0.65rem 0.75rem', borderRadius: 8, color: ink, border: `1px solid ${ink}44`, background: 'transparent' }}>{candidate.name}</button>)}
          </div>
        </>}
        {person && <>
          {canAddMiddle && <div style={{ display: 'flex', gap: 6 }}>
            <input aria-label="Search next movie" value={query} onChange={event => { setQuery(event.target.value); setSearched(false) }} onKeyDown={event => { if (event.key === 'Enter') search() }} placeholder="Search next movie" style={{ minWidth: 0, flex: 1, padding: '0.7rem', borderRadius: 8, color: '#111' }} />
            <button type="button" onClick={search} disabled={busy || query.trim().length < 2} style={{ color: ink, border: `1px solid ${accent}`, borderRadius: 8, padding: '0.7rem' }}>Search</button>
          </div>}
          {results.map(movie => <button type="button" key={movie.id} onClick={() => addMiddle(movie)} style={{ textAlign: 'left', color: ink, border: `1px solid ${ink}44`, borderRadius: 8, padding: '0.7rem' }}>{movie.title}{movie.year ? ` (${movie.year})` : ''}</button>)}
          {searched && results.length === 0 && <p style={{ margin: 0, fontSize: '0.9rem' }}>No films found. Try a shorter title.</p>}
          <button type="button" data-action="finish" onClick={finish} style={{ color: ink, border: `2px solid ${accent}`, borderRadius: 10, padding: '0.8rem', fontWeight: 700 }}>Finish with {person.name} → {end?.title}</button>
        </>}
      </>}
      {complete && <button type="button" data-action="lock-in" onClick={lockIn} disabled={busy || committed} style={{ color: ink, border: `2px solid ${accent}`, borderRadius: 10, padding: '0.9rem', fontWeight: 700 }}>{busy ? 'Saving…' : committed ? 'Chain locked in' : 'Lock In Chain'}</button>}
    </>}
    {error && <p role="alert" style={{ color: '#ff8888', margin: 0 }}>{error}</p>}
    {result ? <div style={{ border: `1px solid ${accent}`, borderRadius: 12, padding: '0.8rem', lineHeight: 1.4 }}>
      <strong>{result.valid ? `Connected! +${result.points} points` : 'Chain did not score · 0 points'}</strong>
      <p style={{ margin: '0.3rem 0 0' }}>{result.performerLabels?.at(-1) ?? result.performers?.at(-1) ?? 'Final performer'} {result.finalConnected ? 'is credited in' : 'is not credited in'} {end?.title}. {result.movieCount ?? movies.length} movies in your chain.</p>
      {result.corrected && <p style={{ margin: '0.3rem 0 0' }}>Host corrected this result.</p>}
    </div>
      : data.movieChainRevealed ? <p role="status" style={{ margin: 0 }}>No scored chain recorded for your team.</p>
        : savedChain ? <p role="status" style={{ margin: 0 }}>{locked ? 'Waiting for the host to reveal the final connection.' : committed ? 'Waiting for the host to reveal the final connection.' : 'Your previous chain remains submitted until you lock in this revision.'}</p>
          : locked ? <p role="status" style={{ margin: 0 }}>Chains are locked. No chain was submitted.</p> : null}
  </section>
}
