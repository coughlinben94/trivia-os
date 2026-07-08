import { useState, useRef, useEffect } from 'react'
import { useShinyFormats } from '../../hooks/useShinyFormats.js'
import { archiveQuestion, archiveQuestions } from '../../lib/archiveQuestion.js'
import { supabase } from '../../lib/supabase.js'
import { makeCleanPasteHandler, makeQuestionPasteHandler } from '../../lib/cleanPaste.js'
import { parseOutlinePaste } from '../../lib/parseOutline.js'

const BTN = 'host-button'
const MEDIA_DOT = { image: 'bg-green-400', audio: 'bg-blue-400', text: 'bg-amber-400', video: 'bg-purple-400', list: 'bg-orange-400', grid: 'bg-pink-400' }

// Searchable format-card grid — the one shiny-format picker, shared by the
// Question panel and Paste & Organize (was a nice grid in one and a 34-row
// native <select> in the other). Owns its own search state; onSelect gets the
// full format object, or null when the selected tile is clicked again.
function ShinyFormatPicker({ formats, loading, selectedId, onSelect, showHeading = true }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const visible = q
    ? formats.filter(f => f.name?.toLowerCase().includes(q) || f.description?.toLowerCase().includes(q))
    : formats
  return (
    <>
      {showHeading && (
        <div>
          <p className="text-sm font-semibold text-gray-800">✨ Shiny formats</p>
          <p className="text-xs text-gray-500 mt-0.5">Pick a format</p>
        </div>
      )}
      {!loading && formats.length > 0 && (
        <div className="relative shrink-0">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search formats…"
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
          />
        </div>
      )}
      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : formats.length === 0 ? (
        <p className="text-xs text-gray-500">No formats yet — add one via ✨ Add Shiny in the host.</p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-gray-500">No formats match "{search.trim()}".</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 overflow-y-auto max-h-72">
          {visible.map(fmt => {
            const mediaType = fmt.input_schema?.type
            const isSel = selectedId === fmt.id
            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => onSelect(isSel ? null : fmt)}
                title={fmt.description}
                className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.97] ${
                  isSel ? 'bg-yellow-50 border-yellow-400' : 'bg-gray-50 border-gray-100 hover:border-gray-300'
                }`}
              >
                <span className="text-base leading-none mt-0.5 shrink-0">{fmt.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold truncate leading-tight ${isSel ? 'text-yellow-700' : 'text-gray-600'}`}>{fmt.name}</p>
                  {mediaType && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${MEDIA_DOT[mediaType] ?? 'bg-gray-300'}`} />
                      <span className="text-[11px] text-gray-500 leading-none">{mediaType}</span>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// Same gradient family as BuildMode.jsx's CARD_STYLE (dashboard rest-grid) —
// reused here by key so the launcher tiles read as the same visual system.
export const INPUT_TILES = [
  { id: 'question', icon: '❓', name: 'Question',   desc: 'Plain text question',
    gradient: 'bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200 hover:border-blue-400' },
  { id: 'shiny-question', icon: '✨', name: 'Shiny Question', desc: 'Pick a format and fill it in',
    gradient: 'bg-gradient-to-br from-yellow-50 to-amber-100 border-yellow-300 hover:border-yellow-400' },
  { id: 'swing',     icon: '🎷', name: 'Swing Round', desc: 'Bulk-add a batch of questions',
    gradient: 'bg-gradient-to-br from-orange-50 to-red-100 border-orange-200 hover:border-orange-400' },
  { id: 'pyl',       icon: '🎰', name: 'Press Your Luck!', desc: 'Add themed categories',
    gradient: 'bg-gradient-to-br from-teal-50 to-blue-100 border-teal-200 hover:border-blue-400' },
  { id: 'bulk',      icon: '📋', name: 'Paste & Organize', desc: 'Paste a whole round, board, or list',
    gradient: 'bg-gradient-to-br from-purple-50 to-fuchsia-100 border-purple-200 hover:border-purple-400' },
]

function Toast({ show, label, fail = false }) {
  if (!show) return null
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 ${fail ? 'bg-red-600' : 'bg-gray-900'} text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg z-50 transition-[opacity,transform] duration-200 ease-out`}
      style={{ animation: 'toastIn 200ms cubic-bezier(0.23,1,0.32,1) both' }}
    >
      {label}
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
    </div>
  )
}

// Shared save-outcome state for the three input panels: success flashes the
// dark toast and clears the form; failure keeps EVERYTHING the host typed and
// shows a red toast. A failed insert must never look like a save — this
// surface is about to carry hundreds of hand-entered questions.
//
// The in-flight guard is a REF, not state: a double-click dispatches both
// clicks before React re-renders, so a state-based `busy` check reads the
// stale false both times and inserts twice (verified live — triple-click
// produced three identical rows). begin() flips the ref synchronously; the
// `busy` state exists only to disable the button visually.
function useSaveOutcome() {
  const [toast, setToast]   = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, setBusyState] = useState(false)
  const busyRef = useRef(false)
  function begin() {
    if (busyRef.current) return false
    busyRef.current = true
    setBusyState(true)
    return true
  }
  function end() {
    busyRef.current = false
    setBusyState(false)
  }
  function flashSuccess() { setToast(true); setTimeout(() => setToast(false), 1600) }
  function flashFailure() { setFailed(true); setTimeout(() => setFailed(false), 3500) }
  return { toast, failed, busy, begin, end, flashSuccess, flashFailure }
}

const FAIL_LABEL = 'Didn’t save — check connection (your text is kept)'

// Warn before closing/leaving the tab while typed entry text would be lost.
function useUnsavedGuard(dirty) {
  useEffect(() => {
    if (!dirty) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
}

// ─── Regular / Shiny question ──────────────────────────────────────────────

export function QuestionInputPanel({ onAdded, mode = 'plain' }) {
  const { formats: shinyFormats, loading: shinyLoading } = useShinyFormats()

  const [questionText,   setQuestionText]   = useState('')
  const [questionAnswer, setQuestionAnswer] = useState('')
  const [isBonus, setIsBonus]               = useState(false)

  const [selectedShinyFmt, setSelectedShinyFmt] = useState(null)
  const [shinyStep,         setShinyStep]        = useState('pick')
  const [shinyQuestion,     setShinyQuestion]    = useState('')
  const [shinySubtitle,     setShinySubtitle]    = useState('')
  const [shinyAnswer,       setShinyAnswer]      = useState('')
  const [gridCols, setGridCols] = useState(4)
  const [gridRows, setGridRows] = useState(3)

  // Image formats: same "how many entries / how many assets" prompt as the
  // live-show wizard's "how many slides / how many assets" — assets>1 means
  // this archive row stores an item list (questions_data), the same shape
  // Swing/PYL already use, instead of a single flat answer. Entries>1
  // batches multiple separate rows, filled in one at a time (same
  // pagination pattern as PylInputPanel's "Theme 1 of N").
  const [entryCount, setEntryCount] = useState('')
  const [assetCount, setAssetCount] = useState(3)
  const [entryIndex, setEntryIndex] = useState(0)
  const [collectedEntries, setCollectedEntries] = useState([])
  const [currentItems, setCurrentItems] = useState(() => Array.from({ length: 3 }, () => ({ text: '', answer: '' })))

  const { toast, failed, busy, begin, end, flashSuccess, flashFailure } = useSaveOutcome()
  // Rapid-entry loop: after a successful save, focus returns here so the
  // next question starts with typing, not mousing (same lesson as the
  // scoreboard's Quick Entry).
  const questionTextRef = useRef(null)

  const canAddQuestion = questionText.trim().length > 0 && questionAnswer.trim().length > 0
  const isGrid = selectedShinyFmt?.input_schema?.type === 'grid'
  const isImageFmt = selectedShinyFmt?.input_schema?.type === 'image'
  const isConcurrentFmt = selectedShinyFmt?.input_schema?.concurrent === true
  // Undefined/legacy concurrent formats default to true — the behavior
  // concurrent formats have always had (each asset its own answer).
  const isQuestionSeriesFmt = selectedShinyFmt?.input_schema?.questionSeries !== false
  // A format can preset its asset count (slots). When it does, use that and
  // hide this panel's own "How many assets?" input; when blank, prompt here.
  const fmtAssetPreset = selectedShinyFmt?.input_schema?.slots
  const hasAssetPreset = typeof fmtAssetPreset === 'number' && fmtAssetPreset > 0
  const effectiveAssets = hasAssetPreset ? fmtAssetPreset : assetCount
  const numEntries = Math.max(1, parseInt(entryCount, 10) || 1)
  // Item list (one text/answer row per asset) only applies to a true
  // question series — each asset really is its own independent mini-question.
  // A shared-answer concurrent format (or a non-concurrent multi-asset image)
  // has nothing distinct to catalog per asset here (this is a pure text
  // archive, no image upload), so it's just one flat question/answer entry.
  const useItemList = isConcurrentFmt && isQuestionSeriesFmt && effectiveAssets > 1
  const cleanCurrentItems = () => currentItems.map(it => ({ text: it.text.trim(), answer: it.answer.trim() })).filter(it => it.text || it.answer)
  const canAddShiny = useItemList ? cleanCurrentItems().length > 0 : shinyAnswer.trim().length > 0

  useUnsavedGuard(!!(questionText.trim() || questionAnswer.trim() || shinyQuestion.trim() || shinySubtitle.trim() || shinyAnswer.trim() || currentItems.some(it => it.text.trim() || it.answer.trim())))

  function updateCurrentItem(i, field, val) {
    setCurrentItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))
  }

  function resetShinyForm() {
    setShinyQuestion(''); setShinySubtitle(''); setShinyAnswer('')
    setSelectedShinyFmt(null); setShinyStep('pick')
    setEntryCount(''); setAssetCount(3); setEntryIndex(0); setCollectedEntries([])
    setCurrentItems(Array.from({ length: 3 }, () => ({ text: '', answer: '' })))
  }

  async function addPlain() {
    if (!canAddQuestion || !begin()) return
    const ok = await archiveQuestion({
      type:       'regular',
      text:       questionText.trim(),
      answer:     questionAnswer.trim(),
      is_bonus:   isBonus,
      is_shiny:   false,
      show_id:    null,
      show_title: null,
      show_date:  null,
    })
    end()
    if (!ok) { flashFailure(); return } // keep the typed text
    setQuestionText(''); setQuestionAnswer(''); setIsBonus(false)
    flashSuccess()
    questionTextRef.current?.focus()
    onAdded?.()
  }

  async function addShiny() {
    if (!canAddShiny) return

    if (useItemList) {
      const entry = {
        type:              'shiny',
        text:              shinyQuestion.trim(),
        subtitle:          shinySubtitle.trim() || null,
        is_bonus:          false,
        is_shiny:          true,
        shiny_type:        selectedShinyFmt.input_schema?.type ?? null,
        shiny_format_name: selectedShinyFmt.name,
        questions_data:    cleanCurrentItems(),
        show_id:           null,
        show_title:        null,
        show_date:         null,
      }
      // More entries to fill in this batch — stash this one locally and
      // move on, same as PylInputPanel's per-theme pagination. Nothing
      // hits the database until the last entry is committed.
      if (entryIndex < numEntries - 1) {
        setCollectedEntries(prev => [...prev, entry])
        setEntryIndex(i => i + 1)
        setShinyQuestion(''); setShinySubtitle('')
        setCurrentItems(Array.from({ length: effectiveAssets }, () => ({ text: '', answer: '' })))
        return
      }
      if (!begin()) return
      const ok = await archiveQuestions([...collectedEntries, entry])
      end()
      if (!ok) { flashFailure(); return } // keep everything typed across the whole batch
      resetShinyForm()
      flashSuccess()
      onAdded?.()
      return
    }

    if (!begin()) return
    const ok = await archiveQuestion({
      type:              'shiny',
      text:              shinyQuestion.trim(),
      subtitle:          shinySubtitle.trim() || null,
      answer:            shinyAnswer.trim(),
      is_bonus:          false,
      is_shiny:          true,
      shiny_type:        selectedShinyFmt.input_schema?.type ?? null,
      shiny_format_name: selectedShinyFmt.name,
      show_id:           null,
      show_title:        null,
      show_date:         null,
    })
    end()
    if (!ok) { flashFailure(); return } // keep the typed text
    resetShinyForm()
    flashSuccess()
    onAdded?.()
  }

  return (
    <div>
      {mode === 'plain' ? (
      /* ── PLAIN QUESTION ── */
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">📝 Plain question</p>
          <p className="text-xs text-gray-500 mt-0.5">Added straight to the archive — no show attached</p>
        </div>
        <textarea
          ref={questionTextRef}
          autoFocus
          value={questionText}
          onChange={e => setQuestionText(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addPlain() }}
          // Pasting "question\nAnswer: ..." (or just two lines) fills BOTH
          // fields at once — see cleanPaste.js's splitQuestionAnswer.
          onPaste={makeQuestionPasteHandler(setQuestionText, setQuestionAnswer)}
          placeholder="Type or paste your question… (paste question+answer together to fill both)"
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
        />
        <input
          type="text"
          value={questionAnswer}
          onChange={e => setQuestionAnswer(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addPlain() }}
          onPaste={makeCleanPasteHandler(setQuestionAnswer)}
          placeholder="The answer… (Enter saves)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
        />
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isBonus}
            onChange={e => setIsBonus(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-[#1a6b4a]"
          />
          <span className="text-sm text-gray-700">Bonus question</span>
        </label>
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <button
            onClick={addPlain}
            disabled={!canAddQuestion || busy}
            className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed transition-[transform,opacity] duration-150 ease-out active:scale-[0.98]`}
          >
            Add to Database →
          </button>
          {!canAddQuestion && (
            <p className="text-xs text-gray-500 text-center">
              {!questionText.trim() ? 'Add question text to continue' : 'Add an answer to continue'}
            </p>
          )}
        </div>
      </div>
      ) : (
      /* ── SHINY FORMAT PICKER ── */
      <div className="flex flex-col gap-3">
        {shinyStep === 'details' && selectedShinyFmt ? (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShinyStep('pick'); setSelectedShinyFmt(null); setEntryCount(''); setAssetCount(3); setEntryIndex(0); setCollectedEntries([]); setCurrentItems(Array.from({ length: 3 }, () => ({ text: '', answer: '' }))) }}
                className={`text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 ${BTN}`}
              >
                ←
              </button>
              <p className="text-sm font-semibold text-gray-800">{selectedShinyFmt.icon} {selectedShinyFmt.name}</p>
              {useItemList && numEntries > 1 && (
                <span className="text-[11px] text-gray-400 ml-auto">Entry {entryIndex + 1} of {numEntries}</span>
              )}
            </div>

            {(isImageFmt || isConcurrentFmt) && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    How many entries to add? <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={entryCount}
                    disabled={collectedEntries.length > 0}
                    onChange={e => setEntryCount(e.target.value)}
                    placeholder="1"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 text-center placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                {/* Format presets its asset count — only prompt here when blank. */}
                {!hasAssetPreset && (
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">How many assets?</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={assetCount}
                      disabled={collectedEntries.length > 0}
                      onChange={e => {
                        const n = Math.max(1, parseInt(e.target.value) || 1)
                        setAssetCount(n)
                        setCurrentItems(prev => Array.from({ length: n }, (_, i) => prev[i] ?? { text: '', answer: '' }))
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 text-center focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                )}
              </div>
            )}

            <textarea
              value={shinyQuestion}
              onChange={e => setShinyQuestion(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addShiny() }}
              onPaste={useItemList ? undefined : makeQuestionPasteHandler(setShinyQuestion, setShinyAnswer)}
              placeholder="Question text (optional)…"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
            />

            <input
              type="text"
              value={shinySubtitle}
              onChange={e => setShinySubtitle(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addShiny() }}
              placeholder="Subtitle (optional) — e.g. reversed, mythical character…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
            />

            {isGrid && (
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Columns</label>
                  <div className="flex gap-1.5">
                    {[1,2,3,4,5,6].map(n => (
                      <button key={n} onClick={() => setGridCols(n)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold border transition-colors duration-150 ease-out ${gridCols === n ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{n}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Rows</label>
                  <div className="flex gap-1.5">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => setGridRows(n)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold border transition-colors duration-150 ease-out ${gridRows === n ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{n}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {useItemList ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-gray-500">{effectiveAssets} items — paste the whole list into any row, or type each one</p>
                {currentItems.map((it, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="text-xs font-semibold text-gray-400 w-4 shrink-0 text-right">{i + 1}</span>
                    <input
                      type="text"
                      placeholder="Item…"
                      value={it.text}
                      autoFocus={i === 0}
                      onChange={e => updateCurrentItem(i, 'text', e.target.value)}
                      onPaste={makeBulkOrCleanPasteHandler(setCurrentItems, v => updateCurrentItem(i, 'text', v))}
                      className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
                    />
                    <input
                      type="text"
                      placeholder="Answer (optional)…"
                      value={it.answer}
                      onChange={e => updateCurrentItem(i, 'answer', e.target.value)}
                      onPaste={makeBulkOrCleanPasteHandler(setCurrentItems, v => updateCurrentItem(i, 'answer', v))}
                      className="w-36 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={shinyAnswer}
                onChange={e => setShinyAnswer(e.target.value)}
                onPaste={makeCleanPasteHandler(setShinyAnswer)}
                placeholder="The answer…"
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
              />
            )}

            <div className="mt-auto flex flex-col gap-1.5 pt-1">
              <button
                onClick={addShiny}
                disabled={!canAddShiny || busy}
                className={`w-full bg-yellow-500 text-white text-sm font-semibold py-3 rounded-xl hover:bg-yellow-600 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed transition-[transform,opacity] duration-150 ease-out active:scale-[0.98]`}
              >
                {useItemList && entryIndex < numEntries - 1
                  ? 'Next Entry →'
                  : useItemList && numEntries > 1
                    ? `Add ${numEntries} ${selectedShinyFmt.name} →`
                    : `Add ${selectedShinyFmt.name} →`}
              </button>
              {!canAddShiny && <p className="text-xs text-gray-500 text-center">{useItemList ? 'Add at least one item to continue' : 'Add an answer to continue'}</p>}
            </div>
          </>
        ) : (
          <>
            <ShinyFormatPicker
              formats={shinyFormats}
              loading={shinyLoading}
              selectedId={selectedShinyFmt?.id}
              onSelect={setSelectedShinyFmt}
            />
            {selectedShinyFmt && (
              <div className="mt-auto pt-2">
                <button
                  onClick={() => {
                    // A format with a preset asset count seeds its item rows to
                    // that count up front (the "How many assets?" input is
                    // hidden for it).
                    const preset = selectedShinyFmt.input_schema?.slots
                    if (typeof preset === 'number' && preset > 0) {
                      setCurrentItems(Array.from({ length: preset }, () => ({ text: '', answer: '' })))
                    }
                    setShinyStep('details')
                  }}
                  className={`w-full bg-yellow-500 text-white text-sm font-semibold py-3 rounded-xl hover:bg-yellow-600 ${BTN} transition-[transform] duration-150 ease-out active:scale-[0.98]`}
                >
                  Add {selectedShinyFmt.name} →
                </button>
              </div>
            )}
          </>
        )}
      </div>
      )}
      <Toast show={toast} label="Added to database" />
      <Toast show={failed} fail label={FAIL_LABEL} />
    </div>
  )
}

// A paste into ANY item-row cell (Swing's question/answer, PYL's item/answer)
// that looks like a multi-item block — more than one clue/answer pair —
// replaces the WHOLE item list with the parsed result, instead of only
// filling that one cell. This is the point of the guided flow: type the
// round title / theme name once, then paste the entire block of
// questions+answers in one shot rather than typing or pasting them one row
// at a time. A plain single-line paste falls through to the normal
// per-cell clean-paste behavior untouched.
function makeBulkOrCleanPasteHandler(setItems, cellSetter) {
  return (e) => {
    const raw = e.clipboardData.getData('text/plain')
    const { groups } = parseOutlinePaste(raw)
    const flat = groups.flatMap(g => g.items).filter(it => it.text || it.answer)
    if (flat.length > 1) {
      e.preventDefault()
      setItems(flat.map(it => ({ text: it.text, answer: it.answer })))
      return
    }
    makeCleanPasteHandler(cellSetter)(e)
  }
}

// ─── Swing Round batch ──────────────────────────────────────────────────────

export function SwingInputPanel({ onAdded }) {
  const [count, setCount]         = useState(6)
  const [started, setStarted]     = useState(false)
  const [questions, setQuestions] = useState([])
  const [roundTitle, setRoundTitle] = useState('')
  const { toast, failed, busy, begin, end, flashSuccess, flashFailure } = useSaveOutcome()

  useUnsavedGuard(questions.some(q => q.text.trim() || q.answer.trim()))

  function goToQuestions() {
    setQuestions(Array.from({ length: Math.max(1, count) }, () => ({ text: '', answer: '' })))
    setStarted(true)
  }

  function updateQ(i, field, val) {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: val } : q))
  }

  const nonEmpty = questions.filter(q => q.text.trim() || q.answer.trim())

  async function submit() {
    if (nonEmpty.length === 0 || !begin()) return
    const ok = await archiveQuestions([{
      type:           'swing',
      questions_data: nonEmpty.map(q => ({ text: q.text.trim(), answer: q.answer.trim() })),
      round_title:    roundTitle.trim() || null,
      round_type:     'swing',
      show_id:        null,
      show_title:     null,
      show_date:      null,
    }])
    end()
    if (!ok) { flashFailure(); return } // keep the whole typed batch
    setStarted(false); setQuestions([]); setRoundTitle('')
    flashSuccess()
    onAdded?.()
  }

  if (!started) {
    return (
      <div className="flex flex-col gap-4 items-center max-w-xs mx-auto">
        <p className="text-sm text-gray-500 text-center">Bulk-add a batch of Swing Round questions straight to the archive — no show attached.</p>
        <div className="w-full flex flex-col items-center gap-1.5">
          <label className="text-xs font-medium text-gray-500">How many questions?</label>
          <input
            autoFocus
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
            onKeyDown={e => { if (e.key === 'Enter') goToQuestions() }}
            className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-900 text-center focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <button
          onClick={goToQuestions}
          className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} transition-[transform] duration-150 ease-out active:scale-[0.98]`}
        >
          Next →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <button onClick={() => setStarted(false)} className={`text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 ${BTN}`}>←</button>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">{questions.length} questions — paste the whole list into any row, or type each one</p>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-gray-500 mb-1">Round title <span className="text-gray-400">(optional — to keep track of this batch)</span></label>
        <input
          type="text"
          value={roundTitle}
          onChange={e => setRoundTitle(e.target.value)}
          onPaste={makeCleanPasteHandler(setRoundTitle)}
          placeholder="e.g. July 4th Swing"
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
        />
      </div>

      <div className="flex gap-2 items-center px-0.5">
        <span className="w-5 shrink-0" />
        <span className="flex-1 text-[11px] font-medium text-gray-500">Question</span>
        <span className="w-40 text-[11px] font-medium text-gray-500">Answer</span>
      </div>

      <div className="max-h-80 overflow-y-auto flex flex-col gap-2 pr-1">
        {questions.map((q, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-xs font-semibold text-gray-400 w-5 shrink-0 text-right">{i + 1}</span>
            <input
              type="text"
              placeholder="Question text…"
              value={q.text}
              onChange={e => updateQ(i, 'text', e.target.value)}
              onPaste={makeBulkOrCleanPasteHandler(setQuestions, v => updateQ(i, 'text', v))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
            />
            <input
              type="text"
              placeholder="Answer"
              value={q.answer}
              onChange={e => updateQ(i, 'answer', e.target.value)}
              onPaste={makeBulkOrCleanPasteHandler(setQuestions, v => updateQ(i, 'answer', v))}
              className="w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
            />
          </div>
        ))}
      </div>

      <div className="pt-2 flex flex-col gap-1.5">
        <button
          onClick={submit}
          disabled={nonEmpty.length === 0 || busy}
          className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed transition-[transform,opacity] duration-150 ease-out active:scale-[0.98]`}
        >
          Add {nonEmpty.length || count} to Database →
        </button>
        {nonEmpty.length === 0 && <p className="text-xs text-gray-500 text-center">Fill in at least one question to continue</p>}
      </div>
      <Toast show={toast} label="Added to database" />
      <Toast show={failed} fail label={FAIL_LABEL} />
    </div>
  )
}

// ─── Press Your Luck! themes ─────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { id: 'visual', icon: '👁️', label: 'Visual' },
  { id: 'audio',  icon: '🎵', label: 'Audio'  },
  { id: 'word',   icon: '🔤', label: 'Word'   },
]

const PYL_DEFAULT_ITEM_COUNT = 6 // matches Ben's "6-item complete list" PYL convention

function blankPylItems() {
  return Array.from({ length: PYL_DEFAULT_ITEM_COUNT }, () => ({ text: '', answer: '' }))
}

export function PylInputPanel({ onAdded }) {
  const [started, setStarted]     = useState(false)
  const [themeCount, setThemeCount] = useState(3)
  const [themeIndex, setThemeIndex] = useState(0)
  const [collected, setCollected] = useState([])
  const [currentName, setCurrentName] = useState('')
  const [currentType, setCurrentType] = useState(null)
  // The actual 6-item list for the theme being entered right now — this was
  // missing entirely before: the panel only ever asked for a theme name +
  // media type and archived that alone, with no way to enter the real
  // questions/answers underneath it.
  const [currentItems, setCurrentItems] = useState(blankPylItems)
  const { toast, failed, busy, begin, end, flashSuccess, flashFailure } = useSaveOutcome()

  useUnsavedGuard(started && (currentName.trim().length > 0 || collected.length > 0 || currentItems.some(it => it.text.trim() || it.answer.trim())))

  function startThemes() {
    setCollected([]); setThemeIndex(0); setCurrentName(''); setCurrentType(null); setCurrentItems(blankPylItems()); setStarted(true)
  }

  function updateItem(idx, field, val) {
    setCurrentItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }
  function addItem() { setCurrentItems(prev => [...prev, { text: '', answer: '' }]) }
  function removeItem(idx) { setCurrentItems(prev => prev.filter((_, i) => i !== idx)) }

  const cleanCurrentItems = () => currentItems
    .map(it => ({ text: it.text.trim(), answer: it.answer.trim() }))
    .filter(it => it.text || it.answer)

  async function commitTheme() {
    if (busy) return
    const theme = { name: currentName.trim(), type: currentType, items: cleanCurrentItems() }
    const next  = [...collected, theme]
    if (next.length < themeCount) {
      setCollected(next); setThemeIndex(i => i + 1); setCurrentName(''); setCurrentType(null); setCurrentItems(blankPylItems())
      return
    }
    if (!begin()) return
    const ok = await archiveQuestions(next.map(t => ({
      type:           'pyl',
      text:           t.name,
      answer:         t.type,
      questions_data: t.items,
      round_type:     'pyl',
      show_id:        null,
      show_title:     null,
      show_date:      null,
    })))
    end()
    if (!ok) { flashFailure(); return } // keep the collected themes + current entry
    setStarted(false)
    flashSuccess()
    onAdded?.()
  }

  const isLast  = themeIndex === themeCount - 1
  const canNext = currentName.trim().length > 0 && currentType !== null

  if (!started) {
    return (
      <div className="flex flex-col gap-4 items-center max-w-xs mx-auto">
        <p className="text-sm text-gray-500 text-center">Add Press Your Luck themed categories straight to the archive — no show attached.</p>
        <div className="w-full flex flex-col items-center gap-1.5">
          <label className="text-xs font-medium text-gray-500">How many themes?</label>
          <input
            autoFocus
            type="number"
            min={1}
            max={10}
            value={themeCount}
            onChange={e => setThemeCount(Math.max(1, parseInt(e.target.value) || 1))}
            onKeyDown={e => { if (e.key === 'Enter') startThemes() }}
            className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-900 text-center focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <button
          onClick={startThemes}
          className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} transition-[transform] duration-150 ease-out active:scale-[0.98]`}
        >
          Next →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 items-center max-w-lg mx-auto">
      <div className="w-full flex items-center gap-2">
        <button
          onClick={() => {
            if (themeIndex === 0) { setStarted(false); return }
            setCollected(prev => prev.slice(0, -1))
            setThemeIndex(i => i - 1)
            const prev = collected[collected.length - 1]
            setCurrentName(prev?.name ?? ''); setCurrentType(prev?.type ?? null); setCurrentItems(prev?.items?.length ? [...prev.items] : blankPylItems())
          }}
          className={`text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 ${BTN}`}
        >
          ←
        </button>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Theme {themeIndex + 1} of {themeCount}</p>
      </div>

      <div className="w-full">
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Theme name</label>
        <input
          autoFocus
          type="text"
          placeholder="e.g. Movie Posters"
          value={currentName}
          onChange={e => setCurrentName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && canNext) commitTheme() }}
          onPaste={makeCleanPasteHandler(setCurrentName)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
        />
      </div>

      <div className="w-full">
        <p className="text-xs font-medium text-gray-500 mb-1.5">Type</p>
        <div className="flex gap-2">
          {TYPE_OPTIONS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setCurrentType(t.id)}
              className={`flex-1 py-2.5 px-1 rounded-lg text-sm font-semibold border transition-colors duration-150 ease-out ${BTN} ${
                currentType === t.id ? 'bg-[#1a6b4a] text-white border-[#1a6b4a]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a6b4a] hover:text-[#1a6b4a]'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-gray-500">Items <span className="text-gray-400">(paste the whole 6-item list into any row, or type each one)</span></p>
        </div>
        <div className="flex flex-col gap-1.5">
          {currentItems.map((it, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-xs font-semibold text-gray-400 w-4 shrink-0 text-right">{i + 1}</span>
              <input
                type="text"
                placeholder="Item…"
                value={it.text}
                onChange={e => updateItem(i, 'text', e.target.value)}
                onPaste={makeBulkOrCleanPasteHandler(setCurrentItems, v => updateItem(i, 'text', v))}
                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
              />
              <input
                type="text"
                placeholder="Answer (optional)…"
                value={it.answer}
                onChange={e => updateItem(i, 'answer', e.target.value)}
                onPaste={makeBulkOrCleanPasteHandler(setCurrentItems, v => updateItem(i, 'answer', v))}
                className="w-36 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
              />
              <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center shrink-0">✕</button>
            </div>
          ))}
        </div>
        <button onClick={addItem} className="text-[11px] text-gray-500 hover:text-gray-700 mt-1.5 px-2 py-1 rounded hover:bg-gray-100 transition-colors duration-150 ease-out">+ Add item</button>
      </div>

      {themeCount > 1 && (
        <div className="flex gap-1.5 justify-center">
          {Array.from({ length: themeCount }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors duration-150 ease-out ${
                i < themeIndex ? 'bg-[#1a6b4a]' : i === themeIndex ? 'bg-[#1a6b4a] opacity-50' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      )}

      <div className="w-full flex flex-col gap-1.5">
        <button
          onClick={commitTheme}
          disabled={!canNext || busy}
          className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed transition-[transform,opacity] duration-150 ease-out active:scale-[0.98]`}
        >
          {isLast ? `Add ${themeCount} to Database →` : 'Next Theme →'}
        </button>
        {!canNext && <p className="text-xs text-gray-500 text-center">{!currentName.trim() ? 'Enter a theme name' : 'Select a type'}</p>}
      </div>
      <Toast show={toast} label="Added to database" />
      <Toast show={failed} fail label={FAIL_LABEL} />
    </div>
  )
}

// ─── Paste & Organize (generic bulk paste — PYL boards, appendices, any outline) ──
//
// Paste a whole Word-doc outline; parseOutlinePaste (indentation-based, not
// bullet-glyph-based — see that file) breaks it into "boxes": a title plus
// an ordered [{text, answer}] item list. Two save shapes, matching how Ben
// described wanting to use this ("one box or multiple boxes... break up the
// questions or keep them together"):
//   - "N separate entries" — one archive row per box (a PYL round's 3
//     categories become 3 rows; a headerless list of clue/answer pairs,
//     which the parser already put one-per-box, becomes N 'regular' rows).
//   - "Keep as one entry" — every box's items merged into a single row
//     (an appendix/name-that-list stays one archive entry, per Ben's
//     explicit ask: "this whole appendix needs to be associated with one
//     question").
// Category is LOCAL to this panel only — Swing/PYL dropped the shared sticky
// version (their round title/theme name already label the batch), but a
// bulk-pasted historical round or appendix has no other place to record its
// category, so it's kept here, scoped to just this one panel.
// A box with >1 item needs somewhere to put its list — pyl/swing rows
// already have that (questions_data); anything else needs the 'list' type
// (see supabase/migrations/20260706010000_questions_type_add_list.sql —
// NOT YET APPLIED pending Ben's sign-off). Saves needing it are blocked
// with an explanation rather than silently failing against the DB
// constraint.

function useLocalCategorySuggestions() {
  const [categories, setCategories] = useState([])
  useEffect(() => {
    supabase
      .from('questions')
      .select('category')
      .not('category', 'is', null)
      .then(({ data }) => {
        if (data) setCategories([...new Set(data.map(r => r.category).filter(Boolean))].sort())
      })
  }, [])
  function addCategory(c) {
    setCategories(prev => (prev.includes(c) ? prev : [...prev, c].sort()))
  }
  return { categories, addCategory }
}

const BULK_ROUND_TYPE_OPTIONS = [
  { id: null,     label: 'Normal' },
  { id: 'swing',  label: 'Swing'  },
  { id: 'pyl',    label: 'PYL'    },
  { id: 'shiny',  label: 'Shiny'  },
]

const PYL_MEDIA_OPTIONS = [
  { id: 'word', label: 'Word' },
  { id: 'visual', label: 'Visual' },
  { id: 'audio', label: 'Audio' },
]

export function BulkPasteInputPanel({ onAdded }) {
  const [raw, setRaw] = useState('')
  const [detectedTitle, setDetectedTitle] = useState(null)
  const [boxes, setBoxes] = useState([]) // [{ id, title, mediaType, items:[{text,answer}] }]
  const [mode, setMode] = useState('boxes') // 'boxes' | 'one'
  const [roundType, setRoundType] = useState(null) // null | 'swing' | 'pyl' | 'shiny'
  const [category, setCategory] = useState('')
  const [shinyFmtId, setShinyFmtId] = useState('')
  const { formats: shinyFormats, loading: shinyLoading } = useShinyFormats()
  const { categories, addCategory } = useLocalCategorySuggestions()
  const { toast, failed, busy, begin, end, flashSuccess, flashFailure } = useSaveOutcome()
  const selectedShinyFmt = shinyFormats.find(f => f.id === shinyFmtId) || null

  useUnsavedGuard(boxes.length > 0)

  function organize(text) {
    const { title, groups } = parseOutlinePaste(text)
    setDetectedTitle(title)
    const withIds = groups.map((g, i) => ({ id: `b${Date.now()}_${i}`, title: g.title, mediaType: 'word', items: g.items }))
    setBoxes(withIds)
    setMode(withIds.length > 1 ? 'boxes' : 'one')
    setRaw('')
  }

  function handlePaste(e) {
    e.preventDefault()
    organize(e.clipboardData.getData('text/plain'))
  }

  function updateBoxTitle(id, title) { setBoxes(prev => prev.map(b => b.id === id ? { ...b, title } : b)) }
  function updateBoxMedia(id, mediaType) { setBoxes(prev => prev.map(b => b.id === id ? { ...b, mediaType } : b)) }
  function updateItem(boxId, idx, field, val) {
    setBoxes(prev => prev.map(b => b.id === boxId ? { ...b, items: b.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) } : b))
  }
  function removeItem(boxId, idx) {
    setBoxes(prev => prev.map(b => b.id === boxId ? { ...b, items: b.items.filter((_, i) => i !== idx) } : b).filter(b => b.items.length > 0))
  }
  function addItem(boxId) {
    setBoxes(prev => prev.map(b => b.id === boxId ? { ...b, items: [...b.items, { text: '', answer: '' }] } : b))
  }
  function removeBox(id) { setBoxes(prev => prev.filter(b => b.id !== id)) }
  function splitBox(id) {
    setBoxes(prev => prev.flatMap(b => b.id === id
      ? b.items.map((it, i) => ({ id: `${b.id}_${i}`, title: it.text || b.title, mediaType: 'word', items: [it] }))
      : [b]
    ))
  }
  function startOver() { setBoxes([]); setDetectedTitle(null); setRaw(''); setCategory('') }

  const cleanItems = (items) => items
    .map(it => ({ text: it.text.trim(), answer: it.answer.trim() }))
    .filter(it => it.text || it.answer)

  // Always takes the EXACT round_type to write — no implicit fallback to
  // the outer `roundType` state. That fallback used to be `forcedRoundType
  // ?? roundType`, but `??` can't tell "explicitly null" from "not passed",
  // so extra(null) (used to null out 'shiny', which isn't a valid round_type
  // value) silently resolved back to roundType === 'shiny' and violated the
  // DB check constraint. Every call site now passes its exact intended value.
  const extra = (rt) => ({
    category:   category.trim() || null,
    round_type: rt,
  })


  async function save() {
    if (boxes.length === 0 || !begin()) return
    let rows
    if (mode === 'one') {
      const combined = boxes.flatMap(b => cleanItems(b.items))
      if (roundType === 'swing') {
        rows = [{ type: 'swing', questions_data: combined, round_title: detectedTitle || category.trim() || null, show_id: null, show_title: null, show_date: null, ...extra('swing') }]
      } else if (roundType === 'shiny') {
        rows = [{ type: 'shiny', is_shiny: true, text: detectedTitle || category.trim() || null, shiny_format_name: selectedShinyFmt?.name || null, shiny_type: selectedShinyFmt?.input_schema?.type ?? null, questions_data: combined, show_id: null, show_title: null, show_date: null, ...extra(null) }]
      } else {
        rows = [{
          type: roundType === 'pyl' ? 'pyl' : 'list',
          text: detectedTitle || category.trim() || null,
          answer: roundType === 'pyl' ? 'word' : null,
          questions_data: combined,
          show_id: null, show_title: null, show_date: null,
          ...extra(roundType),
        }]
      }
    } else {
      rows = boxes.map(b => {
        const items = cleanItems(b.items)
        if (items.length === 1) {
          return { type: 'regular', text: items[0].text, answer: items[0].answer, is_bonus: false, is_shiny: false, show_id: null, show_title: null, show_date: null, ...extra(roundType === 'shiny' ? null : roundType) }
        }
        if (roundType === 'pyl') {
          return { type: 'pyl', text: b.title, answer: b.mediaType, questions_data: items, show_id: null, show_title: null, show_date: null, ...extra('pyl') }
        }
        if (roundType === 'swing') {
          return { type: 'swing', questions_data: items, round_title: b.title || null, show_id: null, show_title: null, show_date: null, ...extra('swing') }
        }
        if (roundType === 'shiny') {
          return { type: 'shiny', is_shiny: true, text: b.title, shiny_format_name: selectedShinyFmt?.name || b.title || null, shiny_type: selectedShinyFmt?.input_schema?.type ?? null, questions_data: items, show_id: null, show_title: null, show_date: null, ...extra(null) }
        }
        return { type: 'list', text: b.title, questions_data: items, show_id: null, show_title: null, show_date: null, ...extra(roundType) }
      })
    }
    const ok = await archiveQuestions(rows)
    end()
    if (!ok) { flashFailure(); return }
    const c = category.trim(); if (c) addCategory(c)
    flashSuccess()
    startOver()
    onAdded?.()
  }

  const totalItems = boxes.reduce((n, b) => n + cleanItems(b.items).length, 0)
  // When the parse collapsed standalone questions into ONE box (no header
  // detected), "separate entries" means one row per ITEM — so the toggle reads
  // "N separate entries" (not "1") and clicking it splits the box into rows.
  const singleBoxItems = boxes.length === 1 ? cleanItems(boxes[0].items).length : 0
  const separateCount = singleBoxItems > 1 ? singleBoxItems : boxes.length

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
      {boxes.length === 0 ? (
        <>
          <p className="text-sm text-gray-500 text-center">
            Paste a whole round, PYL board, or appendix list here — we'll strip the formatting and organize it into editable boxes below.
          </p>
          <textarea
            autoFocus
            value={raw}
            onChange={e => setRaw(e.target.value)}
            onPaste={handlePaste}
            placeholder="Paste your outline here…"
            rows={10}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
          />
          {raw.trim() && (
            <button
              onClick={() => organize(raw)}
              className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} transition-[transform] duration-150 ease-out active:scale-[0.98]`}
            >
              Organize →
            </button>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-2 items-end bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Category <span className="text-gray-400">(optional)</span></label>
              <input
                type="text"
                list="bulk-cat-suggestions"
                value={category}
                onChange={e => setCategory(e.target.value)}
                onPaste={makeCleanPasteHandler(setCategory)}
                placeholder="e.g. Movies"
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
              />
              <datalist id="bulk-cat-suggestions">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Round type</label>
              <div className="flex gap-1">
                {BULK_ROUND_TYPE_OPTIONS.map(rt => (
                  <button
                    key={rt.label}
                    type="button"
                    onClick={() => setRoundType(rt.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors duration-150 ease-out ${
                      roundType === rt.id ? 'bg-[#1a6b4a] text-white border-[#1a6b4a]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a6b4a] hover:text-[#1a6b4a]'
                    }`}
                  >
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {roundType === 'shiny' && (
            <div className="flex flex-col gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-3">
              <label className="text-[11px] font-medium text-gray-500">Shiny format <span className="text-gray-400">(optional)</span></label>
              <ShinyFormatPicker
                formats={shinyFormats}
                loading={shinyLoading}
                selectedId={shinyFmtId}
                onSelect={fmt => setShinyFmtId(fmt?.id ?? '')}
                showHeading={false}
              />
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setMode('one')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors duration-150 ease-out ${mode === 'one' ? 'bg-[#1a6b4a] text-white border-[#1a6b4a]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a6b4a]'}`}
              >
                Keep as one entry
              </button>
              <button
                type="button"
                onClick={() => { if (singleBoxItems > 1) splitBox(boxes[0].id); setMode('boxes') }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors duration-150 ease-out ${mode === 'boxes' ? 'bg-[#1a6b4a] text-white border-[#1a6b4a]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a6b4a]'}`}
              >
                {separateCount} separate {separateCount === 1 ? 'entry' : 'entries'}
              </button>
            </div>
            <button onClick={startOver} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors duration-150 ease-out">Start over</button>
          </div>


          <div className="flex flex-col gap-3 max-h-[28rem] overflow-y-auto pr-1">
            {boxes.map(box => {
              const items = cleanItems(box.items)
              return (
                <div key={box.id} className="border border-gray-200 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={box.title}
                      onChange={e => updateBoxTitle(box.id, e.target.value)}
                      onPaste={makeCleanPasteHandler(v => updateBoxTitle(box.id, v))}
                      className="flex-1 border-b border-gray-200 text-sm font-semibold text-gray-800 px-1 py-1 focus:outline-none focus:border-[#1a6b4a]"
                    />
                    {items.length > 1 && roundType === 'pyl' && (
                      <div className="flex gap-1 shrink-0">
                        {PYL_MEDIA_OPTIONS.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => updateBoxMedia(box.id, m.id)}
                            className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors duration-150 ease-out ${box.mediaType === m.id ? 'bg-[#1a6b4a] text-white border-[#1a6b4a]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#1a6b4a]'}`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <span className="text-[11px] text-gray-400 shrink-0">{items.length} item{items.length === 1 ? '' : 's'}</span>
                    {items.length > 1 && (
                      <button onClick={() => splitBox(box.id)} className="text-[11px] text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 shrink-0 transition-colors duration-150 ease-out">
                        Split into separate rows
                      </button>
                    )}
                    <button onClick={() => removeBox(box.id)} className="text-gray-300 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center shrink-0">✕</button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {box.items.map((it, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={it.text}
                          onChange={e => updateItem(box.id, i, 'text', e.target.value)}
                          onPaste={makeCleanPasteHandler(v => updateItem(box.id, i, 'text', v))}
                          placeholder="Clue / item…"
                          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
                        />
                        <input
                          type="text"
                          value={it.answer}
                          onChange={e => updateItem(box.id, i, 'answer', e.target.value)}
                          onPaste={makeCleanPasteHandler(v => updateItem(box.id, i, 'answer', v))}
                          placeholder="Answer (optional)…"
                          className="w-40 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
                        />
                        <button onClick={() => removeItem(box.id, i)} className="text-gray-300 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center shrink-0">✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addItem(box.id)} className="text-[11px] text-gray-500 hover:text-gray-700 self-start px-2 py-1 rounded hover:bg-gray-100 transition-colors duration-150 ease-out">+ Add item</button>
                </div>
              )
            })}
          </div>

          <button
            onClick={save}
            disabled={busy || totalItems === 0}
            className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed transition-[transform,opacity] duration-150 ease-out active:scale-[0.98]`}
          >
            {mode === 'one' ? `Add as 1 entry (${totalItems} items) →` : `Add ${boxes.length} entries →`}
          </button>
        </>
      )}
      <Toast show={toast} label="Added to database" />
      <Toast show={failed} fail label={FAIL_LABEL} />
    </div>
  )
}
