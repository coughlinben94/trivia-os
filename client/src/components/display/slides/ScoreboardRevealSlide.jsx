import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { supabase } from '../../../lib/supabase.js'
import { deriveRoundCols, computeTotal } from '../../../lib/scoreboardMath.js'
import SlideElements from '../SlideElements.jsx'
import { EASE_OUT, EASE_BAR } from '../../../lib/easings.js'

function ScoreRow({ team, rank, isLeader, maxScore, theme, delay }) {
  const pct = maxScore > 0 ? Math.round((team.total / maxScore) * 100) : 0
  const [barScale, setBarScale] = useState(0)
  const reduce = useReducedMotion()

  useEffect(() => {
    // Bar expands 120ms after row appears — Section 5 / Section 20
    const t = setTimeout(() => setBarScale(pct / 100), (delay + 0.12) * 1000)
    return () => clearTimeout(t)
  }, [pct, delay])

  return (
    <motion.div
      initial={{ y: reduce ? 0 : 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, duration: 0.22, ease: EASE_OUT }}
      className="relative flex items-center gap-5 px-6 py-4 rounded-2xl overflow-hidden"
      style={{
        background: isLeader
          ? theme.colors.shinyBg
          : `${theme.colors.accent}28`,
      }}
    >
      {/* Leader glow — fades in after row settles */}
      {isLeader && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.5, duration: 0.3 }}
          className="absolute inset-0 pointer-events-none rounded-2xl"
          style={{
            boxShadow: `0 0 36px ${theme.colors.shinyAccent}55, inset 0 0 36px ${theme.colors.shinyAccent}10`,
          }}
        />
      )}

      {/* Rank / Crown — Section 5: crown spring-drops from above */}
      <div className="w-12 shrink-0 flex items-center justify-center">
        {isLeader ? (
          <motion.span
            initial={{ y: reduce ? 0 : -28, opacity: 0, scale: reduce ? 1 : 0.4 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: delay + 0.72, type: 'spring', duration: 0.5, bounce: 0.3 }}
            style={{ fontSize: '2rem' }}
          >
            👑
          </motion.span>
        ) : (
          <span
            style={{
              color: theme.colors.textMuted,
              fontFamily: `'${theme.fonts.ui}', 'Inter', system-ui, sans-serif`,
              fontSize: '1.1rem',
              fontWeight: 700,
            }}
          >
            {rank}
          </span>
        )}
      </div>

      {/* Team name + bar */}
      <div className="flex-1 min-w-0">
        <p
          className="font-bold text-xl truncate"
          style={{ color: isLeader ? theme.colors.shinyAccent : theme.colors.text }}
        >
          {team.name}
        </p>

        {/* Score bar — scaleX animates via CSS transition (GPU-composited), EASE_BAR 600ms — Section 5 */}
        <div
          className="mt-2 rounded-full overflow-hidden"
          style={{ height: 8, background: 'rgba(255,255,255,0.08)' }}
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
      <div className="shrink-0">
        <span
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: isLeader ? theme.colors.shinyAccent : theme.colors.highlight,
            fontSize: '1.75rem',
            fontWeight: 700,
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

  // Render in reversed order so stagger delay = lowest rank appears first — Section 5
  const reversed = [...ranked].reverse()

  return (
    <div
      className="w-full h-full flex flex-col items-center overflow-hidden py-16 px-20"
      style={{ background: theme.colors.bg }}
    >
      {/* Title */}
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        className="mb-10 text-center shrink-0"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: theme.colors.highlight,
          fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
          fontWeight: 700,
          letterSpacing: '-0.01em',
        }}
      >
        🏆 {title}
      </motion.h2>

      {/* Rows — rendered bottom-rank-first for stagger, displayed in correct order */}
      <div className="w-full max-w-4xl space-y-3 overflow-y-auto">
        {reversed.map((team, reversedIdx) => {
          const rank = ranked.length - reversedIdx
          return (
            <ScoreRow
              key={team.id}
              team={team}
              rank={rank}
              isLeader={rank === 1}
              maxScore={maxScore}
              theme={theme}
              delay={0.3 + reversedIdx * 0.08}
            />
          )
        })}
      </div>

      <SlideElements elements={slide.data?.elements} theme={theme} />
    </div>
  )
}
