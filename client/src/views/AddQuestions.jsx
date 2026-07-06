import { useState } from 'react'
import HostPinGate from '../components/host/HostPinGate.jsx'
import { INPUT_TILES, QuestionInputPanel, SwingInputPanel, PylInputPanel, useCategorySuggestions } from '../components/host/DatabaseAddPanels.jsx'

export default function AddQuestions() {
  const [activeInput, setActiveInput] = useState(null) // 'question' | 'swing' | 'pyl' | null
  const activeTile = INPUT_TILES.find(t => t.id === activeInput)

  // Sticky batch fields (category / round type / played-on) live HERE, not in
  // the panels, so they survive both saves and panel switches — batch entry
  // sets them once and every save carries them until changed.
  const [sticky, setSticky] = useState({ category: '', roundType: null, playedOn: '' })
  const { categories, addCategory } = useCategorySuggestions()
  const panelProps = { sticky, setSticky, categories, addCategory }

  return (
    <HostPinGate>
      <div className="min-h-screen bg-gray-50 font-sans">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Add Questions</h1>
              <p className="text-xs text-gray-500 mt-0.5">Upload trivia from past shows without attaching it to a show</p>
            </div>
            <a
              href="/questions"
              className="text-xs text-gray-500 transition-colors duration-150 ease-out hover:text-gray-700"
            >
              ← Back to archive
            </a>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-8">
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
                    {activeTile?.icon} {activeTile?.name}
                  </h2>
                </div>
                {activeInput === 'question' && <QuestionInputPanel onAdded={() => {}} {...panelProps} />}
                {activeInput === 'swing'    && <SwingInputPanel onAdded={() => {}} {...panelProps} />}
                {activeInput === 'pyl'      && <PylInputPanel onAdded={() => {}} {...panelProps} />}
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
