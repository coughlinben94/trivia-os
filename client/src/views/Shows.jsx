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

export default function Shows() {
  const [shows, setShows] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    supabase
      .from('shows')
      .select('id, title, date, player_count, final_scores')
      .order('date', { ascending: false })
      .then(({ data }) => {
        setShows(data ?? [])
        setLoading(false)
      })
  }, [])

  // Weekly player count chart
  const weekMap = {}
  shows.forEach(s => {
    if (!s.date) return
    const key = getMondayLabel(s.date)
    if (!weekMap[key]) weekMap[key] = { week: key, players: 0, shows: 0 }
    weekMap[key].players += s.player_count ?? 0
    weekMap[key].shows += 1
  })
  const weeks = Object.values(weekMap)
    .sort((a, b) => b.week.localeCompare(a.week))
    .slice(0, 8)
  const maxPlayers = Math.max(...weeks.map(w => w.players), 1)

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 220ms cubic-bezier(0.23,1,0.32,1) both; }
      `}</style>

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">My Shows</h1>
            <p className="text-xs text-gray-400 mt-0.5">{shows.length} shows</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="text-xs text-[#1a6b4a] font-semibold hover:underline">
              Dashboard →
            </a>
            <a href="/host" className="text-xs text-gray-400 hover:text-gray-700 transition-colors duration-[120ms]">
              ← Back to host
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">

        {/* Weekly player chart */}
        {weeks.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Players per week</h2>
            <div className="space-y-2">
              {weeks.map((w, i) => {
                const d = new Date(w.week + 'T12:00:00')
                const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                const pct = (w.players / maxPlayers) * 100
                return (
                  <div key={w.week} className="flex items-center gap-3 fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                    <span className="text-xs text-gray-400 w-14 shrink-0 text-right">{label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full bg-[#1a6b4a]"
                        style={{ width: `${pct}%`, transition: 'width 400ms cubic-bezier(0.23,1,0.32,1)' }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-8 shrink-0">
                      {w.players}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Show list */}
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
        ) : shows.length === 0 ? (
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
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {/* Date */}
                  <div className="shrink-0 w-10 text-center">
                    <p className="text-lg font-bold text-gray-900 leading-none">
                      {show.date ? new Date(show.date + 'T12:00:00').getDate() : '—'}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">
                      {show.date ? new Date(show.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }) : ''}
                    </p>
                  </div>

                  <div className="w-px h-8 bg-gray-100 shrink-0" />

                  {/* Title + date */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{show.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{dateLabel}</p>
                  </div>

                  {/* Winner */}
                  {winner && (
                    <div className="shrink-0 text-right hidden sm:block">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Winner</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{winner.name}</p>
                      <p className="text-xs text-[#1a6b4a] font-semibold">{winner.total} pts</p>
                    </div>
                  )}

                  {/* Player count */}
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
      </div>
    </div>
  )
}
