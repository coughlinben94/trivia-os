import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '../../../lib/easings.js'
import ShinySignal from '../ShinySignal.jsx'
import { supabase } from '../../../lib/supabase.js'

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
  const counts = [15, 10, 0].map(points => results.filter(result => result.points === points).length)
  return <div style={{ position: 'relative', width: '100%', height: '100%', padding: '4rem 6rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2.5rem', color: ink, fontFamily: theme.fonts.body, overflow: 'hidden' }}>
    <ShinySignal />
    <p style={{ margin: 0, fontFamily: theme.fonts.display, fontSize: 'clamp(2.5rem, 4vw, 5rem)', lineHeight: 1.15, textAlign: 'center' }}>{data.text || 'Connect the movies'}</p>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem', fontSize: 'clamp(2rem, 3.2vw, 4rem)', fontWeight: 700, textAlign: 'center' }}>
      <span style={{ flex: 1 }}>{data.movieChainStart?.title ?? 'Starting movie'}</span>
      <span aria-hidden="true" style={{ color: gold }}>→</span>
      <span style={{ flex: 1 }}>{data.movieChainEnd?.title ?? 'Ending movie'}</span>
    </div>
    <p style={{ margin: 0, textAlign: 'center', fontSize: 'clamp(1.5rem, 2.4vw, 3rem)', color: gold }}>Shortest chain: {data.movieChainCount} movies</p>
    {!data.movieChainLocked && !data.movieChainRevealed && <p style={{ margin: 0, textAlign: 'center', fontSize: 'clamp(1.2rem, 1.7vw, 2rem)' }}>{submitted} teams locked in</p>}
    {data.movieChainLocked && !data.movieChainRevealed && <p style={{ margin: 0, textAlign: 'center', fontSize: 'clamp(1.5rem, 2vw, 2.5rem)' }}>Answers locked · final connection coming up</p>}
    {data.movieChainRevealed && <motion.div initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT }} style={{ display: 'grid', gap: '1.5rem' }}>
      {example ? <div style={{ border: `2px solid ${gold}`, borderRadius: 24, padding: '1.4rem 2rem', textAlign: 'center', fontSize: 'clamp(1.3rem, 1.8vw, 2.2rem)', lineHeight: 1.5 }}>
        <strong>One successful chain</strong>
        <div>{example.movieLabels?.map((movie, index) => <span key={`${movie}-${index}`}>{index > 0 && <span style={{ color: gold }}> ← {example.performerLabels?.[index - 1] ?? example.performers?.[index - 1]} → </span>}{movie}</span>)}</div>
      </div> : <p style={{ textAlign: 'center', fontSize: '2rem' }}>No submitted chain connected both movies.</p>}
      <p style={{ margin: 0, textAlign: 'center', fontSize: 'clamp(1.2rem, 1.8vw, 2rem)' }}>15 points: {counts[0]} {counts[0] === 1 ? 'team' : 'teams'} · 10 points: {counts[1]} {counts[1] === 1 ? 'team' : 'teams'} · 0 points: {counts[2]} {counts[2] === 1 ? 'team' : 'teams'}</p>
    </motion.div>}
  </div>
}
