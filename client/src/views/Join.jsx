import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { supabase } from '../lib/supabase.js'

const TEAM_COLORS = [
  '#f5c842', '#e02020', '#60c000', '#4a90d9', '#c96fff',
  '#ff8c00', '#00bcd4', '#e91e8c', '#8bc34a', '#ff5722',
]

function getTeamKey(showId) {
  return `trivia-os:team:${showId}`
}

function loadStoredTeam(showId) {
  try {
    return JSON.parse(localStorage.getItem(getTeamKey(showId))) ?? null
  } catch {
    return null
  }
}

function saveStoredTeam(showId, team) {
  localStorage.setItem(getTeamKey(showId), JSON.stringify(team))
}

// --- Views ---

function WaitingScreen({ teamName, show }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-8 opacity-40">
        <div className="w-12 h-12 rounded-full border-2 border-white mx-auto mb-4 flex items-center justify-center">
          <span className="text-xl">🍺</span>
        </div>
      </div>
      <h2 className="text-white text-2xl font-bold mb-2">You're in!</h2>
      <p className="text-white/60 text-base mb-1">
        Team <span className="text-white font-semibold">{teamName}</span>
      </p>
      <p className="text-white/40 text-sm mt-6">
        Hang tight while Ben gets things going…
      </p>
      {show?.title && (
        <p className="text-white/30 text-xs mt-2">{show.title}</p>
      )}
    </div>
  )
}

function SlideViewer({ show, team, slides, viewedIndex, setViewedIndex }) {
  const hostIndex = show?.current_slide_index ?? 0
  const canGoForward = viewedIndex < hostIndex
  const canGoBack = viewedIndex > 0
  const currentSlide = slides[viewedIndex]

  async function handleBack() {
    if (!canGoBack) return
    setViewedIndex(v => v - 1)
    if (team) {
      await supabase.from('teams').update({
        last_action: 'went_back',
        last_action_at: new Date().toISOString(),
      }).eq('id', team.id)
    }
  }

  async function handleForwardBlocked() {
    // The button is disabled but touch events can still fire — log the attempt
    if (team) {
      await supabase.from('teams').update({
        last_action: 'tried_to_advance',
        last_action_at: new Date().toISOString(),
      }).eq('id', team.id)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pb-3 pt-4 border-b border-white/10">
        <span className="text-white/50 text-xs font-medium">
          {team?.name ?? 'Team'}
        </span>
        <span className="text-white/30 text-xs">
          {currentSlide ? `${viewedIndex + 1} / ${slides.length}` : '—'}
        </span>
      </div>

      {/* Slide content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {currentSlide ? (
          <SlideContent slide={currentSlide} show={show} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-white/30 text-sm">No slide</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 py-4 pb-safe border-t border-white/10 gap-4">
        <button
          onClick={handleBack}
          disabled={!canGoBack}
          className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
            canGoBack
              ? 'bg-white/10 text-white hover:bg-white/20 active:bg-white/30'
              : 'bg-white/5 text-white/20 cursor-not-allowed'
          }`}
        >
          ← Back
        </button>
        <button
          onClick={canGoForward ? () => setViewedIndex(v => v + 1) : handleForwardBlocked}
          disabled={!canGoForward}
          className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
            canGoForward
              ? 'bg-white text-gray-900 hover:bg-white/90 active:bg-white/80'
              : 'bg-white/5 text-white/20 cursor-not-allowed'
          }`}
        >
          {canGoForward ? 'Next →' : 'Wait →'}
        </button>
      </div>
    </div>
  )
}

function SlideContent({ slide, show }) {
  const roundName = show?.rounds?.find(r => r.id === slide.roundId)?.title ?? null

  switch (slide.type) {
    case 'question':
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {roundName && (
              <span className="text-white/40 text-xs font-medium uppercase tracking-wider">
                {roundName}
              </span>
            )}
            {slide.data.questionLabel && (
              <span className="bg-white/10 text-white/70 text-xs font-bold px-2 py-0.5 rounded">
                {slide.data.questionLabel}
              </span>
            )}
            {slide.data.isShiny && (
              <span className="text-yellow-400 text-xs">✨ Shiny</span>
            )}
          </div>
          {slide.data.isSeries && slide.data.seriesTheme && (
            <p className="text-white/50 text-xs font-medium uppercase tracking-widest">
              {slide.data.seriesTheme}
            </p>
          )}
          <p className="text-white text-xl font-medium leading-relaxed">
            {slide.data.text || <span className="text-white/30 italic">No question text</span>}
          </p>
          {slide.data.mediaUrl && slide.data.mediaType?.startsWith('image/') && (
            <img
              src={slide.data.mediaUrl}
              alt="Question media"
              className="w-full rounded-xl object-cover max-h-56"
            />
          )}
          {slide.data.mediaUrl && slide.data.mediaType?.startsWith('audio/') && (
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <p className="text-white/50 text-sm">🎵 Audio question — listen on the main screen</p>
            </div>
          )}
        </div>
      )

    case 'round-intro':
      return (
        <div className="space-y-3 pt-8">
          <p className="text-white/40 text-sm uppercase tracking-widest">Round {slide.data.roundNumber}</p>
          <h2 className="text-white text-3xl font-bold">{slide.data.roundTitle}</h2>
          {slide.data.subtitle && (
            <p className="text-white/60 text-lg italic">{slide.data.subtitle}</p>
          )}
        </div>
      )

    case 'grading-break':
      return (
        <div className="pt-8 text-center space-y-4">
          <div className="text-4xl">☕</div>
          <p className="text-white text-lg font-medium">
            {slide.data.message || 'Grading break — sit back and relax!'}
          </p>
        </div>
      )

    case 'scoreboard-reveal':
      return (
        <div className="pt-8 text-center space-y-3">
          <div className="text-4xl">🏆</div>
          <h2 className="text-white text-2xl font-bold">
            {slide.data.title || 'Leaderboard'}
          </h2>
          <p className="text-white/40 text-sm">Scores will appear when revealed</p>
        </div>
      )

    case 'title':
      return (
        <div className="pt-8 text-center space-y-2">
          <h1 className="text-white text-3xl font-bold">{slide.data.title || 'Trivia Night'}</h1>
          {slide.data.subtitle && (
            <p className="text-white/60 text-lg">{slide.data.subtitle}</p>
          )}
        </div>
      )

    case 'multi-question':
      return (
        <div className="space-y-4">
          {roundName && (
            <p className="text-white/40 text-xs font-medium uppercase tracking-wider">{roundName}</p>
          )}
          <h3 className="text-white text-lg font-semibold">
            {slide.data.title || 'Questions'}
          </h3>
          <ol className="space-y-3">
            {(slide.data.questions ?? []).map((q, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-white/40 font-bold shrink-0">{i + 1}.</span>
                <span className="text-white">{q.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )

    default:
      return (
        <div className="pt-8 text-center">
          <p className="text-white/50 text-sm capitalize">{slide.type.replace(/-/g, ' ')}</p>
        </div>
      )
  }
}

function RegistrationScreen({ onRegister, show, loading }) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSubmitting(true)
    setError(null)
    try {
      await onRegister(trimmed)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-white/10 mx-auto mb-4 flex items-center justify-center">
            <span className="text-2xl">🍺</span>
          </div>
          <h1 className="text-white text-2xl font-bold">Baynes Trivia</h1>
          {show?.title && (
            <p className="text-white/40 text-sm mt-1">{show.title}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/60 text-xs font-medium mb-2 uppercase tracking-wider">
              Team Name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Quiz Khalifa"
              maxLength={40}
              autoComplete="off"
              autoCapitalize="words"
              className="w-full bg-white/10 text-white text-lg font-medium px-4 py-4 rounded-xl border border-white/10 placeholder:text-white/20 focus:outline-none focus:border-white/30 focus:bg-white/15 transition-all"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={!name.trim() || submitting || loading}
            className="w-full bg-white text-gray-900 font-bold text-base py-4 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-opacity active:scale-95"
          >
            {submitting ? 'Joining…' : "Let's Go"}
          </button>
        </form>

        <p className="text-white/20 text-xs text-center mt-6">
          Have fun, and don't yell at me, I'm not a professional trivia writer! lol
        </p>
      </div>
    </div>
  )
}

// --- Main component ---

export default function Join() {
  const [searchParams] = useSearchParams()
  const showId = searchParams.get('show')

  const [show, setShow] = useState(null)
  const [showLoading, setShowLoading] = useState(true)
  const [team, setTeam] = useState(null)
  const [viewedIndex, setViewedIndex] = useState(0)
  const [registering, setRegistering] = useState(false)

  // Load show and check for existing team registration
  useEffect(() => {
    if (!showId) { setShowLoading(false); return }

    async function init() {
      // First try to find the live show (or load by ID if provided)
      let targetId = showId
      if (showId === 'live') {
        const { data } = await supabase.from('shows').select('*').eq('is_live', true).single()
        if (data) { targetId = data.id; setShow(data) }
        setShowLoading(false)
        return
      }

      const { data } = await supabase.from('shows').select('*').eq('id', targetId).single()
      if (data) setShow(data)
      setShowLoading(false)

      // Restore team registration from localStorage
      const storedTeam = loadStoredTeam(targetId)
      if (storedTeam) setTeam(storedTeam)
    }

    init()
  }, [showId])

  // Subscribe to show changes (current_slide_index, is_live)
  useEffect(() => {
    if (!showId || showId === 'live') return
    const channel = supabase
      .channel(`join-show:${showId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shows', filter: `id=eq.${showId}` },
        (payload) => { setShow(payload.new) }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [showId])

  // Track when team leaves the app
  useEffect(() => {
    if (!team) return
    function handleVisibility() {
      supabase.from('teams').update({
        is_connected: !document.hidden,
        last_action: document.hidden ? 'left_app' : null,
        last_action_at: new Date().toISOString(),
      }).eq('id', team.id)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [team?.id])

  // Sync viewedIndex forward when host advances (don't fall too far behind)
  useEffect(() => {
    const hostIndex = show?.current_slide_index ?? 0
    // Auto-advance viewer to host position if they're more than 1 slide behind
    // (but never further than host's current position)
    setViewedIndex(prev => Math.min(prev, hostIndex))
  }, [show?.current_slide_index])

  async function handleRegister(name) {
    setRegistering(true)
    // Check for duplicate team name
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('show_id', showId)
      .ilike('name', name)
      .single()
    if (existing) throw new Error('That name is taken — try something else!')

    const color = TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)]
    const teamId = `team_${nanoid(8)}`
    const { error } = await supabase.from('teams').insert({
      id: teamId,
      show_id: showId,
      name,
      color,
      is_connected: true,
      powerup_used: false,
    })
    if (error) throw new Error(error.message)

    const newTeam = { id: teamId, name, color, showId }
    setTeam(newTeam)
    saveStoredTeam(showId, newTeam)
    setRegistering(false)
  }

  if (!showId) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <p className="text-white/40 text-sm text-center">
          Scan the QR code at the bar to join tonight's trivia!
        </p>
      </div>
    )
  }

  if (showLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-white/30 text-sm">Loading…</div>
      </div>
    )
  }

  if (!show) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <p className="text-white/40 text-sm text-center">
          Show not found. Ask Ben for the QR code!
        </p>
      </div>
    )
  }

  if (!team) {
    return (
      <RegistrationScreen
        onRegister={handleRegister}
        show={show}
        loading={registering}
      />
    )
  }

  if (!show.is_live) {
    return <WaitingScreen teamName={team.name} show={show} />
  }

  const slides = (show.slides ?? []).slice().sort((a, b) => a.order - b.order)

  return (
    <SlideViewer
      show={show}
      team={team}
      slides={slides}
      viewedIndex={viewedIndex}
      setViewedIndex={setViewedIndex}
    />
  )
}
