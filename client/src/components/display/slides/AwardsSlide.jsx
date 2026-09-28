import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { supabase } from '../../../lib/supabase.js'
import { nightAwards } from '../../../lib/nightAwards.js'
import { useFitToBox, LIST_ITEM_FLOOR, TITLE_CARD_CEIL } from '../../../lib/autoFitText.js'
import { REVEAL_STAGE_PAD_CQW } from '../../../lib/scoreboardMath.js'
import { EASE_OUT, EASE_DROP } from '../../../lib/easings.js'

// Awards: three award cards on one screen, placed by the host between Bonus 1
// and Bonus 2. Dumb renderer; every rule lives in lib/nightAwards.js. Same
// stage look and cq sizing as BiggestClimbersSlide / ScoreboardRevealSlide.

const FIRST_DELAY = 0.6
const CARD_STEP = 2.5     // seconds between cards on the TV
const CARD_DURATION = 0.5

// Build Mode / preview: never read live scores, show sample cards.
const SAMPLE = [
  { id: 'best-round', title: 'Best Round', teamNames: ['Quiz in My Pants'], statLine: '18 points in Round 3' },
  { id: 'biggest-comeback', title: 'Biggest Comeback', teamNames: ['Les Quizerables'], statLine: '9th after Round 1, now 3rd' },
  { id: 'most-consistent', title: 'Most Consistent', teamNames: ['Tequila Mockingbird'], statLine: 'Every round between 11 and 13 points' },
]

// Medal: ribbon + disk + star, drawn in theme colors.
function Medal({ c, size }) {
  return (
    <svg viewBox="0 0 64 80" style={{ height: size, width: 'auto', display: 'block' }} aria-hidden="true">
      <path d="M18 0h12l6 22H24z" fill={c.shinyAccent} opacity="0.85" />
      <path d="M34 0h12l-6 22H28z" fill={c.shinyAccent} />
      <circle cx="32" cy="50" r="24" fill={c.highlight} />
      <circle cx="32" cy="50" r="18" fill="none" stroke={c.bg} strokeOpacity="0.35" strokeWidth="2.5" />
      <path d="M32 38l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L32 56.6l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z" fill={c.bg} fillOpacity="0.45" />
    </svg>
  )
}

function AwardCard({ award, delay, reduce, theme }) {
  const c = theme.colors
  const names = award.teamNames.join(' & ')
  const nameRef = useRef(null)
  const nameSize = useFitToBox(nameRef, names, {
    family: theme.fonts.display,
    floorPx: LIST_ITEM_FLOOR * 16,
    ceilPx: TITLE_CARD_CEIL * 16,
    maxLines: 3,
    lineHeight: 1.14, // rendered at 1.1, same headroom trick as Climbers
  })
  return (
    <motion.div
      initial={{ opacity: 0, transform: reduce ? 'translateY(0px)' : 'translateY(32px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      transition={{ delay, duration: CARD_DURATION, ease: EASE_OUT }}
      className="flex flex-col items-center text-center"
      style={{
        width: '28cqw',
        height: '100%',
        padding: '3cqh 1.6cqw',
        borderRadius: '2.4cqh',
        background: `${c.accent}28`,
        boxShadow: `inset 0 0 0 0.25cqh ${c.shinyAccent}30`,
      }}
    >
      <motion.div
        initial={{ opacity: 0, transform: reduce ? 'scale(1)' : 'scale(0.6)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        transition={{ delay: delay + 0.15, duration: 0.45, ease: EASE_DROP }}
        className="shrink-0"
      >
        <Medal c={c} size="13cqh" />
      </motion.div>
      <p
        className="shrink-0"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: c.highlight,
          fontSize: '4.6cqh',
          lineHeight: 1.1,
          margin: '2cqh 0 0',
          textWrap: 'balance',
        }}
      >
        {award.title}
      </p>
      {/* Fixed name box: flex fills whatever the title/stat lines leave. No
          padding here — useFitToBox reads clientWidth/Height. */}
      <div ref={nameRef} className="flex items-center justify-center" style={{ flex: 1, minHeight: 0, width: '100%', margin: '1.5cqh 0' }}>
        <p
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: c.text,
            fontSize: `${nameSize}px`,
            lineHeight: 1.1,
            margin: 0,
            overflowWrap: 'anywhere',
            textWrap: 'balance',
          }}
        >
          {names}
        </p>
      </div>
      <p
        className="shrink-0"
        style={{
          fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
          color: c.textMuted,
          fontSize: '3.2cqh',
          lineHeight: 1.25,
          margin: 0,
          minHeight: '8cqh', // two lines reserved so cards line up
          textWrap: 'balance',
        }}
      >
        {award.statLine}
      </p>
    </motion.div>
  )
}

export default function AwardsSlide({ slide, show, isPreview = false }) {
  const { theme } = useTheme()
  const c = theme.colors
  const reduce = useReducedMotion()
  const [teams, setTeams] = useState(null)

  // Same load/freeze pattern as BiggestClimbersSlide: live refresh until the
  // first real set of awards lands, then frozen so cards never reshuffle
  // mid-reveal.
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
      .channel(`awards-tv:${show.id}:${slide.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'scoreboard_teams', filter: `show_id=eq.${show.id}` },
        () => { if (!frozenRef.current) load() }
      )
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [show.id, slide.id, isPreview])

  const awards = useMemo(() => {
    if (isPreview) return SAMPLE
    if (teams === null) return null
    return nightAwards(show, teams, slide.data)
  }, [isPreview, teams, show, slide.data])

  useEffect(() => {
    if (awards?.length) frozenRef.current = true
  }, [awards])

  const instant = reduce || isPreview
  const cardDelay = i => (instant ? 0.1 * i : FIRST_DELAY + i * CARD_STEP)

  return (
    <div
      className="w-full h-full flex flex-col items-center overflow-hidden"
      style={{ background: c.bg, padding: `5cqh ${REVEAL_STAGE_PAD_CQW}cqw 6cqh` }}
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
          margin: '0 0 4cqh',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}
      >
        Tonight’s Awards
      </motion.h2>

      <div className="flex items-stretch justify-center" style={{ flex: 1, minHeight: 0, width: '100%', gap: '2.5cqw' }}>
        {awards && awards.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4, ease: EASE_OUT }}
            className="flex flex-col items-center justify-center text-center"
          >
            <Medal c={c} size="16cqh" />
            <p style={{ fontFamily: `'${theme.fonts.display}', sans-serif`, color: c.text, fontSize: '7cqh', lineHeight: 1.15, margin: '3cqh 0 0' }}>
              Awards are coming
            </p>
            <p style={{ fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`, color: c.textMuted, fontSize: '3.6cqh', lineHeight: 1.3, margin: '2cqh 0 0' }}>
              Still tallying the night. Hang tight.
            </p>
          </motion.div>
        )}
        {awards?.map((award, i) => (
          <AwardCard key={award.id} award={award} delay={cardDelay(i)} reduce={reduce} theme={theme} />
        ))}
      </div>
    </div>
  )
}
