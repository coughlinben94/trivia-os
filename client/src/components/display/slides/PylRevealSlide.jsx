import { useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import SlideElements from '../SlideElements.jsx'
import ErrorBoundary from '../../ErrorBoundary.jsx'
import { getSelectionAnimation } from './selectionAnimations.js'
import { supabase } from '../../../lib/supabase.js'
import { useFitListToBox, LIST_ITEM_FLOOR, LIST_ITEM_CEIL } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'

export default function PylRevealSlide({ slide, show, isPreview = false }) {
  const { theme } = useTheme()
  const { data } = slide
  const reduce = useReducedMotion()

  const showAnimation = !isPreview && data.animationId && data.winnerId

  // Hoisted above the showAnimation early return below — hooks can't be called
  // conditionally, and items.map() feeds the useFitListToBox call right here.
  const items = data.stages ?? data.items ?? []
  const listBoxRef = useRef(null)
  const rowSize = useFitListToBox(listBoxRef, items.map(x => x.text), {
    family: theme.fonts.body,
    floorPx: LIST_ITEM_FLOOR * 16,
    ceilPx: LIST_ITEM_CEIL * 16,
    gapPx: 12,
    rowInset: 176,
    maxLinesPerRow: 2,
  })

  async function advancePYL() {
    const sorted = [...(show.slides ?? [])].sort((a, b) => a.order - b.order)
    const cur = show.current_slide_index ?? 0
    const next = Math.min(cur + 1, sorted.length - 1)
    await supabase.from('shows').update({
      current_slide_index: next,
      current_slide_id: sorted[next]?.id ?? null,
    }).eq('id', show.id)
  }

  if (showAnimation) {
    const Anim = getSelectionAnimation(data.animationId)
    return (
      <div className="w-full h-full relative">
        <ErrorBoundary>
          <Anim
            candidates={data.pool ?? []}
            winnerId={data.winnerId}
            theme={theme}
            onDone={advancePYL}
          />
        </ErrorBoundary>
      </div>
    )
  }

  // currentReveal: how many items are revealed (0 = none, items.length = all)
  const revealed = data.currentReveal ?? 0

  const visibleItems = items.slice(0, revealed)
  const hiddenCount  = items.length - revealed

  const totalPoints = visibleItems.reduce((sum, item) => sum + (item.points ?? 0), 0)

  return (
    <div
      className="w-full h-full relative flex flex-col overflow-hidden"
      style={{ background: theme.colors.bgDeep }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 50% 30%, ${theme.colors.shinyBg} 0%, transparent 70%)`,
        }}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
        className="relative z-10 px-16 pt-14 pb-6 shrink-0 text-center"
      >
        <p
          style={{
            color: theme.colors.textMuted,
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Press Your Luck
        </p>
        <h2
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: theme.colors.highlight,
            fontSize: 'clamp(2rem, 4vw, 4rem)',
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          {data.title || 'Name the…'}
        </h2>
      </motion.div>

      {/* Items — centered as a block, not pinned to the top-left */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center overflow-y-auto px-16 pb-10">
        <div ref={listBoxRef} className="w-full max-w-4xl flex flex-col gap-3">
          <AnimatePresence>
            {visibleItems.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: reduce ? 0 : 18, scale: reduce ? 1 : 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.28, ease: EASE_OUT }}
                className="flex items-center gap-5 px-6 py-4 rounded-2xl"
                style={{ background: `${theme.colors.accent}35` }}
              >
                <span
                  className="shrink-0"
                  style={{
                    fontFamily: `'${theme.fonts.display}', sans-serif`,
                    color: theme.colors.textMuted,
                    fontSize: '1rem',
                    fontWeight: 700,
                    minWidth: 28,
                    textAlign: 'right',
                  }}
                >
                  {i + 1}.
                </span>
                <p
                  className="flex-1"
                  style={{
                    fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                    color: theme.colors.text,
                    fontSize: `${rowSize}px`,
                    fontWeight: 500,
                  }}
                >
                  {item.text}
                </p>
                {item.points != null && (
                  <span
                    style={{
                      fontFamily: `'${theme.fonts.display}', sans-serif`,
                      color: theme.colors.shinyAccent,
                      fontSize: '1.5rem',
                      fontWeight: 700,
                    }}
                  >
                    +{item.points}
                  </span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Hidden placeholders */}
          {Array.from({ length: hiddenCount }, (_, i) => (
            <div
              key={`hidden-${i}`}
              className="flex items-center gap-5 px-6 py-4 rounded-2xl"
              style={{ background: `${theme.colors.accent}18`, opacity: 0.5 }}
            >
              <span
                style={{ color: theme.colors.textMuted, fontSize: '1rem', fontWeight: 700, minWidth: 28, textAlign: 'right' }}
              >
                {revealed + i + 1}.
              </span>
              <div
                className="flex-1 rounded-full"
                style={{ height: 10, background: `${theme.colors.accent}40` }}
              />
              {items[revealed + i]?.points != null && (
                <span style={{ color: theme.colors.accent, fontSize: '1.5rem', fontWeight: 700 }}>
                  +{items[revealed + i].points}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Running total — bottom */}
      {revealed > 0 && (
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
          className="relative z-10 shrink-0 px-16 py-5 flex items-center justify-center gap-3 border-t"
          style={{ borderColor: `${theme.colors.accent}40` }}
        >
          <span style={{ color: theme.colors.textMuted, fontSize: '1rem', fontWeight: 600 }}>
            Total so far:
          </span>
          <span
            style={{
              fontFamily: `'${theme.fonts.display}', sans-serif`,
              color: theme.colors.shinyAccent,
              fontSize: '2rem',
              fontWeight: 700,
            }}
          >
            +{totalPoints}
          </span>
        </motion.div>
      )}

      <SlideElements elements={data.elements} theme={theme} />
    </div>
  )
}
