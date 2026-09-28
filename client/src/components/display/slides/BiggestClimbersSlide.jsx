import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { supabase } from '../../../lib/supabase.js'
import { computeClimbers, ordinal } from '../../../lib/roundClimbers.js'
import { useFitToBox, LIST_ITEM_FLOOR, LINE_FLOOR, LINE_CEIL, TITLE_CARD_CEIL } from '../../../lib/autoFitText.js'
import { REVEAL_STAGE_PAD_CQW } from '../../../lib/scoreboardMath.js'
import { EASE_OUT, EASE_DROP } from '../../../lib/easings.js'

// Round-results story: who climbed the most places since the last round.
// Dumb renderer. All the rules (ties, incomplete grading, mid-show teams)
// live in lib/roundClimbers.js. Sized in cq units off the stage, same as
// ScoreboardRevealSlide, and uses the same row look so the two read as one
// family when they run back to back.

const ROW_MAX_CQH = 15
const ROW_GAP_CQH = 2
const ROWS_AREA_CQH = 58
const BASE_DELAY = 0.45
const ROW_STEP = 0.38
const ROW_DURATION = 0.32

// Build Mode / preview window: never show live scores there (same call as
// WinnerRevealSlide), just a sample so the host can see the layout.
const SAMPLE = {
  status: 'ok',
  roundLabel: 'R3',
  prevRoundLabel: 'R2',
  climbers: [
    { id: 's1', name: 'Quiz in My Pants', from: 9, to: 3, climb: 6, total: 41 },
    { id: 's3', name: 'Tequila Mockingbird', from: 5, to: 2, climb: 3, total: 43 },
    { id: 's2', name: 'Les Quizerables', from: 7, to: 4, climb: 3, total: 39 },
  ],
  chase: { leader: 'Tequila Mockingbird', chaser: 'The Know-It-Ales', gap: 2 },
  missing: [],
}

function roundName(label) {
  if (!label) return null
  if (label === 'SW') return 'the Swing Round'
  if (label === 'PYL') return 'Press Your Luck'
  return `Round ${label.replace(/^R/, '')}`
}

function ClimberRow({ climber, isTop, delay, rowCqh, nameRef, nameSize, reduce, theme }) {
  const c = theme.colors
  const lift = reduce ? 'translateY(0px)' : 'translateY(28px)'
  return (
    <motion.div
      initial={{ opacity: 0, transform: lift }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      transition={{ delay, duration: ROW_DURATION, ease: EASE_OUT }}
      className="relative grid items-center overflow-hidden"
      style={{
        gridTemplateColumns: `${rowCqh * 1.25}cqh minmax(0, 1fr) ${rowCqh * 1.5}cqh`,
        columnGap: `${rowCqh * 0.2}cqh`,
        height: `${rowCqh}cqh`,
        padding: `0 ${rowCqh * 0.22}cqh`,
        borderRadius: `${rowCqh * 0.2}cqh`,
        background: isTop ? c.shinyBg : `${c.accent}28`,
      }}
    >
      {isTop && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.3, duration: 0.35 }}
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: `${rowCqh * 0.2}cqh`,
            boxShadow: `0 0 4cqh ${c.shinyAccent}55, inset 0 0 4cqh ${c.shinyAccent}10`,
          }}
        />
      )}

      {/* How many places they jumped */}
      <motion.div
        initial={{ opacity: 0, transform: reduce ? 'scale(1)' : 'scale(0.7)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        transition={{ delay: delay + 0.12, duration: 0.36, ease: EASE_DROP }}
        className="flex items-baseline justify-center"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: isTop ? c.shinyAccent : c.highlight,
          fontSize: `${rowCqh * 0.52}cqh`,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: '0.6em', marginRight: '0.08em' }}>▲</span>
        {climber.climb}
      </motion.div>

      {/* Team name. Every row's name cell is the same size, so the first
          row's cell is the measuring box and one size fits all rows. No
          padding on this cell: useFitToBox reads clientWidth, which counts
          padding, and would size the name for room it doesn't have. */}
      <div
        ref={nameRef}
        className="flex items-center"
        style={{ minWidth: 0, height: `${rowCqh * 0.86}cqh` }}
      >
        <p
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: isTop ? c.shinyAccent : c.text,
            fontSize: `${nameSize}px`,
            lineHeight: 1.1,
            margin: 0,
            overflowWrap: 'anywhere',
            textWrap: 'balance',
          }}
        >
          {climber.name}
        </p>
      </div>

      {/* Where they landed, and where they came from */}
      <div className="flex flex-col items-end justify-center" style={{ minWidth: 0 }}>
        <span
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: isTop ? c.shinyAccent : c.highlight,
            fontSize: `${rowCqh * 0.42}cqh`,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {ordinal(climber.to)}
        </span>
        <span
          style={{
            fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
            color: c.textMuted,
            fontSize: `${rowCqh * 0.2}cqh`,
            lineHeight: 1.2,
            marginTop: `${rowCqh * 0.04}cqh`,
            whiteSpace: 'nowrap',
          }}
        >
          was {ordinal(climber.from)}
        </span>
      </div>
    </motion.div>
  )
}

export default function BiggestClimbersSlide({ slide, show, isPreview = false }) {
  const { theme } = useTheme()
  const c = theme.colors
  const reduce = useReducedMotion()
  const [teams, setTeams] = useState(null)

  // One read on mount, plus a live refresh ONLY while grading is still in
  // progress. Once the board is complete the reveal freezes, so a late edit
  // can't reshuffle rows mid-reveal.
  const frozenRef = useRef(false)
  useEffect(() => {
    if (isPreview) return
    let cancelled = false
    frozenRef.current = false
    async function load() {
      const { data } = await supabase
        .from('scoreboard_teams').select('id, name, scores').eq('show_id', show.id)
      if (!cancelled && !frozenRef.current) setTeams(data ?? [])
    }
    load()
    const channel = supabase
      .channel(`climbers-tv:${show.id}:${slide.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'scoreboard_teams', filter: `show_id=eq.${show.id}` },
        () => { if (!frozenRef.current) load() }
      )
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [show.id, slide.id, isPreview])

  const result = useMemo(() => {
    if (isPreview) return SAMPLE
    if (teams === null) return null
    return computeClimbers(show, slide.roundId, teams, { excludeTop: slide.data?.excludeTop })
  }, [isPreview, teams, show, slide.roundId, slide.data?.excludeTop])

  useEffect(() => {
    if (result && result.status !== 'incomplete') frozenRef.current = true
  }, [result])

  const climbers = result?.climbers ?? []
  const n = climbers.length
  const rowCqh = n ? Math.min(ROW_MAX_CQH, (ROWS_AREA_CQH - ROW_GAP_CQH * (n - 1)) / n) : ROW_MAX_CQH
  const longestName = climbers.reduce((a, b) => (b.name.length > a.length ? b.name : a), '')

  const nameRef = useRef(null)
  const nameSize = useFitToBox(nameRef, longestName, {
    family: theme.fonts.display,
    floorPx: LIST_ITEM_FLOOR * 16,
    ceilPx: TITLE_CARD_CEIL * 16,
    maxLines: 2,
    // Rendered at 1.1. Fitting at 1.14 leaves ~2px of headroom: at exactly
    // 1.1 a 2-line name measured 94px in a 93px cell at full-bleed 5 rows.
    lineHeight: 1.14,
  })

  const chaseText = result?.chase
    ? `${result.chase.chaser} trails ${result.chase.leader} by ${result.chase.gap} ${result.chase.gap === 1 ? 'point' : 'points'}`
    : ''
  const chaseRef = useRef(null)
  const chaseSize = useFitToBox(chaseRef, chaseText, {
    family: theme.fonts.body,
    floorPx: LINE_FLOOR * 16,
    // Side note to the rows, so it tops out well under a round-intro line.
    ceilPx: LINE_CEIL * 16 * 0.7,
    maxLines: 2,
    lineHeight: 1.2,
  })

  const since = roundName(result?.prevRoundLabel)
  const skipTop = result?.excludeTop ?? 0
  const subtitle = since ? (skipTop ? `Since ${since}, outside the top ${skipTop}` : `Since ${since}`) : ''
  // Biggest climb sits on top but lands last, so the room builds to it.
  const rowDelay = i => BASE_DELAY + (n - 1 - i) * ROW_STEP
  const afterRows = BASE_DELAY + Math.max(n - 1, 0) * ROW_STEP + ROW_DURATION + 0.5

  let message = null
  let subMessage = null
  if (result) {
    if (result.status === 'incomplete') {
      message = 'Still grading. Hang tight.'
    } else if (result.status === 'no-movement') {
      message = skipTop ? `Nobody outside the top ${skipTop} moved.` : 'Nobody budged.'
      subMessage = since && !skipTop ? `Same order as after ${since}.` : null
    } else if (result.status !== 'ok') {
      message = 'Nothing to compare yet.'
    }
  }

  return (
    <div
      className="w-full h-full flex flex-col items-center overflow-hidden"
      style={{ background: c.bg, padding: `5cqh ${REVEAL_STAGE_PAD_CQW}cqw 4cqh` }}
    >
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        className="text-center shrink-0"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: c.highlight,
          fontSize: '8cqh',
          lineHeight: 1.1,
          margin: 0,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}
      >
        📈 Biggest Climbers
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: since && result?.status === 'ok' ? 1 : 0 }}
        transition={{ delay: 0.15, duration: 0.3, ease: EASE_OUT }}
        className="text-center shrink-0"
        style={{
          fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
          color: c.textMuted,
          fontSize: '3.4cqh',
          lineHeight: 1.2,
          margin: '1cqh 0 0',
          minHeight: '4.1cqh',
        }}
      >
        {subtitle}
      </motion.p>

      <div className="flex flex-col items-center justify-center" style={{ flex: 1, minHeight: 0, width: '100%' }}>
        {message ? (
          <motion.div
            key={result.status}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4, ease: EASE_OUT }}
            className="text-center"
          >
            <p style={{ fontFamily: `'${theme.fonts.display}', sans-serif`, color: c.text, fontSize: '7cqh', lineHeight: 1.15, margin: 0 }}>
              {message}
            </p>
            {subMessage && (
              <p style={{ fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`, color: c.textMuted, fontSize: '3.6cqh', lineHeight: 1.3, margin: '2cqh 0 0' }}>
                {subMessage}
              </p>
            )}
          </motion.div>
        ) : (
          <div className="flex flex-col" style={{ width: '70cqw', gap: `${ROW_GAP_CQH}cqh` }}>
            {climbers.map((climber, i) => (
              <ClimberRow
                key={climber.id}
                climber={climber}
                isTop={i === 0}
                delay={rowDelay(i)}
                rowCqh={rowCqh}
                nameRef={i === 0 ? nameRef : undefined}
                nameSize={nameSize}
                reduce={reduce}
                theme={theme}
              />
            ))}
          </div>
        )}
      </div>

      {/* Close race for first. Always reserves its line so the rows above
          never shift when it appears. */}
      <div ref={chaseRef} className="shrink-0 flex items-center justify-center" style={{ width: '80cqw', height: '8cqh' }}>
        {chaseText && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: message ? 0.6 : afterRows, duration: 0.4, ease: EASE_OUT }}
            style={{
              fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
              color: c.text,
              fontSize: `${chaseSize}px`,
              lineHeight: 1.2,
              margin: 0,
              textAlign: 'center',
              textWrap: 'balance',
            }}
          >
            {chaseText}
          </motion.p>
        )}
      </div>
    </div>
  )
}
