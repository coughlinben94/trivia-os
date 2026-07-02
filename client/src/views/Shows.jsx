import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { THEMES } from '../themes/index.js'
import { MEDALS } from '../lib/scoreboardMath.js'

function getThemeName(id) {
  return THEMES.find(t => t.id === id)?.name ?? id ?? '—'
}

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
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    supabase
      .from('shows')
      .select('id, title, date, player_count, final_scores, theme')
      .order('date', { ascending: false })
      .then(({ data }) => {
        setShows(data ?? [])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    setLoadingDetail(true)
    supabase
      .from('shows')
      .select('id, title, date, player_count, final_scores, slides, rounds, theme')
      .eq('id', selectedId)
      .single()
      .then(({ data }) => {
        setDetail(data)
        setLoadingDetail(false)
      })
  }, [selectedId])

  // Weekly player chart (most recent 8 weeks)
  const weekMap = {}
  shows.forEach(s => {
    if (!s.date) return
    const key = getMondayLabel(s.date)
    if (!weekMap[key]) weekMap[key] = { week: key, players: 0 }
    weekMap[key].players += s.player_count ?? 0
  })
  const weeks = Object.values(weekMap).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 8)
  const maxPlayers = Math.max(...weeks.map(w => w.players), 1)

  function closeDetail() {
    setSelectedId(null)
    setDetail(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 220ms cubic-bezier(0.23,1,0.32,1) both; }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .slide-in-right { animation: slideInRight 200ms cubic-bezier(0.23,1,0.32,1) both; }
      `}</style>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-16">Loading…</p>
      ) : (
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

          {/* Weekly player chart */}
          {weeks.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm fade-up">
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
                const winner = (show.final_scores ?? [])[0]
                const dateLabel = show.date
                  ? new Date(show.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
                  : 'No date'
                return (
                  <button
                    key={show.id}
                    onClick={() => setSelectedId(show.id)}
                    className="w-full bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4 text-left hover:border-[#1a6b4a]/40 hover:shadow-sm host-button fade-up"
                    style={{ animationDelay: `${i * 30}ms` }}
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
        </div>
      )}

      {/* Show detail drawer */}
      {selectedId && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={closeDetail}
          />

          {/* Panel */}
          <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-xl z-50 flex flex-col slide-in-right">

            {/* Drawer header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              {loadingDetail || !detail ? (
                <div>
                  <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-gray-100 rounded animate-pulse mt-2" />
                </div>
              ) : (
                <div className="min-w-0 pr-4">
                  <h2 className="text-base font-bold text-gray-900 truncate">{detail.title}</h2>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-gray-400">
                      {detail.date
                        ? new Date(detail.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                        : 'No date'}
                    </p>
                    {detail.theme && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{getThemeName(detail.theme)}</span>
                      </>
                    )}
                    {(detail.player_count ?? 0) > 0 && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{detail.player_count} teams</span>
                      </>
                    )}
                  </div>
                </div>
              )}
              <button
                onClick={closeDetail}
                className="shrink-0 text-gray-400 hover:text-gray-700 text-xl leading-none host-button p-1"
              >
                ×
              </button>
            </div>

            {/* Drawer body — scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {loadingDetail && (
                <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
              )}

              {!loadingDetail && detail && (() => {
                const scores = detail.final_scores ?? []
                const rounds = detail.rounds ?? []
                const slides = detail.slides ?? []

                const roundGroups = rounds
                  .slice()
                  .sort((a, b) => (a.roundNumber ?? a.number ?? 0) - (b.roundNumber ?? b.number ?? 0))
                  .map(r => ({
                    round: r,
                    questions: slides
                      .filter(s => s.roundId === r.id && s.type === 'question')
                      .sort((a, b) => a.order - b.order),
                  }))
                  .filter(g => g.questions.length > 0)

                const orphanQuestions = slides
                  .filter(s => s.type === 'question' && !rounds.find(r => r.id === s.roundId))
                  .sort((a, b) => a.order - b.order)

                return (
                  <>
                    {/* Scoreboard */}
                    {scores.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Final Scoreboard</p>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {scores.map((team, i) => (
                            <div key={team.teamId ?? i} className="flex items-center gap-3 px-4 py-2.5">
                              <span className="text-base w-6 shrink-0 text-center">
                                {MEDALS[i] ?? <span className="text-xs text-gray-400 font-bold">#{i + 1}</span>}
                              </span>
                              {team.color && (
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                              )}
                              <span className="flex-1 text-sm font-medium text-gray-800">{team.name}</span>
                              {team.rounds?.length > 0 && (
                                <div className="flex gap-1">
                                  {team.rounds.map((r, ri) => (
                                    <span key={ri} className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">{r}</span>
                                  ))}
                                </div>
                              )}
                              <span className="text-sm font-bold text-[#1a6b4a] ml-1">{team.total}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Questions by round */}
                    {roundGroups.length > 0 ? roundGroups.map(g => (
                      <div key={g.round.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-gray-100 flex items-baseline gap-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {g.round.title ?? `Round ${g.round.roundNumber ?? ''}`}
                          </p>
                          {g.round.subtitle && (
                            <span className="text-xs text-gray-400">{g.round.subtitle}</span>
                          )}
                          <span className="ml-auto text-xs text-gray-400">{g.questions.length}q</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {g.questions.map((slide, qi) => (
                            <div key={slide.id} className="px-4 py-2.5 flex gap-3">
                              <span className="text-xs text-gray-400 font-medium w-5 shrink-0 mt-0.5">
                                {slide.data?.questionNumber ?? qi + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800 leading-snug">{slide.data?.text ?? '—'}</p>
                                {slide.data?.answer && (
                                  <p className="text-xs text-[#1a6b4a] font-semibold mt-0.5">{slide.data.answer}</p>
                                )}
                              </div>
                              {slide.data?.isShiny && <span className="text-xs shrink-0 mt-0.5">✨</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )) : orphanQuestions.length > 0 ? (
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Questions</p>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {orphanQuestions.map((slide, qi) => (
                            <div key={slide.id} className="px-4 py-2.5 flex gap-3">
                              <span className="text-xs text-gray-400 font-medium w-5 shrink-0 mt-0.5">{qi + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800 leading-snug">{slide.data?.text ?? '—'}</p>
                                {slide.data?.answer && (
                                  <p className="text-xs text-[#1a6b4a] font-semibold mt-0.5">{slide.data.answer}</p>
                                )}
                              </div>
                              {slide.data?.isShiny && <span className="text-xs shrink-0 mt-0.5">✨</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">No questions saved for this show.</p>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
