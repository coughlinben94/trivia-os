import { useState } from 'react'
import { sortedSlides } from '../../hooks/useShow.js'
import { JUKEBOX_LIBRARIES } from '../../lib/jukeboxLibraries.js'
import { useShinyFormats } from '../../hooks/useShinyFormats.js'

export const TYPE_CARDS = [
  { type: 'title',         icon: '🎬', name: 'State of the Union', desc: 'Opening address to the crowd' },
  { type: 'round-intro',   icon: '🥊', name: 'Round Intro',         desc: 'Dramatic round opener' },
  { type: 'question',      icon: '❓', name: 'Question',            desc: 'Regular or shiny question' },
  { type: 'grading-break', icon: '⏸️', name: 'Grading Break',       desc: 'While Ben grades papers' },
  { type: 'custom',        icon: '✏️', name: 'Custom',              desc: 'Freeform slide' },
]

const NEEDS_ROUND = new Set(['swing-round-intro', 'question', 'grading-break', 'pixelate-series', 'multi-question', 'pyl-reveal'])

const MEDIA_DOT = { image: 'bg-green-400', audio: 'bg-blue-400', text: 'bg-amber-400', video: 'bg-purple-400', list: 'bg-orange-400' }

const BTN = 'transition duration-[120ms] ease-snap active:scale-[0.97]'

// Editable: add a fundraiser type by adding one object here
export const ROUND_TYPES = [
  { id: 'normal', label: 'Normal Round',    needsNumber: true,  titleTemplate: 'Round {n}' },
  { id: 'swing',  label: 'Swing Round',     needsNumber: false, title: 'Swing Round' },
  { id: 'pyl',    label: 'Press Your Luck!', needsNumber: false, title: 'Press Your Luck!' },
]

export default function AddSlideWizard({ show, onAddSlide, onClose, initialData = {} }) {
  const type     = initialData.type
  const typeCard = TYPE_CARDS.find(c => c.type === type)

  // Shared
  const [roundId, setRoundId] = useState(initialData.roundId ?? null)

  // Question
  const [questionText,   setQuestionText]   = useState('')
  const [questionAnswer, setQuestionAnswer] = useState('')
  const [isBonus, setIsBonus]               = useState(false)

  // Round-intro — title is derived; type/number/subtitle held in state so clearing sticks (P0#1)
  const [roundType,     setRoundType]     = useState('normal')
  const [roundNumber,   setRoundNumber]   = useState(1)
  const [roundSubtitle, setRoundSubtitle] = useState('')

  // Grading-break
  const [jukeboxLib, setJukeboxLib] = useState('random')

  const sorted = sortedSlides(show)
  const { formats: shinyFormats, loading: shinyLoading } = useShinyFormats()

  // Derived — never stored, always recomputed
  const selRoundType      = ROUND_TYPES.find(rt => rt.id === roundType) ?? ROUND_TYPES[0]
  const derivedRoundTitle = selRoundType.needsNumber
    ? selRoundType.titleTemplate.replace('{n}', roundNumber || '?')
    : selRoundType.title

  const roundNumValid = !selRoundType.needsNumber || (Number.isInteger(roundNumber) && roundNumber > 0)

  function pickRound(id) {
    setRoundId(id || null)
  }

  async function handleCreate() {
    const roundSlides = sorted.filter(s => s.roundId === roundId)
    const nonBonusQ   = roundSlides.filter(s => (s.type === 'question' || s.type === 'pixelate-series') && !s.data?.isBonus)
    const bonusQ      = roundSlides.filter(s => s.type === 'question' && s.data?.isBonus)
    const qNum = nonBonusQ.length + 1
    const bNum = bonusQ.length + 1

    let data = {}

    if (type === 'title') {
      data = { title: 'Baynes Apple Valley', subtitle: 'Trivia Night' }

    } else if (type === 'round-intro') {
      data = {
        roundNumber:  selRoundType.needsNumber ? roundNumber : undefined,
        roundTitle:   derivedRoundTitle,
        subtitle:     roundSubtitle,
        hostPhotoUrl: null,
        roundType,
      }

    } else if (type === 'question') {
      const num = isBonus ? bNum : qNum
      data = {
        questionNumber: num,
        questionLabel:  isBonus ? `B${num}` : `Q${num}`,
        questionMode:   'regular',
        isShiny:        false,
        text:           questionText.trim(),
        answer:         questionAnswer.trim(),
        mediaSlots:     [],
        ...(isBonus && { isBonus: true }),
      }

    } else if (type === 'grading-break') {
      data = {
        message:         "Now, please sit back, relax, and enjoy each other's company as Ben grades papers 😊",
        backLinkSlideId: null,
        jukeboxLib,
      }

    } else if (type === 'custom') {
      data = { title: '', body: '', mediaUrl: null, mediaType: null }
    }

    await onAddSlide({ type, roundId: roundId || null, order: sorted.length, data })
  }

  const needsRound     = NEEDS_ROUND.has(type)
  const canCreate      = !(needsRound && !roundId) && (type !== 'round-intro' || roundNumValid)
  const canAddQuestion = !!roundId && questionText.trim().length > 0 && questionAnswer.trim().length > 0
  const isQuestion     = type === 'question'


  return (
    <div className="bg-white rounded-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <h2 className="text-base font-semibold text-gray-900">
          <span className="mr-2">{typeCard?.icon}</span>{typeCard?.name}
        </h2>
        <button
          onClick={onClose}
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-lg ${BTN}`}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">

        {isQuestion ? (
          /* ── SPLIT SCREEN: plain left / shiny right ── */
          <div className="grid grid-cols-2 gap-6">

            {/* LEFT — plain question */}
            <div className="flex flex-col gap-4 border-r border-gray-100 pr-6">
              <div>
                <p className="text-sm font-semibold text-gray-800">📝 Plain question</p>
                <p className="text-xs text-gray-400 mt-0.5">Text question added to a round</p>
              </div>

              <div>
                <label htmlFor="add-question-text" className="block text-xs font-medium text-gray-500 mb-1.5">
                  Question text
                </label>
                <textarea
                  id="add-question-text"
                  value={questionText}
                  onChange={e => setQuestionText(e.target.value)}
                  onPaste={e => {
                    e.preventDefault()
                    const plain = e.clipboardData.getData('text/plain')
                    const el    = e.target
                    const start = el.selectionStart ?? questionText.length
                    const end   = el.selectionEnd   ?? questionText.length
                    const next  = questionText.slice(0, start) + plain + questionText.slice(end)
                    setQuestionText(next)
                    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + plain.length })
                  }}
                  placeholder="Type or paste your question…"
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                />
              </div>

              <div>
                <label htmlFor="add-question-answer" className="block text-xs font-medium text-gray-500 mb-1.5">
                  Answer
                </label>
                <input
                  id="add-question-answer"
                  type="text"
                  value={questionAnswer}
                  onChange={e => setQuestionAnswer(e.target.value)}
                  placeholder="The answer…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                />
              </div>

              <div>
                <label htmlFor="add-question-round" className="block text-xs font-medium text-gray-500 mb-1.5">
                  Round
                </label>
                {show.rounds.length === 0 ? (
                  <p className="text-sm text-gray-400">No rounds yet — use "+ Add Round" first.</p>
                ) : (
                  <select
                    id="add-question-round"
                    value={roundId ?? ''}
                    onChange={e => pickRound(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                  >
                    <option value="">Select a round…</option>
                    {show.rounds.map(r => (
                      <option key={r.id} value={r.id}>R{r.number} — {r.title}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Bonus checkbox */}
              <div className="flex items-center gap-2">
                <input
                  id="add-question-bonus"
                  type="checkbox"
                  checked={isBonus}
                  onChange={e => setIsBonus(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-[#1a6b4a]"
                />
                <label htmlFor="add-question-bonus" className="text-sm text-gray-700 cursor-pointer select-none">
                  Bonus question
                </label>
              </div>

              <div className="mt-auto flex flex-col gap-1.5">
                <button
                  onClick={handleCreate}
                  disabled={!canAddQuestion}
                  className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Add question →
                </button>
                {!canAddQuestion && (
                  <p className="text-xs text-gray-400 text-center">
                    {!roundId ? 'Select a round to continue' : !questionText.trim() ? 'Add question text to continue' : 'Add an answer to continue'}
                  </p>
                )}
              </div>
            </div>

            {/* RIGHT — shiny format tiles, display only */}
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">✨ Shiny formats</p>
                <p className="text-xs text-gray-400 mt-0.5">Coming soon — hover a tile for details</p>
              </div>
              {shinyLoading ? (
                <p className="text-xs text-gray-400">Loading…</p>
              ) : shinyFormats.length === 0 ? (
                <p className="text-xs text-gray-400">No formats yet — add one via ✨ Add Shiny.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {shinyFormats.map(fmt => {
                    const mediaType = fmt.input_schema?.type
                    const slots = fmt.input_schema?.slots
                    return (
                      <div
                        key={fmt.id}
                        title={fmt.description}
                        className="flex items-start gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100 cursor-default"
                      >
                        <span className="text-base leading-none mt-0.5 shrink-0">{fmt.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-600 truncate leading-tight">{fmt.name}</p>
                          {mediaType && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${MEDIA_DOT[mediaType] ?? 'bg-gray-300'}`} />
                              <span className="text-[11px] text-gray-400 leading-none">{mediaType}</span>
                            </div>
                          )}
                        </div>
                        {slots != null && (
                          <span className="text-[11px] text-gray-400 shrink-0 self-start mt-0.5">×{slots}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>

        ) : (
          /* ── DETAILS FORM: all other types ── */
          <div className="flex flex-col gap-5">

            {/* Round selector — sources from show.rounds (the real registry) */}
            {needsRound && (
              <div>
                <label htmlFor="add-round-select" className="block text-xs font-medium text-gray-500 mb-1.5">
                  {type === 'grading-break' ? 'End of which round?' : 'Round'}
                </label>
                {show.rounds.length === 0 ? (
                  <p className="text-sm text-gray-400">No rounds yet — use "+ Add Round" in the sidebar first.</p>
                ) : (
                  <select
                    id="add-round-select"
                    value={roundId ?? ''}
                    onChange={e => pickRound(e.target.value)}
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

            {/* ── ROUND INTRO: type → number → subtitle ── */}
            {type === 'round-intro' && (
              <>
                {/* Type picker */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Round type</p>
                  <div className="flex gap-1.5">
                    {ROUND_TYPES.map(rt => (
                      <button
                        key={rt.id}
                        type="button"
                        onClick={() => setRoundType(rt.id)}
                        className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold border ${BTN} ${
                          roundType === rt.id
                            ? 'bg-[#1a6b4a] text-white border-[#1a6b4a]'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a6b4a] hover:text-[#1a6b4a]'
                        }`}
                      >
                        {rt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Number — free positive int, Normal only */}
                {selRoundType.needsNumber && (
                  <div>
                    <label htmlFor="add-round-number" className="block text-xs font-medium text-gray-500 mb-1.5">
                      Round number
                    </label>
                    <input
                      id="add-round-number"
                      type="number"
                      min="1"
                      value={roundNumber}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10)
                        setRoundNumber(isNaN(v) ? '' : v)
                      }}
                      placeholder="e.g. 3"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                    />
                  </div>
                )}

                {/* Subtitle — optional punchline, fully controlled so clearing sticks */}
                <div>
                  <label htmlFor="add-round-subtitle" className="block text-xs font-medium text-gray-500 mb-1.5">
                    Subtitle <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="add-round-subtitle"
                    type="text"
                    value={roundSubtitle}
                    onChange={e => setRoundSubtitle(e.target.value)}
                    placeholder='e.g. "Fight!" or "It did not went well."'
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                  />
                </div>

                {/* Derived title preview */}
                <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Will read as</p>
                  <p className="text-sm font-semibold text-gray-800">{derivedRoundTitle}</p>
                  {roundSubtitle && (
                    <p className="text-xs text-gray-500 mt-0.5 italic">{roundSubtitle}</p>
                  )}
                </div>
              </>
            )}

            {/* ── GRADING BREAK: jukebox only ── */}
            {type === 'grading-break' && (
              <div>
                <label htmlFor="add-jukebox-lib" className="block text-xs font-medium text-gray-500 mb-1.5">
                  Between-rounds music
                </label>
                <select
                  id="add-jukebox-lib"
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

            {/* Submit */}
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={handleCreate}
                disabled={!canCreate}
                className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Add Slide →
              </button>
              {!canCreate && (
                <p className="text-xs text-gray-400 text-center">
                  {!roundId
                    ? 'Select a round to continue'
                    : 'Enter a round number to continue'}
                </p>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
