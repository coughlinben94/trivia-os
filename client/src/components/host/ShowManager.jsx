import { useState, useEffect } from 'react'

export default function ShowManager({ onShowReady, listShows, createShow, loadShow, deleteShow, duplicateShow }) {
  const [tab, setTab] = useState('new')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [shows, setShows] = useState([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (tab === 'load') {
      listShows().then(setShows).catch(() => setShows([]))
    }
  }, [tab, listShows])

  const defaultTitle = `Trivia Night — ${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`

  async function handleCreate(e) {
    e.preventDefault()
    setWorking(true)
    setError(null)
    try {
      const show = await createShow(title || defaultTitle, date)
      onShowReady(show)
    } catch (err) {
      setError(err.message)
    } finally {
      setWorking(false)
    }
  }

  async function handleLoad(id) {
    setWorking(true)
    setError(null)
    try {
      const show = await loadShow(id)
      onShowReady(show)
    } catch (err) {
      setError(err.message)
    } finally {
      setWorking(false)
    }
  }

  async function handleDelete(id, e) {
    e.stopPropagation()
    if (!confirm('Delete this show? This cannot be undone.')) return
    await deleteShow(id)
    setShows(prev => prev.filter(s => s.id !== id))
  }

  async function handleDuplicate(id, e) {
    e.stopPropagation()
    const copy = await duplicateShow(id)
    setShows(prev => [copy, ...prev])
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-baynes-forest rounded flex items-center justify-center">
            <span className="text-white text-xs font-bold">T</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-none">Trivia OS</h1>
            <p className="text-xs text-gray-500 mt-0.5">Baynes Apple Valley</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100">
            {['new', 'load'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'text-baynes-forest border-b-2 border-baynes-forest bg-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'new' ? "Tonight's Show" : 'Load Previous'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === 'new' && (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Show Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={defaultTitle}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-baynes-forest focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-baynes-forest focus:border-transparent"
                  />
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={working}
                  className="w-full bg-baynes-forest text-white py-3 rounded-lg text-sm font-semibold hover:bg-green-900 transition-colors disabled:opacity-50"
                >
                  {working ? 'Creating…' : 'Create Show'}
                </button>
              </form>
            )}

            {tab === 'load' && (
              <div className="space-y-2">
                {shows.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-6">No saved shows yet</p>
                )}
                {shows.map(s => (
                  <div
                    key={s.id}
                    onClick={() => handleLoad(s.id)}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-baynes-forest hover:bg-green-50 cursor-pointer transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(s.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <button
                        onClick={e => handleDuplicate(s.id, e)}
                        title="Duplicate"
                        className="p-1.5 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ⧉
                      </button>
                      <button
                        onClick={e => handleDelete(s.id, e)}
                        title="Delete"
                        className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
