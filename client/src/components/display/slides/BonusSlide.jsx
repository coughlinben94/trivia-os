import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'

// A bonus-round announcement tile. Modeled on TitleSlide.jsx's structure
// (same entrance motion, same ambient-glow layer) but transparent by
// design — this type is in SlideRenderer's skipsLockedBackground() set, so
// the live ring/ambient background shows through instead of the opaque
// bgDeep lock every other freeform slide (Custom) gets. Text uses the fixed
// SHINY_GOLD/SHINY_GOLD_GLOW constants (the shiny SIGNAL, constant across
// all 21 themes — shinyGold.js) so this reads as a "shiny question title"
// over the ring, not a themed one that would drift color per theme.
//
// data: { text }
export default function BonusSlide({ slide }) {
  const { theme } = useTheme()
  const { data } = slide
  const reduce = useReducedMotion()

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'transparent' }}
    >
      {/* Ambient radial glow, gold-tinted to match the shiny signal rather
          than a per-theme accent — same idiom as TitleSlide's own glow. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 85% 65% at 50% 45%, ${SHINY_GOLD_GLOW}33 0%, transparent 70%)`,
        }}
      />

      <motion.h1
        initial={{ opacity: 0, y: reduce ? 0 : 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.5, ease: EASE_OUT }}
        className="relative z-10 text-center font-bold px-20"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: SHINY_GOLD,
          fontSize: 'clamp(2.75rem, 6.5vw, 6rem)',
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          textShadow: `0 3px 0 rgba(0,0,0,0.25), 0 2px 10px ${SHINY_GOLD_GLOW}40`,
        }}
      >
        {data.text || 'Bonus Round'}
      </motion.h1>
    </div>
  )
}
