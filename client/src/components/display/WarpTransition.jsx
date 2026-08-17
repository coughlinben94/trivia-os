import { useEffect, useRef } from 'react'

// Hyperspace transition for the jukebox grading break (2026-08-17, Ben: "like
// the grading break itself has an Sx station tied to it. then after the slide
// is there for 10 seconds, it 'warps' to the jukebox, then when done, warps
// back to round 2 slide Sx").
//
// Two directions, one loop:
//   dir='out'  — accelerates from rest into streaks and veils the ring black
//                behind them. Display mounts JukeboxBreakOverlay (and jumps
//                the ring onto the record) in the commit onDone triggers, so
//                the station change lands behind a full-black frame.
//   dir='back' — the mirror. Starts already at streak speed on an opaque
//                frame (the ring's jump back to Sx happens under it, same
//                commit this mounts), decelerates to stopped dots, and lifts.
//
// Star projection/streak math adapted from the lightspeed team intro
// (.worktrees/lightspeed-exit, TeamPickerSlide.jsx): same perspective divide,
// same previous-z streak segment, same additive compositing, same
// respawn-on-exit rule. Not imported from there — that build's loop is welded
// to the team-reveal sequencing (text sprites, audio, approach/hold/exit
// phases, a settle signal). Only the star field is reusable, and it is short
// enough that copying it beats generalizing that component.
//
// Colours are fixed rather than themed, same call the lightspeed intro made:
// this reads as travel through the ring world's own night sky, and a warm show
// theme tinting the streaks makes them read as confetti instead.

const DURATION_MS = 1100
const W = 1920
const H = 1080
const BG = '#01010a' // matches RingAmbient's own stage background

const isReduced = () =>
  typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function WarpTransition({ dir = 'out', onDone }) {
  const canvasRef = useRef(null)
  // onDone is an inline arrow in Display's JSX (new identity every render) —
  // held in a ref so the loop below never restarts because of it.
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    // Reduced motion: no streaks at all, instant cut — the codebase's standing
    // fallback (RingAmbient's isReduced(), ParticleBackground's own guards).
    // onDone still fires, so the break sequence is byte-identical in ordering,
    // just not animated: the jukebox still opens, the ring still returns.
    if (isReduced()) {
      const t = setTimeout(() => doneRef.current?.(), 0)
      return () => clearTimeout(t)
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) { doneRef.current?.(); return }
    canvas.width = W
    canvas.height = H
    const CX = W / 2
    const CY = H / 2

    const stars = Array.from({ length: 220 }, () => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: 0.08 + Math.random() * 0.92,
      s: 0.7 + Math.random() * 0.6,
    }))

    // 'back' opens on an already-opaque frame: the ring jumps to Sx in the
    // same React commit this mounts, and the 0.30 trail fill below takes ~10
    // frames to reach opacity on its own — long enough for that snap to show
    // through if the canvas started clear.
    if (dir === 'back') {
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, W, H)
      canvas.style.opacity = '1'
    }

    let start = 0
    let last = 0
    let raf = 0
    let finished = false

    const draw = (now) => {
      if (!start) { start = now; last = now }
      const dtn = Math.min(26, now - last) / 16.6667 // frame-rate independent, capped like the intro's loop
      last = now
      const p = Math.min(1, (now - start) / DURATION_MS)
      // Speed ramps in on 'out' and decays on 'back' — the same curve read
      // in opposite directions, which is what makes the pair read as one
      // round trip rather than two effects.
      const t = dir === 'out' ? p : 1 - p
      const warp = t * t
      // Veil: how much of the screen the effect owns. Eased so the ring is
      // still readable through the first beat of the acceleration.
      const veil = 1 - (1 - t) * (1 - t)

      ctx.fillStyle = 'rgba(1,1,10,0.30)'
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      for (const s of stars) {
        const prevZ = s.z
        s.z -= 0.019 * warp * s.s * dtn
        if (s.z <= 0.02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; continue }
        const sx = (s.x / s.z) * CX + CX
        const sy = (s.y / s.z) * CY + CY
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) {
          s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; continue
        }
        const depth = 1 - s.z
        const a = Math.min(1, depth * 1.2)
        const r = Math.round(150 + 105 * depth)
        const g = Math.round(180 + 75 * depth)
        ctx.fillStyle = ctx.strokeStyle = `rgba(${r},${g},255,${a})`
        const px = (s.x / prevZ) * CX + CX
        const py = (s.y / prevZ) * CY + CY
        const len = Math.abs(sx - px) + Math.abs(sy - py)
        if (len < 1.2) {
          ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.7, depth * 2.2), 0, 6.2832); ctx.fill()
        } else {
          ctx.lineWidth = Math.max(0.6, depth * depth * 5.2)
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke()
        }
      }
      ctx.globalCompositeOperation = 'source-over'
      canvas.style.opacity = String(veil)

      if (p >= 1) {
        if (!finished) { finished = true; doneRef.current?.() }
        return
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [dir])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 z-[80] pointer-events-none"
      style={{ width: '100%', height: '100%', opacity: 0 }}
    />
  )
}
