import { useState, useEffect } from 'react'
import { useShow } from '../hooks/useShow.js'
import { supabase } from '../lib/supabase.js'
import ShowManager from '../components/host/ShowManager.jsx'
import BuildMode from '../components/host/BuildMode.jsx'

export default function Host() {
  const showApi = useShow()
  const { show, loading } = showApi
  const [toasts, setToasts] = useState([])

  // Subscribe to team alerts when a show is active
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
            addToast({
              id: `${team.id}-${Date.now()}`,
              type: 'error',
              message: `⚠️ ${team.name} tried to skip ahead`,
            })
          } else if (action === 'went_back') {
            addToast({
              id: `${team.id}-${Date.now()}`,
              type: 'warning',
              message: `↩ ${team.name} went back`,
              autoDismiss: 6000,
            })
          } else if (action === 'left_app') {
            addToast({
              id: `${team.id}-${Date.now()}`,
              type: 'info',
              message: `📵 ${team.name} left the app`,
              autoDismiss: 6000,
            })
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [show?.id])

  function addToast(toast) {
    setToasts(prev => [toast, ...prev])
  }

  function dismissToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const actions = {
    updateShowMeta: showApi.updateShowMeta,
    exportShow:     showApi.exportShow,
    addRound:       showApi.addRound,
    updateRound:    showApi.updateRound,
    deleteRound:    showApi.deleteRound,
    addSlide:       showApi.addSlide,
    updateSlide:    showApi.updateSlide,
    deleteSlide:    showApi.deleteSlide,
    reorderSlides:  showApi.reorderSlides,
    addPowerup:     showApi.addPowerup,
    deletePowerup:  showApi.deletePowerup,
    uploadMedia:    showApi.uploadMedia,
    getHostPhotos:  showApi.getHostPhotos,
  }

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
    <div className="relative">
      <BuildMode
        show={show}
        actions={actions}
        onGoLive={() => alert('Live Mode — coming in step 6!')}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
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
