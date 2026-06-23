import { useEffect, useCallback } from 'react'
import { sortedSlides } from '../../hooks/useShow.js'
import ScorePanel from './ScorePanel.jsx'
import { useState } from 'react'

// ─── Slide type metadata ───────────────────────────────────────────────────
const SLIDE_META = {
  'title':             { label: 'Title',       color: 'bg-purple-100 text-purple-700' },
  'round-intro':       { label: 'Round Intro', color: 'bg-blue-100 text-blue-700' },
  'swing-round-intro': { label: 'Swing Intro', color: 'bg-indigo-100 text-indigo-700' },
  'question':          { label: 'Question',    color: 'bg-gray-100 text-gray-600' },
  'grading-break':     { label: 'Break',       color: 'bg-amber-100 text-amber-700' },
  'scoreboard-reveal': { label: 'Scoreboard',  color: 'bg-yellow-100 text-yellow-800' },
  'custom':            { label: 'Custom',      color: 'bg-green-100 text-green-700' },
  'pixelate-series':   { label: 'Pixelate',    color: 'bg-cyan-100 text-cyan-700' },
  'multi-question':    { label: 'Multi-Q',     color: 'bg-orange-100 text-orange-700' },
  'pyl-reveal':        { label: 'PYL',         color: 'bg-red-100 text-red-700' },
}

function typeMeta(type) {
  return SLIDE_META[type] ?? { label: type, color: 'bg-gray-100 text-gray-600' }
}

// ─── Counter label ─────────────────────────────────────────────────────────
function counterLabel(slide, index, total, show) {
  if (!slide) return `Slide ${index + 1} / ${total}`
  if (slide.type === 'question' || slide.type === 'multi-question') {
    const roundIdx = (show?.rounds ?? []).findIndex(r => r.id === slide.roundId)
    const r = roundIdx >= 0 ? `R${roundIdx + 1}` : null
    const q = slide.data?.questionLabel ?? (slide.data?.questionNumber ? `Q${slide.data.questionNumber}` : null)
    const parts = [q, r, `Slide ${index + 1} / ${total}`].filter(Boolean)
    return parts.join(' · ')
  }
  const { label } = typeMeta(slide.type)
  return `${label} · Slide ${index + 1} / ${total}`
}

// ─── Slide preview (host panel, light mode) ────────────────────────────────
function SlidePreviewContent({ slide, show }) {
  const { data, type } = slide
  const round = show?.rounds?.find(r => r.id === slide.roundId)

  if (type === 'question') {
    return (
      <div className="max-w-2xl">
        {round && (
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{round.title}</p>
        )}
        <div className="flex items-start gap-4 mb-4">
          {data.questionNumber && (
            <span className="shrink-0 w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-white font-bold text-lg">
              {data.questionNumber}
            </span>
          )}
          <p className="text-3xl font-semibold text-gray-900 leading-snug">{data.text || 'No question text'}</p>
        </div>
        {data.isShiny && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-yellow-500">✨ Shiny</span>
            {data.shinyType && <span className="text-gray-400 capitalize">{data.shinyType}</span>}
          </div>
        )}
        {data.isSeries && (
          <p className="text-sm text-gray-400 mt-1">Series: {data.seriesTheme || 'untitled'}</p>
        )}
      </div>
    )
  }

  if (type === 'round-intro' || type === 'swing-round-intro') {
    return (
      <div className="text-center">
        <p className="text-[8rem] font-black text-gray-900 leading-none">{data.roundNumber}</p>
        <p className="text-4xl font-bold text-gray-700 mt-2">{data.roundTitle || 'Round'}</p>
        {data.subtitle && <p className="text-xl italic text-gray-400 mt-2">{data.subtitle}</p>}
        {type === 'swing-round-intro' && data.themeLabel && (
          <p className="text-sm font-medium text-indigo-500 mt-3 uppercase tracking-wider">{data.themeLabel}</p>
        )}
      </div>
    )
  }

  if (type === 'grading-break') {
    return (
      <div className="text-center">
        <p className="text-5xl mb-4">☕</p>
        <p className="text-2xl text-gray-600">{data.message || 'Grading time!'}</p>
      </div>
    )
  }

  if (type === 'scoreboard-reveal') {
    return (
      <div className="text-center">
        <p className="text-6xl mb-4">🏆</p>
        <p className="text-3xl font-bold text-gray-800">
          {data.title || (data.afterRound != null ? `After Round ${data.afterRound}` : 'Leaderboard')}
        </p>
      </div>
    )
  }

  if (type === 'title') {
    return (
      <div className="text-center">
        <p className="text-5xl font-black text-gray-900">{data.title || 'Title slide'}</p>
        {data.subtitle && <p className="text-2xl text-gray-500 mt-3">{data.subtitle}</p>}
      </div>
    )
  }

  if (type === 'multi-question') {
    const qs = data.questions ?? []
    return (
      <div className="max-w-2xl">
        {round && <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{round.title}</p>}
        <p className="text-2xl font-bold text-gray-800 mb-4">{data.title || 'Questions'}</p>
        <ol className="space-y-2">
          {qs.map((q, i) => (
            <li key={i} className="flex gap-3 text-base text-gray-700">
              <span className="shrink-0 font-bold text-gray-400">{i + 1}.</span>
              <span>{q.text}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  if (type === 'pyl-reveal') {
    return (
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">Push Your Luck</p>
        <p className="text-3xl font-bold text-gray-800">{data.title || 'Push Your Luck'}</p>
        {(data.items ?? []).length > 0 && (
          <p className="text-sm text-gray-400 mt-2">{data.items.length} items · revealing {data.currentReveal ?? 0}</p>
        )}
      </div>
    )
  }

  if (type === 'pixelate-series') {
    const stages = data.stages ?? []
    return (
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">Pixelate Series</p>
        <p className="text-2xl font-semibold text-gray-800 mb-1">{data.text || 'Identify the image'}</p>
        <p className="text-sm text-gray-400">{stages.length} stages · showing stage {(data.currentStage ?? 0) + 1}</p>
      </div>
    )
  }

  return (
    <p className="text-xl text-gray-500">{data.title || data.text || type}</p>
  )
}

function SlidePreview({ slide, show }) {
  if (!slide) {
    return (
      <div className="h-full rounded-2xl border border-dashed border-gray-200 flex items-center justify-center">
        <p className="text-gray-300 text-sm">No slide selected</p>
      </div>
    )
  }
  const meta = typeMeta(slide.type)
  const round = show?.rounds?.find(r => r.id === slide.roundId)

  return (
    <div className="h-full rounded-2xl border border-gray-100 bg-white flex flex-col overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 shrink-0">
        <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.color}`}>
          {meta.label}
        </span>
        {round && (
          <span className="text-xs text-gray-400 font-medium">{round.title}</span>
        )}
        {slide.data?.isShiny && (
          <span className="text-[11px] text-yellow-500 font-medium ml-auto">✨ Shiny</span>
        )}
      </div>
      <div className="flex-1 flex items-center justify-center p-10 overflow-y-auto">
        <SlidePreviewContent slide={slide} show={show} />
      </div>
    </div>
  )
}

// ─── Upcoming card ─────────────────────────────────────────────────────────
function UpcomingCard({ slide, show, offset }) {
  const meta = typeMeta(slide.type)
  const d = slide.data
  const excerpt = (() => {
    if (slide.type === 'question' || slide.type === 'multi-question') return d.text?.slice(0, 70) ?? meta.label
    if (slide.type === 'round-intro' || slide.type === 'swing-round-intro') return `Round ${d.roundNumber}: ${d.roundTitle || ''}`
    if (slide.type === 'grading-break') return d.message || 'Grading Break'
    if (slide.type === 'scoreboard-reveal') return d.title || 'Leaderboard'
    return d.title || d.text || meta.label
  })()

  return (
    <div className="flex-1 min-w-0 bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${meta.color}`}>
          {meta.label}
        </span>
        <span className="text-[10px] text-gray-300 font-medium ml-auto">+{offset}</span>
      </div>
      <p className="text-xs text-gray-500 leading-snug line-clamp-2">{excerpt}</p>
    </div>
  )
}

// ─── LiveMode ──────────────────────────────────────────────────────────────
export default function LiveMode({ show, actions, onExitLive }) {
  const [scorePanelOpen, setScorePanelOpen] = useState(false)

  const slides = sortedSlides(show)
  const currentIndex = show.showState.currentSlideIndex ?? 0
  const currentSlide = slides[currentIndex] ?? null
  const upcomingSlides = slides.slice(currentIndex + 1, currentIndex + 4)
  const atStart = currentIndex === 0
  const atEnd = currentIndex >= slides.length - 1

  // Arrow key → Stream Deck navigation
  const handleKeyDown = useCallback((e) => {
    if (scorePanelOpen) return
    if (e.code === 'ArrowRight') { e.preventDefault(); actions.nextSlide() }
    if (e.code === 'ArrowLeft')  { e.preventDefault(); actions.prevSlide() }
  }, [scorePanelOpen, actions])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex flex-col h-screen bg-gray-50 select-none">
      {/* ── Top nav bar ─────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-100">
        <button
          onClick={onExitLive}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors host-button px-2 py-1 rounded-lg hover:bg-gray-100"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Edit
        </button>

        <div className="flex items-center gap-1 ml-2">
          <NavButton
            onClick={actions.prevSlide}
            disabled={atStart}
            label="◀ Prev"
            title="Previous slide (←)"
          />
          <NavButton
            onClick={actions.nextSlide}
            disabled={atEnd}
            label="Next ▶"
            title="Next slide (→)"
            primary
          />
        </div>

        <div className="flex-1 text-center">
          <span className="text-sm font-medium text-gray-500 tabular-nums">
            {counterLabel(currentSlide, currentIndex, slides.length, show)}
          </span>
        </div>

        <button
          onClick={() => setScorePanelOpen(true)}
          className="host-button flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-baynes-forest text-white text-sm font-semibold hover:bg-green-900 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="9" width="2" height="4" rx="1" fill="currentColor"/>
            <rect x="4.5" y="6" width="2" height="7" rx="1" fill="currentColor"/>
            <rect x="8" y="3" width="2" height="10" rx="1" fill="currentColor"/>
            <rect x="11.5" y="1" width="2" height="12" rx="1" fill="currentColor"/>
          </svg>
          Score
        </button>
      </div>

      {/* ── Current slide preview ────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden p-4">
        <SlidePreview slide={currentSlide} show={show} />
      </div>

      {/* ── Upcoming strip ───────────────────────────────────────────── */}
      {upcomingSlides.length > 0 && (
        <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-2">Upcoming</p>
          <div className="flex gap-2">
            {upcomingSlides.map((slide, i) => (
              <UpcomingCard key={slide.id} slide={slide} show={show} offset={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* ── Score panel ─────────────────────────────────────────────── */}
      <ScorePanel
        open={scorePanelOpen}
        onClose={() => setScorePanelOpen(false)}
        show={show}
        actions={actions}
      />
    </div>
  )
}

// ─── Nav button ────────────────────────────────────────────────────────────
function NavButton({ onClick, disabled, label, title, primary }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`host-button px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
        disabled
          ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
          : primary
            ? 'bg-gray-900 text-white hover:bg-gray-800'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  )
}
