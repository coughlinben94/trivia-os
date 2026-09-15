import { useState } from 'react'

const BTN = 'host-button'

// 2026-08-19, Ben: "if i select shiny itll insert 6 slides of the same
// shiny, only introducing it once" — that exact mechanic (N slides, one
// shinyFormatId/seriesTheme, intro skipped on siblings) already exists in
// AddSlideWizard's shiny-question batch-add path (the 'separate' relationship
// + assetCount). Rather than duplicate that branching logic here, both style
// choices below route through the SAME 'count' step (styleChoice remembers
// which one), then the Shiny path hands off to it directly (onGoShiny, wired
// in BuildMode.jsx's handleSwingGoShiny) with the confirmed count instead of
// continuing this wizard's own text-entry flow.
//
// 2026-09-15, Ben: reported this only created 1 slide, not 6 — the Shiny
// button used to fire `onGoShiny(activeRoundId)` straight from the style
// screen, skipping 'count' entirely, so no count ever reached the shiny
// wizard. Then, after wiring count through silently (default 6, no
// confirmation), Ben: "it should just ask me how many slides i want to
// add" — so Shiny now visits 'count' same as Text-based, instead of
// skipping it. BuildMode.jsx's handleSwingGoShiny seeds AddSlideWizard's
// assetCount + relationship('separate') from the confirmed count. Formats
// in FIXED_SHAPE_KINDS (matching/wager/order/choice/hues-cues/elimination/
// race — shinyWizardKinds.jsx) still create exactly 1 blank slide
// regardless — a separate, deliberate design constraint this does not touch.
export default function SwingRoundWizard({ activeRoundId, onAdd, onGoShiny, onClose }) {
  const [step, setStep] = useState('style')
  const [styleChoice, setStyleChoice] = useState(null) // 'text' | 'shiny'
  const [count, setCount] = useState(6)
  const [questions, setQuestions] = useState([])

  function pickStyle(choice) {
    setStyleChoice(choice)
    setStep('count')
  }

  function goToQuestions() {
    const n = Math.max(1, count)
    setQuestions(Array.from({ length: n }, () => ({ text: '', answer: '' })))
    setStep('questions')
  }

  function confirmCount() {
    if (styleChoice === 'shiny') {
      onGoShiny(activeRoundId, Math.max(1, count))
    } else {
      goToQuestions()
    }
  }

  function updateQ(i, field, val) {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: val } : q))
  }

  const nonEmpty = questions.filter(q => q.text.trim() || q.answer.trim())

  return (
    <div className={`bg-white rounded-2xl flex flex-col overflow-hidden shadow-2xl max-h-[90vh] mx-auto ${step === 'questions' ? 'w-full max-w-2xl' : 'w-full max-w-sm'}`}>

      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          {(step === 'count' || step === 'questions') && (
            <button
              onClick={() => setStep(step === 'questions' ? 'count' : 'style')}
              className={`text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 ${BTN}`}
            >
              ←
            </button>
          )}
          <h2 className="text-base font-semibold text-gray-900">🎷 Swing Round</h2>
        </div>
        <button
          onClick={onClose}
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-lg ${BTN}`}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {step === 'style' ? (
          <div className="flex flex-col gap-3 items-center">
            <p className="text-xs font-medium text-gray-500 text-center">How should these questions look?</p>
            <button
              onClick={() => pickStyle('text')}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-[#1a6b4a] text-left transition-colors ${BTN}`}
            >
              <span className="text-2xl">📝</span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">Text-based</span>
                <span className="block text-xs text-gray-500">Plain question + answer, typed right here</span>
              </span>
            </button>
            <button
              onClick={() => pickStyle('shiny')}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-[#1a6b4a] text-left transition-colors ${BTN}`}
            >
              <span className="text-2xl">✨</span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">Shiny format</span>
                <span className="block text-xs text-gray-500">Pick a shiny style — one intro, then fill in each slide after</span>
              </span>
            </button>
          </div>
        ) : step === 'count' ? (
          <div className="flex flex-col gap-5 items-center">
            <div className="w-full flex flex-col items-center gap-1.5">
              <label className="text-xs font-medium text-gray-500">How many questions?</label>
              <input
                autoFocus
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                onKeyDown={e => { if (e.key === 'Enter') confirmCount() }}
                className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-900 text-center focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            {styleChoice === 'shiny' && (
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-center">
                Pick a shiny format next, then {count} blank slides get created — fill each in from the sidebar after.
              </p>
            )}
            {!activeRoundId && (
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                This will create a new Swing Round.
              </p>
            )}
            <button
              onClick={confirmCount}
              className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN}`}
            >
              Next →
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
              {count} questions — paste or type each one
            </p>

            {/* Column headers */}
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
                onClick={() => onAdd(questions, activeRoundId)}
                disabled={nonEmpty.length === 0}
                className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Add {nonEmpty.length || count} Slides →
              </button>
              {nonEmpty.length === 0 && (
                <p className="text-xs text-gray-400 text-center">Fill in at least one question to continue</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
