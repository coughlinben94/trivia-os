import { useState, useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import HostHeader from './HostHeader.jsx'
import RoundSidebar from './RoundSidebar.jsx'
import SlideEditor from './SlideEditor.jsx'
import AddSlideWizard, { TYPE_CARDS } from './AddSlideWizard.jsx'
import AddRoundWizard from './AddRoundWizard.jsx'
import FormatLibrary from './FormatLibrary.jsx'
import TickerMessageManager from './TickerMessageManager.jsx'
import ThemePickerModal from './ThemePickerModal.jsx'

const BTN = 'transition duration-[120ms] ease-snap active:scale-[0.97]'

const CARD_STYLE = {
  'title':         'bg-gradient-to-br from-amber-50  to-orange-100  border-amber-200  hover:border-amber-400',
  'round-intro':   'bg-gradient-to-br from-red-50    to-rose-100    border-red-200    hover:border-red-400',
  'question':      'bg-gradient-to-br from-blue-50   to-indigo-100  border-blue-200   hover:border-blue-400',
  'grading-break': 'bg-gradient-to-br from-violet-50 to-purple-100  border-violet-200 hover:border-violet-400',
  'custom':        'bg-gradient-to-br from-teal-50   to-cyan-100    border-teal-200   hover:border-teal-400',
  'database':      'bg-gradient-to-br from-green-50  to-emerald-100 border-green-200  hover:border-green-400',
  'theme':         'bg-gradient-to-br from-pink-50   to-fuchsia-100 border-pink-200   hover:border-pink-400',
  'ticker':        'bg-gradient-to-br from-sky-50    to-cyan-100    border-sky-200    hover:border-sky-400',
  'shiny':         'bg-gradient-to-br from-yellow-50 to-amber-100   border-yellow-200 hover:border-yellow-400',
}

export default function BuildMode({ show, actions, onGoLive, onOpenLibrary }) {
  const [showFormatLibrary, setShowFormatLibrary] = useState(false)
  const [showTickerManager, setShowTickerManager] = useState(false)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [mode, setMode] = useState('wizard')
  const [selectedSlide, setSelectedSlide] = useState(null)
  const [addModalData, setAddModalData] = useState(null)  // null = modal closed
  const [addRoundWizardOpen, setAddRoundWizardOpen] = useState(false)

  const syncedSelectedSlide = selectedSlide
    ? (show?.slides?.find(s => s.id === selectedSlide.id) ?? selectedSlide)
    : null

  function openAddModal(initialData = {}) {
    setAddModalData(initialData)
  }

  function closeAddModal() {
    setAddModalData(null)
  }

  function enterEditing(slide) {
    setSelectedSlide(slide)
    setMode('editing')
  }

  function returnToDashboard() {
    setSelectedSlide(null)
    setMode('wizard')
  }

  // Unified Esc handler: modal close takes priority over editing escape
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (addRoundWizardOpen) {
        setAddRoundWizardOpen(false)
      } else if (addModalData !== null) {
        setAddModalData(null)
      } else if (mode === 'editing') {
        setSelectedSlide(null)
        setMode('wizard')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [addRoundWizardOpen, addModalData, mode])

  function handleAddRound() {
    setAddRoundWizardOpen(true)
  }

  async function handleRoundWizardAdd(data) {
    setAddRoundWizardOpen(false)
    const round = await actions.addRound(data)
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

  const isQuestionModal   = addModalData?.type === 'question'
  const isRoundIntroModal = addModalData?.type === 'round-intro'

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <HostHeader
        show={show}
        onUpdateMeta={actions.updateShowMeta}
        onGoLive={onGoLive}
        onExport={actions.exportShow}
        onOpenLibrary={onOpenLibrary}
      />

      <div className="flex flex-1 min-h-0">
        <RoundSidebar
          show={show}
          selectedSlideId={syncedSelectedSlide?.id ?? null}
          onSelectSlide={slide => enterEditing(slide)}
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
              key={syncedSelectedSlide.id}
              slide={syncedSelectedSlide}
              show={show}
              onUpdateSlide={actions.updateSlide}
              onDeleteSlide={async (id) => {
                await actions.deleteSlide(id)
                returnToDashboard()
              }}
              onClose={() => returnToDashboard()}
              uploadMedia={actions.uploadMedia}
              getHostPhotos={actions.getHostPhotos}
              addSiblingSlides={actions.addSiblingSlides}
            />
          ) : (
            /* Dashboard rest state — type picker grid */
            <div className="h-full flex flex-col items-center justify-center p-8">
              <div className="w-full max-w-2xl">
                <div className="grid grid-cols-3 gap-3">
                  {TYPE_CARDS.map(card => (
                    <button
                      key={card.type}
                      onClick={() => openAddModal({ type: card.type })}
                      className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border text-center group min-h-[138px] ${BTN} ${CARD_STYLE[card.type] ?? 'bg-white border-gray-200 hover:border-gray-400'}`}
                    >
                      <span className="text-3xl leading-none">{card.icon}</span>
                      <span className="text-sm font-semibold text-gray-800 transition-colors duration-[120ms]">{card.name}</span>
                      <span className="text-xs text-gray-500 leading-snug">{card.desc}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setShowThemePicker(true)}
                    className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border text-center group min-h-[138px] ${BTN} ${CARD_STYLE['theme']}`}
                  >
                    <span className="text-3xl leading-none">🎨</span>
                    <span className="text-sm font-semibold text-gray-800 transition-colors duration-[120ms]">Theme</span>
                    <span className="text-xs text-gray-500 leading-snug">Change the display look</span>
                  </button>
                  <button
                    onClick={() => { window.location.href = '/questions' }}
                    className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border text-center group min-h-[138px] ${BTN} ${CARD_STYLE['database']}`}
                  >
                    <span className="text-3xl leading-none">🗃️</span>
                    <span className="text-sm font-semibold text-gray-800 transition-colors duration-[120ms]">Question Database</span>
                    <span className="text-xs text-gray-500 leading-snug">Browse and search your question archive</span>
                  </button>
                  <button
                    onClick={() => setShowTickerManager(true)}
                    className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border text-center group min-h-[138px] ${BTN} ${CARD_STYLE['ticker']}`}
                  >
                    <span className="text-3xl leading-none">📺</span>
                    <span className="text-sm font-semibold text-gray-800 transition-colors duration-[120ms]">Ticker</span>
                    <span className="text-xs text-gray-500 leading-snug">Edit pre-show ticker messages</span>
                  </button>
                  <button
                    onClick={() => setShowFormatLibrary(true)}
                    className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border text-center group min-h-[138px] ${BTN} ${CARD_STYLE['shiny']}`}
                  >
                    <span className="text-3xl leading-none">✨</span>
                    <span className="text-sm font-semibold text-gray-800 transition-colors duration-[120ms]">Shiny Formats</span>
                    <span className="text-xs text-gray-500 leading-snug">Add or edit shiny question styles</span>
                  </button>
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
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            onClick={closeAddModal}
          >
            <motion.div
              className={`w-full ${isQuestionModal ? 'max-w-3xl' : isRoundIntroModal ? 'max-w-lg' : 'max-w-md'}`}
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, transition: { duration: 0.1, ease: [0.23, 1, 0.32, 1] } }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              onClick={e => e.stopPropagation()}
            >
              <AddSlideWizard
                key={addModalData.type + (addModalData.roundId ?? '')}
                show={show}
                initialData={addModalData}
                onAddSlide={async (slideData) => {
                  const slide = await actions.addSlide(slideData)
                  if (slide) {
                    closeAddModal()
                    enterEditing(slide)
                  }
                }}
                onClose={closeAddModal}
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
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            onClick={() => setAddRoundWizardOpen(false)}
          >
            <motion.div
              className="w-full max-w-sm"
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, transition: { duration: 0.1, ease: [0.23, 1, 0.32, 1] } }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              onClick={e => e.stopPropagation()}
            >
              <AddRoundWizard
                onAdd={handleRoundWizardAdd}
                onClose={() => setAddRoundWizardOpen(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showFormatLibrary && (
        <FormatLibrary onClose={() => setShowFormatLibrary(false)} />
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
        />
      )}
    </div>
  )
}
