import { useState } from 'react'
import { sortedSlides } from '../../hooks/useShow.js'
import { JUKEBOX_LIBRARIES } from '../../lib/jukeboxLibraries.js'
import { SHINY_FORMATS } from '../../lib/shinyFormatDictionary.js'

const TYPE_CARDS = [
  { type: 'title',             icon: '🎬', name: 'State of the Union', desc: 'Opening address to the crowd' },
  { type: 'round-intro',       icon: '🥊', name: 'Round Intro',         desc: 'Dramatic round opener' },
  { type: 'question',          icon: '❓', name: 'Question',            desc: 'Regular or shiny question' },
  { type: 'grading-break',     icon: '⏸️', name: 'Grading Break',       desc: 'While Ben grades papers' },
  { type: 'scoreboard-reveal', icon: '🏆', name: 'Scoreboard',          desc: 'Reveal the standings' },
  { type: 'custom',            icon: '✏️', name: 'Custom',              desc: 'Freeform slide' },
]

const NEEDS_ROUND = new Set(['round-intro', 'swing-round-intro', 'question', 'grading-break', 'pixelate-series', 'multi-question', 'pyl-reveal'])

const MEDIA_LABEL = { image: 'img', audio: 'audio', text: 'text' }

export default function AddSlideWizard({ show, onAddSlide, initialData = {} }) {
  const hasPresetType = !!initialData.type
  const [step, setStep] = useState(hasPresetType ? 'details' : 'type')
  const [type, setType] = useState(initialData.type ?? null)
  const [roundId, setRoundId] = useState(initialData.roundId ?? null)
  const [questionText, setQuestionText] = useState('')
  const [roundTitle, setRoundTitle] = useState('')
  const [jukeboxLib, setJukeboxLib] = useState('random')

  const sorted = sortedSlides(show)
  const typeCard = TYPE_CARDS.find(c => c.type === type)

  function pickType(t) {
    setType(t)
    setStep(t === 'question' ? 'question-split' : 'details')
  }

  function goBack() {
    if (hasPresetType) return
    setType(null)
    setQuestionText('')
    setStep('type')
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
      data = {
        questionNumber: qNum,
        questionLabel: `Q${qNum}`,
        questionMode: 'regular',
        isShiny: false,
        text: questionText.trim(),
        mediaSlots: [],
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
  const canAddQuestion = !!roundId && questionText.trim().length > 0

  return (
    <div className="h-full flex flex-col items-center justify-start px-8 pt-[15dvh] pb-6 overflow-y-auto">
      <div className={`w-full ${step === 'question-split' ? 'max-w-5xl' : 'max-w-2xl'}`}>

        {/* Back nav row */}
        {step !== 'type' && !hasPresetType && (
          <div className="flex items-center mb-5">
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              ← Back
            </button>
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

        {/* ── Question: split screen ── */}
        {step === 'question-split' && (
          <div className="grid grid-cols-2 gap-8">

            {/* LEFT — plain question */}
            <div className="flex flex-col gap-4 pr-8 border-r border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-gray-800 mb-0.5">📝 Plain question</h2>
                <p className="text-xs text-gray-400">Text question added directly to this round</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Question text</label>
                <textarea
                  value={questionText}
                  onChange={e => setQuestionText(e.target.value)}
                  onPaste={e => {
                    e.preventDefault()
                    const plain = e.clipboardData.getData('text/plain')
                    const el = e.target
                    const start = el.selectionStart ?? questionText.length
                    const end = el.selectionEnd ?? questionText.length
                    const next = questionText.slice(0, start) + plain + questionText.slice(end)
                    setQuestionText(next)
                    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + plain.length })
                  }}
                  placeholder="Type or paste your question…"
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                />
              </div>
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
              <button
                onClick={handleCreate}
                disabled={!canAddQuestion}
                className="w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add question →
              </button>
            </div>

            {/* RIGHT — shiny formats, display only */}
            <div className="flex flex-col gap-2 pl-2">
              <div className="mb-1">
                <h2 className="text-base font-semibold text-gray-800 mb-0.5">✨ Shiny formats</h2>
                <p className="text-xs text-gray-400">Special formats — coming soon</p>
              </div>
              {SHINY_FORMATS.map(fmt => (
                <div
                  key={fmt.id}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <span className="text-lg leading-none mt-0.5 shrink-0">{fmt.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-gray-600">{fmt.name}</span>
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-400 leading-none">soon</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{fmt.blurb}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1 mt-0.5">
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 leading-none">
                      {MEDIA_LABEL[fmt.media] ?? fmt.media}
                    </span>
                    <span className="text-[9px] text-gray-400 leading-none">
                      {fmt.count === 'ask' ? '×?' : `×${fmt.count}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* ── Details + create ── */}
        {step === 'details' && (
          <div className="flex flex-col gap-5 max-w-sm mx-auto">
            {/* Icon + name confirmation */}
            <div className="flex flex-col items-center gap-2 pb-1">
              <span className="text-5xl leading-none">{typeCard?.icon}</span>
              <p className="text-lg font-semibold text-gray-800 text-center">{typeCard?.name}</p>
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
