import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Helpers ───────────────────────────────────────────────────────────────

function fract(x) { return x - Math.floor(x) }

function cbp(t, p0, p1, p2, p3) {
  const m = 1 - t
  return m*m*m*p0 + 3*m*m*t*p1 + 3*m*t*t*p2 + t*t*t*p3
}

// ─── Canvas background ─────────────────────────────────────────────────────

export function pureMichiganBackground(canvas, t) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  if (w === 0 || h === 0) return

  const s = t * 0.001

  // ── Sky ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#020d12'
  ctx.fillRect(0, 0, w, h)

  // ── Milky Way — diagonal band top-left → center-right ────────────────────
  const mwGrad = ctx.createRadialGradient(w * 0.3, h * 0.14, 0, w * 0.3, h * 0.14, w * 0.33)
  mwGrad.addColorStop(0, 'rgba(180,160,255,0.04)')
  mwGrad.addColorStop(1, 'rgba(180,160,255,0)')
  ctx.fillStyle = mwGrad
  ctx.fillRect(0, 0, w, h * 0.45)

  for (let i = 0; i < 80; i++) {
    const tb = i / 79
    const bx = cbp(tb, w * 0.02, w * 0.22, w * 0.46, w * 0.65)
    const by = cbp(tb, h * 0.18, h * 0.04, h * 0.07, h * 0.24)
    const sx = (fract(Math.sin(i * 47.3) * 43758.5) - 0.5) * 28
    const sy = (fract(Math.sin(i * 83.1) * 43758.5) - 0.5) * 18
    const r  = 0.5 + fract(Math.sin(i * 61.7) * 43758.5) * 1.0
    const a  = 0.06 + fract(Math.sin(i * 23.9) * 43758.5) * 0.06
    ctx.beginPath()
    ctx.arc(bx + sx, by + sy, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
    ctx.fill()
  }

  // ── Starfield — 180 deterministic stars ──────────────────────────────────
  for (let i = 0; i < 180; i++) {
    const x       = fract(Math.sin(i * 127.1) * 43758.5) * w
    const y       = fract(Math.sin(i * 311.7) * 43758.5) * h * 0.75
    const r       = 0.5 + fract(Math.sin(i * 74.3) * 43758.5) * 1.7
    const baseOp  = 0.25 + fract(Math.sin(i * 53.9) * 43758.5) * 0.70
    const twinkle = 0.82 + 0.18 * Math.sin(s * (1.2 + fract(Math.sin(i * 29.3) * 43758.5) * 4) + i * 2.7)
    const op      = baseOp * twinkle

    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${op.toFixed(3)})`
    ctx.fill()

    if (fract(Math.sin(i * 91.7) * 43758.5) < 0.15) {
      const len = r * 3.5
      ctx.strokeStyle = `rgba(255,255,255,${(op * 0.55).toFixed(3)})`
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(x - len, y); ctx.lineTo(x + len, y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x, y - len); ctx.lineTo(x, y + len)
      ctx.stroke()
    }
  }

  // ── Lake — bottom 18% ─────────────────────────────────────────────────────
  const lakeY = h * 0.78

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, lakeY, w, h - lakeY)
  ctx.clip()

  ctx.fillStyle = 'rgba(1,8,14,0.6)'
  ctx.fillRect(0, lakeY, w, h - lakeY)

  for (let i = 0; i < 12; i++) {
    const bx = (i / 12) * w
    const sx = bx + Math.sin(s * 0.38 + bx * 0.011) * 6
    ctx.fillStyle = 'rgba(255,255,255,0.025)'
    ctx.fillRect(sx, lakeY, 1.5, h - lakeY)
  }

  // Faint star reflections — brightest ~20
  for (let i = 0; i < 180; i++) {
    if (fract(Math.sin(i * 53.9) * 43758.5) < 0.89) continue
    const x       = fract(Math.sin(i * 127.1) * 43758.5) * w
    const mirrorY = lakeY + fract(Math.sin(i * 17.3) * 43758.5) * (h - lakeY) * 0.35 + 2
    ctx.beginPath()
    ctx.arc(x, mirrorY, 1, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fill()
  }

  ctx.restore()

  // ── Dock — bottom-right silhouette ────────────────────────────────────────
  const dockX0  = w * 0.74
  const dockX1  = w * 0.935
  const dockTopY = lakeY + 3

  ctx.fillStyle = '#010810'
  ctx.fillRect(dockX0, dockTopY, dockX1 - dockX0, 14)
  ctx.fillRect(dockX0 + 5,             dockTopY, 5, h - dockTopY)
  ctx.fillRect(dockX1 - 10,            dockTopY, 5, h - dockTopY)
  ctx.fillRect((dockX0 + dockX1) * 0.5, dockTopY + 4, 4, h - dockTopY)

  // ── Pine treeline — gap at center for campfire ────────────────────────────
  ctx.fillStyle = '#010810'
  const treeCount = Math.ceil(w / 26)
  for (let i = 0; i < treeCount; i++) {
    const nx = (i + 0.5) / treeCount
    if (nx > 0.40 && nx < 0.60) continue

    const r1   = fract(Math.sin(i * 7.391  + 1.0) * 43758.5)
    const r2   = fract(Math.sin(i * 13.741 + 2.0) * 43758.5)
    const r3   = fract(Math.sin(i * 19.113 + 3.0) * 43758.5)
    const cx   = (i + r1 * 0.6 - 0.3) * (w / treeCount)
    const treeW = 11 + r3 * 22
    const treeH = h * (0.09 + r2 * 0.12)
    const base  = h * 0.75 + r2 * h * 0.04

    ctx.beginPath()
    ctx.moveTo(cx, base - treeH)
    ctx.lineTo(cx - treeW * 0.5, base)
    ctx.lineTo(cx + treeW * 0.5, base)
    ctx.closePath()
    ctx.fill()
  }

  // ── Adirondack chair — silhouette to the left of fire ────────────────────
  const fx  = w * 0.5
  const fy  = h * 0.72
  const chx = fx - 55
  const chy = fy - 2

  ctx.fillStyle = '#010f0a'

  // Seat
  ctx.fillRect(chx - 16, chy - 6, 32, 7)

  // Back (tilted slightly)
  ctx.save()
  ctx.translate(chx, chy - 6)
  ctx.rotate(-0.1)
  ctx.fillRect(-13, -32, 26, 32)
  ctx.restore()

  // Armrests
  ctx.fillRect(chx - 21, chy - 12, 9, 5)
  ctx.fillRect(chx + 12, chy - 12, 9, 5)

  // Legs
  ctx.fillRect(chx - 13, chy + 1, 4, 12)
  ctx.fillRect(chx +  9, chy + 1, 4, 12)

  // ── Campfire ──────────────────────────────────────────────────────────────

  // Ground glow
  const glowGrad = ctx.createRadialGradient(fx, fy + 2, 0, fx, fy + 2, 55)
  glowGrad.addColorStop(0, 'rgba(255,80,10,0.14)')
  glowGrad.addColorStop(1, 'rgba(255,80,10,0)')
  ctx.fillStyle = glowGrad
  ctx.beginPath()
  ctx.ellipse(fx, fy + 4, 52, 26, 0, 0, Math.PI * 2)
  ctx.fill()

  // Logs — stroked lines with round caps
  ctx.save()
  ctx.strokeStyle = '#1a0e06'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.save()
  ctx.translate(fx, fy)
  ctx.rotate(0.42)
  ctx.beginPath(); ctx.moveTo(-21, 0); ctx.lineTo(21, 0); ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.translate(fx, fy)
  ctx.rotate(-0.42)
  ctx.beginPath(); ctx.moveTo(-21, 0); ctx.lineTo(21, 0); ctx.stroke()
  ctx.restore()
  ctx.restore()

  // Flame teardrop helper
  function drawFlame(cx, cy, width, height, fo, color) {
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.bezierCurveTo(cx + width * (0.5 + fo * 0.12), cy - height * 0.3,
                      cx + width * (0.28 + fo * 0.08), cy - height, cx, cy - height)
    ctx.bezierCurveTo(cx - width * (0.28 + fo * 0.08), cy - height,
                      cx - width * (0.5 + fo * 0.12), cy - height * 0.3, cx, cy)
    ctx.fillStyle = color
    ctx.fill()
  }

  const fb = fy - 4
  drawFlame(fx, fb, 14, 28, Math.sin(s * 6.5 + 0 * 1.1), 'rgba(200,60,5,0.5)')
  drawFlame(fx, fb, 11, 22, Math.sin(s * 6.5 + 1 * 1.1), 'rgba(255,110,15,0.55)')
  drawFlame(fx, fb,  8, 15, Math.sin(s * 6.5 + 2 * 1.1), 'rgba(255,180,40,0.6)')
  drawFlame(fx, fb,  5,  8, Math.sin(s * 6.5 + 3 * 1.1), 'rgba(255,235,140,0.7)')

  // Sparks
  for (let i = 0; i < 18; i++) {
    const speed    = 0.3 + fract(Math.sin(i * 67.1) * 43758.5) * 0.5
    const offset   = fract(Math.sin(i * 93.7) * 43758.5)
    const progress = (s * speed + offset) % 1.0
    if (progress > 0.5) continue
    const driftX = (fract(Math.sin(i * 41.3) * 43758.5) - 0.5) * 18
    const sparkX = fx + driftX + Math.sin(s * 2.1 + i * 0.8) * 4
    const sparkY = fy - progress * 50 - 6
    const alpha  = (1.0 - progress * 2.0) * 0.85
    ctx.beginPath()
    ctx.arc(sparkX, sparkY, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,200,80,${alpha.toFixed(3)})`
    ctx.fill()
  }
}

// ─── SVG silhouettes ───────────────────────────────────────────────────────

function OwlSVG() {
  return (
    <svg width="44" height="28" viewBox="0 0 44 28" aria-hidden="true">
      <path d="M22 14 C14 5 2 9 0 19 C8 14 16 16 22 14Z" fill="#010810" />
      <path d="M22 14 C30 5 42 9 44 19 C36 14 28 16 22 14Z" fill="#010810" />
      <ellipse cx="22" cy="19" rx="5" ry="7" fill="#010810" />
      <circle cx="22" cy="10" r="5" fill="#010810" />
      <polygon points="18,6 16,1 21,5" fill="#010810" />
      <polygon points="26,6 28,1 23,5" fill="#010810" />
    </svg>
  )
}

function FoxSVG() {
  return (
    <svg width="64" height="40" viewBox="0 0 64 40" fill="#0a2018" aria-hidden="true">
      <ellipse cx="30" cy="26" rx="17" ry="9" />
      <ellipse cx="48" cy="19" rx="10" ry="8" />
      <polygon points="42,13 45,5 50,13" />
      <polygon points="48,12 51,5 55,13" />
      <polygon points="57,20 64,22 57,24" />
      <rect x="36" y="32" width="5" height="11" rx="2" transform="rotate(-12 36 32)" />
      <rect x="42" y="32" width="5" height="11" rx="2" transform="rotate(12 42 32)" />
      <rect x="18" y="32" width="5" height="11" rx="2" transform="rotate(15 18 32)" />
      <rect x="24" y="32" width="5" height="11" rx="2" transform="rotate(-8 24 32)" />
      <path d="M13 26 Q0 18 2 8 Q7 4 12 12 Q9 18 13 26Z" />
    </svg>
  )
}

function BirdSVG() {
  return (
    <svg width="28" height="18" viewBox="0 0 28 18" fill="#0a2018" aria-hidden="true">
      <ellipse cx="14" cy="11" rx="7" ry="5" />
      <circle cx="21" cy="7" r="4" />
      <polygon points="24.5,7 29,8 24.5,9.5" />
      <polygon points="7,11 0,9 7,13" />
      <path d="M11 9 Q14 3 19 7 Q14 8 11 9Z" />
    </svg>
  )
}

// ─── Animated elements ─────────────────────────────────────────────────────

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
        background: 'linear-gradient(to right, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 100%)',
        transformOrigin: '0% 50%',
        rotate: -star.angle,
      }}
      initial={{ opacity: 1, x: 0, y: 0 }}
      animate={{ x: -star.dist * Math.cos(rad), y: star.dist * Math.sin(rad), opacity: 0 }}
      transition={{ duration: 0.6, ease: 'linear' }}
      onAnimationComplete={onDone}
    />
  )
}

function Owl({ onDone }) {
  const sw = typeof window !== 'undefined' ? window.innerWidth : 1920
  const yKF = [0, -9, 0, 9, 0, -9, 0]
  return (
    <motion.div
      style={{ position: 'absolute', top: '18%', left: 0 }}
      initial={{ x: sw + 60, y: 0 }}
      animate={{ x: -100, y: yKF }}
      transition={{
        x: { duration: 3.5, ease: 'linear' },
        y: { duration: 3.5, ease: 'easeInOut', times: [0, 1/6, 2/6, 3/6, 4/6, 5/6, 1] },
      }}
      onAnimationComplete={onDone}
    >
      <OwlSVG />
    </motion.div>
  )
}

function Fox({ fromLeft, onDone }) {
  const sw = typeof window !== 'undefined' ? window.innerWidth : 1920
  return (
    <motion.div
      style={{ position: 'absolute', top: '83%', left: 0, scaleX: fromLeft ? 1 : -1 }}
      initial={{ x: fromLeft ? -80 : sw + 80 }}
      animate={{ x: fromLeft ? sw + 80 : -80 }}
      transition={{ duration: 4.5, ease: 'linear' }}
      onAnimationComplete={onDone}
    >
      <FoxSVG />
    </motion.div>
  )
}

function Bird({ onDone }) {
  const [phase, setPhase] = useState('landing')
  const sw       = typeof window !== 'undefined' ? window.innerWidth  : 1920
  const sh       = typeof window !== 'undefined' ? window.innerHeight : 1080
  const landX    = sw * 0.18
  const landY    = sh * 0.68
  const sitMs    = useMemo(() => 180000 + Math.random() * 120000, [])

  useEffect(() => {
    if (phase !== 'perched') return
    const timer = setTimeout(() => setPhase('leaving'), sitMs)
    return () => clearTimeout(timer)
  }, [phase, sitMs])

  return (
    <motion.div
      style={{ position: 'absolute', left: 0, top: 0 }}
      initial={{ x: -40, y: landY + 15 }}
      animate={
        phase === 'leaving'
          ? { x: sw + 40, y: landY - 40, opacity: 0 }
          : { x: landX,   y: landY }
      }
      transition={
        phase === 'leaving'
          ? { duration: 1.5, ease: [0.23, 1, 0.32, 1] }
          : { type: 'spring', duration: 0.4, bounce: 0.2 }
      }
      onAnimationComplete={() => {
        if (phase === 'landing') setPhase('perched')
        else if (phase === 'leaving') onDone()
      }}
    >
      <BirdSVG />
    </motion.div>
  )
}

function Fireflies() {
  const flies = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    id:       i,
    x:        fract(Math.sin(i * 47.3) * 43758.5) * 100,
    y:        74 + fract(Math.sin(i * 83.1) * 43758.5) * 8,
    delay:    fract(Math.sin(i * 31.7) * 43758.5) * 3,
    duration: 0.8 + fract(Math.sin(i * 19.9) * 43758.5) * 1.2,
  })), [])

  return (
    <>
      <style>{`@keyframes pm-ff{0%,100%{opacity:0;transform:scale(.5)}50%{opacity:1;transform:scale(1)}}`}</style>
      {flies.map(f => (
        <div
          key={f.id}
          style={{
            position: 'absolute',
            left: `${f.x}%`,
            top:  `${f.y}%`,
            width: 4, height: 4,
            borderRadius: '50%',
            background: 'rgba(180,255,140,0.7)',
            boxShadow: '0 0 5px 2px rgba(180,255,140,0.25)',
            animation: `pm-ff ${f.duration.toFixed(2)}s ease-in-out ${f.delay.toFixed(2)}s infinite`,
          }}
        />
      ))}
    </>
  )
}

// ─── Main foreground export ────────────────────────────────────────────────

export function PureMichiganForeground() {
  const [stars,     setStars]     = useState([])
  const [owlActive, setOwlActive] = useState(false)
  const owlKeyRef  = useRef(0)
  const owlTimer   = useRef(null)

  const [foxActive, setFoxActive] = useState(false)
  const foxKeyRef   = useRef(0)
  const foxFromLeft = useRef(true)
  const foxTimer    = useRef(null)

  const [birdActive, setBirdActive] = useState(false)
  const birdKeyRef = useRef(0)
  const birdTimer  = useRef(null)

  // ── Shooting stars ────────────────────────────────────────────────────────
  useEffect(() => {
    let timer
    function spawn() {
      setStars(prev => {
        const star = {
          id:    Date.now() + Math.random(),
          x:     0.52 + Math.random() * 0.42,
          y:     0.02 + Math.random() * 0.30,
          len:   80   + Math.random() * 70,
          angle: 22   + Math.random() * 18,
          dist:  160  + Math.random() * 100,
        }
        return [...prev.slice(-1), star]
      })
      timer = setTimeout(spawn, 8000 + Math.random() * 7000)
    }
    timer = setTimeout(spawn, 4000 + Math.random() * 5000)
    return () => clearTimeout(timer)
  }, [])

  // ── Owl ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    function launch() { owlKeyRef.current += 1; setOwlActive(true) }
    owlTimer.current = setTimeout(launch, 6000 + Math.random() * 8000)
    return () => clearTimeout(owlTimer.current)
  }, [])

  function handleOwlDone() {
    setOwlActive(false)
    owlTimer.current = setTimeout(() => { owlKeyRef.current += 1; setOwlActive(true) }, 45000)
  }

  // ── Fox ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    function launch() {
      foxFromLeft.current = Math.random() < 0.5
      foxKeyRef.current += 1
      setFoxActive(true)
    }
    foxTimer.current = setTimeout(launch, 180000 + Math.random() * 120000)
    return () => clearTimeout(foxTimer.current)
  }, [])

  function handleFoxDone() {
    setFoxActive(false)
    foxTimer.current = setTimeout(() => {
      foxFromLeft.current = Math.random() < 0.5
      foxKeyRef.current += 1
      setFoxActive(true)
    }, 240000 + Math.random() * 240000)
  }

  // ── Bird ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    function launch() { birdKeyRef.current += 1; setBirdActive(true) }
    birdTimer.current = setTimeout(launch, 120000 + Math.random() * 120000)
    return () => clearTimeout(birdTimer.current)
  }, [])

  function handleBirdDone() {
    setBirdActive(false)
    birdTimer.current = setTimeout(() => {
      birdKeyRef.current += 1
      setBirdActive(true)
    }, 360000 + Math.random() * 240000)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Fireflies />

      {/* Cowboy silhouette — faces the fire */}
      <img
        src="/green_guy_extracted.png"
        aria-hidden="true"
        style={{
          position:  'absolute',
          bottom:    '6%',
          left:      '50%',
          transform: 'translateX(-50%) scaleX(-1)',
          height:    '36%',
          width:     'auto',
          filter:    'brightness(0.5) saturate(0.6)',
          zIndex:    3,
        }}
      />

      <AnimatePresence>
        {stars.map(star => (
          <ShootingStar
            key={star.id}
            star={star}
            onDone={() => setStars(p => p.filter(s => s.id !== star.id))}
          />
        ))}
      </AnimatePresence>

      {owlActive  && <Owl  key={owlKeyRef.current}  onDone={handleOwlDone}  />}
      {foxActive  && <Fox  key={foxKeyRef.current}   fromLeft={foxFromLeft.current} onDone={handleFoxDone}  />}
      {birdActive && <Bird key={birdKeyRef.current}  onDone={handleBirdDone} />}
    </div>
  )
}
