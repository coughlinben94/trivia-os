import { useState } from 'react'

const BTN = 'host-button'

const TYPE_OPTIONS = [
  { id: 'visual', icon: '👁️', label: 'Visual' },
  { id: 'audio',  icon: '🎵', label: 'Audio'  },
  { id: 'word',   icon: '🔤', label: 'Word'   },
]

// 2026-08-19, Ben: "same with PYL. shiny style or text style, choose thrice,
// bc three diff themes" — each theme now also picks a content style. Text
// generates real question slides right here (a mini Swing Round, once per
// theme). Shiny doesn't pick a format inline — that reuses AddSlideWizard's
// existing batch-generation flow (format → N slides, one shinyFormatId/
// seriesTheme, intro shown once) instead of duplicating its branching logic
// — BuildMode.jsx's handlePYLAdd queues one hand-off per shiny theme after
// this wizard closes.
const STYLE_OPTIONS = [
  { id: 'text',  icon: '📝', label: 'Text',  desc: 'Type questions right here' },
  { id: 'shiny', icon: '✨', label: 'Shiny', desc: "Pick a format after — you'll be prompted" },
]

const DEFAULT_Q_COUNT = 3

export default function PYLWizard({ activeRoundId, onAdd, onClose }) {
  const [step,          setStep]          = useState('count')
  const [themeCount,    setThemeCount]    = useState(3)
  const [themeIndex,    setThemeIndex]    = useState(0)
  const [collected,     setCollected]     = useState([])
  const [themeSubStep,  setThemeSubStep]  = useState('main') // 'main' | 'questions'
  const [currentName,   setCurrentName]   = useState('')
  const [currentType,   setCurrentType]   = useState(null)
  const [currentStyle,  setCurrentStyle]  = useState(null)
  const [qCount,        setQCount]        = useState(DEFAULT_Q_COUNT)
  const [questions,     setQuestions]     = useState([])

  function resetThemeFields() {
    setCurrentName('')
    setCurrentType(null)
    setCurrentStyle(null)
    setThemeSubStep('main')
    setQCount(DEFAULT_Q_COUNT)
    setQuestions([])
  }

  function startThemes() {
    setCollected([])
    setThemeIndex(0)
    resetThemeFields()
    setStep('theme')
  }

  function goToQuestionEntry() {
    setQuestions(Array.from({ length: Math.max(1, qCount) }, () => ({ text: '', answer: '' })))
    setThemeSubStep('questions')
  }

  function updateQ(i, field, val) {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: val } : q))
  }

  function commitTheme() {
    const theme = {
      name: currentName.trim(),
      type: currentType,
      style: currentStyle,
      // Only meaningful for style: 'text' — shiny themes get their real
      // content later via the AddSlideWizard hand-off, nothing to attach yet.
      questions: currentStyle === 'text' ? questions.filter(q => q.text.trim() || q.answer.trim()) : undefined,
    }
    const next = [...collected, theme]
    if (next.length < themeCount) {
      setCollected(next)
      setThemeIndex(i => i + 1)
      resetThemeFields()
    } else {
      onAdd(next, activeRoundId)
    }
  }

  const isLast = themeIndex === themeCount - 1
  const canNextMain = currentName.trim().length > 0 && currentType !== null && currentStyle !== null
  const nonEmptyQ = questions.filter(q => q.text.trim() || q.answer.trim())

  return (
    <div className={`bg-white rounded-2xl w-full flex flex-col overflow-hidden shadow-2xl max-h-[90vh] ${themeSubStep === 'questions' ? 'max-w-2xl' : 'max-w-sm'}`}>

      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          {step === 'theme' && (
            <button
              onClick={() => {
                if (themeSubStep === 'questions') {
                  setThemeSubStep('main')
                  return
                }
                if (themeIndex === 0) {
                  setStep('count')
                } else {
                  setCollected(prev => prev.slice(0, -1))
                  setThemeIndex(i => i - 1)
                  const prev = collected[collected.length - 1]
                  setCurrentName(prev?.name ?? '')
                  setCurrentType(prev?.type ?? null)
                  setCurrentStyle(prev?.style ?? null)
                  setThemeSubStep('main')
                  setQuestions(prev?.questions?.length ? prev.questions : [])
                }
              }}
              className={`text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 ${BTN}`}
            >
              ←
            </button>
          )}
          <h2 className="text-base font-semibold text-gray-900">🎰 Press Your Luck!</h2>
        </div>
        <button
          onClick={onClose}
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-lg ${BTN}`}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 items-center">
        {step === 'count' ? (
          <>
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
            {!activeRoundId && (
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                This will create a new Press Your Luck round.
              </p>
            )}
            <button
              onClick={startThemes}
              className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN}`}
            >
              Next →
            </button>
          </>
        ) : themeSubStep === 'questions' ? (
          <div className="w-full flex flex-col gap-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
              {currentName || `Theme ${themeIndex + 1}`} — {qCount} questions, paste or type each one
            </p>

            <div className="flex gap-2 items-center px-0.5">
              <span className="w-5 shrink-0" />
              <span className="flex-1 text-[11px] font-medium text-gray-400">Question</span>
              <span className="w-40 text-[11px] font-medium text-gray-400">Answer</span>
            </div>

            {questions.map((q, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="text-xs font-semibold text-gray-300 w-5 shrink-0 text-right">{i + 1}</span>
                <input
                  type="text"
                  placeholder="Question text…"
                  value={q.text}
                  onChange={e => updateQ(i, 'text', e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                />
                <input
                  type="text"
                  placeholder="Answer"
                  value={q.answer}
                  onChange={e => updateQ(i, 'answer', e.target.value)}
                  className="w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                />
              </div>
            ))}

            <div className="pt-3 flex flex-col gap-1.5">
              <button
                onClick={commitTheme}
                disabled={nonEmptyQ.length === 0}
                className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {isLast ? `Add Theme (${nonEmptyQ.length || qCount} slides) →` : `Next Theme →`}
              </button>
              {nonEmptyQ.length === 0 && (
                <p className="text-xs text-gray-400 text-center">Fill in at least one question to continue</p>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
              Theme {themeIndex + 1} of {themeCount}
            </p>

            <div className="w-full">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Theme name</label>
              <input
                autoFocus
                type="text"
                placeholder="e.g. Movie Posters"
                value={currentName}
                onChange={e => setCurrentName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
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
                    className={`flex-1 py-2.5 px-1 rounded-lg text-sm font-semibold border ${BTN} ${
                      currentType === t.id
                        ? 'bg-[#1a6b4a] text-white border-[#1a6b4a]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a6b4a] hover:text-[#1a6b4a]'
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full">
              <p className="text-xs font-medium text-gray-500 mb-1.5">Style</p>
              <div className="flex flex-col gap-1.5">
                {STYLE_OPTIONS.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCurrentStyle(s.id)}
                    className={`flex items-center gap-2.5 py-2 px-3 rounded-lg text-left border ${BTN} ${
                      currentStyle === s.id
                        ? 'bg-[#1a6b4a] border-[#1a6b4a]'
                        : 'bg-white border-gray-200 hover:border-[#1a6b4a]'
                    }`}
                  >
                    <span className="text-lg">{s.icon}</span>
                    <span>
                      <span className={`block text-sm font-semibold ${currentStyle === s.id ? 'text-white' : 'text-gray-900'}`}>{s.label}</span>
                      <span className={`block text-[11px] ${currentStyle === s.id ? 'text-white/80' : 'text-gray-500'}`}>{s.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {currentStyle === 'text' && (
              <div className="w-full flex flex-col items-center gap-1.5">
                <label className="text-xs font-medium text-gray-500">How many questions for this theme?</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={qCount}
                  onChange={e => setQCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base text-gray-900 text-center focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            )}

            {/* Progress dots */}
            {themeCount > 1 && (
              <div className="flex gap-1.5 justify-center">
                {Array.from({ length: themeCount }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i < themeIndex
                        ? 'bg-[#1a6b4a]'
                        : i === themeIndex
                          ? 'bg-[#1a6b4a] opacity-50'
                          : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
            )}

            <div className="w-full flex flex-col gap-1.5">
              <button
                onClick={() => currentStyle === 'text' ? goToQuestionEntry() : commitTheme()}
                disabled={!canNextMain}
                className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {currentStyle === 'text'
                  ? 'Next: Add Questions →'
                  : isLast ? `Add ${themeCount} Theme${themeCount > 1 ? 's' : ''} →` : 'Next Theme →'}
              </button>
              {!canNextMain && (
                <p className="text-xs text-gray-400 text-center">
                  {!currentName.trim() ? 'Enter a theme name' : currentType === null ? 'Select a type' : 'Select a style'}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
