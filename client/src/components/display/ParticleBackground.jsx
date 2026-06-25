import { useMemo } from 'react'

// ─── Keyframes ────────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes ambientBreathe {
    0%, 100% { opacity: var(--lo, 0.03); }
    50%       { opacity: var(--hi, 0.10); }
  }
  @keyframes ambientFlicker {
    0%  { opacity: var(--lo, 0.15); }
    12% { opacity: var(--hi, 0.45); }
    28% { opacity: calc(var(--lo, 0.15) + 0.04); }
    44% { opacity: var(--hi, 0.45); }
    55% { opacity: var(--lo, 0.15); }
    72% { opacity: calc(var(--hi, 0.45) * 0.95); }
    88% { opacity: calc(var(--lo, 0.15) * 0.85); }
    100%{ opacity: var(--hi, 0.45); }
  }
  @keyframes ambientNeonBuzz {
    0%  { opacity: var(--lo, 0.18); }
    8%  { opacity: var(--hi, 0.48); }
    16% { opacity: calc(var(--lo, 0.18) * 1.1); }
    24% { opacity: var(--hi, 0.48); }
    35% { opacity: var(--lo, 0.18); }
    50% { opacity: calc(var(--hi, 0.48) * 0.9); }
    64% { opacity: var(--lo, 0.18); }
    72% { opacity: var(--hi, 0.48); }
    85% { opacity: calc(var(--lo, 0.18) * 1.2); }
    100%{ opacity: calc(var(--hi, 0.48) * 0.95); }
  }
  @keyframes ambientFallSlow {
    0%   { transform: translateY(-8px) translateX(0px);   opacity: 0;    }
    8%   { opacity: var(--hi, 0.8); }
    92%  { opacity: var(--hi, 0.7); }
    100% { transform: translateY(108vh) translateX(var(--drift, 8px)); opacity: 0; }
  }
  @keyframes ambientRiseUp {
    0%   { transform: translateY(0) scale(1);    opacity: 0;    }
    10%  { opacity: var(--hi, 0.6); }
    90%  { opacity: var(--lo, 0.1); }
    100% { transform: translateY(-38vh) scale(0.6); opacity: 0; }
  }
  @keyframes ambientPulseIn {
    0%, 100% { opacity: 0;              transform: scale(0.5); }
    40%, 60% { opacity: var(--hi, 0.9); transform: scale(1.2); }
  }
  @keyframes ambientDriftAcross {
    0%   { transform: translateX(-12%); opacity: 0; }
    15%  { opacity: var(--hi, 0.20); }
    85%  { opacity: var(--hi, 0.18); }
    100% { transform: translateX(112%); opacity: 0; }
  }
  @keyframes ambientAuroraFade {
    0%, 100% { opacity: 0; }
    25%, 75% { opacity: var(--hi, 0.35); }
  }
  @keyframes ambientMeteor {
    0%   { transform: translateX(0) translateY(0);        opacity: 0;  }
    4%   { opacity: 0.9; }
    96%  { opacity: 0.7; }
    100% { transform: translateX(-70px) translateY(50px); opacity: 0;  }
  }
  @keyframes ambientScanline {
    from { transform: translateY(0); }
    to   { transform: translateY(4px); }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
  }
`

// ─── Shared Vignette ──────────────────────────────────────────────────────
function Vignette({ r, g, b, strength = 0.55 }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 80% 80% at 50% 50%, transparent 35%, rgba(${r},${g},${b},${strength}) 100%)`,
        willChange: 'opacity',
      }}
    />
  )
}

// ─── Reusable Primitives ──────────────────────────────────────────────────

function GlowLayer({ style, lo, hi, duration = '4s', delay = '0s', flicker = false, buzz = false }) {
  const animName = buzz ? 'ambientNeonBuzz' : flicker ? 'ambientFlicker' : 'ambientBreathe'
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', pointerEvents: 'none', willChange: 'opacity',
        '--lo': lo, '--hi': hi,
        animation: `${animName} ${duration} ${delay} ease-in-out infinite`,
        ...style,
      }}
    />
  )
}

function FallingParticle({ left, size, color, duration, delay, drift = '8px', opacity = 0.85, square = false, ratio = 1 }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', top: '-3%', left, pointerEvents: 'none',
        width: size, height: ratio === 1 ? size : size * ratio,
        borderRadius: square ? '1px' : '50%',
        background: color,
        willChange: 'transform, opacity',
        '--hi': opacity, '--drift': drift,
        animation: `ambientFallSlow ${duration} ${delay} ease-in-out infinite`,
      }}
    />
  )
}

function RisingParticle({ left, bottom = '5%', size, color, duration, delay, opacity = 0.6 }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', bottom, left, pointerEvents: 'none',
        width: size, height: size, borderRadius: '50%',
        background: color,
        willChange: 'transform, opacity',
        '--hi': opacity,
        animation: `ambientRiseUp ${duration} ${delay} ease-in-out infinite`,
      }}
    />
  )
}

function PulseDot({ left, top, size, color, duration, delay, glowColor }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', left, top, pointerEvents: 'none',
        width: size, height: size, borderRadius: '50%',
        background: color,
        boxShadow: glowColor ? `0 0 ${size * 2}px ${glowColor}` : undefined,
        willChange: 'transform, opacity',
        '--hi': 0.9,
        animation: `ambientPulseIn ${duration} ${delay} ease-in-out infinite`,
      }}
    />
  )
}

// ─── 1. PURE MICHIGAN ─────────────────────────────────────────────────────
function PureMichiganAmbient() {
  const fireflies = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    left:  `${12 + (i * 6.5 + (i % 3) * 9)}%`,
    top:   `${48 + (i % 5) * 8 + (i % 2) * 6}%`,
    size:  3 + (i % 3) * 1.0,
    dur:   `${2.8 + (i % 4) * 0.9}s`,
    delay: `${(i * 0.7) % 6}s`,
  })), [])

  return <>
    <GlowLayer lo={0.15} hi={0.35} duration="12s" style={{
      inset: 0, bottom: '60%',
      background: 'linear-gradient(to bottom, rgba(0,25,80,0.32) 0%, rgba(0,40,100,0.22) 70%, transparent 100%)',
    }}/>
    <GlowLayer lo={0.18} hi={0.42} duration="18s" delay="3s" style={{
      bottom: 0, left: 0, right: 0, height: '30%',
      background: 'linear-gradient(to top, rgba(0,70,140,0.40), rgba(0,50,100,0.20), transparent)',
    }}/>
    {fireflies.map((f, i) => (
      <PulseDot key={i} left={f.left} top={f.top} size={f.size}
        color="rgba(180,255,80,0.95)" glowColor="rgba(140,255,40,0.55)"
        duration={f.dur} delay={f.delay}
      />
    ))}
  </>
}

// ─── 2. MIDNIGHT GALAXY ───────────────────────────────────────────────────
function MidnightGalaxyAmbient() {
  const stars = useMemo(() => Array.from({ length: 120 }, (_, i) => ({
    left:    `${(i * 97 + i % 7 * 31) % 100}%`,
    top:     `${(i * 83 + i % 5 * 43) % 100}%`,
    size:    0.8 + (i % 4) * 0.5,
    opacity: 0.35 + (i % 5) * 0.10,
    dur:     `${12 + (i % 7) * 4}s`,
    delay:   `${(i * 1.1) % 12}s`,
  })), [])

  return <>
    {/* Large purple nebula cloud — right-center */}
    <GlowLayer lo={0.35} hi={0.70} duration="22s" style={{
      top: '5%', right: '-5%', width: '65%', height: '60%',
      background: 'radial-gradient(ellipse, rgba(120,40,220,0.60), transparent 70%)',
    }}/>
    {/* Pink/magenta accent nebula — upper left */}
    <GlowLayer lo={0.20} hi={0.52} duration="28s" delay="8s" style={{
      top: '-5%', left: '-10%', width: '55%', height: '50%',
      background: 'radial-gradient(ellipse, rgba(200,40,160,0.50), transparent 70%)',
    }}/>
    {/* Deep blue base wash */}
    <GlowLayer lo={0.25} hi={0.48} duration="35s" delay="4s" style={{
      bottom: '10%', left: '20%', right: '20%', height: '40%',
      background: 'radial-gradient(ellipse, rgba(30,60,200,0.42), transparent 70%)',
    }}/>
    {/* Stars */}
    {stars.map((s, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', left: s.left, top: s.top, pointerEvents: 'none',
        width: s.size, height: s.size, borderRadius: '50%',
        background: `rgba(255,255,255,${s.opacity})`,
        willChange: 'opacity',
        '--lo': s.opacity * 0.3, '--hi': s.opacity,
        animation: `ambientBreathe ${s.dur} ${s.delay} ease-in-out infinite`,
      }}/>
    ))}
  </>
}

// ─── 3. AUTUMN HARVEST ────────────────────────────────────────────────────
function AutumnHarvestAmbient() {
  const leaves = useMemo(() => [
    { color: 'rgba(190,65,10,0.90)',  size: 6,  dur: '9s',    delay: '0s',   drift: '14px'  },
    { color: 'rgba(210,95,0,0.85)',   size: 5,  dur: '11s',   delay: '2.1s', drift: '-10px' },
    { color: 'rgba(160,45,5,0.88)',   size: 7,  dur: '8s',    delay: '4.3s', drift: '20px'  },
    { color: 'rgba(200,120,0,0.82)',  size: 5,  dur: '13s',   delay: '1.2s', drift: '-16px' },
    { color: 'rgba(175,55,8,0.90)',   size: 6,  dur: '10s',   delay: '6.5s', drift: '8px'   },
    { color: 'rgba(220,80,0,0.80)',   size: 4,  dur: '12s',   delay: '3.8s', drift: '-22px' },
    { color: 'rgba(150,40,5,0.86)',   size: 7,  dur: '9.5s',  delay: '7.2s', drift: '18px'  },
    { color: 'rgba(195,100,0,0.88)',  size: 5,  dur: '11.5s', delay: '0.8s', drift: '-8px'  },
    { color: 'rgba(230,70,5,0.84)',   size: 4,  dur: '10.5s', delay: '5.1s', drift: '12px'  },
  ].map((l, i) => ({ ...l, left: `${6 + i * 10}%` })), [])

  const embers = useMemo(() => Array.from({ length: 5 }, (_, i) => ({
    left:  `${42 + (i % 4) * 4 - 6}%`,
    size:  2 + (i % 2) * 1.0,
    dur:   `${3 + (i % 3) * 1.0}s`,
    delay: `${(i * 0.6) % 4}s`,
  })), [])

  return <>
    {/* Warm sky glow — top */}
    <GlowLayer lo={0.28} hi={0.62} duration="20s" style={{
      top: 0, left: 0, right: 0, height: '40%',
      background: 'linear-gradient(to bottom, rgba(200,60,10,0.52) 0%, rgba(180,40,5,0.24) 60%, transparent 100%)',
    }}/>
    {/* Hearth glow — bottom */}
    <GlowLayer lo={0.22} hi={0.55} duration="14s" delay="5s" style={{
      bottom: 0, left: 0, right: 0, height: '20%',
      background: 'linear-gradient(to top, rgba(200,80,10,0.50), transparent)',
    }}/>
    {/* Firelight pulse — center bottom */}
    <GlowLayer lo={0.18} hi={0.52} duration="3.2s" flicker style={{
      inset: 0,
      background: 'radial-gradient(ellipse 12% 28% at 50% 96%, rgba(255,100,20,0.58), transparent)',
    }}/>
    {leaves.map((l, i) => (
      <FallingParticle key={i} left={l.left} size={Math.round(l.size * 2)} color={l.color}
        duration={l.dur} delay={l.delay} drift={l.drift} opacity={0.88} ratio={0.6}/>
    ))}
    {embers.map((e, i) => (
      <RisingParticle key={i} left={e.left} size={e.size}
        color="rgba(255,130,20,0.90)" duration={e.dur} delay={e.delay} opacity={0.80}/>
    ))}
  </>
}

// ─── 4. NORTHERN LIGHTS ───────────────────────────────────────────────────
function NorthernLightsAmbient() {
  return <>
    {/* SVG wavy aurora curtains — zero straight edges */}
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        filter: 'blur(6px)',
      }}
    >
      <defs>
        <linearGradient id="nlAur1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgb(30,220,130)"  stopOpacity="0" />
          <stop offset="50%"  stopColor="rgb(30,220,130)"  stopOpacity="0.65" />
          <stop offset="100%" stopColor="rgb(30,220,130)"  stopOpacity="0" />
        </linearGradient>
        <linearGradient id="nlAur2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgb(100,40,240)"  stopOpacity="0" />
          <stop offset="50%"  stopColor="rgb(100,40,240)"  stopOpacity="0.55" />
          <stop offset="100%" stopColor="rgb(100,40,240)"  stopOpacity="0" />
        </linearGradient>
        <linearGradient id="nlAur3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgb(30,220,130)"  stopOpacity="0" />
          <stop offset="50%"  stopColor="rgb(30,220,130)"  stopOpacity="0.42" />
          <stop offset="100%" stopColor="rgb(30,220,130)"  stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Curtain 1 — teal primary, wavy band y ≈ 8–22 */}
      <path
        d="M -2 10 C 20 4,40 16,60 9 C 80 3,95 14,102 10 L 102 22 C 95 28,80 17,60 22 C 40 28,20 16,-2 22 Z"
        fill="url(#nlAur1)"
        style={{ willChange: 'opacity', '--hi': 0.90, animation: 'ambientAuroraFade 22s 0s ease-in-out infinite' }}
      />
      {/* Curtain 2 — purple, wavy band y ≈ 16–28, overlapping */}
      <path
        d="M -2 16 C 15 10,35 22,55 14 C 75 6,92 20,102 16 L 102 28 C 90 35,70 20,50 27 C 30 34,12 18,-2 28 Z"
        fill="url(#nlAur2)"
        style={{ willChange: 'opacity', '--hi': 0.80, animation: 'ambientAuroraFade 30s 8s ease-in-out infinite' }}
      />
      {/* Curtain 3 — teal faint, wavy band y ≈ 22–34 */}
      <path
        d="M -2 22 C 18 16,38 28,58 21 C 78 14,96 26,102 22 L 102 34 C 96 40,76 26,55 33 C 34 40,16 26,-2 34 Z"
        fill="url(#nlAur3)"
        style={{ willChange: 'opacity', '--hi': 0.70, animation: 'ambientAuroraFade 26s 14s ease-in-out infinite' }}
      />
    </svg>
    {/* Star field */}
    {Array.from({ length: 30 }, (_, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute',
        left: `${(i * 97 + i % 7 * 31) % 100}%`,
        top:  `${(i * 83 + i % 5 * 43) % 65}%`,
        width: 1.2 + (i % 3) * 0.4, height: 1.2 + (i % 3) * 0.4,
        borderRadius: '50%',
        background: `rgba(200,240,220,${0.40 + (i % 4) * 0.10})`,
        pointerEvents: 'none',
      }}/>
    ))}
  </>
}

// ─── 5. MEDIEVAL TAVERN ───────────────────────────────────────────────────
function MedievalTavernAmbient() {
  const wisps = useMemo(() => [
    { left: '12%', dur: '14s', delay: '0s'  },
    { left: '48%', dur: '18s', delay: '5s'  },
    { left: '80%', dur: '16s', delay: '9s'  },
  ], [])

  return <>
    {/* Left torch sconce */}
    <GlowLayer lo={0.25} hi={0.62} duration="3.4s" flicker style={{
      top: 0, left: 0, bottom: 0, width: '28%',
      background: 'radial-gradient(ellipse at left center, rgba(240,140,20,0.62), transparent 75%)',
    }}/>
    {/* Right torch sconce */}
    <GlowLayer lo={0.22} hi={0.56} duration="2.9s" delay="1.1s" flicker style={{
      top: 0, right: 0, bottom: 0, width: '28%',
      background: 'radial-gradient(ellipse at right center, rgba(240,130,18,0.58), transparent 75%)',
    }}/>
    {/* Warm ceiling glow */}
    <GlowLayer lo={0.18} hi={0.42} duration="8s" style={{
      inset: 0,
      background: 'rgba(180,80,10,0.22)',
    }}/>
    {/* Smoke wisps */}
    {wisps.map((w, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', bottom: 0, left: w.left,
        width: '8%', height: '40%',
        background: 'radial-gradient(ellipse, rgba(160,140,120,0.14), transparent)',
        willChange: 'transform, opacity',
        '--hi': 0.18,
        animation: `ambientRiseUp ${w.dur} ${w.delay} ease-in-out infinite`,
      }}/>
    ))}
  </>
}

// ─── 6. SUNSET BOULEVARD ─────────────────────────────────────────────────
function SunsetBoulevardAmbient() {
  return <>
    {/* Sunset sky — warm amber/orange upper half */}
    <GlowLayer lo={0.35} hi={0.70} duration="18s" style={{
      top: 0, left: 0, right: 0, height: '55%',
      background: 'linear-gradient(to bottom, rgba(220,80,20,0.55) 0%, rgba(180,50,10,0.35) 50%, transparent 100%)',
    }}/>
    {/* Orange horizon glow — center */}
    <GlowLayer lo={0.30} hi={0.60} duration="12s" delay="4s" style={{
      top: '30%', left: '15%', right: '15%', height: '30%',
      background: 'radial-gradient(ellipse at center, rgba(255,130,20,0.45), transparent 75%)',
    }}/>
    {/* Deep magenta/purple side wash */}
    <GlowLayer lo={0.20} hi={0.45} duration="22s" delay="7s" style={{
      top: 0, left: 0, bottom: 0, width: '30%',
      background: 'radial-gradient(ellipse at left center, rgba(180,20,100,0.35), transparent 70%)',
    }}/>
    <GlowLayer lo={0.15} hi={0.38} duration="26s" delay="11s" style={{
      top: 0, right: 0, bottom: 0, width: '30%',
      background: 'radial-gradient(ellipse at right center, rgba(160,10,80,0.30), transparent 70%)',
    }}/>
    {/* Bottom shadow — fades to transparent upward */}
    <div aria-hidden style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: '16%',
      background: 'linear-gradient(to top, rgba(4,1,0,0.72), transparent)', pointerEvents: 'none',
    }}/>
  </>
}

// ─── 7. RETRO ARCADE ──────────────────────────────────────────────────────
function RetroArcadeAmbient() {
  const pixelStatic = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    left:  `${(i * 137) % 100}%`,
    top:   `${(i * 91 + 23) % 100}%`,
    delay: `${(i * 3.7) % 20}s`,
    dur:   `${0.06 + (i % 3) * 0.04}s`,
  })), [])

  return <>
    {/* Scanlines */}
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      backgroundImage: 'repeating-linear-gradient(transparent 0px, transparent 3px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0.18) 4px)',
      backgroundSize: '100% 4px',
      willChange: 'transform',
      animation: 'ambientScanline 0.5s linear infinite',
    }}/>
    {/* Purple/violet left neon */}
    <GlowLayer lo={0.25} hi={0.75} duration="1.8s" buzz style={{
      top: 0, left: 0, bottom: 0, width: '28%',
      background: 'radial-gradient(ellipse at left center, rgba(160,20,255,0.70), transparent 75%)',
    }}/>
    {/* Cyan/green right neon */}
    <GlowLayer lo={0.20} hi={0.68} duration="2.2s" delay="0.5s" buzz style={{
      top: 0, right: 0, bottom: 0, width: '28%',
      background: 'radial-gradient(ellipse at right center, rgba(20,220,80,0.62), transparent 75%)',
    }}/>
    {/* CRT phosphor center glow */}
    <GlowLayer lo={0.15} hi={0.42} duration="4s" delay="1.2s" style={{
      top: '20%', left: '20%', right: '20%', bottom: '20%',
      background: 'radial-gradient(ellipse, rgba(180,80,255,0.38), transparent 70%)',
    }}/>
    {/* Pixel static */}
    {pixelStatic.map((p, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', left: p.left, top: p.top, pointerEvents: 'none',
        width: 2, height: 2,
        background: i % 3 === 0 ? 'rgba(255,80,255,0.90)' : i % 3 === 1 ? 'rgba(80,255,200,0.85)' : 'rgba(255,255,255,0.80)',
        willChange: 'opacity',
        '--lo': 0, '--hi': 0.90,
        animation: `ambientBreathe ${p.dur} ${p.delay} steps(1) infinite`,
      }}/>
    ))}
  </>
}

// ─── 8. SAND DUNE CHILL ───────────────────────────────────────────────────
// Theme: twilight beach — warm sand cooling, ocean shimmer, first stars
function SandDuneChillAmbient() {
  const stars = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left:  `${(i * 97 + i % 5 * 17) % 100}%`,
    top:   `${(i * 61 + i % 4 * 13) % 45}%`,
    size:  1.2 + (i % 3) * 0.5,
    dur:   `${4 + (i % 5) * 1.4}s`,
    delay: `${(i * 0.9) % 8}s`,
  })), [])

  return <>
    {/* Sunset horizon — warm amber from bottom third */}
    <GlowLayer lo={0.30} hi={0.60} duration="20s" style={{
      bottom: 0, left: 0, right: 0, height: '35%',
      background: 'linear-gradient(to top, rgba(210,120,20,0.50), rgba(180,80,10,0.28), transparent)',
    }}/>
    {/* Ocean shimmer — thin band at bottom */}
    <GlowLayer lo={0.20} hi={0.48} duration="8s" delay="2s" style={{
      bottom: 0, left: 0, right: 0, height: '8%',
      background: 'linear-gradient(to top, rgba(60,140,200,0.45), transparent)',
    }}/>
    {/* Warm golden sky glow */}
    <GlowLayer lo={0.20} hi={0.50} duration="25s" delay="5s" style={{
      top: '20%', left: '20%', right: '20%', height: '35%',
      background: 'radial-gradient(ellipse, rgba(220,140,30,0.42), transparent 70%)',
    }}/>
    {/* Stars emerging */}
    {stars.map((s, i) => (
      <PulseDot key={i} left={s.left} top={s.top} size={s.size}
        color="rgba(255,240,200,0.80)"
        duration={s.dur} delay={s.delay}
      />
    ))}
  </>
}

// ─── 9. HALLOWEEN ────────────────────────────────────────────────────────
function HalloweenAmbient() {
  const embers = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    left:  `${30 + (i % 5) * 8 - 8}%`,
    size:  1.5 + (i % 3) * 0.8,
    dur:   `${2.5 + (i % 4) * 0.8}s`,
    delay: `${(i * 0.6) % 5}s`,
  })), [])

  return <>
    {/* Jack-o-lantern orange — left edge */}
    <GlowLayer lo={0.25} hi={0.58} duration="3.2s" flicker style={{
      top: 0, left: 0, bottom: 0, width: '30%',
      background: 'radial-gradient(ellipse at left center, rgba(255,90,5,0.52), transparent 75%)',
    }}/>
    {/* Jack-o-lantern orange — right edge */}
    <GlowLayer lo={0.22} hi={0.52} duration="2.8s" delay="0.9s" flicker style={{
      top: 0, right: 0, bottom: 0, width: '30%',
      background: 'radial-gradient(ellipse at right center, rgba(240,80,5,0.48), transparent 75%)',
    }}/>
    {/* Orange bottom glow (jack-o-lantern floor) */}
    <GlowLayer lo={0.20} hi={0.48} duration="2.5s" delay="1.5s" flicker style={{
      bottom: 0, left: 0, right: 0, height: '25%',
      background: 'linear-gradient(to top, rgba(255,80,0,0.42), transparent)',
    }}/>
    {/* Purple fog center */}
    <GlowLayer lo={0.14} hi={0.38} duration="18s" delay="4s" style={{
      top: '15%', left: '20%', right: '20%', height: '55%',
      background: 'radial-gradient(ellipse, rgba(100,0,160,0.42), transparent 70%)',
    }}/>
    {/* Ember particles */}
    {embers.map((e, i) => (
      <RisingParticle key={i} left={e.left} size={e.size}
        color="rgba(255,100,10,0.95)" duration={e.dur} delay={e.delay} opacity={0.85}/>
    ))}
  </>
}

// ─── 10. JAZZ CLUB ───────────────────────────────────────────────────────
function JazzClubAmbient() {
  const motes = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    left:  `${38 + (i % 4) * 7}%`,
    top:   `${8 + (i % 4) * 12}%`,
    dur:   `${6 + i * 1.5}s`,
    delay: `${i * 1.1}s`,
  })), [])
  const smoke = useMemo(() => Array.from({ length: 4 }, (_, i) => ({
    left:  `${18 + i * 22}%`,
    dur:   `${10 + i * 3}s`,
    delay: `${i * 2.5}s`,
  })), [])

  return <>
    {/* Main center spotlight */}
    <GlowLayer lo={0.35} hi={0.72} duration="2.8s" style={{
      top: 0, left: '28%', right: '28%', height: '70%',
      background: 'radial-gradient(ellipse at top center, rgba(255,195,70,0.60), transparent 75%)',
    }}/>
    {/* Fill spotlight — stage left */}
    <GlowLayer lo={0.22} hi={0.58} duration="3.5s" delay="1.4s" style={{
      top: 0, left: '8%', width: '35%', height: '55%',
      background: 'radial-gradient(ellipse at top left, rgba(255,165,50,0.50), transparent 70%)',
    }}/>
    {/* Floor amber glow */}
    <GlowLayer lo={0.18} hi={0.40} duration="5s" style={{
      bottom: 0, left: 0, right: 0, height: '18%',
      background: 'linear-gradient(to top, rgba(180,80,10,0.32), transparent)',
    }}/>
    {/* Dust motes in spotlight beam */}
    {motes.map((m, i) => (
      <PulseDot key={i} left={m.left} top={m.top} size={1.8}
        color="rgba(255,210,120,0.55)"
        duration={m.dur} delay={m.delay}
      />
    ))}
    {/* Smoke wisps */}
    {smoke.map((s, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', bottom: 0, left: s.left,
        width: '5%', height: '35%',
        background: 'radial-gradient(ellipse, rgba(150,140,130,0.12), transparent)',
        willChange: 'transform, opacity',
        '--hi': 0.18,
        animation: `ambientRiseUp ${s.dur} ${s.delay} ease-in-out infinite`,
      }}/>
    ))}
  </>
}


// ─── 12. DIVE BAR ────────────────────────────────────────────────────────
function DiveBarAmbient() {
  return <>
    {/* Red neon sign — left wall */}
    <GlowLayer lo={0.22} hi={0.70} duration="1.6s" buzz style={{
      top: 0, left: 0, bottom: 0, width: '30%',
      background: 'radial-gradient(ellipse at left center, rgba(255,25,45,0.65), transparent 75%)',
    }}/>
    {/* Blue/white neon sign — right wall */}
    <GlowLayer lo={0.18} hi={0.60} duration="2.2s" delay="0.5s" buzz style={{
      top: 0, right: 0, bottom: 0, width: '28%',
      background: 'radial-gradient(ellipse at right center, rgba(40,100,255,0.58), transparent 75%)',
    }}/>
    {/* Warm amber floor — sticky bar residue */}
    <GlowLayer lo={0.15} hi={0.42} duration="8s" style={{
      bottom: 0, left: 0, right: 0, height: '20%',
      background: 'linear-gradient(to top, rgba(180,80,10,0.45), transparent)',
    }}/>
    {/* Center bar light pool */}
    <GlowLayer lo={0.14} hi={0.38} duration="6s" delay="3s" style={{
      top: '15%', left: '30%', right: '30%', bottom: '15%',
      background: 'radial-gradient(ellipse, rgba(220,120,30,0.35), transparent 70%)',
    }}/>
  </>
}

// ─── 13. ROOFTOP PARTY ───────────────────────────────────────────────────
function RooftopPartyAmbient() {
  const cityLights = useMemo(() => Array.from({ length: 55 }, (_, i) => ({
    left:    `${(i * 97 + i % 7 * 13) % 100}%`,
    top:     `${78 + (i % 5) * 3.5}%`,
    size:    1.5 + (i % 4) * 0.8,
    opacity: 0.45 + (i % 5) * 0.12,
    dur:     `${1.5 + (i % 5) * 1.0}s`,
    delay:   `${(i * 0.5) % 7}s`,
  })), [])

  return <>
    {/* City sky glow from below */}
    <GlowLayer lo={0.26} hi={0.58} duration="20s" style={{
      bottom: 0, left: 0, right: 0, height: '28%',
      background: 'linear-gradient(to top, rgba(255,200,80,0.50), rgba(100,150,255,0.25), transparent)',
    }}/>
    {/* City light haze rising */}
    <GlowLayer lo={0.16} hi={0.40} duration="30s" delay="8s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 80% 22% at 50% 78%, rgba(200,160,80,0.35), transparent)',
    }}/>
    {/* City lights grid */}
    {cityLights.map((l, i) => (
      <PulseDot key={i} left={l.left} top={l.top} size={l.size}
        color={`rgba(255,215,120,${l.opacity})`}
        duration={l.dur} delay={l.delay}
      />
    ))}
  </>
}



// ─── 16. CHRISTMAS EVE ───────────────────────────────────────────────────
function ChristmasEveAmbient() {
  const flakes = useMemo(() => Array.from({ length: 32 }, (_, i) => ({
    left:    `${(i * 97 + i % 6 * 11) % 100}%`,
    size:    2.5 + (i % 4) * 1.5,
    opacity: 0.65 + (i % 4) * 0.12,
    dur:     `${10 + (i % 6) * 2.5}s`,
    delay:   `${(i * 0.8) % 12}s`,
    drift:   `${(i % 2 === 0 ? 1 : -1) * (5 + (i % 4) * 3)}px`,
  })), [])

  return <>
    {/* Christmas red glow — left edge */}
    <GlowLayer lo={0.25} hi={0.68} duration="4s" flicker style={{
      top: 0, left: 0, bottom: 0, width: '30%',
      background: 'radial-gradient(ellipse at left center, rgba(220,20,20,0.62), transparent 75%)',
    }}/>
    {/* Christmas green glow — right edge */}
    <GlowLayer lo={0.22} hi={0.62} duration="4.5s" delay="2s" flicker style={{
      top: 0, right: 0, bottom: 0, width: '30%',
      background: 'radial-gradient(ellipse at right center, rgba(20,180,40,0.58), transparent 75%)',
    }}/>
    {/* Warm gold fireplace/candle — center */}
    <GlowLayer lo={0.24} hi={0.58} duration="3s" delay="1s" flicker style={{
      bottom: '5%', left: '35%', right: '35%', height: '35%',
      background: 'radial-gradient(ellipse at bottom center, rgba(255,180,40,0.55), transparent 80%)',
    }}/>
    {/* Snowflakes */}
    {flakes.map((f, i) => (
      <FallingParticle key={i} left={f.left} size={f.size}
        color={`rgba(255,255,255,${f.opacity})`}
        duration={f.dur} delay={f.delay} drift={f.drift} opacity={f.opacity}
      />
    ))}
  </>
}

// ─── 17. DRIVE-IN MOVIE ──────────────────────────────────────────────────
function DriveInMovieAmbient() {
  const projectorDust = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    left:  `${30 + (i % 6) * 7}%`,
    top:   `${5 + (i % 5) * 15}%`,
    dur:   `${7 + (i % 4) * 2}s`,
    delay: `${(i * 1.0) % 9}s`,
  })), [])

  return <>
    {/* Movie screen — upward glow from bottom center, fades in all directions */}
    <div aria-hidden style={{
      position: 'absolute', inset: 0,
      background: 'radial-gradient(ellipse 50% 62% at 50% 100%, rgba(255,248,220,0.45) 0%, rgba(255,248,220,0.20) 50%, transparent 100%)',
      pointerEvents: 'none',
    }}/>
    {/* Projector beam colors — red/blue cinematic */}
    <GlowLayer lo={0.15} hi={0.42} duration="12s" style={{
      top: 0, left: 0, right: 0, height: '30%',
      background: 'linear-gradient(to bottom, rgba(255,80,80,0.32), transparent)',
    }}/>
    <GlowLayer lo={0.12} hi={0.35} duration="12s" delay="6s" style={{
      top: 0, left: 0, right: 0, height: '30%',
      background: 'linear-gradient(to bottom, rgba(80,80,255,0.28), transparent)',
    }}/>
    {/* Projector dust motes */}
    {projectorDust.map((d, i) => (
      <PulseDot key={i} left={d.left} top={d.top} size={1.2}
        color="rgba(255,255,255,0.42)"
        duration={d.dur} delay={d.delay}
      />
    ))}
  </>
}


// ─── 19. WESTERN SHOWDOWN ────────────────────────────────────────────────
function WesternShowdownAmbient() {
  return <>
    {/* Blazing desert sky — top warm orange */}
    <GlowLayer lo={0.30} hi={0.60} duration="18s" style={{
      top: 0, left: 0, right: 0, height: '45%',
      background: 'linear-gradient(to bottom, rgba(200,70,10,0.48) 0%, rgba(180,50,5,0.28) 60%, transparent 100%)',
    }}/>
    {/* Setting sun horizon — bottom left */}
    <GlowLayer lo={0.28} hi={0.58} duration="22s" delay="6s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 60% 40% at 15% 100%, rgba(255,140,20,0.52), transparent)',
    }}/>
    {/* Dust haze — wide radial from bottom center */}
    <GlowLayer lo={0.12} hi={0.28} duration="14s" delay="4s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 80% 35% at 50% 100%, rgba(220,160,60,0.28), transparent)',
    }}/>
    {/* Atmospheric heat shimmer — mid screen */}
    <GlowLayer lo={0.06} hi={0.18} duration="9s" delay="2s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 70% 30% at 50% 65%, rgba(200,120,30,0.18), transparent)',
    }}/>
  </>
}

// ─── 20. UNDER THE SEA ───────────────────────────────────────────────────
function UnderTheSeaAmbient() {
  const bio = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    left:  `${(i * 73 + i % 5 * 17) % 100}%`,
    top:   `${(i * 61 + i % 4 * 23) % 100}%`,
    size:  3.5 + (i % 4) * 1.8,
    dur:   `${4.5 + (i % 5) * 1.8}s`,
    delay: `${(i * 0.9) % 9}s`,
  })), [])

  const bubbles = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    left:  `${26 + i * 3}%`,
    size:  1.2 + (i % 3) * 0.6,
    dur:   `${7 + i * 1.5}s`,
    delay: `${i * 1.8}s`,
  })), [])

  return <>
    <GlowLayer lo={0.15} hi={0.35} duration="20s" delay="3s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 100% 100% at 50% 50%, rgba(0,80,100,0.28), transparent 70%)',
    }}/>
    <GlowLayer lo={0.18} hi={0.45} duration="6s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 40% 55% at 50% 0%, rgba(80,200,255,0.42), transparent)',
    }}/>
    {bio.map((b, i) => (
      <PulseDot key={i} left={b.left} top={b.top} size={b.size}
        color="rgba(40,210,170,0.75)" glowColor="rgba(20,180,140,0.45)"
        duration={b.dur} delay={b.delay}
      />
    ))}
    {bubbles.map((b, i) => (
      <RisingParticle key={i} left={b.left} bottom="0%" size={b.size}
        color="rgba(180,225,255,0.55)"
        duration={b.dur} delay={b.delay} opacity={0.55}
      />
    ))}
  </>
}

// ─── 21. NEON TOKYO ──────────────────────────────────────────────────────
function NeonTokyoAmbient() {
  const rain = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    left:   `${(i * 53 + i % 5 * 11) % 100}%`,
    height: 20 + (i % 4) * 12,
    dur:    `${1.8 + (i % 4) * 0.7}s`,
    delay:  `${(i * 0.4) % 4}s`,
  })), [])

  return <>
    {/* Hot pink/magenta neon — left */}
    <GlowLayer lo={0.28} hi={0.78} duration="1.3s" buzz style={{
      top: 0, left: 0, bottom: 0, width: '28%',
      background: 'radial-gradient(ellipse at left center, rgba(255,0,190,0.70), transparent 75%)',
    }}/>
    {/* Cyan neon — right */}
    <GlowLayer lo={0.22} hi={0.72} duration="1.8s" delay="0.4s" buzz style={{
      top: 0, right: 0, bottom: 0, width: '28%',
      background: 'radial-gradient(ellipse at right center, rgba(0,210,255,0.65), transparent 75%)',
    }}/>
    {/* Purple top neon (overhead signs) */}
    <GlowLayer lo={0.18} hi={0.52} duration="2.6s" delay="0.9s" buzz style={{
      top: 0, left: 0, right: 0, height: '25%',
      background: 'radial-gradient(ellipse at top center, rgba(200,0,255,0.52), transparent 70%)',
    }}/>
    {/* Rain streaks — neon tinted */}
    {rain.map((r, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', left: r.left, top: '-3%',
        width: 1, height: r.height,
        background: i % 3 === 0 ? 'rgba(255,0,200,0.18)' : i % 3 === 1 ? 'rgba(0,210,255,0.15)' : 'rgba(200,180,255,0.12)',
        willChange: 'transform, opacity',
        '--hi': 0.18, '--drift': '0px',
        animation: `ambientFallSlow ${r.dur} ${r.delay} linear infinite`,
        pointerEvents: 'none',
      }}/>
    ))}
  </>
}


// ─── 23. FIREFLY SUMMER ──────────────────────────────────────────────────
function FireflySummerAmbient() {
  const fireflies = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    left:  `${8 + (i * 67 + i % 5 * 11) % 84}%`,
    top:   `${35 + (i * 43 + i % 4 * 13) % 55}%`,
    size:  3 + (i % 3) * 1.2,
    dur:   `${2.4 + (i % 5) * 0.8}s`,
    delay: `${(i * 0.6) % 7}s`,
  })), [])

  return <>
    <GlowLayer lo={0.15} hi={0.35} duration="25s" style={{
      top: 0, left: 0, right: 0, height: '30%',
      background: 'linear-gradient(to bottom, rgba(180,110,35,0.32), transparent)',
    }}/>
    <GlowLayer lo={0.12} hi={0.30} duration="30s" delay="8s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 80% 60% at 50% 60%, rgba(0,60,15,0.22), transparent)',
    }}/>
    <div aria-hidden style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%',
      background: 'linear-gradient(to top, rgba(80,60,10,0.18), transparent)', pointerEvents: 'none',
    }}/>
    {fireflies.map((f, i) => (
      <PulseDot key={i} left={f.left} top={f.top} size={f.size}
        color="rgba(185,255,85,0.95)" glowColor="rgba(145,255,45,0.40)"
        duration={f.dur} delay={f.delay}
      />
    ))}
  </>
}


// ─── 25. WINE CELLAR ─────────────────────────────────────────────────────
// Deep stone cellar — burgundy walls closing in, one small candle center
function WineCellarAmbient() {
  return <>
    {/* Burgundy stone walls — dominant edge treatment */}
    <GlowLayer lo={0.25} hi={0.62} duration="9s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 75% 75% at 50% 50%, transparent 38%, rgba(120,0,25,0.70) 100%)',
    }}/>
    {/* Deep wine-red overlay — left wall */}
    <GlowLayer lo={0.18} hi={0.45} duration="12s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 40% 100% at 0% 50%, rgba(100,0,20,0.52), transparent)',
    }}/>
    {/* Deep wine-red overlay — right wall */}
    <GlowLayer lo={0.14} hi={0.38} duration="15s" delay="5s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 40% 100% at 100% 50%, rgba(100,0,20,0.45), transparent)',
    }}/>
    {/* Single candle — center, small and warm */}
    <GlowLayer lo={0.26} hi={0.68} duration="2.4s" flicker style={{
      inset: 0,
      background: 'radial-gradient(ellipse 30% 45% at 50% 60%, rgba(240,170,60,0.62), transparent)',
    }}/>
    {/* Faint warm floor glow */}
    <GlowLayer lo={0.12} hi={0.30} duration="6s" delay="3s" style={{
      bottom: 0, left: 0, right: 0, height: '20%',
      background: 'linear-gradient(to top, rgba(160,60,10,0.30), transparent)',
    }}/>
  </>
}


// ─── 27. METEOR SHOWER ───────────────────────────────────────────────────
function MeteorShowerAmbient() {
  const stars = useMemo(() => Array.from({ length: 200 }, (_, i) => ({
    left:    `${(i * 97 + i % 7 * 31) % 100}%`,
    top:     `${(i * 83 + i % 5 * 43) % 100}%`,
    size:    0.5 + (i % 4) * 0.4,
    opacity: 0.25 + (i % 5) * 0.09,
  })), [])
  const meteors = useMemo(() => Array.from({ length: 9 }, (_, i) => ({
    left:  `${20 + i * 7}%`,
    top:   `${5 + (i % 4) * 14}%`,
    width: 40 + (i % 4) * 18,
    delay: `${i * 8 + (i % 3) * 3}s`,
  })), [])

  return <>
    {/* Deep blue-indigo night sky wash */}
    <GlowLayer lo={0.22} hi={0.45} duration="30s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 100% 80% at 50% 30%, rgba(20,30,100,0.42), transparent)',
    }}/>
    {/* Milky Way band — subtle indigo-violet */}
    <GlowLayer lo={0.10} hi={0.28} duration="40s" delay="12s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 60% 25% at 50% 45%, rgba(80,60,180,0.25), transparent)',
    }}/>
    {stars.map((s, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', left: s.left, top: s.top, pointerEvents: 'none',
        width: s.size, height: s.size, borderRadius: '50%',
        background: `rgba(255,255,255,${Math.min(s.opacity + 0.10, 0.85)})`,
      }}/>
    ))}
    {meteors.map((m, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', left: m.left, top: m.top, pointerEvents: 'none',
        width: m.width, height: 1,
        background: 'linear-gradient(to left, rgba(255,255,255,0.92), transparent)',
        transform: 'rotate(-28deg)',
        transformOrigin: 'right center',
        willChange: 'transform, opacity',
        animation: `ambientMeteor 0.18s ${m.delay}s linear infinite`,
      }}/>
    ))}
  </>
}


// ─── 29. 80S NIGHT ───────────────────────────────────────────────────────
function EightiesNightAmbient() {
  return <>
    {/* Retrowave grid lines */}
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      backgroundImage: 'repeating-linear-gradient(transparent 0px, transparent 38px, rgba(255,20,220,0.10) 38px, rgba(255,20,220,0.10) 39px)',
      backgroundSize: '100% 39px',
    }}/>
    {/* Hot pink/magenta — top neon */}
    <GlowLayer lo={0.28} hi={0.65} duration="15s" style={{
      top: 0, left: 0, right: 0, height: '35%',
      background: 'linear-gradient(to bottom, rgba(255,0,200,0.55) 0%, rgba(180,0,255,0.35) 60%, transparent 100%)',
    }}/>
    {/* Cyan/teal — bottom horizon */}
    <GlowLayer lo={0.22} hi={0.58} duration="18s" delay="5s" style={{
      bottom: 0, left: 0, right: 0, height: '30%',
      background: 'linear-gradient(to top, rgba(0,220,255,0.52), rgba(0,180,255,0.28), transparent)',
    }}/>
    {/* Purple side glows */}
    <GlowLayer lo={0.20} hi={0.50} duration="12s" delay="3s" style={{
      top: 0, left: 0, bottom: 0, width: '25%',
      background: 'radial-gradient(ellipse at left center, rgba(180,0,255,0.50), transparent 75%)',
    }}/>
    <GlowLayer lo={0.18} hi={0.45} duration="14s" delay="6s" style={{
      top: 0, right: 0, bottom: 0, width: '25%',
      background: 'radial-gradient(ellipse at right center, rgba(255,0,180,0.45), transparent 75%)',
    }}/>
  </>
}

// ─── Registry ─────────────────────────────────────────────────────────────
const AMBIENT_MAP = {
  'pure-michigan':      PureMichiganAmbient,
  'midnight-galaxy':    MidnightGalaxyAmbient,
  'autumn-harvest':     AutumnHarvestAmbient,
  'northern-lights':    NorthernLightsAmbient,
  'medieval-tavern':    MedievalTavernAmbient,
  'sunset-boulevard':   SunsetBoulevardAmbient,
  'retro-arcade':       RetroArcadeAmbient,
  'sand-dune-chill':    SandDuneChillAmbient,
  'halloween':          HalloweenAmbient,
  'jazz-club':          JazzClubAmbient,
  'dive-bar':           DiveBarAmbient,
  'rooftop-party':      RooftopPartyAmbient,
  'christmas-eve':      ChristmasEveAmbient,
  'drive-in-movie':     DriveInMovieAmbient,
  'western-showdown':   WesternShowdownAmbient,
  'under-the-sea':      UnderTheSeaAmbient,
  'neon-tokyo':         NeonTokyoAmbient,
  'firefly-summer':     FireflySummerAmbient,
  'wine-cellar':        WineCellarAmbient,
  'meteor-shower':      MeteorShowerAmbient,
  'eighties-night':     EightiesNightAmbient,
}

// ─── Main Export ──────────────────────────────────────────────────────────
export default function ParticleBackground({ theme }) {
  const AmbientComponent = AMBIENT_MAP[theme.id]
  const v = theme.vignette ?? {}

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        {AmbientComponent && <AmbientComponent />}
        <Vignette
          r={v.r ?? 0}
          g={v.g ?? 0}
          b={v.b ?? 0}
          strength={v.strength ?? 0.55}
        />
      </div>
    </>
  )
}
