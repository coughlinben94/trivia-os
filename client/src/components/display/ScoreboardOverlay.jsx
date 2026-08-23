import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion, animate } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { useTheme } from '../shared/ThemeProvider.jsx'
import { deriveRoundCols, computeTotal, normalizeRoundScore, MEDALS } from '../../lib/scoreboardMath.js'
import { EASE_OUT, EASE_DROP } from '../../lib/easings.js'

// ─── Layout math ───────────────────────────────────────────────────────────
// The stage is a `container-type: size` box (see StageFrame), so every size
// here is in cqw/cqh and scales with the TV instead of assuming 1080p.
// Chrome above the rows: title block + column header + bottom padding.
const CHROME_CQH = 23
const MAX_ROW_CQH = 9      // few teams shouldn't become giant bars

// Rows shrink to fit however many teams there are, with no floor: a small,
// still-legible row beats a row that got clipped off the bottom of the TV.
function gridMetrics(teamCount) {
  const n = Math.max(teamCount, 1)
  const row = Math.min(MAX_ROW_CQH, (100 - CHROME_CQH) / n)
  return {
    row,
    name: row * 0.46,
    cell: row * 0.40,
    total: row * 0.58,
  }
}

// Past a team count where one column shrinks names below readable on a bar
// TV (2026-08-19, Ben: "couldn't even read [the names]... probably needs to
// be split into two"), split the roster into two side-by-side columns —
// each column's row height is computed off half the count, roughly doubling
// name size. Per-round columns are dropped in split mode (rank/name/total
// only): fitting the same round-by-round table twice side by side is what
// the single-column layout was built to avoid in the first place.
const SPLIT_TEAM_THRESHOLD = 9

// ─── Count-up total ────────────────────────────────────────────────────────
// A live score edit while the board is up should read as the number climbing,
// not a silent swap. Snaps when the user prefers reduced motion.
function CountUp({ value, reduce, style }) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    if (reduce || prev.current === value) {
      prev.current = value
      setDisplay(value)
      return
    }
    const from = prev.current
    prev.current = value
    const controls = animate(from, value, {
      duration: 0.7,
      ease: EASE_OUT,
      onUpdate: v => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, reduce])

  return <span style={style}>{display}</span>
}

// ─── Single team row ───────────────────────────────────────────────────────
function TeamRow({ team, rank, cols, template, metrics, delay, isTop, zebra, reduce }) {
  const { theme } = useTheme()
  const c = theme.colors
  const medal = MEDALS[rank - 1] ?? null

  // Flash the row when this team's total moves (host grading a round live).
  const [bumped, setBumped] = useState(false)
  const prevTotal = useRef(team.total)
  useEffect(() => {
    if (prevTotal.current === team.total) return
    prevTotal.current = team.total
    if (reduce) return
    setBumped(true)
    const t = setTimeout(() => setBumped(false), 850)
    return () => clearTimeout(t)
  }, [team.total, reduce])

  const cellFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`

  return (
    <motion.div
      layout={reduce ? false : 'position'}
      initial={{ opacity: 0, y: reduce ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.34, ease: EASE_OUT, layout: { duration: 0.5, ease: EASE_DROP } }}
      style={{
        display: 'grid',
        gridTemplateColumns: template,
        alignItems: 'center',
        height: `${metrics.row}cqh`,
        position: 'relative',
        background: isTop ? `${c.accent}38` : zebra ? `${c.text}09` : 'transparent',
        borderLeft: isTop ? `0.35cqw solid ${c.highlight}` : `0.35cqw solid transparent`,
        borderBottom: `1px solid ${c.text}0f`,
      }}
    >
      {/* Live-score flash — overlay so it never fights the zebra/leader fill */}
      <motion.div
        aria-hidden
        initial={false}
        animate={{ opacity: bumped ? 0.3 : 0 }}
        transition={{ duration: bumped ? 0.12 : 0.65, ease: EASE_OUT }}
        style={{ position: 'absolute', inset: 0, background: c.highlight, pointerEvents: 'none' }}
      />

      {/* Rank / medal */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: `${metrics.name}cqh`, position: 'relative',
      }}>
        {medal ?? (
          <span style={{ fontFamily: cellFont, color: `${c.textMuted}`, fontWeight: 700, fontSize: `${metrics.cell * 0.9}cqh` }}>
            {rank}
          </span>
        )}
      </div>

      {/* Team name */}
      <div style={{ minWidth: 0, paddingLeft: '0.8cqw', position: 'relative' }}>
        <p style={{
          fontFamily: displayFont,
          fontSize: `${metrics.name * (isTop ? 1.14 : 1)}cqh`,
          color: isTop ? c.highlight : c.text,
          lineHeight: 1.1,
          margin: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {team.name || '(unnamed)'}
        </p>
      </div>

      {/* One cell per round — always rendered, zeros included. A blank cell
          would break the grid's whole promise: every box means something. */}
      {cols.map(col => {
        const { written, phone } = normalizeRoundScore(team.scores?.[col.key])
        const total = written + phone
        return (
          <div key={col.key} style={{
            textAlign: 'center', position: 'relative',
            borderLeft: `1px solid ${c.text}0d`,
            fontFamily: cellFont,
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            fontSize: `${metrics.cell}cqh`,
            color: total === 0 ? `${c.textMuted}a6` : `${c.text}dd`,
          }}>
            {total}
          </div>
        )
      })}

      {/* Total */}
      <div style={{
        textAlign: 'right', paddingRight: '0.9cqw', position: 'relative',
        borderLeft: `1px solid ${c.highlight}40`,
      }}>
        <CountUp
          value={team.total}
          reduce={reduce}
          style={{
            fontFamily: displayFont,
            fontVariantNumeric: 'tabular-nums',
            fontSize: `${metrics.total * (isTop ? 1.12 : 1)}cqh`,
            color: isTop ? c.highlight : c.text,
            lineHeight: 1,
          }}
        />
      </div>
    </motion.div>
  )
}

// ─── Inner scoreboard (fetches + renders) ──────────────────────────────────
function ScoreboardContent({ show }) {
  const { theme } = useTheme()
  const c = theme.colors
  const reduce = useReducedMotion()
  const [ranked, setRanked] = useState([])
  const cols = deriveRoundCols(show)
  // load() is a closure created once per show.id (see the effect's deps
  // below, kept narrow on purpose so the realtime channel doesn't
  // resubscribe on every show change) — reading `cols` straight from that
  // closure would freeze the Total column at whatever rounds existed when
  // the board first mounted, disagreeing with the fresh per-render `cols`
  // used in the round columns below. A ref keeps every load() call —
  // including the 4s poll — reading the live show.
  const showRef = useRef(show)
  useEffect(() => { showRef.current = show }, [show])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('scoreboard_teams')
        .select('*')
        .eq('show_id', show.id)
        .order('sort_order')
      if (!data || cancelled) return
      const liveCols = deriveRoundCols(showRef.current)
      const sorted = data
        .map(t => ({ ...t, total: computeTotal(t.scores, liveCols) }))
        .sort((a, b) => b.total - a.total)
      setRanked(sorted)
    }
    load()

    // The board used to be a snapshot taken when it opened — a host grading a
    // round with the scoreboard up on the TV changed nothing on screen, so the
    // count-up/reorder motion below would never have anything to react to.
    // `scoreboard_teams` was added to the `supabase_realtime` publication
    // 2026-08-16, so this subscription actually fires now — no poll needed.
    const channel = supabase
      .channel(`scoreboard-tv:${show.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'scoreboard_teams', filter: `show_id=eq.${show.id}` },
        () => { load() }
      )
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [show.id])

  const isSplit = ranked.length > SPLIT_TEAM_THRESHOLD
  const splitCols = isSplit ? [] : cols
  // Split mode ranks each half independently by its own row index within that
  // half's metrics — the left column gets the top half of ranked.length, the
  // right gets the rest, so it reads left-to-right / top-to-bottom by rank.
  const half = Math.ceil(ranked.length / 2)
  const columns = isSplit ? [ranked.slice(0, half), ranked.slice(half)] : [ranked]
  const m = gridMetrics(isSplit ? half : ranked.length)
  // rank | team name | one per round | total. The round columns share whatever
  // the name column doesn't need (1fr each) so the numbers stay spread evenly
  // across the board instead of huddling at the right with dead space beside
  // the names — the width is the same however many rounds a show has.
  // Split mode drops the round columns (see SPLIT_TEAM_THRESHOLD above).
  const template = `3.4cqw minmax(0, 33cqw) repeat(${splitCols.length}, minmax(0, 1fr)) 9cqw`

  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      className="absolute inset-0 flex flex-col"
      style={{
        background: c.bgDeep,
        backgroundImage: `
          radial-gradient(ellipse 80% 55% at 50% 0%, ${c.accent}55 0%, transparent 62%),
          radial-gradient(ellipse 60% 50% at 15% 100%, ${c.accent}33 0%, transparent 55%)
        `,
      }}
    >
      {/* Title bar */}
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_DROP, delay: 0.05 }}
        className="shrink-0 flex items-baseline justify-between"
        style={{ padding: '4cqh 4cqw 2.2cqh' }}
      >
        <h1 style={{
          fontFamily: displayFont,
          fontSize: '7.5cqh',
          color: c.highlight,
          letterSpacing: '0.02em',
          lineHeight: 1,
          margin: 0,
          textShadow: `0 0 4cqh ${c.highlight}55`,
        }}>
          SCOREBOARD
        </h1>
        <span style={{
          fontFamily: bodyFont,
          fontSize: '2.2cqh',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: c.textMuted,
        }}>
          {ranked.length} {ranked.length === 1 ? 'Team' : 'Teams'}
        </span>
      </motion.div>

      {/* The grid — centered when the rows don't need the whole stage */}
      <div style={{ flex: 1, minHeight: 0, margin: '0 4cqw 4cqh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: isSplit ? '1.4cqw' : 0, minHeight: 0, maxHeight: '100%', width: '100%' }}>
      {columns.map((half, colIdx) => (
      <div key={colIdx} style={{
        flex: isSplit ? '1 1 0' : '0 1 auto', minWidth: 0, minHeight: 0, maxHeight: '100%',
        display: 'flex', flexDirection: 'column',
        border: `1px solid ${c.text}1c`,
        borderRadius: '1.4cqh',
        overflow: 'hidden',
        background: `${c.bg}cc`,
      }}>
        {/* Column header */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.1 }}
          className="shrink-0"
          style={{
            display: 'grid',
            gridTemplateColumns: template,
            alignItems: 'center',
            height: '5.2cqh',
            background: `${c.accent}44`,
            borderBottom: `1px solid ${c.highlight}55`,
            fontFamily: bodyFont,
            fontSize: '2cqh',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: c.textMuted,
            borderLeft: '0.35cqw solid transparent',
          }}
        >
          <span />
          <span style={{ paddingLeft: '0.8cqw' }}>Team</span>
          {splitCols.map(col => (
            <span key={col.key} style={{ textAlign: 'center', borderLeft: `1px solid ${c.text}0d` }}>
              {col.label}
            </span>
          ))}
          <span style={{ textAlign: 'right', paddingRight: '0.9cqw', color: c.highlight, borderLeft: `1px solid ${c.highlight}40` }}>
            Total
          </span>
        </motion.div>

        {/* Rows. Past SPLIT_TEAM_THRESHOLD teams, columns.length is 2 and each
            half's rows use metrics sized off the half-count, not the full
            roster, so names stay readable on a bar TV (2026-08-19, Ben). */}
        <div style={{
          flex: '0 1 auto', minHeight: 0, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {half.map((team, i) => {
            const rank = colIdx === 0 ? i + 1 : columns[0].length + i + 1
            return (
              <TeamRow
                key={team.id}
                team={team}
                rank={rank}
                cols={splitCols}
                template={template}
                metrics={m}
                delay={0.14 + i * 0.035}
                isTop={rank === 1}
                zebra={i % 2 === 1}
                reduce={reduce}
              />
            )
          })}
        </div>
      </div>
      ))}
      </div>
      </div>
    </motion.div>
  )
}

// ─── Export — full-stage panel that sweeps in from the stage edge ─────────
export default function ScoreboardOverlay({ show }) {
  const visible = show.scoreboard_visible ?? show.showState?.scoreboardVisible ?? false
  const reduce = useReducedMotion()

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="scoreboard-overlay"
          data-scoreboard-overlay
          initial={reduce ? { opacity: 0 } : { x: '100%' }}
          animate={reduce ? { opacity: 1 } : { x: 0 }}
          exit={reduce ? { opacity: 0 } : { x: '100%' }}
          transition={{ duration: 0.38, ease: EASE_OUT }}
          className="absolute inset-0 z-[60]"
          style={{ boxShadow: '-24px 0 48px rgba(0,0,0,0.6)' }}
        >
          <ScoreboardContent show={show} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
