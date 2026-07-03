import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import BaynesWatermark from '../BaynesWatermark.jsx'
import SlideElements from '../SlideElements.jsx'

const CHARS_PER_SECOND = 28

export default function StateOfUnionSlide({ slide }) {
  const { theme } = useTheme()
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
      className="absolute inset-0 flex flex-col items-center justify-center px-24"
      style={{
        background: 'linear-gradient(135deg, #b22234 0%, #b22234 30%, #f5f5f5 48%, #f5f5f5 52%, #3c3b6e 70%, #3c3b6e 100%)',
      }}
    >
      {/* Optional Ben photo */}
      {slide.data?.photoUrl && (
        <motion.img
          src={slide.data.photoUrl}
          alt="Host"
          className="mb-10 rounded-2xl object-cover"
          style={{ height: '28vh', width: 'auto', maxWidth: '100%', opacity: 0.85 }}
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 0.85, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        />
      )}

      {/* Typewriter text */}
      <p
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
          transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
          style={{ color: '#fff', marginLeft: 2 }}
        >
          |
        </motion.span>
      </p>

      <BaynesWatermark />

      <SlideElements elements={slide.data?.elements} theme={theme} />
    </div>
  )
}
