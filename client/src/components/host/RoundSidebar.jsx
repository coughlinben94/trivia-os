import { useState } from 'react'
import { sortedSlides } from '../../hooks/useShow.js'

const SLIDE_TYPE_META = {
  'title':             { label: 'Title Slide',      icon: '📺' },
  'round-intro':       { label: 'Round Intro',       icon: '🎬' },
  'swing-round-intro': { label: 'Swing Intro',       icon: '🎷' },
  'question':          { label: 'Question',          icon: '❓' },
  'grading-break':     { label: 'Grading Break',     icon: '⏸️' },
  'scoreboard-reveal': { label: 'Scoreboard',        icon: '🏆' },
  'custom':            { label: 'Custom Slide',      icon: '✏️' },
  'pixelate-series':   { label: 'Pixelate Series',   icon: '🎨' },
  'multi-question':    { label: 'Multi-Question',    icon: '📋' },
  'pyl-reveal':        { label: 'PYL Reveal',        icon: '🎰' },
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

export default function RoundSidebar({
  show,
  selectedSlideId,
  onSelectSlide,
  onAddRound,
  onUpdateRound,
  onDeleteRound,
  onDeleteSlide,
  onReorderSlides,
  onReorderRounds,
}) {
  const [collapsedRounds, setCollapsedRounds] = useState(new Set())
  const [renamingRound, setRenamingRound] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDeleteRound, setConfirmDeleteRound] = useState(null)
  // drag state — type is 'slide' or 'round'
  const [dragged, setDragged] = useState(null)   // { id, type }
  const [dragOverId, setDragOverId] = useState(null)
  const [dragOverType, setDragOverType] = useState(null)

  if (!show) return null

  const sorted = sortedSlides(show)

  // Build segments: groups of slides by roundId in display order
  const segments = []
  let currentRoundId = Symbol('init')
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

  function clear() {
    setDragged(null)
    setDragOverId(null)
    setDragOverType(null)
  }

  function handleSlideDragStart(id) { setDragged({ id, type: 'slide' }) }
  function handleRoundDragStart(id) { setDragged({ id, type: 'round' }) }

  function handleSlideOver(e, id) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverId(id)
    setDragOverType('slide')
  }

  function handleRoundOver(e, id) {
    e.preventDefault()
    setDragOverId(id)
    setDragOverType('round')
  }

  function handleSlideDrop(e, targetId) {
    e.preventDefault()
    e.stopPropagation()
    if (!dragged) { clear(); return }

    if (dragged.type === 'slide') {
      // slide → slide: reorder individual slide
      if (dragged.id === targetId || !onReorderSlides) { clear(); return }
      const ids = sorted.map(s => s.id)
      const next = [...ids]
      next.splice(next.indexOf(dragged.id), 1)
      next.splice(next.indexOf(targetId), 0, dragged.id)
      onReorderSlides(next)
    } else if (dragged.type === 'round') {
      // round dragged onto a slide: move that round so its slides come before targetId
      if (!onReorderRounds) { clear(); return }
      const targetSlide = sorted.find(s => s.id === targetId)
      const targetRoundId = targetSlide?.roundId ?? null
      const roundIds = show.rounds.map(r => r.id)
      if (targetRoundId && dragged.id !== targetRoundId) {
        const next = roundIds.filter(id => id !== dragged.id)
        next.splice(next.indexOf(targetRoundId), 0, dragged.id)
        onReorderRounds(next)
      }
    }
    clear()
  }

  function handleRoundDrop(e, targetRoundId) {
    e.preventDefault()
    if (!dragged || dragged.type !== 'round' || !onReorderRounds) { clear(); return }
    if (dragged.id === targetRoundId) { clear(); return }
    const roundIds = show.rounds.map(r => r.id)
    const next = [...roundIds]
    next.splice(next.indexOf(dragged.id), 1)
    next.splice(next.indexOf(targetRoundId), 0, dragged.id)
    onReorderRounds(next)
    clear()
  }

  function handleDragEnd() { clear() }

  const slideProps = {
    onDragStart: handleSlideDragStart,
    onDragOver: handleSlideOver,
    onDrop: handleSlideDrop,
    onDragEnd: handleDragEnd,
  }

  return (
    <aside className="w-56 bg-gray-50 border-r border-gray-100 flex flex-col overflow-hidden shrink-0">
      <div className="flex-1 overflow-y-auto py-1">

        {segments.map((seg, i) => {
          // General (no-round) slides
          if (seg.type === 'general') {
            return (
              <div key={`general-${i}`} className="py-1">
                {seg.slides.map(slide => (
                  <SlideRow
                    key={slide.id}
                    slide={slide}
                    selected={slide.id === selectedSlideId}
                    dragging={dragged?.id === slide.id}
                    dragOver={dragOverId === slide.id && dragOverType === 'slide'}
                    onSelect={() => onSelectSlide(slide)}
                    onDelete={() => onDeleteSlide(slide.id)}
                    dragProps={slideProps}
                  />
                ))}
              </div>
            )
          }

          const { round, slides } = seg
          const collapsed = collapsedRounds.has(round.id)
          const roundDragging = dragged?.id === round.id && dragged?.type === 'round'
          const roundDragOver = dragOverId === round.id && dragOverType === 'round'

          return (
            <div
              key={round.id}
              className={`border-t border-gray-100 first:border-t-0 ${roundDragging ? 'opacity-40' : ''} ${roundDragOver ? 'border-t-2 border-t-blue-400' : ''}`}
              onDragOver={e => handleRoundOver(e, round.id)}
              onDrop={e => handleRoundDrop(e, round.id)}
            >
              {/* Round header */}
              <div
                className="flex items-center gap-1.5 px-3 py-2 group"
                draggable
                onDragStart={() => handleRoundDragStart(round.id)}
                onDragEnd={handleDragEnd}
              >
                <span
                  className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0 text-xs leading-none"
                  title="Drag to reorder round"
                  onMouseDown={e => e.stopPropagation()}
                >
                  ⠿
                </span>
                <button
                  onClick={() => toggleCollapse(round.id)}
                  className="text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center text-[9px] shrink-0 rounded hover:bg-gray-200 transition-colors"
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
                    className="flex-1 text-[13px] font-semibold text-gray-800 bg-transparent border-b-2 border-[#1a6b4a] outline-none"
                  />
                ) : (
                  <button
                    onDoubleClick={() => startRename(round)}
                    className="flex-1 text-[13px] font-semibold text-gray-700 text-left truncate"
                    title="Double-click to rename"
                  >
                    R{round.number} · {round.title}
                  </button>
                )}

                {confirmDeleteRound === round.id ? (
                  <>
                    <button
                      onClick={() => { onDeleteRound(round.id); setConfirmDeleteRound(null) }}
                      className="text-[10px] font-semibold text-red-500 px-1 hover:text-red-700 transition-colors"
                    >Yes</button>
                    <button
                      onClick={() => setConfirmDeleteRound(null)}
                      className="text-[10px] text-gray-400 px-1 hover:text-gray-600 transition-colors"
                    >No</button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 tabular-nums">{slides.length}</span>
                    <button
                      onClick={() => setConfirmDeleteRound(round.id)}
                      className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center"
                      title="Delete round"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>

              {/* Slides */}
              {!collapsed && (
                <div className="pb-1">
                  {slides.map(slide => (
                    <SlideRow
                      key={slide.id}
                      slide={slide}
                      selected={slide.id === selectedSlideId}
                      dragging={dragged?.id === slide.id}
                      dragOver={dragOverId === slide.id && dragOverType === 'slide'}
                      onSelect={() => onSelectSlide(slide)}
                      onDelete={() => onDeleteSlide(slide.id)}
                      dragProps={slideProps}
                      indent
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

      </div>

      {/* Add round */}
      <div className="p-3 border-t border-gray-100 shrink-0">
        <button
          onClick={onAddRound}
          className="w-full text-sm font-semibold text-[#1a6b4a] hover:text-green-800 hover:bg-green-50 py-2.5 rounded-lg transition-colors border-2 border-dashed border-[#1a6b4a]/30 hover:border-[#1a6b4a]/60"
        >
          + Add Round
        </button>
      </div>
    </aside>
  )
}

function SlideRow({ slide, selected, dragging, dragOver, onSelect, onDelete, dragProps, indent }) {
  const meta = SLIDE_TYPE_META[slide.type] ?? { icon: '📄', label: slide.type }
  const label = slideLabel(slide)

  return (
    <div
      draggable
      onDragStart={() => dragProps.onDragStart(slide.id)}
      onDragOver={e => dragProps.onDragOver(e, slide.id)}
      onDrop={e => dragProps.onDrop(e, slide.id)}
      onDragEnd={dragProps.onDragEnd}
      className={`group flex items-center gap-2 px-3 cursor-pointer transition-colors select-none ${
        selected
          ? 'border-l-2 border-[#1a6b4a] bg-white'
          : 'border-l-2 border-transparent hover:bg-gray-100'
      } ${indent ? 'ml-4' : ''} ${dragging ? 'opacity-40' : ''} ${dragOver ? 'border-t-2 border-t-blue-400' : ''}`}
      style={{ height: 36 }}
      onClick={onSelect}
    >
      <span
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0 text-xs leading-none"
        title="Drag to reorder"
        onMouseDown={e => e.stopPropagation()}
      >
        ⠿
      </span>
      <span className="text-sm shrink-0 leading-none">{meta.icon}</span>
      <span className={`text-sm flex-1 truncate ${selected ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
        {label}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="text-[11px] opacity-0 group-hover:opacity-100 shrink-0 transition-opacity w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-red-500"
        title="Delete slide"
      >
        ✕
      </button>
    </div>
  )
}
