import { useMemo, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
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
  // Same detection SlideEditor.jsx's PylRevealEditor uses to tell the Theme
  // Picker board (plain named options, no points) from a scored reveal list.
  const isBoard = !data.stages && !!data.items
  const items = data.stages ?? data.items ?? []
  // Same round's other PYL boards are measured too — the smallest fit wins
  // for all of them, so consecutive boards don't pop different row sizes
  // (see useFitListToBox's `groups`).
  const groups = useMemo(() => {
    const siblings = (show?.slides ?? []).filter(s => s.type === 'pyl-reveal' && s.roundId === slide.roundId)
    return siblings.length ? siblings.map(s => (s.data?.stages ?? s.data?.items ?? []).map(x => x.text)) : null
  }, [show?.slides, slide.roundId])

  // Theme Picker board rows (isBoard) are a handful of short named options
  // ("Sports", "Song Lyrics") with tons of headroom left under the shared
  // 2.5rem list ceiling, which exists to keep long scored-stage lists from
  // overrunning — 2026-08-25, Ben: "can def be made bigger" on a 3-item
  // board. A scored/points list keeps the conservative ceiling unchanged.
  const listBoxRef = useRef(null)
  const rowSize = useFitListToBox(listBoxRef, items.map(x => x.text), {
    groups,
    family: theme.fonts.body,
    floorPx: LIST_ITEM_FLOOR * 16,
    ceilPx: (isBoard ? 5.5 : LIST_ITEM_CEIL) * 16,
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

  // Theme Picker board only (2026-08-18, Ben: click the theme the winning
  // team calls, jump straight into it, skip the other embedded theme(s)).
  // Disabled in preview so editing the slide can't accidentally move the
  // live show.
  //
  // Jumping in from the board is never a "continuing series sibling" the
  // way normal Next-advance can be (useShow.js's nextSlide() skips the
  // intro card via isShinySeriesSibling when consecutive slides share a
  // series) — the board is always a hard context switch into whichever
  // theme won. So this must force introDone/outroShown/currentPart back to
  // a fresh-entry state on the target, the same reset nextSlide() and
  // goLive() apply on ordinary entry (withEntryState) — otherwise a stale
  // introDone:true left over from a prior test pass makes the theme's
  // announce card silently skip (Ben, 2026-08-18: "the image plays before
  // the shiny title animation").
  async function jumpToSlide(targetSlideId) {
    if (isPreview || !targetSlideId) return
    const sorted = [...(show.slides ?? [])].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex(s => s.id === targetSlideId)
    if (idx < 0) return
    const target = sorted[idx]
    const newSlides = (show.slides ?? []).map(s =>
      s.id === target.id
        ? { ...s, data: { ...s.data, introDone: false, outroShown: false, currentPart: 0 } }
        : s
    )
    await supabase.from('shows').update({
      slides: newSlides,
      current_slide_index: idx,
      current_slide_id: target.id,
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

  // currentReveal: how many items are revealed (0 = none, items.length = all).
  // Boards (Theme Picker) have no progressive-reveal control anywhere in the
  // host UI — nothing ever increments currentReveal for one; the only writer
  // in the whole codebase is AddSlideWizard's initial `currentReveal:
  // items.length` at creation time, and SlideEditor's board row editor
  // (addRow/removeRow) never keeps it in sync when options are added/removed
  // afterward. A board whose items were built/edited that way — or created
  // by any path other than that one wizard call — is left with
  // currentReveal stuck below items.length FOREVER, rendering every option
  // as a blank hidden-placeholder bar with no way to reveal it (2026-08-25).
  // Boards were always meant to show all options immediately (a live
  // click-to-jump list, not a scored suspense reveal) — only the scored
  // "stages" mode actually uses progressive reveal — so gate on that
  // instead of a field nothing keeps current for boards.
  const revealed = isBoard ? items.length : (data.currentReveal ?? 0)

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
        {/* No placeholder fallback (2026-09-01, Ben live: "the 'name the'
            needs to go" / "its useless") — an untitled board used to render
            the editor's own input placeholder text as if it were real
            content on the TV. "Press Your Luck" above already frames the
            slide; an empty title just omits the line instead of faking one. */}
        {data.title && (
          <h2
            style={{
              fontFamily: `'${theme.fonts.display}', sans-serif`,
              color: theme.colors.highlight,
              fontSize: 'clamp(2rem, 4vw, 4rem)',
              fontWeight: 700,
              letterSpacing: '-0.01em',
            }}
          >
            {data.title}
          </h2>
        )}
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
                whileHover={item.targetSlideId && !isPreview ? { scale: 1.015 } : undefined}
                whileTap={item.targetSlideId && !isPreview ? { scale: 0.99 } : undefined}
                transition={{ duration: 0.28, ease: EASE_OUT }}
                onClick={item.targetSlideId ? () => jumpToSlide(item.targetSlideId) : undefined}
                data-no-step={item.targetSlideId ? true : undefined}
                className="flex items-center gap-5 px-6 py-4 rounded-2xl"
                style={{
                  background: `${theme.colors.accent}35`,
                  cursor: item.targetSlideId && !isPreview ? 'pointer' : 'default',
                }}
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

      {/* Running total — bottom. Board mode (Theme Picker) has no points at
          all, just named options to click — showing "+0" there is a
          leftover from the points-scoring stages branch, not a real total. */}
      {revealed > 0 && !isBoard && (
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
    </div>
  )
}
