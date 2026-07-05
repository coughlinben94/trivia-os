import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import SlideElements from '../SlideElements.jsx'
import { EASE_OUT } from '../../../lib/easings.js'

export default function TitleSlide({ slide, show }) {
  const { theme } = useTheme()
  const { data } = slide
  const reduce = useReducedMotion()
  const rt = data._regionTransforms ?? {}
  const xf = id => { const t = rt[id]; return t ? { transform: `translate(${t.dx??0}px,${t.dy??0}px) rotate(${t.rotate??0}deg)`, transformOrigin: 'center', display: 'inline-block' } : {} }

  const dateStr = show?.date
    ? new Date(show.date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : null

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'transparent' }}
    >

      {/* Ambient radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 85% 65% at 50% 45%, ${theme.colors.accent}55 0%, transparent 70%)`,
        }}
      />

      {/* Title */}
      <span data-slide-region="title" data-slide-field="title" style={xf('title')}>
        <motion.h1
          initial={{ opacity: 0, y: reduce ? 0 : 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.5, ease: EASE_OUT }}
          className="relative z-10 text-center font-bold"
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: theme.colors.text,
            fontSize: 'clamp(3rem, 7vw, 6rem)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {data.title || 'Trivia Night'}
        </motion.h1>
      </span>

      {/* Subtitle */}
      {(data.subtitle || dateStr) && (
        <span data-slide-region="subtitle" data-slide-field="subtitle" style={xf('subtitle')}>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.65 }}
            transition={{ delay: 0.38, duration: 0.4, ease: EASE_OUT }}
            className="relative z-10 mt-5 text-center"
            style={{
              color: theme.colors.text,
              fontSize: 'clamp(1.25rem, 2.5vw, 2.5rem)',
              fontWeight: 300,
            }}
          >
            {data.subtitle || dateStr}
          </motion.p>
        </span>
      )}

      {/* Date (if subtitle already used) */}
      {data.subtitle && dateStr && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ delay: 0.5, duration: 0.3, ease: EASE_OUT }}
          className="relative z-10 mt-2 text-center text-xl"
          style={{ color: theme.colors.textMuted }}
        >
          {dateStr}
        </motion.p>
      )}

      <SlideElements elements={data.elements} theme={theme} />
    </div>
  )
}
