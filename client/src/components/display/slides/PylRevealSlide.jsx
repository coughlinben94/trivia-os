import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'

const EASE_SNAP   = [0.23, 1, 0.32, 1]
const EASE_SMOOTH = [0.4, 0, 0.2, 1]

export default function PylRevealSlide({ slide, show }) {
  const { theme } = useTheme()
  const { data } = slide

  const items = data.items ?? []
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
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE_SNAP }}
        className="relative z-10 px-16 pt-14 pb-6 shrink-0"
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

      {/* Items */}
      <div className="relative z-10 flex-1 overflow-y-auto px-16 pb-10 space-y-3">
        <AnimatePresence>
          {visibleItems.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28, ease: EASE_SNAP }}
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
                  color: theme.colors.text,
                  fontSize: 'clamp(1.25rem, 2.5vw, 2.5rem)',
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

      {/* Running total — bottom */}
      {revealed > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE_SNAP }}
          className="relative z-10 shrink-0 px-16 py-5 flex items-center justify-end gap-3 border-t"
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
