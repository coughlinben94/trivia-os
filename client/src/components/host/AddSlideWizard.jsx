import { useState } from 'react'
import { useShinyFormats } from '../../hooks/useShinyFormats.js'
import { sortedSlides } from '../../hooks/useShow.js'
import { JUKEBOX_LIBRARIES } from '../../lib/jukeboxLibraries.js'

const TYPE_CARDS = [
  { type: 'title',             icon: '🎬', name: 'State of the Union', desc: 'Opening address to the crowd' },
  { type: 'round-intro',       icon: '🥊', name: 'Round Intro',         desc: 'Dramatic round opener' },
  { type: 'question',          icon: '❓', name: 'Question',            desc: 'Regular or shiny question' },
  { type: 'grading-break',     icon: '⏸️', name: 'Grading Break',       desc: 'While Ben grades papers' },
  { type: 'scoreboard-reveal', icon: '🏆', name: 'Scoreboard',          desc: 'Reveal the standings' },
  { type: 'custom',            icon: '✏️', name: 'Custom',              desc: 'Freeform slide' },
]

const NEEDS_ROUND = new Set(['round-intro', 'swing-round-intro', 'question', 'grading-break', 'pixelate-series', 'multi-question', 'pyl-reveal'])

export default function AddSlideWizard({ show, onAddSlide, initialData = {} }) {
  const hasPresetType = !!initialData.type
  const [step, setStep] = useState(hasPresetType ? 'details' : 'type')
  const [type, setType] = useState(initialData.type ?? null)
  const [roundId, setRoundId] = useState(initialData.roundId ?? null)
  const [questionMode, setQuestionMode] = useState(null)
  const [selectedFormat, setSelectedFormat] = useState(null)
  const [roundTitle, setRoundTitle] = useState('')
  const [jukeboxLib, setJukeboxLib] = useState('random')
  const { formats, loading: formatsLoading } = useShinyFormats()

  const sorted = sortedSlides(show)
  const typeCard = TYPE_CARDS.find(c => c.type === type)

  function pickType(t) {
    setType(t)
    setStep(t === 'question' ? 'question-mode' : 'details')
  }

  function pickQuestionMode(qm) {
    setQuestionMode(qm)
    setStep(qm === 'shiny' ? 'format' : 'details')
  }

  function pickFormat(fmt) {
    setSelectedFormat(fmt)
    setStep('details')
  }

  function goBack() {
    if (hasPresetType) return
    if (step === 'details') {
      if (questionMode === 'shiny') { setStep('format'); return }
      if (type === 'question') { setStep('question-mode'); return }
      setType(null); setStep('type')
    } else if (step === 'format') {
      setStep('question-mode')
    } else if (step === 'question-mode') {
      setType(null); setStep('type')
    }
  }

  async function handleCreate() {
    const roundSlides = sorted.filter(s => s.roundId === roundId)
    const qSlides = roundSlides.filter(s => s.type === 'question' || s.type === 'pixelate-series')
    const qNum = qSlides.length + 1
    const roundObj = show.rounds.find(r => r.id === roundId)
    const rIdx = show.rounds.findIndex(r => r.id === roundId)
    let data = {}

    if (type === 'title') {
      data = { title: 'Baynes Apple Valley', subtitle: 'Trivia Night' }
    } else if (type === 'round-intro') {
      data = {
        roundNumber: rIdx >= 0 ? rIdx + 1 : 1,
        roundTitle: roundTitle || roundObj?.title || '',
        subtitle: '',
        hostPhotoUrl: null,
      }
    } else if (type === 'question') {
      if (questionMode === 'shiny') {
        data = {
          questionNumber: qNum,
          questionLabel: `Q${qNum}`,
          questionMode: 'shiny',
          isShiny: true,
          shinyType: selectedFormat?.input_schema?.type ?? 'visual',
          shinyFormatId: selectedFormat?.id,
          shinyFormatName: selectedFormat?.name,
          shinyFormatIcon: selectedFormat?.icon,
          shinyInputSchema: selectedFormat?.input_schema,
          text: '',
          mediaSlots: [],
        }
      } else {
        data = {
          questionNumber: qNum,
          questionLabel: `Q${qNum}`,
          questionMode: 'regular',
          isShiny: false,
          text: '',
          mediaSlots: [],
        }
      }
    } else if (type === 'grading-break') {
      data = {
        message: "Now, please sit back, relax, and enjoy each other's company as Ben grades papers 😊",
        backLinkSlideId: null,
        jukeboxLib: jukeboxLib,
      }
    } else if (type === 'scoreboard-reveal') {
      data = { afterRound: null, title: '' }
    } else if (type === 'custom') {
      data = { title: '', body: '', mediaUrl: null, mediaType: null }
    }

    await onAddSlide({ type, roundId: roundId || null, order: sorted.length, data })
  }

  const needsRound = NEEDS_ROUND.has(type)
  const canCreate = !(needsRound && !roundId)

  const totalSteps = type === 'question'
    ? (questionMode === 'shiny' ? 4 : 3)
    : type ? 2 : 1
  const currentStepNum = step === 'type' ? 1 : step === 'question-mode' ? 2 : step === 'format' ? 3 : totalSteps

  return (
    <div className="h-full flex flex-col items-center justify-start px-8 pt-[15dvh] pb-6 overflow-y-auto">
      <div className="w-full max-w-2xl">

        {/* Back + step indicator row */}
        {step !== 'type' && !hasPresetType && (
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              ← Back
            </button>
            <span className="text-xs text-gray-400">Step {currentStepNum} of {totalSteps}</span>
          </div>
        )}

        {/* ── Step 1: Type picker ── */}
        {step === 'type' && (
          <>
            <h2 className="text-xl font-semibold text-gray-800 mb-1 text-center">Add a slide</h2>
            <p className="text-sm text-gray-400 text-center mb-8">What kind of slide do you want to add?</p>
            <div className="grid grid-cols-3 gap-3">
              {TYPE_CARDS.map(card => (
                <button
                  key={card.type}
                  onClick={() => pickType(card.type)}
                  className="flex flex-col gap-2 p-4 rounded-xl border border-gray-200 hover:border-[#1a6b4a] hover:bg-green-50 text-left transition-colors group"
                  style={{ minHeight: 100 }}
                >
                  <span className="text-2xl leading-none">{card.icon}</span>
                  <span className="text-sm font-semibold text-gray-800 group-hover:text-[#1a6b4a]">{card.name}</span>
                  <span className="text-xs text-gray-400 leading-snug">{card.desc}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 2: Question mode ── */}
        {step === 'question-mode' && (
          <>
            <h2 className="text-xl font-semibold text-gray-800 mb-1 text-center">What kind of question?</h2>
            <p className="text-sm text-gray-400 text-center mb-8">Regular text, or a special shiny format?</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => pickQuestionMode('regular')}
                className="flex flex-col items-center gap-3 p-8 rounded-xl border border-gray-200 hover:border-[#1a6b4a] hover:bg-green-50 transition-colors group"
                style={{ minHeight: 140 }}
              >
                <span className="text-4xl leading-none">📝</span>
                <div className="text-center">
                  <p className="text-base font-semibold text-gray-800 group-hover:text-[#1a6b4a]">Regular</p>
                  <p className="text-xs text-gray-400 mt-1">Plain text question, clean and simple</p>
                </div>
              </button>
              <button
                onClick={() => pickQuestionMode('shiny')}
                className="flex flex-col items-center gap-3 p-8 rounded-xl border border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-colors"
                style={{ minHeight: 140 }}
              >
                <span className="text-4xl leading-none">✨</span>
                <div className="text-center">
                  <p className="text-base font-semibold text-gray-800">✨ Shiny</p>
                  <p className="text-xs text-gray-400 mt-1">Image, audio, video, or puzzle format</p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Format picker ── */}
        {step === 'format' && (
          <>
            <h2 className="text-xl font-semibold text-gray-800 mb-1 text-center">Choose a format</h2>
            <p className="text-sm text-gray-400 text-center mb-8">Pick the shiny format for this question</p>
            {formatsLoading ? (
              <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
            ) : formats.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-8">No formats yet — create one via ✨ Formats in the header.</div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {formats.map(fmt => (
                  <button
                    key={fmt.id}
                    onClick={() => pickFormat(fmt)}
                    className="flex flex-col gap-2 p-4 rounded-xl border border-gray-200 hover:border-[#1a6b4a] hover:bg-green-50 text-left transition-colors group"
                    style={{ minHeight: 100 }}
                  >
                    <span className="text-2xl leading-none">{fmt.icon}</span>
                    <span className="text-sm font-semibold text-gray-800 group-hover:text-[#1a6b4a]">{fmt.name}</span>
                    {fmt.description && (
                      <span className="text-xs text-gray-400 leading-snug line-clamp-2">{fmt.description}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Step 4: Details + create ── */}
        {step === 'details' && (
          <div className="flex flex-col gap-5 max-w-sm mx-auto">
            {/* Icon + name confirmation */}
            <div className="flex flex-col items-center gap-2 pb-1">
              <span className="text-5xl leading-none">
                {type === 'question' && questionMode === 'shiny' && selectedFormat
                  ? selectedFormat.icon
                  : typeCard?.icon}
              </span>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-800">
                  {type === 'question' && questionMode === 'shiny' && selectedFormat
                    ? selectedFormat.name
                    : typeCard?.name}
                </p>
                {type === 'question' && (
                  <p className="text-sm text-gray-400 mt-0.5">
                    {questionMode === 'regular'
                      ? 'Regular question'
                      : `Shiny · ${selectedFormat?.input_schema?.type ?? 'custom'}`}
                  </p>
                )}
              </div>
            </div>

            {/* Round selector */}
            {NEEDS_ROUND.has(type) && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Round</label>
                {show.rounds.length === 0 ? (
                  <p className="text-sm text-gray-400">No rounds yet — use "+ Add Round" in the sidebar first.</p>
                ) : (
                  <select
                    value={roundId ?? ''}
                    onChange={e => setRoundId(e.target.value || null)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                  >
                    <option value="">Select a round…</option>
                    {show.rounds.map(r => (
                      <option key={r.id} value={r.id}>R{r.number} — {r.title}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Round title (only for round-intro) */}
            {type === 'round-intro' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Round Title</label>
                <input
                  type="text"
                  value={roundTitle || (show.rounds.find(r => r.id === roundId)?.title ?? '')}
                  onChange={e => setRoundTitle(e.target.value)}
                  placeholder="e.g. Round 1"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                />
              </div>
            )}

            {/* Between-rounds music (only for grading-break) */}
            {type === 'grading-break' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Between-rounds music</label>
                <select
                  value={jukeboxLib}
                  onChange={e => setJukeboxLib(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                >
                  <option value="random">🎲 Random</option>
                  {JUKEBOX_LIBRARIES.map(lib => (
                    <option key={lib.id} value={lib.id}>{lib.label}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={!canCreate}
              className="w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Slide →
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
