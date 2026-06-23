import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase.js'
import { ThemeProvider, useTheme } from '../components/shared/ThemeProvider.jsx'
import SlideRenderer from '../components/display/SlideRenderer.jsx'
import QuestionCounter from '../components/display/QuestionCounter.jsx'
import BaynesWatermark from '../components/display/BaynesWatermark.jsx'

export default function Display() {
  const [searchParams] = useSearchParams()
  const showId = searchParams.get('show')
  const [show, setShow] = useState(null)
  const [loading, setLoading] = useState(true)
  const prevIndexRef = useRef(0)
  const [direction, setDirection] = useState(1)

  useEffect(() => {
    async function load() {
      const query = showId
        ? supabase.from('shows').select('*').eq('id', showId).single()
        : supabase.from('shows').select('*').eq('is_live', true).single()
      const { data } = await query
      if (data) {
        prevIndexRef.current = data.current_slide_index ?? 0
        setShow(data)
      }
      setLoading(false)
    }
    load()
  }, [showId])

  useEffect(() => {
    if (!show?.id) return
    const channel = supabase
      .channel(`display:${show.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shows', filter: `id=eq.${show.id}` },
        (payload) => {
          const next = payload.new
          const nextIndex = next.current_slide_index ?? 0
          setDirection(nextIndex >= prevIndexRef.current ? 1 : -1)
          prevIndexRef.current = nextIndex
          setShow(next)
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [show?.id])

  if (loading) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <div className="text-white/20 text-sm tracking-widest uppercase">Loading</div>
      </div>
    )
  }

  if (!show) {
    return (
      <div className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-3">
        <p className="text-white/50 text-3xl font-bold" style={{ fontFamily: "'Anton', sans-serif" }}>
          Baynes Trivia
        </p>
        <p className="text-white/20 text-sm">No live show — host needs to go live</p>
      </div>
    )
  }

  return (
    <ThemeProvider showThemeId={show.theme_id}>
      <DisplayInner show={show} direction={direction} />
    </ThemeProvider>
  )
}

function DisplayInner({ show, direction }) {
  const { theme } = useTheme()
  const sortedSlides = [...(show.slides ?? [])].sort((a, b) => a.order - b.order)
  const currentSlide = sortedSlides[show.current_slide_index ?? 0] ?? null

  return (
    <div
      className="w-screen h-screen overflow-hidden relative select-none"
      style={{ background: theme.colors.bg }}
    >
      <AnimatePresence mode="wait" custom={direction}>
        {currentSlide && (
          <SlideRenderer
            key={currentSlide.id}
            slide={currentSlide}
            show={show}
            direction={direction}
          />
        )}
      </AnimatePresence>

      {/* Persistent overlays — outside AnimatePresence so they don't re-animate */}
      <QuestionCounter slide={currentSlide} show={show} />
      <BaynesWatermark />
    </div>
  )
}
