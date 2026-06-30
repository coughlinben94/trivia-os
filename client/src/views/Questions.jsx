import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const TYPE_LABEL = { regular: 'Regular', shiny: 'Shiny', pyl: 'PYL', swing: 'Swing' }
const TYPE_COLOR = {
  regular: 'bg-gray-100 text-gray-600',
  shiny:   'bg-yellow-100 text-yellow-700',
  pyl:     'bg-purple-100 text-purple-700',
  swing:   'bg-blue-100 text-blue-700',
}
const SHINY_COLOR = {
  visual: 'bg-emerald-100 text-emerald-700',
  audio:  'bg-sky-100 text-sky-700',
}

const FILTERS = [
  { id: 'all',          label: 'All' },
  { id: 'bonus',        label: 'Bonus' },
  { id: 'shiny-visual', label: 'Shiny Visual' },
  { id: 'shiny-audio',  label: 'Shiny Audio' },
  { id: 'pyl',          label: 'PYL' },
  { id: 'swing',        label: 'Swing' },
]

function matchesFilter(q, filter) {
  if (filter === 'all')          return true
  if (filter === 'bonus')        return q.is_bonus
  if (filter === 'shiny-visual') return q.is_shiny && q.shiny_type === 'visual'
  if (filter === 'shiny-audio')  return q.is_shiny && q.shiny_type === 'audio'
  if (filter === 'pyl')          return q.type === 'pyl'
  if (filter === 'swing')        return q.type === 'swing'
  return true
}

export default function Questions() {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('all')
  const [showFilter, setShowFilter] = useState(null) // show_id string or null
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({ text: '', answer: '' })
  const [saving, setSaving]       = useState(false)

  // Read ?show= param from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const showId = params.get('show')
    if (showId) setShowFilter(showId)
  }, [])

  useEffect(() => {
    supabase
      .from('questions')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setQuestions(data ?? [])
        setLoading(false)
      })
  }, [])

  // Unique shows from loaded questions for the show filter dropdown
  const shows = [...new Map(
    questions
      .filter(q => q.show_id && q.show_title)
      .map(q => [q.show_id, { id: q.show_id, title: q.show_title, date: q.show_date }])
  ).values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  const q = search.trim().toLowerCase()
  const visible = questions.filter(row => {
    if (showFilter && row.show_id !== showFilter) return false
    if (!matchesFilter(row, filter)) return false
    if (!q) return true
    return (row.text ?? '').toLowerCase().includes(q) || (row.answer ?? '').toLowerCase().includes(q)
  })

  function startEdit(row) {
    setEditingId(row.id)
    setEditDraft({ text: row.text ?? '', answer: row.answer ?? '' })
  }

  async function commitEdit(id) {
    if (saving) return
    setSaving(true)
    const { error } = await supabase
      .from('questions')
      .update({ text: editDraft.text, answer: editDraft.answer })
      .eq('id', id)
    if (!error) {
      setQuestions(prev => prev.map(r => r.id === id ? { ...r, ...editDraft } : r))
    }
    setEditingId(null)
    setSaving(false)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <style>{`
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .row-animate {
          animation: rowIn 240ms cubic-bezier(0.23,1,0.32,1) both;
        }
      `}</style>

      {/* Header — full-width bar, centered inner */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Question Archive</h1>
            <p className="text-xs text-gray-400 mt-0.5">{questions.length} questions total</p>
          </div>
          <a
            href="/host"
            className="text-xs text-gray-400 transition-[color] duration-[120ms] [cubic-bezier(0.23,1,0.32,1)] hover:text-gray-700"
          >
            ← Back to host
          </a>
        </div>
      </div>

      {/* Controls — centered */}
      <div className="max-w-4xl mx-auto px-6 py-5 flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search questions and answers…"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a6b4a]/30 focus:border-[#1a6b4a] transition-[border-color,box-shadow] duration-[150ms] ease-out"
          />
          {shows.length > 0 && (
            <select
              value={showFilter ?? ''}
              onChange={e => setShowFilter(e.target.value || null)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a6b4a]/30 focus:border-[#1a6b4a] transition-[border-color,box-shadow] duration-[150ms] ease-out"
            >
              <option value="">All shows</option>
              {shows.map(s => (
                <option key={s.id} value={s.id}>{s.title ?? s.date ?? s.id}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[transform,background-color,border-color,color] duration-[120ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
                filter === f.id
                  ? 'bg-[#1a6b4a] text-white border border-[#1a6b4a]'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-[#1a6b4a] hover:text-[#1a6b4a]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table — centered */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        {loading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            {search ? 'No results.' : 'No questions yet — add a question slide in the host to get started.'}
          </p>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-36">Show</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-28">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Question</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-48">Answer</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => {
                  const isEditing = editingId === row.id
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-50 last:border-0 row-animate ${row.is_bonus ? 'bg-red-50' : ''}`}
                      style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                    >
                      {/* Show */}
                      <td className="px-4 py-3 align-middle">
                        <p className="text-xs font-medium text-gray-700 leading-snug">{row.show_title ?? '—'}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{row.show_date ?? ''}</p>
                      </td>

                      {/* Type badges */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col gap-1 items-center">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${TYPE_COLOR[row.type] ?? TYPE_COLOR.regular}`}>
                            {TYPE_LABEL[row.type] ?? row.type}
                          </span>
                          {row.is_bonus && (
                            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-100 text-red-700">
                              Bonus
                            </span>
                          )}
                          {row.is_shiny && row.shiny_type && (
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${SHINY_COLOR[row.shiny_type] ?? 'bg-gray-100 text-gray-600'}`}>
                              {row.shiny_type}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Question text */}
                      <td className="px-4 py-3 align-middle">
                        {isEditing ? (
                          <textarea
                            value={editDraft.text}
                            onChange={e => setEditDraft(d => ({ ...d, text: e.target.value }))}
                            rows={3}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-[120ms] ease-out"
                          />
                        ) : (
                          <span className="text-gray-800 leading-snug">
                            {row.text ?? <span className="text-gray-300 italic">—</span>}
                          </span>
                        )}
                      </td>

                      {/* Answer */}
                      <td className="px-4 py-3 align-middle">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft.answer}
                            onChange={e => setEditDraft(d => ({ ...d, answer: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-[120ms] ease-out"
                          />
                        ) : (
                          <span className="text-gray-600">
                            {row.answer ?? <span className="text-gray-300 italic">—</span>}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 align-middle pt-3.5">
                        {isEditing ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => commitEdit(row.id)}
                              disabled={saving}
                              className="px-2.5 py-1 bg-[#1a6b4a] text-white text-xs font-semibold rounded-lg transition-[transform,opacity] duration-[120ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] hover:bg-green-900 disabled:opacity-40"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-2.5 py-1 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg transition-[transform,border-color] duration-[120ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] hover:border-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(row)}
                            className="px-2.5 py-1 bg-white border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg transition-[transform,border-color,color] duration-[120ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] hover:border-gray-400 hover:text-gray-700"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
