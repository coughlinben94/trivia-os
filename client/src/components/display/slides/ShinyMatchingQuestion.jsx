import { motion, useReducedMotion } from 'framer-motion'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { EASE_PANEL } from '../../../lib/easings.js'
import { seededShuffle } from '../../../lib/matchingScoring.js'

// Two-beat pan reveal (2026-08-18, Ben: "make it not so different — pans
// up, so does the swing round questions") — same mechanic as
// ShinySwingVisualQuestion: a 200%-tall track holding both beats stacked,
// panning by exactly one stage-height (-50% of the track's own 200%
// height) lands pixel-exact on beat 2 regardless of actual stage size.
// Beat 1 (shuffled right column, no badges) sits on screen for however
// long teams take to submit on their phones; locking + scoring flips
// data.matchingRevealed, panning up to beat 2 (right column back in
// pairs' own order, gold badges). Replaces the earlier per-tile `layout`
// reorder — each beat is now its own static, fully-mounted layout, so
// there's nothing to reorder or reflow: the fixed-point-shuffle giveaway
// and the badge-mount jerk that reorder needed real fixes for don't apply
// to two independently-laid-out beats. seededShuffle's fixed-point
// avoidance (matchingScoring.js) still matters here for a different
// reason — without it, beat 1 could by chance show a pair already
// side-by-side, giving the answer away before the pan.
export default function ShinyMatchingQuestion({ slide, theme }) {
  const { data } = slide
  const pairs = data.pairs ?? []
  const revealed = !!data.matchingRevealed
  const reduce = useReducedMotion()

  const leftItems = pairs.map((p, i) => ({ id: p.id, label: p.left, image: p.leftImage, pairRank: i }))
  const shuffledRight = seededShuffle(pairs, slide.id ?? 'preview')
    .map(p => ({ id: p.id, label: p.right, image: p.rightImage, pairRank: pairs.findIndex(x => x.id === p.id) }))
  const matchedRight = pairs.map((p, i) => ({ id: p.id, label: p.right, image: p.rightImage, pairRank: i }))

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.colors.shinyBg }}>
      <motion.div
        className="absolute left-0 right-0 top-0"
        style={{ height: '200%' }}
        animate={{ y: revealed ? '-50%' : '0%' }}
        transition={{ duration: reduce ? 0 : 0.85, ease: EASE_PANEL }}
      >
        {/* Beat 1 — shuffled, unrevealed */}
        <div className="w-full flex items-center justify-center px-24" style={{ height: '50%' }}>
          <MatchBoard leftItems={leftItems} rightItems={shuffledRight} theme={theme} revealed={false} />
        </div>

        {/* Beat 2 — matched order, revealed by the pan */}
        <div className="w-full flex items-center justify-center px-24" style={{ height: '50%' }}>
          <MatchBoard leftItems={leftItems} rightItems={matchedRight} theme={theme} revealed />
        </div>
      </motion.div>
    </div>
  )
}

function MatchBoard({ leftItems, rightItems, theme, revealed }) {
  return (
    <div style={{ display: 'flex', gap: '6vw', width: '100%', maxWidth: 1400, height: '100%' }}>
      <MatchColumn items={leftItems} theme={theme} revealed={revealed} />
      <MatchColumn items={rightItems} theme={theme} revealed={revealed} />
    </div>
  )
}

function MatchColumn({ items, theme, revealed }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, height: '100%', justifyContent: 'center' }}>
      {items.map(item => (
        <div
          key={item.id}
          style={item.image
            // Image items: this is now just the flex ROW SLOT — sizing
            // authority moved to the inner aspect-ratio box below. A
            // width-driven `aspect-ratio` box (the old approach here) wants
            // a fixed height regardless of how many rows are sharing the
            // column, and flex's own shrink algorithm doesn't reliably
            // compress an aspect-ratio-derived hypothetical size — with 4
            // rows of images (confirmed live 2026-08-18: TMNT, state flags,
            // Pokémon) that fixed height added up to MORE than the column's
            // actual height, clipping the last row off the bottom of the
            // canvas. flex:1/minHeight:0 here lets this slot genuinely
            // shrink to whatever 4-way split the column has room for; the
            // inner box then fits itself inside that, so tiles stay a
            // uniform 3:2 (Ben's fix, still true) when there's room, and
            // shrink together (never crop) when there isn't.
            ? { position: 'relative', display: 'flex', flex: '1 1 0', minHeight: 0, width: '100%', alignItems: 'center', justifyContent: 'center' }
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
          {/* The right column is shuffled independently in beat 1, so
              nothing else shows which left item pairs with which right
              item until beat 2 — this rank badge (shared by both halves of
              the same pair) is that correspondence. Only rendered in beat
              2's own static tree, so there's no mount-time reflow to guard
              against — it's part of that beat's layout from the start. */}
          {revealed && !item.image && (
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '1.8rem', height: '1.8rem', borderRadius: '50%',
              background: 'rgba(0,0,0,0.18)', fontSize: '1rem', fontWeight: 700, flexShrink: 0,
            }}>
              {item.pairRank + 1}
            </span>
          )}
          {item.image ? (
            // Inner box now owns the 3:2 shape — maxWidth/maxHeight:100%
            // means it fits inside whatever the outer flex slot actually
            // has room for (see the slot's own comment above), instead of
            // dictating a height the slot has to accommodate. object-fit:
            // contain, not cover — matching tile art (turtle heads ~1:1,
            // weapon closeups ~3:4 portrait) doesn't reliably come in a 3:2
            // landscape ratio the way flags do; cover crops a portrait
            // source down to a thin center sliver (found live 2026-08-18:
            // weapon tiles showed almost nothing but a diagonal handle
            // line). contain always shows the whole image, letterboxed on
            // the tinted panel background instead of cropped.
            <div style={{ position: 'relative', width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', aspectRatio: '3 / 2', borderRadius: 10, overflow: 'hidden', boxShadow: '0 6px 22px rgba(0,0,0,0.45)', background: 'rgba(255,255,255,0.06)', padding: '0.6rem' }}>
              <img src={item.image} alt={item.label || ''} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              {revealed && (
                <span style={{
                  position: 'absolute', top: -8, left: -8, zIndex: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '1.8rem', height: '1.8rem', borderRadius: '50%',
                  background: SHINY_GOLD, color: '#1a1a1a', fontSize: '1rem', fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                }}>
                  {item.pairRank + 1}
                </span>
              )}
            </div>
          ) : (
            item.label
          )}
        </div>
      ))}
    </div>
  )
}
