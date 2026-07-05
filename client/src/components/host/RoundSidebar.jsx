import { useState, useRef } from 'react'
import { sortedSlides } from '../../hooks/useShow.js'

const SLIDE_TYPE_META = {
  'title':             { label: 'Title Slide',      icon: '🇺🇸' },
  'state-of-union':    { label: 'State of the Union', icon: '🇺🇸' },
  'team-picker':       { label: 'Team Intro',          icon: '🚀' },
  'round-intro':       { label: 'Round Intro',       icon: '🎬' },
  'swing-round-intro': { label: 'Swing Intro',       icon: '🎷' },
  'question':          { label: 'Question',          icon: '❓' },
  'grading-break':     { label: 'Grading Break',     icon: '⏸️' },
  'scoreboard-reveal': { label: 'Scoreboard',        icon: '🏆' },
  'custom':            { label: 'Custom Slide',      icon: '✏️' },
  'pixelate-series':   { label: 'Pixelate Series',   icon: '🎨' },
  'multi-question':    { label: 'Multi-Question',    icon: '📋' },
  'pyl-reveal':        { label: 'PYL Reveal',        icon: '🎰' },
  'winner-reveal':     { label: 'Winner Reveal',     icon: '🥇' },
  'team-preview':      { label: 'Team List',         icon: '👥' },
}

function slideLabel(slide) {
  const { data, type } = slide
  if (type === 'question' || type === 'pixelate-series') {
    if (data.isShiny) return data.seriesTheme || data.shinyFormatName || '✨ Shiny'
    return data.questionLabel || `Q${data.questionNumber || '?'}`
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
  viewingRoundId,
  onSelectSlide,
  onSelectRound,
  onAddRound,
  onUpdateRound,
  onDeleteRound,
  onDeleteSlide,
  onReorderSlides,
  onReorderRounds,
}) {
  const [collapsedRounds, setCollapsedRounds] = useState(() => new Set(show?.rounds?.map(r => r.id) ?? []))
  const [renamingRound, setRenamingRound] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDeleteRound, setConfirmDeleteRound] = useState(null)

  // Pointer-events drag state
  const [dragged, setDragged]       = useState(null)  // { id, type }
  const [dragOverId, setDragOverId] = useState(null)
  const [dragOverType, setDragOverType] = useState(null)

  // Refs so event-handler closures always see current values
  const draggedRef  = useRef(null)
  const dragOverRef = useRef(null)
  const blocksRef   = useRef([])

  if (!show) return null

  const sorted = sortedSlides(show)

  // Build segments
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
  for (const round of show.rounds) {
    if (!segments.some(s => s.roundId === round.id)) {
      segments.push({ type: 'round', roundId: round.id, round, slides: [] })
    }
  }

  // Build flat blocks
  const blocks = []
  for (const seg of segments) {
    if (seg.type === 'general') {
      for (const slide of seg.slides) {
        blocks.push({ type: 'slide', key: slide.id, slides: [slide] })
      }
    } else {
      blocks.push({ type: 'round', key: seg.roundId, roundId: seg.roundId, slides: seg.slides })
    }
  }
  blocksRef.current = blocks

  // Direction-based: dragging down = item lands after target; dragging up = before target.
  // adjusted = targetBlockIdx handles both cases correctly — no top/bottom half needed.
  function computeNewOrder(draggedSpec, targetKey, targetType) {
    const b = blocksRef.current

    // Sentinel: drop at the very end of the list
    if (targetType === 'sentinel') {
      if (draggedSpec.type === 'slide') {
        const draggedBlock = b.find(bl => bl.slides.some(s => s.id === draggedSpec.id))
        if (!draggedBlock) return null
        const next = b.filter(bl => bl !== draggedBlock)
        next.push(draggedBlock)
        return { kind: 'slides', ids: next.flatMap(bl => bl.slides.map(s => s.id)) }
      } else {
        const next = [...b]
        const idx = next.findIndex(bl => bl.roundId === draggedSpec.id)
        if (idx === -1) return null
        const [removed] = next.splice(idx, 1)
        next.push(removed)
        return { kind: 'rounds', ids: next.filter(bl => bl.type === 'round').map(bl => bl.roundId) }
      }
    }

    if (draggedSpec.type === 'slide') {
      const draggedBlock = b.find(bl => bl.slides.some(s => s.id === draggedSpec.id))
      const targetBlock  = targetType === 'round'
        ? b.find(bl => bl.roundId === targetKey)
        : b.find(bl => bl.slides.some(s => s.id === targetKey))
      if (!draggedBlock || !targetBlock) return null

      const draggedBlockIdx = b.indexOf(draggedBlock)
      const targetBlockIdx  = b.indexOf(targetBlock)

      // Within-round reorder: both slides in the same round block
      if (draggedBlockIdx === targetBlockIdx && draggedBlock.type === 'round') {
        const slides = [...draggedBlock.slides]
        const fromIdx = slides.findIndex(s => s.id === draggedSpec.id)
        const toIdx   = slides.findIndex(s => s.id === targetKey)
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return null
        const [moved] = slides.splice(fromIdx, 1)
        slides.splice(toIdx, 0, moved)
        const ids = b.flatMap(bl =>
          bl === draggedBlock ? slides.map(s => s.id) : bl.slides.map(s => s.id)
        )
        return { kind: 'slides', ids }
      }

      if (draggedBlockIdx === targetBlockIdx) return null

      // Cross-block slide drag
      const next = [...b]
      const [removed] = next.splice(draggedBlockIdx, 1)
      next.splice(targetBlockIdx, 0, removed)
      return { kind: 'slides', ids: next.flatMap(bl => bl.slides.map(s => s.id)) }
    }

    // Round drag
    const draggedBlockIdx = b.findIndex(bl => bl.roundId === draggedSpec.id)
    const targetBlockIdx  = targetType === 'round'
      ? b.findIndex(bl => bl.roundId === targetKey)
      : b.findIndex(bl => bl.slides.some(s => s.id === targetKey))
    if (draggedBlockIdx === -1 || targetBlockIdx === -1 || draggedBlockIdx === targetBlockIdx) return null

    const next = [...b]
    const [removed] = next.splice(draggedBlockIdx, 1)
    next.splice(targetBlockIdx, 0, removed)
    return { kind: 'rounds', ids: next.filter(bl => bl.type === 'round').map(bl => bl.roundId) }
  }

  function findDropTarget(el) {
    while (el && el !== document.body) {
      if (el.dataset?.slideId) return { id: el.dataset.slideId, type: 'slide' }
      if (el.dataset?.roundId) return { id: el.dataset.roundId, type: 'round' }
      if (el.dataset?.sentinel) return { id: '__bottom__', type: 'sentinel' }
      el = el.parentElement
    }
    return null
  }

  function handleGripDown(e, id, type) {
    e.preventDefault()
    e.stopPropagation()

    draggedRef.current  = { id, type }
    dragOverRef.current = null
    setDragged({ id, type })
    setDragOverId(null)
    setDragOverType(null)

    function onMove(ev) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const target = findDropTarget(el)
      dragOverRef.current = target
      if (target) {
        setDragOverId(target.id)
        setDragOverType(target.type)
      } else {
        setDragOverId(null)
        setDragOverType(null)
      }
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)

      const d    = draggedRef.current
      const over = dragOverRef.current
      if (d && over) {
        const newOrder = computeNewOrder(d, over.id, over.type)
        if (newOrder) {
          if (newOrder.kind === 'rounds') {
            onReorderRounds?.(newOrder.ids)
          } else {
            onReorderSlides?.(newOrder.ids)
          }
        }
      }

      draggedRef.current  = null
      dragOverRef.current = null
      setDragged(null)
      setDragOverId(null)
      setDragOverType(null)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  function openRound(roundId) {
    setCollapsedRounds(() => {
      const allClosed = new Set(show.rounds.map(r => r.id))
      allClosed.delete(roundId)
      return allClosed
    })
  }

  function collapseAllRounds() {
    setCollapsedRounds(new Set(show.rounds.map(r => r.id)))
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

  // Index of the block currently being dragged — used for indicator direction
  const draggedBIdx = dragged
    ? blocks.findIndex(bl => dragged.type === 'round' ? bl.roundId === dragged.id : bl.slides.some(s => s.id === dragged.id))
    : -1

  return (
    <aside className="w-56 bg-gray-50 border-r border-gray-100 flex flex-col overflow-hidden shrink-0">
      <div className="px-3 pt-3 pb-1 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Show Order</p>
      </div>
      <div className="flex-1 overflow-y-auto py-1">

        {segments.map((seg, i) => {
          if (seg.type === 'general') {
            return (
              <div key={`general-${i}`} className={`py-1 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                {seg.slides.map((slide, slideIdx) => {
                  const tIdx = blocks.findIndex(bl => bl.slides.some(s => s.id === slide.id))
                  const over = dragOverId === slide.id && dragOverType === 'slide'
                  return (
                    <div key={slide.id} className={slideIdx > 0 ? 'border-t border-gray-100' : ''}>
                      <SlideRow
                        slide={slide}
                        selected={slide.id === selectedSlideId}
                        dragging={dragged?.id === slide.id}
                        dragBefore={over && draggedBIdx > tIdx}
                        dragAfter={over && draggedBIdx < tIdx}
                        onSelect={() => { collapseAllRounds(); onSelectSlide(slide) }}
                        onDelete={() => onDeleteSlide(slide.id)}
                        onGripDown={e => handleGripDown(e, slide.id, 'slide')}
                      />
                    </div>
                  )
                })}
              </div>
            )
          }

          const { round, slides } = seg
          if (!round) return null
          const collapsed     = collapsedRounds.has(round.id)
          const roundDragging = dragged?.id === round.id && dragged?.type === 'round'
          const rIdx          = blocks.findIndex(bl => bl.roundId === round.id)
          const rOver         = dragOverId === round.id && dragOverType === 'round'
          const roundBefore   = rOver && draggedBIdx > rIdx
          const roundAfter    = rOver && draggedBIdx < rIdx

          return (
            <div
              key={round.id}
              data-round-id={round.id}
              className={`${i > 0 ? 'border-t border-gray-100' : ''} ${roundDragging ? 'opacity-40' : ''}`}
              style={{
                ...(roundBefore && { borderTop:    '2px solid #60a5fa' }),
                ...(roundAfter  && { borderBottom: '2px solid #60a5fa' }),
              }}
            >
              {/* Round header */}
              <div
                className="flex items-center gap-1.5 px-3 py-2 group"
                style={viewingRoundId === round.id && !selectedSlideId
                  ? { background: 'linear-gradient(to right, rgba(34,197,94,0.12), transparent)', borderLeft: '2px solid #1a6b4a' }
                  : { borderLeft: '2px solid transparent' }
                }
              >
                <span
                  className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0 text-xs leading-none"
                  title="Drag to reorder round"
                  onMouseDown={e => handleGripDown(e, round.id, 'round')}
                >
                  ⠿
                </span>
                <button
                  onClick={() => openRound(round.id)}
                  className="text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center text-[9px] shrink-0 rounded hover:bg-gray-200 host-button"
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
                    onClick={() => { openRound(round.id); onSelectRound?.(round.id) }}
                    onDoubleClick={() => startRename(round)}
                    className={`flex-1 text-[13px] font-semibold text-left truncate transition-colors ${
                      viewingRoundId === round.id ? 'text-[#1a6b4a]' : 'text-gray-700 hover:text-[#1a6b4a]'
                    }`}
                    title="Click to view round — double-click to rename"
                  >
                    R{round.number} · {round.title}
                  </button>
                )}

                {confirmDeleteRound === round.id ? (
                  <>
                    <button
                      onClick={() => { onDeleteRound(round.id); setConfirmDeleteRound(null) }}
                      className="text-[10px] font-semibold text-red-500 px-1 hover:text-red-700 host-button"
                    >Yes</button>
                    <button
                      onClick={() => setConfirmDeleteRound(null)}
                      className="text-[10px] text-gray-400 px-1 hover:text-gray-600 host-button"
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
                  {slides.map((slide, slideIdx) => {
                    const tIdx = blocks.findIndex(bl => bl.slides.some(s => s.id === slide.id))
                    const over = dragOverId === slide.id && dragOverType === 'slide'
                    // Within-round: block indices are equal, compare position inside the round instead
                    const draggedSlideIdx = dragged ? slides.findIndex(s => s.id === dragged.id) : -1
                    const withinRound = draggedBIdx === tIdx && draggedSlideIdx !== -1
                    const before = over && (withinRound ? draggedSlideIdx > slideIdx : draggedBIdx > tIdx)
                    const after  = over && (withinRound ? draggedSlideIdx < slideIdx : draggedBIdx < tIdx)
                    return (
                      <SlideRow
                        key={slide.id}
                        slide={slide}
                        selected={slide.id === selectedSlideId}
                        dragging={dragged?.id === slide.id}
                        dragBefore={before}
                        dragAfter={after}
                        onSelect={() => onSelectSlide(slide)}
                        onDelete={() => onDeleteSlide(slide.id)}
                        onGripDown={e => handleGripDown(e, slide.id, 'slide')}
                        indent
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Drop zone at the very bottom — catches drags that land below all blocks */}
        <div
          data-sentinel="bottom"
          style={{ height: 32 }}
          className={dragOverType === 'sentinel' ? 'border-t-2 border-t-blue-400' : ''}
        />

      </div>

      {/* Add round */}
      <div className="p-3 border-t border-gray-100 shrink-0">
        <button
          onClick={onAddRound}
          className="w-full text-sm font-semibold text-[#1a6b4a] hover:text-green-800 hover:bg-green-50 py-2.5 rounded-lg host-button border-2 border-dashed border-[#1a6b4a]/30 hover:border-[#1a6b4a]/60"
        >
          + Add Round
        </button>
      </div>
    </aside>
  )
}

function SlideRow({ slide, selected, dragging, dragBefore, dragAfter, onSelect, onDelete, onGripDown, indent }) {
  const meta  = SLIDE_TYPE_META[slide.type] ?? { icon: '📄', label: slide.type }
  const label = slideLabel(slide)

  return (
    <div
      data-slide-id={slide.id}
      className={`group flex items-center gap-2 px-3 cursor-pointer transition-colors select-none border-l-2 ${
        selected
          ? 'border-[#1a6b4a]'
          : 'border-transparent hover:bg-gray-100'
      } ${indent ? 'ml-4' : ''} ${dragging ? 'opacity-40' : ''} ${dragBefore ? 'border-t-2 border-t-blue-400' : ''} ${dragAfter ? 'border-b-2 border-b-blue-400' : ''}`}
      style={{
        height: 36,
        ...(selected && { background: 'linear-gradient(to right, rgba(34,197,94,0.12), transparent)' }),
      }}
      onClick={onSelect}
    >
      <span
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0 text-xs leading-none"
        title="Drag to reorder"
        onMouseDown={onGripDown}
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
