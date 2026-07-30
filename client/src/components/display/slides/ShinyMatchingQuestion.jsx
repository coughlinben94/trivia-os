import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { seededShuffle } from '../../../lib/matchingScoring.js'

export default function ShinyMatchingQuestion({ slide, theme }) {
  const { data } = slide
  const pairs = data.pairs ?? []
  const locked = !!data.matchingLocked
  const revealed = !!data.matchingRevealed
  const [submittedCount, setSubmittedCount] = useState(0)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { count } = await supabase
        .from('phone_answers')
        .select('id', { count: 'exact', head: true })
        .eq('slide_id', slide.id)
      if (!cancelled) setSubmittedCount(count ?? 0)
    }
    load()
    const channel = supabase
      .channel(`phone_answers:${slide.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phone_answers', filter: `slide_id=eq.${slide.id}` }, load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [slide.id])

  const text = theme.colors.text

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: '4rem' }}>
      <div style={{ display: 'flex', gap: '6vw', width: '100%', maxWidth: 1400, justifyContent: 'space-between' }}>
        <Column items={pairs.map(p => ({ id: p.id, label: p.left }))} theme={theme} revealed={revealed} shouldReduceMotion={shouldReduceMotion} />
        <Column items={seededShuffle(pairs, slide.id ?? 'preview').map(p => ({ id: p.id, label: p.right }))} theme={theme} revealed={revealed} shouldReduceMotion={shouldReduceMotion} />
      </div>
      {!locked && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          style={{ marginTop: '2.5rem', color: `${text}70`, fontSize: '1.1rem', fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif` }}
        >
          {submittedCount} team{submittedCount === 1 ? '' : 's'} submitted
        </motion.p>
      )}
      {locked && !revealed && (
        <p style={{ marginTop: '2.5rem', color: `${text}45`, fontSize: '1rem', fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif` }}>
          Locked — scoring…
        </p>
      )}
    </div>
  )
}

function Column({ items, theme, revealed, shouldReduceMotion }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(12px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          transition={{ duration: 0.28, delay: i * 0.05, ease: EASE_OUT }}
          style={{
            padding: '1.25rem 1.75rem',
            borderRadius: 14,
            fontSize: '1.4rem',
            fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
            color: revealed ? '#1a1a1a' : theme.colors.text,
            background: revealed ? SHINY_GOLD : 'rgba(255,255,255,0.06)',
            border: revealed ? 'none' : '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {item.label}
        </motion.div>
      ))}
    </div>
  )
}
