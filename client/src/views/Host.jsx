import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useShow } from '../hooks/useShow.js'
import { supabase } from '../lib/supabase.js'
import { ThemeProvider, useTheme } from '../components/shared/ThemeProvider.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import ShowManager from '../components/host/ShowManager.jsx'
import ShowLibrary from '../components/host/ShowLibrary.jsx'
import BuildMode from '../components/host/BuildMode.jsx'
import LiveMode from '../components/host/LiveMode.jsx'

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

  if (!show) {
    return (
      <ShowManager
        onShowReady={() => showApi.refresh()}
        listShows={showApi.listShows}
        createShow={showApi.createShow}
        loadShow={showApi.loadShow}
        deleteShow={showApi.deleteShow}
        duplicateShow={showApi.duplicateShow}
      />
    )
  }

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
  const { setThemeId } = useTheme()
  const [toasts, setToasts] = useState([])
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [connStatus, setConnStatus] = useState('SUBSCRIBED')
  const disconnected = connStatus === 'CHANNEL_ERROR' || connStatus === 'TIMED_OUT' || connStatus === 'CLOSED'

  useEffect(() => {
    if (show?.showState?.isLive) setIsLiveMode(true)
  }, [show?.id])

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
          if (action === 'tried_to_advance') {
            addToast({ id: `${team.id}-${Date.now()}`, type: 'error', message: `⚠️ ${team.name} tried to skip ahead` })
          } else if (action === 'went_back') {
            addToast({ id: `${team.id}-${Date.now()}`, type: 'warning', message: `↩ ${team.name} went back`, autoDismiss: 6000 })
          } else if (action === 'left_app') {
            addToast({ id: `${team.id}-${Date.now()}`, type: 'info', message: `📵 ${team.name} left the app`, autoDismiss: 6000 })
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

  async function handleThemeChange(newThemeId) {
    setThemeId(newThemeId)
    await supabase.from('shows').update({ theme_id: newThemeId }).eq('id', show.id)
  }

  const actions = {
    updateShowMeta: showApi.updateShowMeta,
    exportShow:     showApi.exportShow,
    addRound:       showApi.addRound,
    updateRound:    showApi.updateRound,
    deleteRound:    showApi.deleteRound,
    addSlide:       showApi.addSlide,
    addSiblingSlides: showApi.addSiblingSlides,
    updateSlide:    showApi.updateSlide,
    deleteSlide:    showApi.deleteSlide,
    reorderSlides:  showApi.reorderSlides,
    addPowerup:           showApi.addPowerup,
    deletePowerup:        showApi.deletePowerup,
    updateTickerMessages: showApi.updateTickerMessages,
    uploadMedia:    showApi.uploadMedia,
    uploadFont:     showApi.uploadFont,
    getHostPhotos:  showApi.getHostPhotos,
  }

  const liveActions = {
    nextSlide:            showApi.nextSlide,
    prevSlide:            showApi.prevSlide,
    setScoreboardVisible: showApi.setScoreboardVisible,
    updateRoundScore:     showApi.updateRoundScore,
  }

  async function handleGoLive() {
    await showApi.goLive()
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
          actions={liveActions}
          onExitLive={() => setIsLiveMode(false)}
          onThemeChange={handleThemeChange}
        />
      ) : (
        <BuildMode
          show={show}
          actions={actions}
          onGoLive={handleGoLive}
          onThemeChange={handleThemeChange}
          onOpenLibrary={() => setShowLibrary(true)}
        />
      )}
      <HostReconnectingBanner visible={disconnected} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
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
