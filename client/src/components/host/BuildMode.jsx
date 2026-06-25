import { useState, useEffect } from 'react'
import HostHeader from './HostHeader.jsx'
import RoundSidebar from './RoundSidebar.jsx'
import SlideEditor from './SlideEditor.jsx'
import AddSlideWizard from './AddSlideWizard.jsx'
import FormatLibrary from './FormatLibrary.jsx'
import TickerMessageManager from './TickerMessageManager.jsx'
import { sortedSlides } from '../../hooks/useShow.js'

export default function BuildMode({ show, actions, onGoLive, onOpenLibrary }) {
  const [showFormatLibrary, setShowFormatLibrary] = useState(false)
  const [showTickerManager, setShowTickerManager] = useState(false)
  const [mode, setMode] = useState('wizard')
  const [selectedSlide, setSelectedSlide] = useState(null)
  const [wizardInitialData, setWizardInitialData] = useState({})
  const [wizardKey, setWizardKey] = useState(0)

  // Always use the live version of the selected slide from show data
  const syncedSelectedSlide = selectedSlide
    ? (show.slides.find(s => s.id === selectedSlide.id) ?? selectedSlide)
    : null

  function enterWizard(initialData = {}) {
    setSelectedSlide(null)
    setMode('wizard')
    setWizardInitialData(initialData)
    setWizardKey(k => k + 1)
  }

  function enterEditing(slide) {
    setSelectedSlide(slide)
    setMode('editing')
  }

  // Escape returns to wizard, preserving round context
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && mode === 'editing') {
        setSelectedSlide(null)
        setMode('wizard')
        setWizardInitialData({ roundId: selectedSlide?.roundId })
        setWizardKey(k => k + 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, selectedSlide])

  async function handleAddRound() {
    const round = await actions.addRound({})
    enterWizard({ type: 'round-intro', roundId: round.id })
  }

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <HostHeader
        show={show}
        onUpdateMeta={actions.updateShowMeta}
        onGoLive={onGoLive}
        onExport={actions.exportShow}
        onOpenFormatLibrary={() => setShowFormatLibrary(true)}
        onOpenTicker={() => setShowTickerManager(true)}
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
            if (syncedSelectedSlide?.id === id) enterWizard()
          }}
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
                enterWizard()
              }}
              onClose={() => enterWizard({ roundId: syncedSelectedSlide.roundId })}
              uploadMedia={actions.uploadMedia}
              getHostPhotos={actions.getHostPhotos}
              addSiblingSlides={actions.addSiblingSlides}
            />
          ) : (
            <AddSlideWizard
              key={wizardKey}
              show={show}
              onAddSlide={async (slideData) => {
                const slide = await actions.addSlide(slideData)
                if (slide) enterEditing(slide)
              }}
              initialData={wizardInitialData}
            />
          )}
        </main>
      </div>

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
    </div>
  )
}
