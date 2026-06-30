import { useState } from 'react'

const ROUND_TYPES = [
  { id: 'normal', icon: '🥊', label: 'Normal Round',      needsNumber: true, titleTemplate: 'Round {n}' },
  { id: 'swing',  icon: '🎷', label: 'Swing Round',       title: 'Swing Round' },
  { id: 'pyl',    icon: '🎰', label: 'Press Your Luck!',  title: 'Press Your Luck!' },
]

const BTN = 'transition duration-[120ms] ease-out active:scale-[0.97]'

export default function AddRoundWizard({ defaultRoundNumber, onAdd, onClose }) {
  const [selectedTypeId, setSelectedTypeId] = useState(null)
  const [roundNumber, setRoundNumber] = useState(defaultRoundNumber != null ? String(defaultRoundNumber) : '')
  const [subtitle, setSubtitle] = useState('')

  const type = ROUND_TYPES.find(t => t.id === selectedTypeId)

  const derivedTitle = type
    ? type.needsNumber
      ? type.titleTemplate.replace('{n}', roundNumber.trim() || '?')
      : type.title
    : ''

  const roundNum = parseInt(roundNumber, 10)
  const canAdd = !!type && (!type.needsNumber || (roundNumber.trim() && roundNum > 0))

  function handleAdd() {
    if (!canAdd) return
    onAdd({
      roundType: type.id,
      ...(type.needsNumber ? { roundNumber: roundNum } : {}),
      subtitle: subtitle.trim(),
      title: type.needsNumber
        ? type.titleTemplate.replace('{n}', roundNum)
        : type.title,
    })
  }

  return (
    <div className="bg-white rounded-2xl w-full flex flex-col overflow-hidden shadow-2xl">

      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <h2 className="text-base font-semibold text-gray-900">Add Round</h2>
        <button
          onClick={onClose}
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-lg ${BTN}`}
        >
          ✕
        </button>
      </div>

      <div className="p-6 flex flex-col gap-5">

        {/* Type picker */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Round type</p>
          <div className="flex flex-col gap-2">
            {ROUND_TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTypeId(t.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left ${BTN} ${
                  selectedTypeId === t.id
                    ? 'border-[#1a6b4a] bg-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-xl leading-none">{t.icon}</span>
                <span className={`text-sm font-semibold ${selectedTypeId === t.id ? 'text-[#1a6b4a]' : 'text-gray-700'}`}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Round number — normal only */}
        {type?.needsNumber && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Round number
            </label>
            <input
              autoFocus
              type="number"
              min={1}
              inputMode="numeric"
              value={roundNumber}
              onChange={e => setRoundNumber(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canAdd) handleAdd() }}
              placeholder="e.g. 4"
              className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
            />
          </div>
        )}

        {/* Subtitle */}
        {type && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Subtitle <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canAdd) handleAdd() }}
              placeholder="e.g. Pot Luck"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
            />
          </div>
        )}

        {/* Title preview */}
        {type && (
          <div className="text-sm text-gray-500">
            Title: <span className="font-semibold text-gray-800">{derivedTitle}</span>
          </div>
        )}

        {/* Submit */}
        <div className="flex flex-col gap-1.5 pt-1">
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Add Round →
          </button>
          {!canAdd && type?.needsNumber && (
            <p className="text-xs text-gray-400 text-center">Enter a round number to continue</p>
          )}
        </div>

      </div>
    </div>
  )
}
