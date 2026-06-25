import { useState, useEffect, useRef } from 'react'

export default function ShowLibrary({
  currentShowId,
  listShows,
  loadShow,
  duplicateShow,
  deleteShow,
  exportShowById,
  importShow,
  onNewShow,
  onClose,
  onShowReady,
}) {
  const [shows, setShows] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [working, setWorking] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [error, setError] = useState(null)
  const importRef = useRef(null)

  useEffect(() => {
    fetchList()
  }, [])

  async function fetchList() {
    setLoadingList(true)
    try {
      const list = await listShows()
      setShows(list)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingList(false)
    }
  }

  async function handleLoad(id) {
    setWorking(id)
    try {
      const loaded = await loadShow(id)
      onShowReady(loaded)
      onClose()
    } finally {
      setWorking(null)
    }
  }

  async function handleDuplicate(id, e) {
    e.stopPropagation()
    setWorking(id)
    try {
      const copy = await duplicateShow(id)
      setShows(prev => [copy, ...prev.filter(s => s.id !== copy.id)])
    } catch (e) {
      setError(e.message)
    } finally {
      setWorking(null)
    }
  }

  async function handleDeleteConfirm() {
    if (!confirmDelete) return
    const { id } = confirmDelete
    setConfirmDelete(null)
    setWorking(id)
    try {
      await deleteShow(id)
      setShows(prev => prev.filter(s => s.id !== id))
      // If we just deleted the currently loaded show, go back to ShowManager
      if (id === currentShowId) onNewShow()
    } catch (e) {
      setError(e.message)
    } finally {
      setWorking(null)
    }
  }

  async function handleExport(id, e) {
    e.stopPropagation()
    setWorking(id)
    try {
      await exportShowById(id)
    } catch (e) {
      setError(e.message)
    } finally {
      setWorking(null)
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setError(null)
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const loaded = await importShow(json)
      onShowReady(loaded)
      onClose()
    } catch (e) {
      setError(`Import failed: ${e.message}`)
    }
  }

  // Pin currently loaded show to top; rest follow updated_at desc
  const pinned = shows.find(s => s.id === currentShowId)
  const rest = shows.filter(s => s.id !== currentShowId)
  const sorted = pinned ? [pinned, ...rest] : rest

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
          >
            ← Back
          </button>
          <div className="w-px h-4 bg-gray-200" />
          <h1 className="text-sm font-semibold text-gray-900">My Shows</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={() => importRef.current?.click()}
            className="text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
          >
            Import Show
          </button>
          <button
            onClick={onNewShow}
            className="text-sm font-semibold bg-baynes-forest text-white rounded-lg px-4 py-2 hover:bg-green-900 transition-colors"
          >
            New Show
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-3 shrink-0">✕</button>
            </div>
          )}

          {loadingList ? (
            <p className="text-sm text-gray-400 text-center py-16">Loading…</p>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-gray-500 mb-4">No shows yet. Create your first one.</p>
              <button
                onClick={onNewShow}
                className="text-sm font-semibold text-baynes-forest hover:underline"
              >
                New Show →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(s => {
                const isRecent = s.id === currentShowId
                const isBusy = working === s.id

                return (
                  <div
                    key={s.id}
                    className={`bg-white rounded-xl border flex items-center gap-4 px-5 py-4 transition-colors ${
                      isRecent
                        ? 'border-baynes-forest shadow-sm'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 truncate">{s.title}</span>
                        {isRecent && (
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-baynes-forest bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
                            Recent
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {s.date && (
                          <span className="text-xs text-gray-400">
                            {new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}
                          </span>
                        )}
                        <span className="text-gray-200 text-xs">·</span>
                        <span className="text-xs text-gray-400">
                          {s.slideCount} {s.slideCount === 1 ? 'slide' : 'slides'}
                        </span>
                        <span className="text-gray-200 text-xs">·</span>
                        <span className="text-xs text-gray-400">
                          {s.roundCount} {s.roundCount === 1 ? 'round' : 'rounds'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Export */}
                      <button
                        onClick={e => handleExport(s.id, e)}
                        disabled={isBusy}
                        title="Export as JSON"
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M7 1v8M7 9l-3-3m3 3 3-3M1 11h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      {/* Duplicate */}
                      <button
                        onClick={e => handleDuplicate(s.id, e)}
                        disabled={isBusy}
                        title="Duplicate"
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40 text-xs"
                      >
                        ⧉
                      </button>

                      {/* Delete */}
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDelete(s) }}
                        disabled={isBusy}
                        title="Delete"
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 text-xs"
                      >
                        ✕
                      </button>

                      {/* Load */}
                      <button
                        onClick={() => handleLoad(s.id)}
                        disabled={isBusy || isRecent}
                        className={`ml-1 text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
                          isRecent
                            ? 'text-baynes-forest bg-green-50 cursor-default'
                            : isBusy
                              ? 'text-white bg-baynes-forest opacity-50 cursor-not-allowed'
                              : 'text-white bg-baynes-forest hover:bg-green-900'
                        }`}
                      >
                        {isRecent ? 'Loaded' : isBusy ? '…' : 'Load'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">
              Delete &ldquo;{confirmDelete.title}&rdquo;?
            </h2>
            <p className="text-sm text-gray-500 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg py-2.5 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 text-sm font-semibold text-white bg-red-600 rounded-lg py-2.5 hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
