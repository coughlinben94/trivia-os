import { useState } from 'react'
import HostPinGate from '../components/host/HostPinGate.jsx'
import { INPUT_TILES, QuestionInputPanel, SwingInputPanel, PylInputPanel, BulkPasteInputPanel } from '../components/host/DatabaseAddPanels.jsx'

export default function AddQuestions() {
  const [activeInput, setActiveInput] = useState(null) // 'question' | 'swing' | 'pyl' | null
  const activeTile = INPUT_TILES.find(t => t.id === activeInput)

  // Live feedback for a long entry run — the only signal a host gets during
  // marathon batch entry that saves are actually landing.
  const [sessionCount, setSessionCount] = useState(0)
  const bumpCount = () => setSessionCount(n => n + 1)

  return (
    <HostPinGate>
      <div className="min-h-screen bg-gray-50 font-sans">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Add Questions</h1>
              <p className="text-xs text-gray-500 mt-0.5">Upload trivia from past shows without attaching it to a show</p>
            </div>
            <div className="flex items-center gap-4">
              {sessionCount > 0 && (
                <span className="text-xs font-semibold text-[#1a6b4a] bg-green-50 border border-green-200 rounded-full px-3 py-1">
                  {sessionCount} saved this session
                </span>
              )}
              <a
                href="/questions"
                className="text-xs text-gray-500 transition-colors duration-150 ease-out hover:text-gray-700"
              >
                ← Back to archive
              </a>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            {activeInput ? (
              <>
                <div className="flex items-center gap-2 mb-5">
                  <button
                    onClick={() => setActiveInput(null)}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors duration-150 ease-out"
                  >
                    ← Back
                  </button>
                  <h2 className="text-sm font-semibold text-gray-800">
                    {activeTile?.icon} {activeTile?.name}
                  </h2>
                </div>
                {activeInput === 'question'       && <QuestionInputPanel onAdded={bumpCount} mode="plain" />}
                {activeInput === 'shiny-question' && <QuestionInputPanel onAdded={bumpCount} mode="shiny" />}
                {activeInput === 'swing'    && <SwingInputPanel onAdded={bumpCount} />}
                {activeInput === 'pyl'      && <PylInputPanel onAdded={bumpCount} />}
                {activeInput === 'bulk'     && <BulkPasteInputPanel onAdded={bumpCount} />}
              </>
            ) : (
              <div className="flex flex-wrap gap-3 justify-center">
                {INPUT_TILES.map(tile => (
                  <button
                    key={tile.id}
                    onClick={() => setActiveInput(tile.id)}
                    className={`w-[calc(33.333%-8px)] min-w-[180px] flex flex-col items-center justify-center gap-2 p-4 rounded-xl border text-center min-h-[120px] transition-colors duration-150 ease-out active:scale-[0.98] ${tile.gradient}`}
                  >
                    <span className="text-3xl leading-none">{tile.icon}</span>
                    <span className="text-sm font-semibold text-gray-800 leading-tight">{tile.name}</span>
                    <span className="text-xs text-gray-600 leading-snug">{tile.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </HostPinGate>
  )
}
