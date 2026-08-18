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

  // Polled, not a postgres_changes subscription — phone_answers' SELECT
  // policy (tightened 2026-08-17) only allows the owning team or a
  // host_verified session to read a row, and Supabase Realtime enforces that
  // same RLS check before delivering a change event, not just on initial
  // fetch. /display is neither (it never goes through the host PIN gate,
  // same reason advance_show() exists as its own RPC) — a postgres_changes
  // subscription here would silently never fire. The count itself comes
  // from phone_answers_count(), a SECURITY DEFINER RPC that returns only the
  // aggregate this component actually needs, not raw rows.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: count } = await supabase.rpc('phone_answers_count', { p_slide_id: slide.id })
      if (!cancelled) setSubmittedCount(count ?? 0)
    }
    load()
    const interval = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [slide.id])

  const text = theme.colors.text

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', padding: '3rem' }}>
      {/* flex:1/minHeight:0 so image tiles below can stretch to fill the
          full available height (2026-08-18, Ben: images needed to take up
          the whole screen, not sit at a small fixed size) — text pills are
          unaffected, they keep their natural padding-based size and stay
          centered as a group via Column's own justifyContent. */}
      <div style={{ display: 'flex', gap: '6vw', width: '100%', maxWidth: 1400, justifyContent: 'space-between', flex: 1, minHeight: 0 }}>
        <Column items={pairs.map((p, i) => ({ id: p.id, label: p.left, image: p.leftImage, pairRank: i }))} theme={theme} revealed={revealed} shouldReduceMotion={shouldReduceMotion} />
        <Column items={seededShuffle(pairs, slide.id ?? 'preview').map(p => ({ id: p.id, label: p.right, image: p.rightImage, pairRank: pairs.findIndex(x => x.id === p.id) }))} theme={theme} revealed={revealed} shouldReduceMotion={shouldReduceMotion} />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, height: '100%', justifyContent: 'center' }}>
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(12px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          transition={{ duration: 0.28, delay: i * 0.05, ease: EASE_OUT }}
          style={item.image
            // Image items: no pill background/border (2026-08-18, Ben), but
            // a fixed uniform box is what actually makes that look right —
            // without it, tiles rendered at wildly different visual sizes
            // (a wide Ohio flag vs. a near-square Massachusetts crest) and
            // each image's own native background (often white) showed as a
            // stray rectangle floating on the dark stage. Same fix GridSlide's
            // Tile already uses: fixed box + object-fit:cover, so every tile
            // is the same footprint and fully filled — no exposed native
            // image background peeking out around the edges. flex:1/
            // minHeight:0 still claims an equal share of the column's height.
            // overflow stays on the OUTER element unset — it holds the
            // absolutely-positioned rank badge below, which sits slightly
            // outside the box (top:-8/left:-8); clipping here would cut the
            // badge off. Rounding/shadow/crop live on the inner image wrapper instead.
            ? { position: 'relative', display: 'flex', flex: 1, minHeight: 0, width: '100%', aspectRatio: '3 / 2' }
            : {
                display: 'flex', alignItems: 'center', gap: '0.9rem',
                padding: '1.25rem 1.75rem',
                borderRadius: 14,
                fontSize: '1.4rem',
                fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
                color: revealed ? '#1a1a1a' : theme.colors.text,
                background: revealed ? SHINY_GOLD : 'rgba(255,255,255,0.06)',
                border: revealed ? 'none' : '1px solid rgba(255,255,255,0.12)',
              }
          }
        >
          {/* The right column is shuffled independently, so nothing else on
              screen shows which left item actually pairs with which right
              item once revealed — this rank badge (shared by both halves of
              the same pair, taken from the unshuffled pairs order) is that
              correspondence. */}
          {revealed && (
            <span style={item.image
              ? {
                  position: 'absolute', top: -8, left: -8, zIndex: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '1.8rem', height: '1.8rem', borderRadius: '50%',
                  background: SHINY_GOLD, color: '#1a1a1a', fontSize: '1rem', fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                }
              : {
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '1.8rem', height: '1.8rem', borderRadius: '50%',
                  background: 'rgba(0,0,0,0.18)', fontSize: '1rem', fontWeight: 700, flexShrink: 0,
                }
            }>
              {item.pairRank + 1}
            </span>
          )}
          {item.image ? (
            <div style={{ width: '100%', height: '100%', borderRadius: 10, overflow: 'hidden', boxShadow: '0 6px 22px rgba(0,0,0,0.45)' }}>
              <img src={item.image} alt={item.label || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            item.label
          )}
        </motion.div>
      ))}
    </div>
  )
}
