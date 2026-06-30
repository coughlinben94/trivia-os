import { useState } from 'react'

const BTN = 'transition duration-[120ms] ease-out active:scale-[0.97]'

export default function SwingRoundWizard({ activeRoundId, onAdd, onClose }) {
  const [step, setStep] = useState('count')
  const [count, setCount] = useState(6)
  const [questions, setQuestions] = useState([])

  function goToQuestions() {
    const n = Math.max(1, count)
    setQuestions(Array.from({ length: n }, () => ({ text: '', answer: '' })))
    setStep('questions')
  }

  function updateQ(i, field, val) {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: val } : q))
  }

  const nonEmpty = questions.filter(q => q.text.trim() || q.answer.trim())

  return (
    <div className="bg-white rounded-2xl w-full flex flex-col overflow-hidden shadow-2xl max-h-[90vh]">

      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          {step === 'questions' && (
            <button
              onClick={() => setStep('count')}
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
        {step === 'count' ? (
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">How many questions?</label>
              <input
                autoFocus
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                onKeyDown={e => { if (e.key === 'Enter') goToQuestions() }}
                className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
              />
            </div>
            {!activeRoundId && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No round selected — slides will be unassigned. Pick a round from the filter above first.
              </p>
            )}
            <button
              onClick={goToQuestions}
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
