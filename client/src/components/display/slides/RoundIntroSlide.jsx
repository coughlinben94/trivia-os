import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import SlideElements from '../SlideElements.jsx'

const EASE_SNAP = [0.23, 1, 0.32, 1]

export default function RoundIntroSlide({ slide, show }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const { data } = slide
  const isSwing = slide.type === 'swing-round-intro'

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden"
      style={{ background: theme.roundIntro.bgColor }}
    >
      {/* Ambient backdrop glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${theme.colors.accent}60 0%, transparent 70%)`,
        }}
      />

      {/* Baynes logo — centered above, 35% opacity — Section 21 */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 0.35, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_SNAP }}
        className="absolute pointer-events-none"
        style={{ top: 48 }}
      >
        <img
          src="/baynes-logo.svg"
          alt=""
          style={{ height: 56, filter: 'brightness(0) invert(1)' }}
        />
      </motion.div>

      {/* Round number — SLAM in with spring overshoot — Section 5 */}
      <motion.div
        initial={reduce ? { opacity: 0 } : { scale: 3.5, opacity: 0 }}
        animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
        transition={reduce
          ? { duration: 0.3, ease: EASE_SNAP }
          : { type: 'spring', duration: 0.4, bounce: 0.25 }}
        className="relative z-10"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: theme.roundIntro.numberColor,
          fontSize: 'clamp(6rem, 20vw, 18rem)',
          lineHeight: 0.9,
          fontWeight: 700,
          letterSpacing: '-0.04em',
        }}
      >
        {data.roundNumber}
      </motion.div>

      {/* Round title — slides up — Section 5: delay 0.2s, 0.25s duration */}
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.25, ease: EASE_SNAP }}
        className="relative z-10 text-center mt-2"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: theme.roundIntro.titleColor,
          fontSize: 'clamp(2.5rem, 5vw, 5rem)',
          fontWeight: 700,
          letterSpacing: '-0.01em',
        }}
      >
        {data.roundTitle}
      </motion.div>

      {/* Subtitle — fades in — Section 5: 0.1s after title, 0.2s duration */}
      {data.subtitle && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.55, duration: 0.2 }}
          className="relative z-10 mt-4 text-center italic"
          style={{
            color: theme.roundIntro.titleColor,
            fontSize: 'clamp(1.5rem, 3vw, 3rem)',
            fontWeight: 300,
          }}
        >
          {data.subtitle}
        </motion.div>
      )}

      {/* Ben photo — swing rounds get it more prominently */}
      {data.hostPhotoUrl && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: isSwing ? 0.75 : 0.55, scale: 1 }}
          transition={{ delay: 0.35, duration: 0.4, ease: EASE_SNAP }}
          className="absolute pointer-events-none"
          style={{ bottom: 32, right: 48 }}
        >
          <img
            src={data.hostPhotoUrl}
            alt=""
            style={{
              height: isSwing ? 220 : 160,
              objectFit: 'contain',
              filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.6))',
            }}
          />
        </motion.div>
      )}

      {/* Swing round: extra theatrical theme label */}
      {isSwing && data.theme && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: 'spring', duration: 0.5, bounce: 0.2 }}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 px-8 py-3 rounded-full"
          style={{ background: theme.colors.shinyAccent + '22', border: `2px solid ${theme.colors.shinyAccent}66` }}
        >
          <span style={{ color: theme.colors.shinyAccent, fontFamily: `'${theme.fonts.display}', sans-serif`, fontSize: '1.5rem' }}>
            {data.theme}
          </span>
        </motion.div>
      )}

      <SlideElements elements={data.elements} theme={theme} />
    </div>
  )
}
