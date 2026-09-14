import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { EASE_OUT, EASE_DROP } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { fitToBox, QUESTION_BOX } from '../../../lib/autoFitText.js'
import { keyframeStops, computeFractions, computeWinner, BEAT_MS } from '../../../lib/raceMath.js'

// Cinematic pacing (Ben, 2026-09-14: "as cinematic as it gets") — the final
// beat's leg plays in slow motion instead of one ordinary beat, so the pack
// runs at normal pace and the last leg to the line visibly stretches out.
// raceMath.js itself is untouched; this is a rendering-layer timing remap of
// its keyframeStops() output.
const FINISH_SLOWMO_MS = BEAT_MS * 2.5
// Dust trail lags the real sprite by this fraction of one lap.
const TRAIL_LAG = 0.035
const BOB_MS = 280
// Prime-ish stagger so the four horses never bob in sync (references/themes.md
// timing floors).
const BOB_DELAYS = [0, 47, 89, 131]
const GATE_ANGLE = -90

// Lane bounding boxes as % of the track container — lane 0 (innermost,
// contenders[0]) to lane 3 (outermost). Fixed shape: always 4 contenders.
const LANE_RX = [22, 30, 38, 46]
const LANE_RY = [15, 20.5, 26, 31.5]

function transformFor(angleDeg, flip) {
  return `translate(calc(cos(${angleDeg}deg) * 50%), calc(sin(${angleDeg}deg) * 50%)) scaleX(${flip ? -1 : 1})`
}

// 1-indexed current beat number (1..n) for the caption, given elapsed ms.
// The final leg (slow-mo) counts as beat n for the whole of its stretched
// duration, not just its instant of completion.
function beatIndexAt(elapsedMs, n) {
  if (n <= 0) return 0
  const lastLegStart = (n - 1) * BEAT_MS
  if (elapsedMs >= lastLegStart) return n
  return Math.min(n - 1, Math.floor(elapsedMs / BEAT_MS) + 1)
}

export default function RaceSlide({ slide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const data = slide.data ?? {}
  const contenders = Array.isArray(data.contenders) ? data.contenders : []
  const beats = Array.isArray(data.beats) ? data.beats : []
  const raceStartedAt = data.raceStartedAt ?? null
  const n = beats.length
  const slideKey = slide.id ?? 'race'

  const laneStops = n > 0 ? keyframeStops(beats) : []
  const winner = computeWinner(contenders, beats)
  const fractions = n > 0 ? computeFractions(beats).fractions : []

  const totalMs = n > 0 ? (n - 1) * BEAT_MS + FINISH_SLOWMO_MS : 0
  // Remap keyframeStops()'s raw percent to a cinematic timeline: every beat
  // before the last keeps its normal BEAT_MS pace, the last stretches to
  // FINISH_SLOWMO_MS. angleDeg/flip are untouched — only timing moves.
  const percentCinematic = n > 0
    ? Array.from({ length: n + 1 }, (_, k) => (k === n ? 100 : (k * BEAT_MS / totalMs) * 100))
    : []

  const initialElapsed = raceStartedAt ? Date.now() - raceStartedAt : 0
  const startedFinished = raceStartedAt != null && n > 0 && initialElapsed >= totalMs

  const [finished, setFinished] = useState(() => reduce || startedFinished)
  const [beatIdx, setBeatIdx] = useState(() => {
    if (reduce || startedFinished) return n
    if (!raceStartedAt) return 0
    return beatIndexAt(initialElapsed, n)
  })

  // Beat caption ticker + safety-net finish — the real finish trigger is the
  // winner lane's animationend below; this just keeps the caption current
  // and covers a reload/reconnect that lands mid-race (Seek, per spec).
  useEffect(() => {
    if (reduce || !raceStartedAt || finished || n === 0) return
    const tick = () => {
      const elapsedNow = Date.now() - raceStartedAt
      if (elapsedNow >= totalMs) {
        setBeatIdx(n)
        setFinished(true)
        return
      }
      setBeatIdx(beatIndexAt(elapsedNow, n))
    }
    tick()
    const id = setInterval(tick, BEAT_MS)
    return () => clearInterval(id)
  }, [reduce, raceStartedAt, finished, n, totalMs])

  const state = !raceStartedAt ? 'gate' : (finished ? 'finished' : 'running')

  function handleLaneAnimationEnd(e, i) {
    if (finished) return
    if (i !== winner.winnerIndex) return
    if (e.animationName !== `race-lane-${slideKey}-${i}`) return
    setFinished(true)
    setBeatIdx(n)
  }

  // ── Generated CSS: the counted keyframes tag (lane position only) ────────
  const laneKeyframeName = (i) => `race-lane-${slideKey}-${i}`
  const laneKeyframesCSS = contenders.map((c, i) => {
    const stops = laneStops[i] ?? []
    const rules = [`0% { transform: ${transformFor(GATE_ANGLE, false)}; }`]
    for (let k = 0; k < n; k += 1) {
      const stop = stops[k + 1]
      if (!stop) continue
      rules.push(`${percentCinematic[k + 1]}% { transform: ${transformFor(stop.angleDeg, stop.flip)}; }`)
    }
    return `@keyframes ${laneKeyframeName(i)} { ${rules.join(' ')} }`
  })
  const laneClassRules = contenders.map((c, i) =>
    `.${laneKeyframeName(i)} { animation-name: ${laneKeyframeName(i)}; animation-duration: ${totalMs}ms; animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); animation-fill-mode: forwards; }`
  ).join(' ')
  const keyframesStyleText = `${laneKeyframesCSS.join(' ')} ${laneClassRules}`

  // ── Generated CSS: cinematic flourish layers, own <style> tag so the
  // lane-count assertion above stays exact — camera push-in, dust trail,
  // gallop bob. All omitted under reduced motion (pure flourish, no
  // standings-bearing information). ──────────────────────────────────────
  let cinematicStyleText = ''
  if (!reduce && n > 0) {
    const trackPushName = `race-track-push-${slideKey}`
    const trackPushCSS = `@keyframes ${trackPushName} { 0%, 75% { transform: scale(1); } 100% { transform: scale(1.06); } } .${trackPushName} { animation-name: ${trackPushName}; animation-duration: ${totalMs}ms; animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); animation-fill-mode: forwards; }`

    const bobName = `race-bob-${slideKey}`
    const bobCSS = `@keyframes ${bobName} { 0% { transform: translate(-50%, -50%) translateY(0); } 50% { transform: translate(-50%, -50%) translateY(-6px); } 100% { transform: translate(-50%, -50%) translateY(0); } }`

    const trailName = (i) => `race-trail-${slideKey}-${i}`
    const trailKeyframesCSS = contenders.map((c, i) => {
      const col = fractions.map((row) => row[i] ?? 0)
      const rules = [`0% { transform: ${transformFor(GATE_ANGLE, false)}; }`]
      for (let k = 0; k < n; k += 1) {
        const f = Math.max(0, (col[k] ?? 0) - TRAIL_LAG)
        const angleDeg = GATE_ANGLE - f * 360
        const rad = (angleDeg * Math.PI) / 180
        rules.push(`${percentCinematic[k + 1]}% { transform: ${transformFor(angleDeg, Math.sin(rad) < 0)}; }`)
      }
      return `@keyframes ${trailName(i)} { ${rules.join(' ')} }`
    })
    const trailClassRules = contenders.map((c, i) =>
      `.${trailName(i)} { animation-name: ${trailName(i)}; animation-duration: ${totalMs}ms; animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); animation-fill-mode: forwards; }`
    ).join(' ')

    cinematicStyleText = `${trackPushCSS} ${bobCSS} ${trailKeyframesCSS.join(' ')} ${trailClassRules}`
  }

  const trackAnimated = !reduce && !!raceStartedAt && n > 0
  const trackStyle = {
    position: 'absolute', inset: 0, margin: 'auto', width: '62%', height: '62%', transformOrigin: 'center',
  }
  let trackClassName
  if (trackAnimated && !finished) {
    trackClassName = `race-track-push-${slideKey}`
    trackStyle.animationDelay = `-${initialElapsed}ms`
  } else if (trackAnimated && finished) {
    trackStyle.transform = 'scale(1.06)'
  } else {
    trackStyle.transform = 'scale(1)'
  }

  const captionText = state === 'gate' ? 'At the gate' : (beats[Math.max(0, beatIdx - 1)]?.label ?? '')

  const qFamily = theme.fonts.display
  const qSizePx = data.text
    ? fitToBox(data.text, { family: qFamily, boxW: QUESTION_BOX.boxW, boxH: 200, floorPx: 28, ceilPx: 48, maxLines: 3, lineHeight: 1.2 })
    : 0

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.colors.shinyBg }}>
      {/* Gold glow burst — fixed gold, theme-independent, same as every
          other shiny content renderer (copied from FlipEmDownSlide.jsx). */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
        background: `radial-gradient(ellipse at center, ${SHINY_GOLD_GLOW}55 0%, transparent 58%)`,
        animation: 'shinyGlow 0.75s ease-out forwards',
      }} />
      <div style={{ position: 'absolute', top: 28, left: 30, zIndex: 40, fontSize: 40, filter: `drop-shadow(0 0 12px ${SHINY_GOLD_GLOW})` }}>✨</div>

      <style data-race-keyframes>{keyframesStyleText}</style>
      {cinematicStyleText && <style data-race-cinematic-keyframes>{cinematicStyleText}</style>}

      {data.text && (
        <div style={{ position: 'absolute', top: 30, left: 0, right: 0, textAlign: 'center', zIndex: 40, padding: '0 60px' }}>
          <p style={{ margin: 0, color: theme.colors.text, fontFamily: `'${qFamily}', 'Boogaloo', cursive`, fontSize: `${qSizePx}px`, textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>{data.text}</p>
        </div>
      )}

      {/* Label chips — the pick list, stacked outside the track. */}
      <div style={{ position: 'absolute', left: 40, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 18, zIndex: 50 }}>
        {contenders.map((c, i) => {
          const isWinnerLane = winner.winnerIndex === i
          const dim = state === 'finished' && !isWinnerLane
          const ring = state === 'finished' && isWinnerLane
          return (
            <motion.div
              key={c.id}
              animate={{ scale: reduce ? 1 : (ring ? 1.06 : 1), opacity: dim ? 0.55 : 1 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10,
                background: 'rgba(0,0,0,0.35)',
                boxShadow: ring ? `0 0 0 3px ${SHINY_GOLD}` : 'none',
              }}
            >
              {c.imageUrl && <img src={c.imageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />}
              <span style={{ color: theme.colors.text, fontFamily: `'${theme.fonts.display}', 'Boogaloo', cursive`, fontSize: '1.2rem' }}>{c.name}</span>
            </motion.div>
          )
        })}
      </div>

      {/* Track container — camera push-in scales this ancestor, not the
          individual lane wrappers (their own translate(%) math must stay
          relative to their own unscaled bounding box). */}
      <div data-race-track className={trackClassName} style={trackStyle}>
        {/* Finish line: static radial bar at the top of the ellipse, crosses
            all four lanes since every lane starts/finishes at this angle. */}
        <div aria-hidden style={{
          position: 'absolute', left: '50%', top: `${50 - LANE_RY[LANE_RY.length - 1]}%`,
          height: `${LANE_RY[LANE_RY.length - 1]}%`, width: 8, transform: 'translateX(-50%)', zIndex: 30,
          background: `repeating-conic-gradient(${SHINY_GOLD} 0% 25%, #1a1a1a 0% 50%) 0 0 / 16px 16px`,
          boxShadow: `0 0 14px ${SHINY_GOLD_GLOW}`,
        }} />

        {contenders.map((c, i) => {
          const rx = LANE_RX[i % LANE_RX.length]
          const ry = LANE_RY[i % LANE_RY.length]
          const stops = laneStops[i] ?? []
          const finalStop = stops[n] ?? { angleDeg: GATE_ANGLE, flip: false }
          const isWinnerLane = winner.winnerIndex === i
          const laneName = laneKeyframeName(i)

          const wrapperStyle = {
            position: 'absolute', inset: 0, margin: 'auto', width: `${2 * rx}%`, height: `${2 * ry}%`, zIndex: 10 + i,
          }
          let className
          if (state === 'running') {
            className = laneName
            wrapperStyle.transform = transformFor(GATE_ANGLE, false)
            wrapperStyle.animationDelay = `-${initialElapsed}ms`
          } else if (state === 'finished') {
            wrapperStyle.transform = transformFor(finalStop.angleDeg, finalStop.flip)
            wrapperStyle.animation = 'none'
          } else {
            wrapperStyle.transform = transformFor(GATE_ANGLE, false)
            wrapperStyle.animation = 'none'
          }

          const dim = state === 'finished' && !isWinnerLane
          const bobStyle = (!reduce && state === 'running')
            ? { animation: `race-bob-${slideKey} ${BOB_MS}ms ease-in-out ${BOB_DELAYS[i % BOB_DELAYS.length]}ms infinite`, opacity: dim ? 0.55 : 1 }
            : { transform: 'translate(-50%, -50%)', opacity: dim ? 0.55 : 1 }

          return (
            <div key={c.id}>
              {!reduce && state === 'running' && (
                <div
                  data-race-trail
                  style={{ position: 'absolute', inset: 0, margin: 'auto', width: `${2 * rx}%`, height: `${2 * ry}%`, zIndex: 5 + i }}
                  className={`race-trail-${slideKey}-${i}`}
                >
                  <span aria-hidden style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    fontSize: 44, opacity: 0.3, filter: 'blur(3px)',
                  }}>🐎</span>
                </div>
              )}
              <div
                data-race-lane
                data-race-state={state}
                {...(isWinnerLane && state === 'finished' ? { 'data-race-winner': 'true' } : {})}
                className={className}
                style={wrapperStyle}
                onAnimationEnd={(e) => handleLaneAnimationEnd(e, i)}
              >
                <div style={{ position: 'absolute', top: '50%', left: '50%', ...bobStyle }}>
                  {/* Build placeholder — swap for public/race/horse-{i+1}.png
                      once the sprite art passes review (spec's Sprites section). */}
                  <span style={{ fontSize: 48, display: 'block' }}>🐎</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Beat caption, bottom-center. */}
      <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', zIndex: 40 }}>
        <span style={{
          color: theme.colors.text, fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
          fontSize: '1.3rem', fontWeight: 600, textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}>{captionText}</span>
      </div>

      {state === 'finished' && (
        <>
          <motion.div
            data-race-vignette
            initial={{ opacity: 0 }}
            animate={reduce ? { opacity: 0.35 } : { opacity: [0, 0.35, 0] }}
            transition={{ duration: 0.5 }}
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 45,
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, transparent 70%)',
            }}
          />
          <motion.div
            initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.32, ease: EASE_DROP }}
            style={{
              position: 'absolute', bottom: 70, left: 0, right: 0, textAlign: 'center', zIndex: 46,
              color: SHINY_GOLD, fontFamily: `'${theme.fonts.display}', 'Boogaloo', cursive`,
              fontSize: '3rem', fontWeight: 700, textShadow: `0 0 20px ${SHINY_GOLD_GLOW}`,
            }}
          >
            🏆 {winner.winnerName}
          </motion.div>
        </>
      )}
    </div>
  )
}
