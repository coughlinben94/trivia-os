import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { INPUT_TILES, QuestionInputPanel, SwingInputPanel, PylInputPanel } from '../components/host/DatabaseAddPanels.jsx'
import HostPinGate from '../components/host/HostPinGate.jsx'

const TYPE_LABEL = { regular: 'Regular Question', shiny: 'Shiny', pyl: 'PYL', swing: 'Swing' }
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

const TRUNCATE_AT = 200

function matchesFilter(q, filter) {
  if (filter === 'all')          return true
  if (filter === 'bonus')        return q.is_bonus
  if (filter === 'shiny-visual') return q.is_shiny && q.shiny_type === 'visual'
  if (filter === 'shiny-audio')  return q.is_shiny && q.shiny_type === 'audio'
  if (filter === 'pyl')          return q.type === 'pyl'
  if (filter === 'swing')        return q.type === 'swing'
  return true
}

function SkeletonCard({ delay }) {
  return (
    <div
      className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)] bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3 animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <div className="h-3 w-20 bg-gray-100 rounded" />
        <div className="h-4 w-14 bg-gray-100 rounded-md" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3.5 w-full bg-gray-100 rounded" />
        <div className="h-3.5 w-4/5 bg-gray-100 rounded" />
      </div>
      <div className="h-10 w-full bg-gray-50 rounded-lg" />
    </div>
  )
}

function QuestionCard({ row, isEditing, editDraft, setEditDraft, onStartEdit, onCommit, onCancel, onDelete, saving, style }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!isEditing) setConfirmingDelete(false)
  }, [isEditing])

  const isSwing = row.type === 'swing' && row.questions_data
  const text = row.text ?? ''
  const isLong = !isEditing && text.length > TRUNCATE_AT
  const shownText = isLong && !expanded ? text.slice(0, TRUNCATE_AT).trimEnd() + '…' : text

  return (
    <div
      className={`card-animate w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)] bg-white rounded-2xl border p-4 flex flex-col gap-3 shadow-sm transition-[border-color] duration-150 ease-out hover:border-gray-300 ${
        row.is_bonus ? 'border-red-100 bg-red-50/40' : 'border-gray-200'
      }`}
      style={style}
    >
      {/* Header — show + type badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-700 truncate">{row.show_title ?? '—'}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{row.show_date ?? ''}</p>
        </div>
        <div className="flex flex-wrap gap-1 justify-end shrink-0">
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
          {row.is_shiny && row.shiny_format_name && (
            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-50 text-gray-700 border border-gray-200">
              {row.shiny_format_name}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {isSwing ? (
        <ol className="list-decimal list-inside space-y-1 text-xs text-gray-700">
          {row.questions_data.map((q, qi) => (
            <li key={qi}>
              <span className="font-medium">{q.text}</span>
              {q.answer && <span className="text-gray-500"> — {q.answer}</span>}
            </li>
          ))}
        </ol>
      ) : isEditing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={editDraft.text}
            onChange={e => setEditDraft(d => ({ ...d, text: e.target.value }))}
            rows={4}
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
          />
          <input
            type="text"
            value={editDraft.answer}
            onChange={e => setEditDraft(d => ({ ...d, answer: e.target.value }))}
            placeholder="Answer…"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
          />
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-800 leading-relaxed">
            {text ? shownText : <span className="text-gray-400 italic">No question text</span>}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs font-semibold text-[#1a6b4a] mt-1 transition-colors duration-150 ease-out hover:text-green-900 active:scale-[0.97]"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {/* Answer — always visible, own block */}
      {!isSwing && !isEditing && (
        <div className="bg-gray-50 rounded-lg px-3 py-2 mt-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-0.5">Answer</p>
          {row.type === 'pyl' && row.answer ? (
            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-700 capitalize">
              {row.answer}
            </span>
          ) : (
            <p className="text-sm text-gray-700">
              {row.answer ?? <span className="text-gray-400 italic">No answer</span>}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      {!isSwing && (
        <div className="flex flex-col gap-1.5 pt-0.5">
          {isEditing && confirmingDelete ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-500">Delete this question?</span>
              <div className="flex gap-3">
                <button
                  onClick={() => onDelete(row.id)}
                  className="text-xs font-semibold text-red-500 transition-colors duration-150 ease-out hover:text-red-700 active:scale-[0.97]"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="text-xs text-gray-500 transition-colors duration-150 ease-out hover:text-gray-700 active:scale-[0.97]"
                >
                  No
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-1.5">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="mr-auto px-2.5 py-1 text-red-400 text-xs font-semibold rounded-lg transition-colors duration-150 ease-out hover:text-red-600 active:scale-[0.97]"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => onCommit(row.id)}
                    disabled={saving}
                    className="px-2.5 py-1 bg-[#1a6b4a] text-white text-xs font-semibold rounded-lg transition-[transform,opacity] duration-150 ease-out active:scale-[0.97] hover:bg-green-900 disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    onClick={onCancel}
                    className="px-2.5 py-1 bg-white border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg transition-[transform,border-color] duration-150 ease-out active:scale-[0.97] hover:border-gray-400"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onStartEdit(row)}
                  className="px-2.5 py-1 bg-white border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg transition-[transform,border-color,color] duration-150 ease-out active:scale-[0.97] hover:border-gray-400 hover:text-gray-700"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
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
  const [activeInput, setActiveInput] = useState(null) // 'question' | 'swing' | 'pyl' | null

  // Read ?show= param from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const showId = params.get('show')
    if (showId) setShowFilter(showId)
  }, [])

  function fetchQuestions() {
    return supabase
      .from('questions')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setQuestions(data ?? [])
        setLoading(false)
      })
  }

  useEffect(() => { fetchQuestions() }, [])

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
      setEditingId(null)
    }
    setSaving(false)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function deleteQuestion(id) {
    if (saving) return
    setSaving(true)
    const { error } = await supabase.from('questions').delete().eq('id', id)
    if (!error) {
      setQuestions(prev => prev.filter(r => r.id !== id))
      setEditingId(null)
    }
    setSaving(false)
  }

  return (
    <HostPinGate>
    <div className="min-h-screen bg-gray-50 font-sans">
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .card-animate {
          animation: cardIn 240ms cubic-bezier(0.23,1,0.32,1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .card-animate { animation: none; }
        }
      `}</style>

      {/* Header — full-width bar, centered inner */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Question Archive</h1>
            <p className="text-xs text-gray-500 mt-0.5">{questions.length} questions total</p>
          </div>
          <a
            href="/host"
            className="text-xs text-gray-500 transition-colors duration-150 ease-out hover:text-gray-700"
          >
            ← Back to host
          </a>
        </div>
      </div>

      {/* Add to database — same input flows as the host dashboard, writes only to the archive */}
      <div className="max-w-6xl mx-auto px-6 pt-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          {activeInput ? (
            <>
              <div className="flex items-center gap-2 mb-5">
                <button
                  onClick={() => setActiveInput(null)}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors duration-150 ease-out"
                >
                  ←
                </button>
                <h2 className="text-sm font-semibold text-gray-800">
                  {INPUT_TILES.find(t => t.id === activeInput)?.icon} {INPUT_TILES.find(t => t.id === activeInput)?.name}
                </h2>
              </div>
              {activeInput === 'question' && <QuestionInputPanel onAdded={fetchQuestions} />}
              {activeInput === 'swing'    && <SwingInputPanel onAdded={fetchQuestions} />}
              {activeInput === 'pyl'      && <PylInputPanel onAdded={fetchQuestions} />}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-800 mb-0.5">Add to database</p>
              <p className="text-xs text-gray-500 mb-4">Upload trivia from past shows without attaching it to a show.</p>
              <div className="flex flex-wrap gap-3">
                {INPUT_TILES.map(tile => (
                  <button
                    key={tile.id}
                    onClick={() => setActiveInput(tile.id)}
                    className="flex-1 min-w-[180px] flex flex-col gap-2 p-4 rounded-xl border-2 border-gray-100 hover:border-gray-300 bg-white hover:bg-gray-50 text-left transition-colors duration-150 ease-out active:scale-[0.98]"
                  >
                    <span className="text-2xl leading-none">{tile.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{tile.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{tile.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Controls — centered */}
      <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search questions and answers…"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a6b4a]/30 focus:border-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
          />
          <select
            value={showFilter ?? ''}
            onChange={e => setShowFilter(e.target.value || null)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a6b4a]/30 focus:border-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
          >
            <option value="">All shows</option>
            {shows.map(s => (
              <option key={s.id} value={s.id}>{s.title ?? s.date ?? s.id}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1.5 flex-wrap justify-center">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] ${
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

      {/* Card grid — centered, 3 across on desktop, 2 on tablet, 1 on mobile */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        {loading ? (
          <div className="flex flex-wrap gap-4 justify-center">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} delay={i * 40} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            {search ? 'No results.' : 'No questions yet — add a question slide in the host to get started.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-4 justify-center items-start">
            {visible.map((row, i) => (
              <QuestionCard
                key={row.id}
                row={row}
                isEditing={editingId === row.id}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                onStartEdit={startEdit}
                onCommit={commitEdit}
                onCancel={cancelEdit}
                onDelete={deleteQuestion}
                saving={saving}
                style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
    </HostPinGate>
  )
}
