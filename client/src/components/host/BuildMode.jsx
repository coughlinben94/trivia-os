import { useState } from 'react'
import HostHeader from './HostHeader.jsx'
import RoundSidebar from './RoundSidebar.jsx'
import SlideEditor from './SlideEditor.jsx'
import { sortedSlides } from '../../hooks/useShow.js'

export default function BuildMode({ show, actions, onGoLive }) {
  const [selectedSlideId, setSelectedSlideId] = useState(() => {
    const sorted = [...show.slides].sort((a, b) => a.order - b.order)
    return sorted[0]?.id ?? null
  })

  const selectedSlide = show.slides.find(s => s.id === selectedSlideId)
  const sorted = sortedSlides(show)

  async function handleAddRound() {
    const round = await actions.addRound({})
    // Auto-add a round-intro slide
    const slide = await actions.addSlide({
      type: 'round-intro',
      roundId: round.id,
      order: sorted.length,
      data: {
        roundNumber: round.number,
        roundTitle: round.title,
        subtitle: '',
        hostPhotoUrl: null,
      },
    })
    if (slide) setSelectedSlideId(slide.id)
  }

  async function handleAddSlide(slideData) {
    const slide = await actions.addSlide(slideData)
    return slide
  }

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <HostHeader
        show={show}
        onUpdateMeta={actions.updateShowMeta}
        onGoLive={onGoLive}
        onExport={actions.exportShow}
      />

      <div className="flex flex-1 min-h-0">
        <RoundSidebar
          show={show}
          selectedSlideId={selectedSlideId}
          onSelectSlide={setSelectedSlideId}
          onAddRound={handleAddRound}
          onUpdateRound={actions.updateRound}
          onDeleteRound={actions.deleteRound}
          onAddSlide={handleAddSlide}
          onDeleteSlide={async (id) => {
            await actions.deleteSlide(id)
            if (id === selectedSlideId) {
              const remaining = sortedSlides(show).filter(s => s.id !== id)
              setSelectedSlideId(remaining[0]?.id ?? null)
            }
          }}
        />

        {/* Main editor area */}
        <main className="flex-1 overflow-hidden bg-white">
          {!selectedSlide ? (
            <EmptyState onAddRound={handleAddRound} />
          ) : (
            <SlideEditor
              key={selectedSlide.id}
              slide={selectedSlide}
              show={show}
              onUpdateSlide={actions.updateSlide}
              onDeleteSlide={async (id) => {
                await actions.deleteSlide(id)
                const remaining = sortedSlides(show).filter(s => s.id !== id)
                setSelectedSlideId(remaining[0]?.id ?? null)
              }}
              uploadMedia={actions.uploadMedia}
              getHostPhotos={actions.getHostPhotos}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function EmptyState({ onAddRound }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-4">
      <div className="text-5xl">🎯</div>
      <div>
        <p className="text-gray-900 font-semibold">No slides yet</p>
        <p className="text-gray-500 text-sm mt-1">Add a round to get started, or select a slide from the sidebar.</p>
      </div>
      <button
        onClick={onAddRound}
        className="mt-2 bg-baynes-forest text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-green-900 transition-colors"
      >
        Add first round
      </button>
    </div>
  )
}
