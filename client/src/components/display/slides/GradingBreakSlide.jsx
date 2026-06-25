import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { supabase } from '../../../lib/supabase.js'

const EASE_SNAP = [0.23, 1, 0.32, 1]
const JUKEBOX_EMBED_URL = 'https://trivia-jukebox.vercel.app?embed=true'

export default function GradingBreakSlide({ slide, show }) {
  const { theme } = useTheme()
  const { data } = slide

  const message =
    data.message ||
    "Now, please sit back, relax, and enjoy each other's company as Ben grades papers 😊"

  // 'text' = phase 1 (grading break message), 'jukebox' = phase 2 (iframe)
  const [phase, setPhase] = useState('text')
  // iframeMounted: true once we begin transitioning — iframe starts loading during the fade
  const [iframeMounted, setIframeMounted] = useState(false)

  const iframeRef = useRef(null)
  const autoTimerRef = useRef(null)
  // true after END_PLAYBACK is sent; reset on ENDING_COMPLETE — prevents double-fire
  const endPlaybackSentRef = useRef(false)

  // Always-current show ref so the ENDING_COMPLETE listener never reads stale props
  const showRef = useRef(show)
  useEffect(() => { showRef.current = show }, [show])

  const goToNextSlide = useCallback(async () => {
    const s = showRef.current
    if (!s?.id) return
    const sorted = [...(s.slides ?? [])].sort((a, b) => a.order - b.order)
    const cur = s.current_slide_index ?? 0
    const next = Math.min(cur + 1, sorted.length - 1)
    if (next === cur) return
    const nextSlide = sorted[next]
    await supabase.from('shows').update({
      current_slide_index: next,
      current_slide_id: nextSlide?.id ?? null,
    }).eq('id', s.id)
  }, [])

  function transitionToJukebox() {
    clearTimeout(autoTimerRef.current)
    // Mount iframe immediately so it starts loading during the 400ms fade
    setIframeMounted(true)
    setPhase('jukebox')
  }

  // 10s auto-advance from phase 1 to phase 2
  useEffect(() => {
    autoTimerRef.current = setTimeout(transitionToJukebox, 10000)
    return () => clearTimeout(autoTimerRef.current)
  }, [])

  // Keyboard handler — Space/ArrowRight advance phase 1; Space sends END_PLAYBACK in phase 2
  useEffect(() => {
    const handler = (e) => {
      if (phase === 'text') {
        if (e.code === 'Space' || e.code === 'ArrowRight') {
          e.preventDefault()
          transitionToJukebox()
        }
      } else if (phase === 'jukebox') {
        if (e.code === 'Space' && !endPlaybackSentRef.current) {
          e.preventDefault()
          endPlaybackSentRef.current = true
          iframeRef.current?.contentWindow?.postMessage({ type: 'END_PLAYBACK' }, '*')
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase])

  // Listen for ENDING_COMPLETE from the jukebox iframe → advance to next slide
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'ENDING_COMPLETE') {
        endPlaybackSentRef.current = false
        goToNextSlide()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [goToNextSlide])

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: '#000' }}>

      {/* Phase 1 — grading break text; fades to black as phase transitions */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: theme.colors.bg,
          opacity: phase === 'text' ? 1 : 0,
          transition: 'opacity 400ms ease-out',
          pointerEvents: phase === 'text' ? 'auto' : 'none',
        }}
      >
        {/* Pulsing ambient glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 75% 60% at 50% 50%, ${theme.colors.accent}45 0%, transparent 70%)`,
            animation: 'gradingGlow 4s ease-in-out infinite',
          }}
        />

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
      </div>

      {/* Phase 2 — jukebox iframe; mounts during the fade so it loads behind the transition */}
      {iframeMounted && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: phase === 'jukebox' ? 1 : 0,
            transition: 'opacity 400ms ease-out',
          }}
        >
          <iframe
            ref={iframeRef}
            src={JUKEBOX_EMBED_URL}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#000' }}
            allow="autoplay"
            title="Jukebox"
          />
        </div>
      )}
    </div>
  )
}
