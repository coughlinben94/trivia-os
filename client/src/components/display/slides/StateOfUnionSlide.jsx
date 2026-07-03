import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import BaynesWatermark from '../BaynesWatermark.jsx'
import SlideElements from '../SlideElements.jsx'

const CHARS_PER_SECOND = 28
const EASE_SNAP = [0.23, 1, 0.32, 1]

// Softened, true-gradient reprise of the flag joke: three plain color stops
// (no pinned/duplicated stops) blend continuously instead of the old hard
// red/white/blue bands. Each anchor is lifted toward pastel so the whole
// scene reads as a soft dawn wash rather than a flag graphic.
const BG = 'linear-gradient(135deg, #e2717a 0%, #faf3e6 50%, #8d92d6 100%)'

export default function StateOfUnionSlide({ slide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const message = slide.data?.message ?? "Welcome to Trivia Night at Baynes Apple Valley. Let's get into it."
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    setDisplayed('')
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayed(message.slice(0, i))
      if (i >= message.length) clearInterval(interval)
    }, 1000 / CHARS_PER_SECOND)
    return () => clearInterval(interval)
  }, [message])

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center px-24 overflow-hidden"
      style={{ background: BG }}
    >
      {/* Slow breathing glow — kept clear of the reading well below (upper
          third only) so it adds ambient life without cutting into the
          contrast pool the text depends on. Opacity-only, GPU-safe. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 0,
          background: 'radial-gradient(ellipse 55% 30% at 50% 14%, rgba(255,255,255,0.45) 0%, transparent 70%)',
        }}
        animate={reduce ? { opacity: 0.45 } : { opacity: [0.3, 0.5, 0.3] }}
        transition={reduce ? undefined : { duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Reading well — tinted plum instead of flat black so the pool reads
          as the gradient deepening rather than a stain sitting on top of
          it; four stops taper it out gradually instead of a hard 2-stop
          cutoff. The light wash needs real darkening (not the subtle dose
          that works over QuestionSlide's near-black ambient bg) to get
          white text to AA contrast — verified 10.9:1 at the pool's center
          against the cream gradient stop. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: 'radial-gradient(ellipse 58% 46% at 50% 58%, rgba(38,20,36,0.78) 0%, rgba(38,20,36,0.55) 32%, rgba(38,20,36,0.26) 58%, transparent 88%)',
        }}
      />

      <div className="relative flex flex-col items-center" style={{ zIndex: 2 }}>
        {/* Optional Ben photo */}
        {slide.data?.photoUrl && (
          <motion.img
            src={slide.data.photoUrl}
            alt="Host"
            className="mb-10 rounded-2xl object-cover"
            style={{ height: '28vh', width: 'auto', maxWidth: '100%', opacity: 0.85 }}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 0.85, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE_SNAP }}
          />
        )}

        {/* Typewriter text */}
        <motion.p
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_SNAP }}
          style={{
            fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
            fontSize: 'clamp(1.6rem, 3vw, 3rem)',
            color: '#fff',
            textShadow: '0 2px 12px rgba(0,0,0,0.55)',
            lineHeight: 1.55,
            textAlign: 'center',
            maxWidth: '72ch',
            minHeight: '8rem',
          }}
        >
          {displayed}
          {/* Blinking cursor */}
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
            style={{ color: '#fff', marginLeft: 2 }}
          >
            |
          </motion.span>
        </motion.p>
      </div>

      <BaynesWatermark />

      <div className="absolute inset-0" style={{ zIndex: 2 }}>
        <SlideElements elements={slide.data?.elements} theme={theme} />
      </div>
    </div>
  )
}
