import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { EASE_OUT, EASE_DROP } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import ShinySignal from '../ShinySignal.jsx'
import { fitToBox, QUESTION_BOX } from '../../../lib/autoFitText.js'
import { keyframeStops, computeFractions, computeWinner, LANE_COLORS } from '../../../lib/raceMath.js'

// Straight left-to-right sprint (Ben, 2026-09-15: carnival/fairground
// mechanical-derby-game read — supersedes the earlier one-lap oval design).
// The whole race is fixed at TOTAL_RACE_MS regardless of beat count (Ben,
// 2026-09-15: "the race in total should take 15 seconds", revised same day
// to 30s) — leg duration is derived from that fixed total and the beat
// count, not the other way around. The final leg still plays in slow motion
// (Ben, 2026-09-14: "as cinematic as it gets") so the pack runs at a normal
// clip and only the stretch to the line visibly stretches out; SLOWMO_MULT
// is that leg's weight relative to one normal leg, not a duration in ms.
const TOTAL_RACE_MS = 30000
const SLOWMO_MULT = 2.5
// Gate beat (Ben, 2026-09-15: "see how to make it more cinematic" — Fable
// cinematic-pass idea #2): a pre-roll before real motion starts, so the
// launch reads as shot, not cut. Separate from TOTAL_RACE_MS, which is the
// promise about the RACE itself — this is what comes before it.
const GATE_MS = 1100
// A winner margin under this fraction of their own final total reads as a
// photo finish — earns the "PHOTO FINISH" stamp (Fable idea #4).
const FINISH_STAMP_MARGIN = 0.05
// Dust trail lags the real sprite by this fraction of the run length.
const TRAIL_LAG = 0.035
// Gallop bob cycle. Slower than the original 280ms (Ben, 2026-09-15:
// "choppy and not smooth") — a longer cycle plus the rounder 5-stop arc
// above reads as a stride, not a vibration.
const BOB_MS = 420
// Prime-ish stagger so the four horses never bob in sync (references/themes.md
// timing floors).
const BOB_DELAYS = [0, 47, 89, 131]

// Fraction 0..1 (start line to finish line) maps to this % of the track
// box's own width — leaves margin for the finish line + a little breathing
// room past it. 4 lanes, evenly spaced rows.
const RUN_WIDTH_PCT = 88
const LANE_TOP_PCT = [14, 38, 62, 86]
const LANE_ROW_PCT = 20
// Track box's own size, % of the slide — named so the label chips (outside
// the track box) can derive their stage-relative vertical position from the
// same numbers instead of duplicating a second guess at where each lane row
// actually lands.
const TRACK_WIDTH_PCT = 84
const TRACK_HEIGHT_PCT = 64
const TRACK_TOP_OFFSET_PCT = (100 - TRACK_HEIGHT_PCT) / 2
function chipTopPct(i) {
  return TRACK_TOP_OFFSET_PCT + (LANE_TOP_PCT[i % LANE_TOP_PCT.length] / 100) * TRACK_HEIGHT_PCT
}

// Carnival trim (Fable idea #7): pennant bunting along the top edge, chasing
// marquee bulbs along the bottom edge. Silk colors + gold, kept low-alpha so
// they never out-compete the horses — trim, not signal.
const TRIM_COUNT = 12
const TRIM_COLORS = [...LANE_COLORS, SHINY_GOLD]

// Percentage transforms here resolve against the ANIMATED element's own box
// (never the parent's) — so every lane wrapper is pre-sized to exactly
// RUN_WIDTH_PCT of the track, and translateX(100%) on it covers exactly the
// run length. translateY(-50%) centers the wrapper on its lane's row line;
// it's baked into every stop so it never fights the horizontal animation.
function transformFor(fraction) {
  return `translateY(-50%) translateX(${fraction * 100}%)`
}

// 1-indexed current beat number (1..n) for the caption, given elapsed ms
// since raceStartedAt (i.e. including the GATE_MS pre-roll). 0 means still
// in the gate hold — no beat yet. The final leg (slow-mo) counts as beat n
// for the whole of its stretched duration, not just its instant of completion.
function beatIndexAt(elapsedMs, n, legMs) {
  if (n <= 0) return 0
  if (elapsedMs < GATE_MS) return 0
  const running = elapsedMs - GATE_MS
  const lastLegStart = (n - 1) * legMs
  if (running >= lastLegStart) return n
  return Math.min(n - 1, Math.floor(running / legMs) + 1)
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
  const { fractions, winnerFinal } = n > 0 ? computeFractions(beats) : { fractions: [], winnerFinal: 0 }
  const isCloseFinish = winner.winnerIndex !== null && winnerFinal > 0 && (winner.margin / winnerFinal) < FINISH_STAMP_MARGIN

  const totalMs = n > 0 ? GATE_MS + TOTAL_RACE_MS : 0
  // One normal-paced leg from gate through beat n-1, then one slow-mo leg
  // into the finish — (n-1) + SLOWMO_MULT total weight units spread across
  // the fixed TOTAL_RACE_MS envelope (the gate hold is separate, added on
  // top). n===1 has no normal legs; the single leg just takes the whole race.
  const legMs = n > 1 ? TOTAL_RACE_MS / ((n - 1) + SLOWMO_MULT) : TOTAL_RACE_MS
  const gatePercent = totalMs > 0 ? (GATE_MS / totalMs) * 100 : 0
  // Remap keyframeStops()'s raw percent to this cinematic timeline: the gate
  // hold owns [0, gatePercent], then every beat before the last keeps its
  // normal legMs pace, the last stretches to fill the rest of totalMs.
  // fraction values are untouched — only timing moves.
  const percentCinematic = n > 0
    ? Array.from({ length: n + 1 }, (_, k) => (k === n ? 100 : gatePercent + (k * legMs / TOTAL_RACE_MS) * (100 - gatePercent)))
    : []

  // Frozen once per raceStartedAt (Seek) — recomputing Date.now() - raceStartedAt
  // on every re-render (the beat ticker re-renders every legMs) would re-seek
  // the CSS animation-delay forward each beat, running the race at ~2x speed
  // with visible teleports instead of seeking only on mount/reload/reconnect.
  const initialElapsed = useMemo(() => (raceStartedAt ? Date.now() - raceStartedAt : 0), [raceStartedAt])
  const startedFinished = raceStartedAt != null && n > 0 && initialElapsed >= totalMs

  const [finished, setFinished] = useState(() => reduce || startedFinished)
  const [beatIdx, setBeatIdx] = useState(() => {
    if (reduce || startedFinished) return n
    if (!raceStartedAt) return 0
    return beatIndexAt(initialElapsed, n, legMs)
  })

  // Re-sync on every raceStartedAt transition, not just on mount. useState's
  // initializer only runs once, so without this a Reset (raceStartedAt -> null)
  // followed by a fresh Start Race leaves `finished` stuck true from the
  // previous run — the display jumps straight to the winner slam with no
  // race, spoiling the answer live. Also covers useReducedMotion() resolving
  // after mount (it starts `undefined`/false on first render in some browsers).
  useEffect(() => {
    if (reduce) {
      setFinished(true)
      setBeatIdx(n)
      return
    }
    setFinished(startedFinished)
    setBeatIdx(raceStartedAt ? beatIndexAt(initialElapsed, n, legMs) : 0)
  }, [reduce, n, raceStartedAt, startedFinished, initialElapsed, legMs])

  // Beat caption ticker + safety-net finish — the real finish trigger is the
  // winner lane's animationend below; this just keeps the caption current
  // and covers a reload/reconnect that lands mid-race (Seek, per spec). Ticks
  // at GATE_MS first (to clear the gate-hold caption on schedule) then at
  // legMs pace once beats start.
  useEffect(() => {
    if (reduce || !raceStartedAt || finished || n === 0) return
    const tick = () => {
      const elapsedNow = Date.now() - raceStartedAt
      if (elapsedNow >= totalMs) {
        setBeatIdx(n)
        setFinished(true)
        return
      }
      setBeatIdx(beatIndexAt(elapsedNow, n, legMs))
    }
    tick()
    const id = setInterval(tick, Math.max(1, Math.min(GATE_MS, legMs)))
    return () => clearInterval(id)
  }, [reduce, raceStartedAt, finished, n, totalMs, legMs])

  // Sound (Fable idea #1 — "the single biggest 'directed' jump"): gate bell
  // + a looping crowd/hoofbeat bed on launch, a finish horn on the win.
  // CC0 assets, licensed for this commercial venue — see public/race/ for
  // sources. Fire-and-forget: audio never drives the visual timeline, that
  // stays CSS-only (Seek must keep working even if a clip fails to load).
  // Guarded to the real live transition only — a display that reconnects or
  // mounts mid/post-race stays silent, it doesn't replay the whole cue set.
  const loopAudioRef = useRef(null)
  const prevRaceStartedAtRef = useRef(raceStartedAt)
  useEffect(() => {
    const prevStartedAt = prevRaceStartedAtRef.current
    prevRaceStartedAtRef.current = raceStartedAt
    if (reduce || !raceStartedAt || raceStartedAt === prevStartedAt || startedFinished) return
    let bell, loop
    try {
      bell = new Audio('/race/gate-bell.mp3')
      bell.volume = 0.7
      bell.play().catch(() => {})
      loop = new Audio('/race/crowd-hoofbeats-loop.mp3')
      loop.loop = true
      loop.volume = 0.32
      loop.play().catch(() => {})
      loopAudioRef.current = loop
    } catch (_) { /* a failed/blocked clip must never break the race */ }
    return () => {
      loop?.pause?.()
      if (loopAudioRef.current === loop) loopAudioRef.current = null
    }
  }, [raceStartedAt, reduce, startedFinished])

  const prevFinishedRef = useRef(finished)
  useEffect(() => {
    const wasFinished = prevFinishedRef.current
    prevFinishedRef.current = finished
    if (reduce || !finished || wasFinished) return
    loopAudioRef.current?.pause?.()
    loopAudioRef.current = null
    try {
      const horn = new Audio('/race/finish-horn.mp3')
      horn.volume = 0.75
      horn.play().catch(() => {})
    } catch (_) { /* a failed/blocked clip must never break the race */ }
  }, [finished, reduce])

  const state = !raceStartedAt ? 'gate' : (finished ? 'finished' : 'running')

  // Lead-change detection (Fable idea #3) — raceMath's computeWinner already
  // tracks the leader at every beat; this just reacts to it moving.
  const currentLeaderIdx = beatIdx > 0 ? winner.leaderPerBeat[beatIdx - 1] : null
  const prevLeaderIdx = beatIdx > 1 ? winner.leaderPerBeat[beatIdx - 2] : null
  const isLeadChange = state === 'running' && beatIdx > 1 && currentLeaderIdx !== null && currentLeaderIdx !== prevLeaderIdx

  function handleLaneAnimationEnd(e, i) {
    if (finished) return
    if (i !== winner.winnerIndex) return
    if (e.animationName !== `race-lane-${slideKey}-${i}`) return
    setFinished(true)
    setBeatIdx(n)
  }

  // ── Generated CSS: the counted keyframes tag (lane position only) ────────
  // Ben, 2026-09-15: "it feels choppy and not smooth" — killed the
  // mechanical clack-step timing (Fable idea #5) that used to live here. A
  // single smooth curve for the whole run (the class's own cubic-bezier
  // below) reads as a real gallop; discrete steps() on top of a smooth bob
  // just looked broken.
  const laneKeyframeName = (i) => `race-lane-${slideKey}-${i}`
  const laneKeyframesCSS = contenders.map((c, i) => {
    const stops = laneStops[i] ?? []
    const rules = [
      `0% { transform: ${transformFor(0)}; }`,
      `${gatePercent}% { transform: ${transformFor(0)}; }`,
    ]
    for (let k = 0; k < n; k += 1) {
      const stop = stops[k + 1]
      if (!stop) continue
      rules.push(`${percentCinematic[k + 1]}% { transform: ${transformFor(stop.fraction)}; }`)
    }
    return `@keyframes ${laneKeyframeName(i)} { ${rules.join(' ')} }`
  })
  const laneClassRules = contenders.map((c, i) =>
    `.${laneKeyframeName(i)} { animation-name: ${laneKeyframeName(i)}; animation-duration: ${totalMs}ms; animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); animation-fill-mode: forwards; }`
  ).join(' ')
  const keyframesStyleText = `${laneKeyframesCSS.join(' ')} ${laneClassRules}`

  // ── Generated CSS: cinematic flourish layers, own <style> tag so the
  // lane-count assertion above stays exact — camera push-in, dust trail,
  // gallop bob, gate lights, chase bulbs. All omitted under reduced motion
  // (pure flourish, no standings-bearing information). ─────────────────────
  let cinematicStyleText = ''
  const gateRedName = `race-gate-red-${slideKey}`
  const gateAmberName = `race-gate-amber-${slideKey}`
  const gateGreenName = `race-gate-green-${slideKey}`
  const bulbName = `race-bulb-${slideKey}`
  const backdropName = `race-backdrop-${slideKey}`
  if (!reduce && n > 0) {
    const trackPushName = `race-track-push-${slideKey}`
    const trackPushCSS = `@keyframes ${trackPushName} { 0%, 75% { transform: scale(1); } 100% { transform: scale(1.06) translateX(-1.5%); } } .${trackPushName} { animation-name: ${trackPushName}; animation-duration: ${totalMs}ms; animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); animation-fill-mode: forwards; }`

    // Smoother, slower gallop bob (Ben, 2026-09-15, same "choppy" note) —
    // 4 interior stops instead of 1 give the up/down arc a rounder shape,
    // and a longer cycle reads as a stride, not a vibration.
    const bobName = `race-bob-${slideKey}`
    const bobCSS = `@keyframes ${bobName} { 0% { transform: translate(-50%, -50%) translateY(0); } 25% { transform: translate(-50%, -50%) translateY(-3px); } 50% { transform: translate(-50%, -50%) translateY(-6px); } 75% { transform: translate(-50%, -50%) translateY(-3px); } 100% { transform: translate(-50%, -50%) translateY(0); } }`

    const trailName = (i) => `race-trail-${slideKey}-${i}`
    const trailKeyframesCSS = contenders.map((c, i) => {
      const col = fractions.map((row) => row[i] ?? 0)
      const rules = [`0% { transform: ${transformFor(0)}; }`, `${gatePercent}% { transform: ${transformFor(0)}; }`]
      for (let k = 0; k < n; k += 1) {
        const f = Math.max(0, (col[k] ?? 0) - TRAIL_LAG)
        rules.push(`${percentCinematic[k + 1]}% { transform: ${transformFor(f)}; }`)
      }
      return `@keyframes ${trailName(i)} { ${rules.join(' ')} }`
    })
    const trailClassRules = contenders.map((c, i) =>
      `.${trailName(i)} { animation-name: ${trailName(i)}; animation-duration: ${totalMs}ms; animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); animation-fill-mode: forwards; }`
    ).join(' ')

    // Gate lights (Fable idea #2) — red/amber/green, each lit for one third
    // of the gate-hold window, generated from the same gatePercent the lane
    // keyframes use so they always line up with the real hold duration.
    const third = gatePercent / 3
    const lightSeg = (onStart, onEnd) =>
      `0% { opacity: .18; } ${onStart}% { opacity: .18; } ${onStart}% { opacity: 1; } ${onEnd}% { opacity: 1; } ${onEnd}% { opacity: .18; } 100% { opacity: .18; }`
    const gateLightsCSS = [
      `@keyframes ${gateRedName} { ${lightSeg(0, third)} }`,
      `@keyframes ${gateAmberName} { ${lightSeg(third, third * 2)} }`,
      `@keyframes ${gateGreenName} { ${lightSeg(third * 2, gatePercent)} }`,
      `.${gateRedName} { animation: ${gateRedName} ${totalMs}ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }`,
      `.${gateAmberName} { animation: ${gateAmberName} ${totalMs}ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }`,
      `.${gateGreenName} { animation: ${gateGreenName} ${totalMs}ms cubic-bezier(0.4, 0, 0.2, 1) forwards; }`,
    ].join(' ')

    const bulbCSS = `@keyframes ${bulbName} { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }`

    // Scrolling crowd backdrop (Fable idea #8) — two tiles side by side,
    // translateX by exactly -50% of the pair (= one tile width) so the loop
    // seam is invisible; ambient only, not Seek-synced (ok per Task A's own
    // read: ship subtle, this is atmosphere not a standings signal).
    const backdropCSS = `@keyframes ${backdropName} { from { transform: translateX(0); } to { transform: translateX(-50%); } } .${backdropName} { animation: ${backdropName} 14s linear infinite; }`

    cinematicStyleText = `${trackPushCSS} ${bobCSS} ${trailKeyframesCSS.join(' ')} ${trailClassRules} ${gateLightsCSS} ${bulbCSS} ${backdropCSS}`
  }

  const trackAnimated = !reduce && !!raceStartedAt && n > 0
  // Track surface: a flat rectangular lane panel (references/themes.md rule
  // 6, no hard edges — soft fill + hairline border, not a stark box).
  // theme.colors.text at low alpha is what every other subtle-surface-on-
  // shinyBg element already uses (HuesCuesBoard's swatch borders, status
  // lines, etc.) — guaranteed real contrast against shinyBg on any theme.
  const trackStyle = {
    position: 'absolute', inset: 0, margin: 'auto', width: `${TRACK_WIDTH_PCT}%`, height: `${TRACK_HEIGHT_PCT}%`,
    // Camera racks toward the finish post, not dead-center (Fable idea #6) —
    // the push-in's zoom anchor sits exactly where the finish line renders.
    transformOrigin: `${RUN_WIDTH_PCT}% 50%`,
    borderRadius: 18,
    background: `linear-gradient(180deg, transparent 0%, ${theme.colors.text}4d 6%, ${theme.colors.text}4d 94%, transparent 100%)`,
    border: `1px solid ${theme.colors.text}66`,
  }
  let trackClassName
  if (trackAnimated && !finished) {
    trackClassName = `race-track-push-${slideKey}`
    trackStyle.animationDelay = `-${initialElapsed}ms`
  } else if (trackAnimated && finished) {
    trackStyle.transform = 'scale(1.06) translateX(-1.5%)'
  } else {
    trackStyle.transform = 'scale(1)'
  }

  const captionText = state === 'gate'
    ? 'At the gate'
    : state === 'running' && beatIdx === 0
      ? 'Riders, to the line…'
      : state === 'running' && beatIdx === 1
        ? "And they're off!"
        : isLeadChange
          ? `Lead change — ${contenders[currentLeaderIdx]?.name ?? ''} takes it!`
          : (beats[Math.max(0, beatIdx - 1)]?.label || `Beat ${beatIdx}`)

  const qFamily = theme.fonts.display
  // Memoized — the beat ticker re-renders this component every leg, and
  // fitToBox's canvas measurement + binary search shouldn't re-run on every
  // one of those when data.text/qFamily haven't changed.
  const qSizePx = useMemo(() => (
    data.text
      ? fitToBox(data.text, { family: qFamily, boxW: QUESTION_BOX.boxW, boxH: 200, floorPx: 28, ceilPx: 48, maxLines: 3, lineHeight: 1.2 })
      : 0
  ), [data.text, qFamily])

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.colors.shinyBg }}>
      {/* Gold glow burst + ✨ badge — fixed gold, theme-independent, same as every
          other shiny content renderer (copied from FlipEmDownSlide.jsx). */}
      <ShinySignal />

      <style data-race-keyframes>{keyframesStyleText}</style>
      {cinematicStyleText && <style data-race-cinematic-keyframes>{cinematicStyleText}</style>}

      {data.text && (
        <div style={{ position: 'absolute', top: 30, left: 0, right: 0, textAlign: 'center', zIndex: 40, padding: '0 60px' }}>
          <p style={{ margin: 0, color: theme.colors.text, fontFamily: `'${qFamily}', 'Boogaloo', sans-serif`, fontSize: `${qSizePx}px`, textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>{data.text}</p>
        </div>
      )}

      {/* Label chips — one per lane, aligned to that lane's own row so a
          name reads as belonging to its horse, not a floating pick list. */}
      {contenders.map((c, i) => {
        const isWinnerLane = winner.winnerIndex === i
        const dim = state === 'finished' && !isWinnerLane
        const ring = state === 'finished' && isWinnerLane
        const pulse = isLeadChange && i === currentLeaderIdx
        return (
          <div key={c.id} style={{ position: 'absolute', left: 24, top: `${chipTopPct(i)}%`, transform: 'translateY(-50%)', zIndex: 50 }}>
            <motion.div
              animate={{ scale: reduce ? 1 : (ring ? 1.06 : (pulse ? 1.08 : 1)), opacity: dim ? 0.55 : 1 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10,
                background: 'rgba(0,0,0,0.35)',
                boxShadow: ring ? `0 0 0 3px ${SHINY_GOLD}` : 'none',
              }}
            >
              <span aria-hidden style={{
                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                background: LANE_COLORS[i % LANE_COLORS.length],
                boxShadow: '0 0 6px rgba(0,0,0,0.4)',
              }} />
              {c.imageUrl && <img src={c.imageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />}
              <span style={{ color: theme.colors.text, fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`, fontSize: '1.2rem' }}>{c.name || `Contender ${i + 1}`}</span>
            </motion.div>
          </div>
        )
      })}

      {/* Track container — camera push-in scales this ancestor, not the
          individual lane wrappers (their own translate(%) math must stay
          relative to their own unscaled bounding box). */}
      <div data-race-track className={trackClassName} style={trackStyle}>
        {/* Scrolling crowd backdrop (Fable idea #8) — sits inside the panel,
            under the lane dividers/horses, at low opacity so it reads as
            atmosphere behind the race, not a competing shape. Two tiles so
            the translateX(-50%) loop never shows a seam. */}
        {!reduce && (
          <div aria-hidden style={{
            position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0,
            opacity: 0.14, pointerEvents: 'none', borderRadius: 18,
          }}>
            <div className={state === 'running' ? backdropName : undefined} style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, width: '200%', display: 'flex',
            }}>
              <img src="/race/backdrop-crowd.png" alt="" style={{ height: '100%', width: '50%', objectFit: 'cover' }} />
              <img src="/race/backdrop-crowd.png" alt="" style={{ height: '100%', width: '50%', objectFit: 'cover' }} />
            </div>
          </div>
        )}

        {/* Finish line: static vertical bar at the end of the run, crosses
            all four lanes since every lane's fraction domain ends here. */}
        <div aria-hidden style={{
          position: 'absolute', left: `${RUN_WIDTH_PCT}%`, top: 0, bottom: 0,
          width: 8, transform: 'translateX(-50%)', zIndex: 30,
          background: `repeating-conic-gradient(${SHINY_GOLD} 0% 25%, #1a1a1a 0% 50%) 0 0 / 16px 16px`,
          boxShadow: `0 0 14px ${SHINY_GOLD_GLOW}`,
        }} />

        {/* Faint lane-divider rules — static (never animated), so it reads
            as a fixed track under the moving sprites rather than a shape
            that moves along with them. */}
        {LANE_TOP_PCT.slice(0, -1).map((top, i) => (
          <div key={`rail-${i}`} aria-hidden style={{
            position: 'absolute', left: 0, right: 0, top: `${(top + LANE_TOP_PCT[i + 1]) / 2}%`,
            borderTop: `1px solid ${theme.colors.text}22`, zIndex: 1,
          }} />
        ))}

        {/* Carnival trim — pennant bunting along the top edge (static), a
            chasing marquee bulb string along the bottom edge (Fable idea
            #7). Low alpha throughout — trim, never competes with the horses. */}
        {Array.from({ length: TRIM_COUNT }).map((_, i) => (
          <div key={`bunting-${i}`} aria-hidden style={{
            position: 'absolute', left: `${(i / (TRIM_COUNT - 1)) * 100}%`, top: 0,
            width: '3%', height: 12, transform: 'translate(-50%, -70%)',
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            background: TRIM_COLORS[i % TRIM_COLORS.length], opacity: 0.55, zIndex: 2,
          }} />
        ))}
        {!reduce && Array.from({ length: TRIM_COUNT }).map((_, i) => (
          <div key={`bulb-${i}`} aria-hidden style={{
            position: 'absolute', left: `${(i / (TRIM_COUNT - 1)) * 100}%`, top: '100%',
            width: 6, height: 6, borderRadius: '50%', transform: 'translate(-50%, -50%)',
            background: SHINY_GOLD, boxShadow: `0 0 4px ${SHINY_GOLD_GLOW}`, zIndex: 2,
            opacity: state === 'running' ? undefined : (state === 'finished' ? 1 : 0.25),
            animation: state === 'running' ? `${bulbName} 900ms ease-in-out ${(i * 900) / TRIM_COUNT}ms infinite` : 'none',
          }} />
        ))}

        {/* Gate lights — red/amber/green, lit in sequence through the
            GATE_MS hold then off for the rest of the race (Fable idea #2). */}
        {trackAnimated && !finished && (
          <div aria-hidden style={{ position: 'absolute', left: 4, top: -22, display: 'flex', gap: 4, zIndex: 30 }}>
            {[['#e8483c', gateRedName], ['#f0b23c', gateAmberName], ['#3ce87c', gateGreenName]].map(([color, animName]) => (
              <span key={animName} className={animName} style={{
                width: 8, height: 8, borderRadius: '50%', background: color,
                animationDelay: `-${initialElapsed}ms`, boxShadow: `0 0 4px ${color}`,
              }} />
            ))}
          </div>
        )}

        {contenders.map((c, i) => {
          const stops = laneStops[i] ?? []
          const finalStop = stops[n] ?? { fraction: 0 }
          const isWinnerLane = winner.winnerIndex === i
          const laneName = laneKeyframeName(i)

          const wrapperStyle = {
            position: 'absolute', left: 0, top: `${LANE_TOP_PCT[i % LANE_TOP_PCT.length]}%`,
            width: `${RUN_WIDTH_PCT}%`, height: `${LANE_ROW_PCT}%`, zIndex: 10 + i,
          }
          let className
          if (state === 'running') {
            className = laneName
            wrapperStyle.transform = transformFor(0)
            wrapperStyle.animationDelay = `-${initialElapsed}ms`
          } else if (state === 'finished') {
            wrapperStyle.transform = transformFor(finalStop.fraction)
            wrapperStyle.animation = 'none'
          } else {
            wrapperStyle.transform = transformFor(0)
            wrapperStyle.animation = 'none'
          }

          const dim = state === 'finished' && !isWinnerLane
          const bobbing = !reduce && state === 'running' && beatIdx > 0
          const bobStyle = bobbing
            ? { animation: `race-bob-${slideKey} ${BOB_MS}ms ease-in-out ${BOB_DELAYS[i % BOB_DELAYS.length]}ms infinite`, opacity: dim ? 0.55 : 1 }
            : { transform: 'translate(-50%, -50%)', opacity: dim ? 0.55 : 1 }

          return (
            <div key={c.id}>
              {!reduce && state === 'running' && beatIdx > 0 && (
                <div
                  data-race-trail
                  style={{ position: 'absolute', left: 0, top: `${LANE_TOP_PCT[i % LANE_TOP_PCT.length]}%`, width: `${RUN_WIDTH_PCT}%`, height: `${LANE_ROW_PCT}%`, zIndex: 5 + i, animationDelay: `-${initialElapsed}ms` }}
                  className={`race-trail-${slideKey}-${i}`}
                >
                  <img
                    src={`/race/horse-${i + 1}.png`}
                    alt="" aria-hidden="true"
                    style={{
                      position: 'absolute', top: '50%', left: 0, transform: 'translate(-50%, -50%)',
                      height: 44, width: 'auto', opacity: 0.3, filter: 'blur(3px)',
                    }}
                  />
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
                <div style={{ position: 'absolute', top: '50%', left: 0, ...bobStyle }}>
                  {/* horse-{i+1}.png carries this lane's jockey-silk color
                      baked in (LANE_COLORS), so the room tracks a name to a
                      horse without extra chrome around the sprite. Single
                      frame + bob only (Ben, 2026-09-15: the 2-frame gallop
                      crossfade read as choppy — reverted; see git history if
                      it's worth another pass with a slower/subtler flip). */}
                  <img
                    src={`/race/horse-${i + 1}.png`}
                    alt=""
                    style={{ height: 56, width: 'auto', display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Beat caption, bottom-center. */}
      <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', zIndex: 40 }}>
        <span data-race-caption style={{
          color: theme.colors.text, fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
          fontSize: '1.3rem', fontWeight: 600, textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}>{captionText}</span>
      </div>

      {state === 'finished' && (
        <>
          {/* Wire flash — an instant white pop at the moment of finish,
              before the hold that leads into the winner reveal (Fable idea
              #4: sequence the finish instead of landing everything at once). */}
          {!reduce && (
            <motion.div
              data-race-flash
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.85, 0] }}
              transition={{ duration: 0.16, times: [0, 0.35, 1] }}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 44, background: '#ffffff' }}
            />
          )}
          <motion.div
            data-race-vignette
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.35, 0] }}
            transition={{ duration: 0.5, delay: reduce ? 0 : 0.42 }}
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 45,
              // Dark at the EDGES fading to transparent at center — a
              // vignette frames the shot, it doesn't darken the subject
              // (the horses/winner name) it's supposed to be punctuating.
              background: 'radial-gradient(ellipse at center, transparent 0%, transparent 45%, rgba(0,0,0,0.55) 100%)',
            }}
          />
          {!reduce && isCloseFinish && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.22, delay: 0.42, ease: EASE_OUT }}
              style={{
                position: 'absolute', top: '34%', left: 0, right: 0, textAlign: 'center', zIndex: 46,
                color: SHINY_GOLD, fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
                fontWeight: 800, letterSpacing: '0.08em', fontSize: '1.1rem', textShadow: `0 0 12px ${SHINY_GOLD_GLOW}`,
              }}
            >
              PHOTO FINISH
            </motion.div>
          )}
          <motion.div
            initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.32, ease: EASE_DROP, delay: reduce ? 0 : 0.48 }}
            style={{
              position: 'absolute', bottom: 70, left: 0, right: 0, textAlign: 'center', zIndex: 46,
              color: SHINY_GOLD, fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
              fontSize: '3rem', fontWeight: 700, textShadow: `0 0 20px ${SHINY_GOLD_GLOW}`,
            }}
          >
            {winner.winnerIndex === null ? "It's a tie!" : `🏆 ${winner.winnerName}`}
          </motion.div>
        </>
      )}
    </div>
  )
}
