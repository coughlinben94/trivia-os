import { useState, useEffect } from 'react'
import { sortedSlides } from '../../hooks/useShow.js'
import { JUKEBOX_LIBRARIES } from '../../lib/jukeboxLibraries.js'
import { fetchJukeboxLibraries } from '../../lib/jukeboxSupabase.js'
import { archiveQuestion } from '../../lib/archiveQuestion.js'

export const TYPE_CARDS = [
  { type: 'title',         icon: '🇺🇸', name: 'State of the Union', desc: 'Opening address to the crowd' },
  { type: 'round-intro',   icon: '🎬', name: 'Round Intro',         desc: 'Dramatic round opener' },
  { type: 'question',      icon: '❓', name: 'Question',            desc: 'Regular or shiny question' },
  { type: 'grading-break',  icon: '⏸️', name: 'Grading Break',    desc: 'While Ben grades papers' },
  { type: 'winner-reveal',  icon: '🥇', name: 'Winner Reveal',    desc: 'Drum roll → winner + confetti' },
  { type: 'custom',         icon: '✏️', name: 'Custom',           desc: 'Freeform slide' },
]

const NEEDS_ROUND = new Set(['swing-round-intro', 'question', 'grading-break', 'pixelate-series', 'multi-question', 'pyl-reveal'])

const MEDIA_DOT = { image: 'bg-green-400', audio: 'bg-blue-400', text: 'bg-amber-400', video: 'bg-purple-400', list: 'bg-orange-400' }

const BTN = 'host-button'

// Editable: add a fundraiser type by adding one object here
export const ROUND_TYPES = [
  { id: 'normal', label: 'Normal Round',    needsNumber: true,  titleTemplate: 'Round {n}' },
  { id: 'swing',  label: 'Swing Round',     needsNumber: false, title: 'Swing Round' },
  { id: 'pyl',    label: 'Press Your Luck!', needsNumber: false, title: 'Press Your Luck!' },
]

export default function AddSlideWizard({ show, onAddSlide, onClose, onTypeChange, initialData = {}, shinyFormats, shinyLoading }) {
  const [type, setType] = useState(initialData.type ?? null)
  const typeCard = TYPE_CARDS.find(c => c.type === type)

  // Shared
  const [roundId, setRoundId] = useState(initialData.roundId ?? null)

  // Question (plain)
  const [questionText,   setQuestionText]   = useState('')
  const [questionAnswer, setQuestionAnswer] = useState('')
  const [isBonus, setIsBonus]               = useState(false)

  // Question (shiny)
  const [selectedShinyFmt, setSelectedShinyFmt] = useState(null)
  const [shinyStep,         setShinyStep]        = useState('pick') // 'pick' | 'details'
  const [shinyQuestion,     setShinyQuestion]    = useState('')
  const [shinyAnswer,       setShinyAnswer]      = useState('')

  // Round-intro — pre-filled from AddRoundWizard or from round filter; also derived from selected round
  const _preRound = initialData.roundId ? show.rounds.find(r => r.id === initialData.roundId) : null
  const [roundType,     setRoundType]     = useState(initialData.roundType   ?? _preRound?.roundType ?? 'normal')
  const [roundNumber,   setRoundNumber]   = useState(initialData.roundNumber ?? _preRound?.roundNumber ?? _preRound?.number ?? 1)
  const [roundSubtitle, setRoundSubtitle] = useState(initialData.roundSubtitle ?? '')

  // Grading-break
  const [jukeboxLib, setJukeboxLib]   = useState('random')
  const [jukeboxLibs, setJukeboxLibs] = useState(JUKEBOX_LIBRARIES)

  useEffect(() => {
    let alive = true
    fetchJukeboxLibraries().then(libs => { if (alive && libs) setJukeboxLibs(libs) })
    return () => { alive = false }
  }, [])

  const sorted = sortedSlides(show)

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
      if (selectedShinyFmt && shinyStep === 'details') {
        data = {
          questionNumber:   qNum,
          questionLabel:    `Q${qNum}`,
          questionMode:     'shiny',
          isShiny:          true,
          shinyFormatId:    selectedShinyFmt.id,
          shinyFormatName:  selectedShinyFmt.name,
          shinyFormatIcon:  selectedShinyFmt.icon,
          shinyInputSchema: selectedShinyFmt.input_schema ?? null,
          shinyType:        selectedShinyFmt.input_schema?.type ?? null,
          text:             shinyQuestion.trim(),
          answer:           shinyAnswer.trim(),
          mediaSlots:       [],
        }
      } else {
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

    // Insert right after this round's last existing slide (not the absolute end of
    // the show) — otherwise a slide added to an earlier round lands after Winner
    // Reveal/later rounds, splitting the round into two non-contiguous sidebar groups.
    const afterSlideId = roundSlides.length > 0
      ? roundSlides[roundSlides.length - 1].id
      : (sorted.length > 0 ? sorted[sorted.length - 1].id : null)
    await onAddSlide({ type, roundId: roundId ?? null, afterSlideId, data })

    if (type === 'question') {
      const isShiny = !!data.isShiny
      archiveQuestion({
        type:       isShiny ? 'shiny' : (isBonus ? 'regular' : 'regular'),
        text:       isShiny ? data.text : questionText.trim(),
        answer:     isShiny ? data.answer : questionAnswer.trim(),
        is_bonus:   isBonus,
        is_shiny:   isShiny,
        shiny_type: isShiny ? (selectedShinyFmt?.media_type ?? null) : null,
        show_id:    show?.id ?? null,
        show_title: show?.title ?? null,
        show_date:  show?.date ?? null,
      })
    }
  }

  const needsRound     = NEEDS_ROUND.has(type)
  const canCreate      = !(needsRound && !roundId) && (type !== 'round-intro' || (roundNumValid && !!roundId))
  const canAddQuestion = !!roundId && questionText.trim().length > 0 && questionAnswer.trim().length > 0
  const canAddShiny    = !!roundId && shinyAnswer.trim().length > 0
  const isQuestion     = type === 'question'
  const isShinyDetails = isQuestion && shinyStep === 'details' && !!selectedShinyFmt


  // ── Type picker (when opened without a pre-selected type, e.g. from round view) ──
  if (!type) {
    return (
      <div className="bg-white rounded-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Add a slide</h2>
          <button
            onClick={onClose}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-lg ${BTN}`}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-wrap gap-3">
            {TYPE_CARDS.filter(card => !(initialData.roundId && card.type === 'title')).map(card => (
              <button
                key={card.type}
                onClick={() => { setType(card.type); onTypeChange?.(card.type) }}
                className={`w-[calc(50%-6px)] flex flex-col gap-2 p-4 rounded-xl border-2 border-gray-100 hover:border-gray-300 bg-white hover:bg-gray-50 text-left transition-colors ${BTN}`}
              >
                <span className="text-2xl leading-none">{card.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{card.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{card.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          {isShinyDetails ? (
            <button
              onClick={() => setShinyStep('pick')}
              className={`text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 ${BTN}`}
            >
              ←
            </button>
          ) : !initialData.type && (
            <button
              onClick={() => setType(null)}
              className={`text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 ${BTN}`}
            >
              ←
            </button>
          )}
          <h2 className="text-base font-semibold text-gray-900">
            {isShinyDetails
              ? <>{selectedShinyFmt.icon} {selectedShinyFmt.name}</>
              : <><span className="mr-2">{typeCard?.icon}</span>{typeCard?.name}</>
            }
          </h2>
        </div>
        <button
          onClick={onClose}
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-lg ${BTN}`}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">

        {isShinyDetails ? (
          /* ── SHINY STEP 2: text + answer form ── */
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs text-gray-400">{selectedShinyFmt.blurb}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Round</label>
              {show.rounds.length === 0 ? (
                <p className="text-sm text-gray-400">No rounds yet — use "+ Add Round" first.</p>
              ) : (
                <select
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

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Question text <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={shinyQuestion}
                onChange={e => setShinyQuestion(e.target.value)}
                placeholder="e.g. What connects these four images?"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Answer</label>
              <input
                type="text"
                value={shinyAnswer}
                onChange={e => setShinyAnswer(e.target.value)}
                placeholder="The answer…"
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
              />
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={handleCreate}
                disabled={!canAddShiny}
                className={`w-full bg-yellow-500 text-white text-sm font-semibold py-3 rounded-xl hover:bg-yellow-600 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Add {selectedShinyFmt.name} →
              </button>
              {!canAddShiny && (
                <p className="text-xs text-gray-400 text-center">
                  {!roundId ? 'Select a round to continue' : 'Add an answer to continue'}
                </p>
              )}
            </div>
          </div>

        ) : isQuestion ? (
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

            {/* RIGHT — shiny format tiles (pick step) */}
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">✨ Shiny formats</p>
                <p className="text-xs text-gray-400 mt-0.5">Pick a format</p>
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
                    const isSel = selectedShinyFmt?.id === fmt.id
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setSelectedShinyFmt(isSel ? null : fmt)}
                        title={fmt.description}
                        className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-[border-color,background-color,transform] duration-[120ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
                          isSel
                            ? 'bg-yellow-50 border-yellow-400'
                            : 'bg-gray-50 border-gray-100 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-base leading-none mt-0.5 shrink-0">{fmt.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold truncate leading-tight ${isSel ? 'text-yellow-700' : 'text-gray-600'}`}>{fmt.name}</p>
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
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Add button — appears once a format is selected */}
              {selectedShinyFmt && (
                <div className="mt-auto pt-2">
                  <button
                    onClick={() => setShinyStep('details')}
                    className={`w-full bg-yellow-500 text-white text-sm font-semibold py-3 rounded-xl hover:bg-yellow-600 ${BTN}`}
                  >
                    Add {selectedShinyFmt.name} →
                  </button>
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

            {/* ── ROUND INTRO: associate round → subtitle ── */}
            {type === 'round-intro' && (
              <>
                {/* Round association — only shown when not pre-filled from AddRoundWizard */}
                {!roundId && (
                  <div>
                    <label htmlFor="add-round-assoc" className="block text-xs font-medium text-gray-500 mb-1.5">
                      Associate with round
                    </label>
                    {show.rounds.length === 0 ? (
                      <p className="text-sm text-gray-400">No rounds yet — use "+ Add Round" in the sidebar first.</p>
                    ) : (
                      <select
                        id="add-round-assoc"
                        value={roundId ?? ''}
                        onChange={e => {
                          pickRound(e.target.value)
                          const r = show.rounds.find(r => r.id === e.target.value)
                          if (r) {
                            setRoundType(r.roundType ?? 'normal')
                            setRoundNumber(r.roundNumber ?? r.number ?? 1)
                          }
                        }}
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
                  {jukeboxLibs.map(lib => (
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
