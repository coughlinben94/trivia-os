import { motion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import ParticleBackground from '../ParticleBackground.jsx'

const EASE_SNAP = [0.23, 1, 0.32, 1]

export default function TitleSlide({ slide, show }) {
  const { theme } = useTheme()
  const { data } = slide

  const dateStr = show?.date
    ? new Date(show.date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : null

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden"
      style={{ background: theme.roundIntro.bgColor }}
    >
      <ParticleBackground theme={theme} />

      {/* Ambient radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 85% 65% at 50% 45%, ${theme.colors.accent}55 0%, transparent 70%)`,
        }}
      />

      {/* Baynes logo — centered, prominent */}
      <motion.div
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 0.9, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_SNAP }}
        className="relative z-10 mb-10"
      >
        <img
          src="/baynes-logo.svg"
          alt="Baynes Apple Valley"
          className="object-contain"
          style={{ height: 120, filter: 'brightness(0) invert(1)' }}
        />
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.5, ease: EASE_SNAP }}
        className="relative z-10 text-center font-bold"
        style={{
          fontFamily: `'Handters', 'Anton', sans-serif`,
          color: theme.roundIntro.titleColor,
          fontSize: 'clamp(4rem, 9vw, 9rem)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {data.title || 'Trivia Night'}
      </motion.h1>

      {/* Subtitle */}
      {(data.subtitle || dateStr) && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.65 }}
          transition={{ delay: 0.38, duration: 0.4, ease: EASE_SNAP }}
          className="relative z-10 mt-5 text-center"
          style={{
            color: theme.roundIntro.titleColor,
            fontSize: 'clamp(1.25rem, 2.5vw, 2.5rem)',
            fontWeight: 300,
          }}
        >
          {data.subtitle || dateStr}
        </motion.p>
      )}

      {/* Date (if subtitle already used) */}
      {data.subtitle && dateStr && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="relative z-10 mt-2 text-center text-xl"
          style={{ color: theme.colors.textMuted }}
        >
          {dateStr}
        </motion.p>
      )}
    </div>
  )
}
