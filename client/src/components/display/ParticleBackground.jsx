import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { getTheme } from '../../themes/index.js'
import BreathingGradient from './BreathingGradient'
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
  50%     { transform: translateX(3.6vw)  scaleY(1.27); opacity: .62; }
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


// ─── Registry ─────────────────────────────────────────────────────────────
const AMBIENT_MAP = {
  'pure-michigan':      PureMichiganAmbient,
  'midnight-galaxy':    MidnightGalaxyAmbient,
  'autumn-harvest':     AutumnHarvestAmbient,
  'sunset-boulevard':   SunsetBoulevardAmbient,
  'sand-dune-chill':    SandDuneChillAmbient,
  'halloween':          HalloweenAmbient,
  'sonora-balloons':    SonoraBalloonsAmbient,
  'under-the-sea':      UnderTheSeaAmbient,
  'meteor-shower':      MeteorShowerAmbient,
}

// ─── Gradient-collapse routing ──────────────────────────────────────────
// These 12 themes retired their bespoke ambient scene in favor of the shared
// BreathingGradient (fed theme.colors + a mood). Their *Ambient functions
// still exist above (dead, delete later) but are no longer routed. The other
// 9 themes keep their bespoke ambient via AMBIENT_MAP.
const GRADIENT_MOODS = {
  'wine-cellar':      'calm',
  'drive-in-movie':   'calm',
  'medieval-tavern':  'calm',
  'western-showdown': 'calm',
  'firefly-summer':   'calm',
  'dive-bar':         'warm',
  'jazz-club':        'warm',
  'christmas-eve':    'warm',
  'retro-arcade':     'electric',
  'eighties-night':   'electric',
  'neon-tokyo':       'electric',
  'northern-lights':  'electric',
}

// ─── Main Export ──────────────────────────────────────────────────────────
export default function ParticleBackground({ theme }) {
  const gradientMood = GRADIENT_MOODS[theme.id]
  const AmbientComponent = gradientMood ? null : AMBIENT_MAP[theme.id]
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
        {gradientMood
          ? <BreathingGradient palette={theme.colors} mood={gradientMood} />
          : AmbientComponent && <AmbientComponent tint={tint} />}
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
