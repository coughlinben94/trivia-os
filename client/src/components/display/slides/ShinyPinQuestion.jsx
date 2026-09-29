// client/src/components/display/slides/ShinyPinQuestion.jsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import UsMap, { PinMarker } from '../../shared/UsMap.jsx'
import MapLoadRetry from '../../shared/MapLoadRetry.jsx'
import { useUsMapData } from '../../../hooks/useUsMapData.js'
import { fitView } from '../../../lib/pinView.js'
import { lonLatToMap, MAP_W, MAP_H } from '../../../lib/usMapGeo.js'
import { isValidPin } from '../../../lib/pinScoring.js'
import { fitToBox } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { AnswersLockedBadge } from '../LockCountdownOverlay.jsx'
import ShinySignal from '../ShinySignal.jsx'

// TV side of Pin It: prompt + the same map the phones have (waiting), a held
// "locked" beat, then a reveal where the camera frames the true spot plus the
// scoring pins, every pin shows in its team's color, and a ranked list shows
// miles. Camera moves are JS-tweened SVG transforms (transform-only).
const Q_BOX = { boxW: 1500, boxH: 150, floorPx: 40, ceilPx: 92, maxLines: 2, lineHeight: 1.15 }
// Starting values for bar-distance legibility; tune at the Task 12 real-TV check.
const TV_PIN_SIZE = 1.8, TV_LABEL = 22, TV_CITY_LABEL = 18 // effective map units (labelSize is final size)
const HOME = { k: 1, tx: 0, ty: 0 }

function useTweenedView(target, ms, instant) {
  const [v, setV] = useState(target)
  const from = useRef(target)
  const cur = useRef(target); cur.current = v
  useEffect(() => {
    const same = (a, b) => a.k === b.k && a.tx === b.tx && a.ty === b.ty
    if (same(cur.current, target)) return
    if (instant) { setV(target); return }
    from.current = cur.current
    const t0 = performance.now()
    let raf
    const tick = now => {
      const p = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      const a = from.current
      setV(prev => { const n = { k: a.k + (target.k - a.k) * e, tx: a.tx + (target.tx - a.tx) * e, ty: a.ty + (target.ty - a.ty) * e }; return same(prev, n) ? prev : n })
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.k, target.tx, target.ty, instant, ms])
  return v
}

export default function ShinyPinQuestion({ slide, show, theme }) {
  const { data } = slide
  const locked = !!data.pinLocked
  const revealed = !!data.pinRevealed
  const reduce = useReducedMotion()
  const states = useUsMapData()
  const [submitted, setSubmitted] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const [colors, setColors] = useState({})
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)) }, [])

  // Same polled aggregate the other phone mechanics use: /display is anonymous
  // and cannot read phone_answers, but phone_answers_count is SECURITY DEFINER.
  useEffect(() => {
    if (locked || revealed) return
    let cancelled = false
    const load = async () => {
      const { data: n } = await supabase.rpc('phone_answers_count', { p_slide_id: slide.id })
      if (!cancelled) setSubmitted(n ?? 0)
    }
    load(); const id = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [slide.id, locked, revealed])

  useEffect(() => {
    if (!show?.id) return
    let cancelled = false
    supabase.from('teams').select('id, color', { count: 'exact' }).eq('show_id', show.id)
      .then(({ data: rows, count }) => {
        if (cancelled) return
        setTeamCount(count ?? rows?.length ?? 0)
        setColors(Object.fromEntries((rows ?? []).map(r => [r.id, r.color])))
      })
    return () => { cancelled = true }
  }, [show?.id, revealed])

  const results = Array.isArray(data.pinResults) ? data.pinResults : []
  const target = isValidPin(data.pinAnswer) ? data.pinAnswer : null
  const scorers = results.filter(r => r.points > 0 && r.pin)

  const targetView = useMemo(() => {
    if (!revealed || !target) return HOME
    const pts = [target, ...scorers.map(r => r.pin)].map(p => lonLatToMap(p.lon, p.lat))
    return fitView(pts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, data.pinAnswer, data.pinResults])
  const view = useTweenedView(targetView, 1100, reduce)

  const size = useMemo(
    () => fitToBox(data.text ?? '', { ...Q_BOX, family: theme.fonts.display }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.text, theme.fonts.display, fontsReady]
  )
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const ink = theme.colors.text

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', gap: '2rem', padding: '2rem 3rem', overflow: 'hidden' }}>
      <ShinySignal />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
        {data.text && (
          <p style={{ margin: 0, textAlign: 'center', fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`, fontSize: `${size}px`, lineHeight: 1.15, color: ink }}>
            {data.text}
          </p>
        )}
        <div style={{ width: '100%', aspectRatio: `${MAP_W} / ${MAP_H}`, maxHeight: '62vh', alignSelf: 'center', position: 'relative', overflow: 'hidden', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: `1px solid ${ink}22` }}>
          <UsMap view={view} states={states} ink={ink} cityLabelSize={TV_CITY_LABEL}>
            {k => revealed && (
              <>
                {results.filter(r => r.pin).map((r, i) => (
                  // scorePinRound sorts points-desc then miles-asc with no-pin rows last, so i is the rank of a pinned row.
                  <PinMarker key={r.teamId} lon={r.pin.lon} lat={r.pin.lat} k={k} size={TV_PIN_SIZE} labelSize={TV_LABEL} color={colors[r.teamId] ?? '#4a90d9'} label={i < 5 ? (r.teamName ?? '') : String(i + 1)} />
                ))}
                {/* drawn last so guesses never paint over the true spot */}
                {target && <PinMarker lon={target.lon} lat={target.lat} k={k} size={TV_PIN_SIZE} labelSize={TV_LABEL} color={SHINY_GOLD} label={data.answer || 'Answer'} />}
              </>
            )}
          </UsMap>
          <MapLoadRetry states={states} ink={ink} />
        </div>
        <div style={{ minHeight: '3.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: `${ink}d9`, fontSize: 'clamp(1.6rem, 2vw, 2.3rem)', fontFamily: bodyFont }}>
          {revealed ? (data.answer ? `It's ${data.answer}` : null)
            : locked ? <AnswersLockedBadge theme={theme} />
            : <span style={{ fontVariantNumeric: 'tabular-nums' }}>{teamCount > 0 ? `${submitted} of ${teamCount} teams dropped a pin` : `${submitted} team${submitted === 1 ? '' : 's'} dropped a pin`}</span>}
        </div>
      </div>

      {revealed && (
        <motion.ol
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: reduce ? 0 : 0.9 }}
          style={{ width: '22%', minWidth: 300, margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center', fontFamily: bodyFont, color: ink }}
        >
          {results.slice(0, 12).map((r, i) => (
            <li key={r.teamId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: 'clamp(1.1rem, 1.5vw, 1.6rem)', opacity: r.points > 0 ? 1 : 0.6 }}>
              <span style={{ width: '1.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.pin ? i + 1 : '–'}</span>
              <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 7, background: colors[r.teamId] ?? '#4a90d9', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName ?? 'Team'}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.miles == null ? 'no pin' : `${r.miles.toLocaleString()} mi`}</span>
              {r.points > 0 && <span style={{ color: SHINY_GOLD, fontWeight: 700 }}>+{r.points}</span>}
            </li>
          ))}
          {results.length > 12 && <li style={{ opacity: 0.6, fontSize: '1.1rem', textAlign: 'center' }}>+{results.length - 12} more</li>}
        </motion.ol>
      )}
    </div>
  )
}
