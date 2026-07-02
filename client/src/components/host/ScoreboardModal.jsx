import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useTheme } from '../shared/ThemeProvider.jsx'
import { deriveRoundCols, computeTotal } from '../../lib/scoreboardMath.js'
import gsap from 'gsap'

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
            <tr key={team.id} className={`group border-b border-gray-50 transition-colors ${
              highlight ? 'bg-yellow-100' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
            }`}>
              <td className="text-center text-xs text-gray-300 w-6">{i + 1}</td>
              <td className="px-2 py-1">
                <input type="text" value={team.name} placeholder="Team name…"
                  onChange={e => onUpdateName(team.id, e.target.value)}
                  className="w-full text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-[#1a6b4a] outline-none py-0.5 placeholder:text-gray-300" />
              </td>
              {cols.map(c => (
                <td key={c.key} className="px-1 py-1 text-center">
                  <input type="number" value={team.scores[c.key] ?? ''} placeholder="—"
                    onChange={e => onUpdateScore(team.id, c.key, e.target.value)}
                    className="w-full text-center text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-[#1a6b4a] outline-none py-0.5 placeholder:text-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
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

// ─── Spin Wheel ──────────────────────────────────────────────────────────────

const SPIN_MS = 4000

function arcPath(cx, cy, r, startDeg, endDeg) {
  const rad = d => (d - 90) * Math.PI / 180
  const sx = cx + r * Math.cos(rad(startDeg))
  const sy = cy + r * Math.sin(rad(startDeg))
  const ex = cx + r * Math.cos(rad(endDeg))
  const ey = cy + r * Math.sin(rad(endDeg))
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M${cx},${cy} L${sx},${sy} A${r},${r},0,${large},1,${ex},${ey} Z`
}

function SpinWheel({ initialPool, colors, onComplete, onClose }) {
  const SIZE = 320
  const R    = 148
  const CX   = SIZE / 2
  const CY   = SIZE / 2
  const toRad = d => (d - 90) * Math.PI / 180

  const [pool,      setPool]      = useState(initialPool)
  const [rotation,  setRotation]  = useState(0)
  const [spinning,  setSpinning]  = useState(false)
  const [landed,    setLanded]    = useState(null)
  const [advancing, setAdvancing] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const timerRef        = useRef(null)
  const tlRef           = useRef(null)
  const sectorGroupRefs = useRef({})
  const winnerRef       = useRef(null)
  const popupRef        = useRef(null)
  const wheelWrapRef    = useRef(null)
  const overlayRef      = useRef(null)

  const n         = pool.length
  const sectorDeg = n > 0 ? 360 / n : 360

  useEffect(() => () => {
    clearTimeout(timerRef.current)
    tlRef.current?.kill()
  }, [])

  // Drives the full popup → poof → wheel poof → fade sequence
  useEffect(() => {
    if (!showPopup || !popupRef.current) return
    const winner = winnerRef.current
    const tl = gsap.timeline()
    tlRef.current = tl

    // Popup slams in with a bounce
    gsap.set(popupRef.current, { scale: 0.55, opacity: 0 })
    tl.to(popupRef.current, { scale: 1.07, opacity: 1, duration: 0.22, ease: 'power3.out' })
      .to(popupRef.current, { scale: 1,    duration: 0.16, ease: 'power2.inOut' })

    // Hold for a beat, then popup poofs off
    tl.to(popupRef.current, { scale: 1.40, opacity: 0, duration: 0.30, ease: 'power2.in' }, '+=0.90')

    // Wheel poofs off overlapping the popup exit
    if (wheelWrapRef.current) {
      tl.to(wheelWrapRef.current, { scale: 1.22, opacity: 0, duration: 0.28, ease: 'power2.in' }, '-=0.12')
    }

    // Fade overlay to black before unmount
    if (overlayRef.current) {
      tl.to(overlayRef.current, { opacity: 0, duration: 0.22, ease: 'power1.in' }, '-=0.10')
    }

    tl.call(() => onComplete(winner.id))
  }, [showPopup]) // eslint-disable-line react-hooks/exhaustive-deps

  function spin() {
    if (spinning || n < 1) return
    const winnerIdx  = Math.floor(Math.random() * n)
    const sectorMid  = winnerIdx * sectorDeg + sectorDeg / 2
    const want       = (360 - sectorMid % 360 + 360) % 360
    const currentMod = ((rotation % 360) + 360) % 360
    let   delta      = (want - currentMod + 360) % 360
    if (delta < 45) delta += 360
    const target = rotation + (5 + Math.floor(Math.random() * 4)) * 360 + delta

    setSpinning(true)
    setRotation(target)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setSpinning(false)
      setLanded(pool[winnerIdx])
    }, SPIN_MS + 120)
  }

  function advance() {
    if (!landed || advancing) return
    setAdvancing(true)
    winnerRef.current = landed
    setShowPopup(true)
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 select-none"
      style={{ background: 'rgba(0,0,0,0.90)', backdropFilter: 'blur(14px)' }}
    >
      {/* Header — hidden once exit sequence starts */}
      {!advancing && (
        <div className="text-center">
          <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-1.5">Press Your Luck</p>
          <p className="text-white/80 text-xl font-bold" style={{ fontFamily: 'Boogaloo, sans-serif' }}>
            Who picks the category?
          </p>
        </div>
      )}

      {/* Wheel + pointer */}
      <div ref={wheelWrapRef} className="relative flex flex-col items-center" style={{ width: SIZE }}>
        {/* Downward pointer at 12 o'clock */}
        <div style={{
          width: 0, height: 0, position: 'relative', zIndex: 2,
          borderLeft: '13px solid transparent',
          borderRight: '13px solid transparent',
          borderTop: '28px solid white',
          filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))',
        }} />

        {/* Spinning wheel */}
        <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
          <div style={{
            width: SIZE, height: SIZE,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
            willChange: 'transform',
          }}>
            <svg width={SIZE} height={SIZE} style={{ display: 'block' }}>
              {pool.map((team, i) => {
                const startDeg = i * sectorDeg
                const endDeg   = (i + 1) * sectorDeg
                const midDeg   = startDeg + sectorDeg / 2
                const tx = CX + R * 0.58 * Math.cos(toRad(midDeg))
                const ty = CY + R * 0.58 * Math.sin(toRad(midDeg))
                const label = (team.name || '?').length > 10
                  ? (team.name || '?').slice(0, 9) + '…'
                  : (team.name || '?')
                return (
                  <g key={team.id} ref={el => { sectorGroupRefs.current[team.id] = el }}>
                    <path
                      d={arcPath(CX, CY, R, startDeg, endDeg)}
                      fill={colors[i % colors.length]}
                      stroke="rgba(255,255,255,0.20)"
                      strokeWidth="2"
                    />
                    <text
                      x={tx} y={ty}
                      textAnchor="middle" dominantBaseline="middle"
                      transform={`rotate(${midDeg - 90}, ${tx}, ${ty})`}
                      fill="white"
                      fontSize={sectorDeg > 50 ? '13' : '11'}
                      fontWeight="700"
                      fontFamily="DM Sans, sans-serif"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                      {label}
                    </text>
                  </g>
                )
              })}
              {/* Center hub */}
              <circle cx={CX} cy={CY} r={24} fill="white" />
              <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle" fontSize="20">🎰</text>
            </svg>
          </div>
        </div>
      </div>

      {/* Result + buttons — hidden once exit sequence starts */}
      {!advancing && (
        <>
          <div className="h-12 flex items-center justify-center">
            {landed && !spinning && (
              <p
                className="text-3xl font-bold text-yellow-400"
                style={{
                  fontFamily: 'Boogaloo, sans-serif',
                  animation: 'fadeSlideUp 0.32s cubic-bezier(0.23,1,0.32,1) both',
                }}
              >
                {landed.name}!
              </p>
            )}
            {spinning && (
              <p className="text-white/30 text-sm uppercase tracking-widest">Spinning…</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!spinning && !landed && (
              <button
                onClick={spin}
                className="bg-[#1a6b4a] text-white font-bold text-lg px-10 py-3.5 rounded-2xl host-button hover:bg-green-900 shadow-xl"
              >
                🎡 Spin!
              </button>
            )}
            {!spinning && landed && (
              <button
                onClick={advance}
                className="bg-[#1a6b4a] text-white font-bold text-lg px-10 py-3.5 rounded-2xl host-button hover:bg-green-900 shadow-xl"
              >
                They choose! →
              </button>
            )}
            <button onClick={onClose} className="text-white/30 hover:text-white/60 text-sm px-4 py-3 host-button">
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Winner popup — bounces in, holds, then poofs off before wheel exits */}
      {showPopup && landed && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div
            ref={popupRef}
            className="rounded-3xl flex flex-col items-center gap-3 text-center"
            style={{
              opacity: 0,
              padding: '3.5rem 5rem',
              minWidth: 340,
              background: 'rgba(12,8,4,0.97)',
              border: '2px solid rgba(250,204,21,0.60)',
              boxShadow: '0 0 80px rgba(250,204,21,0.18), 0 30px 80px rgba(0,0,0,0.75)',
            }}
          >
            <div style={{ fontSize: 36, lineHeight: 1 }}>🎉</div>
            <p style={{
              fontFamily: 'Boogaloo, sans-serif',
              fontSize: '4.5rem',
              fontWeight: 700,
              color: 'white',
              lineHeight: 1.05,
              margin: 0,
            }}>
              {landed.name}!
            </p>
            <p style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'rgba(250,204,21,0.65)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              margin: 0,
            }}>
              Picks the category
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ScoreboardModal ──────────────────────────────────────────────────────────

export default function ScoreboardModal({ show, onClose }) {
  const { theme } = useTheme()
  const [teams,        setTeams]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [highlightIds, setHighlightIds] = useState(null)
  const [quickEntry,   setQuickEntry]   = useState(false)
  const [wheelOpen,    setWheelOpen]    = useState(false)
  const [wheelPool,    setWheelPool]    = useState([])
  const [confirmClear, setConfirmClear] = useState(false)
  const saveTimers = useRef({})

  const cols           = deriveRoundCols(show)
  const teamsWithStats = addStats(teams, cols)
  const half           = Math.ceil(teamsWithStats.length / 2)
  const leftTeams      = teamsWithStats.slice(0, half)
  const rightTeams     = teamsWithStats.slice(half)

  // Wheel sector colors drawn from the current theme
  const wheelColors = [
    theme.colors.accent,
    theme.colors.highlight,
    theme.colors.shinyAccent || theme.colors.bgDeep || '#334155',
  ]

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
    const sorted    = [...teams].sort((a, b) => computeTotal(b.scores, cols) - computeTotal(a.scores, cols))
    const reordered = sorted.map((t, i) => ({ ...t, sort_order: i }))
    setTeams(reordered)
    await supabase.from('scoreboard_teams').upsert(
      reordered.map(t => ({ id: t.id, show_id: t.show_id, name: t.name, scores: t.scores, sort_order: t.sort_order }))
    )
  }

  async function clearScores() {
    // Cancel any pending debounced saves so they don't overwrite after the clear
    Object.values(saveTimers.current).forEach(clearTimeout)
    saveTimers.current = {}
    const cleared = teams.map(t => ({ ...t, scores: {} }))
    setTeams(cleared)
    setHighlightIds(null)
    await supabase.from('scoreboard_teams').upsert(
      cleared.map(t => ({ id: t.id, show_id: t.show_id, name: t.name, scores: {}, sort_order: t.sort_order }))
    )
  }

  function quickSave(teamId, colKey, score) { updateScore(teamId, colKey, score) }

  function openWheel() {
    if (teamsWithStats.length < 2) return
    const shuffled = [...teamsWithStats].sort(() => Math.random() - 0.5)
    setWheelPool(teamsWithStats.length === 2 ? shuffled : shuffled.slice(0, 2))
    setWheelOpen(true)
  }

  const btnBase = 'text-sm font-medium px-3 py-1.5 rounded-lg host-button transition-colors'

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
              onClick={openWheel}
              disabled={teamsWithStats.length < 2}
              className={`${btnBase} bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed`}
            >🎡 PYL Wheel</button>
            {confirmClear ? (
              <div className="flex items-center gap-1.5 ml-1">
                <span className="text-xs text-red-600 font-semibold">Clear all scores?</span>
                <button onClick={() => { clearScores(); setConfirmClear(false) }} className={`${btnBase} bg-red-500 text-white hover:bg-red-600`}>Yes, clear</button>
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
                  <TeamTable teams={leftTeams} cols={cols} onUpdateName={updateName} onUpdateScore={updateScore} onDelete={deleteTeam} highlightIds={highlightIds} />
                </div>
                {rightTeams.length > 0 && (
                  <>
                    <div className="w-px bg-gray-100 shrink-0 self-stretch" />
                    <div className="flex-1 overflow-x-auto">
                      <TeamTable teams={rightTeams} cols={cols} onUpdateName={updateName} onUpdateScore={updateScore} onDelete={deleteTeam} highlightIds={highlightIds} />
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

      {wheelOpen && (
        <SpinWheel
          initialPool={wheelPool}
          colors={wheelColors}
          onComplete={(id) => {
            setHighlightIds([id])
            setWheelOpen(false)
          }}
          onClose={() => setWheelOpen(false)}
        />
      )}
    </>
  )
}
