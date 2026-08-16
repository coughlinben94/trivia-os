import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { supabase } from '../../../lib/supabase.js'
import { deriveRoundCols, computeTotal } from '../../../lib/scoreboardMath.js'
import { fitToBox, REVEAL_BOX } from '../../../lib/autoFitText.js'
import { EASE_OUT, EASE_EXIT } from '../../../lib/easings.js'

// Cinematic sequence:
//   'drumroll' — 4.2s MP3 plays; vignette closes in, spotlight + kicker breathe (tension build)
//   'hold'     — 450ms of silence AFTER the roll ends; everything recedes to near-black (anticipation)
//   'reveal'   — name slams in with weight (scale 2.6→1 + settle), impact flash + shake,
//                flares bloom, light rays rotate; the fireworks show launches ~480ms
//                AFTER the impact (celebration follows the hit, never simultaneous with it)
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

// ─── Canvas fireworks — a staged ~6s aerial show ──────────────────────────

const FIREWORK_BASE = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#f97316', '#ec4899', '#84cc16', '#fde047', '#ffffff']

function Fireworks({ active, themeColors = [] }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)

  useEffect(() => {
    if (!active) { cancelAnimationFrame(rafRef.current); return }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    // Size to the canvas's own rendered CSS box (absolute inset-0 within
    // StageFrame's ~85%-viewport stage), not window.innerWidth/Height — a
    // hyper-critique found the old version rasterized the full viewport
    // for a box only 85% that size, and worse, physics constants below are
    // all in raw device pixels with nothing clamping DPR, so a TV
    // self-reporting a 4K viewport would drive 4x the fill cost for a show
    // rendered at half its intended visual size. This is the same box the
    // rest of the app's display surfaces measure against.
    const rect = canvas.getBoundingClientRect()
    canvas.width  = rect.width
    canvas.height = rect.height
    const W = canvas.width
    const H = canvas.height

    // Theme colors weighted in so the show belongs to tonight's theme
    const palette = [...FIREWORK_BASE, ...themeColors, ...themeColors]

    const rand = (a, b) => a + Math.random() * (b - a)
    const pick = arr => arr[Math.floor(Math.random() * arr.length)]

    // Show plan, paced like a real display: two openers, a three-shell build,
    // a five-shell finale flurry, one oversized closer. Launches span 0–3.9s;
    // with ~0.7–0.9s of ascent per shell, bursts land ~0.8s→4.7s and the last
    // sparks burn out just past 6s.
    const schedule = [
      { at: 0.0,  x: rand(0.28, 0.40), power: rand(6.0, 7.5), sparks: 60 },
      { at: 0.45, x: rand(0.60, 0.72), power: rand(6.0, 7.5), sparks: 60 },
      { at: 1.1,  x: rand(0.15, 0.30), power: rand(5.0, 6.5), sparks: 50 },
      { at: 1.5,  x: rand(0.45, 0.55), power: rand(5.5, 7.0), sparks: 55 },
      { at: 1.9,  x: rand(0.70, 0.85), power: rand(5.0, 6.5), sparks: 50 },
      { at: 2.4,  x: rand(0.20, 0.35), power: rand(5.0, 7.0), sparks: 45 },
      { at: 2.6,  x: rand(0.55, 0.70), power: rand(5.0, 7.0), sparks: 45 },
      { at: 2.85, x: rand(0.35, 0.50), power: rand(5.0, 7.0), sparks: 45 },
      { at: 3.1,  x: rand(0.65, 0.80), power: rand(5.0, 7.0), sparks: 45 },
      { at: 3.35, x: rand(0.15, 0.30), power: rand(5.0, 7.0), sparks: 45 },
      { at: 3.9,  x: rand(0.42, 0.58), power: rand(8.0, 9.0), sparks: 90 },
    ].map(s => ({ ...s, color: pick(palette), launched: false }))

    const rockets = []
    const sparks  = []
    const GRAV_ROCKET = 0.12
    const GRAV_SPARK  = 0.055

    function launch(s) {
      const targetY = H * rand(0.22, 0.42)
      const flight  = rand(40, 55) // frames — ~0.7–0.9s ascent
      const dist    = (H + 10) - targetY
      rockets.push({
        x: s.x * W, y: H + 10,
        vx: rand(-0.5, 0.5),
        // arrive at targetY decelerating, still moving — bursts feel airborne
        vy: -(dist / flight + 0.5 * GRAV_ROCKET * flight),
        targetY, color: s.color, power: s.power, count: s.sparks,
      })
    }

    function burst(r) {
      for (let i = 0; i < r.count; i++) {
        const angle = (i / r.count) * Math.PI * 2 + rand(-0.12, 0.12)
        const speed = r.power * (0.35 + Math.random() * 0.65)
        sparks.push({
          x: r.x, y: r.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: Math.random() < 0.18 ? '#ffffff' : r.color, // white-hot core fragments
          life: 0, maxLife: rand(60, 100),
          flicker: Math.random() < 0.3,
        })
      }
    }

    // ponytail: per-frame physics assumes ~60fps like the rest of the display canvases
    let start = null
    let doneFade = 0
    function draw(ts) {
      if (!start) start = ts
      const elapsed = (ts - start) / 1000

      // Fade last frame toward transparent instead of clearing — every rocket
      // and spark leaves a glowing trail for free, drawn additively below.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)'
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'
      ctx.lineWidth = 2.4

      for (const s of schedule) {
        if (!s.launched && elapsed >= s.at) { s.launched = true; launch(s) }
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]
        r.x += r.vx
        r.y += r.vy
        r.vy += GRAV_ROCKET
        if (r.y <= r.targetY || r.vy >= -1) {
          burst(r)
          ctx.globalAlpha = 0.35 // one-frame flash at the burst point
          ctx.fillStyle = '#ffffff'
          ctx.beginPath(); ctx.arc(r.x, r.y, r.power * 3.5, 0, Math.PI * 2); ctx.fill()
          rockets.splice(i, 1)
          continue
        }
        ctx.globalAlpha = 0.9
        ctx.fillStyle = r.color
        ctx.beginPath(); ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2); ctx.fill()
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]
        const px = p.x, py = p.y
        p.vx  = p.vx * 0.985
        p.vy  = p.vy * 0.985 + GRAV_SPARK
        p.x  += p.vx
        p.y  += p.vy
        p.life++
        const t = p.life / p.maxLife
        if (t >= 1 || p.y > H + 20) { sparks.splice(i, 1); continue }
        let a = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
        if (p.flicker && t > 0.4) a *= 0.55 + Math.random() * 0.45 // embers twinkle as they die
        ctx.globalAlpha = a
        ctx.strokeStyle = p.color
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p.x, p.y); ctx.stroke()
      }
      ctx.globalAlpha = 1

      const pending = schedule.some(s => !s.launched)
      if (pending || rockets.length || sparks.length) {
        rafRef.current = requestAnimationFrame(draw)
      } else if (doneFade < 45) {
        doneFade++ // let leftover trail glow fade fully before stopping
        rafRef.current = requestAnimationFrame(draw)
      } else {
        ctx.clearRect(0, 0, W, H)
      }
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active])

  // zIndex 5 — below the kicker/name (zIndex 10) so the winner stays legible
  // on top of the show (the old confetti sat at 30 and painted over the name)
  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }} />
}

// ─── WinnerRevealSlide ─────────────────────────────────────────────────────

export default function WinnerRevealSlide({ slide, show, isPreview = false }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const [winner, setWinner] = useState(null)
  const [phase,  setPhase]  = useState('drumroll')   // 'drumroll' → 'hold' → 'reveal'
  const [celebrate, setCelebrate] = useState(false)  // fireworks launch AFTER the impact lands
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
      // skip the drumroll/fireworks build-up and go straight to a graceful
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

  // Celebration follows the impact: the first shells launch ~480ms after the
  // slam starts (right as the name settles), never simultaneously with it.
  useEffect(() => {
    if (phase !== 'reveal' || isPreview || reduce || winner?.noData) return
    const t = setTimeout(() => setCelebrate(true), 480)
    return () => clearTimeout(t)
  }, [phase, winner?.noData])

  const hl = theme.colors.highlight
  // shinyAccent, NOT accent — across the 21 themes `accent` is a dark backdrop
  // color (near-black on most), `shinyAccent` is the bright secondary
  const ac = theme.colors.shinyAccent
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
            // hold-phase recession must finish fast so most of the 450ms beat
            // is genuinely still
            : { duration: phase === 'hold' ? 0.2 : 0.35, ease: EASE_EXIT }
        }
        style={{
          zIndex: 1,
          background: `radial-gradient(ellipse 42% 38% at 50% 50%, ${hl}30 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Vignette — closes in during the roll, hits its darkest in the held
          beat, lifts (but stays) once the celebration starts */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === 'drumroll' ? 0.55 : phase === 'hold' ? 0.85 : 0.3 }}
        transition={{ duration: phase === 'hold' ? 0.2 : 1.1, ease: phase === 'hold' ? EASE_EXIT : EASE_OUT }}
        style={{
          zIndex: 3,
          background: 'radial-gradient(ellipse 72% 62% at 50% 50%, transparent 42%, rgba(0,0,0,0.85) 100%)',
          pointerEvents: 'none',
        }}
      />

      <Fireworks active={celebrate} themeColors={[hl, ac]} />

      {/* Impact flash — a single frame-of-light the instant the name lands
          (~180ms in): fast attack peaking right at the landing, slow decay */}
      {impact && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0] }}
          transition={{ delay: 0.16, duration: 0.55, times: [0, 0.05, 1], ease: 'easeOut' }}
          style={{
            zIndex: 40,
            background: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.95) 0%, ${hl}66 40%, transparent 75%)`,
            mixBlendMode: 'screen',
          }}
        />
      )}

      {/* Shaken frame — rays + kicker + name jolt together on impact so it
          reads as "the screen shook", not "the text wobbled". Content here is
          all transparent overlay over the full-bleed ambient background, so
          the translation can't expose a stage edge (no pre-scale needed). */}
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center"
        animate={impact
          // 7 keyframes over 260ms ≈ 12Hz — reads as a jolt, not a wobble;
          // the small rotate component sells the hit at TV distance
          ? { x: [0, -14, 10, -6, 3, -1, 0], y: [0, 8, -5, 3, -1, 1, 0], rotate: [0, -0.5, 0.35, -0.15, 0, 0, 0] }
          : { x: 0, y: 0, rotate: 0 }}
        transition={impact ? { delay: 0.18, duration: 0.26, ease: 'linear' } : undefined}
        style={{ zIndex: 10 }}
      >

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
            ? { duration: 0.2, ease: EASE_EXIT }
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
          {/* Tie text only once revealed — announcing it during the drumroll
              spoils the outcome before the suspense finishes */}
          {winner?.noData ? 'Let’s see how everyone did…' : winner?.isTie && revealed ? "It's a tie!" : 'And the winner is…'}
        </motion.span>
      </motion.p>

      <AnimatePresence>
        {revealed && winner && (
          // shake lives on the shared wrapper above, not here
          <div style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
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
                  // The slam: linear constant-speed approach (size perception
                  // is ~logarithmic, so linear reads consistent) lands at a
                  // predictable ~180ms, squashes visibly to 0.93, settles —
                  // flash and shake are timed to meet that landing
                  initial={{ opacity: 0, scale: reduce ? 1 : 2.6 }}
                  animate={reduce ? { opacity: 1, scale: 1 } : { opacity: [0, 1], scale: [2.6, 0.93, 1] }}
                  transition={reduce
                    ? { duration: 0.5, ease: EASE_OUT }
                    : {
                        opacity: { duration: 0.12, ease: 'linear' },
                        scale:   { duration: 0.40, times: [0, 0.45, 1], ease: ['linear', EASE_OUT] },
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
                    color: theme.colors.text, // accent is a dark backdrop color — unreadable here
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
          </div>
        )}
      </AnimatePresence>

      </motion.div>
    </div>
  )
}
