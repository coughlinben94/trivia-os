import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

function getMondayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday.toISOString().slice(0, 10)
}

function avg(arr) {
  if (!arr.length) return 0
  return Math.round(arr.reduce((s, n) => s + n, 0) / arr.length)
}

export default function Shows() {
  const [shows, setShows] = useState([])
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      supabase.from('shows').select('id, title, date, player_count, final_scores').order('date', { ascending: false }),
      supabase.from('questions').select('type, is_shiny, shiny_type, is_bonus, show_id'),
    ]).then(([showsRes, qRes]) => {
      setShows(showsRes.data ?? [])
      setQuestions(qRes.data ?? [])
      setLoading(false)
    })
  }, [])

  // My Shows section — weekly chart (most recent 8 weeks)
  const weekMapDesc = {}
  shows.forEach(s => {
    if (!s.date) return
    const key = getMondayLabel(s.date)
    if (!weekMapDesc[key]) weekMapDesc[key] = { week: key, players: 0, shows: 0 }
    weekMapDesc[key].players += s.player_count ?? 0
    weekMapDesc[key].shows += 1
  })
  const weeks = Object.values(weekMapDesc).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 8)
  const maxPlayers = Math.max(...weeks.map(w => w.players), 1)

  // Data section stats
  const scoredShows = [...shows].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).filter(s => (s.final_scores ?? []).length > 0)
  const winningScores = scoredShows.map(s => ({
    label: s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : s.title,
    score: s.final_scores[0]?.total ?? 0,
    winner: s.final_scores[0]?.name ?? '—',
  }))
  const maxWin = Math.max(...winningScores.map(w => w.score), 1)
  const avgWin = avg(winningScores.map(w => w.score))
  const showsWithPlayers = shows.filter(s => (s.player_count ?? 0) > 0)
  const avgPlayers = avg(showsWithPlayers.map(s => s.player_count))
  const bestScore = winningScores.length ? Math.max(...winningScores.map(w => w.score)) : 0
  const bestShow = winningScores.find(w => w.score === bestScore)
  const allTeamScores = scoredShows.flatMap(s => (s.final_scores ?? []).map(t => t.total ?? 0))
  const avgTeamScore = avg(allTeamScores)

  const weekMapAsc = {}
  shows.forEach(s => {
    if (!s.date) return
    const key = getMondayLabel(s.date)
    if (!weekMapAsc[key]) weekMapAsc[key] = { week: key, players: 0 }
    weekMapAsc[key].players += s.player_count ?? 0
  })
  const weeklyPlayers = Object.values(weekMapAsc).sort((a, b) => a.week.localeCompare(b.week)).slice(-10)
  const maxWeekPlayers = Math.max(...weeklyPlayers.map(w => w.players), 1)

  const qByType = {
    regular: questions.filter(q => q.type === 'regular' && !q.is_shiny).length,
    bonus:   questions.filter(q => q.is_bonus).length,
    shiny:   questions.filter(q => q.is_shiny).length,
    visual:  questions.filter(q => q.shiny_type === 'visual').length,
    audio:   questions.filter(q => q.shiny_type === 'audio').length,
    swing:   questions.filter(q => q.type === 'swing').length,
    pyl:     questions.filter(q => q.type === 'pyl').length,
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 220ms cubic-bezier(0.23,1,0.32,1) both; }
      `}</style>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-16">Loading…</p>
      ) : (
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">

          {/* ── My Shows ── */}
          <section className="space-y-4">
            <h2 className="text-base font-bold text-gray-900 fade-up">My Shows</h2>

            {/* Weekly player chart */}
            {weeks.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm fade-up" style={{ animationDelay: '20ms' }}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Players per week</p>
                <div className="space-y-2">
                  {weeks.map((w, i) => {
                    const d = new Date(w.week + 'T12:00:00')
                    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    return (
                      <div key={w.week} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-14 shrink-0 text-right">{label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-2 rounded-full bg-[#1a6b4a]"
                            style={{ width: `${(w.players / maxPlayers) * 100}%`, transition: 'width 400ms cubic-bezier(0.23,1,0.32,1)' }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 w-8 shrink-0">{w.players}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Show list */}
            {shows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No shows yet.</p>
            ) : (
              <div className="space-y-2">
                {shows.map((show, i) => {
                  const scores = show.final_scores ?? []
                  const winner = scores[0]
                  const dateLabel = show.date
                    ? new Date(show.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
                    : 'No date'
                  return (
                    <button
                      key={show.id}
                      onClick={() => navigate(`/shows/${show.id}`)}
                      className="w-full bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4 text-left hover:border-[#1a6b4a]/40 hover:shadow-sm host-button fade-up"
                      style={{ animationDelay: `${40 + i * 30}ms` }}
                    >
                      <div className="shrink-0 w-10 text-center">
                        <p className="text-lg font-bold text-gray-900 leading-none">
                          {show.date ? new Date(show.date + 'T12:00:00').getDate() : '—'}
                        </p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">
                          {show.date ? new Date(show.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }) : ''}
                        </p>
                      </div>
                      <div className="w-px h-8 bg-gray-100 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{show.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{dateLabel}</p>
                      </div>
                      {winner && (
                        <div className="shrink-0 text-right hidden sm:block">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Winner</p>
                          <p className="text-sm font-semibold text-gray-800 mt-0.5">{winner.name}</p>
                          <p className="text-xs text-[#1a6b4a] font-semibold">{winner.total} pts</p>
                        </div>
                      )}
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Teams</p>
                        <p className="text-sm font-bold text-gray-700 mt-0.5">{show.player_count ?? 0}</p>
                      </div>
                      <span className="text-gray-300 shrink-0">›</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── Data ── */}
          <section className="space-y-4">
            <h2 className="text-base font-bold text-gray-900">Data</h2>

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Shows played',      value: shows.length,      sub: null },
                { label: 'Avg teams / show',  value: avgPlayers || '—', sub: showsWithPlayers.length ? `${showsWithPlayers.length} shows` : 'no data yet' },
                { label: 'Avg winning score', value: avgWin || '—',     sub: scoredShows.length ? `${scoredShows.length} shows` : 'no data yet' },
                { label: 'Record score',      value: bestScore || '—',  sub: bestShow ? `${bestShow.winner} · ${bestShow.label}` : 'no data yet' },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col justify-between min-h-[108px]">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold leading-tight">{label}</p>
                  <div>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
                    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
                  </div>
                </div>
              ))}
            </div>

            {/* Winning scores over time */}
            {winningScores.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Winning score per show</p>
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
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Players per week</p>
                <div className="space-y-2">
                  {weeklyPlayers.map(w => {
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

            {/* Question archive — uniform squares */}
            {questions.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Question archive</p>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Regular', count: qByType.regular, color: 'bg-gray-100 text-gray-600' },
                    { label: 'Bonus',   count: qByType.bonus,   color: 'bg-red-100 text-red-700' },
                    { label: 'Shiny',   count: qByType.shiny,   color: 'bg-yellow-100 text-yellow-700' },
                    { label: 'Visual',  count: qByType.visual,  color: 'bg-emerald-100 text-emerald-700' },
                    { label: 'Audio',   count: qByType.audio,   color: 'bg-sky-100 text-sky-700' },
                    { label: 'Swing',   count: qByType.swing,   color: 'bg-blue-100 text-blue-700' },
                    { label: 'PYL',     count: qByType.pyl,     color: 'bg-purple-100 text-purple-700' },
                    { label: 'Total',   count: questions.length, color: 'bg-gray-800 text-white' },
                  ].map(({ label, count, color }) => (
                    <div key={label} className={`rounded-xl p-4 aspect-square flex flex-col justify-between ${color}`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70 leading-tight">{label}</p>
                      <p className="text-2xl font-bold">{count}</p>
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
          </section>

        </div>
      )}
    </div>
  )
}
