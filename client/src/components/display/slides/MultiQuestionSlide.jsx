import { useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { useFitListToBox, LIST_ITEM_FLOOR, LIST_ITEM_CEIL } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'

export default function MultiQuestionSlide({ slide, show }) {
  const { theme } = useTheme()
  const { data } = slide
  const reduce = useReducedMotion()
  const questions = data.questions ?? []
  const round = (show?.rounds ?? []).find(r => r.id === slide.roundId)

  const listBoxRef = useRef(null)
  const rowSize = useFitListToBox(listBoxRef, questions.map(q => q.text), {
    family: theme.fonts.body,
    floorPx: LIST_ITEM_FLOOR * 16,
    ceilPx: LIST_ITEM_CEIL * 16,
    gapPx: 20,
    rowInset: 192,
    maxLinesPerRow: 2,
    lineHeight: 1.4,
  })

  return (
    <div
      className="w-full h-full relative overflow-hidden flex flex-col"
      style={{ background: theme.colors.bgDeep }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% 30%, ${theme.colors.accent}20 0%, transparent 65%)`,
        }}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
        className="relative z-10 px-16 pt-14 pb-8 shrink-0"
      >
        {round && (
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
            {round.title}
          </p>
        )}
        <h2
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: theme.colors.highlight,
            fontSize: 'clamp(2rem, 4vw, 4rem)',
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          {data.seriesTitle || data.title || 'Questions'}
        </h2>
      </motion.div>

      {/* Question list */}
      <div ref={listBoxRef} className="relative z-10 flex-1 overflow-y-auto px-16 pb-14">
        <ol className="space-y-5">
          {questions.map((q, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: reduce ? 0 : -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + i * 0.05, duration: 0.22, ease: EASE_OUT }}
              className="flex gap-5 items-start"
            >
              <span
                className="shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 44,
                  height: 44,
                  background: theme.colors.accent,
                  fontFamily: `'${theme.fonts.display}', sans-serif`,
                  color: theme.colors.highlight,
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                {i + 1}
              </span>
              <p
                style={{
                  color: theme.colors.text,
                  fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                  fontSize: `${rowSize}px`,
                  fontWeight: 400,
                  lineHeight: 1.4,
                }}
              >
                {q.text}
              </p>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  )
}
