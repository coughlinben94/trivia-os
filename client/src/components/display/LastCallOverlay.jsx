import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../shared/ThemeProvider.jsx'
import { LAST_CALL_MS, lastCallStep } from '../../lib/lastCall.js'

// Bar bell, synthesized — no asset file. A few inharmonic partials (bell
// ratios) with exponential decay, struck three times: ding-ding ... ding.
// Only audible once the TV has had its setup click (Display.jsx's
// onFirstInteraction); a cold tab just stays silent, the sign still shows.
const PARTIALS = [[0.5, 0.35], [1, 1], [1.19, 0.45], [1.5, 0.3], [2, 0.5], [2.74, 0.22], [3.76, 0.12]]
const STRIKES = [0, 0.32, 1.05]

function ringBell() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC()
    const master = ctx.createGain()
    master.gain.value = 0.18
    master.connect(ctx.destination)
    const t0 = ctx.currentTime + 0.05
    for (const at of STRIKES) {
      for (const [ratio, amp] of PARTIALS) {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = 880 * ratio
        const start = t0 + at
        // Higher partials die faster, like a real bell.
        const decay = 2.4 / Math.sqrt(ratio)
        g.gain.setValueAtTime(0.0001, start)
        g.gain.exponentialRampToValueAtTime(amp, start + 0.004)
        g.gain.exponentialRampToValueAtTime(0.0001, start + decay)
        osc.connect(g)
        g.connect(master)
        osc.start(start)
        osc.stop(start + decay + 0.05)
      }
    }
    ctx.resume().catch(() => {})
    setTimeout(() => ctx.close().catch(() => {}), (STRIKES.at(-1) + 3.5) * 1000)
  } catch {}
}

// Mounted once at Display's root, above the jukebox (z-70) and below the
// warp (z-80), so it shows during any slide including grading breaks.
// Top-right edge only — well clear of the center 60% x 45% question area.
export default function LastCallOverlay({ showId, nonce }) {
  const { theme } = useTheme()
  const seenRef = useRef(null)
  const [active, setActive] = useState(null)

  useEffect(() => {
    const step = lastCallStep(seenRef.current, showId, nonce)
    seenRef.current = step.seen
    if (!step.play) return
    setActive(nonce)
    ringBell()
  }, [showId, nonce])

  useEffect(() => {
    if (active == null) return
    const t = setTimeout(() => setActive(null), LAST_CALL_MS)
    return () => clearTimeout(t)
  }, [active])

  if (active == null) return null
  return (
    <div
      aria-hidden
      style={{ position: 'fixed', inset: 0, zIndex: 75, pointerEvents: 'none', containerType: 'size' }}
    >
      <div
        key={active}
        className="last-call-sign"
        style={{
          position: 'absolute', top: '5.5cqh', right: '3cqw',
          padding: '1.2cqh 2cqw',
          border: '0.3cqw solid #ffb347',
          borderRadius: '2cqw',
          boxShadow: '0 0 1cqw #ff9a1f, 0 0 3cqw #ff7a00aa, inset 0 0 1.2cqw #ff9a1f88',
          background: 'rgba(20,4,8,0.55)',
          textAlign: 'center',
          willChange: 'opacity, transform',
        }}
      >
        <div style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          fontSize: '5.5cqw', lineHeight: 1, letterSpacing: '0.06em',
          color: '#ffe6ea',
          textShadow: '0 0 0.3cqw #fff, 0 0 1cqw #ff2d55, 0 0 2.2cqw #ff2d55, 0 0 4cqw #ff0033',
          whiteSpace: 'nowrap',
        }}>LAST CALL</div>
        <div style={{
          fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
          fontSize: '1.4cqw', fontWeight: 700, letterSpacing: '0.35em', marginTop: '0.6cqh',
          color: '#fff1d6',
          textShadow: '0 0 0.6cqw #ffb347, 0 0 1.6cqw #ff9a1f',
          textTransform: 'uppercase',
        }}>at the bar</div>
      </div>
      <style>{`
        .last-call-sign { animation: lastCallNeon ${LAST_CALL_MS}ms linear forwards; }
        @keyframes lastCallNeon {
          0%   { opacity: 0;    transform: scale(0.97); }
          2%   { opacity: 0.9;  transform: scale(1); }
          3.5% { opacity: 0.1; }
          5%   { opacity: 1; }
          6%   { opacity: 0.3; }
          7.5% { opacity: 1; }
          9%   { opacity: 0.55; }
          10%  { opacity: 1; }
          52%  { opacity: 1; }
          53%  { opacity: 0.7; }
          54%  { opacity: 1; }
          91%  { opacity: 1;    transform: scale(1); }
          100% { opacity: 0;    transform: scale(0.98); }
        }
        @keyframes lastCallFade {
          0% { opacity: 0; } 6% { opacity: 1; } 91% { opacity: 1; } 100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .last-call-sign { animation: lastCallFade ${LAST_CALL_MS}ms linear forwards !important; }
        }
      `}</style>
    </div>
  )
}
