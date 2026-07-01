import { useState, useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { useTheme } from '../shared/ThemeProvider.jsx'

// ─── Easing ────────────────────────────────────────────────────────────────
const EASE_OUT   = [0.22, 1, 0.36, 1]
const EASE_QUART = [0.25, 1, 0.25, 1]

// ─── Helpers ───────────────────────────────────────────────────────────────
function computeTotal(scores) {
  if (!scores || typeof scores !== 'object') return 0
  return Object.values(scores).reduce((sum, v) => sum + (Number(v) || 0), 0)
}

function deriveRoundCols(show) {
  const sorted = (show.rounds ?? []).slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  const cols = sorted.map(round => {
    const slides = (show.slides ?? []).filter(s => s.roundId === round.id)
    if (slides.some(s => s.type === 'swing-round-intro')) return { key: `r_${round.id}`, label: 'SW' }
    if (slides.some(s => s.type === 'pyl-reveal')) return { key: `r_${round.id}`, label: 'PYL' }
    return { key: `r_${round.id}`, label: `R${round.number ?? '?'}` }
  })
  cols.push({ key: 'bonus', label: '?' })
  return cols
}

const MEDALS = ['🥇', '🥈', '🥉']

// ─── Single team row ───────────────────────────────────────────────────────
function TeamRow({ team, rank, cols, delay, isTop, reduce }) {
  const { theme } = useTheme()
  const medal = MEDALS[rank - 1] ?? null

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.38, ease: EASE_OUT }}
      className="flex items-center gap-4 px-5 py-3 rounded-2xl"
      style={{
        background: isTop
          ? `linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(245,158,11,0.08) 100%)`
          : 'rgba(255,255,255,0.06)',
        boxShadow: isTop
          ? '0 0 28px rgba(251,191,36,0.15), inset 0 1px 0 rgba(251,191,36,0.2)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
        border: isTop
          ? '1px solid rgba(251,191,36,0.3)'
          : '1px solid rgba(255,255,255,0.07)',
        // GPU-only scale for top team — no layout props
        transform: isTop ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {/* Rank / medal */}
      <div
        className="shrink-0 flex items-center justify-center"
        style={{ width: '2.2rem', fontSize: isTop ? '1.5rem' : '1.1rem' }}
      >
        {medal ? (
          <span>{medal}</span>
        ) : (
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              color: 'rgba(255,255,255,0.35)',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            {rank}
          </span>
        )}
      </div>

      {/* Team name */}
      <div className="flex-1 min-w-0">
        <p
          className="truncate"
          style={{
            fontFamily: "'Boogaloo', sans-serif",
            fontSize: isTop ? '1.5rem' : '1.2rem',
            color: isTop ? '#fbbf24' : 'rgba(255,255,255,0.9)',
            lineHeight: 1.2,
          }}
        >
          {team.name || '(unnamed)'}
        </p>
      </div>

      {/* Round score pills */}
      <div className="shrink-0 hidden xl:flex items-center gap-1.5">
        {cols.map(col => {
          const val = team.scores?.[col.key]
          if (val == null || val === '' || Number(val) === 0) return null
          return (
            <span
              key={col.key}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.7rem',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.55)',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '1px 7px',
                borderRadius: '999px',
                whiteSpace: 'nowrap',
              }}
            >
              {col.label} {Number(val)}
            </span>
          )
        })}
      </div>

      {/* Total */}
      <div className="shrink-0 text-right" style={{ minWidth: '3.5rem' }}>
        <span
          style={{
            fontFamily: "'Boogaloo', sans-serif",
            fontSize: isTop ? '1.9rem' : '1.5rem',
            color: isTop ? '#fbbf24' : '#f59e0b',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {team.total}
        </span>
      </div>
    </motion.div>
  )
}

// ─── Inner scoreboard (fetches + renders) ──────────────────────────────────
function ScoreboardContent({ show }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const [ranked, setRanked] = useState([])
  const cols = deriveRoundCols(show)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('scoreboard_teams')
        .select('*')
        .eq('show_id', show.id)
        .order('sort_order')
      if (!data) return
      const sorted = data
        .map(t => ({ ...t, total: computeTotal(t.scores) }))
        .sort((a, b) => b.total - a.total)
      setRanked(sorted)
    }
    load()
  }, [show.id])

  const useTwo = ranked.length > 8
  const half = Math.ceil(ranked.length / 2)
  const leftCol = useTwo ? ranked.slice(0, half) : ranked
  const rightCol = useTwo ? ranked.slice(half) : []

  // Base delay per item (staggered per column independently)
  const itemDelay = (i) => 0.18 + i * 0.06

  return (
    <motion.div
      initial={{ opacity: 0, scale: reduce ? 1 : 0.97, y: reduce ? 0 : 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: reduce ? 1 : 0.98, y: reduce ? 0 : -16 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="absolute inset-0 flex flex-col"
      style={{
        background: 'rgba(0,0,0,0.92)',
        backgroundImage: `
          radial-gradient(ellipse 70% 50% at 50% 0%, rgba(251,191,36,0.08) 0%, transparent 60%),
          radial-gradient(ellipse 40% 60% at 20% 100%, rgba(26,107,74,0.15) 0%, transparent 50%)
        `,
      }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_QUART, delay: 0.05 }}
        className="shrink-0 flex items-center justify-center pt-10 pb-6 px-16"
      >
        <h1
          style={{
            fontFamily: "'Boogaloo', sans-serif",
            fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
            color: '#fbbf24',
            letterSpacing: '0.02em',
            lineHeight: 1,
            textShadow: '0 0 40px rgba(251,191,36,0.4)',
          }}
        >
          📊 SCOREBOARD
        </h1>
      </motion.div>

      {/* Divider */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.12 }}
        className="shrink-0 mx-16 mb-6"
        style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.4) 20%, rgba(251,191,36,0.4) 80%, transparent 100%)',
          transformOrigin: 'center',
        }}
      />

      {/* Team rows */}
      <div className="flex-1 overflow-hidden px-10 pb-10 flex gap-6">
        {/* Left column (or single column) */}
        <div className="flex-1 flex flex-col gap-2 overflow-hidden">
          {leftCol.map((team, i) => (
            <TeamRow
              key={team.id}
              team={team}
              rank={i + 1}
              cols={cols}
              delay={itemDelay(i)}
              isTop={i === 0}
              reduce={reduce}
            />
          ))}
        </div>

        {/* Right column (2-col layout for > 8 teams) */}
        {useTwo && (
          <div className="flex-1 flex flex-col gap-2 overflow-hidden">
            {rightCol.map((team, i) => {
              const globalRank = half + i + 1
              return (
                <TeamRow
                  key={team.id}
                  team={team}
                  rank={globalRank}
                  cols={cols}
                  delay={itemDelay(i)}
                  isTop={false}
                  reduce={reduce}
                />
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Export — wraps in AnimatePresence for enter/exit ─────────────────────
export default function ScoreboardOverlay({ show }) {
  const visible = show.scoreboard_visible ?? show.showState?.scoreboardVisible ?? false

  return (
    <AnimatePresence>
      {visible && (
        <div
          key="scoreboard-overlay"
          className="absolute inset-0 z-[60]"
          style={{ isolation: 'isolate' }}
        >
          <ScoreboardContent show={show} />
        </div>
      )}
    </AnimatePresence>
  )
}
