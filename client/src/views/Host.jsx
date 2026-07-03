import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Navigate } from 'react-router-dom'
import { useShow, sortedSlides } from '../hooks/useShow.js'
import { supabase } from '../lib/supabase.js'
import { ThemeProvider } from '../components/shared/ThemeProvider.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import ShowLibrary from '../components/host/ShowLibrary.jsx'
import BuildMode from '../components/host/BuildMode.jsx'
import LiveMode from '../components/host/LiveMode.jsx'
import ScoreboardModal from '../components/host/ScoreboardModal.jsx'

const EASE_SNAP = [0.23, 1, 0.32, 1]

export default function Host() {
  const showApi = useShow()
  const { show, loading } = showApi

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    )
  }

  if (!show) return <Navigate to="/dashboard" replace />

  return (
    <ThemeProvider showThemeId={show.theme} overrides={show.themeOverrides}>
      <ErrorBoundary>
        <HostInner showApi={showApi} />
      </ErrorBoundary>
    </ThemeProvider>
  )
}

function HostInner({ showApi }) {
  const { show } = showApi
  const [toasts, setToasts] = useState([])
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [goLivePicker, setGoLivePicker] = useState(false)
  const [showScoreboard, setShowScoreboard] = useState(false)
  const savedResultsRef = useRef(false)
  const leftAppDebounceRef = useRef({})
  const [connStatus, setConnStatus] = useState('SUBSCRIBED')
  const disconnected = connStatus === 'CHANNEL_ERROR' || connStatus === 'TIMED_OUT' || connStatus === 'CLOSED'


  useEffect(() => {
    if (!show?.id) return
    const channel = supabase
      .channel(`host-team-alerts:${show.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams', filter: `show_id=eq.${show.id}` },
        (payload) => {
          const team = payload.new
          const action = team.last_action
          if (!action) return
          if (action === 'went_back') {
            addToast({ id: `${team.id}-${Date.now()}`, type: 'warning', message: `↩ ${team.name} went back`, autoDismiss: 6000 })
          } else if (action === 'left_app') {
            if (leftAppDebounceRef.current[team.id]) return
            leftAppDebounceRef.current[team.id] = setTimeout(() => { delete leftAppDebounceRef.current[team.id] }, 8000)
            addToast({ id: `${team.id}-left`, type: 'info', message: `📵 ${team.name} left the app`, autoDismiss: 6000 })
          } else if (action === 'used_powerup') {
            addToast({ id: `${team.id}-${Date.now()}`, type: 'error', message: `⚡ ${team.name} used their powerup!` })
          }
        }
      )
      .subscribe(status => setConnStatus(status))
    return () => supabase.removeChannel(channel)
  }, [show?.id])

  function addToast(toast) { setToasts(prev => [toast, ...prev]) }
  function dismissToast(id) { setToasts(prev => prev.filter(t => t.id !== id)) }

  function handleThemeChange(newThemeId) {
    actions.updateShowMeta({ theme: newThemeId })
  }

  const actions = { ...showApi }
  // Do NOT narrow this to a curated subset for LiveMode — any missing method silently
  // breaks LiveMode features (e.g. updateSlide crashed handlePickAnimation). Pass the
  // full spread to both BuildMode and LiveMode.

  useEffect(() => {
    if (!isLiveMode || !show) return
    const slides = sortedSlides(show)
    const currentSlide = slides[show.showState.currentSlideIndex ?? 0]
    if (currentSlide?.type === 'winner-reveal') {
      if (!savedResultsRef.current) {
        savedResultsRef.current = true
        showApi.saveResults()
      }
    } else {
      savedResultsRef.current = false
    }
  }, [isLiveMode, show?.showState?.currentSlideIndex])

  function handleGoLive() {
    setGoLivePicker(true)
  }

  async function handleGoLiveFrom(index) {
    setGoLivePicker(false)
    await showApi.goLiveFrom(index)
    setIsLiveMode(true)
  }

  return (
    <div className="relative">
      {showLibrary ? (
        <ShowLibrary
          currentShowId={show.id}
          listShows={showApi.listShows}
          loadShow={showApi.loadShow}
          duplicateShow={showApi.duplicateShow}
          deleteShow={showApi.deleteShow}
          exportShowById={showApi.exportShowById}
          importShow={showApi.importShow}
          onNewShow={showApi.unloadShow}
          onClose={() => setShowLibrary(false)}
          onShowReady={() => setShowLibrary(false)}
        />
      ) : isLiveMode ? (
        <LiveMode
          show={show}
          actions={actions}
          onExitLive={() => setIsLiveMode(false)}
          onThemeChange={handleThemeChange}
          onOpenScoreboard={() => setShowScoreboard(true)}
        />
      ) : (
        <BuildMode
          show={show}
          actions={actions}
          onGoLive={handleGoLive}
          onThemeChange={handleThemeChange}
          onOpenLibrary={() => setShowLibrary(true)}
          onOpenScoreboard={() => setShowScoreboard(true)}
        />
      )}
      {goLivePicker && (
        <GoLivePicker
          show={show}
          onFromBeginning={() => handleGoLiveFrom(0)}
          onFromSlide={handleGoLiveFrom}
          onClose={() => setGoLivePicker(false)}
        />
      )}
      {showScoreboard && (
        <ScoreboardModal show={show} onClose={() => setShowScoreboard(false)} />
      )}
      <HostReconnectingBanner visible={disconnected} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

// ─── Go Live picker ────────────────────────────────────────────────────────

const SLIDE_ICON = {
  'title': '🇺🇸', 'state-of-union': '🇺🇸', 'round-intro': '🎬', 'swing-round-intro': '🎷',
  'question': '❓', 'grading-break': '⏸️', 'scoreboard-reveal': '🏆',
  'custom': '✏️', 'pixelate-series': '🎨', 'multi-question': '📋', 'pyl-reveal': '🎰',
  'winner-reveal': '🥇', 'team-preview': '👥',
}

function slidePickerLabel(slide) {
  const { data, type } = slide
  if (type === 'question' || type === 'pixelate-series') {
    if (data.isShiny) return data.seriesTheme || data.shinyFormatName || '✨ Shiny'
    return data.questionLabel || `Q${data.questionNumber || '?'}`
  }
  if (type === 'round-intro' || type === 'swing-round-intro') return data.roundTitle || 'Round Intro'
  if (type === 'grading-break') return 'Grading Break'
  if (type === 'scoreboard-reveal') return data.title || 'Scoreboard'
  if (type === 'title') return data.title || 'Title'
  if (type === 'multi-question') return data.seriesTitle || 'Multi-Q'
  return type
}

function GoLivePicker({ show, onFromBeginning, onFromSlide, onClose }) {
  const slides = sortedSlides(show)
  const [collapsedRounds, setCollapsedRounds] = useState(() => new Set(show?.rounds?.map(r => r.id) ?? []))

  // Build same segment structure as sidebar
  const segments = []
  let currentRoundId = Symbol('init')
  for (const slide of slides) {
    if (slide.roundId !== currentRoundId) {
      currentRoundId = slide.roundId
      if (slide.roundId) {
        const round = show.rounds?.find(r => r.id === slide.roundId)
        segments.push({ type: 'round', round, slides: [slide] })
      } else {
        segments.push({ type: 'general', slides: [slide] })
      }
    } else {
      segments[segments.length - 1].slides.push(slide)
    }
  }

  function toggleRound(roundId) {
    setCollapsedRounds(prev => {
      const next = new Set(prev)
      next.has(roundId) ? next.delete(roundId) : next.add(roundId)
      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Go Live</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 host-button w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
        </div>

        {/* Start from beginning */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <button
            onClick={onFromBeginning}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-baynes-forest text-white font-semibold text-sm hover:bg-green-900 host-button transition-colors"
          >
            <span className="text-lg">▶</span>
            <span>Start from beginning</span>
          </button>
        </div>

        {/* Slide picker */}
        <div className="overflow-y-auto flex-1 py-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 px-5 pb-2">Or jump to a slide</p>

          {segments.map((seg, i) => {
            const borderClass = i > 0 ? 'border-t border-gray-100' : ''

            if (seg.type === 'general') {
              return (
                <div key={`g-${i}`} className={borderClass}>
                  {seg.slides.map((slide, si) => {
                    const index = slides.findIndex(s => s.id === slide.id)
                    const isSubSlide = slide.data?.isSeries && (slide.data?.slotIndex ?? 1) > 1
                    if (isSubSlide) return null
                    return (
                      <div key={slide.id} className={si > 0 ? 'border-t border-gray-100' : ''}>
                        <button
                          onClick={() => onFromSlide(index)}
                          className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 text-left host-button transition-colors group"
                        >
                          <span className="text-base shrink-0 w-6 text-center">{SLIDE_ICON[slide.type] ?? '📄'}</span>
                          <span className="flex-1 text-sm font-medium text-gray-800 truncate">{slidePickerLabel(slide)}</span>
                          <span className="text-xs text-gray-300 group-hover:text-gray-500 shrink-0">#{index + 1}</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            }

            const { round, slides: roundSlides } = seg
            if (!round) return null
            const collapsed = collapsedRounds.has(round.id)

            return (
              <div key={round.id} className={borderClass}>
                {/* Round header */}
                <button
                  onClick={() => toggleRound(round.id)}
                  className="w-full flex items-center gap-2 px-5 py-2.5 hover:bg-gray-50 host-button transition-colors text-left"
                >
                  <span className="text-[9px] text-gray-400 w-4 shrink-0">{collapsed ? '▶' : '▼'}</span>
                  <span className="flex-1 text-sm font-semibold text-gray-700 truncate">R{round.number} · {round.title}</span>
                  <span className="text-xs text-gray-400">{roundSlides.length}</span>
                </button>

                {/* Round slides */}
                {!collapsed && roundSlides.map(slide => {
                  const index = slides.findIndex(s => s.id === slide.id)
                  const isSubSlide = slide.data?.isSeries && (slide.data?.slotIndex ?? 1) > 1
                  if (isSubSlide) return null
                  return (
                    <button
                      key={slide.id}
                      onClick={() => onFromSlide(index)}
                      className="w-full flex items-center gap-3 pl-10 pr-5 py-2 hover:bg-gray-50 text-left host-button transition-colors group border-t border-gray-50"
                    >
                      <span className="text-sm shrink-0 w-5 text-center">{SLIDE_ICON[slide.type] ?? '📄'}</span>
                      <span className="flex-1 text-sm text-gray-700 truncate">{slidePickerLabel(slide)}</span>
                      <span className="text-xs text-gray-300 group-hover:text-gray-500 shrink-0">#{index + 1}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function HostReconnectingBanner({ visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -44, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -44, opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_SNAP }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
            background: 'rgba(255,195,50,0.93)', color: '#1a1000',
            fontSize: '0.8rem', fontWeight: 600, textAlign: 'center',
            padding: '0.55rem', fontFamily: 'DM Sans, sans-serif',
            backdropFilter: 'blur(4px)',
          }}
        >
          Connection lost — your changes may not be saving. Reconnecting…
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast.autoDismiss) return
    const t = setTimeout(() => onDismiss(toast.id), toast.autoDismiss)
    return () => clearTimeout(t)
  }, [toast.id, toast.autoDismiss, onDismiss])

  const styles = {
    error:   'bg-red-600 text-white',
    warning: 'bg-amber-500 text-white',
    info:    'bg-gray-700 text-white',
  }

  return (
    <div
      className={`${styles[toast.type] ?? styles.info} flex items-center gap-3 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium`}
      style={{ animation: 'slideInRight 180ms ease-out' }}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-white/70 hover:text-white transition-colors text-xs"
      >
        ✕
      </button>
    </div>
  )
}
