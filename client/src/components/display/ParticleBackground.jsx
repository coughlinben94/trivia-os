import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { getTheme } from '../../themes/index.js'
import { deriveTint, hexToRgba } from '../../lib/colorTint.js'

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
  @keyframes orbit {
    0%   { transform: translate(0%, -8%); }
    25%  { transform: translate(11%, 0%); }
    50%  { transform: translate(0%, 8%); }
    75%  { transform: translate(-11%, 0%); }
    100% { transform: translate(0%, -8%); }
  }
  @keyframes streakOnce {
    0%   { transform: translate(0,0); opacity: 0; }
    8%   { opacity: 1; }
    45%  { transform: translate(calc(var(--dx,40%)*0.60), calc(var(--dy,40%)*0.60)); opacity: 1; }
    72%  { transform: translate(calc(var(--dx,40%)*0.86), calc(var(--dy,40%)*0.86)); opacity: 0.55; }
    90%  { transform: translate(calc(var(--dx,40%)*0.97), calc(var(--dy,40%)*0.97)); opacity: 0.16; }
    100% { transform: translate(var(--dx,40%), var(--dy,40%)); opacity: 0; }
  }
  @keyframes jcGlintPop {
    0%   { opacity: 0; }
    14%  { opacity: var(--gop, 0.75); }
    26%  { opacity: calc(var(--gop, 0.75) * 0.45); }
    40%  { opacity: var(--gop, 0.75); }
    100% { opacity: 0; }
  }
  @keyframes ambientFloatY {
    0%,100% { transform: translateY(0); }
    25%     { transform: translateY(var(--fy1,-5vh)); }
    75%     { transform: translateY(var(--fy2,5vh)); }
  }
  @keyframes ambientFloatX {
    0%,100% { transform: translateX(0); }
    50%     { transform: translateX(var(--fx,10vw)); }
  }
  @keyframes ambientBloom {
    0%   { opacity: 0; transform: translate(0,0); }
    18%  { opacity: var(--hi,.55); }
    78%  { opacity: calc(var(--hi,.55)*.72); }
    100% { opacity: 0; transform: translate(var(--bx,5vw), var(--by,-3vh)); }
  }
  @keyframes ambientStretchY {
    0%,100% { transform: scaleY(1); }
    50%     { transform: scaleY(var(--sy,1.05)); }
  }
  @keyframes ambientSway {
    0%,100% { transform: rotate(calc(var(--sway,1.2deg) * -1)); }
    50%     { transform: rotate(var(--sway,1.2deg)); }
  }
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
    @keyframes orbit { 0%,100% { transform: none; } }
    @keyframes streakOnce { 0%,100% { opacity: 0; } }
    @keyframes ambientFloatY { 0%,100% { transform: none; } }
    @keyframes ambientFloatX { 0%,100% { transform: none; } }
    @keyframes ambientBloom  { 0%,100% { opacity: var(--hi,.55); } }
    @keyframes ambientStretchY { 0%,100% { transform: none; } }
    @keyframes ambientSway     { 0%,100% { transform: none; } }
    .jc-anim { animation: none !important; }
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
function PureMichiganAmbient({ tint }) {
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
      background: `linear-gradient(to bottom, ${tint('rgba(0,25,80,0.32)')} 0%, ${tint('rgba(0,40,100,0.22)')} 70%, transparent 100%)`,
    }}/>
    <GlowLayer lo={0.22} hi={0.52} duration="18s" delay="3s" style={{
      bottom: 0, left: 0, right: 0, height: '30%',
      background: `linear-gradient(to top, ${tint('rgba(0,70,140,0.40)')}, ${tint('rgba(0,50,100,0.20)')}, transparent)`,
    }}/>
    {/* Water shimmer band — light on the lake surface */}
    <GlowLayer lo={0.15} hi={0.35} duration="24s" delay="6s" style={{
      top: '55%', left: 0, right: 0, height: '20%',
      background: `radial-gradient(ellipse 100% 50% at 50% 100%, ${tint('rgba(40,120,200,0.22)')}, transparent)`,
    }}/>
    {motes.map((f, i) => (
      <PulseDot key={i} left={f.left} top={f.top} size={f.size}
        color={tint('rgba(210,240,255,0.90)')} glowColor={tint('rgba(150,210,255,0.40)')}
        duration={f.dur} delay={f.delay}
        lo={0.45} wander={true} wanderDur={f.wDur} wanderDelay={f.wDelay}
      />
    ))}
  </>
}

// ─── 2. MIDNIGHT GALAXY ───────────────────────────────────────────────────

// Nebula bloomers re-roll their position/travel/duration on every
// animationiteration — the CSS loop boundary, which for ambientBloom always
// lands at opacity 0, so the reposition is invisible. Same per-cycle
// re-roll philosophy as rollMeteorShower, just event-driven instead of
// timer-driven since this is a continuous loop, not a fire-then-wait burst.
// Center is rejected out of the core's home quadrant (upper-right) so blooms
// never compete with the anchor.
function rollBloomCenter() {
  let x = 0, y = 0, tries = 0
  do {
    x = Math.random() * 100
    y = Math.random() * 100
    tries++
  } while (x > 50 && y < 42 && tries < 30)
  return {
    x, y,
    bx: `${(-6 + Math.random() * 12).toFixed(1)}vw`,
    by: `${(-4 + Math.random() * 8).toFixed(1)}vh`,
    dur: `${(14 + Math.random() * 12).toFixed(1)}s`,
  }
}

function NebulaBloomer({ color, w, h, blur, initialDur, initialDelay }) {
  // First mount uses the prescribed clock + stagger; every reroll after that
  // gets a fresh random duration and delay:'0s' so the restart lands exactly
  // on the keyframe's 0% (opacity 0) instead of skipping ahead into
  // visibility — keeping every reposition invisible, not just the first.
  const [roll, setRoll] = useState(() => ({ ...rollBloomCenter(), dur: initialDur, delay: initialDelay }))
  // The reduced-motion override only freezes opacity — the animation still
  // loops and still fires animationiteration, which would otherwise keep
  // silently teleporting the bloom while it's fully (not invisibly) visible.
  // Stop rerolling once reduced motion is on, so it holds one place for good.
  const reroll = () => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setRoll({ ...rollBloomCenter(), delay: '0s' })
  }
  return (
    <div aria-hidden
      onAnimationIteration={reroll}
      style={{
        position: 'absolute', left: `${roll.x}%`, top: `${roll.y}%`,
        width: w, height: h,
        // Centered via margin, not transform — ambientBloom's own keyframe
        // drives transform (0,0 → bx,by) and would wipe out a competing
        // static translate() the instant the animation starts.
        marginLeft: `calc(${w} / -2)`, marginTop: `calc(${h} / -2)`,
        pointerEvents: 'none', willChange: 'opacity,transform', borderRadius: '50%',
        filter: `blur(${blur}px)`,
        background: `radial-gradient(ellipse, ${color}, transparent 70%)`,
        '--hi': 0.55, '--bx': roll.bx, '--by': roll.by,
        animation: `ambientBloom ${roll.dur} ease-in-out ${roll.delay} infinite`,
      }}
    />
  )
}

function midnightRollSatellite() {
  return {
    top: `${(6 + Math.random() * 72).toFixed(1)}%`,
    rot: `${(-12 + Math.random() * 24).toFixed(1)}deg`,
    reverse: Math.random() < 0.5,
    dur: `${(38 + Math.random() * 25).toFixed(1)}s`,
  }
}

function GalaxySatellite({ tint }) {
  const [roll, setRoll] = useState(midnightRollSatellite)
  // Same reasoning as NebulaBloomer: ambientDriftAcross's reduced-motion
  // override only freezes opacity, so without this guard the dot would keep
  // re-pathing to a new row/angle in full view instead of holding still.
  const reroll = () => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setRoll(midnightRollSatellite())
  }
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', transform: `rotate(${roll.rot})` }}>
      <div
        aria-hidden
        onAnimationIteration={reroll}
        style={{
          position: 'absolute', top: roll.top, left: 0, width: 3, height: 3, borderRadius: '50%',
          pointerEvents: 'none', willChange: 'transform,opacity',
          // pure-white dot is the satellite's sanctioned exception (spec: heart + satellite only);
          // its glow is a static box-shadow, no tail — directional streaks belong to meteor-shower
          background: 'rgba(255,255,255,1)',
          boxShadow: `0 0 5px rgba(255,255,255,0.95), 0 0 10px ${tint('rgba(192,96,255,0.6)')}`,
          '--hi': 0.85,
          animation: `ambientDriftAcross ${roll.dur} linear infinite ${roll.reverse ? 'reverse' : 'normal'}`,
        }}
      />
    </div>
  )
}

function MidnightGalaxyAmbient({ tint }) {
  // Base star field — min-distance placement (aspect-corrected for 16:9,
  // since raw % distance is axis-relative and would let stars clump on the
  // wider axis) so the scatter never bunches up. Up to 40 tries per star
  // before just accepting the last roll.
  const stars = useMemo(() => {
    const placed = []
    for (let i = 0; i < 85; i++) {
      let x = 0, y = 0, tries = 0, ok = false
      while (tries < 40) {
        x = Math.random() * 100
        y = Math.random() * 100
        ok = placed.every(p => {
          const dx = (x - p.x) * 1.78
          const dy = y - p.y
          return dx * dx + dy * dy > 49
        })
        tries++
        if (ok) break
      }
      const hi = 0.35 + Math.random() * 0.5
      const dur = 3 + Math.random() * 5
      placed.push({
        x, y, size: 1 + Math.random() * 1.6,
        highlightColored: Math.random() < 0.20,
        hi, lo: hi * 0.25,
        dur: `${dur.toFixed(1)}s`, delay: `-${(Math.random() * dur).toFixed(1)}s`,
      })
    }
    return placed
  }, [])

  // Star-cluster band — dense dust lane along the core's tilted axis.
  // Deliberately clustered, not min-distance: jitter around a straight line
  // from (62%,-6%) to (106%,30%).
  const clusterStars = useMemo(() => Array.from({ length: 61 }, () => {
    const t = Math.random()
    const bx = 62 + t * 44
    const by = -6 + t * 36
    const hi = 0.35 + Math.random() * 0.5
    const dur = 2.5 + Math.random() * 4.5
    return {
      left: `${(bx + (Math.random() * 10 - 5)).toFixed(2)}%`,
      top: `${(by + (Math.random() * 10 - 5)).toFixed(2)}%`,
      size: 1 + Math.random() * 1.4,
      highlightColored: Math.random() < 0.20,
      hi, lo: hi * 0.25,
      dur: `${dur.toFixed(1)}s`, delay: `-${(Math.random() * dur).toFixed(1)}s`,
    }
  }), [])

  return <>
    {/* 1. Base wash — deep space, lifting slightly indigo toward the bottom */}
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `linear-gradient(180deg, ${tint('rgba(4,0,16,1)')} 0%, ${tint('rgba(8,0,26,1)')} 55%, ${tint('rgba(48,28,92,0.55)')} 100%)`,
    }}/>
    {/* 2. Corner accent wash */}
    <GlowLayer lo={0.4} hi={0.62} duration="19s" style={{
      inset: 0, background: `radial-gradient(ellipse 95% 62% at 12% 88%, ${tint('rgba(74,26,143,0.5)')}, transparent)`,
    }}/>
    {/* 3. Nebula bloomers — reposition each cycle, always rejected out of the core's quadrant */}
    <NebulaBloomer color={tint('rgba(74,26,143,0.42)')}  w="37vw" h="17vh" blur={14} initialDur="15s" initialDelay="-3s"/>
    <NebulaBloomer color={tint('rgba(74,26,143,0.38)')}  w="29vw" h="21vh" blur={16} initialDur="17s" initialDelay="-9s"/>
    <NebulaBloomer color={tint('rgba(36,16,78,0.44)')}   w="32vw" h="13vh" blur={18} initialDur="20s" initialDelay="-13s"/>
    <NebulaBloomer color={tint('rgba(192,96,255,0.30)')} w="23vw" h="19vh" blur={15} initialDur="24s" initialDelay="-5s"/>
    {/* 4. Base star field — pure-white twinkle, ~20% highlight-tinted (sanctioned near-white exception) */}
    {stars.map((s, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', left: `${s.x.toFixed(2)}%`, top: `${s.y.toFixed(2)}%`, pointerEvents: 'none',
        width: s.size, height: s.size, borderRadius: '50%', willChange: 'opacity',
        background: s.highlightColored ? tint('rgba(192,96,255,0.9)') : `rgba(255,255,255,${s.hi})`,
        '--lo': s.lo, '--hi': s.hi,
        animation: `ambientBreathe ${s.dur} ${s.delay} ease infinite`,
      }}/>
    ))}
    {/* 5. Anchor — galactic core, top-right */}
    <div aria-hidden style={{
      position: 'absolute', top: '-8%', right: '-10%', width: '48vw', height: '36vh',
      transform: 'rotate(-19deg)', pointerEvents: 'none', willChange: 'opacity', borderRadius: '50%',
      filter: 'blur(2px)',
      // near-white heart is the sanctioned hot-core exception; the rest is in-family highlight
      background: `radial-gradient(ellipse, rgba(255,255,255,0.95) 0%, ${tint('rgba(192,96,255,0.65)')} 13%, ${tint('rgba(192,96,255,0.24)')} 34%, transparent 72%)`,
      '--lo': 0.78, '--hi': 1,
      animation: 'ambientBreathe 13s ease-in-out infinite',
    }}/>
    {/* 6. Star-cluster band — dust lane along the core's axis, sits in front of it */}
    {clusterStars.map((s, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', left: s.left, top: s.top, pointerEvents: 'none',
        width: s.size, height: s.size, borderRadius: '50%', willChange: 'opacity',
        background: s.highlightColored ? tint('rgba(192,96,255,0.9)') : `rgba(255,255,255,${s.hi})`,
        '--lo': s.lo, '--hi': s.hi,
        animation: `ambientBreathe ${s.dur} ${s.delay} ease infinite`,
      }}/>
    ))}
    {/* 7. Satellite — single dot, no tail, re-paths every crossing */}
    <GalaxySatellite tint={tint}/>
  </>
}

// ─── 3. AUTUMN HARVEST ────────────────────────────────────────────────────
function AutumnHarvestAmbient({ tint }) {
  const leaves = useMemo(() => [
    { color: tint('rgba(245,166,35,1.0)'),  size: 6,  dur: '9s',    delay: '0s',    drift: '14px',  rot: '260deg' }, // #f5a623 amber
    { color: tint('rgba(232,130,30,1.0)'),  size: 5,  dur: '13s',   delay: '-1.6s', drift: '-16px', rot: '280deg' }, // #e8821e burnt-orange
    { color: tint('rgba(212,100,26,1.0)'),  size: 5,  dur: '11s',   delay: '-2.8s', drift: '-10px', rot: '320deg' }, // #d4641a deep-orange
    { color: tint('rgba(242,184,74,1.0)'),  size: 5,  dur: '8.5s',  delay: '-3.2s', drift: '-18px', rot: '310deg' }, // #f2b84a gold
    { color: tint('rgba(201,82,26,1.0)'),   size: 6,  dur: '12s',   delay: '-6s',   drift: '16px',  rot: '250deg' }, // #c9521a rust
    { color: tint('rgba(245,166,35,1.0)'),  size: 4,  dur: '10.5s', delay: '-6.6s', drift: '12px',  rot: '340deg' }, // #f5a623 amber
    { color: tint('rgba(232,130,30,1.0)'),  size: 6,  dur: '10s',   delay: '-7.5s', drift: '8px',   rot: '360deg' }, // #e8821e burnt-orange
    { color: tint('rgba(242,184,74,1.0)'),  size: 7,  dur: '9.5s',  delay: '-8.3s', drift: '18px',  rot: '300deg' }, // #f2b84a gold
  ].map((l, i) => ({ ...l, left: `${5 + i * 12}%` })), [tint])

  const embers = useMemo(() => Array.from({ length: 5 }, (_, i) => ({
    left:  `${42 + (i % 4) * 4 - 6}%`,
    size:  2 + (i % 2) * 1.0,
    dur:   `${3 + (i % 3) * 1.0}s`,
    delay: `-${((i / 5) * (3 + (i % 3) * 1.0)).toFixed(1)}s`,
  })), [])

  const emberColor = tint('rgba(255,130,20,0.90)')

  return <>
    {/* Warm sky glow — top */}
    <GlowLayer lo={0.28} hi={0.62} duration="20s" style={{
      top: 0, left: 0, right: 0, height: '40%',
      background: `linear-gradient(to bottom, ${tint('rgba(200,60,10,0.52)')} 0%, ${tint('rgba(180,40,5,0.24)')} 60%, transparent 100%)`,
    }}/>
    {/* Hearth glow — bottom */}
    <GlowLayer lo={0.22} hi={0.55} duration="14s" delay="5s" style={{
      bottom: 0, left: 0, right: 0, height: '20%',
      background: `linear-gradient(to top, ${tint('rgba(200,80,10,0.50)')}, transparent)`,
    }}/>
    {/* Firelight pulse — center bottom */}
    <GlowLayer lo={0.18} hi={0.52} duration="3.2s" flicker style={{
      inset: 0,
      background: `radial-gradient(ellipse 12% 28% at 50% 96%, ${tint('rgba(255,100,20,0.58)')}, transparent)`,
    }}/>
    {leaves.map((l, i) => (
      <FallingParticle key={i} left={l.left} size={Math.round(l.size * 2)} color={l.color}
        duration={l.dur} delay={l.delay} drift={l.drift} opacity={0.95} ratio={0.6}
        leaf={true} rot={l.rot}/>
    ))}
    {embers.map((e, i) => (
      <RisingParticle key={i} left={e.left} size={e.size}
        color={emberColor} duration={e.dur} delay={e.delay} opacity={0.80}/>
    ))}
  </>
}

// ─── 4. NORTHERN LIGHTS ───────────────────────────────────────────────────
// 2-hour loop audit (2026-07-02): ice glints and the sweeping band drifter
// were static forever-identical paths — every glint and the band replayed
// the same left/top/duration on every single loop for the full 2-hour show.
// Re-roll philosophy matches rollMeteorShower/rollBloomCenter: reroll on
// onAnimationIteration, gated off once reduced-motion is on so state stops
// changing (the loop still fires the event under RM, just without transform).
function rollIceGlint() {
  const left = Math.random() < 0.5 ? Math.random() * 20 : 80 + Math.random() * 20
  const dur = 16 + Math.random() * 10
  return {
    left: `${left.toFixed(2)}%`,
    size: 1 + Math.random() * 1.5,
    drift: `${(Math.random() * 10 - 5).toFixed(1)}px`,
    dur: `${dur.toFixed(1)}s`,
  }
}

function IceGlint({ initialDelay }) {
  const [roll, setRoll] = useState(() => ({ ...rollIceGlint(), delay: initialDelay }))
  const reroll = () => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setRoll({ ...rollIceGlint(), delay: '0s' })
  }
  return (
    <div aria-hidden
      onAnimationIteration={reroll}
      style={{
        position: 'absolute', left: roll.left, top: '-3%', width: roll.size, height: roll.size, borderRadius: '50%',
        pointerEvents: 'none', background: 'rgba(255,255,255,0.9)',
        willChange: 'transform,opacity', '--hi': 0.75, '--drift': roll.drift,
        animation: `ambientFallSlow ${roll.dur} ${roll.delay} linear infinite`,
      }}
    />
  )
}

function rollAuroraSweepBand() {
  return {
    top: `${(Math.random() * 22).toFixed(1)}%`,
    dur: `${(38 + Math.random() * 20).toFixed(1)}s`,
  }
}

function AuroraSweepBand({ tint }) {
  const [roll, setRoll] = useState({ top: '4%', dur: '48s' })
  const reroll = () => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setRoll(rollAuroraSweepBand())
  }
  return (
    <div aria-hidden
      onAnimationIteration={reroll}
      style={{
        position: 'absolute', top: roll.top, left: 0, width: '38%', height: '46%', pointerEvents: 'none',
        background: `radial-gradient(ellipse, ${tint('rgba(13,80,64,0.35)')}, transparent 70%)`,
        willChange: 'transform,opacity', '--hi': 0.4,
        animation: `ambientDriftAcross ${roll.dur} linear infinite`,
      }}
    />
  )
}

function NorthernLightsAmbient({ tint }) {
  const stars = useMemo(() => Array.from({ length: 40 }, () => {
    const hi = 0.4 + Math.random() * 0.4
    const dur = 4 + Math.random() * 5
    return {
      left: `${(Math.random() * 100).toFixed(2)}%`,
      top: `${(Math.random() * 58).toFixed(2)}%`,
      size: 1 + Math.random() * 1.2,
      hi, dur: `${dur.toFixed(1)}s`, delay: `-${(Math.random() * dur).toFixed(1)}s`,
    }
  }), [])

  const shimmerColumns = useMemo(() => Array.from({ length: 9 }, () => {
    const hi = 0.3 + Math.random() * 0.2
    const dur = 3.5 + Math.random() * 4.5
    return {
      left: `${(Math.random() * 100).toFixed(2)}%`,
      top: `${(Math.random() * 6).toFixed(2)}vh`,
      w: `${(1.6 + Math.random() * 2).toFixed(2)}vw`,
      h: `${(20 + Math.random() * 12).toFixed(2)}vh`,
      hi, dur: `${dur.toFixed(1)}s`, delay: `-${(Math.random() * dur).toFixed(1)}s`,
    }
  }), [])

  // Ice glints only fall at the flanks (outside x 20-80%) — the center stays
  // clear for question content, per the ambient design law's safe-area rule.
  // Only the initial stagger delay is seeded here; each glint re-rolls its
  // own left/size/drift/dur every cycle (see IceGlint above).
  const iceGlintSeeds = useMemo(() => Array.from({ length: 26 }, () => {
    const dur = 16 + Math.random() * 10
    return { initialDelay: `-${(Math.random() * dur).toFixed(1)}s` }
  }), [])

  const pines = useMemo(() => {
    const n = 20
    return Array.from({ length: n }, (_, i) => ({
      x: (i + 0.5) * (1600 / n) + (Math.random() * 30 - 15),
      h: 46 + Math.random() * 80,
      w: 34 + Math.random() * 20,
    }))
  }, [])

  return <>
    {/* 1. Base wash — deep polar sky, lifting slightly teal toward the ground */}
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `linear-gradient(180deg, ${tint('rgba(1,8,16,1)')} 0%, ${tint('rgba(2,12,24,1)')} 58%, ${tint('rgba(10,60,50,0.55)')} 100%)`,
    }}/>
    {/* 2. Snowfield glow — hugs the bottom edge */}
    <GlowLayer lo={0.5} hi={0.8} duration="17s" style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: '42%',
      background: `radial-gradient(ellipse 92% 62% at 50% 100%, ${tint('rgba(64,255,204,0.16)')}, transparent 72%)`,
    }}/>
    <GlowLayer lo={0.5} hi={0.8} duration="17s" style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: '26%',
      background: `radial-gradient(ellipse 70% 46% at 50% 100%, ${tint('rgba(13,80,64,0.35)')}, transparent 70%)`,
    }}/>
    {/* 3. Star field — pure-white twinkle, sanctioned near-white exception */}
    {stars.map((s, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', left: s.left, top: s.top, pointerEvents: 'none',
        width: s.size, height: s.size, borderRadius: '50%',
        background: `rgba(255,255,255,${s.hi})`, willChange: 'opacity',
        '--lo': s.hi * 0.25, '--hi': s.hi,
        animation: `ambientBreathe ${s.dur} ${s.delay} ease infinite`,
      }}/>
    ))}
    {/* 4. SWAY GROUP A — curtain 1, the ribbon, curtain 2 */}
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      transformOrigin: '50% -20%', '--sway': '1.2deg',
      animation: 'ambientSway 21s ease-in-out infinite',
    }}>
      <div style={{
        position: 'absolute', inset: 0, transformOrigin: 'top', '--sy': 1.06,
        animation: 'ambientStretchY 13s ease-in-out infinite',
      }}>
        <svg aria-hidden viewBox="0 0 1600 900" preserveAspectRatio="none" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
        }}>
          <defs>
            <linearGradient id="nlCurtainGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={tint('rgb(64,255,204)')} stopOpacity="0.75" />
              <stop offset="45%" stopColor={tint('rgb(13,80,64)')}   stopOpacity="0.55" />
              <stop offset="100%" stopColor={tint('rgb(13,80,64)')}  stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* 4a. Curtain 1 — big, arcing the upper sky */}
          <path
            d="M -50 180 C 250 80,550 260,850 140 C 1150 40,1400 200,1650 130 L 1650 460 C 1400 420,1150 260,850 360 C 550 460,250 300,-50 380 Z"
            fill="url(#nlCurtainGrad)"
            style={{ filter: 'blur(15px)', willChange: 'opacity', '--lo': 0.55, '--hi': 0.85,
              animation: 'ambientBreathe 14s ease-in-out infinite' }}
          />
          {/* 4b. The ribbon — three floating strands, cross-fading past each other */}
          <g style={{ '--fy1': '-18px', '--fy2': '18px', animation: 'ambientFloatY 6.5s ease-in-out infinite' }}>
            <path
              d="M -50 420 C 200 380,400 460,650 400 C 900 340,1150 440,1400 390 C 1500 375,1600 400,1650 395"
              fill="none" stroke={tint('rgb(64,255,204)')} strokeWidth="6" strokeLinecap="round"
              style={{ filter: 'blur(3px)', willChange: 'opacity', '--lo': 0.12, '--hi': 0.65,
                animation: 'ambientBreathe 10s 0s ease-in-out infinite' }}
            />
          </g>
          <g style={{ '--fy1': '16px', '--fy2': '-16px', animation: 'ambientFloatY 8s -2.7s ease-in-out infinite' }}>
            <path
              d="M -50 450 C 220 500,430 410,680 470 C 930 530,1160 420,1420 480 C 1520 500,1600 470,1650 485"
              fill="none" stroke={tint('rgb(64,255,204)')} strokeWidth="5" strokeLinecap="round"
              style={{ filter: 'blur(3.5px)', willChange: 'opacity', '--lo': 0.12, '--hi': 0.5,
                animation: 'ambientBreathe 10s -3.33s ease-in-out infinite' }}
            />
          </g>
          <g style={{ '--fy1': '-14px', '--fy2': '20px', animation: 'ambientFloatY 9.5s -5.1s ease-in-out infinite' }}>
            <path
              d="M -50 480 C 240 430,470 520,700 460 C 950 400,1180 500,1440 440 C 1530 420,1600 450,1650 435"
              fill="none" stroke={tint('rgb(64,255,204)')} strokeWidth="5" strokeLinecap="round"
              style={{ filter: 'blur(4px)', willChange: 'opacity', '--lo': 0.12, '--hi': 0.45,
                animation: 'ambientBreathe 10s -6.67s ease-in-out infinite' }}
            />
          </g>
          {/* 4c. Curtain 2 — lower, dimmer */}
          <path
            d="M -50 520 C 260 460,520 600,780 510 C 1040 420,1320 560,1650 500 L 1650 780 C 1320 850,1040 700,780 800 C 520 900,260 760,-50 810 Z"
            fill="url(#nlCurtainGrad)"
            style={{ filter: 'blur(22px)', willChange: 'opacity', '--lo': 0.4, '--hi': 0.7,
              animation: 'ambientBreathe 19s ease-in-out infinite' }}
          />
        </svg>
      </div>
    </div>
    {/* 5. SWAY GROUP B — curtain 3, a broad soft accent band underneath */}
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      transformOrigin: '50% -30%', '--sway': '0.9deg',
      animation: 'ambientSway 26s -9s ease-in-out infinite',
    }}>
      <div style={{
        position: 'absolute', inset: 0, transformOrigin: 'top', '--sy': 1.08,
        animation: 'ambientStretchY 17s -5s ease-in-out infinite',
      }}>
        <svg aria-hidden viewBox="0 0 1600 900" preserveAspectRatio="none" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
        }}>
          <path
            d="M -80 260 C 300 160,700 340,1080 220 C 1350 140,1550 240,1680 200 L 1680 620 C 1550 680,1350 560,1080 640 C 700 760,300 580,-80 660 Z"
            fill={tint('rgba(13,80,64,0.55)')}
            style={{ filter: 'blur(26px)', willChange: 'opacity', '--lo': 0.25, '--hi': 0.5,
              animation: 'ambientBreathe 23s ease-in-out infinite' }}
          />
        </svg>
      </div>
    </div>
    {/* 6. Shimmer columns — thin dancing-light shafts */}
    {shimmerColumns.map((c, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', left: c.left, top: c.top, width: c.w, height: c.h, pointerEvents: 'none',
        background: `linear-gradient(to bottom, ${tint('rgba(64,255,204,0.9)')}, ${tint('rgba(13,80,64,0.3)')} 55%, transparent 100%)`,
        filter: 'blur(6px)', willChange: 'opacity',
        '--lo': 0.04, '--hi': c.hi,
        animation: `ambientBreathe ${c.dur} ${c.delay} ease infinite`,
      }}/>
    ))}
    {/* 7. Sweeping band drifter — soft glow crossing the full sky; re-rolls
        its vertical position + duration every cycle (2-hour loop audit) */}
    <AuroraSweepBand tint={tint}/>
    {/* 8. Ice glints — falling only at the flanks, near-white sanctioned
        exception; each one re-rolls its own path every cycle (2-hour loop audit) */}
    {iceGlintSeeds.map((seed, i) => (
      <IceGlint key={i} initialDelay={seed.initialDelay}/>
    ))}
    {/* 9. Pine treeline — static silhouette, does not animate */}
    <svg aria-hidden viewBox="0 0 1600 220" preserveAspectRatio="none" style={{
      position: 'absolute', bottom: 0, left: 0, width: '100%', height: '15vh', pointerEvents: 'none',
    }}>
      <rect x="0" y="180" width="1600" height="40" fill={tint('rgba(2,14,12,0.95)')} />
      {pines.map((p, i) => (
        <polygon key={i}
          points={`${p.x - p.w / 2},180 ${p.x + p.w / 2},180 ${p.x},${180 - p.h}`}
          fill={tint('rgba(2,18,15,0.92)')}
        />
      ))}
    </svg>
  </>
}

// ─── 5. MEDIEVAL TAVERN ───────────────────────────────────────────────────
const MT = {
  bg: "#0e0800", bgDeep: "#080400", accent: "#5a2a08",
  highlight: "#e08020", shiny: "#ffb040", core: "#ffe6b0",
  ember: "#ffc060", text: "#f0d8a0", smoke: "#6b5a44",
}

const MT_FLAME = "M40 136 C22 132 14 114 18 94 C21 78 14 68 22 54 C28 44 24 34 33 22 C37 16 39 22 39 6 C41 18 44 13 48 22 C55 34 52 44 58 56 C65 70 60 80 63 96 C66 116 58 132 40 136 Z"

const MT_STYLE = `
@keyframes mtFlame {
  0%   { transform: scaleY(1) scaleX(1) skewX(0deg) }
  15%  { transform: scaleY(1.08) scaleX(.94) skewX(-4deg) }
  30%  { transform: scaleY(.95) scaleX(1.05) skewX(3deg) }
  45%  { transform: scaleY(1.06) scaleX(.97) skewX(-2deg) }
  60%  { transform: scaleY(1.0) scaleX(1.0) skewX(3.5deg) }
  75%  { transform: scaleY(1.09) scaleX(.95) skewX(-3deg) }
  90%  { transform: scaleY(.97) scaleX(1.03) skewX(1.5deg) }
  100% { transform: scaleY(1) scaleX(1) skewX(0deg) }
}
@keyframes mtFlame2 {
  0%   { transform: scaleY(1) skewX(0deg); opacity:.9 }
  20%  { transform: scaleY(1.1) skewX(4deg); opacity:1 }
  43%  { transform: scaleY(.94) skewX(-3deg); opacity:.82 }
  66%  { transform: scaleY(1.07) skewX(2.5deg); opacity:.97 }
  85%  { transform: scaleY(.98) skewX(-2deg); opacity:.88 }
  100% { transform: scaleY(1) skewX(0deg); opacity:.9 }
}
@keyframes mtCore { 0%,100%{opacity:.82;transform:scaleY(1)} 25%{opacity:1;transform:scaleY(1.08)} 50%{opacity:.7;transform:scaleY(.95)} 75%{opacity:.96} }
@keyframes mtHalo { 0%,100%{opacity:.42} 28%{opacity:.66} 53%{opacity:.36} 79%{opacity:.58} }
@keyframes mtGlow { 0%,100%{opacity:.55} 50%{opacity:.85} }
@keyframes mtRise {
  0%{transform:translate(0,0);opacity:0} 16%{opacity:var(--eo,.85)}
  68%{opacity:calc(var(--eo,.85)*.65)} 100%{transform:translate(var(--drift,8px),calc(-1*var(--rise,200px)));opacity:0}
}
@keyframes mtSmoke { 0%{transform:translateY(0) scale(1);opacity:0} 22%{opacity:.12} 80%{opacity:.12} 100%{transform:translateY(-50%) scale(1.5);opacity:0} }
@keyframes mtSwayChand { 0%,100%{transform:rotate(-5deg)} 50%{transform:rotate(5deg)} }
@media (prefers-reduced-motion: reduce){ .mt-anim{ animation:none !important } }
`

function mtRgba(hex, a) { return hexToRgba(hex, a) }

function MtTorch({ id, dir, x, top, w = "13%", h = "36%", dur = 2.0, delay = "0s", tint }) {
  const mx = (v) => (dir === 1 ? v : 100 - v)
  const rot = 18 * dir
  const gOut = `mo-${id}`, gIn = `mi-${id}`, gWood = `mw-${id}`, gCore = `mc-${id}`
  const hx = mx(58), hy = 82, fbx = mx(60)
  return (
    <div style={{ position: "absolute", [dir === 1 ? "left" : "right"]: x, top, width: w, height: h }}>
      <div className="mt-anim" style={{ position: "absolute", left: "-55%", right: "-55%", top: "-20%", bottom: "26%",
        background: `radial-gradient(ellipse 44% 40% at ${dir === 1 ? 62 : 38}% 30%, ${tint(mtRgba(MT.highlight, 0.4))}, transparent 64%)`,
        animation: `mtHalo 3.2s ease-in-out ${delay} infinite` }} />
      <svg viewBox="0 0 100 240" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block", overflow: "visible" }}>
        <defs>
          {/* wood handle — dark neutral, sanctioned exception */}
          <linearGradient id={gWood} gradientUnits="userSpaceOnUse" x1="0" y1="92" x2="0" y2="200">
            <stop offset="0%" stopColor="#754a22" />
            <stop offset="55%" stopColor="#3e2510" />
            <stop offset="100%" stopColor="#1f1204" />
          </linearGradient>
          {/* outer flame — hot near-white tip (0%) is sanctioned exception; body is in-family amber/orange */}
          <linearGradient id={gOut} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ffe6b0" stopOpacity="1" />
            <stop offset="20%" stopColor={tint('#ffc24e')} stopOpacity="0.96" />
            <stop offset="46%" stopColor={tint('#f7901f')} stopOpacity="0.92" />
            <stop offset="70%" stopColor={tint('#e2620e')} stopOpacity="0.72" />
            <stop offset="88%" stopColor={tint('#bf4406')} stopOpacity="0.32" />
            <stop offset="100%" stopColor={tint('#9c3200')} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={gIn} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#fff6e0" stopOpacity="1" />
            <stop offset="38%" stopColor={tint('#ffd060')} stopOpacity="0.96" />
            <stop offset="74%" stopColor={tint('#ffa030')} stopOpacity="0.55" />
            <stop offset="100%" stopColor={tint('#ff8020')} stopOpacity="0" />
          </linearGradient>
          <radialGradient id={gCore}>
            <stop offset="0%" stopColor="#fff6e0" stopOpacity="1" />
            <stop offset="45%" stopColor={tint('#ffcf78')} stopOpacity="0.7" />
            <stop offset="100%" stopColor={tint('#ffb040')} stopOpacity="0" />
          </radialGradient>
        </defs>
        <line x1={mx(20)} y1="200" x2={mx(56)} y2="92" stroke={`url(#${gWood})`} strokeWidth="16" strokeLinecap="round" />
        <ellipse cx={mx(20)} cy="194" rx="13" ry="7.5" fill="none" stroke="#171310" strokeWidth="6" transform={`rotate(${rot} ${mx(20)} 194)`} />
        <ellipse cx={mx(8)} cy="200" rx="4" ry="12" fill="#171310" />
        <ellipse cx={hx} cy={hy} rx="13" ry="22" fill="#33200e" transform={`rotate(${rot} ${hx} ${hy})`} />
        <ellipse cx={hx} cy={hy - 8} rx="13" ry="3.6" fill="#14100b" transform={`rotate(${rot} ${hx} ${hy})`} />
        <ellipse cx={hx} cy={hy + 7} rx="13" ry="3.6" fill="#14100b" transform={`rotate(${rot} ${hx} ${hy})`} />
        <ellipse cx={hx} cy={hy - 11} rx="10" ry="7" fill={tint(mtRgba(MT.highlight, 0.32))} transform={`rotate(${rot} ${hx} ${hy})`} />
        <g transform={`translate(${fbx - 20} -4) scale(0.5)`}>
          <path className="mt-anim" d={MT_FLAME} fill={`url(#${gOut})`}
            style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: `mtFlame ${dur}s ease-in-out ${delay} infinite` }} />
          <g transform="translate(16 54.4) scale(0.6)">
            <path className="mt-anim" d={MT_FLAME} fill={`url(#${gIn})`}
              style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: `mtFlame2 ${(dur * 0.82).toFixed(2)}s ease-in-out ${delay} infinite` }} />
          </g>
        </g>
        <ellipse className="mt-anim" cx={fbx} cy="62" rx="8" ry="11" fill={`url(#${gCore})`}
          style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: `mtCore 1.5s ease-in-out ${delay} infinite` }} />
      </svg>
    </div>
  )
}

function MtChandelier({ tint }) {
  const cx = 100, cy = 6, rx = 80, ry = 54
  const cand = useMemo(() => {
    const defs = [
      { a: 90,  s: 1.12 },
      { a: 64,  s: 1.0 }, { a: 116, s: 1.0 },
      { a: 36,  s: 0.84 }, { a: 144, s: 0.84 },
    ]
    return defs.map((d, i) => {
      const r = (d.a * Math.PI) / 180
      return { x: cx + rx * Math.cos(r), y: cy + ry * Math.sin(r), s: d.s, delay: (i * 0.43).toFixed(2) }
    })
  }, [])

  const OL = "#14100a"

  const Candle = ({ x, y, s, delay }) => {
    const ch = 30 * s, cw = 12 * s, topY = y - ch
    return (
      <g>
        <ellipse cx={x} cy={topY - 3 * s} rx={12 * s} ry={15 * s} fill={tint(mtRgba(MT.highlight, 0.18))} />
        <path d={`M${x - cw * 0.85} ${y} L${x + cw * 0.85} ${y} L${x + cw * 0.55} ${y + 7 * s} L${x - cw * 0.55} ${y + 7 * s} Z`}
          fill="#1c150d" stroke={OL} strokeWidth="1.8" strokeLinejoin="round" />
        <rect x={x - cw / 2} y={topY} width={cw} height={ch} rx={cw * 0.36}
          fill="url(#mtCandleWax)" stroke={OL} strokeWidth="2" />
        <path d={`M${x - cw * 0.3} ${topY + 3} q${-cw * 0.18} ${ch * 0.32} 0 ${ch * 0.5}`} fill="none" stroke="#e9dcbf" strokeWidth={1.4 * s} strokeLinecap="round" opacity="0.7" />
        <rect x={x - 0.8} y={topY - 3} width="1.6" height="4" rx="0.8" fill="#2a1c10" />
        <ellipse className="mt-anim" cx={x} cy={topY - 6 * s} rx={3.4 * s} ry={7.4 * s} fill={tint('#ffb240')} stroke={tint('#e07614')} strokeWidth="1.3"
          style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: `mtFlame ${(2.0 + s * 0.6).toFixed(2)}s ease-in-out ${delay}s infinite` }} />
        {/* hot near-white flame tip — sanctioned exception */}
        <ellipse className="mt-anim" cx={x} cy={topY - 5 * s} rx={1.6 * s} ry={4 * s} fill="#fff2d0"
          style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: `mtFlame2 ${((2.0 + s * 0.6) * 0.82).toFixed(2)}s ease-in-out ${delay}s infinite` }} />
      </g>
    )
  }

  return (
    <div style={{ position: "absolute", left: "50%", top: "5%", width: "60%", height: "22%", transform: "translateX(-50%)" }}>
      <div className="mt-anim" style={{ position: "absolute", inset: 0, transformOrigin: "50% -30%", animation: "mtSwayChand 12s ease-in-out infinite" }}>
        <div className="mt-anim" style={{ position: "absolute", inset: "-20% -8% -60% -8%",
          background: `radial-gradient(ellipse 44% 56% at 50% 36%, ${tint(mtRgba(MT.highlight, 0.2))}, transparent 64%)`,
          animation: "mtGlow 10s ease-in-out infinite" }} />
        <svg viewBox="0 0 200 70" width="100%" height="100%" preserveAspectRatio="xMidYMin meet" style={{ display: "block" }}>
          <defs>
            <linearGradient id="mtCandleWax" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f5ecd6" />
              <stop offset="100%" stopColor="#cabd9f" />
            </linearGradient>
          </defs>
          <g stroke={OL} strokeWidth="3.6" fill="none" strokeLinecap="round" strokeDasharray="3.5 3">
            <line x1="58" y1="-4" x2="34" y2="34" />
            <line x1="142" y1="-4" x2="166" y2="34" />
          </g>
          <g stroke={OL} strokeLinecap="round" fill="none">
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} strokeWidth="9" />
            <ellipse cx={cx} cy={cy + 5} rx={rx} ry={ry} strokeWidth="4.5" opacity="0.5" />
            {Array.from({ length: 12 }, (_, i) => {
              const r = (i / 12) * Math.PI * 2
              return <line key={i} x1={cx} y1={cy} x2={cx + rx * Math.cos(r)} y2={cy + ry * Math.sin(r)} strokeWidth="2.6" opacity="0.7" />
            })}
          </g>
          {cand.sort((a, b) => a.y - b.y).map((c, i) => <Candle key={i} {...c} />)}
        </svg>
      </div>
    </div>
  )
}

function MedievalTavernAmbient({ tint }) {
  const embers = useMemo(() => {
    const make = (lo, hi) => Array.from({ length: 6 }, () => ({
      left:  (Math.random() * (hi - lo) + lo).toFixed(1) + "%",
      top:   (Math.random() * 7 + 32).toFixed(1) + "%",
      size:  (Math.random() * 2.5 + 2).toFixed(1),
      rise:  (Math.random() * 90 + 120).toFixed(0) + "px",
      drift: (Math.random() * 26 - 13).toFixed(0) + "px",
      eo:    (Math.random() * 0.2 + 0.68).toFixed(2),
      dur:   (Math.random() * 2.5 + 3.5).toFixed(1),
      delay: (-Math.random() * 6).toFixed(1),
    }))
    return [...make(6, 13), ...make(87, 94)]
  }, [])
  const smoke = useMemo(() => [
    { left: "7%",  w: "16%", dur: "14s", delay: "0s"  },
    { left: "85%", w: "15%", dur: "16s", delay: "-8s" },
  ], [])

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden",
      background: `radial-gradient(ellipse 110% 85% at 50% 104%, ${tint(MT.accent)}, ${tint(MT.bg)} 46%, ${tint(MT.bgDeep)} 80%)` }}>

      <style>{MT_STYLE}</style>

      <div className="mt-anim" style={{ position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 64% 48% at 50% 98%, ${tint(mtRgba(MT.highlight, 0.3))}, transparent 64%)`,
        animation: "mtGlow 12s ease-in-out infinite" }} />
      <div className="mt-anim" style={{ position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 120% 22% at 50% 106%, ${tint(mtRgba(MT.shiny, 0.22))}, transparent 70%)`,
        animation: "mtGlow 9s ease-in-out infinite" }} />

      {/* smoke — neutral atmospheric tone, sanctioned exception (not a hue-identity color) */}
      {smoke.map((s, i) => (
        <div key={i} className="mt-anim" style={{
          position: "absolute", bottom: "30%", left: s.left, width: s.w, height: "40%",
          background: `radial-gradient(ellipse 50% 60% at 50% 100%, ${mtRgba(MT.smoke, 0.15)}, transparent 70%)`,
          transformOrigin: "50% 100%", animation: `mtSmoke ${s.dur} ease-in-out ${s.delay} infinite`, willChange: "transform, opacity",
        }} />
      ))}

      <MtChandelier tint={tint} />

      <MtTorch id="L" dir={1}  x="2%" top="25%" dur={2.0} tint={tint} />
      <MtTorch id="R" dir={-1} x="2%" top="26%" dur={2.3} delay="-1.1s" tint={tint} />

      {embers.map((e, i) => (
        <div key={i} className="mt-anim" style={{
          position: "absolute", left: e.left, top: e.top,
          width: e.size + "px", height: e.size + "px", borderRadius: "50%",
          background: `radial-gradient(circle, ${tint(mtRgba(MT.core, 0.95))}, ${tint(mtRgba(MT.ember, 0.85))} 50%, transparent 76%)`,
          ["--rise"]: e.rise, ["--drift"]: e.drift, ["--eo"]: e.eo,
          animation: `mtRise ${e.dur}s ease-out ${e.delay}s infinite`, willChange: "transform, opacity",
        }} />
      ))}
    </div>
  )
}

// ─── 6. SUNSET BOULEVARD ─────────────────────────────────────────────────
function SunsetBoulevardAmbient({ tint }) {
  const clouds = useMemo(() => [
    { top: '8%',  w: '34%', h: '7%',  dur: '42s', delay: '-28s', hi: 0.24, color: tint('rgba(255,150,90,0.50)')  },
    { top: '14%', w: '50%', h: '12%', dur: '30s', delay: '0s',   hi: 0.40, color: tint('rgba(255,110,60,0.60)')  },
    { top: '22%', w: '42%', h: '10%', dur: '38s', delay: '-12s', hi: 0.34, color: tint('rgba(255,150,110,0.52)') },
    { top: '29%', w: '46%', h: '10%', dur: '34s', delay: '-22s', hi: 0.32, color: tint('rgba(230,120,90,0.48)')  },
  ], [tint])
  const stars = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    left: `${(i * 71 + i % 4 * 19) % 100}%`, top: `${(i * 37 + i % 3 * 11) % 14}%`,
    size: 1.1 + (i % 3) * 0.4, dur: `${5 + (i % 5) * 1.6}s`, delay: `-${((i / 6) * (5 + (i % 5) * 1.6)).toFixed(1)}s`,
  })), [])
  return <>
    <GlowLayer lo={0.46} hi={0.76} duration="22s" style={{ inset: 0,
      background: `linear-gradient(to bottom, ${tint('rgba(60,16,52,0.64)')} 0%, ${tint('rgba(176,52,54,0.48)')} 30%, ${tint('rgba(240,108,58,0.42)')} 46%, transparent 58%)` }}/>
    <GlowLayer lo={0.30} hi={0.56} duration="20s" style={{ inset: 0,
      background: `radial-gradient(ellipse 46% 42% at 9% 44%, ${tint('rgba(255,120,50,0.48)')}, transparent 64%)` }}/>
    {stars.map((s, i) => (
      <PulseDot key={i} left={s.left} top={s.top} size={s.size}
        color={tint('rgba(255,235,210,0.78)')} glowColor={tint('rgba(255,220,180,0.28)')} duration={s.dur} delay={s.delay} lo={0.10}/>
    ))}
    {clouds.map((c, i) => (
      <div key={i} aria-hidden style={{ position: 'absolute', top: c.top, left: '-6%', width: c.w, height: c.h,
        background: `radial-gradient(ellipse 52% 55% at 50% 78%, ${c.color}, transparent 74%)`,
        willChange: 'transform, opacity', '--hi': c.hi,
        animation: `ambientDriftAcross ${c.dur} ${c.delay} linear infinite`, pointerEvents: 'none' }}/>
    ))}
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `linear-gradient(to bottom, transparent 44%, ${tint('rgba(150,64,66,0.42)')} 53%, ${tint('rgba(78,38,58,0.52)')} 63%, ${tint('rgba(46,24,48,0.42)')} 71%, transparent 78%)` }}/>
    <Sun left="6%" top="33%" size="11%"
      core="rgba(255,250,228,1)" mid={tint('rgba(255,224,152,0.98)')} rim={tint('rgba(255,180,92,0.85)')}
      halo={tint('rgba(255,150,70,0.40)')} haloBlur={48} haloSpread={13}/>
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `radial-gradient(ellipse 34% 6% at 32% 74%, ${tint('rgba(255,168,96,0.30)')}, transparent 70%)`,
      willChange: 'transform, opacity', '--lo': 0.12, '--hi': 0.30, '--wx': '16px', '--wy': '-2px',
      animation: 'ambientWave 8s ease-in-out infinite' }}/>
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `linear-gradient(to bottom, transparent 70%, ${tint('rgba(216,152,110,0.34)')} 77%, transparent 85%)` }}/>
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `linear-gradient(to bottom, transparent 72%, ${tint('rgba(198,140,98,0.34)')} 80%, ${tint('rgba(165,112,74,0.70)')} 89%, ${tint('rgba(120,80,52,0.92)')} 96%, ${tint('rgba(86,58,40,0.96)')} 100%)` }}/>
    <GlowLayer lo={0.14} hi={0.32} duration="13s" delay="1s" style={{ inset: 0,
      background: `radial-gradient(ellipse 64% 18% at 30% 90%, ${tint('rgba(255,170,96,0.32)')}, transparent 70%)` }}/>
  </>
}

// ─── 7. RETRO ARCADE ──────────────────────────────────────────────────────
const RA_C = {
  bg: "#040010", bgDeep: "#020008", accent: "#3a0880",
  violet: "#a020ff", green: "#20ff80", amber: "#ffb020",
};
function raRgba(hex, a) { return hexToRgba(hex, a) }
function raShuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }

const RA_APPLE = [
  "      SS      ",
  "      SS LL   ",
  "      S  LLL  ",
  "   RRR  RRR   ",
  "  RRRRRRRRRR  ",
  " RRRRRRRRRRRR ",
  " RRHHRRRRRRRR ",
  " RRHHRRRRRRRR ",
  " RRRRRRRRRRRR ",
  " RRRRRRRRRRRR ",
  "  RRRRRRRRRR  ",
  "  RRRRRRRRRR  ",
  "   RRRRRRRR   ",
  "    RR  RR    ",
];
const RA_APPLE_COL = { R: "#28e070", H: "#c4ffda", S: "#2a1c0e", L: "#4dff86" };
const RA_APPLE_RECTS = RA_APPLE.flatMap((row, y) =>
  [...row].map((ch, x) => (ch !== " "
    ? <rect key={`${x}-${y}`} x={x} y={y} width="1.03" height="1.03" fill={RA_APPLE_COL[ch]} /> : null))
);

const RA_STYLE = `
@keyframes raPop  { 0%,100%{ opacity:0; transform:translate(-50%,-50%) scale(.65) } 50%{ opacity:var(--hi,.7); transform:translate(-50%,-50%) scale(1.05) } }
@keyframes raPopB { 0%,100%{ opacity:0; transform:translate(-50%,-50%) scale(.65) } 44%{ opacity:var(--hi,.7); transform:translate(-50%,-50%) scale(1.05) } }
@keyframes raHue  { 0%{opacity:1} 22%{opacity:1} 44%{opacity:0} 88%{opacity:0} 100%{opacity:1} }
@keyframes raBounceX { from{ transform: translateX(-46%) } to{ transform: translateX(46%) } }
@keyframes raBounceY { from{ transform: translateY(-43%) } to{ transform: translateY(43%) } }
@keyframes raStatic { 0%,9%{opacity:0} 10%{opacity:.95} 11.5%{opacity:0} 56%{opacity:0} 57%{opacity:.95} 58.5%{opacity:0} 100%{opacity:0} }
@keyframes raScan { 0%{ transform: translateY(0) } 100%{ transform: translateY(4px) } }
@keyframes raGlow { 0%,100%{ opacity:.45 } 50%{ opacity:.72 } }
@keyframes raBuzz { 0%,100%{opacity:var(--hi,1)} 3%{opacity:var(--lo,.4)} 5%{opacity:var(--hi,1)} 49%{opacity:var(--hi,1)} 51%{opacity:var(--lo,.4)} 54%{opacity:var(--hi,1)} }
@media (prefers-reduced-motion: reduce){ .ra-anim{ animation:none !important } }
`;

function RaPop({ b, tint }) {
  const layer = (color, frac) => (
    <div className="ra-anim" style={{ position: "absolute", inset: 0, borderRadius: "50%",
      background: `radial-gradient(circle at 50% 50%, ${tint(raRgba(color, b.a))}, transparent 64%)`,
      animation: `raHue ${b.hueDur}s linear ${(-b.hueDur * frac).toFixed(2)}s infinite` }} />
  );
  return (
    <div className="ra-anim" style={{ position: "absolute", left: b.left, top: b.top, width: b.size + "%", aspectRatio: "1",
      transform: "translate(-50%, -50%)", filter: `blur(${b.blur}px)`, ["--hi"]: b.hi,
      animation: `${b.kf} ${b.dur}s ease-in-out ${b.delay}s infinite`, willChange: "transform, opacity" }}>
      {layer(b.colors[0], 0)}
      {layer(b.colors[1], 1 / 3)}
      {layer(b.colors[2], 2 / 3)}
    </div>
  );
}

function RaAppleBouncer({ size = 8, tint }) {
  return (
    <div className="ra-anim" style={{ position: "absolute", inset: 0, pointerEvents: "none",
      animation: "raBounceX 6.5s linear infinite alternate", willChange: "transform" }}>
      <div className="ra-anim" style={{ position: "absolute", inset: 0,
        animation: "raBounceY 4.9s linear infinite alternate", willChange: "transform" }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", width: size + "%", aspectRatio: "1",
          transform: "translate(-50%, -50%)" }}>
          {/* drop-shadow is an atmospheric glow (in-family); the sprite's own fill palette (RA_APPLE_COL) is a
              fixed original pixel-art critter design, not theme-derived — left untouched per "no copyrighted IP /
              original critter" design law, same as Autumn Harvest's leaves don't reskin unrelated sprites */}
          <svg viewBox="0 0 14 14" width="100%" height="100%" shapeRendering="crispEdges"
            style={{ display: "block", overflow: "visible", filter: `drop-shadow(0 0 3px ${tint(raRgba(RA_C.green, 0.55))})` }}>
            {RA_APPLE_RECTS}
          </svg>
        </div>
      </div>
    </div>
  );
}

function RetroArcadeAmbient({ tint }) {
  const pops = useMemo(() => {
    const cols = 5, rows = 3, arr = [];
    const kfs = ["raPop", "raPopB"];
    const push = (left, top) => arr.push({
      kf: kfs[(Math.random() * 2) | 0],
      colors: raShuffle([RA_C.green, RA_C.violet, RA_C.amber]),
      left: left.toFixed(1) + "%", top: top.toFixed(1) + "%",
      size: (Math.random() * 18 + 8).toFixed(1),
      a: (Math.random() * 0.34 + 0.32).toFixed(2),
      hi: (Math.random() * 0.35 + 0.5).toFixed(2),
      dur: (Math.random() * 4.1 + 2.4).toFixed(2),
      delay: (-Math.random() * 9).toFixed(2),
      hueDur: (Math.random() * 4 + 3).toFixed(2),
      blur: (Math.random() * 10 + 5).toFixed(0),
    });
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        push((c + Math.random()) / cols * 100, (r + Math.random()) / rows * 100);
    return arr;
  }, []);

  const stat = useMemo(() => {
    const palette = [tint(raRgba(RA_C.violet, 0.9)), tint(raRgba(RA_C.green, 0.85)), "rgba(255,255,255,0.85)"];
    return Array.from({ length: 16 }, () => ({
      left: (Math.random() * 100).toFixed(1) + "%", top: (Math.random() * 100).toFixed(1) + "%",
      dur: (Math.random() * 6 + 3.5).toFixed(2), delay: (-Math.random() * 9).toFixed(2),
      color: palette[(Math.random() * 3) | 0],
    }));
  }, [tint]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden",
      background: `radial-gradient(ellipse 120% 90% at 50% 36%, ${tint(raRgba(RA_C.accent, 0.5))}, ${tint(RA_C.bg)} 60%, ${tint(RA_C.bgDeep)} 92%)` }}>

      <style>{RA_STYLE}</style>

      <div className="ra-anim" style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "26%",
        background: `radial-gradient(ellipse at left center, ${tint(raRgba(RA_C.violet, 0.5))}, transparent 75%)`,
        ["--lo"]: 0.24, ["--hi"]: 0.62, animation: "raBuzz 1.8s linear infinite" }} />
      <div className="ra-anim" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "26%",
        background: `radial-gradient(ellipse at right center, ${tint(raRgba(RA_C.green, 0.42))}, transparent 75%)`,
        ["--lo"]: 0.2, ["--hi"]: 0.58, animation: "raBuzz 2.2s linear .5s infinite" }} />

      <div className="ra-anim" style={{ position: "absolute", top: "18%", left: "18%", right: "18%", bottom: "18%",
        background: `radial-gradient(ellipse, ${tint(raRgba(RA_C.violet, 0.26))}, transparent 70%)`, animation: "raGlow 5s ease-in-out infinite" }} />

      {pops.map((b, i) => <RaPop key={i} b={b} tint={tint} />)}

      <RaAppleBouncer size={8} tint={tint} />

      {stat.map((p, i) => (
        <div key={i} aria-hidden className="ra-anim" style={{ position: "absolute", left: p.left, top: p.top,
          width: 2, height: 2, background: p.color, animation: `raStatic ${p.dur}s ${p.delay}s linear infinite` }} />
      ))}

      <div aria-hidden className="ra-anim" style={{ position: "absolute", inset: "-4px 0", pointerEvents: "none",
        backgroundImage: `repeating-linear-gradient(transparent 0px, transparent 2px, ${tint(raRgba(RA_C.violet, 0.11))} 2px, ${tint(raRgba(RA_C.violet, 0.11))} 4px)`,
        backgroundSize: "100% 4px", mixBlendMode: "screen", animation: "raScan 0.5s linear infinite", willChange: "transform" }} />
    </div>
  );
}

// ─── 8. SAND DUNE CHILL ───────────────────────────────────────────────────
// Theme: early-AM Lake Michigan — cool periwinkle dawn, last stars, gulls crossing
function SandDuneChillAmbient({ tint }) {
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
      background: `linear-gradient(to bottom, ${tint('rgba(108,132,182,0.50)')} 0%, ${tint('rgba(152,142,176,0.40)')} 38%, ${tint('rgba(228,182,156,0.34)')} 56%, transparent 70%)` }}/>
    <GlowLayer lo={0.24} hi={0.46} duration="22s" delay="4s" style={{ inset: 0,
      background: `radial-gradient(ellipse 44% 46% at 80% 50%, ${tint('rgba(255,205,160,0.42)')}, transparent 68%)` }}/>
    {lastStars.map((s, i) => (
      <PulseDot key={i} left={s.left} top={s.top} size={s.size} color={tint('rgba(225,232,255,0.55)')} duration={s.dur} delay={s.delay} lo={0.06}/>
    ))}
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `linear-gradient(to bottom, transparent 50%, ${tint('rgba(120,150,175,0.30)')} 60%, ${tint('rgba(64,94,124,0.46)')} 70%, ${tint('rgba(42,64,90,0.34)')} 80%, transparent 86%)` }}/>
    <Sun left="76%" top="42%" size="9%"
      core="rgba(255,251,240,0.97)" mid={tint('rgba(255,230,198,0.86)')} rim={tint('rgba(252,202,162,0.56)')}
      halo={tint('rgba(255,212,172,0.34)')} haloBlur={44} haloSpread={12} dur="12s"/>
    {gulls.map((g, i) => <Gull key={i} {...g}/>)}
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `linear-gradient(to bottom, transparent 66%, ${tint('rgba(170,136,94,0.32)')} 76%, ${tint('rgba(134,106,72,0.68)')} 86%, ${tint('rgba(94,74,50,0.90)')} 95%, ${tint('rgba(66,52,36,0.96)')} 100%)` }}/>
    <GlowLayer lo={0.10} hi={0.24} duration="14s" delay="2s" style={{ inset: 0,
      background: `radial-gradient(ellipse 52% 15% at 62% 80%, ${tint('rgba(255,212,150,0.26)')}, transparent 72%)` }}/>
  </>
}

// ─── 9. HALLOWEEN ────────────────────────────────────────────────────────
// Moonlit purple graveyard: mausoleum, headstones, cross, zombie hand, bats, fog
const HW = {
  skyTop:    "#0c0518",
  skyMid:    "#1c0d38",
  skyHorizon:"#311452",
  moon:      "#e0c0f8",
  moonGlow:  "#9a5fd0",
  fog:       "#8f7ab8",
  fogPale:   "#cdb6ea",
  ink:       "#060109",
}

const HW_STYLE = `
@keyframes hwFogR { 0%{transform:translateX(-32%);opacity:0} 15%{opacity:var(--op,.45)} 85%{opacity:var(--op,.45)} 100%{transform:translateX(32%);opacity:0} }
@keyframes hwFogL { 0%{transform:translateX(32%);opacity:0} 15%{opacity:var(--op,.45)} 85%{opacity:var(--op,.45)} 100%{transform:translateX(-32%);opacity:0} }
@keyframes hwMoon { 0%,100%{opacity:.82} 50%{opacity:1} }
@keyframes hwBatFlap { 0%,100%{transform:scaleX(1)} 50%{transform:scaleX(.62)} }
@keyframes zhTwitch { 0%,85%{transform:rotate(0deg)} 88%{transform:rotate(3.5deg)} 91%{transform:rotate(-2.5deg)} 94%{transform:rotate(1.8deg)} 97%,100%{transform:rotate(0deg)} }
@media (prefers-reduced-motion: reduce){ .hw-anim{ animation:none !important } }
`

function hwRgba(hex, a) { return hexToRgba(hex, a) }

function HwHeadstone({ left, w, h, round, bottom = "6%" }) {
  return <div style={{ position: "absolute", left, bottom, width: w, height: h, background: HW.ink, borderRadius: round }} />
}

function HwCross({ left, w, h, bottom = "6%" }) {
  return (
    <div style={{ position: "absolute", left, bottom, width: w, height: h }}>
      <div style={{ position: "absolute", left: "39%", width: "22%", height: "100%", background: HW.ink, borderRadius: "26% 26% 0 0" }} />
      <div style={{ position: "absolute", top: "20%", left: 0, width: "100%", height: "15%", background: HW.ink, borderRadius: "2px" }} />
    </div>
  )
}

function HwMausoleum({ left, w, h, bottom = "6%" }) {
  const k = HW.ink
  return (
    <div style={{ position: "absolute", left, bottom, width: w, height: h }}>
      <div style={{ position: "absolute", top: 0, left: "47%", width: "6%", height: "8%", background: k }} />
      <div style={{ position: "absolute", top: "2%", left: "43%", width: "14%", height: "3%", background: k }} />
      <div style={{ position: "absolute", top: "7%", left: "-7%", width: "114%", height: "17%", background: k, clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }} />
      <div style={{ position: "absolute", top: "23%", left: "-4%", width: "108%", height: "5%", background: k }} />
      <div style={{ position: "absolute", top: "27%", left: "7%", width: "86%", height: "57%", background: k }} />
      <div style={{ position: "absolute", top: "83%", left: "1%", width: "98%", height: "8%", background: k }} />
      <div style={{ position: "absolute", top: "91%", left: "-8%", width: "116%", height: "9%", background: k }} />
    </div>
  )
}

function HwZombieHand({ left, bottom, w, h }) {
  const k = HW.ink
  return (
    <div style={{ position: "absolute", left, bottom, width: w, height: h }}>
      <svg viewBox="0 0 200 300" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        <g fill={k} stroke={k} strokeLinecap="round" strokeLinejoin="round">
          <path d="M84 176 L90 290 L100 274 L110 292 L120 274 L128 290 L132 176 Z" />
          <g className="hw-anim" style={{ transformBox: "view-box", transformOrigin: "108px 182px", animation: "zhTwitch 8s ease-in-out infinite" }}>
            <g transform="rotate(-45 108 182)">
              <ellipse cx="108" cy="150" rx="36" ry="34" />
              <path d="M86 160 Q50 156 44 128 Q46 114 60 112" fill="none" strokeWidth="25" />
              <path d="M88 120 Q74 84 70 46 Q70 60 84 58" fill="none" strokeWidth="20" />
              <path d="M104 116 Q102 72 106 30 Q108 46 120 44" fill="none" strokeWidth="21" />
              <path d="M120 118 Q134 84 140 48 Q140 62 128 62" fill="none" strokeWidth="20" />
              <path d="M134 124 Q152 100 160 74 Q158 88 150 88" fill="none" strokeWidth="17" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  )
}

function HwBat({ id, base, size, dur, flap }) {
  return (
    <div className="hw-anim" style={{ position: "absolute", left: `${base.l}%`, top: `${base.t}%`, animation: `hwBatFly_${id} ${dur}s ease-in-out infinite`, willChange: "transform" }}>
      <svg className="hw-anim" width={size} height={size * 0.5} viewBox="0 0 24 12" style={{ display: "block", animation: `hwBatFlap ${flap}s ease-in-out infinite`, transformOrigin: "center" }}>
        <path d="M12 5 C11 2.5 8.5 2 6 3 C4 3.8 3 3 1 4 C2.5 4.4 2.8 5.6 4.2 5.8 C3 6.4 3.4 7.6 5 7.4 C7 7.2 8 6 9 7 C9.7 6 11 5.8 12 7 C13 5.8 14.3 6 15 7 C16 6 17 7.2 19 7.4 C20.6 7.6 21 6.4 19.8 5.8 C21.2 5.6 21.5 4.4 23 4 C21 3 20 3.8 18 3 C15.5 2 13 2.5 12 5 Z" fill={hwRgba(HW.ink, 0.95)} />
      </svg>
    </div>
  )
}

function HalloweenAmbient({ tint }) {
  const fog = useMemo(() => {
    const N = 8
    return Array.from({ length: N }, (_, i) => {
      const w = Math.random() * 30 + 44
      const cx = ((i + 0.5) / N) * 92 + 4 + (Math.random() * 8 - 4)
      return {
        top: (Math.random() * 36 + 7).toFixed(1) + "%",
        w: w.toFixed(0) + "%",
        left: (cx - w / 2).toFixed(1) + "%",
        op: (Math.random() * 0.16 + 0.38).toFixed(2),
        dur: (Math.random() * 26 + 46).toFixed(0),
        delay: (-Math.random() * 60).toFixed(0),
        dir: Math.random() < 0.5 ? "R" : "L",
      }
    })
  }, [])

  const bats = useMemo(() => Array.from({ length: 3 }, (_, i) => ({
    id: i,
    base: { l: +(Math.random() * 70 + 12).toFixed(1), t: +(Math.random() * 18 + 4).toFixed(1) },
    pts: Array.from({ length: 3 }, () => ({ x: +(Math.random() * 24 - 12).toFixed(1), y: +(Math.random() * 12 - 6).toFixed(1) })),
    size: Math.round(Math.random() * 10 + 14),
    dur: (Math.random() * 12 + 15).toFixed(0),
    flap: (Math.random() * 0.14 + 0.34).toFixed(2),
  })), [])

  const batKeyframes = useMemo(() => bats.map((b) => {
    const [p0, p1, p2] = b.pts
    return `@keyframes hwBatFly_${b.id}{0%{transform:translate(0,0)}25%{transform:translate(${p0.x}vw,${p0.y}vh)}50%{transform:translate(${p1.x}vw,${p1.y}vh)}75%{transform:translate(${p2.x}vw,${p2.y}vh)}100%{transform:translate(0,0)}}`
  }).join("\n"), [bats])

  return (
    <>
      <style>{HW_STYLE}{batKeyframes}</style>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: `linear-gradient(to bottom, ${tint(HW.skyTop)} 18%, ${tint(HW.skyMid)} 56%, ${tint(HW.skyHorizon)} 90%)` }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 46% 50% at 82% 16%, ${tint(hwRgba(HW.moonGlow, 0.4))}, transparent 60%)` }} />
        {/* dark ground silhouette — ink is a sanctioned dark-silhouette exception, left untinted */}
        <div style={{ position: "absolute", left: "-6%", right: "-6%", bottom: 0, height: "15%", background: `linear-gradient(to top, ${HW.ink}, ${HW.ink} 90%, transparent)`, borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />
        {/* headstones / mausoleum / cross / zombie hand all hardcode HW.ink internally — dark silhouettes, sanctioned exception */}
        <HwMausoleum left="3%" w="8.5%" h="23%" bottom="6%" />
        <HwHeadstone left="24%" w="4.4%" h="12.5%" bottom="11%" round="50% 50% 6% 6% / 38% 38% 6% 6%" />
        <HwHeadstone left="34%" w="3.4%" h="10.5%" bottom="12%" round="52% 52% 6% 6% / 40% 40% 6% 6%" />
        <HwCross left="46%" w="5%" h="15.5%" bottom="11%" />
        <HwZombieHand left="67%" bottom="12.5%" w="6%" h="15%" />
        <HwHeadstone left="79%" w="4.4%" h="13%" bottom="10%" round="50% 50% 6% 6% / 38% 38% 6% 6%" />
        <div className="hw-anim" style={{ position: "absolute", inset: 0, background: `radial-gradient(circle 6.5% at 82% 16%, ${tint(hwRgba(HW.moon, 1))} 0%, ${tint(hwRgba(HW.moon, 0.95))} 42%, ${tint(hwRgba(HW.moonGlow, 0.5))} 56%, transparent 70%)`, animation: "hwMoon 9s ease-in-out infinite" }} />
        {/* bats are drawn with HW.ink — dark silhouette drifters, sanctioned exception */}
        {bats.map((b) => <HwBat key={b.id} {...b} />)}
        {fog.map((f, i) => (
          <div key={i} className="hw-anim" style={{ position: "absolute", top: f.top, left: f.left, width: f.w, height: `calc(${f.w} * 0.26)`, ["--op"]: f.op, background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${tint(hwRgba(HW.fogPale, 0.7))}, ${tint(hwRgba(HW.fog, 0.24))} 46%, transparent 72%)`, animation: `${f.dir === "R" ? "hwFogR" : "hwFogL"} ${f.dur}s ease-in-out ${f.delay}s infinite`, willChange: "transform, opacity" }} />
        ))}
      </div>
    </>
  )
}

// ─── 10. JAZZ CLUB ───────────────────────────────────────────────────────
// accent #4a2808 = rgba(74,40,8), highlight #d4820c = rgba(212,130,12)
// bg #080608, bgDeep #040404
// v3 (2026-07-02 port from jazz-club.html): real stage platform, browner
// backdrop, 3 sweeping warm-white spotlights replace the old rotating cones.
const JC2_STYLE = `
@keyframes jcSweep { 0%,100% { transform: rotate(var(--a1,-6deg)); } 50% { transform: rotate(var(--a2,6deg)); } }
@keyframes jcDrift {
  0%   { transform: translate(0,0); opacity: 0; }
  10%  { opacity: .9; }
  88%  { opacity: .65; }
  100% { transform: translate(var(--tx,0), var(--ty,-8vh)); opacity: 0; }
}
@media (prefers-reduced-motion: reduce){ .jc2-anim{ animation:none !important } }
`

const JC_FOLDS = [
  { left: '10vw', top: '-6vh',  fx: '1.4vw',  dur: '17s', delay: '0s' },
  { left: '42vw', top: '-12vh', fx: '-1.1vw', dur: '13s', delay: '-6s' },
  { left: '72vw', top: '-6vh',  fx: '1.2vw',  dur: '21s', delay: '-11s' },
]

const JC_BEAMS = [
  { left: '8vw',    width: '20vw', a1: '-6deg', a2: '6deg',  sweepDur: '11s', sweepDelay: '0s',  breatheDur: '8s',  breatheDelay: '0s',  cone: [0.26, 0.10], pool: 1 },
  { left: '41.5vw', width: '17vw', a1: '4deg',  a2: '-4deg', sweepDur: '14s', sweepDelay: '-5s', breatheDur: '12s', breatheDelay: '-3s', cone: [0.16, 0.06], pool: 0.9 },
  { left: '72vw',   width: '20vw', a1: '-6deg', a2: '6deg',  sweepDur: '9.5s', sweepDelay: '-3s', breatheDur: '10s', breatheDelay: '-1s', cone: [0.24, 0.09], pool: 1 },
]

// ANCHOR — 3 sweeping warm-white spotlights: paired with the backdrop wash
// below as this theme's two documented off-family colors. Warm-white here is
// the sanctioned near-white exception, left literal. Pool is a CHILD of its
// beam (not a sibling) so sweep and pool sync is guaranteed by construction.
function JcBeam({ left, width, a1, a2, sweepDur, sweepDelay, breatheDur, breatheDelay, cone, pool }) {
  return (
    <div aria-hidden className="jc2-anim" style={{
      position: 'absolute', top: '-6vh', left, width, height: '95vh',
      filter: 'blur(14px)', transformOrigin: '50% 0', pointerEvents: 'none',
      willChange: 'transform,opacity',
      '--a1': a1, '--a2': a2, '--lo': 0.55, '--hi': 0.85,
      animation: `jcSweep ${sweepDur} ease-in-out ${sweepDelay} infinite, ambientBreathe ${breatheDur} ease-in-out ${breatheDelay} infinite`,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        clipPath: 'polygon(40% 0, 60% 0, 100% 100%, 0 100%)',
        background: `linear-gradient(180deg, rgba(255,246,230,${cone[0]}) 0%, rgba(255,246,230,${cone[1]}) 55%, rgba(255,246,230,0) 96%)`,
      }}/>
      <div style={{
        position: 'absolute', left: '50%', top: '-1vh', width: '4vw', height: '4vw',
        transform: 'translateX(-50%)', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,250,238,.9) 0%, rgba(255,243,220,.3) 40%, rgba(255,243,220,0) 70%)',
      }}/>
      <div style={{
        position: 'absolute', left: '50%', bottom: '-3vh', transform: 'translateX(-50%)',
        width: '80%', height: '7.5vh', borderRadius: '50%', opacity: pool,
        background: 'radial-gradient(ellipse, rgba(255,246,228,.62) 0%, rgba(255,243,220,.20) 45%, rgba(255,243,220,0) 70%)',
      }}/>
    </div>
  )
}

// PER-CYCLE RE-ROLL (rollMeteorShower precedent, artifact JS is the direct
// reference): smoke/motes mutate their own DOM node on 'animationiteration'
// instead of triggering a React re-render — jcDrift holds opacity at 0 at
// both loop ends, so the jump is invisible. Reduced-motion gates the reroll
// itself (mirrors rollIceGlint/rollAuroraSweepBand above), not just the CSS.
function rollJcSmoke(side) {
  const xMin = side === 0 ? 2 : 80
  const xMax = side === 0 ? 18 : 94
  const driftX = side === 0 ? 2.5 : -2
  return {
    left: `${(xMin + Math.random() * (xMax - xMin)).toFixed(2)}vw`,
    top: `${(55 + Math.random() * 26).toFixed(2)}vh`,
    ty: `${-(2.5 + Math.random() * 8.5).toFixed(2)}vh`,
    tx: `${(driftX * (0.8 + Math.random()) + Math.random() * 3).toFixed(2)}vw`,
  }
}

function JcSmoke({ side, initialDelay }) {
  const elRef = useRef(null)
  const size = useMemo(() => 2.8 + Math.random() * 4, [])
  const dur = useMemo(() => `${(18 + Math.random() * 12).toFixed(2)}s`, [])
  const initial = useMemo(() => rollJcSmoke(side), [side])

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const reroll = () => {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const r = rollJcSmoke(side)
      el.style.left = r.left
      el.style.top = r.top
      el.style.setProperty('--ty', r.ty)
      el.style.setProperty('--tx', r.tx)
    }
    el.addEventListener('animationiteration', reroll)
    return () => el.removeEventListener('animationiteration', reroll)
  }, [side])

  return (
    <div ref={elRef} aria-hidden className="jc2-anim" style={{
      position: 'absolute', left: initial.left, top: initial.top,
      width: `${size}vw`, height: `${size * 0.8}vw`, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(235,210,175,.34) 0%, rgba(235,210,175,0) 70%)',
      filter: 'blur(6px)', pointerEvents: 'none', willChange: 'transform,opacity',
      '--ty': initial.ty, '--tx': initial.tx,
      animation: `jcDrift ${dur} linear ${initialDelay} infinite`,
    }}/>
  )
}

const JC_MOTE_ZONES = [[8, 24], [44, 56], [72, 88]]
function rollJcMote() {
  const z = JC_MOTE_ZONES[Math.floor(Math.random() * 3)]
  return {
    left: `${(z[0] + Math.random() * (z[1] - z[0])).toFixed(2)}vw`,
    top: `${(16 + Math.random() * 58).toFixed(2)}vh`,
    ty: `${-(0.8 + Math.random() * 1.4).toFixed(2)}vh`,
    tx: `${((Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 1.5)).toFixed(2)}vw`,
  }
}

function JcMote({ initialDelay }) {
  const elRef = useRef(null)
  const size = useMemo(() => 1.8 + Math.random() * 1.8, [])
  const dur = useMemo(() => `${(6 + Math.random() * 5).toFixed(2)}s`, [])
  const initial = useMemo(() => rollJcMote(), [])

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const reroll = () => {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const r = rollJcMote()
      el.style.left = r.left
      el.style.top = r.top
      el.style.setProperty('--ty', r.ty)
      el.style.setProperty('--tx', r.tx)
    }
    el.addEventListener('animationiteration', reroll)
    return () => el.removeEventListener('animationiteration', reroll)
  }, [])

  return (
    <div ref={elRef} aria-hidden className="jc2-anim" style={{
      position: 'absolute', left: initial.left, top: initial.top,
      width: `${size}px`, height: `${size}px`, borderRadius: '50%',
      background: 'rgba(238,217,176,.7)', pointerEvents: 'none', willChange: 'transform,opacity',
      '--ty': initial.ty, '--tx': initial.tx,
      animation: `jcDrift ${dur} linear ${initialDelay} infinite`,
    }}/>
  )
}

function JcGlint({ tint }) {
  const durRef   = useRef(`${(4.5 + Math.random() * 3).toFixed(1)}s`)
  const delayRef = useRef(`${(Math.random() * 6).toFixed(1)}s`)
  const [pos, setPos] = useState(() => ({
    left: `${(3 + Math.random() * 94).toFixed(1)}%`,
    top:  `${(4 + Math.random() * 88).toFixed(1)}%`,
    size: `${(3 + Math.random() * 3).toFixed(1)}px`,
    gop:  (0.6 + Math.random() * 0.3).toFixed(2),
  }))
  const reroll = useCallback(() => setPos({
    left: `${(3 + Math.random() * 94).toFixed(1)}%`,
    top:  `${(4 + Math.random() * 88).toFixed(1)}%`,
    size: `${(3 + Math.random() * 3).toFixed(1)}px`,
    gop:  (0.6 + Math.random() * 0.3).toFixed(2),
  }), [])
  return (
    <div aria-hidden className="jc-anim" onAnimationIteration={reroll} style={{
      position: 'absolute', left: pos.left, top: pos.top, pointerEvents: 'none',
      width: pos.size, height: pos.size, borderRadius: '50%', willChange: 'opacity',
      background: `radial-gradient(circle, ${tint('rgba(255,245,235,0.95)')}, ${tint('rgba(255,245,235,0.5)')} 40%, transparent 72%)`,
      '--gop': pos.gop,
      animation: `jcGlintPop ${durRef.current} ease-in-out ${delayRef.current} infinite`,
    }}/>
  )
}

function JazzClubAmbient({ tint }) {
  const smokeSides = useMemo(() => [0, 0, 0, 0, 1, 1, 1], [])
  const smokeDelays = useMemo(() => smokeSides.map(() => `${-(Math.random() * 24).toFixed(2)}s`), [smokeSides])
  const moteDelays = useMemo(() => Array.from({ length: 18 }, () => `${-(Math.random() * 11).toFixed(2)}s`), [])

  return <>
    <style>{JC2_STYLE}</style>
    {/* Base: deep stage red-brown — an intentional off-family curtain/backdrop wash, not derived
        from accent/highlight (hue ~15 vs theme's amber ~30); left literal, sanctioned atmospheric
        exception. Browner cut (#3a1408 -> #1e0b04 -> #0c0502) approved by Ben 2026-07-02, replacing
        the original redder values — still the same documented exception, just a browner cut of it. */}
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'radial-gradient(ellipse at 50% 36%, #3a1408 0%, #1e0b04 62%, #0c0502 100%)',
    }}/>
    {/* Curtain fold shadows + stage platform: same off-family brown wash as the backdrop above,
        left literal — not derived from accent/highlight. */}
    {JC_FOLDS.map((f, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', top: f.top, bottom: '16vh', left: f.left, width: '26vw',
        filter: 'blur(30px)', pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(8,3,1,.45) 0%, rgba(8,3,1,0) 70%)',
        willChange: 'transform',
        '--fx': f.fx,
        animation: `ambientFloatX ${f.dur} ease-in-out ${f.delay} infinite`,
      }}/>
    ))}
    <div aria-hidden style={{
      position: 'absolute', left: 0, right: 0, bottom: '16vh', height: '9vh', pointerEvents: 'none',
      background: 'linear-gradient(180deg, rgba(6,2,1,0), rgba(6,2,1,.6))',
    }}/>
    <div aria-hidden style={{
      position: 'absolute', left: 0, right: 0, bottom: '11vh', height: '6vh', pointerEvents: 'none',
      background: 'linear-gradient(180deg, #43270f 0%, #2e1808 60%, #1e0e04 100%)',
      borderTop: '.4vh solid rgba(122,83,38,.55)',
    }}/>
    <div aria-hidden style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, height: '11.2vh', pointerEvents: 'none',
      background: 'linear-gradient(180deg, #241203 0%, #150902 60%, #0a0401 100%)',
    }}/>
    {/* Beams paint OVER the stage so the cones visibly land on it */}
    {JC_BEAMS.map((b, i) => <JcBeam key={i} {...b} />)}
    {/* Amber glints — brass, tinted via theme highlight */}
    <JcGlint tint={tint}/><JcGlint tint={tint}/><JcGlint tint={tint}/><JcGlint tint={tint}/><JcGlint tint={tint}/>
    <JcGlint tint={tint}/><JcGlint tint={tint}/><JcGlint tint={tint}/><JcGlint tint={tint}/>
    {/* Smoke + dust motes — per-cycle re-roll */}
    {smokeSides.map((side, i) => <JcSmoke key={i} side={side} initialDelay={smokeDelays[i]} />)}
    {moteDelays.map((d, i) => <JcMote key={i} initialDelay={d} />)}
  </>
}


// ─── 12. DIVE BAR ────────────────────────────────────────────────────────
const DB = {
  bg:      '#0c0008',
  body:    '#2e1a28',
  pillar:  '#3a2200',
  strip:   '#ff9040',
  red:     '#3d0e18',
  gold:    '#2a1c00',
  ctrl:    '#1a1e22',
  base:    '#1a1e20',
  panel:   '#1a1430',
  signRed: '#ff2040',
  signBlu: '#3a78ff',
  floor:   '#dd6015',
}

const dbRgba = (hex, a) => {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${a})`
}

const DB_STYLE = `
  @keyframes dbDomeCycle {
    0%   { fill:#2244cc; }
    20%  { fill:#cc1840; }
    40%  { fill:#18aa44; }
    60%  { fill:#9918cc; }
    80%  { fill:#cc7818; }
    100% { fill:#2244cc; }
  }
  @keyframes dbStripPulse {
    0%,100% { opacity:0.75; }
    50%     { opacity:1; }
  }
  @keyframes dbFloat {
    0%,100% { transform:rotate(-8deg) translateY(0px); }
    50%     { transform:rotate(-8deg) translateY(-3px); }
  }
  @keyframes dbFloorPulse {
    0%,100% { opacity:0.35; }
    50%     { opacity:0.65; }
  }
  @keyframes dbRadiate {
    0%,100% { opacity:0.4; transform:scale(1); }
    50%     { opacity:0.72; transform:scale(1.1); }
  }
  @keyframes dbSignBuzz {
    0%,93%,97%,100% { opacity:1; }
    95% { opacity:0.35; }
  }
  @keyframes dbFlicker {
    0%,9%,13%,17%,100% { opacity:1; }
    11% { opacity:0; }
    15% { opacity:0.3; }
  }
  @keyframes dbCornerPulse {
    0%,100% { opacity:0.7; }
    50%     { opacity:1; }
  }
  .db-anim * { animation-play-state:running; }
  @media (prefers-reduced-motion:reduce) { .db-anim * { animation:none !important; } }
`

function DbSign({ tint }) {
  // signRed == theme highlight exactly — tinted. signBlu is an intentional contrasting
  // neon-tube color (blue border/glow on a red-lettered sign, a deliberate two-tone design
  // feature, not derived from accent/highlight) — left literal, same call as Jazz Club's
  // off-family stage-red base.
  return (
    <div style={{ position:'absolute', top:'6%', left:'4%', transform:'rotate(-3deg)' }}>
      <div style={{
        position:'absolute', inset:-24,
        background:`radial-gradient(ellipse at 30% 40%, ${dbRgba(DB.signBlu,0.2)} 0%, ${tint(dbRgba(DB.signRed,0.08))} 55%, transparent 70%)`,
        animation:'dbCornerPulse 3.4s ease-in-out infinite',
        pointerEvents:'none',
      }}/>
      <div style={{
        border:`3px solid ${DB.signBlu}`,
        boxShadow:`0 0 8px ${DB.signBlu}, 0 0 22px ${dbRgba(DB.signBlu,0.4)}`,
        padding:'8px 14px',
        background:'rgba(0,0,15,0.75)',
        animation:'dbSignBuzz 13s ease-in-out infinite',
        display:'flex', gap:6, alignItems:'center',
      }}>
        {[
          {ch:'O',dur:22,dl:-7},
          {ch:'P',dur:26,dl:-14},
          {ch:'E',dur:19,dl:-3},
          {ch:'N',dur:9, dl:-2},
        ].map(({ch,dur,dl}) => (
          <span key={ch} style={{
            fontFamily:'monospace', fontSize:28, fontWeight:900,
            color:tint(DB.signRed),
            textShadow:`0 0 6px ${tint(DB.signRed)}, 0 0 16px ${tint(DB.signRed)}`,
            animation:ch==='N' ? `dbFlicker ${dur}s step-start ${dl}s infinite` : 'none',
          }}>{ch}</span>
        ))}
      </div>
    </div>
  )
}

function DbJukebox() {
  return (
    <div style={{
      position:'absolute', bottom:'-14%', right:'-5%', width:'24%',
      animation:'dbFloat 6.7s ease-in-out infinite',
    }}>
      {/* dome color-matched radiate glow */}
      <div style={{
        position:'absolute', top:'2%', left:'-25%', right:'-25%', height:'50%',
        background:'radial-gradient(ellipse at 50% 35%, rgba(26,42,128,0.55) 0%, rgba(26,42,128,0.15) 55%, transparent 75%)',
        animation:'dbRadiate 4.1s ease-in-out -1.2s infinite',
        filter:'blur(16px)', pointerEvents:'none',
      }}/>
      {/* floor glow directly under — part of DbJukebox's own self-contained palette
          (like its dome/body colors above), not accent/highlight-derived, left literal */}
      <div style={{
        position:'absolute', bottom:'-10%', left:'-25%', right:'-25%', height:'18%',
        background:`radial-gradient(ellipse, ${dbRgba(DB.floor,0.65)} 0%, transparent 70%)`,
        animation:'dbFloorPulse 4.3s ease-in-out infinite',
        filter:'blur(14px)', pointerEvents:'none',
      }}/>
      {/* color spill spreading left across the floor */}
      <div style={{
        position:'absolute', bottom:'-8%', right:'55%', left:'-140%', height:'10%',
        background:`linear-gradient(to left, ${dbRgba(DB.floor,0.35)}, transparent)`,
        animation:'dbFloorPulse 5.7s ease-in-out -2s infinite',
        filter:'blur(10px)', pointerEvents:'none',
      }}/>

      <svg viewBox="0 0 511.988 511.988" xmlns="http://www.w3.org/2000/svg" style={{display:'block',width:'100%'}}>
        <path fill={DB.body} d="M437.319,469.332H74.656c-5.891,0-10.656-4.781-10.656-10.687v-266.65c0-51.287,19.969-99.497,56.233-135.762C156.482,19.969,204.7,0,255.995,0c51.28,0,99.498,19.969,135.747,56.233c36.265,36.265,56.248,84.475,56.248,135.762v266.65C447.99,464.551,443.209,469.332,437.319,469.332z"/>
        <rect fill={DB.pillar} x="63.995"  y="202.654" width="63.999" height="85.33"/>
        <rect fill={DB.pillar} x="383.995" y="202.654" width="63.998" height="85.33"/>
        <path fill={DB.gold}   d="M255.995,0c-20.39,0-40.265,3.164-59.123,9.234l43.108,70.1l34.374-3.836l40.749-66.264C296.244,3.164,276.37,0,255.995,0z"/>
        <path fill={DB.red}    d="M127.999,490.644h255.993V191.995c0-34.187-13.328-66.334-37.499-90.505c-24.171-24.18-56.311-37.491-90.498-37.491c-34.202,0-66.342,13.312-90.513,37.491c-24.172,24.171-37.483,56.318-37.483,90.505V490.644z"/>
        <path fill={DB.gold}   d="M255.995,0c-3.578,0-7.141,0.102-10.671,0.297v31.702c0,5.891,4.765,10.664,10.671,10.664c5.892,0,10.656-4.773,10.656-10.664V0.297C263.121,0.101,259.558,0,255.995,0z"/>
        <path fill={DB.gold}   d="M255.995,469.332c-5.906,0-10.671-4.781-10.671-10.687v-21.311c0-5.906,4.765-10.688,10.671-10.688c5.892,0,10.656,4.781,10.656,10.688v21.312C266.651,464.551,261.887,469.332,255.995,469.332z"/>
        <path fill={DB.ctrl}   d="M191.997,181.332c0,5.891-4.781,10.663-10.672,10.663s-10.672-4.772-10.672-10.663s4.781-10.672,10.672-10.672S191.997,175.441,191.997,181.332z"/>
        <path fill={DB.ctrl}   d="M191.997,213.331c0,5.891-4.781,10.664-10.672,10.664s-10.672-4.773-10.672-10.664s4.781-10.672,10.672-10.672S191.997,207.44,191.997,213.331z"/>
        <path fill={DB.ctrl}   d="M234.652,223.995h-31.999c-5.891,0-10.656-4.773-10.656-10.664s4.766-10.672,10.656-10.672h31.999c5.891,0,10.672,4.781,10.672,10.672S240.543,223.995,234.652,223.995z"/>
        <path fill={DB.ctrl}   d="M234.652,191.995h-31.999c-5.891,0-10.656-4.772-10.656-10.663s4.766-10.672,10.656-10.672h31.999c5.891,0,10.672,4.781,10.672,10.672S240.543,191.995,234.652,191.995z"/>
        <path fill={DB.ctrl}   d="M287.994,181.332c0,5.891-4.78,10.663-10.671,10.663s-10.672-4.772-10.672-10.663s4.781-10.672,10.672-10.672S287.994,175.441,287.994,181.332z"/>
        <path fill={DB.ctrl}   d="M287.994,213.331c0,5.891-4.78,10.664-10.671,10.664s-10.672-4.773-10.672-10.664s4.781-10.672,10.672-10.672S287.994,207.44,287.994,213.331z"/>
        <path fill={DB.ctrl}   d="M330.65,223.995h-32c-5.891,0-10.656-4.773-10.656-10.664s4.766-10.672,10.656-10.672h32c5.891,0,10.672,4.781,10.672,10.672S336.541,223.995,330.65,223.995z"/>
        <path fill={DB.ctrl}   d="M330.65,191.995h-32c-5.891,0-10.656-4.772-10.656-10.663s4.766-10.672,10.656-10.672h32c5.891,0,10.672,4.781,10.672,10.672S336.541,191.995,330.65,191.995z"/>
        <path fill={DB.ctrl}   d="M170.653,458.645h-21.327c-5.891,0-10.672-4.766-10.672-10.656s4.781-10.655,10.672-10.655h21.327c5.891,0,10.672,4.765,10.672,10.655S176.544,458.645,170.653,458.645z"/>
        {/* dome — color cycles through jukebox colors */}
        <path style={{animation:'dbDomeCycle 16s linear infinite'}} d="M135.248,149.333h241.479c-6.266-17.797-16.499-34.109-30.233-47.843c-24.172-24.18-56.312-37.491-90.499-37.491c-34.202,0-66.342,13.312-90.513,37.491C151.748,115.223,141.514,131.536,135.248,149.333z"/>
        <path fill={DB.ctrl}   d="M255.901,95.998c-29.452,0-53.326,23.874-53.326,53.335h106.653C309.228,119.872,285.354,95.998,255.901,95.998z"/>
        {/* center ring — offset phase */}
        <path style={{animation:'dbDomeCycle 16s linear -5s infinite'}} d="M255.995,127.997c-11.796,0-21.343,9.555-21.343,21.336h42.671C277.323,137.552,267.776,127.997,255.995,127.997z"/>
        <polygon fill={DB.panel} points="324.307,245.33 181.325,241.83 177.325,382.209 202.653,418.99 234.652,437.334 277.323,437.334 309.228,415.99 330.65,373.335"/>
        <path fill={DB.base} d="M64,405.334v95.998c0,5.875,4.766,10.656,10.656,10.656h42.671c5.891,0,10.672-4.781,10.672-10.656v-95.998H64z"/>
        <path fill={DB.base} d="M383.992,405.334v95.998c0,5.875,4.766,10.656,10.656,10.656h42.671c5.89,0,10.671-4.781,10.671-10.656v-95.998H383.992z"/>
        {/* amber light strips — left pillar */}
        <rect style={{fill:DB.strip,animation:'dbStripPulse 2.9s ease-in-out 0s infinite'}}     x="63.995"  y="277.334" width="63.999" height="21.312"/>
        <rect style={{fill:DB.strip,animation:'dbStripPulse 2.9s ease-in-out -1s infinite'}}    x="63.995"  y="234.654" width="63.999" height="21.336"/>
        <rect style={{fill:DB.strip,animation:'dbStripPulse 2.9s ease-in-out -1.9s infinite'}}  x="63.995"  y="191.994" width="63.999" height="21.336"/>
        {/* amber light strips — right pillar */}
        <rect style={{fill:DB.strip,animation:'dbStripPulse 2.9s ease-in-out -0.5s infinite'}}  x="383.995" y="277.334" width="63.998" height="21.312"/>
        <rect style={{fill:DB.strip,animation:'dbStripPulse 2.9s ease-in-out -1.5s infinite'}}  x="383.995" y="234.654" width="63.998" height="21.336"/>
        <rect style={{fill:DB.strip,animation:'dbStripPulse 2.9s ease-in-out -2.3s infinite'}}  x="383.995" y="191.994" width="63.998" height="21.336"/>
        {/* display panel detail — offset color cycle */}
        <path style={{animation:'dbDomeCycle 16s linear -8s infinite',opacity:0.45}} d="M330.65,234.658H181.325c-5.891,0-10.672,4.781-10.672,10.672v117.317c0,47.062,38.28,85.342,85.342,85.342c47.046,0,85.327-38.28,85.327-85.342V245.33C341.322,239.439,336.541,234.658,330.65,234.658z M319.947,364.632l-11.484-11.499l11.531-11.516v21.03C319.994,363.319,319.978,363.975,319.947,364.632z M197.716,389.115l20.89-20.905l22.297,22.312l-23.312,23.312C209.058,407.412,202.184,398.928,197.716,389.115z M191.997,362.647v-21.03l11.516,11.516l-11.484,11.499C191.997,363.975,191.997,363.319,191.997,362.647z M233.683,278.368l22.312-22.312l22.297,22.312l-22.297,22.297L233.683,278.368z M240.902,315.742l-22.297,22.312l-22.312-22.312l22.312-22.296L240.902,315.742z M286.103,255.994h14.547l-7.281,7.281L286.103,255.994z M218.605,263.275l-7.281-7.281h14.562L218.605,263.275z M203.513,278.368l-11.516,11.516V266.83L203.513,278.368z M233.683,353.133l22.312-22.297l22.297,22.297l-22.297,22.296L233.683,353.133z M271.073,315.742l22.296-22.296l22.312,22.296l-22.312,22.312L271.073,315.742z M308.463,278.368l11.531-11.538v23.054L308.463,278.368z M237.621,423.959l18.374-18.344l18.359,18.344c-5.828,1.75-11.983,2.688-18.359,2.688C249.604,426.646,243.449,425.709,237.621,423.959z M294.385,413.834l-23.312-23.312l22.296-22.312l20.891,20.905C309.791,398.928,302.916,407.412,294.385,413.834z"/>
      </svg>
    </div>
  )
}

function DiveBarAmbient({ tint }) {
  return (
    <div className="db-anim" style={{
      position:'absolute', inset:0, overflow:'hidden',
      background:`radial-gradient(ellipse at 15% 80%, ${tint('rgba(26,6,10,0.9)')} 0%, ${tint(DB.bg)} 55%)`,
    }}>
      <style>{DB_STYLE}</style>
      <DbSign tint={tint} />
      {/* DbJukebox is a self-contained decorative object with its own internal multi-color
          dome-cycle identity (blue/red/green/purple/orange) plus wood/metal/glass body tones and
          an amber strip/floor-glow palette — none of it is derived from accent/highlight, so it's
          left entirely untinted, analogous to Retro Arcade's apple critter */}
      <DbJukebox />
      {/* ambient floor warmth — continuation of the jukebox's own amber floor spill, not
          theme-derived, left untinted */}
      <div aria-hidden style={{
        position:'absolute', bottom:0, left:0, right:0, height:'18%',
        background:'linear-gradient(to top, rgba(140,50,10,0.28), transparent)',
        animation:'dbFloorPulse 7s ease-in-out -3s infinite',
        pointerEvents:'none',
      }}/>
    </div>
  )
}

// ─── 13. SONORA BALLOONS ─────────────────────────────────────────────────
// v9 port (2026-07-03), renamed from "Rooftop Party" per Ben — the design had
// moved on from a city-rooftop concept to a hot-air-balloon sunset scene, so
// the theme itself (id + name + palette in themes/index.js) was renamed to
// match what it actually became, rather than keeping the old city-rooftop id.
const SB_STYLE = `
@keyframes sbGoreSlide { to { transform: translateX(calc(-1 * var(--rep, 120px))); } }
@keyframes sbBalloonDrift { from { transform: translate(0, 0); } to { transform: translate(var(--dx,50vw), var(--dy,0)); } }
@keyframes sbSway { 0%,100% { transform: rotate(-2.4deg); } 50% { transform: rotate(2.4deg); } }
@keyframes sbWave {
  0%,100% { transform: translateX(-3.6vw) scaleY(.74); opacity: .34; }
  50%     { transform: translateX(3.6vw)  scaleY(1.22); opacity: .62; }
}
@keyframes sbDrift {
  0%   { transform: translate(0,0); opacity: 0; }
  10%  { opacity: .9; }
  88%  { opacity: .6; }
  100% { transform: translate(var(--tx,0), var(--ty,-6vh)); opacity: 0; }
}
@media (prefers-reduced-motion: reduce){ .sb-anim{ animation:none !important } }
`

const SB_STRIPE_W = 20
const SB_PALETTES = {
  RAINBOW: ['#e04028', '#ff8830', '#ffd028', '#38b048', '#3080e0', '#9038e0'],
  SUNSET:  ['#c81f4a', '#ff7a30', '#ffb040', '#e05028'],
  OCEAN:   ['#38b0a0', '#3080e0', '#5060d0', '#8040c8'],
  BERRY:   ['#d84090', '#8c3068', '#ff6090', '#c05480'],
  FOREST:  ['#c86028', '#d8a838', '#6b8020', '#3d5c2a'],
}
// idx, cols, goreDur, sizeVw, cy, sx, ex, dy, dur, swayDur — 5 lanes with
// >5vh y-gaps so no two balloons can ever occupy the same neighborhood.
const SB_BALLOONS = [
  { idx: 0, cols: SB_PALETTES.RAINBOW, goreDur: 15, sizeVw: 4.97, cy: 10, sx: 8,  ex: 78, dy: 1.4,  dur: 62, swayDur: 8.0 },
  { idx: 1, cols: SB_PALETTES.SUNSET,  goreDur: 11, sizeVw: 4.19, cy: 22, sx: 82, ex: 14, dy: -1.6, dur: 72, swayDur: 6.5 },
  { idx: 2, cols: SB_PALETTES.OCEAN,   goreDur: 13, sizeVw: 4.41, cy: 34, sx: 20, ex: 88, dy: 1.2,  dur: 55, swayDur: 9.0 },
  { idx: 3, cols: SB_PALETTES.BERRY,   goreDur: 12, sizeVw: 3.97, cy: 46, sx: 78, ex: 8,  dy: -1.8, dur: 68, swayDur: 7.0 },
  { idx: 4, cols: SB_PALETTES.FOREST,  goreDur: 14, sizeVw: 3.75, cy: 58, sx: 6,  ex: 92, dy: 1.0,  dur: 80, swayDur: 7.5 },
]
const SB_WAVES = [
  { bottom: '10vh',  dur: '13s', delay: '-2s' },
  { bottom: '7vh',   dur: '17s', delay: '-8s' },
  { bottom: '4vh',   dur: '15s', delay: '-5s' },
  { bottom: '1.5vh', dur: '19s', delay: '-11s' },
]

// ANCHOR — 5 hot-air balloons. Each balloon's 4-color stripe set is a fixed,
// deliberately varied off-family palette (not derived from accent/highlight) —
// same sanctioned-exception treatment as Christmas Eve's garland green / Dive
// Bar's jukebox dome colors. Only the balloon's warm envelope wash + highlight
// (in-family with accent/highlight) are tinted; stripe colors, shading
// gradient, outline, and basket rigging stay literal dark/neutral structure.
// No re-roll, no CSS-var mutation: each balloon has a fixed start/end and
// animation-direction:alternate for a smooth pendulum — only the one-time
// speed jitter (+/-18%) and phase delay are randomized, at mount.
function SbBalloon({ idx, cols, goreDur, sizeVw, cy, sx, ex, dy, dur, swayDur, tint }) {
  const rep = cols.length * SB_STRIPE_W
  const stripes = useMemo(() => {
    const startX = -rep, endX = 120 + rep
    const arr = []
    let k = 0
    for (let x = startX; x < endX; x += SB_STRIPE_W, k++) {
      arr.push({ x, color: cols[((k % cols.length) + cols.length) % cols.length] })
    }
    return arr
  }, [cols, rep])

  const driftDur = useMemo(() => (dur * (0.82 + Math.random() * 0.36)).toFixed(2), [dur])
  const driftDelay = useMemo(() => `${(-Math.random() * driftDur).toFixed(2)}s`, [driftDur])
  const swayDelay = useMemo(() => `${(-Math.random() * swayDur).toFixed(2)}s`, [swayDur])

  return (
    <div aria-hidden className="sb-anim" style={{
      position: 'absolute', left: `${sx}vw`, top: `${cy}vh`,
      width: `${sizeVw}vw`, height: `${sizeVw * 1.6}vw`, pointerEvents: 'none',
      willChange: 'transform',
      '--dx': `${ex - sx}vw`, '--dy': `${dy}vh`,
      animation: `sbBalloonDrift ${driftDur}s ease-in-out infinite alternate ${driftDelay}`,
    }}>
      <div className="sb-anim" style={{
        position: 'absolute', inset: 0, transformOrigin: '50% 10%', willChange: 'transform',
        animation: `sbSway ${swayDur}s ease-in-out infinite ${swayDelay}`,
      }}>
        <svg viewBox="0 0 120 192" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <clipPath id={`sbEnvClip${idx}`}>
              <path d="M60 6 C 24 6 6 40 6 74 C 6 106 28 132 48 144 L 72 144 C 92 132 114 106 114 74 C 114 40 96 6 60 6 Z"/>
            </clipPath>
            <linearGradient id={`sbRound${idx}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#1a0812" stopOpacity="0.28"/>
              <stop offset="0.22" stopColor="#1a0812" stopOpacity="0"/>
              <stop offset="0.76" stopColor="#1a0812" stopOpacity="0"/>
              <stop offset="1" stopColor="#1a0812" stopOpacity="0.48"/>
            </linearGradient>
          </defs>
          <g clipPath={`url(#sbEnvClip${idx})`}>
            <g className="sb-anim" style={{ animation: `sbGoreSlide ${goreDur}s linear infinite`, '--rep': `${rep}px` }}>
              {stripes.map((s, i) => (
                <g key={i}>
                  <rect x={s.x} y="0" width={SB_STRIPE_W} height="152" fill={s.color} />
                  <line x1={s.x} y1="0" x2={s.x} y2="152" stroke="#3a1020" strokeWidth="0.8" opacity="0.3" />
                </g>
              ))}
            </g>
            <rect x="0" y="0" width="120" height="152" fill={tint('rgba(232,134,58,0.10)')} />
            <rect x="0" y="0" width="120" height="152" fill={`url(#sbRound${idx})`} />
            <ellipse cx="40" cy="92" rx="26" ry="22" fill={tint('rgba(255,223,174,0.12)')} />
          </g>
          <path d="M60 6 C 24 6 6 40 6 74 C 6 106 28 132 48 144 L 72 144 C 92 132 114 106 114 74 C 114 40 96 6 60 6 Z" fill="none" stroke="#2a1020" strokeWidth="1.4" opacity="0.85"/>
          <rect x="46" y="141" width="28" height="8" rx="1.5" fill="#8c2020"/>
          <line x1="48" y1="149" x2="52" y2="170" stroke="#241016" strokeWidth="1.4"/>
          <line x1="72" y1="149" x2="68" y2="170" stroke="#241016" strokeWidth="1.4"/>
          <rect x="48" y="170" width="24" height="16" rx="2" fill="#6b4a26"/>
          <rect x="48" y="170" width="24" height="4.5" rx="2" fill="#4a3018"/>
        </svg>
      </div>
    </div>
  )
}

function SbWave({ bottom, dur, delay }) {
  return (
    <div aria-hidden className="sb-anim" style={{
      position: 'absolute', left: '-14vw', right: '-14vw', bottom, height: '2.4vh',
      borderRadius: '50%', filter: 'blur(5px)', pointerEvents: 'none', willChange: 'transform,opacity',
      // blue-gray water-surface tone — part of the same off-family atmosphere
      // wash as the backdrop/water below, left literal
      background: 'linear-gradient(90deg, rgba(120,160,200,0) 0%, rgba(120,160,200,.30) 30%, rgba(150,185,215,.34) 55%, rgba(120,160,200,.28) 75%, rgba(120,160,200,0) 100%)',
      animation: `sbWave ${dur} ease-in-out ${delay} infinite`,
    }}/>
  )
}

// PER-CYCLE RE-ROLL (rollMeteorShower precedent, matches JcSmoke/JcMote):
// mutates its own DOM node on 'animationiteration' instead of a React
// re-render; sbDrift holds opacity at 0 at both loop ends so the jump is
// invisible. Reduced-motion gates the reroll itself, not just the CSS.
function rollSbMote() {
  return {
    left: `${(6 + Math.random() * 88).toFixed(2)}vw`,
    top: `${(16 + Math.random() * 52).toFixed(2)}vh`,
    ty: `${-(1.5 + Math.random() * 3.5).toFixed(2)}vh`,
    tx: `${((Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.8)).toFixed(2)}vw`,
  }
}

function SbMote({ initialDelay, tint }) {
  const elRef = useRef(null)
  const size = useMemo(() => 1.6 + Math.random() * 1.8, [])
  const dur = useMemo(() => `${(6 + Math.random() * 5).toFixed(2)}s`, [])
  const initial = useMemo(() => rollSbMote(), [])

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const reroll = () => {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const r = rollSbMote()
      el.style.left = r.left
      el.style.top = r.top
      el.style.setProperty('--ty', r.ty)
      el.style.setProperty('--tx', r.tx)
    }
    el.addEventListener('animationiteration', reroll)
    return () => el.removeEventListener('animationiteration', reroll)
  }, [])

  return (
    <div ref={elRef} aria-hidden className="sb-anim" style={{
      position: 'absolute', left: initial.left, top: initial.top,
      width: `${size}px`, height: `${size}px`, borderRadius: '50%',
      background: tint('rgba(255,217,138,0.6)'), pointerEvents: 'none', willChange: 'transform,opacity',
      '--ty': initial.ty, '--tx': initial.tx,
      animation: `sbDrift ${dur} linear ${initialDelay} infinite`,
    }}/>
  )
}

// Stars — static random-once field (no reroll, matches the artifact). Near-white
// lavender is the sanctioned near-white exception, left literal.
function SbStars() {
  const stars = useMemo(() => Array.from({ length: 22 }, () => {
    const dur = 5 + Math.random() * 8
    return {
      left: `${(2 + Math.random() * 96).toFixed(2)}vw`,
      top: `${(1.5 + Math.random() * 25).toFixed(2)}vh`,
      size: 1 + Math.random() * 1.6,
      dur: `${dur.toFixed(2)}s`,
      delay: `-${(Math.random() * 10).toFixed(2)}s`,
    }
  }), [])
  return stars.map((s, i) => (
    <div key={i} aria-hidden style={{
      position: 'absolute', left: s.left, top: s.top, width: s.size, height: s.size,
      borderRadius: '50%', background: '#f6e6ff', pointerEvents: 'none', willChange: 'opacity',
      '--lo': 0.25, '--hi': 0.85,
      animation: `ambientBreathe ${s.dur} ${s.delay} ease-in-out infinite`,
    }}/>
  ))
}

function SonoraBalloonsAmbient({ tint }) {
  const moteDelays = useMemo(() => Array.from({ length: 14 }, () => `${-(Math.random() * 11).toFixed(2)}s`), [])

  return <>
    <style>{SB_STYLE}</style>
    {/* Base: dusk-to-water sky gradient — a full atmospheric wash, off-family in
        several of its own stops (purple dusk, mauve mid, blue horizon/water);
        left literal as a single documented exception, same treatment as
        jazz-club's backdrop wash. Only the warm accents layered on top (haze.a,
        waterGlow, motes, balloon highlight) are tinted. */}
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'linear-gradient(180deg, #180a28 0%, #22103a 20%, #341444 40%, #6a2a3c 57%, #b0442a 71%, #e8863a 82%, #d0663a 87%, #6a5570 89%, #2a4a72 92%, #163a63 96%, #0e2c50 100%)',
    }}/>
    {/* Haze washes */}
    <GlowLayer lo={0.55} hi={0.85} duration="19s" style={{
      left: '-8vw', top: '-8vh', width: '44vw', height: '34vh', borderRadius: '50%',
      filter: 'blur(32px)',
      background: 'radial-gradient(circle, rgba(180,90,120,.08) 0%, rgba(180,90,120,0) 70%)',
    }}/>
    <GlowLayer lo={0.55} hi={0.85} duration="16s" delay="-7s" style={{
      left: '20vw', top: '14vh', width: '60vw', height: '36vh', borderRadius: '50%',
      filter: 'blur(32px)',
      background: `radial-gradient(circle, ${tint('rgba(255,150,70,.10)')} 0%, ${tint('rgba(255,150,70,0)')} 70%)`,
    }}/>
    {/* Water surface + sunset reflection */}
    <div aria-hidden style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, height: '13vh', pointerEvents: 'none',
      background: 'linear-gradient(180deg, rgba(120,90,120,0) 0%, rgba(42,74,114,.35) 8%, rgba(22,58,99,.75) 22%, #123453 55%, #0c2848 100%)',
    }}/>
    <GlowLayer lo={0.55} hi={0.85} duration="10s" style={{
      left: '12vw', right: '12vw', bottom: '8vh', height: '6vh',
      filter: 'blur(6px)',
      background: `radial-gradient(ellipse at 50% 0%, ${tint('rgba(232,134,58,.34)')} 0%, ${tint('rgba(208,102,58,.12)')} 45%, ${tint('rgba(208,102,58,0)')} 80%)`,
    }}/>
    {SB_WAVES.map((w, i) => <SbWave key={i} {...w} />)}
    {/* Golden dust motes — per-cycle re-roll */}
    {moteDelays.map((d, i) => <SbMote key={i} initialDelay={d} tint={tint} />)}
    {/* 5 hot-air balloons — the anchor */}
    {SB_BALLOONS.map((b) => <SbBalloon key={b.idx} {...b} tint={tint} />)}
    {/* Stars in the purple upper sky */}
    <SbStars/>
  </>
}



// ─── 16. CHRISTMAS EVE ───────────────────────────────────────────────────
function ChristmasEveAmbient({ tint }) {
  const flakes = useMemo(() => Array.from({ length: 32 }, (_, i) => ({
    left:    `${(i * 97 + i % 6 * 11) % 100}%`,
    size:    2.5 + (i % 4) * 1.5,
    opacity: 0.65 + (i % 4) * 0.12,
    dur:     `${10 + (i % 6) * 2.5}s`,
    delay:   `-${((i / 32) * (10 + (i % 6) * 2.5)).toFixed(1)}s`,
    drift:   `${(i % 2 === 0 ? 1 : -1) * (5 + (i % 4) * 3)}px`,
  })), [])

  // Holiday-market garland: single corner-to-corner swag, red/white/green bulbs.
  // Red is in-family (matches theme highlight hue) and gets tinted at each usage below;
  // the near-white bulb (255,248,235 — high lightness, low saturation) and green bulb
  // (an intentional off-family accent color, not derived from accent/highlight, same
  // treatment as Dive Bar's jukebox dome colors) are sanctioned exceptions, left literal.
  // `isRed` flags which entries need tint() applied at the point of use.
  const bulbs = useMemo(() => {
    const RWG = [{ c: '255,72,72', isRed: true }, { c: '255,248,235', isRed: false }, { c: '64,210,76', isRed: false }]
    const p0 = { x: -6, y: 3 }, p1 = { x: 50, y: 42 }, p2 = { x: 106, y: 3 }
    const n = 19
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1), u = 1 - t
      const rwg = RWG[i % 3]
      return {
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
        c: rwg.c,
        isRed: rwg.isRed,
        dur: `${4 + (i % 4)}s`,
        delay: `-${(i * 0.4).toFixed(1)}s`,
      }
    })
  }, [])

  const booths = [
    { x: 20, w: 24, h: 38, lo: 0.24, hi: 0.40, dur: '8s',  delay: '0s',  c: '255,176,86' },
    { x: 43, w: 22, h: 34, lo: 0.22, hi: 0.36, dur: '10s', delay: '-3s', c: '255,158,74' },
    { x: 64, w: 24, h: 40, lo: 0.24, hi: 0.40, dur: '9s',  delay: '-5s', c: '255,184,96' },
    { x: 84, w: 22, h: 36, lo: 0.20, hi: 0.34, dur: '11s', delay: '-7s', c: '255,166,80' },
  ]

  return <>
    {/* night deepening at the top */}
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'linear-gradient(to bottom, rgba(6,4,12,0.55) 0%, transparent 44%)' }}/>

    {/* red (left) + green (right) family washes — green is the same intentional
        off-family accent as the garland's green bulb, left literal; red is in-family, tinted */}
    <GlowLayer lo={0.34} hi={0.50} duration="17s" style={{ inset: 0,
      background: `radial-gradient(ellipse 48% 86% at 0% 52%, ${tint('rgba(255,54,54,0.52)')}, ${tint('rgba(190,32,32,0.22)')} 36%, transparent 60%)` }}/>
    <GlowLayer lo={0.30} hi={0.44} duration="21s" delay="3s" style={{ inset: 0,
      background: 'radial-gradient(ellipse 48% 86% at 100% 52%, rgba(58,212,72,0.48), rgba(28,120,40,0.20) 36%, transparent 60%)' }}/>

    {/* warm market floor: wide base + four booth pools */}
    <GlowLayer lo={0.16} hi={0.26} duration="13s" style={{ inset: 0,
      background: `radial-gradient(ellipse 150% 24% at 50% 112%, ${tint('rgba(150,72,30,0.38)')}, transparent 78%)` }}/>
    {booths.map((b, i) => (
      <GlowLayer key={`booth-${i}`} lo={b.lo} hi={b.hi} duration={b.dur} delay={b.delay} style={{ inset: 0,
        background: `radial-gradient(ellipse ${b.w}% ${b.h}% at ${b.x}% 108%, ${tint(`rgba(${b.c},0.58)`)}, ${tint(`rgba(${b.c},0.2)`)} 44%, transparent 72%)` }}/>
    ))}

    {/* garland wire */}
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0,
      width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <path d="M-6 3 Q50 42 106 3" fill="none" stroke="rgba(120,108,92,0.42)" strokeWidth="0.35"/>
    </svg>
    {/* garland bulbs — red / white / green; red is tinted per-bulb (b.isRed), white/green left literal */}
    {bulbs.map((b, i) => {
      const mid = b.isRed ? tint(`rgba(${b.c},0.96)`) : `rgba(${b.c},0.96)`
      const edge = b.isRed ? tint(`rgba(${b.c},0)`) : `rgba(${b.c},0)`
      const glow = b.isRed ? tint(`rgba(${b.c},0.5)`) : `rgba(${b.c},0.5)`
      return (
        <div key={`bulb-${i}`} aria-hidden style={{
          position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, width: '1.8%', aspectRatio: '1',
          marginLeft: '-0.9%', marginTop: '-0.9%', borderRadius: '50%', pointerEvents: 'none', willChange: 'opacity',
          background: `radial-gradient(circle at 50% 42%, rgba(255,255,250,0.98) 0%, ${mid} 40%, ${edge} 80%)`,
          boxShadow: `0 0 15px 6px ${glow}`,
          '--lo': 0.62, '--hi': 1, opacity: 0.62,
          animation: `ambientBreathe ${b.dur} ease-in-out ${b.delay} infinite`,
        }}/>
      )
    })}

    {/* Snowflakes — pure white (rgba 255,255,255), the sanctioned achromatic
        near-white exception (0% saturation), left untinted */}
    {flakes.map((f, i) => (
      <FallingParticle key={i} left={f.left} size={f.size}
        color={`rgba(255,255,255,${f.opacity})`}
        duration={f.dur} delay={f.delay} drift={f.drift} opacity={f.opacity}
      />
    ))}
  </>
}

// ─── 17. DRIVE-IN MOVIE ──────────────────────────────────────────────────
// A bright screen at the top of a purple night sky, light bleeding out to
// both sides, moths wandering in the glow, a row of parked cars below
const DM = {
  bg: "#080410", bgDeep: "#040208", accent: "#280848",
  highlight: "#e0a000", screenCore: "#fffaf0", car: "#06030c",
}

const DM_STYLE = `
@keyframes dmScreenPulse { 0%, 100% { opacity: .94 } 45% { opacity: 1 } 60% { opacity: .90 } 80% { opacity: .97 } }
@keyframes dmGlowBreathe { 0%, 100% { opacity: .55 } 50% { opacity: .85 } }
@media (prefers-reduced-motion: reduce) { .dm-anim { animation: none !important } }
`

function dmRgba(hex, a) { return hexToRgba(hex, a) }

// A car roof, cropped by the frame — only the top crests into view, like
// looking over the dash at the car parked ahead of us. DM.car fill is a
// dark silhouette, sanctioned exception, left untinted; the highlight rim
// bleeding onto its edge is in-family and tinted.
function DmCarRoof({ left, top, width, height, tint }) {
  return (
    <div className="dm-anim" style={{ position: "absolute", left, top, width, height, borderRadius: "50%",
      background: `radial-gradient(ellipse 90% 100% at 50% 0%, ${tint(dmRgba(DM.highlight, 0.16))}, ${DM.car} 38%)`,
      animation: "dmGlowBreathe 23s ease-in-out infinite" }} />
  )
}

function DmScreen({ tint }) {
  return (
    <>
      {/* light bleeding out to the left of the screen — generously oversized box so
          the radial falloff fully completes well before any edge (no hard cutoff) */}
      <div className="dm-anim" style={{ position: "absolute", top: "-12%", left: "-40%", width: "100%", height: "100%",
        background: `radial-gradient(ellipse 26% 26% at 50% 50%, ${tint(dmRgba(DM.highlight, 0.40))}, transparent 72%)`,
        animation: "dmGlowBreathe 17s ease-in-out infinite" }} />
      {/* light bleeding out to the right of the screen — same oversized-box technique */}
      <div className="dm-anim" style={{ position: "absolute", top: "-12%", left: "40%", width: "100%", height: "100%",
        background: `radial-gradient(ellipse 26% 26% at 50% 50%, ${tint(dmRgba(DM.highlight, 0.40))}, transparent 72%)`,
        animation: "dmGlowBreathe 20s ease-in-out 3s infinite" }} />
      {/* soft halo behind the screen itself */}
      <div className="dm-anim" style={{ position: "absolute", top: "-12%", left: "0%", width: "100%", height: "100%",
        background: `radial-gradient(ellipse 30% 30% at 50% 50%, ${tint(dmRgba(DM.highlight, 0.28))}, transparent 70%)`,
        animation: "dmGlowBreathe 14s ease-in-out infinite" }} />
      {/* support poles — holding the screen up off the lot. Dark neutral silhouette
          colors, sanctioned exception, left untinted. Anchored at the screen's own
          edges (9.5% / 89.5%) so they sit entirely outside the center safe-area */}
      <div style={{ position: "absolute", top: "70%", left: "9.5%", width: "1%", height: "15%",
        background: `linear-gradient(to bottom, ${DM.car}, rgba(6,3,12,0.7))` }} />
      <div style={{ position: "absolute", top: "70%", left: "89.5%", width: "1%", height: "15%",
        background: `linear-gradient(to bottom, ${DM.car}, rgba(6,3,12,0.7))` }} />
      {/* the screen — one flat dark-neutral color inside, where question text renders
          (sanctioned exception, not theme-derived). All the brightness/gradient work
          lives outside it, in the glow layers above (tinted) */}
      <div className="dm-anim" style={{ position: "absolute", top: "6%", left: "10%", width: "80%", height: "64%",
        borderRadius: 2,
        background: "#241e16",
        boxShadow: `0 0 22px 5px ${tint(dmRgba(DM.highlight, 0.45))}, 0 0 64px 16px ${tint(dmRgba(DM.highlight, 0.22))}`,
        animation: "dmScreenPulse 2.6s ease-in-out infinite" }} />
    </>
  )
}

function DriveInMovieAmbient({ tint }) {
  const moths = useMemo(() => Array.from({ length: 7 }, (_, i) => ({
    left:   `${14 + (i * 11) % 72}%`,
    top:    `${2 + (i * 5) % 22}%`,
    size:   1.6 + (i % 3) * 0.6,
    dur:    `${2.2 + (i % 4) * 0.6}s`,
    delay:  `-${((i / 7) * 3).toFixed(1)}s`,
    wDur:   `${5 + (i % 3) * 1.4}s`,
    wDelay: `-${((i * 1.3) % 6).toFixed(1)}s`,
  })), [])

  // Two car roofs, parked just ahead of us — only their tops crest the frame
  const cars = useMemo(() => ([
    { left: "2%",  top: "87%", width: "44%", height: "30%" },
    { left: "53%", top: "90%", width: "43%", height: "25%" },
  ]), [])

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden",
      background: `linear-gradient(to bottom, ${tint(DM.bgDeep)} 0%, ${tint(DM.bg)} 45%, ${tint(dmRgba(DM.accent, 0.5))} 100%)` }}>

      <style>{DM_STYLE}</style>

      {/* atmosphere — distant glow where the lot meets the night sky */}
      <div className="dm-anim" style={{ position: "absolute", bottom: "20%", left: 0, right: 0, height: "14%",
        background: `linear-gradient(to top, ${tint(dmRgba(DM.accent, 0.45))}, transparent)`,
        animation: "dmGlowBreathe 19s ease-in-out 5s infinite" }} />

      {/* anchor — the screen, light spilling to both sides */}
      <DmScreen tint={tint} />

      {/* drifter — moths wandering through the screen light. screenCore is a pale,
          hue-locked-to-highlight warm white (fails the low-saturation half of the
          near-white test, same reasoning as Jazz Club's spotlight), so it's tinted */}
      {moths.map((m, i) => (
        <PulseDot key={i} left={m.left} top={m.top} size={m.size}
          color={tint(dmRgba(DM.screenCore, 0.85))} glowColor={tint(dmRgba(DM.highlight, 0.3))}
          duration={m.dur} delay={m.delay} lo={0.2}
          wander={true} wanderDur={m.wDur} wanderDelay={m.wDelay}
        />
      ))}

      {/* dark silhouette — cars parked just ahead, only their roofs visible (DM.car fill untinted) */}
      {cars.map((c, i) => <DmCarRoof key={i} left={c.left} top={c.top} width={c.width} height={c.height} tint={tint} />)}
    </div>
  )
}


// ─── 19. WESTERN SHOWDOWN ────────────────────────────────────────────────
function WesternShowdownAmbient({ tint }) {
  const dust = useMemo(() => [
    { top: '70%', w: '42%', h: '8%', dur: '20s', delay: '0s',   hi: 0.42, color: tint('rgba(150,118,72,0.7)')  },
    { top: '78%', w: '52%', h: '9%', dur: '16s', delay: '-7s',  hi: 0.46, color: tint('rgba(140,110,66,0.72)') },
    { top: '86%', w: '46%', h: '8%', dur: '13s', delay: '-10s', hi: 0.40, color: tint('rgba(132,104,62,0.7)')  },
    { top: '68%', w: '34%', h: '6%', dur: '26s', delay: '-17s', hi: 0.30, color: tint('rgba(160,128,80,0.6)')  },
  ], [tint])
  return <>
    {/* SKY — bright clear blue, deeper up high, whitening to the horizon haze.
        An intentional dual-tone atmosphere (cool sky + warm ground/sun), same
        treatment as Sunset Boulevard/Rooftop Party's multi-stop skies — tinted. */}
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `linear-gradient(to bottom, ${tint('rgba(72,132,196,0.92)')} 0%, ${tint('rgba(100,160,214,0.88)')} 28%, ${tint('rgba(142,188,225,0.82)')} 48%, ${tint('rgba(200,222,237,0.80)')} 60%, ${tint('rgba(245,245,236,0.82)')} 67%, transparent 73%)` }}/>
    {/* DUSTY HAZE — warm dust veil rising from the horizon into the mid sky */}
    <GlowLayer lo={0.30} hi={0.48} duration="20s" delay="2s" style={{ inset: 0,
      background: `linear-gradient(to top, transparent 16%, ${tint('rgba(228,208,158,0.52)')} 30%, ${tint('rgba(226,206,160,0.36)')} 46%, ${tint('rgba(222,204,160,0.18)')} 58%, transparent 72%)` }}/>
    {/* HORIZON glare — bright near-white haze, low */}
    <GlowLayer lo={0.40} hi={0.60} duration="16s" style={{ inset: 0,
      background: `radial-gradient(ellipse 96% 11% at 50% 67%, ${tint('rgba(252,250,236,0.6)')}, transparent 72%)` }}/>
    {/* sun glare — pale bloom, upper-right */}
    <GlowLayer lo={0.32} hi={0.54} duration="10s" style={{ inset: 0,
      background: `radial-gradient(ellipse 40% 28% at 82% 4%, ${tint('rgba(255,248,206,0.5)')}, transparent 66%)` }}/>
    {/* THE SUN — high, top-right (anchor); inline so it has no Sun-helper dependency.
        0% stop (rgba(255,255,246,1), H=60/S=100/L=98) is the hot near-white core at
        the anchor, sanctioned exception, left untinted; every stop past it is tinted. */}
    <div aria-hidden style={{ position: 'absolute', left: '78%', top: '-1%', width: '9%', aspectRatio: '1', borderRadius: '50%',
      background: `radial-gradient(circle at 50% 47%, rgba(255,255,246,1) 0%, ${tint('rgba(255,247,192,0.98)')} 34%, ${tint('rgba(236,208,132,0.85)')} 58%, ${tint('rgba(255,200,140,0.16)')} 78%, transparent 100%)`,
      boxShadow: `0 0 54px 17px ${tint('rgba(254,242,180,0.55)')}`, willChange: 'opacity', '--lo': 0.9, '--hi': 1,
      animation: 'ambientBreathe 11s ease-in-out infinite', pointerEvents: 'none' }}/>
    {/* WARM GROUND — tan/ochre desert floor, FLAT */}
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
      background: `linear-gradient(to bottom, transparent 64%, ${tint('rgba(202,164,100,0.55)')} 72%, ${tint('rgba(176,138,82,0.75)')} 86%, ${tint('rgba(150,116,68,0.88)')} 100%)` }}/>
    {/* BLOWING DUST — denser darker clouds drifting over the ground */}
    {dust.map((d, i) => (
      <div key={i} aria-hidden style={{ position: 'absolute', top: d.top, left: '-8%', width: d.w, height: d.h,
        background: `radial-gradient(ellipse 50% 55% at 50% 50%, ${d.color}, transparent 78%)`,
        willChange: 'transform, opacity', '--hi': d.hi,
        animation: `ambientDriftAcross ${d.dur} ${d.delay} linear infinite`, pointerEvents: 'none' }}/>
    ))}
    {/* TUMBLEWEEDS — three styles, mixed L/R entry, phased so they take turns.
        Tumbleweed is theme-specific (only used here), not a shared helper — but its
        twine colors (~29° hue, ~30-52% sat, dark) are a desaturated non-identity
        neutral, not a derived highlight variant, same treatment as Medieval Tavern's
        wood-handle color. Left untouched on that basis. */}
    <Tumbleweed top="74%" size="5.2%" seed={7}  style="loose" dir="lr" crossDur="18s" bounceDur="1.2s"  spinDur="2.9s" delay="0s"   hi={0.56}/>
    <Tumbleweed top="80%" size="5.6%" seed={23} style="tidy"  dir="rl" crossDur="18s" bounceDur="1.05s" spinDur="2.4s" delay="-6s"  hi={0.66}/>
    <Tumbleweed top="86%" size="6.5%" seed={42} style="dense" dir="lr" crossDur="18s" bounceDur="0.92s" spinDur="2.0s" delay="-12s" hi={0.72}/>
  </>
}

// ─── 20. UNDER THE SEA ───────────────────────────────────────────────────
const US = {
  bg: "#000c18", bgDeep: "#000810", accent: "#003848",
  highlight: "#00d8c0", shiny: "#40ffb0", text: "#b0f0f0",
  muted: "#207870", core: "#eafff9", mid: "#00222e",
};

function usRgba(hex, a) { return hexToRgba(hex, a) }

const US_STYLE = `
@keyframes usGodray {
  0%,100% { opacity:.12; transform: translateX(0) skewX(var(--sk,-9deg)) }
  50%     { opacity:.26; transform: translateX(var(--sw,10px)) skewX(var(--sk,-9deg)) }
}
@keyframes usBubble {
  0%   { transform: translate(0,0); opacity:0 }
  12%  { opacity: var(--bo,.55) }
  82%  { opacity: calc(var(--bo,.55)*.7) }
  100% { transform: translate(var(--bx,6px), calc(-1*var(--br,300px))); opacity:0 }
}
@keyframes usGlow  { 0%,100%{ opacity:.5 } 50%{ opacity:.82 } }
@keyframes usPop   { 0%,100%{ opacity:0; transform: scale(.55) } 50%{ opacity:.9; transform: scale(1.1) } }
@media (prefers-reduced-motion: reduce){ .us-anim{ animation:none !important } }
`;

function UsGodray({ x, w, sk, sw, dur, delay, tint }) {
  return (
    <div className="us-anim" style={{
      position: "absolute", top: "-12%", height: "115%", left: x, width: w,
      background: `linear-gradient(to bottom, ${tint(usRgba(US.shiny, 0.5))}, ${tint(usRgba(US.highlight, 0.22))} 28%, transparent 72%)`,
      transformOrigin: "50% 0%", filter: "blur(7px)",
      ["--sk"]: sk, ["--sw"]: sw,
      animation: `usGodray ${dur}s ease-in-out ${delay}s infinite`, willChange: "transform, opacity",
    }} />
  );
}

function UnderTheSeaAmbient({ tint }) {
  const bubbles = useMemo(() => Array.from({ length: 18 }, () => ({
    left: (Math.random() * 100).toFixed(1) + "%",
    size: (Math.random() * 5 + 3).toFixed(1),
    br: (Math.random() * 140 + 200).toFixed(0) + "px",
    bx: (Math.random() * 20 - 10).toFixed(0) + "px",
    bo: (Math.random() * 0.22 + 0.36).toFixed(2),
    dur: (Math.random() * 5 + 7).toFixed(1),
    delay: (-Math.random() * 12).toFixed(1),
  })), []);
  const bio = useMemo(() => Array.from({ length: 22 }, () => ({
    left: (Math.random() * 100).toFixed(1) + "%",
    top: (Math.random() * 100).toFixed(1) + "%",
    size: (Math.random() * 4 + 2.5).toFixed(1),
    dur: (Math.random() * 5 + 4).toFixed(1),
    delay: (-Math.random() * 9).toFixed(1),
  })), []);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden",
      background: `linear-gradient(to bottom, ${tint(US.bg)} 0%, ${tint(US.mid)} 58%, ${tint(US.accent)} 100%)` }}>

      <style>{US_STYLE}</style>

      {/* surface light from above */}
      <div className="us-anim" style={{ position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 120% 60% at 50% -10%, ${tint(usRgba(US.highlight, 0.22))}, transparent 60%)`,
        animation: "usGlow 18s ease-in-out infinite" }} />

      {/* teal floor glow — rounded dome + wide low base to carry color into the corners */}
      <div style={{ position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 150% 24% at 50% 106%, ${tint(usRgba(US.accent, 0.75))}, transparent 78%)` }} />
      <div className="us-anim" style={{ position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 64% 32% at 50% 102%, ${tint(usRgba(US.highlight, 0.26))}, transparent 68%)`,
        animation: "usGlow 14s ease-in-out infinite" }} />

      {/* ATMOSPHERE — god-ray shafts */}
      <UsGodray x="16%" w="9%" sk="-11deg" sw="12px" dur={11} delay={0} tint={tint} />
      <UsGodray x="38%" w="7%" sk="-7deg" sw="9px" dur={14} delay={-3} tint={tint} />
      <UsGodray x="60%" w="10%" sk="-9deg" sw="11px" dur={12} delay={-6} tint={tint} />
      <UsGodray x="80%" w="7%" sk="-6deg" sw="8px" dur={15} delay={-2} tint={tint} />

      {/* bioluminescent lights — fade in and out at random spots */}
      {bio.map((b, i) => (
        <div key={i} className="us-anim" style={{ position: "absolute", left: b.left, top: b.top,
          width: b.size + "px", height: b.size + "px", borderRadius: "50%", background: tint(usRgba(US.shiny, 0.8)),
          boxShadow: `0 0 7px ${tint(usRgba(US.highlight, 0.55))}`, animation: `usPop ${b.dur}s ease-in-out ${b.delay}s infinite` }} />
      ))}

      {/* DRIFTERS — bubbles rising all over. US.text (#b0f0f0, H=180/S=68/L=82) is a
          pale but hue-locked cyan-family tone, not a true achromatic near-white
          (fails the low-saturation half of the near-white test) — tinted. */}
      {bubbles.map((b, i) => (
        <div key={i} className="us-anim" style={{ position: "absolute", left: b.left, bottom: "0%",
          width: b.size + "px", height: b.size + "px", borderRadius: "50%",
          border: `1px solid ${tint(usRgba(US.text, 0.5))}`,
          background: `radial-gradient(circle at 35% 30%, ${tint(usRgba(US.text, 0.32))}, transparent 60%)`,
          ["--br"]: b.br, ["--bx"]: b.bx, ["--bo"]: b.bo,
          animation: `usBubble ${b.dur}s linear ${b.delay}s infinite`, willChange: "transform, opacity" }} />
      ))}
    </div>
  );
}

// ─── 21. NEON TOKYO ──────────────────────────────────────────────────────
const NT = {
  bg: "#040008", bgDeep: "#020005", accent: "#380048",
  magenta: "#ff00c0", cyan: "#00ffff", purple: "#c800ff", pink: "#ff5ad8",
  text: "#f8d0ff", rain: "#bfeaff",
};

function ntRgba(hex, a) { return hexToRgba(hex, a) }

const NT_STYLE = `
@keyframes ntPop  { 0%,100%{ opacity:0; transform:translate(-50%,-50%) scale(.65) } 50%{ opacity:var(--hi,.7); transform:translate(-50%,-50%) scale(1.05) } }
@keyframes ntPopB { 0%,100%{ opacity:0; transform:translate(-50%,-50%) scale(.65) } 44%{ opacity:var(--hi,.7); transform:translate(-50%,-50%) scale(1.05) } }
@keyframes ntPopC { 0%,100%{ opacity:0; transform:translate(-50%,-50%) scale(.65) } 58%{ opacity:var(--hi,.7); transform:translate(-50%,-50%) scale(1.05) } }
@keyframes ntRain {
  0%   { transform: translateY(-14vh); opacity: 0 }
  7%   { opacity: var(--hi,.7) }
  92%  { opacity: var(--hi,.7) }
  100% { transform: translateY(112vh); opacity: 0 }
}
@media (prefers-reduced-motion: reduce){ .nt-anim{ animation:none !important } }
`;

function NeonTokyoAmbient({ tint }) {
  const pops = useMemo(() => {
    const cols = 6, rows = 4, arr = [];
    const kfs = ["ntPop", "ntPopB", "ntPopC"];
    const cols5 = [tint(NT.magenta), tint(NT.magenta), tint(NT.cyan), tint(NT.cyan), tint(NT.purple), tint(NT.pink)];
    const push = (left, top) => {
      arr.push({
        color: cols5[Math.floor(Math.random() * cols5.length)],
        kf: kfs[Math.floor(Math.random() * 3)],
        left: left.toFixed(1) + "%", top: top.toFixed(1) + "%",
        size: (Math.random() * 16 + 6).toFixed(1),
        a: (Math.random() * 0.3 + 0.4).toFixed(2),
        hi: (Math.random() * 0.3 + 0.6).toFixed(2),
        dur: (Math.random() * 3.4 + 2.4).toFixed(2),
        delay: (-Math.random() * 7).toFixed(2),
        blur: (Math.random() * 8 + 5).toFixed(0),
      });
    };
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        push((c + 0.1 + Math.random() * 0.8) / cols * 100, (r + 0.1 + Math.random() * 0.8) / rows * 100);
    return arr;
  }, [tint]);

  const rain = useMemo(() => {
    const rainColors = [tint(NT.rain), tint("#dcf6ff"), tint(ntRgba(NT.cyan, 0.9))];
    return Array.from({ length: 24 }, () => {
      const c = Math.random();
      return {
        left: (Math.random() * 100).toFixed(1) + "%",
        height: (Math.random() * 50 + 55).toFixed(0),
        hi: (Math.random() * 0.3 + 0.45).toFixed(2),
        dur: (Math.random() * 1.0 + 1.7).toFixed(2),
        delay: (-Math.random() * 3).toFixed(2),
        color: c < 0.34 ? rainColors[0] : c < 0.67 ? rainColors[1] : rainColors[2],
      };
    });
  }, [tint]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden",
      background: `radial-gradient(ellipse 120% 90% at 50% 34%, ${tint(ntRgba(NT.accent, 0.4))}, ${tint(NT.bg)} 62%, ${tint(NT.bgDeep)} 94%)` }}>

      <style>{NT_STYLE}</style>

      {/* PULSING — color pop-ups all across the screen, each fully fading in/out at random */}
      {pops.map((b, i) => (
        <div key={i} className="nt-anim" style={{
          position: "absolute", left: b.left, top: b.top, width: b.size + "%", aspectRatio: "1",
          transform: "translate(-50%, -50%)", borderRadius: "50%",
          background: `radial-gradient(circle at 50% 50%, ${ntRgba(b.color, b.a)}, transparent 64%)`,
          filter: `blur(${b.blur}px)`, ["--hi"]: b.hi,
          animation: `${b.kf} ${b.dur}s ease-in-out ${b.delay}s infinite`, willChange: "transform, opacity",
        }} />
      ))}

      {/* LINES — neon rain (lessened 25%) */}
      {rain.map((r, i) => (
        <div key={i} className="nt-anim" style={{ position: "absolute", left: r.left, top: "-6%",
          width: 1.4, height: r.height + "px", background: r.color, ["--hi"]: r.hi,
          boxShadow: `0 0 4px ${tint(ntRgba(NT.cyan, 0.5))}`,
          animation: `ntRain ${r.dur}s ${r.delay}s linear infinite`, willChange: "transform, opacity" }} />
      ))}
    </div>
  );
}


// ─── 23. FIREFLY SUMMER ──────────────────────────────────────────────────
function FireflySummerAmbient({ tint }) {
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
      background: `linear-gradient(to bottom, ${tint('rgba(180,110,35,0.32)')}, transparent)`,
    }}/>
    <GlowLayer lo={0.18} hi={0.45} duration="30s" delay="8s" style={{
      inset: 0,
      background: `radial-gradient(ellipse 80% 60% at 50% 60%, ${tint('rgba(0,75,20,0.35)')}, transparent)`,
    }}/>
    <div aria-hidden style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%',
      background: `linear-gradient(to top, ${tint('rgba(80,60,10,0.18)')}, transparent)`, pointerEvents: 'none',
    }}/>
    {fireflies.map((f, i) => (
      <PulseDot key={i} left={f.left} top={f.top} size={f.size}
        color={tint('rgba(185,255,85,0.95)')} glowColor={tint('rgba(145,255,45,0.40)')}
        duration={f.dur} delay={f.delay}
        lo={0.15} wander={true} wanderDur={f.wDur} wanderDelay={f.wDelay}
      />
    ))}
  </>
}


// ─── 25. WINE CELLAR ─────────────────────────────────────────────────────
// Deep stone cellar — burgundy walls closing in, one small candle center
function WineCellarAmbient({ tint }) {
  return <>
    {/* Burgundy stone walls — dominant edge treatment */}
    <GlowLayer lo={0.25} hi={0.62} duration="9s" style={{
      inset: 0,
      background: `radial-gradient(ellipse 75% 75% at 50% 50%, transparent 38%, ${tint('rgba(120,0,25,0.70)')} 100%)`,
    }}/>
    {/* Deep wine-red overlay — left wall */}
    <GlowLayer lo={0.18} hi={0.45} duration="12s" style={{
      inset: 0,
      background: `radial-gradient(ellipse 40% 100% at 0% 50%, ${tint('rgba(100,0,20,0.52)')}, transparent)`,
    }}/>
    {/* Deep wine-red overlay — right wall */}
    <GlowLayer lo={0.14} hi={0.38} duration="15s" delay="5s" style={{
      inset: 0,
      background: `radial-gradient(ellipse 40% 100% at 100% 50%, ${tint('rgba(100,0,20,0.45)')}, transparent)`,
    }}/>
    {/* Single candle — center, small and warm */}
    <GlowLayer lo={0.26} hi={0.68} duration="2.4s" flicker style={{
      inset: 0,
      background: `radial-gradient(ellipse 30% 45% at 50% 60%, ${tint('rgba(240,170,60,0.62)')}, transparent)`,
    }}/>
    {/* Faint warm floor glow */}
    <GlowLayer lo={0.12} hi={0.30} duration="6s" delay="3s" style={{
      bottom: 0, left: 0, right: 0, height: '20%',
      background: `linear-gradient(to top, ${tint('rgba(160,60,10,0.30)')}, transparent)`,
    }}/>
  </>
}


// ─── 27. METEOR SHOWER ───────────────────────────────────────────────────
const DIPPER = [
  { x: 9.0,  y: 8.0,  d: 3.0 }, // Dubhe
  { x: 9.7,  y: 18.7, d: 2.6 }, // Merak
  { x: 17.0, y: 20.0, d: 2.4 }, // Phecda
  { x: 16.6, y: 11.5, d: 2.3 }, // Megrez
  { x: 22.9, y: 9.9,  d: 2.6 }, // Alioth
  { x: 28.7, y: 8.0,  d: 2.4 }, // Mizar
  { x: 35.0, y: 11.5, d: 2.9 }, // Alkaid
]

function BigDipper({ tint }) {
  return <>
    {DIPPER.map((s, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)',
        width: `${s.d}px`, height: `${s.d}px`, borderRadius: '50%', pointerEvents: 'none',
        // star point itself is achromatic near-white (0 saturation), sanctioned exception;
        // the soft blue halo carries the theme hue (S=100), so it's tinted
        background: 'rgba(255,255,255,1)',
        boxShadow: `0 0 5px ${tint('rgba(220,240,255,0.95)')}, 0 0 12px ${tint('rgba(195,224,255,0.45)')}`,
        willChange: 'opacity', '--lo': 0.92, '--hi': 1,
        animation: `ambientBreathe ${6 + (i % 4)}s -${i}s ease-in-out infinite`,
      }}/>
    ))}
  </>
}

function rollMeteorShower() {
  // Constrained to read as one shower radiating from the upper-left anchor:
  // shallow down-right angle, origin clustered near the radiant, vw-based
  // travel so the streak angle stays true regardless of aspect ratio.
  const theta = 29 + (Math.random() * 10 - 5)
  const rad = theta * Math.PI / 180
  const dist = 42 + Math.random() * 16
  const sx = 8 + Math.random() * 22
  const sy = 6 + Math.random() * 22
  return {
    sx: `${sx.toFixed(1)}%`, sy: `${sy.toFixed(1)}%`, ang: `${theta.toFixed(1)}deg`,
    dx: `${(dist * Math.cos(rad)).toFixed(1)}vw`, dy: `${(dist * Math.sin(rad)).toFixed(1)}vw`,
    speed: (8 + Math.random() * 10).toFixed(2),
  }
}

function MeteorShowerStreak({ tint }) {
  const [shot, setShot] = useState(null)
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let alive = true, k = 0, timer
    const fire = () => {
      if (!alive) return
      setShot({ key: ++k, ...rollMeteorShower() })
      timer = setTimeout(fire, 1500 + Math.random() * 2600)
    }
    timer = setTimeout(fire, Math.random() * 2500)
    return () => { alive = false; clearTimeout(timer) }
  }, [])
  if (!shot) return null
  return (
    <div key={shot.key} aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', willChange: 'transform,opacity', opacity: 0,
      '--dx': shot.dx, '--dy': shot.dy,
      animation: `streakOnce ${shot.speed}s linear forwards`,
    }}>
      <div style={{
        position: 'absolute', left: shot.sx, top: shot.sy, width: '15%', height: '3px',
        transform: `rotate(${shot.ang})`, transformOrigin: 'left center',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          // near-white leading tip (100% stop) is a sanctioned hot-core exception; body stops are in-family blue-white
          background: `linear-gradient(to right, ${tint('rgba(200,228,255,0)')} 0%, ${tint('rgba(208,232,255,0.22)')} 50%, ${tint('rgba(228,244,255,0.72)')} 86%, rgba(248,252,255,1) 100%)`,
          clipPath: 'polygon(0 50%, 100% 0, 100% 100%)',
        }}/>
        <div style={{
          position: 'absolute', right: '-3px', top: '50%', transform: 'translateY(-50%)',
          width: '7px', height: '7px', borderRadius: '50%',
          // near-white core, in-family blue-white falloff
          background: `radial-gradient(circle, rgba(250,253,255,1), ${tint('rgba(208,232,255,0.5)')} 45%, transparent 70%)`,
          boxShadow: `0 0 7px ${tint('rgba(200,228,255,0.7)')}`,
        }}/>
      </div>
    </div>
  )
}

function MeteorShowerAmbient({ tint }) {
  const stars = useMemo(() => Array.from({ length: 200 }, () => {
    const op = 0.22 + Math.random() * 0.5
    return {
      left:  `${(Math.random() * 100).toFixed(2)}%`,
      top:   `${(Math.random() * 100).toFixed(2)}%`,
      size:  0.5 + Math.random() * 1.6,
      hi:    Math.min(op, 0.85),
      lo:    op * 0.25,
      dur:   `${(9 + Math.random() * 18).toFixed(1)}s`,
      delay: `-${(Math.random() * 20).toFixed(1)}s`,
    }
  }), [])

  return <>
    {/* Deep blue night sky wash */}
    <GlowLayer lo={0.22} hi={0.42} duration="30s" style={{
      inset: 0, background: `radial-gradient(ellipse 100% 82% at 50% 28%, ${tint('rgba(20,32,96,0.42)')}, transparent)`,
    }}/>
    {/* Faint milky-way band */}
    <GlowLayer lo={0.10} hi={0.26} duration="40s" delay="12s" style={{
      inset: 0, background: `radial-gradient(ellipse 62% 24% at 48% 46%, ${tint('rgba(70,80,170,0.24)')}, transparent)`,
    }}/>
    {/* Living milky-way band — three independent, never-synced clocks (X drift,
        Y float, breathe) stacked so the whole band drifts, floats, and pulses
        without ever repeating the same combined position. Rendered behind the
        star field and streaks. */}
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      animation: 'ambientFloatX 44s ease-in-out infinite',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        animation: 'ambientFloatY 27s -7s ease-in-out infinite',
      }}>
        <div style={{
          position: 'absolute', left: '-10%', top: '20%', width: '120%', height: '34%',
          transform: 'rotate(-14deg)', willChange: 'opacity',
          background: `linear-gradient(to bottom, transparent, ${tint('rgba(140,160,220,0.30)')} 25%, transparent)`,
          filter: 'blur(10px)',
          '--lo': 0.5, '--hi': 0.9,
          animation: 'ambientBreathe 18s -4s ease-in-out infinite',
        }}/>
      </div>
    </div>
    {/* True-random twinkle field — pure achromatic white (0 saturation), sanctioned
        near-white exception, same as Midnight Galaxy's star field */}
    {stars.map((s, i) => (
      <div key={i} aria-hidden style={{
        position: 'absolute', left: s.left, top: s.top, pointerEvents: 'none',
        width: s.size, height: s.size, borderRadius: '50%',
        background: `rgba(255,255,255,${s.hi})`, willChange: 'opacity',
        '--lo': s.lo, '--hi': s.hi,
        animation: `ambientBreathe ${s.dur} ${s.delay} ease infinite`,
      }}/>
    ))}
    {/* Big Dipper anchor */}
    <BigDipper tint={tint}/>
    {/* Radiant — bright anchor point in the upper-left the meteors read as
        falling away from (rollMeteorShower's origin box sits just inside it) */}
    <div aria-hidden style={{
      position: 'absolute', left: '6vw', top: '5vh', width: '12vw', height: '12vw',
      transform: 'translate(-50%,-50%)', pointerEvents: 'none', willChange: 'opacity',
      '--lo': 0.75, '--hi': 1,
      animation: 'ambientBreathe 12s ease-in-out infinite',
    }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        // near-white hot core (sanctioned exception), in-family blue-white falloff
        background: `radial-gradient(circle, rgba(255,255,255,0.95) 0%, ${tint('rgba(210,230,255,0.55)')} 35%, ${tint('rgba(180,210,255,0.15)')} 65%, transparent 78%)`,
      }}/>
      {/* Static cross-glints — no animation of their own, ride the parent's breathe */}
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', transform: 'translateY(-50%)',
        background: `linear-gradient(to right, transparent, ${tint('rgba(220,240,255,0.8)')}, transparent)`,
        filter: 'blur(1px)',
      }}/>
      <div style={{
        position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', transform: 'translateX(-50%)',
        background: `linear-gradient(to bottom, transparent, ${tint('rgba(220,240,255,0.8)')}, transparent)`,
        filter: 'blur(1px)',
      }}/>
    </div>
    {/* Parallel meteors */}
    <MeteorShowerStreak tint={tint}/><MeteorShowerStreak tint={tint}/><MeteorShowerStreak tint={tint}/><MeteorShowerStreak tint={tint}/>
  </>
}


// ─── 29. 80S NIGHT ───────────────────────────────────────────────────────
function EightiesNightAmbient({ tint }) {
  const neon = useMemo(() => {
    // each neon-glow band uses one solid hue repeated at multiple stops/alphas —
    // tint the base hex once per band, reapply original alphas
    const bands = [
      { hex: '#ff10c8', delay: '0s'   },
      { hex: '#00d0ff', delay: '-4s'  },
      { hex: '#a020ff', delay: '-8s'  },
      { hex: '#ff50a0', delay: '-12s' },
    ]
    return bands.map(({ hex, delay }) => {
      const c = tint(hex)
      const rgba = (a) => hexToRgba(c, a)
      return {
        bg: `radial-gradient(ellipse 72% 49% at 50% 100%, ${rgba(0.58)} 0%, ${rgba(0.24)} 42%, transparent 76%), radial-gradient(ellipse 135% 32% at 50% 105%, ${rgba(0.40)} 0%, ${rgba(0.15)} 46%, transparent 78%)`,
        delay,
      }
    })
  }, [tint])
  const dots = useMemo(() => [
    { left: '6%',  top: '9%',  size: 5,   color: tint('rgba(255,80,200,0.95)'),  dur: '2.2s', delay: '0s'    },
    { left: '14%', top: '18%', size: 3.5, color: tint('rgba(0,210,255,0.95)'),   dur: '2.7s', delay: '-0.7s' },
    { left: '22%', top: '7%',  size: 4,   color: tint('rgba(180,90,255,0.9)'),   dur: '1.9s', delay: '-1.3s' },
    { left: '30%', top: '16%', size: 4,   color: 'rgba(255,255,255,0.95)', dur: '2.4s', delay: '-0.4s' },
    { left: '40%', top: '15%', size: 3.5, color: tint('rgba(255,120,220,0.9)'),  dur: '2.5s', delay: '-1.5s' },
    { left: '48%', top: '21%', size: 5,   color: tint('rgba(0,210,255,0.9)'),    dur: '2.1s', delay: '-1.1s' },
    { left: '56%', top: '15%', size: 4,   color: tint('rgba(180,90,255,0.9)'),   dur: '2.9s', delay: '-1.8s' },
    { left: '66%', top: '17%', size: 3.5, color: 'rgba(255,255,255,0.9)',  dur: '2.0s', delay: '-0.9s' },
    { left: '72%', top: '7%',  size: 4,   color: tint('rgba(255,80,200,0.9)'),   dur: '3.0s', delay: '-1.7s' },
    { left: '80%', top: '15%', size: 4,   color: tint('rgba(0,210,255,0.9)'),    dur: '2.3s', delay: '-1.0s' },
    { left: '88%', top: '9%',  size: 3,   color: tint('rgba(180,90,255,0.9)'),   dur: '2.8s', delay: '-2.0s' },
    { left: '12%', top: '26%', size: 3,   color: 'rgba(255,255,255,0.9)',  dur: '3.1s', delay: '-2.2s' },
    { left: '36%', top: '25%', size: 3,   color: tint('rgba(0,210,255,0.85)'),   dur: '3.2s', delay: '-1.4s' },
    { left: '62%', top: '26%', size: 3.5, color: tint('rgba(255,120,220,0.9)'),  dur: '2.4s', delay: '-0.8s' },
    { left: '86%', top: '24%', size: 3,   color: tint('rgba(180,90,255,0.85)'),  dur: '2.7s', delay: '-2.3s' },
  ], [tint])
  return <>
    <GlowLayer lo={0.16} hi={0.34} duration="20s" style={{ inset: 0,
      background: `radial-gradient(ellipse 90% 70% at 50% 24%, ${tint('rgba(60,10,90,0.42)')}, transparent 75%)` }}/>
    {neon.map((n, i) => (
      <div key={i} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: n.bg, willChange: 'opacity', '--lo': 0, '--hi': 0.9,
        animation: `ambientBreathe 16s ${n.delay} ease-in-out infinite` }}/>
    ))}
    {/* 3 of the 15 dots (30%/66%/12% left) are pure achromatic white (0 saturation),
        sanctioned near-white exception — left untinted; the rest carry the neon hues, tinted */}
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
  'sonora-balloons':    SonoraBalloonsAmbient,
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
  const baseTheme = getTheme(theme.id)

  // Retints a theme's hand-tuned color the same way its highlight has
  // shifted relative to the theme's own default — a no-op until a host
  // actually overrides a color, so every theme renders unchanged by default.
  // Anchored on 'highlight' only: 'accent' is numerically unstable (accent
  // colors are usually very dark washes, so the lightness-scale ratio blows
  // up) and every one of the 21 themes already anchors on highlight anyway.
  const tint = useCallback((originalColorStr) =>
    deriveTint(baseTheme.colors.highlight, theme.colors.highlight, originalColorStr),
    [baseTheme.colors.highlight, theme.colors.highlight]
  )

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 1 }} aria-hidden>
        {AmbientComponent && <AmbientComponent tint={tint} />}
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
