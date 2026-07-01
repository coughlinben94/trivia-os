import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'

function deriveRoundCols(show) {
  const sorted = (show.rounds ?? []).slice().sort((a, b) => a.number - b.number)
  const cols = sorted.map(round => {
    const slides = (show.slides ?? []).filter(s => s.roundId === round.id)
    if (slides.some(s => s.type === 'swing-round-intro')) return { key: `r_${round.id}`, label: 'SW' }
    if (slides.some(s => s.type === 'pyl-reveal')) return { key: `r_${round.id}`, label: 'PYL' }
    return { key: `r_${round.id}`, label: `R${round.number}` }
  })
  cols.push({ key: 'bonus', label: '?' })
  return cols
}

function computeTotal(scores, cols) {
  return cols.reduce((sum, c) => sum + (Number(scores[c.key]) || 0), 0)
}

function addStats(teams, cols) {
  const withTotals = teams.map(t => ({ ...t, _total: computeTotal(t.scores, cols) }))
  const byTotal = [...withTotals].sort((a, b) => b._total - a._total)
  const placeMap = {}
  let place = 1
  byTotal.forEach((t, i) => {
    if (i > 0 && t._total < byTotal[i - 1]._total) place = i + 1
    placeMap[t.id] = t._total === 0 ? '—' : place
  })
  return withTotals.map(t => ({ ...t, _place: placeMap[t.id] }))
}

const TH = ({ children, className = '', style }) => (
  <th className={`text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 py-2 px-1 ${className}`} style={style}>
    {children}
  </th>
)

function TeamTable({ teams, cols, onUpdateName, onUpdateScore, onDelete, highlightIds }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <TH className="w-6 text-center">#</TH>
          <TH className="text-left px-2" style={{ minWidth: 140 }}>Team</TH>
          {cols.map(c => <TH key={c.key} className="text-center" style={{ width: 46 }}>{c.label}</TH>)}
          <TH className="text-center text-gray-600 font-bold" style={{ width: 52 }}>Total</TH>
          <TH className="text-center" style={{ width: 44 }}>Place</TH>
          <TH className="w-6" />
        </tr>
      </thead>
      <tbody>
        {teams.map((team, i) => {
          const highlight = highlightIds?.includes(team.id)
          return (
            <tr
              key={team.id}
              className={`group border-b border-gray-50 transition-colors ${
                highlight ? 'bg-yellow-100' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
              }`}
            >
              <td className="text-center text-xs text-gray-300 w-6">{i + 1}</td>
              <td className="px-2 py-1">
                <input
                  type="text"
                  value={team.name}
                  placeholder="Team name…"
                  onChange={e => onUpdateName(team.id, e.target.value)}
                  className="w-full text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-[#1a6b4a] outline-none py-0.5 placeholder:text-gray-300"
                />
              </td>
              {cols.map(c => (
                <td key={c.key} className="px-1 py-1 text-center">
                  <input
                    type="number"
                    value={team.scores[c.key] ?? ''}
                    placeholder="—"
                    onChange={e => onUpdateScore(team.id, c.key, e.target.value)}
                    className="w-full text-center text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-[#1a6b4a] outline-none py-0.5 placeholder:text-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </td>
              ))}
              <td className="text-center text-sm font-bold text-gray-900 px-1 tabular-nums">
                {team._total > 0 ? team._total : '—'}
              </td>
              <td className="text-center text-sm text-gray-500 px-1 tabular-nums">{team._place}</td>
              <td className="text-center w-6">
                <button
                  onClick={() => onDelete(team.id)}
                  className="text-gray-200 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center mx-auto"
                  title="Remove team"
                >✕</button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function ScoreboardModal({ show, onClose }) {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [highlightIds, setHighlightIds] = useState(null)
  const saveTimers = useRef({})
  const cols = deriveRoundCols(show)
  const teamsWithStats = addStats(teams, cols)
  const half = Math.ceil(teamsWithStats.length / 2)
  const leftTeams = teamsWithStats.slice(0, half)
  const rightTeams = teamsWithStats.slice(half)

  useEffect(() => {
    supabase
      .from('scoreboard_teams')
      .select('*')
      .eq('show_id', show.id)
      .order('sort_order')
      .then(({ data }) => { setTeams(data ?? []); setLoading(false) })
  }, [show.id])

  function save(team) {
    clearTimeout(saveTimers.current[team.id])
    saveTimers.current[team.id] = setTimeout(() => {
      supabase.from('scoreboard_teams').upsert({
        id: team.id, show_id: show.id,
        name: team.name, scores: team.scores, sort_order: team.sort_order,
      })
    }, 500)
  }

  function updateName(id, name) {
    setTeams(prev => prev.map(t => {
      if (t.id !== id) return t
      const updated = { ...t, name }
      save(updated)
      return updated
    }))
  }

  function updateScore(id, key, val) {
    setTeams(prev => prev.map(t => {
      if (t.id !== id) return t
      const updated = { ...t, scores: { ...t.scores, [key]: val === '' ? null : Number(val) } }
      save(updated)
      return updated
    }))
  }

  async function addTeam() {
    const sort_order = teams.length
    const { data } = await supabase
      .from('scoreboard_teams')
      .insert({ show_id: show.id, name: '', scores: {}, sort_order })
      .select().single()
    if (data) setTeams(prev => [...prev, data])
  }

  async function deleteTeam(id) {
    setTeams(prev => prev.filter(t => t.id !== id))
    await supabase.from('scoreboard_teams').delete().eq('id', id)
  }

  async function sortTeams() {
    const sorted = [...teams].sort((a, b) => computeTotal(b.scores, cols) - computeTotal(a.scores, cols))
    const reordered = sorted.map((t, i) => ({ ...t, sort_order: i }))
    setTeams(reordered)
    await supabase.from('scoreboard_teams').upsert(
      reordered.map(t => ({ id: t.id, show_id: t.show_id, name: t.name, scores: t.scores, sort_order: t.sort_order }))
    )
  }

  async function clearScores() {
    const cleared = teams.map(t => ({ ...t, scores: {} }))
    setTeams(cleared)
    setHighlightIds(null)
    await supabase.from('scoreboard_teams').upsert(
      cleared.map(t => ({ id: t.id, show_id: t.show_id, name: t.name, scores: {}, sort_order: t.sort_order }))
    )
  }

  function pickRandomTwo() {
    if (teams.length < 2) return
    const shuffled = [...teams].sort(() => Math.random() - 0.5)
    setHighlightIds([shuffled[0].id, shuffled[1].id])
  }

  const btnBase = 'text-sm font-medium px-3 py-1.5 rounded-lg host-button transition-colors'

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden flex-1 min-h-0">

        {/* Header */}
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 shrink-0">
          <span className="text-lg">📊</span>
          <h2 className="text-base font-bold text-gray-900 flex-1">Scoreboard — {show.title}</h2>
          <button onClick={addTeam} className={`${btnBase} bg-[#1a6b4a] text-white hover:bg-green-900`}>+ Team</button>
          <button onClick={sortTeams} className={`${btnBase} bg-gray-100 text-gray-600 hover:bg-gray-200`}>Sort</button>
          <button onClick={pickRandomTwo} className={`${btnBase} bg-gray-100 text-gray-600 hover:bg-gray-200`}>Random 2</button>
          <button onClick={clearScores} className={`${btnBase} bg-red-50 text-red-500 hover:bg-red-100`}>Clear</button>
          <button
            onClick={onClose}
            className="ml-1 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 host-button"
          >✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
          ) : teams.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <p className="text-gray-400 text-sm">No teams yet — add your first team to get started.</p>
              <button onClick={addTeam} className="text-sm font-semibold px-5 py-2.5 rounded-xl bg-[#1a6b4a] text-white hover:bg-green-900 host-button">
                + Add Team
              </button>
            </div>
          ) : (
            <div className="flex gap-4 min-h-0">
              <div className="flex-1 overflow-x-auto">
                <TeamTable
                  teams={leftTeams}
                  cols={cols}
                  onUpdateName={updateName}
                  onUpdateScore={updateScore}
                  onDelete={deleteTeam}
                  highlightIds={highlightIds}
                />
              </div>
              {rightTeams.length > 0 && (
                <>
                  <div className="w-px bg-gray-100 shrink-0 self-stretch" />
                  <div className="flex-1 overflow-x-auto">
                    <TeamTable
                      teams={rightTeams}
                      cols={cols}
                      onUpdateName={updateName}
                      onUpdateScore={updateScore}
                      onDelete={deleteTeam}
                      highlightIds={highlightIds}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer summary */}
        {teams.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 shrink-0 flex items-center gap-4 text-xs text-gray-400">
            <span>{teams.length} teams</span>
            {highlightIds && (
              <span className="text-amber-500 font-medium">
                🎲 Random 2: {teams.filter(t => highlightIds.includes(t.id)).map(t => t.name || 'Unnamed').join(' & ')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
