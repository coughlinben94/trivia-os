import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Fuse from 'fuse.js'
import { supabase } from '../../lib/supabase.js'

// ease-drawer per Section 20
const EASE_DRAWER = [0.32, 0.72, 0, 1]

// ─── Hold-to-confirm button ────────────────────────────────────────────────
function HoldConfirmButton({ onConfirm, children, disabled }) {
  const [held, setHeld] = useState(false)
  const timerRef = useRef(null)

  function startHold(e) {
    if (disabled) return
    e.preventDefault()
    setHeld(true)
    timerRef.current = setTimeout(() => {
      setHeld(false)
      onConfirm()
    }, 1200)
  }

  function endHold() {
    clearTimeout(timerRef.current)
    setHeld(false)
  }

  return (
    <button
      className="confirm-button relative overflow-hidden rounded-lg px-3 py-1.5 bg-baynes-forest text-white text-xs font-bold select-none disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ minWidth: 72 }}
      disabled={disabled}
      data-held={held ? 'true' : 'false'}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
    >
      <div className="confirm-overlay absolute inset-0 bg-green-900 pointer-events-none" />
      <span className="relative z-10">{children}</span>
    </button>
  )
}

// ─── Round score row ────────────────────────────────────────────────────────
function RoundScoreRow({ round, roundIndex, currentScore, onSave }) {
  const [inputVal, setInputVal] = useState(String(currentScore ?? ''))
  const dirty = inputVal !== String(currentScore ?? '') && inputVal !== ''

  useEffect(() => {
    setInputVal(String(currentScore ?? ''))
  }, [currentScore])

  function handleSave() {
    const n = parseInt(inputVal, 10)
    if (!isNaN(n)) onSave(roundIndex, n)
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="flex-1 text-xs font-medium text-gray-600 truncate">{round.title || `Round ${roundIndex + 1}`}</span>
      <input
        type="number"
        inputMode="numeric"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
        className="w-16 text-center text-sm font-semibold text-gray-900 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-baynes-forest focus:border-transparent"
        placeholder="0"
      />
      <HoldConfirmButton onConfirm={handleSave} disabled={!dirty}>
        Hold ✓
      </HoldConfirmButton>
    </div>
  )
}

// ─── Team row ──────────────────────────────────────────────────────────────
function TeamRow({ team, rounds, scoreMap, onSave, highlight }) {
  const [expanded, setExpanded] = useState(false)
  const scores = scoreMap[team.id] ?? {}
  const total = Object.values(scores).reduce((a, b) => a + b, 0)

  return (
    <div className={`border-b border-gray-50 ${highlight ? 'bg-baynes-forest/5' : ''}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
      >
        <span
          className="shrink-0 w-3 h-3 rounded-full"
          style={{ background: team.color ?? '#888' }}
        />
        <span className="flex-1 text-sm font-semibold text-gray-900 truncate">{team.name}</span>
        <span className="shrink-0 text-base font-bold text-baynes-forest tabular-nums">{total}</span>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          className={`shrink-0 text-gray-300 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-3 pt-1 bg-gray-50">
          {rounds.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No rounds defined</p>
          ) : (
            rounds.map((round, idx) => (
              <RoundScoreRow
                key={round.id}
                round={round}
                roundIndex={idx}
                currentScore={scores[idx] ?? 0}
                onSave={(roundIndex, score) => onSave(team.id, roundIndex, score)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── ScorePanel ────────────────────────────────────────────────────────────
export default function ScorePanel({ open, onClose, show, actions }) {
  const [query, setQuery] = useState('')
  const [teams, setTeams] = useState([])
  const [scoreMap, setScoreMap] = useState({}) // { [teamId]: { [roundIndex]: score } }

  // Load teams + scores when panel opens
  useEffect(() => {
    if (!open || !show?.id) return
    let cancelled = false
    async function load() {
      const [{ data: teamsData }, { data: scoresData }] = await Promise.all([
        supabase.from('teams').select('*').eq('show_id', show.id).order('name'),
        supabase.from('team_scores').select('*').eq('show_id', show.id),
      ])
      if (cancelled) return
      setTeams(teamsData ?? [])
      const map = {}
      ;(scoresData ?? []).forEach(row => {
        if (!map[row.team_id]) map[row.team_id] = {}
        map[row.team_id][row.round_index] = row.score
      })
      setScoreMap(map)
    }
    load()
    return () => { cancelled = true }
  }, [open, show?.id])

  // Reset search on close
  useEffect(() => { if (!open) setQuery('') }, [open])

  // Fuse.js — threshold 0.3 per Section 13
  const fuse = useMemo(() => new Fuse(teams, { keys: ['name'], threshold: 0.3 }), [teams])
  const filtered = query.trim() ? fuse.search(query.trim()).map(r => r.item) : teams
  const matchedIds = new Set(filtered.map(t => t.id))

  // Sort by total descending
  function getTotal(teamId) {
    return Object.values(scoreMap[teamId] ?? {}).reduce((a, b) => a + b, 0)
  }
  const sortedTeams = [...(query.trim() ? filtered : teams)].sort(
    (a, b) => getTotal(b.id) - getTotal(a.id)
  )

  // Optimistic score update
  async function handleSave(teamId, roundIndex, score) {
    setScoreMap(prev => ({
      ...prev,
      [teamId]: { ...(prev[teamId] ?? {}), [roundIndex]: score },
    }))
    await actions.updateRoundScore(teamId, roundIndex, score)
  }

  const scoreboardVisible = show?.showState?.scoreboardVisible ?? false

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 bg-black z-40"
            onClick={onClose}
          />

          {/* Panel — ease-drawer 220ms open, 160ms close */}
          <motion.div
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{
              duration: open ? 0.22 : 0.16,
              ease: EASE_DRAWER,
            }}
            className="fixed right-0 top-0 bottom-0 w-[400px] bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Scores</h2>
                <p className="text-xs text-gray-400 mt-0.5">{teams.length} team{teams.length !== 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={onClose}
                className="host-button w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="shrink-0 px-4 py-3 border-b border-gray-100">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search teams…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-baynes-forest focus:border-transparent bg-gray-50"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Team list */}
            <div className="flex-1 overflow-y-auto">
              {sortedTeams.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="opacity-30">
                    <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2"/>
                    <path d="M14 20h12M20 14v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <p className="text-sm">{query ? 'No teams match' : 'No teams yet'}</p>
                </div>
              ) : (
                sortedTeams.map(team => (
                  <TeamRow
                    key={team.id}
                    team={team}
                    rounds={show.rounds ?? []}
                    scoreMap={scoreMap}
                    onSave={handleSave}
                    highlight={query.trim() ? matchedIds.has(team.id) : false}
                  />
                ))
              )}
            </div>

            {/* Footer — reveal toggle */}
            <div className="shrink-0 px-4 py-4 border-t border-gray-100 space-y-2">
              <button
                onClick={() => actions.setScoreboardVisible(!scoreboardVisible)}
                className={`host-button w-full py-3 rounded-xl text-sm font-bold transition-colors ${
                  scoreboardVisible
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    : 'bg-baynes-forest text-white hover:bg-green-900'
                }`}
              >
                {scoreboardVisible ? 'Hide Scoreboard' : 'Reveal Scores →'}
              </button>
              {scoreboardVisible && (
                <p className="text-center text-xs text-baynes-forest font-medium">
                  Scoreboard is live on display
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
