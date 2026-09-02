import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { supabase } from '../../../lib/supabase.js'
import {
  deriveRoundCols,
  computeTotal,
  splitByRank,
  revealMetrics,
  revealTemplate,
  revealColumnWidthCqw,
  revealRowDelay,
  REVEAL_SPLIT_GAP_CQW,
  REVEAL_ROW_DURATION,
  REVEAL_CROWN_OFFSET,
  REVEAL_CROWN_SETTLE,
} from '../../../lib/scoreboardMath.js'
import { EASE_OUT, EASE_BAR } from '../../../lib/easings.js'

// Everything here is sized in cq units off the stage (a `container-type: size`
// box — see StageFrame) and off the team count, never rem/px. Ben runs 21
// teams; the old fixed px/rem rows in one `overflow-y-auto` column put roughly
// everyone past 10th place below the fold, and nobody scrolls a TV during a
// show. See lib/scoreboardMath.js for the sizing and stagger model.

function ScoreRow({ team, rank, isLeader, maxScore, theme, m, delay, reduce }) {
  // Clamped at 0: a team can finish a round negative (PYL), and a negative
  // scaleX would flip the bar through its own origin instead of emptying it.
  const pct = maxScore > 0 ? Math.max(0, Math.round((team.total / maxScore) * 100)) : 0
  const [barScale, setBarScale] = useState(0)

  useEffect(() => {
    // Bar expands 120ms after its row appears — Section 5 / Section 20
    const t = setTimeout(() => setBarScale(pct / 100), (delay + 0.12) * 1000)
    return () => clearTimeout(t)
  }, [pct, delay])

  return (
    <motion.div
      initial={{ y: reduce ? 0 : 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, duration: REVEAL_ROW_DURATION, ease: EASE_OUT }}
      className="relative grid items-center overflow-hidden"
      style={{
        gridTemplateColumns: m.template,
        height: `${m.row}cqh`,
        padding: `${m.padY}cqh ${m.padX}cqh`,
        borderRadius: `${m.radius}cqh`,
        background: isLeader ? theme.colors.shinyBg : `${theme.colors.accent}28`,
      }}
    >
      {/* Leader glow — static box-shadow on an overlay, only its opacity
          animates, so nothing paints per frame. */}
      {isLeader && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.3, duration: 0.3 }}
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: `${m.radius}cqh`,
            boxShadow: `0 0 4cqh ${theme.colors.shinyAccent}55, inset 0 0 4cqh ${theme.colors.shinyAccent}10`,
          }}
        />
      )}

      {/* Rank / Crown — Section 5: crown spring-drops from above */}
      <div className="flex items-center justify-center" style={{ minWidth: 0 }}>
        {isLeader ? (
          <motion.span
            initial={{ y: reduce ? 0 : -28, opacity: 0, scale: reduce ? 1 : 0.4 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{
              delay: delay + REVEAL_CROWN_OFFSET,
              type: 'spring',
              duration: REVEAL_CROWN_SETTLE,
              bounce: 0.3,
            }}
            style={{ fontSize: `${m.crown}cqh`, lineHeight: 1 }}
          >
            👑
          </motion.span>
        ) : (
          <span
            style={{
              color: theme.colors.textMuted,
              fontFamily: `'${theme.fonts.ui}', 'Inter', system-ui, sans-serif`,
              fontSize: `${m.rank}cqh`,
              fontWeight: 700,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {rank}
          </span>
        )}
      </div>

      {/* Team name + bar */}
      <div style={{ minWidth: 0, paddingLeft: `${m.padX}cqh` }}>
        <p
          className="font-bold truncate"
          style={{
            color: isLeader ? theme.colors.shinyAccent : theme.colors.text,
            fontSize: `${m.name}cqh`,
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {team.name}
        </p>

        {/* Score bar — scaleX via CSS transition (GPU-composited, off the main
            thread), EASE_BAR 600ms — Section 5 */}
        <div
          className="rounded-full overflow-hidden"
          style={{
            marginTop: `${m.bar * 0.9}cqh`,
            height: `${m.bar}cqh`,
            background: 'rgba(255,255,255,0.08)',
          }}
        >
          <div
            className="h-full w-full rounded-full"
            style={{
              transform: `scaleX(${barScale})`,
              transformOrigin: 'left center',
              transition: `transform 600ms cubic-bezier(${EASE_BAR.join(',')})`,
              background: isLeader ? theme.colors.shinyAccent : theme.colors.accent,
              willChange: 'transform',
            }}
          />
        </div>
      </div>

      {/* Score */}
      <div style={{ textAlign: 'right', minWidth: 0 }}>
        <span
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: isLeader ? theme.colors.shinyAccent : theme.colors.highlight,
            fontSize: `${m.score}cqh`,
            fontWeight: 700,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {team.total}
        </span>
      </div>
    </motion.div>
  )
}

export default function ScoreboardRevealSlide({ slide, show }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const [ranked, setRanked] = useState([])

  useEffect(() => {
    async function load() {
      const cols = deriveRoundCols(show)

      // Primary: scoreboard_teams (the live grading source)
      const { data: sbTeams } = await supabase
        .from('scoreboard_teams').select('id, name, scores').eq('show_id', show.id)
      if (sbTeams?.length) {
        const sorted = sbTeams
          .map(t => ({ ...t, total: computeTotal(t.scores, cols) }))
          .sort((a, b) => b.total - a.total)
        setRanked(sorted)
        return
      }

      // Fallback: legacy team_scores
      const [{ data: teamsData }, { data: scoresData }] = await Promise.all([
        supabase.from('teams').select('*').eq('show_id', show.id),
        supabase.from('team_scores').select('*').eq('show_id', show.id),
      ])
      const totals = {}
      ;(scoresData ?? []).forEach(s => { totals[s.team_id] = (totals[s.team_id] ?? 0) + s.score })
      const sorted = (teamsData ?? [])
        .map(t => ({ ...t, total: totals[t.id] ?? 0 }))
        .sort((a, b) => b.total - a.total)
      setRanked(sorted)
    }
    load()
  }, [show.id, slide.id])

  const maxScore = Math.max(...ranked.map(t => t.total), 1)
  const title =
    slide.data?.title ??
    (slide.data?.afterRound != null ? `After Round ${slide.data.afterRound}` : 'Leaderboard')

  const metrics = revealMetrics(ranked.length)
  const m = { ...metrics, template: revealTemplate(metrics.isSplit) }
  const columnCqw = revealColumnWidthCqw(metrics.isSplit)
  // 1..N runs down the left column and continues down the right.
  const columns = splitByRank(ranked, metrics.isSplit)

  return (
    <div
      className="w-full h-full flex flex-col items-center overflow-hidden"
      style={{ background: theme.colors.bg, padding: '4cqh 3cqw 3.5cqh' }}
    >
      {/* Title */}
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        className="text-center shrink-0"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: theme.colors.highlight,
          fontSize: '8cqh',
          lineHeight: 1.1,
          marginBottom: '2.5cqh',
          fontWeight: 700,
          letterSpacing: '-0.01em',
        }}
      >
        🏆 {title}
      </motion.h2>

      {/* Columns. No scroll container anywhere below here on purpose: the row
          metrics above are what make the roster fit, and a scrollbar on a TV
          is just a silent way to hide half the teams. */}
      <div
        className="flex flex-col justify-center"
        style={{ flex: 1, minHeight: 0, width: '100%' }}
      >
      {/* Columns stay TOP-aligned to each other (rank 12 lines up with rank 1)
          while the block as a whole centers in whatever space is left — a
          3-team board shouldn't cling to the top of the TV. */}
      <div
        className="flex justify-center items-start"
        style={{ gap: `${REVEAL_SPLIT_GAP_CQW}cqw` }}
      >
        {columns.map((column, colIdx) => (
          <div
            key={colIdx}
            className="flex flex-col"
            style={{ width: `${columnCqw}cqw`, gap: `${m.gap}cqh` }}
          >
            {column.map((team, i) => {
              const rank = colIdx === 0 ? i + 1 : columns[0].length + i + 1
              return (
                <ScoreRow
                  key={team.id}
                  team={team}
                  rank={rank}
                  isLeader={rank === 1}
                  maxScore={maxScore}
                  theme={theme}
                  m={m}
                  // Delay comes from global rank, so both columns reveal as one
                  // lowest-to-highest sweep instead of two parallel races.
                  delay={revealRowDelay(rank, ranked.length)}
                  reduce={reduce}
                />
              )
            })}
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}
