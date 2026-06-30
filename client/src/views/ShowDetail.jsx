import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const MEDAL = ['🥇', '🥈', '🥉']

export default function ShowDetail() {
  const { showId } = useParams()
  const navigate = useNavigate()
  const [show, setShow] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('shows')
      .select('id, title, date, player_count, final_scores, slides, rounds')
      .eq('id', showId)
      .single()
      .then(({ data }) => {
        setShow(data)
        setLoading(false)
      })
  }, [showId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (!show) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Show not found.</p>
      </div>
    )
  }

  const scores = show.final_scores ?? []
  const rounds = show.rounds ?? []
  const slides = show.slides ?? []

  // Build questions grouped by round
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

  // Slides with no roundId (orphans)
  const orphanQuestions = slides.filter(
    s => s.type === 'question' && !rounds.find(r => r.id === s.roundId)
  ).sort((a, b) => a.order - b.order)

  const dateLabel = show.date
    ? new Date(show.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : 'No date'

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 200ms cubic-bezier(0.23,1,0.32,1) both; }
      `}</style>

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{show.title}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{dateLabel} · {show.player_count ?? 0} teams</p>
          </div>
          <button
            onClick={() => navigate('/shows')}
            className="text-xs text-gray-400 hover:text-gray-700 shrink-0 host-button"
          >
            ← All shows
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

        {/* Scoreboard */}
        {scores.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden fade-up">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Final Scoreboard</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {scores.map((team, i) => (
                <div key={team.teamId ?? i} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-lg w-7 shrink-0 text-center">
                    {MEDAL[i] ?? <span className="text-xs text-gray-400 font-bold">#{i + 1}</span>}
                  </span>
                  {team.color && (
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                  )}
                  <span className="flex-1 text-sm font-medium text-gray-800">{team.name}</span>
                  {team.rounds && team.rounds.length > 0 && (
                    <div className="hidden sm:flex gap-1 items-center">
                      {team.rounds.map((r, ri) => (
                        <span key={ri} className="text-[11px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="text-sm font-bold text-[#1a6b4a] ml-2">{team.total}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questions by round */}
        {roundGroups.length > 0 ? (
          roundGroups.map((g, gi) => (
            <div
              key={g.round.id}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden fade-up"
              style={{ animationDelay: `${(gi + 1) * 60}ms` }}
            >
              <div className="px-5 py-3 border-b border-gray-100 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-gray-700">{g.round.title ?? `Round ${g.round.roundNumber ?? gi + 1}`}</h2>
                {g.round.subtitle && (
                  <span className="text-xs text-gray-400">{g.round.subtitle}</span>
                )}
                <span className="ml-auto text-xs text-gray-400">{g.questions.length} q</span>
              </div>
              <div className="divide-y divide-gray-50">
                {g.questions.map((slide, qi) => (
                  <div key={slide.id} className="px-5 py-3 flex gap-3">
                    <span className="text-xs text-gray-400 font-medium w-6 shrink-0 mt-0.5">
                      {slide.data?.questionNumber ?? qi + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 leading-snug">{slide.data?.text ?? '—'}</p>
                      {slide.data?.answer && (
                        <p className="text-xs text-[#1a6b4a] font-semibold mt-0.5">{slide.data.answer}</p>
                      )}
                    </div>
                    {slide.data?.isShiny && (
                      <span className="text-xs shrink-0 mt-0.5">✨</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : orphanQuestions.length > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden fade-up">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Questions</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {orphanQuestions.map((slide, qi) => (
                <div key={slide.id} className="px-5 py-3 flex gap-3">
                  <span className="text-xs text-gray-400 font-medium w-6 shrink-0 mt-0.5">{qi + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-snug">{slide.data?.text ?? '—'}</p>
                    {slide.data?.answer && (
                      <p className="text-xs text-[#1a6b4a] font-semibold mt-0.5">{slide.data.answer}</p>
                    )}
                  </div>
                  {slide.data?.isShiny && (
                    <span className="text-xs shrink-0 mt-0.5">✨</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No questions in this show.</p>
        )}
      </div>
    </div>
  )
}
