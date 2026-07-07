import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import HostPinGate from '../components/host/HostPinGate.jsx'
import { useShinyFormats } from '../hooks/useShinyFormats.js'

const TYPE_LABEL = { regular: 'Regular Question', shiny: 'Shiny', pyl: 'PYL', swing: 'Swing' }
const TYPE_COLOR = {
  regular: 'bg-gray-100 text-gray-600',
  shiny:   'bg-yellow-100 text-yellow-700',
  pyl:     'bg-purple-100 text-purple-700',
  swing:   'bg-blue-100 text-blue-700',
}
const FILTERS = [
  { id: 'all',     label: 'All' },
  { id: 'regular', label: 'Regular' },
  { id: 'bonus',   label: 'Bonus' },
  { id: 'shiny',   label: 'Shiny' },
  { id: 'pyl',     label: 'PYL' },
  { id: 'swing',   label: 'Swing' },
]

const TRUNCATE_AT = 200
const ITEM_LIST_LINE_CAP = 8
// Rough chars-per-rendered-line at this card's text-sm body width (desktop
// 3-column card, ~430px content width) — used only to ESTIMATE how many
// visual lines a long item will wrap to, so the cap tracks real line count
// instead of raw item count. A card with six 3-line questions was blowing
// way past the line budget while sitting well under an item-count cap.
const CHARS_PER_LINE = 55

function estimateLines(item) {
  const combined = `${item.text ?? ''}${item.answer ? ` — ${item.answer}` : ''}`
  return Math.max(1, Math.ceil(combined.length / CHARS_PER_LINE))
}

// How many whole items fit inside a 12-line budget — cuts on an item
// boundary (never mid-item), so a truncated card never ends on a half
// question with its answer missing.
function itemCutoffForLineCap(items, cap) {
  let used = 0
  for (let i = 0; i < items.length; i++) {
    used += estimateLines(items[i])
    if (used > cap && i > 0) return i
  }
  return items.length
}

function matchesFilter(q, filter) {
  if (filter === 'all')     return true
  if (filter === 'regular') return q.type === 'regular' && !q.is_bonus
  if (filter === 'bonus')   return q.is_bonus
  if (filter === 'shiny')   return !!q.is_shiny
  if (filter === 'pyl')     return q.type === 'pyl'
  if (filter === 'swing')   return q.type === 'swing'
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

  // Any bulk-entered row (swing, pyl, a plain 'list', or a multi-item shiny
  // batch) archives its real content as questions_data — a card-level
  // text/answer only exists as a label (round title / theme name), not the
  // actual questions. Rendering the generic single-answer body for these
  // showed the label and, for PYL, the media-type placeholder ("word")
  // instead of the real items — the archived data was always correct, the
  // card just never looked at questions_data unless type was 'swing'.
  const hasItemList = Array.isArray(row.questions_data) && row.questions_data.length > 0
  const text = row.text ?? ''
  const isLong = !isEditing && text.length > TRUNCATE_AT
  const shownText = isLong && !expanded ? text.slice(0, TRUNCATE_AT).trimEnd() + '…' : text

  // Answer had NO cap at all — PYL's answer is just a short media-type badge
  // (word/visual/audio), never long, but a regular/shiny row's real answer
  // text was rendered fully unbounded. Shares the card's one `expanded`
  // toggle with the question-text truncation above, so a single "Show more"
  // reveals both.
  const answer = row.answer ?? ''
  const answerIsLong = !isEditing && row.type !== 'pyl' && answer.length > TRUNCATE_AT
  const shownAnswer = answerIsLong && !expanded ? answer.slice(0, TRUNCATE_AT).trimEnd() + '…' : answer

  // Any item-list card (swing/pyl/list/multi-item shiny) rendered the WHOLE
  // list with no cap — a 6-item PYL board where every question wraps 2-3
  // lines blew past the line budget while sitting well under a flat
  // item-count cap, so this estimates real wrapped-line count per item and
  // cuts at the item boundary that keeps the whole card within the cap —
  // same expand affordance as the plain-text truncation above, for every
  // question type, not just shiny.
  const itemCutoff = hasItemList ? itemCutoffForLineCap(row.questions_data, ITEM_LIST_LINE_CAP) : 0
  const itemsAreLong = hasItemList && itemCutoff < row.questions_data.length
  const shownItems = itemsAreLong && !expanded ? row.questions_data.slice(0, itemCutoff) : row.questions_data

  return (
    <div
      className={`card-animate w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)] bg-white rounded-2xl border p-4 flex flex-col gap-3 shadow-sm transition-[border-color] duration-150 ease-out hover:border-gray-300 ${
        row.is_bonus ? 'border-red-100 bg-red-50/40' : row.is_shiny ? 'border-yellow-300 bg-yellow-50/60' : 'border-gray-200'
      }`}
      style={style}
    >
      {/* Header — show + type badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Edit entry-point lives top-left now (was bottom-right in Actions).
              The '—' placeholder only shows when nothing else fills this slot —
              suppressed here since Edit already does, real show_title always wins. */}
          {!isEditing && (
            <button
              onClick={() => onStartEdit(row)}
              className="text-xs font-semibold text-gray-500 rounded-lg -ml-1.5 mb-0.5 px-1.5 py-0.5 transition-colors duration-150 ease-out hover:text-gray-700 hover:bg-gray-100 active:scale-[0.97]"
            >
              Edit
            </button>
          )}
          {row.show_title && (
            <p className="text-xs font-medium text-gray-700 truncate">{row.show_title}</p>
          )}
          <p className="text-[11px] text-gray-500 mt-0.5">{row.show_date ?? ''}</p>
        </div>
        <div className="flex flex-wrap gap-1 justify-end shrink-0">
          {row.type !== 'shiny' && (
            <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${TYPE_COLOR[row.type] ?? TYPE_COLOR.regular}`}>
              {TYPE_LABEL[row.type] ?? row.type}
            </span>
          )}
          {row.is_bonus && (
            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-100 text-red-700">
              Bonus
            </span>
          )}
          {row.is_shiny && row.shiny_format_name && (
            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
              {row.shiny_format_name}
            </span>
          )}
          {row.category && (
            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-100">
              {row.category}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {hasItemList ? (
        isEditing ? (
          <div className="flex flex-col gap-2">
            <input
              value={editDraft.text}
              onChange={e => setEditDraft(d => ({ ...d, text: e.target.value }))}
              placeholder="Title (optional)…"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
            />
            {(editDraft.items ?? []).map((it, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <span className="text-xs text-gray-400 w-4 text-right shrink-0">{i + 1}.</span>
                <input
                  value={it.text}
                  onChange={e => setEditDraft(d => ({ ...d, items: d.items.map((x, xi) => xi === i ? { ...x, text: e.target.value } : x) }))}
                  placeholder="Question / item…"
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                />
                <input
                  value={it.answer}
                  onChange={e => setEditDraft(d => ({ ...d, items: d.items.map((x, xi) => xi === i ? { ...x, answer: e.target.value } : x) }))}
                  placeholder="Answer…"
                  className="w-28 shrink-0 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                />
                <button
                  onClick={() => setEditDraft(d => ({ ...d, items: d.items.filter((_, xi) => xi !== i) }))}
                  className="text-gray-300 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center shrink-0"
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setEditDraft(d => ({ ...d, items: [...(d.items ?? []), { text: '', answer: '' }] }))}
              className="text-[11px] text-gray-500 hover:text-gray-700 self-start px-2 py-1 rounded hover:bg-gray-100 transition-colors duration-150 ease-out"
            >
              + Add item
            </button>
            <input
              value={editDraft.category}
              onChange={e => setEditDraft(d => ({ ...d, category: e.target.value }))}
              placeholder="Category (optional)…"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
            />
          </div>
        ) : (
          <div>
            {(row.text || row.round_title) && (
              <p className="text-sm font-semibold text-gray-800 mb-1.5">{row.text || row.round_title}</p>
            )}
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
              {shownItems.map((q, qi) => (
                <li key={qi}>
                  <span className="font-medium">{q.text}</span>
                  {q.answer && <span className="text-[#1a6b4a] font-medium"> — {q.answer}</span>}
                </li>
              ))}
            </ol>
            {itemsAreLong && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="text-xs font-semibold text-[#1a6b4a] mt-1 transition-colors duration-150 ease-out hover:text-green-900 active:scale-[0.97]"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )
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
          <input
            type="text"
            list="qcat-archive-suggestions"
            value={editDraft.category}
            onChange={e => setEditDraft(d => ({ ...d, category: e.target.value }))}
            placeholder="Category…"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
          />
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-800 leading-relaxed">
            {text ? shownText : <span className="text-gray-400 italic">No question text</span>}
          </p>
          {(isLong || answerIsLong) && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs font-semibold text-[#1a6b4a] mt-1 transition-colors duration-150 ease-out hover:text-green-900 active:scale-[0.97]"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {/* Answer — always visible, own row. Flattened from a bordered/gradient
          nested-card box to a plain hairline-divided row: same label+value
          hierarchy, half the chrome to parse scanning down a column of cards. */}
      {!hasItemList && !isEditing && (
        <div className="border-t border-gray-100 pt-2 mt-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-0.5">Answer</p>
          {row.type === 'pyl' && row.answer ? (
            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-700 capitalize">
              {row.answer}
            </span>
          ) : (
            <p className="text-sm font-semibold text-[#1a6b4a]">
              {row.answer ? shownAnswer : <span className="text-gray-400 italic font-normal">No answer</span>}
            </p>
          )}
        </div>
      )}

      {/* Actions — edit-mode only; the entry-point Edit button lives top-left (see header) */}
      {isEditing && (
        <div className="flex flex-col gap-1.5 pt-0.5">
          {confirmingDelete ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-500">Delete this entry?</span>
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
  const [shinyFormatFilter, setShinyFormatFilter] = useState(null) // shiny_format_name string or null (= all shiny)
  const { formats: shinyFormats } = useShinyFormats()
  const [showFilter, setShowFilter] = useState(null) // show_id string or null
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({ text: '', answer: '', category: '', items: null })
  const [saving, setSaving]       = useState(false)
  // Save/delete failures were silent (the edit stayed open with the draft
  // intact, but nothing said WHY) — surface them; cleared on the next attempt.
  const [writeError, setWriteError] = useState(null)

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
    if (filter === 'shiny' && shinyFormatFilter && row.shiny_format_name !== shinyFormatFilter) return false
    if (!q) return true
    return (row.text ?? '').toLowerCase().includes(q) || (row.answer ?? '').toLowerCase().includes(q)
  })

  // Only offer formats that actually have questions archived under them —
  // the full library (dashboard's Shiny Formats) is usually bigger than
  // what's been uploaded so far.
  const shinyFormatsInUse = shinyFormats.filter(fmt =>
    questions.some(row => row.is_shiny && row.shiny_format_name === fmt.name)
  )

  function startEdit(row) {
    setEditingId(row.id)
    // Multi-item rows (swing/pyl/list — anything bulk-entered) carry their real
    // content in questions_data; edit that as an item list. Single questions
    // keep the plain text/answer path (items stays null).
    const items = Array.isArray(row.questions_data) && row.questions_data.length > 0
      ? row.questions_data.map(it => ({ text: it.text ?? '', answer: it.answer ?? '' }))
      : null
    setEditDraft({ text: row.text ?? '', answer: row.answer ?? '', category: row.category ?? '', items })
  }

  async function commitEdit(id) {
    if (saving) return
    setSaving(true)
    setWriteError(null)
    const patch = editDraft.items
      ? {
          text: editDraft.text.trim() || null,
          category: editDraft.category.trim() || null,
          questions_data: editDraft.items
            .map(it => ({ text: (it.text ?? '').trim(), answer: (it.answer ?? '').trim() }))
            .filter(it => it.text || it.answer),
        }
      : { text: editDraft.text, answer: editDraft.answer, category: editDraft.category.trim() || null }
    const { error } = await supabase
      .from('questions')
      .update(patch)
      .eq('id', id)
    if (!error) {
      setQuestions(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
      setEditingId(null)
    } else {
      setWriteError('Save failed — check connection (your edit is kept)')
    }
    setSaving(false)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function deleteQuestion(id) {
    if (saving) return
    setSaving(true)
    setWriteError(null)
    const { error } = await supabase.from('questions').delete().eq('id', id)
    if (!error) {
      setQuestions(prev => prev.filter(r => r.id !== id))
      setEditingId(null)
    } else {
      setWriteError('Delete failed — check connection')
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

      {/* Add Questions — links out to its own dedicated input page */}
      <div className="max-w-6xl mx-auto px-6 pt-6">
        <a
          href="/questions/add"
          className="flex items-center justify-between gap-3 bg-gradient-to-br from-emerald-50 to-green-100 border border-green-200 rounded-2xl shadow-sm px-6 py-5 transition-colors duration-150 ease-out hover:border-green-400 active:scale-[0.99]"
        >
          <div>
            <p className="text-sm font-semibold text-gray-800">＋ Add Questions</p>
            <p className="text-xs text-gray-600 mt-0.5">Upload trivia from past shows without attaching it to a show</p>
          </div>
          <span className="text-xl text-green-700 shrink-0">→</span>
        </a>
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
              onClick={() => { setFilter(f.id); setShinyFormatFilter(null) }}
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

        {filter === 'shiny' && shinyFormatsInUse.length > 0 && (
          <div className="flex gap-1.5 flex-wrap justify-center">
            <button
              onClick={() => setShinyFormatFilter(null)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] ${
                shinyFormatFilter === null
                  ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                  : 'bg-white border border-gray-100 text-gray-500 hover:border-yellow-300 hover:text-yellow-800'
              }`}
            >
              All shiny
            </button>
            {shinyFormatsInUse.map(fmt => (
              <button
                key={fmt.id}
                onClick={() => setShinyFormatFilter(fmt.name)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] ${
                  shinyFormatFilter === fmt.name
                    ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                    : 'bg-white border border-gray-100 text-gray-500 hover:border-yellow-300 hover:text-yellow-800'
                }`}
              >
                <span>{fmt.icon}</span>
                {fmt.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {writeError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg z-50">
          {writeError}
        </div>
      )}

      {/* Category suggestions for the inline edit — drawn from what's already in the bank */}
      <datalist id="qcat-archive-suggestions">
        {[...new Set(questions.map(r => r.category).filter(Boolean))].sort().map(c => <option key={c} value={c} />)}
      </datalist>

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
          /* items-stretch (the flex default) lets cards in the same row equalize
             height — every card's box reads the same size across the whole
             grid, whether it's a plain question, an untruncated short item
             list, or a capped-and-truncated long one; a short card just
             shows empty space rather than shrinking to its own content.
             items-start (previous) let every card sit at its own natural
             height, reading as mismatched card sizes row to row. */
          <div className="flex flex-wrap gap-4 justify-center items-stretch">
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
