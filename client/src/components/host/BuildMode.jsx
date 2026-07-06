import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import HostHeader from './HostHeader.jsx'
import RoundSidebar from './RoundSidebar.jsx'
import SlideEditor from './SlideEditor.jsx'
import AddSlideWizard, { TYPE_CARDS } from './AddSlideWizard.jsx'
import AddRoundWizard from './AddRoundWizard.jsx'
import FormatLibrary from './FormatLibrary.jsx'
import TickerMessageManager from './TickerMessageManager.jsx'
import ThemePickerModal from './ThemePickerModal.jsx'
import SwingRoundWizard from './SwingRoundWizard.jsx'
import PYLWizard from './PYLWizard.jsx'
import { archiveQuestions } from '../../lib/archiveQuestion.js'
import { sortedSlides } from '../../hooks/useShow.js'
import { useShinyFormats } from '../../hooks/useShinyFormats.js'
import { EASE_OUT } from '../../lib/easings.js'

const BTN = 'host-button'

const SLIDE_ICON = {
  'title': '🇺🇸', 'state-of-union': '🇺🇸', 'round-intro': '🎬', 'swing-round-intro': '🎷',
  'question': '❓', 'grading-break': '⏸️', 'scoreboard-reveal': '🏆',
  'custom': '✏️', 'pixelate-series': '🎨', 'multi-question': '📋', 'pyl-reveal': '🎰',
  'winner-reveal': '🥇', 'team-preview': '👥', 'team-picker': '🚀',
}

function getSlideLabel(slide) {
  const { data, type } = slide
  if (type === 'question' || type === 'pixelate-series') {
    if (data.isShiny) return data.shinyFormatName || '✨ Shiny'
    return data.questionLabel || `Q${data.questionNumber || '?'}`
  }
  if (type === 'round-intro' || type === 'swing-round-intro') return data.roundTitle || 'Round Intro'
  if (type === 'grading-break') return 'Grading Break'
  if (type === 'scoreboard-reveal') return data.title || 'Scoreboard'
  if (type === 'title') return data.title || 'Title'
  if (type === 'multi-question') return data.seriesTitle || 'Multi-Q'
  if (type === 'pyl-reveal') return 'PYL Reveal'
  if (type === 'team-preview') return 'Team List'
  if (type === 'team-picker') return 'Team Intro'
  if (type === 'winner-reveal') return '🥇 Winner Reveal'
  return type
}

function getSeriesGroup(lead, allSlides) {
  if (!lead.data.isSeries) return [lead]
  const siblings = allSlides.filter(s =>
    s.id !== lead.id &&
    s.data.isSeries &&
    s.data.shinyFormatId === lead.data.shinyFormatId &&
    s.data.questionLabel === lead.data.questionLabel
  )
  return [lead, ...siblings.sort((a, b) => (a.data.slotIndex ?? 0) - (b.data.slotIndex ?? 0))]
}

function getSlidePreview(slide) {
  const { data, type } = slide
  if (type === 'question') {
    if (data.questionMode === 'shiny') return data.shinyFormatName ? `✨ ${data.shinyFormatName}` : '✨ Shiny'
    return data.text || null
  }
  if (type === 'title' || type === 'round-intro' || type === 'swing-round-intro') return data.subtitle || null
  if (type === 'custom') return data.text || null
  return null
}

const CARD_STYLE = {
  'title':          'bg-[linear-gradient(135deg,#fecaca,#f9fafb,#bfdbfe)] border-blue-200 hover:border-blue-400',
  'state-of-union': 'bg-[linear-gradient(135deg,#fecaca,#f9fafb,#bfdbfe)] border-blue-200 hover:border-blue-400',
  'team-preview':   'bg-gradient-to-br from-indigo-50 to-violet-100 border-indigo-200 hover:border-indigo-400',
  'team-picker':    'bg-gradient-to-br from-indigo-50   to-blue-100    border-indigo-200 hover:border-indigo-400',
  'round-intro':    'bg-gradient-to-br from-red-50    to-rose-100    border-red-200    hover:border-red-400',
  'question':      'bg-gradient-to-br from-blue-50   to-indigo-100  border-blue-200   hover:border-blue-400',
  'pixelate-series': 'bg-gradient-to-br from-blue-50 to-indigo-100  border-blue-200   hover:border-blue-400',
  'multi-question': 'bg-gradient-to-br from-blue-50  to-indigo-100  border-blue-200   hover:border-blue-400',
  'shiny-question': 'bg-[linear-gradient(135deg,#bfdbfe,#fef9c3,#fde047)] border-yellow-300 hover:border-blue-400',
  'swing-round-intro': 'bg-gradient-to-br from-red-50 to-rose-100  border-red-200    hover:border-red-400',
  'scoreboard-reveal': 'bg-gradient-to-br from-violet-50 to-purple-100 border-violet-200 hover:border-violet-400',
  'pyl-reveal':    'bg-gradient-to-br from-teal-50   to-blue-100    border-teal-200   hover:border-blue-400',
  'grading-break': 'bg-gradient-to-br from-violet-50 to-purple-100  border-violet-200 hover:border-violet-400',
  'winner-reveal': 'bg-[linear-gradient(135deg,#fecaca,#fed7aa,#fef08a,#bbf7d0,#bfdbfe,#ddd6fe)] border-purple-200 hover:border-purple-400',
  'custom':        'bg-gradient-to-br from-teal-50   to-cyan-100    border-teal-200   hover:border-teal-400',
  'database':      'bg-gradient-to-br from-green-50  to-emerald-100 border-green-200  hover:border-green-400',
  'theme':         'bg-gradient-to-br from-pink-50   to-fuchsia-100 border-pink-200   hover:border-pink-400',
  'ticker':        'bg-gradient-to-br from-sky-50    to-cyan-100    border-sky-200    hover:border-sky-400',
  'shiny':         'bg-gradient-to-br from-yellow-50 to-amber-100   border-yellow-200 hover:border-yellow-400',
  'swing':         'bg-gradient-to-br from-orange-50 to-red-100     border-orange-200 hover:border-orange-400',
  'pyl':           'bg-gradient-to-br from-teal-50   to-blue-100    border-teal-200   hover:border-teal-400',
  'data':          'bg-gradient-to-br from-purple-50 to-violet-100  border-purple-200 hover:border-purple-400',
  'shows':         'bg-gradient-to-br from-slate-50  to-blue-100    border-slate-200  hover:border-blue-400',
}

// Shiny questions get a distinct blue/yellow card so they stand out from
// regular questions in every round's grid, not just a fixed card style keyed
// off slide.type — applies wherever a question/pixelate-series slide has
// isShiny set, current round or future.
function getCardStyleKey(slide) {
  if (slide.data?.isShiny && (slide.type === 'question' || slide.type === 'pixelate-series')) {
    return 'shiny-question'
  }
  return slide.type
}

// Rest-state grid box order — this is a personal workspace layout preference,
// not show data, so it lives in localStorage rather than the show record.
const REST_STATE_BOX_ORDER_KEY = 'trivia-os:rest-state-box-order'

function defaultRestStateBoxOrder() {
  return [
    ...TYPE_CARDS.filter(c => !c.hidden).map(c => c.type),
    'theme', 'swing', 'pyl', 'shiny', 'database', 'ticker', 'data', 'shows',
  ]
}

function loadRestStateBoxOrder() {
  const fallback = defaultRestStateBoxOrder()
  try {
    const stored = JSON.parse(localStorage.getItem(REST_STATE_BOX_ORDER_KEY))
    if (!Array.isArray(stored)) return fallback
    // Merge with fallback so a box added later (new slide type, new shortcut)
    // never silently disappears because it's missing from a saved order.
    const known = stored.filter(id => fallback.includes(id))
    const missing = fallback.filter(id => !known.includes(id))
    return [...known, ...missing]
  } catch {
    return fallback
  }
}

function RoundView({ show, round, slides, onSelectSlide, onOpenAddModal, onReorder, onBack }) {
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const draggedRef = useRef(null)
  const dragOverRef = useRef(null)

  function handleGripDown(e, id) {
    e.preventDefault()
    e.stopPropagation()
    draggedRef.current = id
    dragOverRef.current = null
    setDraggedId(id)
    setDragOverId(null)

    function onMove(ev) {
      let el = document.elementFromPoint(ev.clientX, ev.clientY)
      while (el && el !== document.body) {
        if (el.dataset?.slideId) {
          dragOverRef.current = el.dataset.slideId
          setDragOverId(el.dataset.slideId)
          return
        }
        el = el.parentElement
      }
      dragOverRef.current = null
      setDragOverId(null)
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      const from = draggedRef.current
      const to = dragOverRef.current
      if (from && to && from !== to) {
        const visibleIds = visibleSlides.map(s => s.id)
        const fromIdx = visibleIds.indexOf(from)
        const toIdx = visibleIds.indexOf(to)
        if (fromIdx !== -1 && toIdx !== -1) {
          const newVisibleIds = [...visibleIds]
          newVisibleIds.splice(fromIdx, 1)
          newVisibleIds.splice(toIdx, 0, from)
          // Expand each visible id to its full series group (lead + siblings in order)
          const expandedRoundIds = newVisibleIds.flatMap(id => {
            const slide = slides.find(s => s.id === id)
            return getSeriesGroup(slide, slides).map(s => s.id)
          })
          // Build full slide order: replace this round's slots with expanded order
          const allSorted = sortedSlides(show)
          const roundSet = new Set(slides.map(s => s.id))
          let ri = 0
          const fullOrder = allSorted.map(s => roundSet.has(s.id) ? expandedRoundIds[ri++] : s.id)
          onReorder(fullOrder)
        }
      }
      draggedRef.current = null
      dragOverRef.current = null
      setDraggedId(null)
      setDragOverId(null)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  // Only show lead slides — sub-slides (slotIndex > 1) are carried along during reorder
  const visibleSlides = slides.filter(s => !(s.data.isSeries && (s.data.slotIndex ?? 1) > 1))

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 h-11 px-5 border-b border-gray-100 shrink-0">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          ← Dashboard
        </button>
        <span className="text-xs text-gray-400 ml-auto">{visibleSlides.length} slide{visibleSlides.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex flex-wrap gap-3 justify-start">
          {visibleSlides.map(slide => {
            const preview = getSlidePreview(slide)
            const isDragging = draggedId === slide.id
            const isOver = dragOverId === slide.id && draggedId !== slide.id
            return (
              <div
                key={slide.id}
                data-slide-id={slide.id}
                className={`relative w-[calc(25%-9px)] min-h-[120px] rounded-xl ${isDragging ? 'opacity-30' : ''} ${isOver ? 'ring-2 ring-blue-400' : ''}`}
              >
                <button
                  onClick={() => !draggedId && onSelectSlide(slide)}
                  className={`w-full h-full flex flex-col items-center justify-center gap-2 p-4 rounded-xl border text-center ${BTN} transition-colors ${
                    CARD_STYLE[getCardStyleKey(slide)] ?? 'bg-white border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <span className="text-2xl leading-none">{SLIDE_ICON[slide.type] ?? '📄'}</span>
                  <span className="text-sm font-semibold leading-tight text-gray-800">{getSlideLabel(slide)}</span>
                  {preview && (
                    <p className="text-xs leading-snug line-clamp-2 text-gray-500">{preview}</p>
                  )}
                </button>
                <span
                  className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing text-sm leading-none select-none"
                  onPointerDown={e => handleGripDown(e, slide.id)}
                >
                  ⠿
                </span>
              </div>
            )
          })}
          <button
            onClick={onOpenAddModal}
            className={`w-[calc(25%-9px)] flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 text-center min-h-[120px] ${BTN} bg-white hover:border-gray-400 hover:bg-gray-50`}
          >
            <span className="text-2xl text-gray-300">+</span>
            <span className="text-sm font-medium text-gray-400">Add slide</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BuildMode({ show, actions, onGoLive, onOpenLibrary, onOpenScoreboard }) {
  // Preloaded on dashboard mount (not on modal open) so FormatLibrary and
  // AddSlideWizard never show a blank-then-pop-in flash, and both share one
  // fetch instead of each running its own.
  const { formats: shinyFormats, loading: shinyFormatsLoading, createFormat, updateFormat, deleteFormat } = useShinyFormats()
  const [showFormatLibrary, setShowFormatLibrary] = useState(false)
  const [showTickerManager, setShowTickerManager] = useState(false)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [mode, setMode] = useState('wizard')
  const [selectedSlide, setSelectedSlide] = useState(null)
  const [viewingRoundId, setViewingRoundId] = useState(null)  // round view mode
  const [addModalData, setAddModalData] = useState(null)  // null = modal closed
  const [wizardPickedType, setWizardPickedType] = useState(null)
  const [addRoundWizardOpen, setAddRoundWizardOpen] = useState(false)
  const [activeRoundId, setActiveRoundId] = useState(null)
  const [showSwingWizard, setShowSwingWizard] = useState(false)
  const [showPylWizard,   setShowPylWizard]   = useState(false)

  // Rest-state grid reorder — same pointer-events drag pattern as
  // RoundSidebar/RoundView's slide reorder (grip mousedown -> pointermove
  // tracking -> elementFromPoint drop-target detection -> commit on pointerup).
  const [restBoxOrder, setRestBoxOrder] = useState(loadRestStateBoxOrder)
  const [restDragOverId, setRestDragOverId] = useState(null)
  const restDraggedRef = useRef(null)
  const restDragOverRef = useRef(null)

  function handleRestGripDown(e, id) {
    e.preventDefault()
    e.stopPropagation()
    restDraggedRef.current = id
    restDragOverRef.current = null
    setRestDragOverId(null)

    function onMove(ev) {
      let node = document.elementFromPoint(ev.clientX, ev.clientY)
      while (node && node !== document.body) {
        if (node.dataset?.restBoxId) {
          restDragOverRef.current = node.dataset.restBoxId
          setRestDragOverId(node.dataset.restBoxId)
          return
        }
        node = node.parentElement
      }
      restDragOverRef.current = null
      setRestDragOverId(null)
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      const dragged = restDraggedRef.current
      const over = restDragOverRef.current
      if (dragged && over && dragged !== over) {
        setRestBoxOrder(prev => {
          const fromIdx = prev.indexOf(dragged)
          const toIdx = prev.indexOf(over)
          if (fromIdx === -1 || toIdx === -1) return prev
          const next = [...prev]
          next.splice(fromIdx, 1)
          next.splice(toIdx, 0, dragged)
          localStorage.setItem(REST_STATE_BOX_ORDER_KEY, JSON.stringify(next))
          return next
        })
      }
      restDraggedRef.current  = null
      restDragOverRef.current = null
      setRestDragOverId(null)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  function RestGripHandle({ id }) {
    return (
      <span
        onMouseDown={e => handleRestGripDown(e, id)}
        title="Drag to reorder"
        className="absolute top-1.5 left-1.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing text-xs leading-none select-none z-10"
      >
        ⠿
      </span>
    )
  }

  // Reset active/viewing round if it gets deleted
  useEffect(() => {
    const rounds = show?.rounds ?? []
    if (activeRoundId && !rounds.find(r => r.id === activeRoundId)) setActiveRoundId(null)
    if (viewingRoundId && !rounds.find(r => r.id === viewingRoundId)) {
      setViewingRoundId(null)
      setMode('wizard')
    }
  }, [show?.rounds, activeRoundId, viewingRoundId])

  async function handleSwingAdd(questions, roundId) {
    setShowSwingWizard(false)
    // Swing should always live in a real, collapsible round — same as PYL.
    // Without this, slides created with no round active land as flat,
    // unassigned items in the sidebar instead of a proper round group.
    let targetRoundId = roundId
    if (!targetRoundId) {
      const round = await actions.addRound({ roundType: 'swing', title: 'Swing Round', subtitle: '' })
      targetRoundId = round.id
      setActiveRoundId(round.id)
    }
    const sortedAll = [...(show?.slides ?? [])].sort((a, b) => a.order - b.order)
    const roundSlides = sortedAll.filter(s => s.roundId === targetRoundId)
    const existingQCount = roundSlides.filter(s => s.type === 'question' && !s.data?.isBonus).length
    // Insert after last slide in the round, or end of show if no round selected / round empty
    const afterId = roundSlides.length > 0
      ? roundSlides[roundSlides.length - 1].id
      : sortedAll[sortedAll.length - 1]?.id ?? null
    const nonEmpty = questions.filter(q => q.text.trim() || q.answer.trim())
    const slidesData = nonEmpty.map((q, i) => ({
      type: 'question',
      roundId: targetRoundId,
      data: {
        questionNumber: existingQCount + i + 1,
        questionLabel:  `Q${existingQCount + i + 1}`,
        questionMode:   'regular',
        isShiny:        false,
        text:           q.text.trim(),
        answer:         q.answer.trim(),
        mediaSlots:     [],
      },
    }))
    if (slidesData.length) {
      await actions.addSiblingSlides(afterId, slidesData)
      archiveQuestions([{
        type:            'swing',
        questions_data:  nonEmpty.map(q => ({ text: q.text.trim(), answer: q.answer.trim() })),
        show_id:         show.id,
        show_title:      show.title,
        show_date:       show.date ?? null,
      }])
    }
  }

  async function handlePYLAdd(themes, roundId) {
    setShowPylWizard(false)
    // PYL should always live in a real, collapsible round — same as Swing.
    // Without this, slides created with no round active land as flat,
    // unassigned items in the sidebar instead of a proper round group.
    let targetRoundId = roundId
    if (!targetRoundId) {
      const round = await actions.addRound({ roundType: 'pyl', title: 'Press Your Luck!', subtitle: '' })
      targetRoundId = round.id
      setActiveRoundId(round.id)
    }
    const sortedAll = [...(show?.slides ?? [])].sort((a, b) => a.order - b.order)
    const roundSlides = sortedAll.filter(s => s.roundId === targetRoundId)
    const afterId = roundSlides.length > 0
      ? roundSlides[roundSlides.length - 1].id
      : sortedAll[sortedAll.length - 1]?.id ?? null
    const slidesData = themes.map((theme, i) => ({
      type: 'pyl-reveal',
      roundId: targetRoundId,
      data: { themeName: theme.name, themeType: theme.type, title: theme.name, themeIndex: i },
    }))
    if (slidesData.length) {
      await actions.addSiblingSlides(afterId, slidesData)
      archiveQuestions(themes.map(theme => ({
        type:       'pyl',
        text:       theme.name,
        answer:     theme.type,
        show_id:    show.id,
        show_title: show.title,
        show_date:  show.date ?? null,
      })))
    }
  }

  const syncedSelectedSlide = selectedSlide
    ? (show?.slides?.find(s => s.id === selectedSlide.id) ?? selectedSlide)
    : null

  function openAddModal(initialData = {}) {
    setAddModalData(initialData)
  }

  function closeAddModal() {
    setAddModalData(null)
    setWizardPickedType(null)
  }

  function enterEditing(slide) {
    setSelectedSlide(slide)
    setMode('editing')
  }

  function enterRoundView(roundId) {
    setViewingRoundId(roundId)
    setMode('round')
    setSelectedSlide(null)
  }

  function returnToDashboard() {
    setSelectedSlide(null)
    // Go back to round view if that's where we came from
    if (viewingRoundId && mode === 'editing') {
      setMode('round')
    } else {
      setViewingRoundId(null)
      setMode('wizard')
    }
  }

  // Unified Esc handler: modal close takes priority over editing escape
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      if (showSwingWizard) {
        setShowSwingWizard(false)
      } else if (showPylWizard) {
        setShowPylWizard(false)
      } else if (addRoundWizardOpen) {
        setAddRoundWizardOpen(false)
      } else if (addModalData !== null) {
        setAddModalData(null)
      } else if (mode === 'editing') {
        returnToDashboard()
      } else if (mode === 'round') {
        setViewingRoundId(null)
        setMode('wizard')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showSwingWizard, showPylWizard, addRoundWizardOpen, addModalData, mode, viewingRoundId])

  function handleAddRound() {
    setAddRoundWizardOpen(true)
  }

  // Default round number for the Add Round wizard: active round's number + 1,
  // falling back to the highest existing round number + 1, or 1 if no rounds yet.
  const nextRoundNumber = (() => {
    const rounds = show?.rounds ?? []
    if (!rounds.length) return 1
    const anchor = activeRoundId ? rounds.find(r => r.id === activeRoundId) : null
    const ref = anchor ?? rounds.reduce((hi, r) =>
      (r.roundNumber ?? r.number ?? 0) > (hi?.roundNumber ?? hi?.number ?? 0) ? r : hi
    , null)
    return (ref?.roundNumber ?? ref?.number ?? 0) + 1
  })()

  async function handleRoundWizardAdd(data) {
    setAddRoundWizardOpen(false)
    const round = await actions.addRound(data)
    setActiveRoundId(round.id)
    openAddModal({
      type: 'round-intro',
      roundId: round.id,
      roundType: data.roundType,
      roundNumber: data.roundNumber,
      roundSubtitle: data.subtitle,
    })
  }

  const reducedMotion     = useReducedMotion()

  if (!show) return null

  const effectiveModalType = addModalData?.type ?? wizardPickedType
  const isQuestionModal   = effectiveModalType === 'question'
  const isRoundIntroModal = effectiveModalType === 'round-intro'

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <HostHeader
        show={show}
        onUpdateMeta={actions.updateShowMeta}
        onGoLive={onGoLive}
        onExport={actions.exportShow}
        onOpenLibrary={onOpenLibrary}
        onOpenScoreboard={onOpenScoreboard}
        onDashboard={mode !== 'wizard' ? returnToDashboard : undefined}
      />

      <div className="flex flex-1 min-h-0">
        <RoundSidebar
          show={show}
          selectedSlideId={syncedSelectedSlide?.id ?? null}
          viewingRoundId={viewingRoundId}
          onSelectSlide={slide => enterEditing(slide)}
          onSelectRound={enterRoundView}
          onAddRound={handleAddRound}
          onUpdateRound={actions.updateRound}
          onDeleteRound={actions.deleteRound}
          onDeleteSlide={async (id) => {
            await actions.deleteSlide(id)
            if (syncedSelectedSlide?.id === id) returnToDashboard()
          }}
          onReorderSlides={actions.reorderSlides}
          onReorderRounds={actions.reorderRounds}
        />

        <main className="flex-1 overflow-hidden bg-white">
          {mode === 'editing' && syncedSelectedSlide ? (
            <SlideEditor
              slide={syncedSelectedSlide}
              show={show}
              onUpdateSlide={actions.updateSlide}
              onDeleteSlide={async (id) => {
                await actions.deleteSlide(id)
                returnToDashboard()
              }}
              uploadMedia={actions.uploadMedia}
              getHostPhotos={actions.getHostPhotos}
            />
          ) : mode === 'round' && viewingRoundId ? (
            (() => {
              const viewingRound = show.rounds.find(r => r.id === viewingRoundId)
              const roundSlides  = sortedSlides(show).filter(s => s.roundId === viewingRoundId)
              if (!viewingRound) return null
              return (
                <RoundView
                  key={viewingRoundId}
                  show={show}
                  round={viewingRound}
                  slides={roundSlides}
                  onSelectSlide={enterEditing}
                  onOpenAddModal={() => openAddModal({ roundId: viewingRoundId })}
                  onReorder={actions.reorderSlides}
                  onBack={() => { setViewingRoundId(null); setMode('wizard') }}
                />
              )
            })()
          ) : (
            /* Dashboard rest state — type picker grid */
            <div className="h-full flex flex-col items-center justify-center p-8 overflow-y-auto">
              <div className="w-full max-w-5xl -translate-y-[6%]">

                {/* Round context filter */}
                {show.rounds.length > 0 && (
                  <div className="mb-5">
                    <div className="flex flex-wrap gap-2 justify-center">
                      {show.rounds.map(r => (
                        <button
                          key={r.id}
                          onClick={() => setActiveRoundId(prev => prev === r.id ? null : r.id)}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-semibold ${BTN} ${
                            activeRoundId === r.id
                              ? 'bg-[#1a6b4a] text-white border-[#1a6b4a]'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a6b4a] hover:text-[#1a6b4a]'
                          }`}
                        >
                          R{r.number} · {r.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4-4-4-1 grid: all 15 boxes flat, drag the ⠿ grip to reorder */}
                <div className="flex flex-wrap gap-3 justify-center">
                  {(() => {
                    const restBoxContent = {
                      ...Object.fromEntries(TYPE_CARDS.filter(c => !c.hidden).map(card => [card.type, {
                        icon: card.icon, name: card.name, desc: card.desc, styleKey: card.type,
                        onClick: () => openAddModal({ type: card.type, roundId: activeRoundId }),
                      }])),
                      theme:    { icon: '🎨', name: 'Theme', desc: 'Change the display look', styleKey: 'theme', onClick: () => setShowThemePicker(true) },
                      swing:    { icon: '🎷', name: 'Swing Round', desc: 'Bulk-add all swing questions at once', styleKey: 'swing', onClick: () => setShowSwingWizard(true) },
                      pyl:      { icon: '🎰', name: 'Press Your Luck!', desc: 'Set up PYL themes and slides', styleKey: 'pyl', onClick: () => setShowPylWizard(true) },
                      shiny:    { icon: '✨', name: 'Shiny Formats', desc: 'Add or edit shiny question styles', styleKey: 'shiny', onClick: () => setShowFormatLibrary(true) },
                      database: { icon: '🗃️', name: 'Question Database', desc: 'Browse and search your archive', styleKey: 'database', onClick: () => window.open('/questions', '_blank') },
                      ticker:   { icon: '👥', name: 'Team List', desc: 'Show all team names on screen', styleKey: 'ticker', onClick: () => openAddModal({ type: 'team-preview', roundId: activeRoundId }) },
                      data:     { icon: '📊', name: 'Data', desc: 'Shows history & analytics', styleKey: 'data', onClick: () => window.open('/dashboard', '_blank') },
                      shows:    { icon: '📋', name: 'My Shows', desc: 'Browse past shows', styleKey: 'shows', onClick: () => window.open('/shows', '_blank') },
                    }

                    return restBoxOrder.map(id => {
                      const box = restBoxContent[id]
                      if (!box) return null
                      const dropTarget = restDragOverId === id
                      return (
                        <button
                          key={id}
                          data-rest-box-id={id}
                          onClick={box.onClick}
                          className={`relative w-[calc(25%-9px)] flex flex-col items-center justify-center gap-2 p-4 rounded-xl border text-center min-h-[120px] ${BTN} ${
                            CARD_STYLE[box.styleKey] ?? 'bg-white border-gray-200 hover:border-gray-400'
                          } ${dropTarget ? 'ring-2 ring-[#1a6b4a] ring-offset-1' : ''}`}
                        >
                          <RestGripHandle id={id} />
                          <span className="text-3xl leading-none">{box.icon}</span>
                          <span className="text-sm font-semibold text-gray-800 leading-tight">{box.name}</span>
                          <span className="text-xs text-gray-500 leading-snug">{box.desc}</span>
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add slide modal — reuses FormatLibrary's exact overlay primitive + framer-motion enter/exit */}
      <AnimatePresence>
        {addModalData !== null && (
          <motion.div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            onClick={closeAddModal}
          >
            <motion.div
              className={`w-full ${isQuestionModal ? 'max-w-3xl' : isRoundIntroModal ? 'max-w-lg' : 'max-w-md'}`}
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, transition: { duration: 0.1, ease: EASE_OUT } }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
              onClick={e => e.stopPropagation()}
            >
              <AddSlideWizard
                key={(addModalData.type ?? 'picker') + (addModalData.roundId ?? '')}
                show={show}
                initialData={addModalData}
                onTypeChange={setWizardPickedType}
                onAddSlide={async ({ afterSlideId, ...rest }) => {
                  const newSlides = await actions.addSiblingSlides(afterSlideId, [rest])
                  const slide = newSlides?.[0]
                  if (slide) {
                    closeAddModal()
                    enterEditing(slide)
                  }
                }}
                onClose={closeAddModal}
                shinyFormats={shinyFormats}
                shinyLoading={shinyFormatsLoading}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addRoundWizardOpen && (
          <motion.div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            onClick={() => setAddRoundWizardOpen(false)}
          >
            <motion.div
              className="w-full max-w-sm"
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, transition: { duration: 0.1, ease: EASE_OUT } }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
              onClick={e => e.stopPropagation()}
            >
              <AddRoundWizard
                defaultRoundNumber={nextRoundNumber}
                onAdd={handleRoundWizardAdd}
                onClose={() => setAddRoundWizardOpen(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showFormatLibrary && (
        <FormatLibrary
          onClose={() => setShowFormatLibrary(false)}
          formats={shinyFormats}
          loading={shinyFormatsLoading}
          createFormat={createFormat}
          updateFormat={updateFormat}
          deleteFormat={deleteFormat}
        />
      )}

      {showTickerManager && (
        <TickerMessageManager
          messages={show.tickerMessages ?? []}
          onSave={actions.updateTickerMessages}
          onClose={() => setShowTickerManager(false)}
        />
      )}

      {showThemePicker && (
        <ThemePickerModal
          show={show}
          onClose={() => setShowThemePicker(false)}
          onSelectTheme={themeId => actions.updateShowMeta({ theme: themeId })}
          onUpdateOverrides={themeOverrides => actions.updateShowMeta({ themeOverrides })}
          onUploadFont={actions.uploadFont}
        />
      )}

      <AnimatePresence>
        {showSwingWizard && (
          <motion.div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            onClick={() => setShowSwingWizard(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, transition: { duration: 0.1, ease: EASE_OUT } }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
              onClick={e => e.stopPropagation()}
            >
              <SwingRoundWizard
                activeRoundId={activeRoundId}
                onAdd={handleSwingAdd}
                onClose={() => setShowSwingWizard(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPylWizard && (
          <motion.div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            onClick={() => setShowPylWizard(false)}
          >
            <motion.div
              className="w-full max-w-sm"
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, transition: { duration: 0.1, ease: EASE_OUT } }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
              onClick={e => e.stopPropagation()}
            >
              <PYLWizard
                activeRoundId={activeRoundId}
                onAdd={handlePYLAdd}
                onClose={() => setShowPylWizard(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
