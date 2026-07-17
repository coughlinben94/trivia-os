import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useTheme } from '../shared/ThemeProvider.jsx'
import { deriveRoundCols, computeTotal } from '../../lib/scoreboardMath.js'
import BoxingRing from '../display/slides/BoxingRing.jsx'
import ChestDuel from '../display/slides/ChestDuel.jsx'
import CardPick from '../display/slides/CardPick.jsx'
import BattleshipDuel from '../display/slides/BattleshipDuel.jsx'

// ─── Quick Entry ──────────────────────────────────────────────────────────────
function QuickEntry({ teams, cols, onSave, onClose }) {
  const [step, setStep]         = useState('team')
  const [teamQuery, setTeamQuery] = useState('')
  const [roundInput, setRoundInput] = useState('')
  const [scoreInput, setScoreInput] = useState('')
  const [matches, setMatches]   = useState([])
  const [picked, setPicked]     = useState(null)
  const [flash, setFlash]       = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [step])

  function findMatches(q) {
    const lower = q.toLowerCase()
    return teams.filter(t => t.name.toLowerCase().includes(lower))
  }

  function resolveRound(raw) {
    const up = raw.trim().toUpperCase()
    if (up === 'M' || up === 'MYSTERY' || up === '?') return cols.find(c => c.key === 'bonus') ?? null
    const byLabel = cols.find(c => c.label.toUpperCase() === up)
    if (byLabel) return byLabel
    if (/^\d+$/.test(up)) {
      const n = parseInt(up)
      const byNum = cols.find(c => c.label === `R${n}`)
      if (byNum) return byNum
      if (n >= 1 && n <= cols.length) return cols[n - 1]
    }
    return null
  }

  function showFlash(text, ok = true) {
    setFlash({ text, ok })
    setTimeout(() => setFlash(null), 1800)
  }

  function handleTeamSubmit() {
    const q = teamQuery.trim()
    if (!q) return
    const found = findMatches(q)
    if (found.length === 0) { showFlash('No team found', false); return }
    if (found.length === 1) { setPicked({ team: found[0] }); setStep('round') }
    else { setMatches(found); setStep('disambig') }
  }

  function handleDisambig(team) { setPicked({ team }); setStep('round') }

  function handleRoundSubmit() {
    const col = resolveRound(roundInput)
    if (!col) { showFlash(`Unknown round "${roundInput}" — try 1–5, SW, PYL, M`, false); return }
    setPicked(p => ({ ...p, col }))
    setStep('score')
  }

  function handleScoreSubmit() {
    const num = parseFloat(scoreInput)
    if (isNaN(num)) { showFlash('Enter a number', false); return }
    onSave(picked.team.id, picked.col.key, num)
    showFlash(`✓ ${picked.team.name} · ${picked.col.label} → ${num}`)
    setStep('team'); setTeamQuery(''); setRoundInput(''); setScoreInput(''); setPicked(null); setMatches([])
  }

  function handleKey(e, onEnter) {
    if (e.key === 'Enter') { e.preventDefault(); onEnter() }
    if (e.key === 'Escape') onClose()
  }

  const inputCls = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a6b4a] focus:border-transparent'

  return (
    <div className="border-b border-gray-100 bg-green-50/50 px-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-[#1a6b4a] uppercase tracking-widest">Quick Entry</span>
        {flash && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${flash.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {flash.text}
          </span>
        )}
        <button onClick={onClose} className="ml-auto text-xs text-gray-400 hover:text-gray-600 host-button">✕ Close</button>
      </div>

      {step === 'team' && (
        <div className="flex gap-2">
          <input ref={inputRef} type="text" placeholder="Team name (partial ok)…" value={teamQuery}
            onChange={e => setTeamQuery(e.target.value)} onKeyDown={e => handleKey(e, handleTeamSubmit)} className={inputCls} />
          <button onClick={handleTeamSubmit} className="shrink-0 bg-[#1a6b4a] text-white text-sm font-semibold px-4 rounded-lg hover:bg-green-900 host-button">Find →</button>
        </div>
      )}
      {step === 'disambig' && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-gray-500">Multiple matches — pick one:</p>
          <div className="flex flex-wrap gap-2">
            {matches.map(t => (
              <button key={t.id} onClick={() => handleDisambig(t)}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-[#1a6b4a] hover:text-[#1a6b4a] host-button">
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {step === 'round' && (
        <div className="flex gap-2 items-center">
          <span className="text-sm font-semibold text-gray-700 shrink-0">{picked?.team?.name} →</span>
          <input ref={inputRef} type="text" placeholder={`Round: ${cols.map(c => c.label).join(', ')}`} value={roundInput}
            onChange={e => setRoundInput(e.target.value)} onKeyDown={e => handleKey(e, handleRoundSubmit)} className={inputCls} />
          <button onClick={handleRoundSubmit} className="shrink-0 bg-[#1a6b4a] text-white text-sm font-semibold px-4 rounded-lg hover:bg-green-900 host-button">Next →</button>
          <button onClick={() => setStep('team')} className="shrink-0 text-xs text-gray-400 hover:text-gray-600 host-button">← Back</button>
        </div>
      )}
      {step === 'score' && (
        <div className="flex gap-2 items-center">
          <span className="text-sm font-semibold text-gray-700 shrink-0">{picked?.team?.name} · {picked?.col?.label} →</span>
          <input ref={inputRef} type="number" placeholder="Score" value={scoreInput}
            onChange={e => setScoreInput(e.target.value)} onKeyDown={e => handleKey(e, handleScoreSubmit)}
            className={`${inputCls} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`} />
          <button onClick={handleScoreSubmit} className="shrink-0 bg-[#1a6b4a] text-white text-sm font-semibold px-4 rounded-lg hover:bg-green-900 host-button">Save ✓</button>
          <button onClick={() => setStep('round')} className="shrink-0 text-xs text-gray-400 hover:text-gray-600 host-button">← Back</button>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function TeamTable({ teams, cols, onUpdateName, onUpdateScore, onDelete, highlightIds, atRiskCells }) {
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
            <tr key={team.id} className={`group border-b border-gray-50 transition-colors ${
              highlight ? 'bg-yellow-100' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
            }`}>
              <td className="text-center text-xs text-gray-300 w-6">{i + 1}</td>
              <td className="px-2 py-1">
                <input type="text" value={team.name} placeholder="Team name…"
                  onChange={e => onUpdateName(team.id, e.target.value)}
                  title={atRiskCells?.[`${team.id}:name`] ? 'Didn’t save — check connection' : undefined}
                  className={`w-full text-sm text-gray-800 bg-transparent border-b outline-none py-0.5 placeholder:text-gray-300 ${
                    atRiskCells?.[`${team.id}:name`] ? 'border-amber-400' : 'border-transparent hover:border-gray-200 focus:border-[#1a6b4a]'
                  }`} />
              </td>
              {cols.map(c => (
                <td key={c.key} className="px-1 py-1 text-center">
                  <input type="number" value={team.scores[c.key] ?? ''} placeholder="—"
                    onChange={e => onUpdateScore(team.id, c.key, e.target.value)}
                    title={atRiskCells?.[`${team.id}:${c.key}`] ? 'Didn’t save — check connection' : undefined}
                    className={`w-full text-center text-sm text-gray-800 bg-transparent border-b outline-none py-0.5 placeholder:text-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      atRiskCells?.[`${team.id}:${c.key}`] ? 'border-amber-400' : 'border-transparent hover:border-gray-200 focus:border-[#1a6b4a]'
                    }`} />
                </td>
              ))}
              <td className="text-center text-sm font-bold text-gray-900 px-1 tabular-nums">
                {team._total > 0 ? team._total : '—'}
              </td>
              <td className="text-center text-sm text-gray-500 px-1 tabular-nums">{team._place}</td>
              <td className="text-center w-6">
                <button onClick={() => onDelete(team.id)}
                  className="text-gray-200 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center mx-auto"
                  title="Remove team">✕</button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── ScoreboardModal ──────────────────────────────────────────────────────────

export default function ScoreboardModal({ show, onClose, onWriteError }) {
  const { theme } = useTheme()
  const [teams,        setTeams]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [highlightIds, setHighlightIds] = useState(null)
  const [quickEntry,   setQuickEntry]   = useState(false)
  const [activeAnim,   setActiveAnim]   = useState(null)
  const [animWinnerId, setAnimWinnerId] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  // Keyed `${teamId}:${fieldKey}` — marks the specific cell a failed debounced
  // save came from, cleared the instant that team's next save succeeds. Not a
  // retry mechanism: the debounce itself already retries on the next edit;
  // this is purely "which number is at risk" visibility for the host.
  const [atRiskCells,  setAtRiskCells]  = useState({})
  const saveTimers = useRef({})

  const cols           = deriveRoundCols(show)
  const teamsWithStats = addStats(teams, cols)
  const half           = Math.ceil(teamsWithStats.length / 2)
  const leftTeams      = teamsWithStats.slice(0, half)
  const rightTeams     = teamsWithStats.slice(half)


  useEffect(() => {
    supabase
      .from('scoreboard_teams')
      .select('*')
      .eq('show_id', show.id)
      .order('sort_order')
      .then(({ data }) => { setTeams(data ?? []); setLoading(false) })
  }, [show.id])

  function save(team, fieldKey) {
    clearTimeout(saveTimers.current[team.id])
    const cellKey = `${team.id}:${fieldKey}`
    saveTimers.current[team.id] = setTimeout(async () => {
      // Supabase's query builder is a lazy thenable — without awaiting (or
      // otherwise consuming) it, the request is built but never actually
      // sent. Every other write in this file awaits; this one silently
      // didn't, so name/score edits typed into the table never persisted.
      const { error } = await supabase.from('scoreboard_teams').upsert({
        id: team.id, show_id: show.id,
        name: team.name, scores: team.scores, sort_order: team.sort_order,
      })
      if (error) {
        console.error('scoreboard_teams save failed:', error)
        setAtRiskCells(prev => ({ ...prev, [cellKey]: true }))
        onWriteError?.('Score didn’t save — check connection')
      } else {
        setAtRiskCells(prev => {
          if (!prev[cellKey]) return prev
          const next = { ...prev }
          delete next[cellKey]
          return next
        })
      }
    }, 500)
  }

  function updateName(id, name) {
    setTeams(prev => prev.map(t => {
      if (t.id !== id) return t
      const updated = { ...t, name }
      save(updated, 'name')
      return updated
    }))
  }

  function updateScore(id, key, val) {
    setTeams(prev => prev.map(t => {
      if (t.id !== id) return t
      const updated = { ...t, scores: { ...t.scores, [key]: val === '' ? null : Number(val) } }
      save(updated, key)
      return updated
    }))
  }

  async function addTeam() {
    const sort_order = teams.length
    const { data, error } = await supabase
      .from('scoreboard_teams')
      .insert({ show_id: show.id, name: '', scores: {}, sort_order })
      .select().single()
    if (data) setTeams(prev => [...prev, data])
    if (error) { console.error('scoreboard_teams add failed:', error); onWriteError?.('Couldn’t add team — check connection') }
  }

  async function deleteTeam(id) {
    // A pending debounced save() for this team (from an edit moments ago)
    // would otherwise fire ~500ms later and re-insert the row we just deleted.
    clearTimeout(saveTimers.current[id])
    delete saveTimers.current[id]
    setTeams(prev => prev.filter(t => t.id !== id))
    const { error } = await supabase.from('scoreboard_teams').delete().eq('id', id)
    if (error) { console.error('scoreboard_teams delete failed:', error); onWriteError?.('Delete didn’t save — check connection') }
  }

  async function sortTeams() {
    // Any pending debounced save() holds a pre-sort snapshot (stale sort_order,
    // and for whichever team is mid-edit, stale name/score too) — letting it
    // fire after this upsert would silently revert that team's row. teams
    // (React state) already reflects every edit synchronously by this point,
    // so this upsert alone carries everything those pending saves would have.
    Object.values(saveTimers.current).forEach(clearTimeout)
    saveTimers.current = {}
    const sorted    = [...teams].sort((a, b) => computeTotal(b.scores, cols) - computeTotal(a.scores, cols))
    const reordered = sorted.map((t, i) => ({ ...t, sort_order: i }))
    setTeams(reordered)
    const { error } = await supabase.from('scoreboard_teams').upsert(
      reordered.map(t => ({ id: t.id, show_id: t.show_id, name: t.name, scores: t.scores, sort_order: t.sort_order }))
    )
    if (error) { console.error('scoreboard_teams sort failed:', error); onWriteError?.('Sort didn’t save — check connection') }
  }

  async function clearScores() {
    Object.values(saveTimers.current).forEach(clearTimeout)
    saveTimers.current = {}
    const ids = teams.map(t => t.id)
    setTeams([])
    setHighlightIds(null)
    if (ids.length > 0) {
      const { error } = await supabase.from('scoreboard_teams').delete().in('id', ids)
      if (error) { console.error('scoreboard_teams clear failed:', error); onWriteError?.('Clear didn’t save — check connection') }
    }
  }

  function quickSave(teamId, colKey, score) { updateScore(teamId, colKey, score) }

  function openAnim(type) {
    if (teamsWithStats.length < 2) return
    const winner = teamsWithStats[Math.floor(Math.random() * teamsWithStats.length)]
    setAnimWinnerId(winner.id)
    setActiveAnim(type)
  }

  const btnBase = 'text-sm font-medium px-3 py-1.5 rounded-lg host-button transition-colors'

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      // Let sub-modals (anim, quick entry) handle Escape first via bubbling
      if (activeAnim || quickEntry) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeAnim, quickEntry, onClose])

  return (
    <>
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
            <button
              onClick={() => setQuickEntry(v => !v)}
              className={`${btnBase} ${quickEntry ? 'bg-[#1a6b4a] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >⚡ Quick Entry</button>
            <button onClick={addTeam} className={`${btnBase} bg-gray-100 text-gray-600 hover:bg-gray-200`}>+ Team</button>
            <button
              onClick={() => openAnim('cards')}
              disabled={teamsWithStats.length < 2}
              className={`${btnBase} bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed`}
            >🎴 Cards</button>
            <button
              onClick={() => openAnim('boxing')}
              disabled={teamsWithStats.length < 2}
              className={`${btnBase} bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed`}
            >🥊 Boxing</button>
            <button
              onClick={() => openAnim('chest')}
              disabled={teamsWithStats.length < 2}
              className={`${btnBase} bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed`}
            >📦 Chest</button>
            <button
              onClick={() => openAnim('battleship')}
              disabled={teamsWithStats.length < 2}
              className={`${btnBase} bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed`}
            >🚢 Battleship</button>
            {confirmClear ? (
              <div className="flex items-center gap-1.5 ml-1">
                <span className="text-xs text-red-600 font-semibold">Remove all teams?</span>
                <button onClick={() => { clearScores(); setConfirmClear(false) }} className={`${btnBase} bg-red-500 text-white hover:bg-red-600`}>Yes, remove</button>
                <button onClick={() => setConfirmClear(false)} className={`${btnBase} bg-gray-100 text-gray-600 hover:bg-gray-200`}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} className={`${btnBase} bg-red-50 text-red-500 hover:bg-red-100`}>Clear</button>
            )}
            <button
              onClick={onClose}
              className="ml-1 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 host-button"
            >✕</button>
          </div>

          {/* Quick Entry */}
          {quickEntry && (
            <QuickEntry teams={teams} cols={cols} onSave={quickSave} onClose={() => { sortTeams(); setQuickEntry(false) }} />
          )}

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
                  <TeamTable teams={leftTeams} cols={cols} onUpdateName={updateName} onUpdateScore={updateScore} onDelete={deleteTeam} highlightIds={highlightIds} atRiskCells={atRiskCells} />
                </div>
                {rightTeams.length > 0 && (
                  <>
                    <div className="w-px bg-gray-100 shrink-0 self-stretch" />
                    <div className="flex-1 overflow-x-auto">
                      <TeamTable teams={rightTeams} cols={cols} onUpdateName={updateName} onUpdateScore={updateScore} onDelete={deleteTeam} highlightIds={highlightIds} atRiskCells={atRiskCells} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {teams.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-100 shrink-0 flex items-center gap-4 text-xs text-gray-400">
              <span>{teams.length} teams</span>
              {highlightIds && (
                <span className="text-amber-500 font-medium">
                  🎡 PYL Picker: {teams.find(t => t.id === highlightIds[0])?.name || 'Unnamed'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {activeAnim && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setActiveAnim(null)}
        >
          <div
            style={{ position: 'relative', width: '100%', height: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            {activeAnim === 'boxing' && (
              <BoxingRing
                candidates={teamsWithStats}
                winnerId={animWinnerId}
                theme={theme}
                onDone={() => { setHighlightIds([animWinnerId]); setActiveAnim(null) }}
              />
            )}
            {activeAnim === 'chest' && (
              <ChestDuel
                candidates={teamsWithStats}
                winnerId={animWinnerId}
                theme={theme}
                onDone={() => { setHighlightIds([animWinnerId]); setActiveAnim(null) }}
              />
            )}
            {activeAnim === 'cards' && (
              <CardPick
                candidates={teamsWithStats}
                winnerId={animWinnerId}
                theme={theme}
                onDone={() => { setHighlightIds([animWinnerId]); setActiveAnim(null) }}
              />
            )}
            {activeAnim === 'battleship' && (
              <BattleshipDuel
                candidates={teamsWithStats}
                winnerId={animWinnerId}
                theme={theme}
                onDone={() => { setHighlightIds([animWinnerId]); setActiveAnim(null) }}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
