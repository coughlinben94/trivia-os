import { useState } from 'react'

const BTN = 'transition duration-[120ms] ease-out active:scale-[0.97]'

const TYPE_OPTIONS = [
  { id: 'visual', icon: '👁️', label: 'Visual' },
  { id: 'audio',  icon: '🎵', label: 'Audio'  },
  { id: 'word',   icon: '🔤', label: 'Word'   },
]

export default function PYLWizard({ activeRoundId, onAdd, onClose }) {
  const [step,         setStep]         = useState('count')
  const [themeCount,   setThemeCount]   = useState(3)
  const [themeIndex,   setThemeIndex]   = useState(0)
  const [collected,    setCollected]    = useState([])
  const [currentName,  setCurrentName]  = useState('')
  const [currentType,  setCurrentType]  = useState(null)

  function startThemes() {
    setCollected([])
    setThemeIndex(0)
    setCurrentName('')
    setCurrentType(null)
    setStep('theme')
  }

  function commitTheme() {
    const theme = { name: currentName.trim(), type: currentType }
    const next  = [...collected, theme]
    if (next.length < themeCount) {
      setCollected(next)
      setThemeIndex(i => i + 1)
      setCurrentName('')
      setCurrentType(null)
    } else {
      onAdd(next, activeRoundId)
    }
  }

  const isLast  = themeIndex === themeCount - 1
  const canNext = currentName.trim().length > 0 && currentType !== null

  return (
    <div className="bg-white rounded-2xl w-full flex flex-col overflow-hidden shadow-2xl">

      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          {step === 'theme' && themeIndex === 0 && (
            <button
              onClick={() => setStep('count')}
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

      <div className="p-6 flex flex-col gap-5">
        {step === 'count' ? (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">How many themes?</label>
              <input
                autoFocus
                type="number"
                min={1}
                max={10}
                value={themeCount}
                onChange={e => setThemeCount(Math.max(1, parseInt(e.target.value) || 1))}
                onKeyDown={e => { if (e.key === 'Enter') startThemes() }}
                className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
              />
            </div>
            {!activeRoundId && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No round selected — slides will be unassigned. Pick a round from the filter above first.
              </p>
            )}
            <button
              onClick={startThemes}
              className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN}`}
            >
              Next →
            </button>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
              Theme {themeIndex + 1} of {themeCount}
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Theme name</label>
              <input
                autoFocus
                type="text"
                placeholder="e.g. Movie Posters"
                value={currentName}
                onChange={e => setCurrentName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && canNext) commitTheme() }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
              />
            </div>

            <div>
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

            <div className="flex flex-col gap-1.5">
              <button
                onClick={commitTheme}
                disabled={!canNext}
                className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {isLast ? `Add ${themeCount} Slides →` : 'Next Theme →'}
              </button>
              {!canNext && (
                <p className="text-xs text-gray-400 text-center">
                  {!currentName.trim() ? 'Enter a theme name' : 'Select a type'}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
