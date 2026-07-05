import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '../../lib/easings.js'

// Every shiny question/grid gets a standalone beat before its content — a pure
// announcement, no question/answer/media yet, giving the host room to set
// up what's coming. Modeled on the deck's yellow "shiny round title card"
// slides (tilted handwritten-style title, Ben photo lower-left, format icon
// lower-right) but reworked to fit the app's per-show theme system instead
// of a hardcoded color, and to stay ambient rather than full-bleed — the
// ParticleBackground mounted behind every slide (Display.jsx) should still
// read through around the edges, not get covered by a flat color block.
//
// Shared by QuestionSlide.jsx (question type) and GridSlide.jsx (grid type)
// — any isShiny slide type can gate its content on `data.introDone` and
// render this first.

const SHINY_GOLD      = '#f0d890'
const SHINY_GOLD_GLOW = '#d4820c'

export default function ShinyIntroScreen({ slide, theme }) {
  const { data } = slide
  const reduce = useReducedMotion()
  const title = data.seriesTheme || data.shinyFormatName || 'Shiny Question'
  const icon = data.shinyFormatIcon || '✨'

  return (
    <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
      {/* Sunrise glow — theme-colored wash, not a full-screen fill, so the
          ambient background still shows through around the edges. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 85% 65% at 50% 62%, ${SHINY_GOLD_GLOW}4d 0%, ${SHINY_GOLD_GLOW}22 38%, transparent 72%)`,
        }}
      />

      {/* Host photo — lower-left */}
      {data.hostPhotoUrl && (
        <motion.img
          src={data.hostPhotoUrl}
          alt=""
          initial={{ opacity: 0, x: reduce ? 0 : -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.4, ease: EASE_OUT }}
          className="absolute bottom-0 left-0 z-10 pointer-events-none"
          style={{ height: '56%', maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.4))' }}
        />
      )}

      {/* Format icon badge — lower-right */}
      <motion.div
        initial={{ opacity: 0, scale: reduce ? 1 : 0.7, rotate: reduce ? 0 : -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 0.3, duration: 0.4, ease: EASE_OUT }}
        className="absolute bottom-10 right-10 z-10 flex items-center justify-center rounded-3xl"
        style={{
          width: 128, height: 128,
          background: theme.colors.bgDeep,
          boxShadow: `0 10px 30px rgba(0,0,0,0.4), 0 0 0 2px ${theme.colors.highlight}55`,
        }}
      >
        <span style={{ fontSize: '3.5rem' }}>{icon}</span>
      </motion.div>

      {/* Title — big, tilted, marker-style */}
      <motion.p
        initial={{ opacity: 0, scale: reduce ? 1 : 0.85, rotate: reduce ? -6 : -14 }}
        animate={{ opacity: 1, scale: 1, rotate: -6 }}
        transition={reduce ? { duration: 0.3, ease: EASE_OUT } : { type: 'spring', duration: 0.5, bounce: 0.25 }}
        className="relative z-10 text-center px-20"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: SHINY_GOLD,
          fontSize: 'clamp(2.75rem, 6.5cqw, 6rem)',
          fontWeight: 700,
          lineHeight: 1.08,
          textShadow: `0 3px 0 rgba(0,0,0,0.25), 0 2px 21.6px ${SHINY_GOLD_GLOW}80`,
        }}
      >
        {title}
      </motion.p>

      {/* Subtitle — optional per-instance line ("Dog Edition", "Bluegrass Cover") */}
      {data.introSubtitle && (
        <motion.p
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.35, ease: EASE_OUT }}
          className="absolute z-10 text-center px-20"
          style={{
            top: 'calc(50% + 5.5rem)',
            fontFamily: `'${theme.fonts.ui}', 'Inter', sans-serif`,
            color: theme.colors.text,
            fontSize: 'clamp(1.1rem, 2.2cqw, 1.6rem)',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
          }}
        >
          {data.introSubtitle}
        </motion.p>
      )}
    </div>
  )
}
