import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { nanoid } from 'nanoid'
import QRCode from 'qrcode'
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

// --- Sub-components ---

function PowerupButton({ powerup, used, onInvoke }) {
  const [confirming, setConfirming] = useState(false)
  const [invoking, setInvoking] = useState(false)

  if (!powerup) return null

  if (used) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white/5 rounded-xl">
        <span className="text-base opacity-40">{powerup.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white/25 text-xs font-medium">{powerup.name}</p>
          <p className="text-white/20 text-xs">Used ✓</p>
        </div>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="p-4 bg-white/10 rounded-xl border border-white/20">
        <p className="text-white text-sm font-semibold mb-1">
          Use your {powerup.name}?
        </p>
        <p className="text-white/50 text-xs mb-3 leading-relaxed">
          {powerup.description} This cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="flex-1 py-2.5 rounded-lg bg-white/10 text-white/70 text-sm font-medium active:bg-white/20 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={invoking}
            onClick={async () => {
              setInvoking(true)
              await onInvoke(powerup)
              setConfirming(false)
              setInvoking(false)
            }}
            className="flex-1 py-2.5 rounded-lg bg-[#e02020] text-white text-sm font-bold active:bg-[#c01818] transition-colors disabled:opacity-50"
          >
            {invoking ? '…' : `${powerup.icon} Use it!`}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-full flex items-center gap-3 px-4 py-2.5 bg-[#004000]/50 border border-[#60c000]/25 rounded-xl active:bg-[#004000]/80 transition-colors"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <span className="text-base">{powerup.icon}</span>
      <div className="flex-1 text-left min-w-0">
        <p className="text-[#60c000] text-xs font-bold leading-none mb-0.5">{powerup.name}</p>
        <p className="text-white/35 text-xs truncate">{powerup.description}</p>
      </div>
      <span className="text-white/25 text-xs shrink-0">Tap →</span>
    </button>
  )
}

function LeaderboardOverlay({ leaderboard, myTeamId, onClose }) {
  return (
    <div className="absolute inset-0 bg-gray-950 z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pb-3 pt-4 border-b border-white/10 shrink-0">
        <h2
          className="text-white text-lg font-bold"
          style={{ fontFamily: "'Boogaloo', sans-serif" }}
        >
          🏆 Leaderboard
        </h2>
        <button
          onClick={onClose}
          className="text-white/40 text-sm px-3 py-1 rounded-lg bg-white/5 active:bg-white/10 transition-colors"
        >
          Back
        </button>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto py-3 px-4 space-y-2">
        {leaderboard.map((team, index) => {
          const isMe = team.id === myTeamId
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null
          return (
            <div
              key={team.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                isMe
                  ? 'bg-white/15 border border-white/25'
                  : 'bg-white/5'
              }`}
            >
              <span className={`text-base w-6 text-center shrink-0 ${
                !medal ? 'text-white/30 text-sm font-bold' : ''
              }`}>
                {medal ?? `${index + 1}`}
              </span>
              <span className={`flex-1 text-sm font-medium truncate ${
                isMe ? 'text-white' : 'text-white/65'
              }`}>
                {team.name}
                {isMe && (
                  <span className="text-white/35 text-xs font-normal ml-1.5">you</span>
                )}
              </span>
              <span className={`font-bold text-sm tabular-nums shrink-0 ${
                index === 0 ? 'text-yellow-400' : isMe ? 'text-white' : 'text-white/60'
              }`}
                style={index === 0 ? { fontFamily: "'Boogaloo', sans-serif" } : undefined}
              >
                {team.total}
              </span>
            </div>
          )
        })}
        {leaderboard.length === 0 && (
          <p className="text-white/30 text-sm text-center pt-8">No scores yet</p>
        )}
      </div>
    </div>
  )
}

// --- WaitingScreen ---

function WaitingScreen({ teamName, show, showId }) {
  const [teams, setTeams] = useState([])
  const [qrDataUrl, setQrDataUrl] = useState(null)

  const joinUrl = `${window.location.origin}/join?show=${showId}`

  useEffect(() => {
    if (!showId) return

    supabase
      .from('teams')
      .select('id, name')
      .eq('show_id', showId)
      .order('registered_at', { ascending: true })
      .then(({ data }) => { if (data) setTeams(data) })

    const channel = supabase
      .channel(`waiting-teams:${showId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'teams',
        filter: `show_id=eq.${showId}`,
      }, (payload) => {
        setTeams(prev => {
          if (prev.some(t => t.id === payload.new.id)) return prev
          return [...prev, { id: payload.new.id, name: payload.new.name }]
        })
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [showId])

  useEffect(() => {
    if (!joinUrl) return
    QRCode.toDataURL(joinUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#0d0d0d', light: '#f5f0e8' },
    }).then(url => setQrDataUrl(url))
  }, [joinUrl])

  const tickerText = teams.length > 0
    ? teams.map(t => t.name).join(' · ') + ' · '
    : null

  const tickerDuration = tickerText
    ? Math.max((tickerText.length * 8) / 80, 6)
    : 8

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="flex flex-col items-center gap-5 px-8 w-full max-w-xs pb-16">

        {/* Headline */}
        <p
          className="text-[#f5f0e8] text-2xl font-bold text-center leading-snug"
          style={{ fontFamily: "'Boogaloo', sans-serif" }}
        >
          Scan to join tonight's trivia
        </p>

        {/* QR Code */}
        <div className="rounded-2xl overflow-hidden p-3.5 bg-[#f5f0e8]">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Scan to join trivia" width={208} height={208} className="block" />
          ) : (
            <div className="w-52 h-52 flex items-center justify-center">
              <div className="w-7 h-7 rounded-full border-2 border-[#004000] border-t-transparent animate-spin" />
            </div>
          )}
        </div>

        {/* Live team count */}
        <div className="flex items-baseline gap-2">
          <span
            className="text-[#60c000] text-5xl font-bold leading-none tabular-nums"
            style={{ fontFamily: "'Boogaloo', sans-serif" }}
          >
            {teams.length}
          </span>
          <span className="text-[#f5f0e8]/50 text-base">
            {teams.length === 1 ? 'team in' : 'teams in'}
          </span>
        </div>

        {/* Registered team name */}
        <div className="text-center">
          <p className="text-[#f5f0e8]/30 text-xs uppercase tracking-wider mb-1">You're in as</p>
          <p
            className="text-[#f5f0e8] text-xl font-bold"
            style={{ fontFamily: "'Boogaloo', sans-serif" }}
          >
            {teamName}
          </p>
        </div>

        {show?.title && (
          <p className="text-[#f5f0e8]/20 text-xs text-center">{show.title}</p>
        )}
      </div>

      {/* Scrolling team name ticker */}
      {tickerText && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-[#004000] py-2.5 overflow-hidden"
          aria-hidden="true"
        >
          <div
            className="ticker-track"
            style={{ animationDuration: `${tickerDuration}s` }}
          >
            <span className="text-[#f5f0e8]/70 text-xs font-medium tracking-wide px-4">
              {tickerText}{tickerText}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// --- SlideViewer ---

function SlideViewer({ show, team, slides, viewedIndex, setViewedIndex,
                       powerupUsed, onInvokePowerup, myScores, leaderboard }) {
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const prevRevealedRef = useRef(show?.scores_revealed ?? false)

  // Auto-open leaderboard the first time scores are revealed this session
  useEffect(() => {
    if (show?.scores_revealed && !prevRevealedRef.current) {
      setShowLeaderboard(true)
    }
    prevRevealedRef.current = show?.scores_revealed ?? false
  }, [show?.scores_revealed])

  const totalScore = myScores.reduce((sum, s) => sum + (s.score || 0), 0)
  const powerup = show.powerups?.[0] ?? null

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
    if (team) {
      await supabase.from('teams').update({
        last_action: 'tried_to_advance',
        last_action_at: new Date().toISOString(),
      }).eq('id', team.id)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col relative">
      {/* Leaderboard overlay */}
      {showLeaderboard && leaderboard && (
        <LeaderboardOverlay
          leaderboard={leaderboard}
          myTeamId={team?.id}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pb-3 pt-4 border-b border-white/10 shrink-0">
        <span className="text-white/50 text-xs font-medium truncate mr-3">
          {team?.name ?? 'Team'}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          {leaderboard && (
            <button
              onClick={() => setShowLeaderboard(true)}
              className="text-yellow-400 text-xs font-semibold px-2 py-1 rounded-lg bg-yellow-400/10 active:bg-yellow-400/20 transition-colors"
            >
              🏆 Scores
            </button>
          )}
          <span className="text-white/30 text-xs">
            {currentSlide ? `${viewedIndex + 1} / ${slides.length}` : '—'}
          </span>
        </div>
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

      {/* Bottom bar: score + powerup + nav */}
      <div className="border-t border-white/10 shrink-0">
        {/* Powerup + score row */}
        {(powerup || totalScore > 0) && (
          <div className="px-6 pt-3 pb-1 space-y-2">
            {powerup && (
              <PowerupButton
                powerup={powerup}
                used={powerupUsed}
                onInvoke={onInvokePowerup}
              />
            )}
            {totalScore > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-white/30 text-xs">Your score</span>
                <span
                  className="text-[#60c000] font-bold text-sm tabular-nums"
                  style={{ fontFamily: "'Boogaloo', sans-serif" }}
                >
                  {totalScore} pts
                </span>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 py-4 pb-safe gap-4">
          <button
            onClick={handleBack}
            disabled={!canGoBack}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
              canGoBack
                ? 'bg-white/10 text-white active:bg-white/20'
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
                ? 'bg-white text-gray-900 active:bg-white/90'
                : 'bg-white/5 text-white/20 cursor-not-allowed'
            }`}
          >
            {canGoForward ? 'Next →' : 'Wait →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- SlideContent ---

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

// --- RegistrationScreen ---

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

  // Step 8: powerup + scoring state
  const [powerupUsed, setPowerupUsed] = useState(false)
  const [myScores, setMyScores] = useState([])
  const [leaderboard, setLeaderboard] = useState(null)

  // Load show and restore team from localStorage
  useEffect(() => {
    if (!showId) { setShowLoading(false); return }

    async function init() {
      let targetId = showId
      if (showId === 'live') {
        const { data } = await supabase.from('shows').select('*').eq('is_live', true).single()
        if (data) { targetId = data.id; setShow(data) }
        setShowLoading(false)
        // Fall through so we still restore the stored team using the real show ID
        if (!targetId || targetId === 'live') return
      } else {
        const { data } = await supabase.from('shows').select('*').eq('id', targetId).single()
        if (data) setShow(data)
        setShowLoading(false)
      }

      const storedTeam = loadStoredTeam(targetId)
      if (storedTeam) setTeam(storedTeam)
    }

    init()
  }, [showId])

  // Subscribe to show updates — keyed to show.id so it works whether we loaded
  // via an explicit ?show=ID param or via the ?show=live fallback.
  useEffect(() => {
    if (!show?.id) return
    const channel = supabase
      .channel(`join-show:${show.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shows', filter: `id=eq.${show.id}` },
        (payload) => { setShow(payload.new) }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [show?.id])

  // Keep viewedIndex capped at host's current position
  useEffect(() => {
    const hostIndex = show?.current_slide_index ?? 0
    setViewedIndex(prev => Math.min(prev, hostIndex))
  }, [show?.current_slide_index])

  // Load powerup state when team is set (covers localStorage restore)
  useEffect(() => {
    if (!team?.id) return
    supabase
      .from('teams')
      .select('powerup_used')
      .eq('id', team.id)
      .single()
      .then(({ data }) => { if (data) setPowerupUsed(data.powerup_used ?? false) })
  }, [team?.id])

  // Load + subscribe to this team's round scores
  useEffect(() => {
    if (!team?.id) return

    supabase
      .from('team_scores')
      .select('round_index, score')
      .eq('team_id', team.id)
      .then(({ data }) => { if (data) setMyScores(data) })

    const channel = supabase
      .channel(`my-scores:${team.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'team_scores',
        filter: `team_id=eq.${team.id}`,
      }, (payload) => {
        if (payload.eventType !== 'DELETE') {
          setMyScores(prev => {
            const rest = prev.filter(s => s.round_index !== payload.new.round_index)
            return [...rest, { round_index: payload.new.round_index, score: payload.new.score }]
          })
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [team?.id])

  // Build leaderboard when host reveals scores
  useEffect(() => {
    if (!show?.scores_revealed) {
      setLeaderboard(null)
      return
    }

    const actualShowId = show?.id ?? showId
    if (!actualShowId) return

    async function loadLeaderboard() {
      const [{ data: teams }, { data: scores }] = await Promise.all([
        supabase.from('teams').select('id, name, color').eq('show_id', actualShowId).order('registered_at'),
        supabase.from('team_scores').select('team_id, score').eq('show_id', actualShowId),
      ])

      const built = (teams ?? [])
        .map(t => ({
          ...t,
          total: (scores ?? [])
            .filter(s => s.team_id === t.id)
            .reduce((sum, s) => sum + (s.score || 0), 0),
        }))
        .sort((a, b) => b.total - a.total)

      setLeaderboard(built)
    }

    loadLeaderboard()
  }, [show?.scores_revealed, show?.id, showId])

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

  async function handleRegister(name) {
    setRegistering(true)
    // Always use show.id — the URL param may be 'live' which is not a real show_id
    const actualShowId = show.id
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('show_id', actualShowId)
      .ilike('name', name)
      .single()
    if (existing) throw new Error('That name is taken — try something else!')

    const color = TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)]
    const teamId = `team_${nanoid(8)}`
    const { error } = await supabase.from('teams').insert({
      id: teamId,
      show_id: actualShowId,
      name,
      color,
      is_connected: true,
      powerup_used: false,
    })
    if (error) throw new Error(error.message)

    const newTeam = { id: teamId, name, color, showId: actualShowId }
    setTeam(newTeam)
    saveStoredTeam(actualShowId, newTeam)
    setPowerupUsed(false)
    setRegistering(false)
  }

  async function handleInvokePowerup() {
    if (!team?.id) return
    const { error } = await supabase.from('teams').update({
      powerup_used: true,
      powerup_used_on: show?.current_slide_id ?? null,
      last_action: 'used_powerup',
      last_action_at: new Date().toISOString(),
    }).eq('id', team.id)
    if (!error) setPowerupUsed(true)
  }

  // --- Render ---

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
    return <WaitingScreen teamName={team.name} show={show} showId={show.id} />
  }

  const slides = (show.slides ?? []).slice().sort((a, b) => a.order - b.order)

  return (
    <SlideViewer
      show={show}
      team={team}
      slides={slides}
      viewedIndex={viewedIndex}
      setViewedIndex={setViewedIndex}
      powerupUsed={powerupUsed}
      onInvokePowerup={handleInvokePowerup}
      myScores={myScores}
      leaderboard={leaderboard}
    />
  )
}
