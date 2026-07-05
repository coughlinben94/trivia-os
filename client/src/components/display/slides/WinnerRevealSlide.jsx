import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { supabase } from '../../../lib/supabase.js'
import { deriveRoundCols, computeTotal } from '../../../lib/scoreboardMath.js'
import { fitToBox, REVEAL_BOX } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'

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

export default function WinnerRevealSlide({ slide, show, isPreview = false }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const [winner, setWinner] = useState(null)
  const [phase,  setPhase]  = useState('drumroll')
  const audioCtxRef = useRef(null)

  // fitToBox measures via canvas — a first paint before the display font
  // loads measures fallback-font metrics. This flips once web fonts are
  // ready purely to force the re-render that re-runs the inline fitToBox
  // call below with real glyph metrics; the value itself is never read.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)) }, [])

  // Drumroll only starts once we know a real winner exists — if we started it
  // on mount in parallel with the fetch (the old behavior), a zero-team show
  // would play the full suspenseful build-up toward nothing. Both queries are
  // fast enough that gating on them first costs an imperceptible delay.
  useEffect(() => {
    let cancelled = false
    // Build Mode preview: never fetch live scores, never play the drum roll —
    // this component mounts inside SlideCanvasEditor's real render tree, and
    // an ungated mount played the MP3 aloud in the host's editor. Show the
    // revealed layout with a sample winner instead.
    if (isPreview) {
      setWinner({ name: 'Winning Team', total: 42, isTie: false })
      setPhase('reveal')
      return
    }
    async function load() {
      const cols = deriveRoundCols(show)

      // Primary: scoreboard_teams (the live grading source)
      const { data: sbTeams } = await supabase
        .from('scoreboard_teams').select('id, name, scores').eq('show_id', show.id)
      let ranked = sbTeams?.length
        ? sbTeams
            .map(t => ({ id: t.id, name: t.name, total: computeTotal(t.scores, cols) }))
            .sort((a, b) => b.total - a.total)
        : []

      // Fallback: legacy team_scores
      if (!ranked.length) {
        const [{ data: teams }, { data: scores }] = await Promise.all([
          supabase.from('teams').select('id, name').eq('show_id', show.id),
          supabase.from('team_scores').select('team_id, score').eq('show_id', show.id),
        ])
        ranked = (teams ?? [])
          .map(t => ({ id: t.id, name: t.name, total: (scores ?? []).filter(s => s.team_id === t.id).reduce((n, s) => n + (s.score ?? 0), 0) }))
          .sort((a, b) => b.total - a.total)
      }

      if (cancelled) return

      // Zero teams ever scored (empty show, or both fetches came back empty) —
      // skip the drumroll/confetti build-up and go straight to a graceful
      // fallback instead of leaving three TVs on "And the winner is…" forever.
      if (!ranked.length) {
        setWinner({ noData: true })
        setPhase('reveal')
        return
      }

      const max = ranked[0]?.total ?? 0
      const tied = ranked.filter(t => t.total === max)
      setWinner({ name: tied.map(t => t.name).join(' & '), total: max, isTie: tied.length > 1 })
      audioCtxRef.current = playDrumRoll(() => { if (!cancelled) setPhase('reveal') }, reduce)
    }
    load()
    return () => { cancelled = true; audioCtxRef.current?.pause?.(); audioCtxRef.current = null }
  }, [show.id])

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

      <Confetti active={phase === 'reveal' && !winner?.noData && !isPreview} />

      <motion.p
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 0.75, y: 0, transition: { duration: 0.55, ease: EASE_OUT } }}
        style={{
          color: theme.colors.text,
          fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
          fontSize: 'clamp(1.8rem, 3.5cqw, 3rem)',
          fontWeight: 600,
          letterSpacing: '0.02em',
          marginBottom: '2.5rem',
          position: 'relative',
          zIndex: 10,
          textAlign: 'center',
        }}
      >
        {winner?.noData ? 'Let’s see how everyone did…' : winner?.isTie ? "It's a tie!" : 'And the winner is…'}
      </motion.p>

      <AnimatePresence>
        {phase === 'reveal' && winner && (
          <motion.div
            initial={{ opacity: 0, scale: reduce ? 1 : 0.65 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.5, ease: EASE_OUT } }}
            style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}
          >
            {winner.noData ? (
              <p style={{
                color: theme.colors.highlight,
                fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
                fontSize: 'clamp(2rem, 5cqw, 4rem)',
                lineHeight: 1.2,
                textShadow: `0 0 80px ${theme.colors.highlight}55`,
              }}>
                Check the scoreboard!
              </p>
            ) : (
              <>
                <p style={{
                  color: theme.colors.highlight,
                  fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
                  fontSize: fitToBox(winner.name, { ...REVEAL_BOX, family: theme.fonts.display }),
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
                    fontSize: 'clamp(1.4rem, 2.5cqw, 2.2rem)',
                    fontWeight: 700,
                    marginTop: '1rem',
                  }}
                >
                  {winner.total} points
                </motion.p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
