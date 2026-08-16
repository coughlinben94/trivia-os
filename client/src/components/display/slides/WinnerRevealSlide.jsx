import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { supabase } from '../../../lib/supabase.js'
import { deriveRoundCols, computeTotal } from '../../../lib/scoreboardMath.js'
import { fitToBox, REVEAL_BOX } from '../../../lib/autoFitText.js'
import { EASE_OUT, EASE_EXIT, EASE_DROP } from '../../../lib/easings.js'

// Cinematic sequence:
//   'drumroll' — 4.2s MP3 plays; vignette closes in, spotlight + kicker breathe (tension build)
//   'hold'     — 450ms of silence AFTER the roll ends; everything recedes to near-black (anticipation)
//   'reveal'   — name slams in with weight (scale 2.6→1 + settle), impact flash + shake,
//                flares bloom, light rays rotate; confetti cannons fire ~480ms AFTER the
//                impact (celebration follows the hit, never simultaneous with it)
const HOLD_MS = 450

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

// ─── Canvas confetti — corner cannons + drifting rain ─────────────────────

const CONFETTI_BASE = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#f97316', '#ec4899', '#84cc16', '#fde047', '#ffffff']

function Confetti({ active, themeColors = [] }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)

  useEffect(() => {
    if (!active) { cancelAnimationFrame(rafRef.current); return }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    const W = canvas.width
    const H = canvas.height

    // Theme colors weighted in so the burst belongs to tonight's theme
    const palette = [...CONFETTI_BASE, ...themeColors, ...themeColors]

    const rand = (a, b) => a + Math.random() * (b - a)
    const pick = arr => arr[Math.floor(Math.random() * arr.length)]

    // Two cannons at the bottom corners arc up through the frame — a launch,
    // not a drizzle. A lighter rain from the top sustains the moment after.
    const cannon = Array.from({ length: 150 }, (_, i) => {
      const left = i % 2 === 0
      return {
        x:    left ? W * rand(0.02, 0.1) : W * rand(0.9, 0.98),
        y:    H + rand(0, 30),
        w:    rand(7, 16),
        h:    rand(4, 10),
        vx:   (left ? 1 : -1) * rand(2, 8),
        vy:   -rand(18, 28),
        rot:  rand(0, Math.PI * 2),
        rotV: rand(-0.22, 0.22),
        color: pick(palette),
        alpha: 1,
        delay: rand(0, 0.18),
        drag:  0.992,
      }
    })
    const rain = Array.from({ length: 90 }, () => ({
      x:    rand(0, W),
      y:    -rand(24, 160),
      w:    rand(6, 13),
      h:    rand(3, 8),
      vx:   rand(-2, 2),
      vy:   rand(2.5, 6),
      rot:  rand(0, Math.PI * 2),
      rotV: rand(-0.14, 0.14),
      color: pick(palette),
      alpha: 1,
      delay: rand(0.5, 1.8),
      drag:  1,
    }))
    const particles = [...cannon, ...rain]

    // ponytail: per-frame physics assumes ~60fps like the rest of the display canvases
    let start = null
    function draw(ts) {
      if (!start) start = ts
      const elapsed = (ts - start) / 1000
      ctx.clearRect(0, 0, W, H)
      let anyAlive = false
      for (const p of particles) {
        if (elapsed < p.delay) { anyAlive = true; continue }
        p.vx  *= p.drag
        p.x   += p.vx
        p.y   += p.vy
        p.rot += p.rotV
        p.vy  += 0.26
        if (elapsed > 3.4) p.alpha = Math.max(0, p.alpha - 0.009)
        if (p.y < H + 60 && p.alpha > 0.01) {
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
  const [phase,  setPhase]  = useState('drumroll')   // 'drumroll' → 'hold' → 'reveal'
  const [celebrate, setCelebrate] = useState(false)  // confetti fires AFTER the impact lands
  const audioCtxRef = useRef(null)
  const holdTimerRef = useRef(null)

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
    // The roll ends → a held beat of silence → the hit. Landing the name IN
    // the silence (not on the last drum beat) is what gives it impact.
    // Reduced motion still gets the real phase transition, just without the beat.
    function goReveal() {
      if (cancelled) return
      if (reduce) { setPhase('reveal'); return }
      setPhase('hold')
      holdTimerRef.current = setTimeout(() => { if (!cancelled) setPhase('reveal') }, HOLD_MS)
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
      audioCtxRef.current = playDrumRoll(goReveal, reduce)
    }
    load()
    return () => {
      cancelled = true
      audioCtxRef.current?.pause?.()
      audioCtxRef.current = null
      clearTimeout(holdTimerRef.current)
    }
  }, [show.id])

  // Celebration follows the impact: cannons fire ~480ms after the slam starts
  // (right as the name settles), never simultaneously with it.
  useEffect(() => {
    if (phase !== 'reveal' || isPreview || reduce || winner?.noData) return
    const t = setTimeout(() => setCelebrate(true), 480)
    return () => clearTimeout(t)
  }, [phase, winner?.noData])

  const hl = theme.colors.highlight
  const ac = theme.colors.accent
  const revealed = phase === 'reveal'
  const impact   = revealed && !winner?.noData && !isPreview && !reduce

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ zIndex: 1 }}>

      {/* Celebration flares — bloom only once the winner has landed */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: revealed ? 1 : 0 }}
        transition={{ duration: 1.4, delay: revealed ? 0.3 : 0, ease: EASE_OUT }}
        style={{
          zIndex: 0,
          background: [
            `radial-gradient(ellipse 80% 70% at 50% 54%, ${hl}4D 0%, transparent 68%)`,
            `radial-gradient(ellipse 55% 55% at 10% 15%, ${ac}33 0%, transparent 65%)`,
            `radial-gradient(ellipse 50% 50% at 90% 85%, ${ac}2E 0%, transparent 65%)`,
          ].join(', '),
          pointerEvents: 'none',
        }}
      />

      {/* Drumroll spotlight — breathes like a heartbeat while tension builds,
          collapses to near-nothing in the held beat before the hit */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={
          phase === 'drumroll'
            ? (reduce ? { opacity: 0.55, scale: 1 } : { opacity: [0.4, 0.7, 0.4], scale: [1, 1.06, 1] })
            : phase === 'hold'
              ? { opacity: 0.08, scale: 0.75 }
              : { opacity: 0 }
        }
        transition={
          phase === 'drumroll' && !reduce
            ? { duration: 1.15, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.35, ease: EASE_EXIT }
        }
        style={{
          zIndex: 1,
          background: `radial-gradient(ellipse 42% 38% at 50% 50%, ${hl}30 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Rotating light rays — sustained celebration behind the name */}
      {revealed && !winner?.noData && (
        <motion.div
          className="absolute pointer-events-none"
          initial={{ opacity: 0, rotate: 0 }}
          animate={{
            opacity: 0.45,
            rotate: (reduce || isPreview) ? 0 : 360,
          }}
          transition={{
            opacity: { delay: 0.45, duration: 1.2, ease: EASE_OUT },
            rotate:  { duration: 60, repeat: Infinity, ease: 'linear' },
          }}
          style={{
            zIndex: 2,
            left: '50%', top: '50%',
            width: '120vmax', height: '120vmax',
            marginLeft: '-60vmax', marginTop: '-60vmax',
            background: `repeating-conic-gradient(from 0deg, transparent 0deg, ${hl}22 6deg, transparent 12deg)`,
            WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,0.9) 0%, transparent 58%)',
            maskImage: 'radial-gradient(circle, rgba(0,0,0,0.9) 0%, transparent 58%)',
          }}
        />
      )}

      {/* Vignette — closes in during the roll, hits its darkest in the held
          beat, lifts (but stays) once the celebration starts */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === 'drumroll' ? 0.55 : phase === 'hold' ? 0.85 : 0.3 }}
        transition={{ duration: phase === 'hold' ? 0.35 : 1.1, ease: phase === 'hold' ? EASE_EXIT : EASE_OUT }}
        style={{
          zIndex: 3,
          background: 'radial-gradient(ellipse 72% 62% at 50% 50%, transparent 42%, rgba(0,0,0,0.85) 100%)',
          pointerEvents: 'none',
        }}
      />

      <Confetti active={celebrate} themeColors={[hl, ac]} />

      {/* Impact flash — a single frame-of-light the instant the name lands */}
      {impact && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0] }}
          transition={{ delay: 0.32, duration: 0.7, times: [0, 0.18, 1], ease: 'easeOut' }}
          style={{
            zIndex: 40,
            background: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.95) 0%, ${hl}66 40%, transparent 75%)`,
            mixBlendMode: 'screen',
          }}
        />
      )}

      {/* Kicker — breathes with the drumroll, recedes into the dark for the
          held beat, then returns softly beneath the celebration for context */}
      <motion.p
        initial={{ opacity: 0, y: 24 }}
        animate={
          winner?.noData
            ? { opacity: 0.75, y: 0 }
            : phase === 'drumroll'
              ? { opacity: 0.75, y: 0, scale: 1 }
              : phase === 'hold'
                ? { opacity: 0.15, y: 0, scale: 0.94 }
                : { opacity: 0.55, y: 0, scale: 0.9 }
        }
        transition={
          phase === 'hold'
            ? { duration: 0.3, ease: EASE_EXIT }
            : revealed && !winner?.noData
              ? { delay: 0.9, duration: 0.6, ease: EASE_OUT }
              : { duration: 0.55, ease: EASE_OUT }
        }
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
        <motion.span
          style={{ display: 'inline-block' }}
          animate={phase === 'drumroll' && !reduce && !isPreview ? { scale: [1, 1.03, 1] } : { scale: 1 }}
          transition={phase === 'drumroll' && !reduce && !isPreview ? { duration: 1.15, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        >
          {winner?.noData ? 'Let’s see how everyone did…' : winner?.isTie ? "It's a tie!" : 'And the winner is…'}
        </motion.span>
      </motion.p>

      <AnimatePresence>
        {revealed && winner && (
          <motion.div
            // Impact shake — a short decaying jolt the moment the name lands
            animate={impact ? { x: [0, -9, 7, -4, 2, 0], y: [0, 5, -4, 2, -1, 0] } : { x: 0, y: 0 }}
            transition={impact ? { delay: 0.34, duration: 0.42, ease: 'linear' } : undefined}
            style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}
          >
            {winner.noData ? (
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE_OUT }}
                style={{
                  color: theme.colors.highlight,
                  fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
                  fontSize: 'clamp(2rem, 5cqw, 4rem)',
                  lineHeight: 1.2,
                  textShadow: `0 0 80px ${theme.colors.highlight}55`,
                }}
              >
                Check the scoreboard!
              </motion.p>
            ) : (
              <>
                <motion.p
                  // The slam: arrives huge and fast, compresses just past
                  // rest, settles — weight, not a fade
                  initial={{ opacity: 0, scale: reduce ? 1 : 2.6 }}
                  animate={reduce ? { opacity: 1, scale: 1 } : { opacity: [0, 1], scale: [2.6, 0.98, 1] }}
                  transition={reduce
                    ? { duration: 0.5, ease: EASE_OUT }
                    : {
                        opacity: { duration: 0.3, ease: 'linear' },
                        scale:   { duration: 0.55, times: [0, 0.62, 1], ease: [EASE_DROP, 'easeOut'] },
                      }}
                  style={{
                    color: theme.colors.highlight,
                    fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
                    fontSize: fitToBox(winner.name, { ...REVEAL_BOX, family: theme.fonts.display }),
                    lineHeight: 1,
                    textShadow: `0 0 80px ${theme.colors.highlight}55`,
                  }}
                >
                  {winner.name}
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduce ? 0.3 : 0.95, duration: 0.5, ease: EASE_OUT }}
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
