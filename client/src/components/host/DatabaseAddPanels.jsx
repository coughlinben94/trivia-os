import { useState } from 'react'
import { useShinyFormats } from '../../hooks/useShinyFormats.js'
import { archiveQuestion, archiveQuestions } from '../../lib/archiveQuestion.js'

const BTN = 'host-button'
const MEDIA_DOT = { image: 'bg-green-400', audio: 'bg-blue-400', text: 'bg-amber-400', video: 'bg-purple-400', list: 'bg-orange-400', grid: 'bg-pink-400' }

export const INPUT_TILES = [
  { id: 'question', icon: '❓', name: 'Question',   desc: 'Regular or shiny question' },
  { id: 'swing',     icon: '🎷', name: 'Swing Round', desc: 'Bulk-add a batch of questions' },
  { id: 'pyl',       icon: '🎰', name: 'Press Your Luck!', desc: 'Add themed categories' },
]

function Toast({ show, label }) {
  if (!show) return null
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg z-50 transition-[opacity,transform] duration-200 ease-out"
      style={{ animation: 'toastIn 200ms cubic-bezier(0.23,1,0.32,1) both' }}
    >
      {label}
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
    </div>
  )
}

// ─── Regular / Shiny question ──────────────────────────────────────────────

export function QuestionInputPanel({ onAdded }) {
  const { formats: shinyFormats, loading: shinyLoading } = useShinyFormats()

  const [questionText,   setQuestionText]   = useState('')
  const [questionAnswer, setQuestionAnswer] = useState('')
  const [isBonus, setIsBonus]               = useState(false)

  const [selectedShinyFmt, setSelectedShinyFmt] = useState(null)
  const [shinyStep,         setShinyStep]        = useState('pick')
  const [shinyQuestion,     setShinyQuestion]    = useState('')
  const [shinyAnswer,       setShinyAnswer]      = useState('')
  const [gridCols, setGridCols] = useState(4)
  const [gridRows, setGridRows] = useState(3)

  const [toast, setToast] = useState(false)
  function flashToast() { setToast(true); setTimeout(() => setToast(false), 1600) }

  const canAddQuestion = questionText.trim().length > 0 && questionAnswer.trim().length > 0
  const canAddShiny     = shinyAnswer.trim().length > 0
  const isGrid = selectedShinyFmt?.input_schema?.type === 'grid'

  async function addPlain() {
    if (!canAddQuestion) return
    await archiveQuestion({
      type:       isBonus ? 'regular' : 'regular',
      text:       questionText.trim(),
      answer:     questionAnswer.trim(),
      is_bonus:   isBonus,
      is_shiny:   false,
      show_id:    null,
      show_title: null,
      show_date:  null,
    })
    setQuestionText(''); setQuestionAnswer(''); setIsBonus(false)
    flashToast()
    onAdded?.()
  }

  async function addShiny() {
    if (!canAddShiny) return
    await archiveQuestion({
      type:              'shiny',
      text:              shinyQuestion.trim(),
      answer:            shinyAnswer.trim(),
      is_bonus:          false,
      is_shiny:          true,
      shiny_type:        selectedShinyFmt.input_schema?.type ?? null,
      shiny_format_name: selectedShinyFmt.name,
      show_id:           null,
      show_title:        null,
      show_date:         null,
    })
    setShinyQuestion(''); setShinyAnswer(''); setSelectedShinyFmt(null); setShinyStep('pick')
    flashToast()
    onAdded?.()
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* LEFT — plain question */}
      <div className="flex flex-col gap-3 border-r border-gray-100 pr-6">
        <div>
          <p className="text-sm font-semibold text-gray-800">📝 Plain question</p>
          <p className="text-xs text-gray-500 mt-0.5">Added straight to the archive — no show attached</p>
        </div>
        <textarea
          value={questionText}
          onChange={e => setQuestionText(e.target.value)}
          placeholder="Type or paste your question…"
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
        />
        <input
          type="text"
          value={questionAnswer}
          onChange={e => setQuestionAnswer(e.target.value)}
          placeholder="The answer…"
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
            disabled={!canAddQuestion}
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

      {/* RIGHT — shiny formats */}
      <div className="flex flex-col gap-3">
        {shinyStep === 'details' && selectedShinyFmt ? (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShinyStep('pick')}
                className={`text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 ${BTN}`}
              >
                ←
              </button>
              <p className="text-sm font-semibold text-gray-800">{selectedShinyFmt.icon} {selectedShinyFmt.name}</p>
            </div>

            <textarea
              value={shinyQuestion}
              onChange={e => setShinyQuestion(e.target.value)}
              placeholder="Question text (optional)…"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
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

            <input
              type="text"
              value={shinyAnswer}
              onChange={e => setShinyAnswer(e.target.value)}
              placeholder="The answer…"
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
            />

            <div className="mt-auto flex flex-col gap-1.5 pt-1">
              <button
                onClick={addShiny}
                disabled={!canAddShiny}
                className={`w-full bg-yellow-500 text-white text-sm font-semibold py-3 rounded-xl hover:bg-yellow-600 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed transition-[transform,opacity] duration-150 ease-out active:scale-[0.98]`}
              >
                Add {selectedShinyFmt.name} →
              </button>
              {!canAddShiny && <p className="text-xs text-gray-500 text-center">Add an answer to continue</p>}
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm font-semibold text-gray-800">✨ Shiny formats</p>
              <p className="text-xs text-gray-500 mt-0.5">Pick a format</p>
            </div>
            {shinyLoading ? (
              <p className="text-xs text-gray-500">Loading…</p>
            ) : shinyFormats.length === 0 ? (
              <p className="text-xs text-gray-500">No formats yet — add one via ✨ Add Shiny in the host.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 overflow-y-auto max-h-72">
                {shinyFormats.map(fmt => {
                  const mediaType = fmt.input_schema?.type
                  const isSel = selectedShinyFmt?.id === fmt.id
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setSelectedShinyFmt(isSel ? null : fmt)}
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
            {selectedShinyFmt && (
              <div className="mt-auto pt-2">
                <button
                  onClick={() => setShinyStep('details')}
                  className={`w-full bg-yellow-500 text-white text-sm font-semibold py-3 rounded-xl hover:bg-yellow-600 ${BTN} transition-[transform] duration-150 ease-out active:scale-[0.98]`}
                >
                  Add {selectedShinyFmt.name} →
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <Toast show={toast} label="Added to database" />
    </div>
  )
}

// ─── Swing Round batch ──────────────────────────────────────────────────────

export function SwingInputPanel({ onAdded }) {
  const [count, setCount]         = useState(6)
  const [started, setStarted]     = useState(false)
  const [questions, setQuestions] = useState([])
  const [toast, setToast]         = useState(false)

  function goToQuestions() {
    setQuestions(Array.from({ length: Math.max(1, count) }, () => ({ text: '', answer: '' })))
    setStarted(true)
  }

  function updateQ(i, field, val) {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: val } : q))
  }

  const nonEmpty = questions.filter(q => q.text.trim() || q.answer.trim())

  async function submit() {
    if (nonEmpty.length === 0) return
    await archiveQuestions([{
      type:           'swing',
      questions_data: nonEmpty.map(q => ({ text: q.text.trim(), answer: q.answer.trim() })),
      show_id:        null,
      show_title:     null,
      show_date:      null,
    }])
    setStarted(false); setQuestions([])
    setToast(true); setTimeout(() => setToast(false), 1600)
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
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">{count} questions — paste or type each one</p>
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
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
            />
            <input
              type="text"
              placeholder="Answer"
              value={q.answer}
              onChange={e => updateQ(i, 'answer', e.target.value)}
              className="w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] transition-[border-color,box-shadow] duration-150 ease-out"
            />
          </div>
        ))}
      </div>

      <div className="pt-2 flex flex-col gap-1.5">
        <button
          onClick={submit}
          disabled={nonEmpty.length === 0}
          className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed transition-[transform,opacity] duration-150 ease-out active:scale-[0.98]`}
        >
          Add {nonEmpty.length || count} to Database →
        </button>
        {nonEmpty.length === 0 && <p className="text-xs text-gray-500 text-center">Fill in at least one question to continue</p>}
      </div>
      <Toast show={toast} label="Added to database" />
    </div>
  )
}

// ─── Press Your Luck! themes ─────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { id: 'visual', icon: '👁️', label: 'Visual' },
  { id: 'audio',  icon: '🎵', label: 'Audio'  },
  { id: 'word',   icon: '🔤', label: 'Word'   },
]

export function PylInputPanel({ onAdded }) {
  const [started, setStarted]     = useState(false)
  const [themeCount, setThemeCount] = useState(3)
  const [themeIndex, setThemeIndex] = useState(0)
  const [collected, setCollected] = useState([])
  const [currentName, setCurrentName] = useState('')
  const [currentType, setCurrentType] = useState(null)
  const [toast, setToast] = useState(false)

  function startThemes() {
    setCollected([]); setThemeIndex(0); setCurrentName(''); setCurrentType(null); setStarted(true)
  }

  async function commitTheme() {
    const theme = { name: currentName.trim(), type: currentType }
    const next  = [...collected, theme]
    if (next.length < themeCount) {
      setCollected(next); setThemeIndex(i => i + 1); setCurrentName(''); setCurrentType(null)
      return
    }
    await archiveQuestions(next.map(t => ({
      type:       'pyl',
      text:       t.name,
      answer:     t.type,
      show_id:    null,
      show_title: null,
      show_date:  null,
    })))
    setStarted(false)
    setToast(true); setTimeout(() => setToast(false), 1600)
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
    <div className="flex flex-col gap-5 items-center max-w-xs mx-auto">
      <div className="w-full flex items-center gap-2">
        <button
          onClick={() => {
            if (themeIndex === 0) { setStarted(false); return }
            setCollected(prev => prev.slice(0, -1))
            setThemeIndex(i => i - 1)
            const prev = collected[collected.length - 1]
            setCurrentName(prev?.name ?? ''); setCurrentType(prev?.type ?? null)
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
          disabled={!canNext}
          className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed transition-[transform,opacity] duration-150 ease-out active:scale-[0.98]`}
        >
          {isLast ? `Add ${themeCount} to Database →` : 'Next Theme →'}
        </button>
        {!canNext && <p className="text-xs text-gray-500 text-center">{!currentName.trim() ? 'Enter a theme name' : 'Select a type'}</p>}
      </div>
      <Toast show={toast} label="Added to database" />
    </div>
  )
}
