import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Canvas background ─────────────────────────────────────────────────────
// Called every rAF tick by ThemeCanvas: pureMichiganBackground(canvas, timestamp)

export function pureMichiganBackground(canvas, t) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  if (w === 0 || h === 0) return

  const s = t * 0.001 // seconds

  // ── Sky ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#020d12'
  ctx.fillRect(0, 0, w, h)

  // ── Starfield — 150 deterministic stars across upper 70% ────────────────
  for (let i = 0; i < 150; i++) {
    const x = fract(Math.sin(i * 127.1) * 43758.5) * w
    const y = fract(Math.sin(i * 311.7) * 43758.5) * h * 0.70
    const r = 0.6 + fract(Math.sin(i * 74.3) * 43758.5) * 1.6
    const opacity = 0.3 + fract(Math.sin(i * 53.9) * 43758.5) * 0.7
    const twinkle = 0.85 + 0.15 * Math.sin(s * (1.5 + fract(Math.sin(i * 29.3) * 43758.5) * 3) + i)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${(opacity * twinkle).toFixed(3)})`
    ctx.fill()
  }

  // ── Lake reflection — bottom 18% ─────────────────────────────────────────
  const lakeY = h * 0.82

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, lakeY, w, h - lakeY)
  ctx.clip()

  // Dark glassy tint over the lake
  ctx.fillStyle = 'rgba(1,8,14,0.5)'
  ctx.fillRect(0, lakeY, w, h - lakeY)

  // Shimmer: thin vertical lines that drift slowly
  const shimmerCount = Math.ceil(w / 60)
  for (let i = 0; i < shimmerCount; i++) {
    const bx = i * 60
    const sx = bx + Math.sin(s * 0.38 + bx * 0.011) * 6
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.fillRect(sx, lakeY, 1, h - lakeY)
  }

  ctx.restore()

  // ── Pine silhouette treeline — bottom 22%, drawn over lake ───────────────
  ctx.fillStyle = '#010810'
  const treeCount = Math.ceil(w / 26)
  for (let i = 0; i < treeCount; i++) {
    const r1 = fract(Math.sin(i * 7.391  + 1.0) * 43758.5)
    const r2 = fract(Math.sin(i * 13.741 + 2.0) * 43758.5)
    const r3 = fract(Math.sin(i * 19.113 + 3.0) * 43758.5)

    const cx   = (i + r1 * 0.6 - 0.3) * (w / treeCount)
    const treeW = 11 + r3 * 22
    const treeH = h * (0.09 + r2 * 0.12)
    const base  = h * 0.87 + r2 * h * 0.05

    ctx.beginPath()
    ctx.moveTo(cx, base - treeH)         // tip
    ctx.lineTo(cx - treeW * 0.5, base)   // bottom-left
    ctx.lineTo(cx + treeW * 0.5, base)   // bottom-right
    ctx.closePath()
    ctx.fill()
  }
}

function fract(x) { return x - Math.floor(x) }

// ─── Foreground elements ───────────────────────────────────────────────────

function ShootingStar({ star, onDone }) {
  const rad = star.angle * (Math.PI / 180)
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${star.x * 100}%`,
        top:  `${star.y * 100}%`,
        width: star.len,
        height: 1.5,
        // Bright head at left, fading tail to the right
        background: 'linear-gradient(to right, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 100%)',
        transformOrigin: '0% 50%',
        rotate: -star.angle,  // CCW so tail extends up-right
      }}
      initial={{ opacity: 1, x: 0, y: 0 }}
      animate={{
        x: -star.dist * Math.cos(rad),
        y:  star.dist * Math.sin(rad),
        opacity: 0,
      }}
      transition={{ duration: 0.6, ease: 'linear' }}
      onAnimationComplete={onDone}
    />
  )
}

function OwlSVG() {
  return (
    <svg width="44" height="28" viewBox="0 0 44 28" aria-hidden="true">
      {/* Wings spread in glide */}
      <path d="M22 14 C14 5 2 9 0 19 C8 14 16 16 22 14Z" fill="#010810" />
      <path d="M22 14 C30 5 42 9 44 19 C36 14 28 16 22 14Z" fill="#010810" />
      {/* Body */}
      <ellipse cx="22" cy="19" rx="5" ry="7" fill="#010810" />
      {/* Head */}
      <circle cx="22" cy="10" r="5" fill="#010810" />
      {/* Ear tufts */}
      <polygon points="18,6 16,1 21,5" fill="#010810" />
      <polygon points="26,6 28,1 23,5" fill="#010810" />
    </svg>
  )
}

function Owl({ onDone }) {
  const sw = typeof window !== 'undefined' ? window.innerWidth : 1920
  // 3 gentle oscillations across the 3.5s flight
  const yKF = [0, -9, 0, 9, 0, -9, 0]
  return (
    <motion.div
      style={{ position: 'absolute', top: '18%', left: 0 }}
      initial={{ x: sw + 60, y: 0 }}
      animate={{ x: -100, y: yKF }}
      transition={{
        x: { duration: 3.5, ease: 'linear' },
        y: { duration: 3.5, ease: 'easeInOut',
             times: [0, 1/6, 2/6, 3/6, 4/6, 5/6, 1] },
      }}
      onAnimationComplete={onDone}
    >
      <OwlSVG />
    </motion.div>
  )
}

export function PureMichiganForeground() {
  const [stars, setStars] = useState([])
  const [owlActive, setOwlActive] = useState(false)
  const owlKeyRef  = useRef(0)
  const owlTimer   = useRef(null)

  // Shooting star spawn loop
  useEffect(() => {
    let timer
    function spawn() {
      setStars(prev => {
        const star = {
          id:    Date.now() + Math.random(),
          x:     0.52 + Math.random() * 0.42,  // upper-right quadrant
          y:     0.02 + Math.random() * 0.30,
          len:   80  + Math.random() * 70,
          angle: 22  + Math.random() * 18,      // shallow downward-left angle
          dist:  160 + Math.random() * 100,
        }
        return [...prev.slice(-1), star]  // max 2 simultaneous stars
      })
      timer = setTimeout(spawn, 8000 + Math.random() * 7000)
    }
    timer = setTimeout(spawn, 4000 + Math.random() * 5000)
    return () => clearTimeout(timer)
  }, [])

  // Owl flyby — first appearance after 6-14s, then every ~45s
  useEffect(() => {
    function launch() {
      owlKeyRef.current += 1
      setOwlActive(true)
    }
    owlTimer.current = setTimeout(launch, 6000 + Math.random() * 8000)
    return () => clearTimeout(owlTimer.current)
  }, [])

  function handleOwlDone() {
    setOwlActive(false)
    owlTimer.current = setTimeout(() => {
      owlKeyRef.current += 1
      setOwlActive(true)
    }, 45000)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <AnimatePresence>
        {stars.map(star => (
          <ShootingStar
            key={star.id}
            star={star}
            onDone={() => setStars(p => p.filter(s => s.id !== star.id))}
          />
        ))}
      </AnimatePresence>
      {owlActive && <Owl key={owlKeyRef.current} onDone={handleOwlDone} />}
    </div>
  )
}
