import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { supabase } from '../../../lib/supabase.js'
import SlideElements from '../SlideElements.jsx'

// ─── Drum roll (MP3) ──────────────────────────────────────────────────────

function playDrumRoll(onReveal, reduced) {
  if (reduced) { setTimeout(onReveal, 1200); return null }
  try {
    const audio = new Audio('/drum-roll.mp3')
    audio.onended = onReveal
    audio.onerror = () => setTimeout(onReveal, 2000)
    audio.play().catch(() => setTimeout(onReveal, 2000))
    return audio
  } catch (_) {
    setTimeout(onReveal, 2000)
    return null
  }
}

// ─── Canvas confetti ───────────────────────────────────────────────────────

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#f97316', '#ec4899', '#84cc16']

function Confetti({ active }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)

  useEffect(() => {
    if (!active) { cancelAnimationFrame(rafRef.current); return }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const particles = Array.from({ length: 220 }, () => ({
      x:    Math.random() * canvas.width,
      y:    -24 - Math.random() * 120,
      w:    7 + Math.random() * 9,
      h:    4 + Math.random() * 6,
      vx:   (Math.random() - 0.5) * 4,
      vy:   2.5 + Math.random() * 4,
      rot:  Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.18,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 1,
    }))

    let start = null
    function draw(ts) {
      if (!start) start = ts
      const elapsed = (ts - start) / 1000
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let anyAlive = false
      for (const p of particles) {
        p.x  += p.vx
        p.y  += p.vy
        p.rot += p.rotV
        p.vy += 0.07
        if (elapsed > 2.5) p.alpha = Math.max(0, p.alpha - 0.007)
        if (p.y < canvas.height + 40 && p.alpha > 0.01) {
          anyAlive = true
          ctx.save()
          ctx.globalAlpha = p.alpha
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.fillStyle = p.color
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
          ctx.restore()
        }
      }
      if (anyAlive) rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active])

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }} />
}

// ─── WinnerRevealSlide ─────────────────────────────────────────────────────

const EASE_OUT = [0.23, 1, 0.32, 1]

export default function WinnerRevealSlide({ slide, show }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const [winner, setWinner] = useState(null)
  const [phase,  setPhase]  = useState('drumroll')
  const audioCtxRef = useRef(null)

  useEffect(() => {
    supabase.from('teams').select('id, name, color').eq('show_id', show.id)
      .then(({ data: teams }) => {
        supabase.from('team_scores').select('team_id, score').eq('show_id', show.id)
          .then(({ data: scores }) => {
            const t = (teams ?? []).map(team => ({
              ...team,
              total: (scores ?? []).filter(s => s.team_id === team.id).reduce((n, s) => n + (s.score ?? 0), 0),
            })).sort((a, b) => b.total - a.total)
            if (t[0]) setWinner(t[0])
          })
      })
  }, [show.id])

  useEffect(() => {
    audioCtxRef.current = playDrumRoll(() => setPhase('reveal'), reduce)
    return () => { audioCtxRef.current?.pause?.(); audioCtxRef.current = null }
  }, [])

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ zIndex: 1 }}>

      {/* Background gradient flares */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0.15 }}
        animate={{ opacity: phase === 'reveal' ? 1 : 0.15 }}
        transition={{ duration: 1.4, ease: EASE_OUT }}
        style={{
          zIndex: 0,
          background: [
            'radial-gradient(ellipse 80% 70% at 50% 54%, rgba(251,191,36,0.30) 0%, transparent 68%)',
            'radial-gradient(ellipse 55% 55% at 10% 15%, rgba(139,92,246,0.20) 0%, transparent 65%)',
            'radial-gradient(ellipse 50% 50% at 90% 85%, rgba(16,185,129,0.18) 0%, transparent 65%)',
          ].join(', '),
          pointerEvents: 'none',
        }}
      />

      <Confetti active={phase === 'reveal'} />

      <motion.p
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 0.75, y: 0, transition: { duration: 0.55, ease: EASE_OUT } }}
        style={{
          color: theme.colors.text,
          fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
          fontSize: 'clamp(1.8rem, 3.5vw, 3rem)',
          fontWeight: 600,
          letterSpacing: '0.02em',
          marginBottom: '2.5rem',
          position: 'relative',
          zIndex: 10,
          textAlign: 'center',
        }}
      >
        And the winner is…
      </motion.p>

      <AnimatePresence>
        {phase === 'reveal' && winner && (
          <motion.div
            initial={{ opacity: 0, scale: reduce ? 1 : 0.65 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.5, ease: EASE_OUT } }}
            style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}
          >
            <p style={{
              color: theme.colors.highlight,
              fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
              fontSize: 'clamp(4rem, 11vw, 10rem)',
              lineHeight: 1,
              textShadow: `0 0 80px ${theme.colors.highlight}55`,
            }}>
              {winner.name}
            </p>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.35, duration: 0.4, ease: EASE_OUT } }}
              style={{
                color: theme.colors.accent,
                fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
                fontSize: 'clamp(1.4rem, 2.5vw, 2.2rem)',
                fontWeight: 700,
                marginTop: '1rem',
              }}
            >
              {winner.total} points
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-0" style={{ zIndex: 40 }}>
        <SlideElements elements={slide?.data?.elements} theme={theme} />
      </div>
    </div>
  )
}
