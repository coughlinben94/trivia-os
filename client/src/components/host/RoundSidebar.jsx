import { useState } from 'react'
import { sortedSlides } from '../../hooks/useShow.js'

const SLIDE_TYPE_META = {
  'title':            { label: 'Title Slide',        icon: '📺', color: 'bg-gray-100 text-gray-600' },
  'round-intro':      { label: 'Round Intro',        icon: '🎬', color: 'bg-blue-50 text-blue-700' },
  'swing-round-intro':{ label: 'Swing Intro',        icon: '🎷', color: 'bg-indigo-50 text-indigo-700' },
  'question':         { label: 'Question',           icon: '❓', color: 'bg-white text-gray-700' },
  'grading-break':    { label: 'Grading Break',      icon: '⏸️', color: 'bg-yellow-50 text-yellow-700' },
  'scoreboard-reveal':{ label: 'Scoreboard',         icon: '🏆', color: 'bg-amber-50 text-amber-700' },
  'custom':           { label: 'Custom Slide',       icon: '✏️', color: 'bg-purple-50 text-purple-700' },
  'pixelate-series':  { label: 'Pixelate Series',    icon: '🎨', color: 'bg-pink-50 text-pink-700' },
  'multi-question':   { label: 'Multi-Question',     icon: '📋', color: 'bg-teal-50 text-teal-700' },
  'pyl-reveal':       { label: 'PYL Reveal',         icon: '🎰', color: 'bg-orange-50 text-orange-700' },
}

function slideLabel(slide) {
  const { data, type } = slide
  if (type === 'question' || type === 'pixelate-series') {
    const label = data.questionLabel || `Q${data.questionNumber || '?'}`
    const shinyIcon = data.isShiny ? (data.shinyType === 'audio' ? ' 🎵' : ' ✨') : ''
    return label + shinyIcon
  }
  if (type === 'round-intro' || type === 'swing-round-intro') return data.roundTitle || 'Round Intro'
  if (type === 'grading-break') return 'Grading Break'
  if (type === 'scoreboard-reveal') return data.title || 'Scoreboard'
  if (type === 'title') return data.title || 'Title'
  if (type === 'multi-question') return data.seriesTitle || 'Multi-Q'
  if (type === 'pyl-reveal') return 'PYL Reveal'
  return SLIDE_TYPE_META[type]?.label ?? type
}

const ADD_SLIDE_OPTIONS = [
  { value: 'question',          label: 'Question' },
  { value: 'question-visual',   label: '✨ Visual Question' },
  { value: 'question-audio',    label: '🎵 Audio Question' },
  { value: 'round-intro',       label: 'Round Intro' },
  { value: 'swing-round-intro', label: 'Swing Round Intro' },
  { value: 'grading-break',     label: 'Grading Break' },
  { value: 'scoreboard-reveal', label: 'Scoreboard Reveal' },
  { value: 'pixelate-series',   label: 'Pixelate Series' },
  { value: 'multi-question',    label: 'Multi-Question' },
  { value: 'pyl-reveal',        label: 'PYL Reveal' },
  { value: 'custom',            label: 'Custom' },
]

const GENERAL_SLIDE_OPTIONS = [
  { value: 'title',             label: 'Title Slide' },
  { value: 'scoreboard-reveal', label: 'Scoreboard Reveal' },
  { value: 'custom',            label: 'Custom Slide' },
]

export default function RoundSidebar({
  show,
  selectedSlideId,
  onSelectSlide,
  onAddRound,
  onUpdateRound,
  onDeleteRound,
  onAddSlide,
  onDeleteSlide,
}) {
  const [collapsedRounds, setCollapsedRounds] = useState(new Set())
  const [addingSlideFor, setAddingSlideFor] = useState(null) // roundId or 'general'
  const [renamingRound, setRenamingRound] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')

  const sorted = sortedSlides(show)

  // Build segments: groups of slides by roundId in display order
  const segments = []
  let currentRoundId = null
  for (const slide of sorted) {
    if (slide.roundId !== currentRoundId) {
      currentRoundId = slide.roundId
      if (slide.roundId) {
        const round = show.rounds.find(r => r.id === slide.roundId)
        segments.push({ type: 'round', roundId: slide.roundId, round, slides: [slide] })
      } else {
        segments.push({ type: 'general', slides: [slide] })
      }
    } else {
      segments[segments.length - 1].slides.push(slide)
    }
  }
  // Rounds with no slides yet
  for (const round of show.rounds) {
    if (!segments.some(s => s.roundId === round.id)) {
      segments.push({ type: 'round', roundId: round.id, round, slides: [] })
    }
  }

  function toggleCollapse(roundId) {
    setCollapsedRounds(prev => {
      const next = new Set(prev)
      next.has(roundId) ? next.delete(roundId) : next.add(roundId)
      return next
    })
  }

  async function handleAddSlide(typeKey, roundId) {
    let type = typeKey
    let extraData = {}
    if (typeKey === 'question-visual') { type = 'question'; extraData = { isShiny: true, shinyType: 'visual' } }
    if (typeKey === 'question-audio')  { type = 'question'; extraData = { isShiny: true, shinyType: 'audio' } }

    const roundSlides = sorted.filter(s => s.roundId === roundId)
    const qSlides = roundSlides.filter(s => s.type === 'question' || s.type === 'pixelate-series' || s.type === 'question-audio')

    const defaults = {
      question:           { questionNumber: qSlides.length + 1, questionLabel: `Q${qSlides.length + 1}`, text: '', isShiny: false, shinyType: null, isSeries: false, seriesLabel: null, seriesTheme: null, mediaUrl: null, mediaType: null, hostPhotoUrl: null, hostPhotoPosition: null, ...extraData },
      'round-intro':      { roundNumber: show.rounds.findIndex(r => r.id === roundId) + 1, roundTitle: show.rounds.find(r => r.id === roundId)?.title || '', subtitle: '' },
      'swing-round-intro':{ roundNumber: show.rounds.findIndex(r => r.id === roundId) + 1, roundTitle: show.rounds.find(r => r.id === roundId)?.title || '', subtitle: '', themeDescription: '' },
      'grading-break':    { message: "Now, please sit back, relax, and enjoy each other's company as Ben grades papers 😊", backLinkSlideId: null },
      'scoreboard-reveal':{ afterRound: null, title: '' },
      'title':            { title: 'Baynes Apple Valley', subtitle: 'Trivia Night' },
      'custom':           { title: '', body: '', mediaUrl: null, mediaType: null },
      'pixelate-series':  { questionNumber: qSlides.length + 1, questionLabel: `Q${qSlides.length + 1}`, text: '', stages: [{ mediaUrl: null, mediaType: null }, { mediaUrl: null, mediaType: null }, { mediaUrl: null, mediaType: null }] },
      'multi-question':   { seriesTitle: '', questions: [{ text: '' }, { text: '' }, { text: '' }] },
      'pyl-reveal':       { stages: [{ text: '', points: 40, revealed: false }, { text: '', points: 20, revealed: false }] },
    }

    const newSlide = await onAddSlide({
      type,
      roundId: roundId || null,
      order: sorted.length,
      data: defaults[type] || {},
    })
    if (newSlide) onSelectSlide(newSlide.id)
    setAddingSlideFor(null)
  }

  function startRename(round) {
    setRenamingRound(round.id)
    setRenameDraft(round.title)
  }

  function commitRename(round) {
    if (renameDraft.trim() && renameDraft !== round.title) {
      onUpdateRound(round.id, { title: renameDraft.trim() })
    }
    setRenamingRound(null)
  }

  return (
    <aside className="w-56 bg-gray-50 border-r border-gray-200 flex flex-col overflow-hidden shrink-0">
      <div className="flex-1 overflow-y-auto">
        {/* General slides (no round) — before first round */}
        {segments.filter(s => s.type === 'general').length === 0 && (
          <div className="px-3 pt-3">
            <AddSlideButton
              label="+ Add show slide"
              options={GENERAL_SLIDE_OPTIONS}
              isOpen={addingSlideFor === 'general'}
              onOpen={() => setAddingSlideFor('general')}
              onClose={() => setAddingSlideFor(null)}
              onSelect={type => handleAddSlide(type, null)}
            />
          </div>
        )}

        {segments.map((seg, i) => {
          if (seg.type === 'general') {
            return (
              <div key={`general-${i}`} className="px-2 py-1">
                {seg.slides.map(slide => (
                  <SlideRow
                    key={slide.id}
                    slide={slide}
                    selected={slide.id === selectedSlideId}
                    onSelect={() => onSelectSlide(slide.id)}
                    onDelete={() => onDeleteSlide(slide.id)}
                  />
                ))}
                <div className="px-1 mt-1">
                  <AddSlideButton
                    label="+ Add show slide"
                    options={GENERAL_SLIDE_OPTIONS}
                    isOpen={addingSlideFor === `general-${i}`}
                    onOpen={() => setAddingSlideFor(`general-${i}`)}
                    onClose={() => setAddingSlideFor(null)}
                    onSelect={type => handleAddSlide(type, null)}
                  />
                </div>
              </div>
            )
          }

          const { round, slides } = seg
          const collapsed = collapsedRounds.has(round.id)

          return (
            <div key={round.id} className="border-t border-gray-200 first:border-t-0">
              {/* Round header */}
              <div className="flex items-center gap-1 px-2 py-1.5 group">
                <button
                  onClick={() => toggleCollapse(round.id)}
                  className="text-gray-400 hover:text-gray-600 w-4 h-4 flex items-center justify-center text-xs shrink-0"
                >
                  {collapsed ? '▶' : '▼'}
                </button>

                {renamingRound === round.id ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={e => setRenameDraft(e.target.value)}
                    onBlur={() => commitRename(round)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(round); if (e.key === 'Escape') setRenamingRound(null) }}
                    className="flex-1 text-xs font-semibold text-gray-700 bg-transparent border-b border-baynes-forest outline-none"
                  />
                ) : (
                  <button
                    onDoubleClick={() => startRename(round)}
                    className="flex-1 text-xs font-semibold text-gray-700 text-left truncate"
                    title="Double-click to rename"
                  >
                    R{round.number} · {round.title}
                  </button>
                )}

                <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100">{slides.length}</span>
                <button
                  onClick={() => { if (confirm(`Delete ${round.title}? All its slides will be removed.`)) onDeleteRound(round.id) }}
                  className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete round"
                >
                  ✕
                </button>
              </div>

              {/* Round slides */}
              {!collapsed && (
                <div className="pb-1">
                  {slides.map(slide => (
                    <SlideRow
                      key={slide.id}
                      slide={slide}
                      selected={slide.id === selectedSlideId}
                      onSelect={() => onSelectSlide(slide.id)}
                      onDelete={() => onDeleteSlide(slide.id)}
                      indent
                    />
                  ))}

                  {/* Add slide to round */}
                  <div className="px-3 mt-1">
                    <AddSlideButton
                      label="+ Add slide"
                      options={ADD_SLIDE_OPTIONS}
                      isOpen={addingSlideFor === round.id}
                      onOpen={() => setAddingSlideFor(round.id)}
                      onClose={() => setAddingSlideFor(null)}
                      onSelect={type => handleAddSlide(type, round.id)}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add round button */}
      <div className="p-3 border-t border-gray-200 shrink-0">
        <button
          onClick={onAddRound}
          className="w-full text-xs font-medium text-baynes-forest hover:text-green-800 hover:bg-green-50 py-2 rounded-lg transition-colors border border-dashed border-baynes-forest border-opacity-40 hover:border-opacity-70"
        >
          + Add Round
        </button>
      </div>
    </aside>
  )
}

function SlideRow({ slide, selected, onSelect, onDelete, indent }) {
  const meta = SLIDE_TYPE_META[slide.type] ?? { icon: '📄', color: 'bg-white text-gray-700' }
  const label = slideLabel(slide)

  return (
    <div className={`group flex items-center gap-1.5 px-2 py-1 mx-1 rounded cursor-pointer transition-colors ${
      selected ? 'bg-baynes-forest text-white' : 'hover:bg-gray-100'
    } ${indent ? 'ml-5' : ''}`}
      onClick={onSelect}
    >
      <span className="text-xs shrink-0 w-4 text-center">{meta.icon}</span>
      <span className={`text-xs flex-1 truncate font-medium ${selected ? 'text-white' : 'text-gray-700'}`}>
        {label}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className={`text-xs opacity-0 group-hover:opacity-100 shrink-0 transition-opacity ${selected ? 'text-green-200 hover:text-white' : 'text-gray-400 hover:text-red-500'}`}
        title="Delete slide"
      >
        ✕
      </button>
    </div>
  )
}

function AddSlideButton({ label, options, isOpen, onOpen, onClose, onSelect }) {
  return (
    <div className="relative">
      <button
        onClick={isOpen ? onClose : onOpen}
        className="w-full text-left text-xs text-gray-400 hover:text-baynes-forest py-1 transition-colors"
      >
        {label}
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="absolute left-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48 max-h-72 overflow-y-auto">
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => onSelect(opt.value)}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
