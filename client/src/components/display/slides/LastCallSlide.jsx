import { director } from '../../../audio/director.js'
import { useEffect, useRef } from 'react'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { useFitToBox } from '../../../lib/autoFitText.js'

// "Last Call" — a neon bar sign that tells the room to grab a drink before the
// next round. Theme-agnostic on purpose: it's a sign hanging in the bar, so its
// warm red/amber tube colors don't follow the theme; only the fonts do.
export const LAST_CALL_DEFAULT_TITLE = 'LAST CALL'
export const LAST_CALL_DEFAULT_SUBTITLE = 'Get your drinks in before the next round'

// Bar bell, synthesized — no asset file. A few inharmonic partials (bell
// ratios) with exponential decay, struck three times: ding-ding ... ding.
// Only audible once the TV has had its setup click (Display.jsx's
// onFirstInteraction); a cold tab just stays silent, the sign still shows.
export const PARTIALS = [[0.5, 0.35], [1, 1], [1.19, 0.45], [1.5, 0.3], [2, 0.5], [2.74, 0.22], [3.76, 0.12]]
export const STRIKES = [0, 0.32, 1.05]

// On the director's ONE shared context. audioContext() resolves null on a locked tab (and
// reports it), so a cold tab stays silent instead of ringing late at the next click, and the
// shared context is never closed here.
export function ringBell() {
  director.audioContext({ label: 'last-call bell' }).then(ctx => {
    if (!ctx) return
    try {
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
    } catch {}
  }).catch(() => {})
}

export default function LastCallSlide({ slide, isPreview }) {
  const { theme } = useTheme()
  const data = slide?.data ?? {}
  const title = data.title?.trim() || LAST_CALL_DEFAULT_TITLE
  const subtitle = data.subtitle?.trim() || LAST_CALL_DEFAULT_SUBTITLE

  // Once per slide mount on the live TV; never in the editor/preview. The ref
  // keeps StrictMode's dev double-effect from striking it twice.
  const rungRef = useRef(false)
  useEffect(() => {
    if (isPreview || rungRef.current) return
    rungRef.current = true
    ringBell()
  }, [isPreview])

  const titleBoxRef = useRef(null)
  const subBoxRef = useRef(null)
  const titlePx = useFitToBox(titleBoxRef, title, {
    family: theme.fonts.display, floorPx: 48, ceilPx: 260, maxLines: 2, lineHeight: 1,
  })
  const subPx = useFitToBox(subBoxRef, subtitle, {
    family: theme.fonts.body, floorPx: 20, ceilPx: 52, maxLines: 2, lineHeight: 1.2,
  })

  return (
    <div
      className="w-full h-full relative flex items-center justify-center overflow-hidden"
      style={{ containerType: 'size', background: 'transparent' }}
    >
      <div
        className="last-call-sign"
        style={{
          width: '76cqw',
          padding: '4cqh 4cqw',
          border: '0.45cqw solid #ffb347',
          borderRadius: '3cqw',
          boxShadow: '0 0 1.2cqw #ff9a1f, 0 0 4cqw #ff7a00aa, inset 0 0 1.6cqw #ff9a1f88',
          background: 'rgba(20,4,8,0.6)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          willChange: 'opacity, transform',
        }}
      >
        <div ref={titleBoxRef} style={{ width: '100%', height: '30cqh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            fontSize: titlePx, lineHeight: 1, textAlign: 'center',
            color: '#ffe6ea',
            textShadow: '0 0 0.4cqw #fff, 0 0 1.2cqw #ff2d55, 0 0 2.8cqw #ff2d55, 0 0 5cqw #ff0033',
          }}>{title}</div>
        </div>
        <div ref={subBoxRef} style={{ width: '100%', height: '11cqh', marginTop: '2cqh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="last-call-sub" style={{
            fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
            fontSize: subPx, lineHeight: 1.2, fontWeight: 700, textAlign: 'center', textWrap: 'balance',
            color: '#fff1d6',
            textShadow: '0 0 0.6cqw #ffb347, 0 0 1.8cqw #ff9a1f',
          }}>{subtitle}</div>
        </div>
      </div>
      <style>{`
        .last-call-sign { animation: lastCallOn 1.6s linear both; }
        .last-call-sub { animation: lastCallSubIn 0.5s ease-out 1.4s both; }
        @keyframes lastCallOn {
          0%   { opacity: 0;    transform: scale(0.97); }
          12%  { opacity: 0.9;  transform: scale(1); }
          20%  { opacity: 0.1; }
          30%  { opacity: 1; }
          38%  { opacity: 0.3; }
          50%  { opacity: 1; }
          60%  { opacity: 0.55; }
          70%  { opacity: 1; }
          100% { opacity: 1;    transform: scale(1); }
        }
        @keyframes lastCallSubIn { from { opacity: 0; transform: translateY(0.6cqh); } to { opacity: 1; transform: none; } }
        @keyframes lastCallFade { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .last-call-sign { animation: lastCallFade 0.4s ease-out both !important; }
          .last-call-sub { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
