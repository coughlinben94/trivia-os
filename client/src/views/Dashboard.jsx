import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const SHINY_COLOR = {
  visual: 'bg-emerald-100 text-emerald-700',
  audio:  'bg-sky-100 text-sky-700',
}

function avg(arr) {
  if (!arr.length) return 0
  return Math.round(arr.reduce((s, n) => s + n, 0) / arr.length)
}

function getMondayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday.toISOString().slice(0, 10)
}

export default function Dashboard() {
  const [shows, setShows] = useState([])
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('shows').select('id, title, date, player_count, final_scores').order('date', { ascending: true }),
      supabase.from('questions').select('type, is_shiny, shiny_type, is_bonus, show_id'),
    ]).then(([showsRes, qRes]) => {
      setShows(showsRes.data ?? [])
      setQuestions(qRes.data ?? [])
      setLoading(false)
    })
  }, [])

  // Shows with actual score data
  const scoredShows = shows.filter(s => (s.final_scores ?? []).length > 0)

  // Winning scores over time
  const winningScores = scoredShows.map(s => ({
    label: s.date
      ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : s.title,
    score: s.final_scores[0]?.total ?? 0,
    winner: s.final_scores[0]?.name ?? '—',
  }))
  const maxWin = Math.max(...winningScores.map(w => w.score), 1)

  // Average winning score
  const avgWin = avg(winningScores.map(w => w.score))

  // Average players per show
  const showsWithPlayers = shows.filter(s => (s.player_count ?? 0) > 0)
  const avgPlayers = avg(showsWithPlayers.map(s => s.player_count))

  // Best score ever
  const bestScore = winningScores.length ? Math.max(...winningScores.map(w => w.score)) : 0
  const bestShow = winningScores.find(w => w.score === bestScore)

  // Average score per team per show (not just winner)
  const allTeamScores = scoredShows.flatMap(s =>
    (s.final_scores ?? []).map(t => t.total ?? 0)
  )
  const avgTeamScore = avg(allTeamScores)

  // Weekly player count
  const weekMap = {}
  shows.forEach(s => {
    if (!s.date) return
    const key = getMondayLabel(s.date)
    if (!weekMap[key]) weekMap[key] = { week: key, players: 0 }
    weekMap[key].players += s.player_count ?? 0
  })
  const weeklyPlayers = Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week)).slice(-10)
  const maxWeekPlayers = Math.max(...weeklyPlayers.map(w => w.players), 1)

  // Question breakdown
  const qByType = {
    regular: questions.filter(q => q.type === 'regular' && !q.is_shiny).length,
    bonus:   questions.filter(q => q.is_bonus).length,
    shiny:   questions.filter(q => q.is_shiny).length,
    visual:  questions.filter(q => q.shiny_type === 'visual').length,
    audio:   questions.filter(q => q.shiny_type === 'audio').length,
    swing:   questions.filter(q => q.type === 'swing').length,
    pyl:     questions.filter(q => q.type === 'pyl').length,
  }

  const statCard = (label, value, sub) => (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 200ms cubic-bezier(0.23,1,0.32,1) both; }
      `}</style>

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
            <p className="text-xs text-gray-400 mt-0.5">{shows.length} shows · {questions.length} questions archived</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/shows" className="text-xs text-gray-400 hover:text-gray-700 transition-colors duration-[120ms]">
              My Shows
            </a>
            <a href="/host" className="text-xs text-gray-400 hover:text-gray-700 transition-colors duration-[120ms]">
              ← Back to host
            </a>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-16">Loading…</p>
      ) : (
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 fade-up">
            {statCard('Shows played', shows.length)}
            {statCard('Avg teams / show', avgPlayers || '—', showsWithPlayers.length ? `across ${showsWithPlayers.length} shows` : 'no data yet')}
            {statCard('Avg winning score', avgWin || '—', scoredShows.length ? `across ${scoredShows.length} shows` : 'no data yet')}
            {statCard('Record score', bestScore || '—', bestShow ? `${bestShow.winner} · ${bestShow.label}` : 'no data yet')}
          </div>

          {/* Winning scores over time */}
          {winningScores.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 fade-up" style={{ animationDelay: '60ms' }}>
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Winning score per show</h2>
              <div className="space-y-2">
                {winningScores.map((w, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-16 shrink-0 text-right">{w.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full bg-[#1a6b4a]"
                        style={{ width: `${(w.score / maxWin) * 100}%`, transition: 'width 500ms cubic-bezier(0.23,1,0.32,1)' }}
                      />
                    </div>
                    <div className="shrink-0 text-right w-24">
                      <span className="text-xs font-bold text-gray-700">{w.score}</span>
                      <span className="text-[10px] text-gray-400 ml-1">{w.winner}</span>
                    </div>
                  </div>
                ))}
              </div>
              {avgWin > 0 && (
                <p className="text-xs text-gray-400 mt-4 text-right">
                  Avg team score: <span className="font-semibold text-gray-600">{avgTeamScore}</span>
                </p>
              )}
            </div>
          )}

          {/* Weekly players */}
          {weeklyPlayers.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 fade-up" style={{ animationDelay: '100ms' }}>
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Players per week</h2>
              <div className="space-y-2">
                {weeklyPlayers.map((w, i) => {
                  const d = new Date(w.week + 'T12:00:00')
                  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  return (
                    <div key={w.week} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-14 shrink-0 text-right">{label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-blue-400"
                          style={{ width: `${(w.players / maxWeekPlayers) * 100}%`, transition: 'width 500ms cubic-bezier(0.23,1,0.32,1)' }}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-6 shrink-0">{w.players}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Question archive breakdown */}
          {questions.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 fade-up" style={{ animationDelay: '140ms' }}>
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Question archive breakdown</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Regular', count: qByType.regular, color: 'bg-gray-100 text-gray-600' },
                  { label: 'Bonus', count: qByType.bonus, color: 'bg-red-100 text-red-700' },
                  { label: 'Shiny', count: qByType.shiny, color: 'bg-yellow-100 text-yellow-700' },
                  { label: 'Shiny Visual', count: qByType.visual, color: 'bg-emerald-100 text-emerald-700' },
                  { label: 'Shiny Audio', count: qByType.audio, color: 'bg-sky-100 text-sky-700' },
                  { label: 'Swing', count: qByType.swing, color: 'bg-blue-100 text-blue-700' },
                  { label: 'PYL', count: qByType.pyl, color: 'bg-purple-100 text-purple-700' },
                ].map(({ label, count, color }) => (
                  <div key={label} className={`rounded-xl px-4 py-3 ${color}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
                    <p className="text-2xl font-bold mt-0.5">{count}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {shows.length > 0 && scoredShows.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">
              Score data will appear after you hit "Save Results" at the end of a show.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
