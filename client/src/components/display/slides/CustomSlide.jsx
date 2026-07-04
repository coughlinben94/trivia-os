import { motion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import SlideElements from '../SlideElements.jsx'
import { autoFitClamp, PARAGRAPH_TIERS, PARAGRAPH_FLOOR, PARAGRAPH_CEIL } from '../../../lib/autoFitText.js'

const EASE_SNAP = [0.23, 1, 0.32, 1]

export default function CustomSlide({ slide }) {
  const { theme } = useTheme()
  const { data } = slide

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden px-24 py-20"
      style={{ background: theme.colors.bgDeep }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 50% 45%, ${theme.colors.accent}25 0%, transparent 70%)`,
        }}
      />

      {data.mediaUrl && (
        <motion.div
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: EASE_SNAP }}
          className="relative z-10 mb-10 max-w-2xl"
        >
          <img
            src={data.mediaUrl}
            alt=""
            className="w-full rounded-2xl object-contain"
            style={{ maxHeight: '45vh' }}
          />
        </motion.div>
      )}

      {data.title && (
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: data.mediaUrl ? 0.1 : 0, duration: 0.28, ease: EASE_SNAP }}
          className="relative z-10 text-center mb-6"
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: theme.colors.highlight,
            fontSize: 'clamp(2.5rem, 6vw, 6rem)',
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          {data.title}
        </motion.h2>
      )}

      {data.body && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25, ease: EASE_SNAP }}
          className="relative z-10 text-center leading-relaxed max-w-4xl"
          style={{
            color: theme.colors.text,
            fontSize: autoFitClamp(data.body, PARAGRAPH_TIERS, PARAGRAPH_FLOOR, PARAGRAPH_CEIL),
            fontWeight: 400,
          }}
        >
          {data.body}
        </motion.p>
      )}

      <SlideElements elements={data.elements} theme={theme} />
    </div>
  )
}
