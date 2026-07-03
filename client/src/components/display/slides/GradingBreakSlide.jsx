import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import SlideElements from '../SlideElements.jsx'

const EASE_SNAP = [0.23, 1, 0.32, 1]

export default function GradingBreakSlide({ slide, isPreview = false }) {
  const { theme } = useTheme()
  const { data } = slide

  const message =
    data.message ||
    "Now, please sit back, relax, and enjoy each other's company as Ben grades papers 😊"

  const autoTimerRef = useRef(null)

  function transitionToJukebox() {
    clearTimeout(autoTimerRef.current)
    const lib = data.jukeboxLib ?? 'random'
    window.location.href = `https://trivia-jukebox.vercel.app?lib=${encodeURIComponent(lib)}`
  }

  // 10s auto-advance to Jukebox — disabled in editor preview
  useEffect(() => {
    if (isPreview) return
    autoTimerRef.current = setTimeout(transitionToJukebox, 10000)
    return () => clearTimeout(autoTimerRef.current)
  }, [isPreview])

  // Space / ArrowRight — skip the wait — disabled in editor preview
  useEffect(() => {
    if (isPreview) return
    const handler = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        transitionToJukebox()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isPreview])

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: 'transparent' }}>

      {/* Pulsing ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 75% 60% at 50% 50%, ${theme.colors.accent}45 0%, transparent 70%)`,
          animation: 'gradingGlow 4s ease-in-out infinite',
        }}
      />

      {/* Reading-well — soft radial darken behind text center, matches QuestionSlide legibility treatment */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 55% at 50% 55%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.22) 45%, transparent 72%)',
      }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {data.hostPhotoUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 0.88, scale: 1 }}
            transition={{ duration: 0.5, ease: EASE_SNAP }}
            className="relative z-10 mb-10"
          >
            <img
              src={data.hostPhotoUrl}
              alt="Ben"
              style={{
                height: 220,
                maxWidth: '100%',
                objectFit: 'contain',
                borderRadius: 16,
                filter: 'drop-shadow(0 12px 40px rgba(0,0,0,0.6))',
              }}
            />
          </motion.div>
        )}

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.28, ease: EASE_SNAP }}
          className="relative z-10 text-center px-24 leading-relaxed max-w-4xl"
          style={{
            color: theme.colors.text,
            fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
            fontSize: 'clamp(1.5rem, 3.5vw, 3.2rem)',
            fontWeight: 400,
          }}
        >
          {message}
        </motion.p>
      </div>

      <SlideElements elements={data.elements} theme={theme} />
    </div>
  )
}
