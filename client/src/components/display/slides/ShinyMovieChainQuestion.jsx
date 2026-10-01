import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '../../../lib/easings.js'
import ShinySignal from '../ShinySignal.jsx'
import { supabase } from '../../../lib/supabase.js'

export const lockedLabel = n => `${n} ${n === 1 ? 'team' : 'teams'} locked in`

export default function ShinyMovieChainQuestion({ slide, theme }) {
  const { data } = slide
  const reduce = useReducedMotion()
  const [submitted, setSubmitted] = useState(0)
  useEffect(() => {
    if (data.movieChainLocked || data.movieChainRevealed) return
    let cancelled = false
    const load = async () => {
      const { data: count } = await supabase.rpc('phone_answers_count', { p_slide_id: slide.id })
      if (!cancelled) setSubmitted(count ?? 0)
    }
    load(); const timer = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [slide.id, data.movieChainLocked, data.movieChainRevealed])
  const ink = theme.colors.text
  const gold = theme.colors.highlight
  const results = data.movieChainRevealed && Array.isArray(data.movieChainResults) ? data.movieChainResults : []
  const example = results.filter(result => result.valid).sort((a, b) => a.movieCount - b.movieCount)[0]
  const longChain = (example?.movieLabels?.length ?? 0) > 6
  const veryLongChain = (example?.movieLabels?.length ?? 0) > 10
  const counts = [15, 10, 0].map(points => results.filter(result => result.points === points).length)
  const title = data.text || 'Connect the movies'
  const titleSize = longChain ? '3.25rem' : title.length > 90 ? '3rem' : title.length > 55 ? '3.75rem' : '4.75rem'
  return <div style={{ position: 'relative', width: '100%', height: '100%', padding: longChain ? '2.5rem 5rem' : '4rem 6rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: longChain ? '1.4rem' : '2.5rem', color: ink, fontFamily: theme.fonts.body, overflow: 'hidden' }}>
    <ShinySignal />
    <p style={{ margin: 0, fontFamily: theme.fonts.display, fontSize: titleSize, lineHeight: 1.15, textAlign: 'center', textWrap: 'balance' }}>{title}</p>
    {!longChain && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem', fontSize: 'clamp(2rem, 3.2vw, 4rem)', fontWeight: 700, textAlign: 'center' }}>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', textWrap: 'balance' }}>{data.movieChainStart?.title ?? 'Starting movie'}</span>
      <span aria-hidden="true" style={{ color: gold }}>→</span>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', textWrap: 'balance' }}>{data.movieChainEnd?.title ?? 'Ending movie'}</span>
    </div>}
    <p style={{ margin: 0, textAlign: 'center', fontSize: longChain ? '2rem' : 'clamp(1.5rem, 2.4vw, 3rem)', color: gold }}>Shortest chain: {data.movieChainCount} movies</p>
    {!data.movieChainLocked && !data.movieChainRevealed && <p style={{ margin: 0, textAlign: 'center', fontSize: 'clamp(1.2rem, 1.7vw, 2rem)' }}>{lockedLabel(submitted)}</p>}
    {data.movieChainLocked && !data.movieChainRevealed && <p style={{ margin: 0, textAlign: 'center', fontSize: 'clamp(1.5rem, 2vw, 2.5rem)' }}>Answers locked · final connection coming up</p>}
    {data.movieChainRevealed && <motion.div initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT }} style={{ display: 'grid', gap: longChain ? '0.9rem' : '1.5rem' }}>
      {example ? <div style={{ border: `2px solid ${gold}`, borderRadius: 16, padding: longChain ? '0.8rem 1.2rem' : '1.2rem 1.6rem', textAlign: 'center', lineHeight: 1.3 }}>
        <strong style={{ display: 'block', fontSize: longChain ? '1.4rem' : '1.8rem', marginBottom: '0.65rem' }}>One successful chain</strong>
        <ol aria-label="Successful movie chain" style={longChain
          ? { display: 'grid', gridTemplateColumns: `repeat(${veryLongChain ? 4 : 5}, minmax(0, 1fr))`, alignItems: 'center', gap: '0.65rem 1rem', listStyle: 'none', padding: 0, margin: 0 }
          : { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '0.75rem 1.4rem', listStyle: 'none', padding: 0, margin: 0 }}>
          {example.movieLabels?.map((movie, index) => <li key={`${movie}-${index}`} style={{ minWidth: longChain ? 0 : 180, maxWidth: longChain ? 'none' : 300, overflowWrap: 'anywhere' }}>
            {index > 0 && <span style={{ display: 'block', color: gold, fontSize: longChain ? '1.4rem' : 'clamp(1.25rem, 1.5vw, 1.75rem)' }}>via {example.performerLabels?.[index - 1] ?? example.performers?.[index - 1]}</span>}
            <strong style={{ display: 'block', fontSize: longChain ? '2rem' : 'clamp(1.8rem, 2vw, 2.5rem)' }}><span style={{ color: gold }}>{index + 1}. </span>{movie}</strong>
          </li>)}
        </ol>
      </div> : <p style={{ textAlign: 'center', fontSize: '2rem' }}>No submitted chain connected both movies.</p>}
      <p style={{ margin: 0, textAlign: 'center', fontSize: longChain ? '1.5rem' : 'clamp(1.2rem, 1.8vw, 2rem)' }}>15 points: {counts[0]} {counts[0] === 1 ? 'team' : 'teams'} · 10 points: {counts[1]} {counts[1] === 1 ? 'team' : 'teams'} · 0 points: {counts[2]} {counts[2] === 1 ? 'team' : 'teams'}</p>
    </motion.div>}
  </div>
}
