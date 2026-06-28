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
    0%   { transform: translateY(-8px) translateX(0px);                               opacity: 0; }
    8%   { opacity: var(--hi, 0.8); }
    25%  { transform: translateY(25vh)  translateX(calc(var(--drift, 8px) * -0.5)); }
    50%  { transform: translateY(52vh)  translateX(0px); }
    75%  { transform: translateY(78vh)  translateX(calc(var(--drift, 8px) * 0.7)); }
    92%  { opacity: var(--hi, 0.7); }
    100% { transform: translateY(108vh) translateX(var(--drift, 8px));                 opacity: 0; }
  }
  @keyframes ambientLeafFall {
    0%   { transform: translateY(-10%) translateX(0) rotate(0deg);                                            opacity: 0; }
    10%  { opacity: var(--hi, 0.8); }
    50%  { transform: translateY(55vh)  translateX(calc(var(--drift, 8px) * -1)) rotate(120deg); }
    90%  { opacity: var(--hi, 0.7); }
    100% { transform: translateY(110vh) translateX(var(--drift, 8px)) rotate(var(--rot, 300deg));             opacity: 0; }
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
  @keyframes ambientFireflyWander {
    0%   { transform: translate(0, 0); }
    20%  { transform: translate(10px, -8px); }
    40%  { transform: translate(-6px, 4px); }
    60%  { transform: translate(9px, -10px); }
    80%  { transform: translate(-8px, 6px); }
    100% { transform: translate(0, 0); }
  }
  @keyframes ambientBubbleRise {
    0%   { transform: translateY(0) translateX(0) scale(1);            opacity: 0; }
    10%  { opacity: var(--hi, 0.55); }
    25%  { transform: translateY(-10vh) translateX(5px) scale(0.95); }
    50%  { transform: translateY(-20vh) translateX(0) scale(1.0); }
    75%  { transform: translateY(-28vh) translateX(-5px) scale(0.95); }
    90%  { opacity: var(--lo, 0.08); }
    100% { transform: translateY(-38vh) translateX(0) scale(0.6);     opacity: 0; }
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
  @keyframes ambientWave {
    0%,100% { transform: translateX(0) translateY(0); opacity: var(--lo,0.10); }
    50%     { transform: translateX(var(--wx,12px)) translateY(var(--wy,-3px)); opacity: var(--hi,0.30); }
  }
  @keyframes ambientGullBob {
    0%   { transform: translateY(0); }
    25%  { transform: translateY(-7px); }
    55%  { transform: translateY(3px); }
    80%  { transform: translateY(-4px); }
    100% { transform: translateY(0); }
  }
  @keyframes ambientWeedCross {
    0%    { transform: translateX(-250%); opacity: 0; }
    1.5%  { opacity: var(--hi,0.7); }
    28.5% { opacity: var(--hi,0.7); }
    30%   { transform: translateX(2150%); opacity: 0; }
    100%  { transform: translateX(2150%); opacity: 0; }
  }
  @keyframes ambientWeedCrossRev {
    0%    { transform: translateX(2150%); opacity: 0; }
    1.5%  { opacity: var(--hi,0.7); }
    28.5% { opacity: var(--hi,0.7); }
    30%   { transform: translateX(-250%); opacity: 0; }
    100%  { transform: translateX(-250%); opacity: 0; }
  }
  @keyframes ambientWeedBounce {
    0%   { transform: translateY(0);    animation-timing-function: ease-out; }
    40%  { transform: translateY(-52%); animation-timing-function: ease-in; }
    68%  { transform: translateY(0);    animation-timing-function: ease-out; }
    84%  { transform: translateY(-19%); animation-timing-function: ease-in; }
    100% { transform: translateY(0); }
  }
  @keyframes ambientSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    @keyframes ambientFallSlow    { 0%, 100% { opacity: 0; } 8%, 92%  { opacity: var(--hi, 0.8); } }
    @keyframes ambientLeafFall    { 0%, 100% { opacity: 0; } 10%, 90% { opacity: var(--hi, 0.8); } }
    @keyframes ambientRiseUp      { 0%, 100% { opacity: 0; } 10%, 90% { opacity: var(--hi, 0.6); } }
    @keyframes ambientBubbleRise  { 0%, 100% { opacity: 0; } 10%, 90% { opacity: var(--hi, 0.55); } }
    @keyframes ambientPulseIn     { 0%, 100% { opacity: 0; } 40%, 60% { opacity: var(--hi, 0.9); } }
    @keyframes ambientFireflyWander { 0%, 100% { transform: none; } }
    @keyframes ambientDriftAcross { 0%, 100% { opacity: 0; } 15%, 85% { opacity: var(--hi, 0.20); } }
    @keyframes ambientMeteor      { 0%, 100% { opacity: 0; } 4%, 96%  { opacity: 0.9; } }
    @keyframes ambientScanline    { from, to { transform: none; } }
    @keyframes ambientFlicker     { 0%, 100% { opacity: var(--lo, 0.15); } }
    @keyframes ambientNeonBuzz    { 0%, 100% { opacity: var(--lo, 0.18); } }
    @keyframes ambientBreathe     { 0%, 100% { opacity: var(--lo, 0.03); } }
    @keyframes ambientWave { 0%,100% { opacity:var(--lo,0.10);} 50% { opacity:var(--hi,0.30);} }
    @keyframes ambientGullBob { 0%,100% { transform: none; } }
    @keyframes ambientWeedCross { 0%,100%{opacity:0;} }
    @keyframes ambientWeedCrossRev { 0%,100%{opacity:0;} }
    @keyframes ambientWeedBounce { 0%,100%{transform:translateY(0);} }
    @keyframes ambientSpin { from,to { transform: rotate(0deg); } }
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

function FallingParticle({ left, size, color, duration, delay, drift = '8px', opacity = 0.85, square = false, ratio = 1, leaf = false, rot = '300deg', ease = 'cubic-bezier(0.77, 0, 0.175, 1)' }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', top: '-3%', left, pointerEvents: 'none',
        width: size, height: ratio === 1 ? size : size * ratio,
        borderRadius: leaf ? '0 100% 0 100%' : square ? '1px' : '50%',
        background: color,
        willChange: 'transform, opacity',
        '--hi': opacity, '--drift': drift,
        ...(leaf && { '--rot': rot }),
        animation: `${leaf ? 'ambientLeafFall' : 'ambientFallSlow'} ${duration} ${delay} ${ease} infinite`,
      }}
    />
  )
}

function RisingParticle({ left, bottom = '5%', size, color, duration, delay, opacity = 0.6, ease = 'cubic-bezier(0.77, 0, 0.175, 1)', bubble = false }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', bottom, left, pointerEvents: 'none',
        width: size, height: size, borderRadius: '50%',
        background: color,
        willChange: 'transform, opacity',
        '--hi': opacity,
        '--lo': opacity * 0.15,
        animation: `${bubble ? 'ambientBubbleRise' : 'ambientRiseUp'} ${duration} ${delay} ${ease} infinite`,
      }}
    />
  )
}

function PulseDot({ left, top, size, color, duration, delay, glowColor,
  ease = 'ease', anim = 'ambientPulseIn', lo = 0.1,
  wander = false, wanderDur = '6s', wanderDelay = '0s',
}) {
  const animation = wander
    ? `ambientBreathe ${duration} ${delay} ease infinite, ambientFireflyWander ${wanderDur} ${wanderDelay} ease-in-out infinite`
    : `${anim} ${duration} ${delay} ${ease} infinite`
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', left, top, pointerEvents: 'none',
        width: size, height: size, borderRadius: '50%',
        background: color,
        boxShadow: glowColor ? `0 0 ${size * 2}px ${glowColor}` : undefined,
        willChange: 'transform, opacity',
        '--hi': 0.9, '--lo': lo,
        animation,
      }}
    />
  )
}

function Sun({ left, top, size, core, mid, rim, halo, haloBlur = 44, haloSpread = 12, dur = '9s' }) {
  return <div aria-hidden style={{
    position: 'absolute', left, top, width: size, aspectRatio: '1', borderRadius: '50%',
    background: `radial-gradient(circle at 50% 47%, ${core} 0%, ${mid} 34%, ${rim} 58%, rgba(255,170,90,0.18) 78%, transparent 100%)`,
    boxShadow: `0 0 ${haloBlur}px ${haloSpread}px ${halo}`,
    willChange: 'opacity', '--lo': 0.9, '--hi': 1,
    animation: `ambientBreathe ${dur} ease-in-out infinite`, pointerEvents: 'none',
  }}/>
}

function Gull({ top, size, dur, delay, opacity, flip, bobDur, bobDelay }) {
  return <div aria-hidden style={{ position: 'absolute', top, left: 0, width: '100%', height: 0,
    willChange: 'transform, opacity', '--hi': opacity,
    animation: `ambientDriftAcross ${dur} ${delay} linear infinite`, pointerEvents: 'none' }}>
    <div style={{ display: 'inline-block', willChange: 'transform',
      animation: `ambientGullBob ${bobDur} ${bobDelay} ease-in-out infinite` }}>
      <svg viewBox="0 0 24 8" width={size} style={{ display: 'block', overflow: 'visible', transform: flip ? 'scaleX(-1)' : 'none' }}>
        <path d="M1,6 Q6,1 12,5 Q18,1 23,6" fill="none" stroke="rgba(34,40,58,0.9)" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    </div>
  </div>
}

function makeRng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const WEED_STYLES = {
  tidy:  { N: 41, steps: 60, skipSet: [4, 7, 11, 15, 18], centerLines: 4, rLo: 0.84, rHi: 1.08, bow: 1.8 },
  loose: { N: 29, steps: 40, skipSet: [3, 6, 9, 12],      centerLines: 3, rLo: 0.76, rHi: 1.16, bow: 2.8 },
  dense: { N: 47, steps: 64, skipSet: [5, 9, 14, 18, 22], centerLines: 5, rLo: 0.90, rHi: 1.04, bow: 1.4 },
}
function tumbleweedScribble(seed, style = 'tidy') {
  const cfg = WEED_STYLES[style] || WEED_STYLES.tidy
  const rng = makeRng(seed), rand = (a, b) => a + (b - a) * rng()
  const cx = 24, cy = 24, R = 15, N = cfg.N, pts = []
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rand(-0.06, 0.06), r = R * rand(cfg.rLo, cfg.rHi)
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  let cur = Math.floor(rng() * N), prev = pts[cur]
  let d = `M${prev[0].toFixed(1)} ${prev[1].toFixed(1)} `
  for (let s = 0; s < cfg.steps; s++) {
    const skip = cfg.skipSet[Math.floor(rng() * cfg.skipSet.length)]
    const sign = rng() < 0.5 ? 1 : -1
    cur = (cur + sign * skip + N * 4) % N
    const p = pts[cur]
    const mx = (prev[0] + p[0]) / 2, my = (prev[1] + p[1]) / 2
    const dx = p[0] - prev[0], dy = p[1] - prev[1], len = Math.hypot(dx, dy) || 1
    const px = -dy / len, py = dx / len, bow = rand(-cfg.bow, cfg.bow)
    d += `Q${(mx + px * bow).toFixed(1)} ${(my + py * bow).toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)} `
    prev = p
  }
  for (let c = 0; c < (cfg.centerLines || 0); c++) {
    const ang = rand(0, Math.PI), off = rand(0, 4.5), offA = rand(0, Math.PI * 2)
    const ox = cx + Math.cos(offA) * off, oy = cy + Math.sin(offA) * off
    const L = R * rand(0.78, 1.02)
    const x0 = ox + Math.cos(ang) * L, y0 = oy + Math.sin(ang) * L
    const x1 = ox - Math.cos(ang) * L, y1 = oy - Math.sin(ang) * L
    const pa = ang + Math.PI / 2, bw = rand(-cfg.bow, cfg.bow)
    d += `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${(ox + Math.cos(pa) * bw).toFixed(1)} ${(oy + Math.sin(pa) * bw).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)} `
  }
  return d
}
function Tumbleweed({ top, size = '5.5%', seed = 1, style = 'tidy', dir = 'lr', crossDur = '18s', bounceDur = '1.05s', spinDur = '2.4s', delay = '0s', hi = 0.7 }) {
  const d1 = useMemo(() => tumbleweedScribble(seed, style), [seed, style])
  const d2 = useMemo(() => tumbleweedScribble(seed + 101, style), [seed, style])
  const cross = dir === 'rl' ? 'ambientWeedCrossRev' : 'ambientWeedCross'
  const spinDir = dir === 'rl' ? 'reverse' : 'normal'
  return (
    <div aria-hidden style={{ position: 'absolute', top, left: 0, width: size, aspectRatio: '1',
      willChange: 'transform, opacity', '--hi': hi,
      animation: `${cross} ${crossDur} ${delay} linear infinite`, pointerEvents: 'none' }}>
      <div style={{ width: '100%', height: '100%', willChange: 'transform',
        animation: `ambientWeedBounce ${bounceDur} ${delay} infinite` }}>
        <div style={{ width: '100%', height: '100%', willChange: 'transform',
          animation: `ambientSpin ${spinDur} ${delay} linear ${spinDir} infinite` }}>
          <svg viewBox="0 0 48 48" width="100%" height="100%" style={{ display: 'block' }}>
            <path d={d2} fill="none" stroke="rgba(94,66,36,0.30)" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d={d1} fill="none" stroke="rgba(62,42,20,0.52)" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  )
}

// ─── Motion constants ─────────────────────────────────────────────────────
const EASE = {
  mover:   'cubic-bezier(0.77, 0, 0.175, 1)', // fall / rise / drift — natural weight
  twinkle: 'ease',                              // glow / opacity cycles — soft symmetry
  linear:  'linear',                            // intentional: rain, scanlines, meteors
}

// ─── 1. PURE MICHIGAN ─────────────────────────────────────────────────────
function PureMichiganAmbient() {
  const motes = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    left:   `${(i * 97 + i % 7 * 31) % 100}%`,
    top:    `${(i * 83 + i % 7 * 29) % 100}%`,
    size:   3 + (i % 3) * 1.0,
    dur:    `${5.0 + (i % 4) * 1.2}s`,
    delay:  `-${((i / 22) * (5.0 + (i % 4) * 1.2)).toFixed(1)}s`,
    wDur:   `${14 + (i % 4) * 2}s`,
    wDelay: `-${((i * 2.3) % 14).toFixed(1)}s`,
  })), [])

  return <>
    <GlowLayer lo={0.18} hi={0.42} duration="12s" style={{
      inset: 0, bottom: '60%',
      background: 'linear-gradient(to bottom, rgba(0,25,80,0.32) 0%, rgba(0,40,100,0.22) 70%, transparent 100%)',
    }}/>
    <GlowLayer lo={0.22} hi={0.52} duration="18s" delay="3s" style={{
      bottom: 0, left: 0, right: 0, height: '30%',
      background: 'linear-gradient(to top, rgba(0,70,140,0.40), rgba(0,50,100,0.20), transparent)',
    }}/>
    {/* Water shimmer band — light on the lake surface */}
    <GlowLayer lo={0.15} hi={0.35} duration="24s" delay="6s" style={{
      top: '55%', left: 0, right: 0, height: '20%',
      background: 'radial-gradient(ellipse 100% 50% at 50% 100%, rgba(40,120,200,0.22), transparent)',
    }}/>
    {motes.map((f, i) => (
      <PulseDot key={i} left={f.left} top={f.top} size={f.size}
        color="rgba(210,240,255,0.90)" glowColor="rgba(150,210,255,0.40)"
        duration={f.dur} delay={f.delay}
        lo={0.45} wander={true} wanderDur={f.wDur} wanderDelay={f.wDelay}
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
    delay:   `-${((i / 120) * (12 + (i % 7) * 4)).toFixed(1)}s`,
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
        animation: `ambientBreathe ${s.dur} ${s.delay} ease infinite`,
      }}/>
    ))}
  </>
}

// ─── 3. AUTUMN HARVEST ────────────────────────────────────────────────────
function AutumnHarvestAmbient() {
  const leaves = useMemo(() => [
    { color: 'rgba(245,166,35,1.0)',  size: 6,  dur: '9s',    delay: '0s',    drift: '14px',  rot: '260deg' }, // #f5a623 amber
    { color: 'rgba(232,130,30,1.0)',  size: 5,  dur: '13s',   delay: '-1.6s', drift: '-16px', rot: '280deg' }, // #e8821e burnt-orange
    { color: 'rgba(212,100,26,1.0)',  size: 5,  dur: '11s',   delay: '-2.8s', drift: '-10px', rot: '320deg' }, // #d4641a deep-orange
    { color: 'rgba(242,184,74,1.0)',  size: 5,  dur: '8.5s',  delay: '-3.2s', drift: '-18px', rot: '310deg' }, // #f2b84a gold
    { color: 'rgba(201,82,26,1.0)',   size: 6,  dur: '12s',   delay: '-6s',   drift: '16px',  rot: '250deg' }, // #c9521a rust
    { color: 'rgba(245,166,35,1.0)',  size: 4,  dur: '10.5s', delay: '-6.6s', drift: '12px',  rot: '340deg' }, // #f5a623 amber
    { color: 'rgba(232,130,30,1.0)',  size: 6,  dur: '10s',   delay: '-7.5s', drift: '8px',   rot: '360deg' }, // #e8821e burnt-orange
    { color: 'rgba(242,184,74,1.0)',  size: 7,  dur: '9.5s',  delay: '-8.3s', drift: '18px',  rot: '300deg' }, // #f2b84a gold
  ].map((l, i) => ({ ...l, left: `${5 + i * 12}%` })), [])

  const embers = useMemo(() => Array.from({ length: 5 }, (_, i) => ({
    left:  `${42 + (i % 4) * 4 - 6}%`,
    size:  2 + (i % 2) * 1.0,
    dur:   `${3 + (i % 3) * 1.0}s`,
    delay: `-${((i / 5) * (3 + (i % 3) * 1.0)).toFixed(1)}s`,
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
        duration={l.dur} delay={l.delay} drift={l.drift} opacity={0.95} ratio={0.6}
        leaf={true} rot={l.rot}/>
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
        style={{ willChange: 'opacity', '--hi': 0.90, animation: 'ambientAuroraFade 22s 0s ease infinite' }}
      />
      {/* Curtain 2 — purple, wavy band y ≈ 16–28, overlapping */}
      <path
        d="M -2 16 C 15 10,35 22,55 14 C 75 6,92 20,102 16 L 102 28 C 90 35,70 20,50 27 C 30 34,12 18,-2 28 Z"
        fill="url(#nlAur2)"
        style={{ willChange: 'opacity', '--hi': 0.80, animation: 'ambientAuroraFade 30s 8s ease infinite' }}
      />
      {/* Curtain 3 — teal faint, wavy band y ≈ 22–34 */}
      <path
        d="M -2 22 C 18 16,38 28,58 21 C 78 14,96 26,102 22 L 102 34 C 96 40,76 26,55 33 C 34 40,16 26,-2 34 Z"
        fill="url(#nlAur3)"
        style={{ willChange: 'opacity', '--hi': 0.70, animation: 'ambientAuroraFade 26s 14s ease infinite' }}
      />
    </svg>
    {/* Star field */}
    {Array.from({ length: 30 }, (_, i) => {
      const op = 0.40 + (i % 4) * 0.10
      const dur = 8 + (i % 5) * 4
      return (
        <div key={i} aria-hidden style={{
          position: 'absolute',
          left: `${(i * 97 + i % 7 * 31) % 100}%`,
          top:  `${(i * 83 + i % 5 * 43) % 65}%`,
          width: 1.2 + (i % 3) * 0.4, height: 1.2 + (i % 3) * 0.4,
          borderRadius: '50%',
          background: `rgba(200,240,220,${op})`,
          pointerEvents: 'none',
          willChange: 'opacity',
          '--lo': op * 0.25, '--hi': op,
          animation: `ambientBreathe ${dur}s -${((i / 30) * dur).toFixed(1)}s ease infinite`,
        }}/>
      )
    })}
  </>
}

// ─── 5. MEDIEVAL TAVERN ───────────────────────────────────────────────────
function MedievalTavernAmbient() {
  const wisps = useMemo(() => [
    { left: '12%', dur: '14s', delay: '0s'     },
    { left: '48%', dur: '18s', delay: '-6.0s'  },
    { left: '80%', dur: '16s', delay: '-10.7s' },
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
        animation: `ambientRiseUp ${w.dur} ${w.delay} ${EASE.mover} infinite`,
      }}/>
    ))}
  </>
}

// ─── 6. SUNSET BOULEVARD ─────────────────────────────────────────────────
function SunsetBoulevardAmbient() {
  const clouds = useMemo(() => [
    { top: '8%',  w: '34%', h: '7%',  dur: '42s', delay: '-28s', hi: 0.24, color: 'rgba(255,150,90,0.50)'  },
    { top: '14%', w: '50%', h: '12%', dur: '30s', delay: '0s',   hi: 0.40, color: 'rgba(255,110,60,0.60)'  },
    { top: '22%', w: '42%', h: '10%', dur: '38s', delay: '-12s', hi: 0.34, color: 'rgba(255,150,110,0.52)' },
    { top: '29%', w: '46%', h: '10%', dur: '34s', delay: '-22s', hi: 0.32, color: 'rgba(230,120,90,0.48)'  },
  ], [])
  const stars = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    left: `${(i * 71 + i % 4 * 19) % 100}%`, top: `${(i * 37 + i % 3 * 11) % 14}%`,
    size: 1.1 + (i % 3) * 0.4, dur: `${5 + (i % 5) * 1.6}s`, delay: `-${((i / 6) * (5 + (i % 5) * 1.6)).toFixed(1)}s`,
  })), [])
  return <>
    <GlowLayer lo={0.46} hi={0.76} duration="22s" style={{ inset: 0,
      background: 'linear-gradient(to bottom, rgba(60,16,52,0.64) 0%, rgba(176,52,54,0.48) 30%, rgba(240,108,58,0.42) 46%, transparent 58%)' }}/>
    <GlowLayer lo={0.30} hi={0.56} duration="20s" style={{ inset: 0,
      background: 'radial-gradient(ellipse 46% 42% at 9% 44%, rgba(255,120,50,0.48), transparent 64%)' }}/>
    {stars.map((s, i) => (
      <PulseDot key={i} left={s.left} top={s.top} size={s.size}
        color="rgba(255,235,210,0.78)" glowColor="rgba(255,220,180,0.28)" duration={s.dur} delay={s.delay} lo={0.10}/>
    ))}
    {clouds.map((c, i) => (
      <div key={i} aria-hidden style={{ position: 'absolute', top: c.top, left: '-6%', width: c.w, height: c.h,
        background: `radial-gradient(ellipse 52% 55% at 50% 78%, ${c.color}, transparent 74%)`,
        willChange: 'transform, opacity', '--hi': c.hi,
        animation: `ambientDriftAcross ${c.dur} ${c.delay} linear infinite`, pointerEvents: 'none' }}/>
    ))}
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'linear-gradient(to bottom, transparent 44%, rgba(150,64,66,0.42) 53%, rgba(78,38,58,0.52) 63%, rgba(46,24,48,0.42) 71%, transparent 78%)' }}/>
    <Sun left="6%" top="33%" size="11%"
      core="rgba(255,250,228,1)" mid="rgba(255,224,152,0.98)" rim="rgba(255,180,92,0.85)"
      halo="rgba(255,150,70,0.40)" haloBlur={48} haloSpread={13}/>
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'radial-gradient(ellipse 34% 6% at 32% 74%, rgba(255,168,96,0.30), transparent 70%)',
      willChange: 'transform, opacity', '--lo': 0.12, '--hi': 0.30, '--wx': '16px', '--wy': '-2px',
      animation: 'ambientWave 8s ease-in-out infinite' }}/>
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'linear-gradient(to bottom, transparent 70%, rgba(216,152,110,0.34) 77%, transparent 85%)' }}/>
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'linear-gradient(to bottom, transparent 72%, rgba(198,140,98,0.34) 80%, rgba(165,112,74,0.70) 89%, rgba(120,80,52,0.92) 96%, rgba(86,58,40,0.96) 100%)' }}/>
    <GlowLayer lo={0.14} hi={0.32} duration="13s" delay="1s" style={{ inset: 0,
      background: 'radial-gradient(ellipse 64% 18% at 30% 90%, rgba(255,170,96,0.32), transparent 70%)' }}/>
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
      backgroundImage: 'repeating-linear-gradient(transparent 0px, transparent 3px, rgba(39,224,255,0.07) 3px, rgba(39,224,255,0.07) 4px)',
      backgroundSize: '100% 4px',
      mixBlendMode: 'screen',
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
// Theme: early-AM Lake Michigan — cool periwinkle dawn, last stars, gulls crossing
function SandDuneChillAmbient() {
  const gulls = useMemo(() => [
    { top: '20%', size: 34, dur: '30s', delay: '0s',   opacity: 0.62, flip: false, bobDur: '5s',   bobDelay: '0s'    },
    { top: '31%', size: 26, dur: '38s', delay: '-12s', opacity: 0.50, flip: true,  bobDur: '6.5s', bobDelay: '-2s'   },
    { top: '14%', size: 40, dur: '26s', delay: '-7s',  opacity: 0.66, flip: false, bobDur: '4.5s', bobDelay: '-1s'   },
    { top: '39%', size: 24, dur: '42s', delay: '-22s', opacity: 0.46, flip: true,  bobDur: '7s',   bobDelay: '-3s'   },
    { top: '25%', size: 30, dur: '34s', delay: '-18s', opacity: 0.56, flip: false, bobDur: '5.5s', bobDelay: '-4s'   },
    { top: '34%', size: 22, dur: '46s', delay: '-30s', opacity: 0.44, flip: true,  bobDur: '6s',   bobDelay: '-1.5s' },
  ], [])
  const lastStars = useMemo(() => Array.from({ length: 4 }, (_, i) => ({
    left: `${(i * 83 + 11) % 100}%`, top: `${(i * 29 + 5) % 16}%`,
    size: 1.0 + (i % 2) * 0.4, dur: `${6 + (i % 3) * 2}s`, delay: `-${(i * 1.7).toFixed(1)}s`,
  })), [])
  return <>
    <GlowLayer lo={0.42} hi={0.64} duration="24s" style={{ inset: 0,
      background: 'linear-gradient(to bottom, rgba(108,132,182,0.50) 0%, rgba(152,142,176,0.40) 38%, rgba(228,182,156,0.34) 56%, transparent 70%)' }}/>
    <GlowLayer lo={0.24} hi={0.46} duration="22s" delay="4s" style={{ inset: 0,
      background: 'radial-gradient(ellipse 44% 46% at 80% 50%, rgba(255,205,160,0.42), transparent 68%)' }}/>
    {lastStars.map((s, i) => (
      <PulseDot key={i} left={s.left} top={s.top} size={s.size} color="rgba(225,232,255,0.55)" duration={s.dur} delay={s.delay} lo={0.06}/>
    ))}
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'linear-gradient(to bottom, transparent 50%, rgba(120,150,175,0.30) 60%, rgba(64,94,124,0.46) 70%, rgba(42,64,90,0.34) 80%, transparent 86%)' }}/>
    <Sun left="76%" top="42%" size="9%"
      core="rgba(255,251,240,0.97)" mid="rgba(255,230,198,0.86)" rim="rgba(252,202,162,0.56)"
      halo="rgba(255,212,172,0.34)" haloBlur={44} haloSpread={12} dur="12s"/>
    {gulls.map((g, i) => <Gull key={i} {...g}/>)}
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'linear-gradient(to bottom, transparent 66%, rgba(170,136,94,0.32) 76%, rgba(134,106,72,0.68) 86%, rgba(94,74,50,0.90) 95%, rgba(66,52,36,0.96) 100%)' }}/>
    <GlowLayer lo={0.10} hi={0.24} duration="14s" delay="2s" style={{ inset: 0,
      background: 'radial-gradient(ellipse 52% 15% at 62% 80%, rgba(255,212,150,0.26), transparent 72%)' }}/>
  </>
}

// ─── 9. HALLOWEEN ────────────────────────────────────────────────────────
function HalloweenAmbient() {
  const embers = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    left:  `${30 + (i % 5) * 8 - 8}%`,
    size:  1.5 + (i % 3) * 0.8,
    dur:   `${2.5 + (i % 4) * 0.8}s`,
    delay: `-${((i / 10) * (2.5 + (i % 4) * 0.8)).toFixed(1)}s`,
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
    delay: `-${((i / 6) * (6 + i * 1.5)).toFixed(1)}s`,
  })), [])
  const smoke = useMemo(() => Array.from({ length: 4 }, (_, i) => ({
    left:  `${18 + i * 22}%`,
    dur:   `${10 + i * 3}s`,
    delay: `-${((i / 4) * (10 + i * 3)).toFixed(1)}s`,
  })), [])

  return <>
    {/* Main center spotlight */}
    <GlowLayer lo={0.35} hi={0.72} duration="5.5s" style={{
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
        duration={m.dur} delay={m.delay} ease={EASE.twinkle}
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
        animation: `ambientRiseUp ${s.dur} ${s.delay} ${EASE.mover} infinite`,
      }}/>
    ))}
  </>
}


// ─── 12. DIVE BAR ────────────────────────────────────────────────────────
function DiveBarAmbient() {
  const haze = useMemo(() => Array.from({ length: 4 }, (_, i) => ({
    left:   `${8 + i * 24}%`,
    bottom: `${(i % 3) * 6}%`,
    dur:    `${20 + i * 3}s`,
    delay:  `-${((i / 4) * (20 + i * 3)).toFixed(1)}s`,
    hi:     0.07 + (i % 2) * 0.02,
  })), [])

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
    <GlowLayer lo={0.15} hi={0.52} duration="8s" style={{
      bottom: 0, left: 0, right: 0, height: '20%',
      background: 'linear-gradient(to top, rgba(180,80,10,0.45), transparent)',
    }}/>
    {/* Center bar light pool */}
    <GlowLayer lo={0.18} hi={0.50} duration="6s" delay="3s" style={{
      top: '15%', left: '30%', right: '30%', bottom: '15%',
      background: 'radial-gradient(ellipse, rgba(220,120,30,0.35), transparent 70%)',
    }}/>
    {/* Slow rising haze */}
    {haze.map((h, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', bottom: h.bottom, left: h.left,
        width: '18%', height: '26%',
        background: 'radial-gradient(ellipse, rgba(200,140,80,1.0), transparent)',
        willChange: 'transform, opacity',
        '--hi': h.hi,
        animation: `ambientRiseUp ${h.dur} ${h.delay} ${EASE.mover} infinite`,
        pointerEvents: 'none',
      }}/>
    ))}
  </>
}

// ─── 13. ROOFTOP PARTY ───────────────────────────────────────────────────
function RooftopPartyAmbient() {
  const N = 14
  const bulbs = useMemo(() => Array.from({ length: N }, (_, i) => {
    const sag = 7 * Math.sin(Math.PI * i / (N - 1))
    const dur = 3.5 + (i % 4) * 0.6
    return {
      left:  `${5 + (i / (N - 1)) * 90}%`,
      top:   `${12 + sag}%`,
      size:  12 + (i % 3) * 2,
      dur:   `${dur}s`,
      delay: `-${((i / N) * dur).toFixed(1)}s`,
    }
  }), [])

  return <>
    {/* Twilight sky — deep blue upper drench */}
    <GlowLayer lo={0.55} hi={0.82} duration="30s" style={{
      top: 0, left: 0, right: 0, height: '65%',
      background: 'linear-gradient(to bottom, rgba(12,20,75,0.80) 0%, rgba(30,55,130,0.50) 60%, rgba(30,55,130,0) 100%)',
    }}/>
    {/* City glow — warm amber rising from below */}
    <GlowLayer lo={0.38} hi={0.68} duration="22s" delay="5s" style={{
      bottom: 0, left: 0, right: 0, height: '50%',
      background: 'linear-gradient(to top, rgba(255,110,15,0.55) 0%, rgba(255,155,50,0.28) 55%, rgba(255,155,50,0) 100%)',
    }}/>
    {/* String light bulbs — catenary sag across upper third */}
    {bulbs.map((b, i) => (
      <PulseDot key={i} left={b.left} top={b.top} size={b.size}
        color="rgba(255,210,138,0.95)" glowColor="rgba(255,179,71,0.50)"
        duration={b.dur} delay={b.delay}
        anim="ambientBreathe" ease={EASE.twinkle} lo={0.65}
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
    delay:   `-${((i / 32) * (10 + (i % 6) * 2.5)).toFixed(1)}s`,
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
    {/* Warm gold candle glow — center */}
    <GlowLayer lo={0.70} hi={1.0} duration="3.5s" delay="1s" style={{
      bottom: '5%', left: '20%', right: '20%', height: '50%',
      background: 'radial-gradient(ellipse 40% 65% at 50% 100%, rgba(255,180,40,0.55), rgba(255,180,40,0) 100%)',
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
    delay: `-${((i / 14) * (7 + (i % 4) * 2)).toFixed(1)}s`,
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
        duration={d.dur} delay={d.delay} ease={EASE.twinkle}
      />
    ))}
  </>
}


// ─── 19. WESTERN SHOWDOWN ────────────────────────────────────────────────
function WesternShowdownAmbient() {
  const dust = useMemo(() => [
    { top: '70%', w: '42%', h: '8%', dur: '20s', delay: '0s',   hi: 0.42, color: 'rgba(150,118,72,0.7)'  },
    { top: '78%', w: '52%', h: '9%', dur: '16s', delay: '-7s',  hi: 0.46, color: 'rgba(140,110,66,0.72)' },
    { top: '86%', w: '46%', h: '8%', dur: '13s', delay: '-10s', hi: 0.40, color: 'rgba(132,104,62,0.7)'  },
    { top: '68%', w: '34%', h: '6%', dur: '26s', delay: '-17s', hi: 0.30, color: 'rgba(160,128,80,0.6)'  },
  ], [])
  return <>
    {/* SKY — bright clear blue, deeper up high, whitening to the horizon haze */}
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'linear-gradient(to bottom, rgba(72,132,196,0.92) 0%, rgba(100,160,214,0.88) 28%, rgba(142,188,225,0.82) 48%, rgba(200,222,237,0.80) 60%, rgba(245,245,236,0.82) 67%, transparent 73%)' }}/>
    {/* DUSTY HAZE — warm dust veil rising from the horizon into the mid sky */}
    <GlowLayer lo={0.30} hi={0.48} duration="20s" delay="2s" style={{ inset: 0,
      background: 'linear-gradient(to top, transparent 16%, rgba(228,208,158,0.52) 30%, rgba(226,206,160,0.36) 46%, rgba(222,204,160,0.18) 58%, transparent 72%)' }}/>
    {/* HORIZON glare — bright near-white haze, low */}
    <GlowLayer lo={0.40} hi={0.60} duration="16s" style={{ inset: 0,
      background: 'radial-gradient(ellipse 96% 11% at 50% 67%, rgba(252,250,236,0.6), transparent 72%)' }}/>
    {/* sun glare — pale bloom, upper-right */}
    <GlowLayer lo={0.32} hi={0.54} duration="10s" style={{ inset: 0,
      background: 'radial-gradient(ellipse 40% 28% at 82% 4%, rgba(255,248,206,0.5), transparent 66%)' }}/>
    {/* THE SUN — high, top-right (anchor); inline so it has no Sun-helper dependency */}
    <div aria-hidden style={{ position: 'absolute', left: '78%', top: '-1%', width: '9%', aspectRatio: '1', borderRadius: '50%',
      background: 'radial-gradient(circle at 50% 47%, rgba(255,255,246,1) 0%, rgba(255,247,192,0.98) 34%, rgba(236,208,132,0.85) 58%, rgba(255,200,140,0.16) 78%, transparent 100%)',
      boxShadow: '0 0 54px 17px rgba(254,242,180,0.55)', willChange: 'opacity', '--lo': 0.9, '--hi': 1,
      animation: 'ambientBreathe 11s ease-in-out infinite', pointerEvents: 'none' }}/>
    {/* WARM GROUND — tan/ochre desert floor, FLAT */}
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'linear-gradient(to bottom, transparent 64%, rgba(202,164,100,0.55) 72%, rgba(176,138,82,0.75) 86%, rgba(150,116,68,0.88) 100%)' }}/>
    {/* BLOWING DUST — denser darker clouds drifting over the ground */}
    {dust.map((d, i) => (
      <div key={i} aria-hidden style={{ position: 'absolute', top: d.top, left: '-8%', width: d.w, height: d.h,
        background: `radial-gradient(ellipse 50% 55% at 50% 50%, ${d.color}, transparent 78%)`,
        willChange: 'transform, opacity', '--hi': d.hi,
        animation: `ambientDriftAcross ${d.dur} ${d.delay} linear infinite`, pointerEvents: 'none' }}/>
    ))}
    {/* TUMBLEWEEDS — three styles, mixed L/R entry, phased so they take turns */}
    <Tumbleweed top="74%" size="5.2%" seed={7}  style="loose" dir="lr" crossDur="18s" bounceDur="1.2s"  spinDur="2.9s" delay="0s"   hi={0.56}/>
    <Tumbleweed top="80%" size="5.6%" seed={23} style="tidy"  dir="rl" crossDur="18s" bounceDur="1.05s" spinDur="2.4s" delay="-6s"  hi={0.66}/>
    <Tumbleweed top="86%" size="6.5%" seed={42} style="dense" dir="lr" crossDur="18s" bounceDur="0.92s" spinDur="2.0s" delay="-12s" hi={0.72}/>
  </>
}

// ─── 20. UNDER THE SEA ───────────────────────────────────────────────────
function UnderTheSeaAmbient() {
  const bio = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    left:  `${(i * 73 + i % 5 * 17) % 100}%`,
    top:   `${(i * 61 + i % 4 * 23) % 100}%`,
    size:  3.5 + (i % 4) * 1.8,
    dur:   `${4.5 + (i % 5) * 1.8}s`,
    delay: `-${((i / 16) * (4.5 + (i % 5) * 1.8)).toFixed(1)}s`,
  })), [])

  const bubbles = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    left:  `${26 + i * 3}%`,
    size:  1.2 + (i % 3) * 0.6,
    dur:   `${7 + i * 1.5}s`,
    delay: `-${((i / 6) * (7 + i * 1.5)).toFixed(1)}s`,
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
        duration={b.dur} delay={b.delay} ease={EASE.twinkle}
      />
    ))}
    {bubbles.map((b, i) => (
      <RisingParticle key={i} left={b.left} bottom="0%" size={b.size}
        color="rgba(180,225,255,0.55)"
        duration={b.dur} delay={b.delay} opacity={0.55} bubble={true}
      />
    ))}
  </>
}

// ─── 21. NEON TOKYO ──────────────────────────────────────────────────────
function NeonTokyoAmbient() {
  const rain = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    left:    `${(i * 53 + i % 5 * 11) % 100}%`,
    height:  60 + (i % 4) * 18,
    opacity: 0.60 + (i % 4) * 0.07,
    dur:     `${1.8 + (i % 4) * 0.7}s`,
    delay:   `-${((i / 34) * (1.8 + (i % 4) * 0.7)).toFixed(1)}s`,
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
        background: i % 3 === 0 ? 'rgba(191,234,255,1.0)' : i % 3 === 1 ? 'rgba(220,246,255,1.0)' : 'rgba(160,220,255,1.0)',
        willChange: 'transform, opacity',
        '--hi': r.opacity, '--drift': '0px',
        animation: `ambientFallSlow ${r.dur} ${r.delay} linear infinite`,
        pointerEvents: 'none',
      }}/>
    ))}
  </>
}


// ─── 23. FIREFLY SUMMER ──────────────────────────────────────────────────
function FireflySummerAmbient() {
  const fireflies = useMemo(() => Array.from({ length: 19 }, (_, i) => ({
    left:   `${(i * 53) % 100}%`,
    top:    `${35 + (i * 43 + i % 4 * 13) % 55}%`,
    size:   3 + (i % 3) * 1.2,
    dur:    `${2.4 + (i % 5) * 0.8}s`,
    delay:  `-${((i / 19) * (2.4 + (i % 5) * 0.8)).toFixed(1)}s`,
    wDur:   `${7.0 + (i % 4) * 1.5}s`,
    wDelay: `-${((i * 1.7) % 9).toFixed(1)}s`,
  })), [])

  return <>
    <GlowLayer lo={0.15} hi={0.35} duration="25s" style={{
      top: 0, left: 0, right: 0, height: '30%',
      background: 'linear-gradient(to bottom, rgba(180,110,35,0.32), transparent)',
    }}/>
    <GlowLayer lo={0.18} hi={0.45} duration="30s" delay="8s" style={{
      inset: 0,
      background: 'radial-gradient(ellipse 80% 60% at 50% 60%, rgba(0,75,20,0.35), transparent)',
    }}/>
    <div aria-hidden style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%',
      background: 'linear-gradient(to top, rgba(80,60,10,0.18), transparent)', pointerEvents: 'none',
    }}/>
    {fireflies.map((f, i) => (
      <PulseDot key={i} left={f.left} top={f.top} size={f.size}
        color="rgba(185,255,85,0.95)" glowColor="rgba(145,255,45,0.40)"
        duration={f.dur} delay={f.delay}
        lo={0.15} wander={true} wanderDur={f.wDur} wanderDelay={f.wDelay}
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
    dur:     `${10 + (i % 7) * 4}s`,
    delay:   `-${((i / 200) * (10 + (i % 7) * 4)).toFixed(1)}s`,
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
        willChange: 'opacity',
        '--lo': s.opacity * 0.25, '--hi': Math.min(s.opacity + 0.10, 0.85),
        animation: `ambientBreathe ${s.dur} ${s.delay} ease infinite`,
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
  const neon = useMemo(() => [
    { bg: 'radial-gradient(ellipse 72% 49% at 50% 100%, rgba(255,16,200,0.58) 0%, rgba(255,16,200,0.24) 42%, transparent 76%), radial-gradient(ellipse 135% 32% at 50% 105%, rgba(255,16,200,0.40) 0%, rgba(255,16,200,0.15) 46%, transparent 78%)', delay: '0s'   },
    { bg: 'radial-gradient(ellipse 72% 49% at 50% 100%, rgba(0,208,255,0.54) 0%, rgba(0,208,255,0.22) 42%, transparent 76%), radial-gradient(ellipse 135% 32% at 50% 105%, rgba(0,208,255,0.38) 0%, rgba(0,208,255,0.14) 46%, transparent 78%)',   delay: '-4s'  },
    { bg: 'radial-gradient(ellipse 72% 49% at 50% 100%, rgba(160,32,255,0.56) 0%, rgba(160,32,255,0.22) 42%, transparent 76%), radial-gradient(ellipse 135% 32% at 50% 105%, rgba(160,32,255,0.38) 0%, rgba(160,32,255,0.14) 46%, transparent 78%)', delay: '-8s'  },
    { bg: 'radial-gradient(ellipse 72% 49% at 50% 100%, rgba(255,80,160,0.54) 0%, rgba(255,80,160,0.22) 42%, transparent 76%), radial-gradient(ellipse 135% 32% at 50% 105%, rgba(255,80,160,0.38) 0%, rgba(255,80,160,0.14) 46%, transparent 78%)', delay: '-12s' },
  ], [])
  const dots = useMemo(() => [
    { left: '6%',  top: '9%',  size: 5,   color: 'rgba(255,80,200,0.95)',  dur: '2.2s', delay: '0s'    },
    { left: '14%', top: '18%', size: 3.5, color: 'rgba(0,210,255,0.95)',   dur: '2.7s', delay: '-0.7s' },
    { left: '22%', top: '7%',  size: 4,   color: 'rgba(180,90,255,0.9)',   dur: '1.9s', delay: '-1.3s' },
    { left: '30%', top: '16%', size: 4,   color: 'rgba(255,255,255,0.95)', dur: '2.4s', delay: '-0.4s' },
    { left: '40%', top: '15%', size: 3.5, color: 'rgba(255,120,220,0.9)',  dur: '2.5s', delay: '-1.5s' },
    { left: '48%', top: '21%', size: 5,   color: 'rgba(0,210,255,0.9)',    dur: '2.1s', delay: '-1.1s' },
    { left: '56%', top: '15%', size: 4,   color: 'rgba(180,90,255,0.9)',   dur: '2.9s', delay: '-1.8s' },
    { left: '66%', top: '17%', size: 3.5, color: 'rgba(255,255,255,0.9)',  dur: '2.0s', delay: '-0.9s' },
    { left: '72%', top: '7%',  size: 4,   color: 'rgba(255,80,200,0.9)',   dur: '3.0s', delay: '-1.7s' },
    { left: '80%', top: '15%', size: 4,   color: 'rgba(0,210,255,0.9)',    dur: '2.3s', delay: '-1.0s' },
    { left: '88%', top: '9%',  size: 3,   color: 'rgba(180,90,255,0.9)',   dur: '2.8s', delay: '-2.0s' },
    { left: '12%', top: '26%', size: 3,   color: 'rgba(255,255,255,0.9)',  dur: '3.1s', delay: '-2.2s' },
    { left: '36%', top: '25%', size: 3,   color: 'rgba(0,210,255,0.85)',   dur: '3.2s', delay: '-1.4s' },
    { left: '62%', top: '26%', size: 3.5, color: 'rgba(255,120,220,0.9)',  dur: '2.4s', delay: '-0.8s' },
    { left: '86%', top: '24%', size: 3,   color: 'rgba(180,90,255,0.85)',  dur: '2.7s', delay: '-2.3s' },
  ], [])
  return <>
    <GlowLayer lo={0.16} hi={0.34} duration="20s" style={{ inset: 0,
      background: 'radial-gradient(ellipse 90% 70% at 50% 24%, rgba(60,10,90,0.42), transparent 75%)' }}/>
    {neon.map((n, i) => (
      <div key={i} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: n.bg, willChange: 'opacity', '--lo': 0, '--hi': 0.9,
        animation: `ambientBreathe 16s ${n.delay} ease-in-out infinite` }}/>
    ))}
    {dots.map((d, i) => (
      <div key={i} aria-hidden style={{ position: 'absolute', left: d.left, top: d.top, width: d.size, height: d.size,
        borderRadius: '50%', background: d.color, boxShadow: `0 0 ${d.size * 2.2}px ${d.color}`, pointerEvents: 'none',
        willChange: 'transform, opacity', '--hi': 0.95,
        animation: `ambientPulseIn ${d.dur} ${d.delay} ease infinite` }}/>
    ))}
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
