import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase.js'
import { ThemeProvider, useTheme } from '../components/shared/ThemeProvider.jsx'
import SlideRenderer from '../components/display/SlideRenderer.jsx'
import QuestionCounter from '../components/display/QuestionCounter.jsx'
import BaynesWatermark from '../components/display/BaynesWatermark.jsx'
import ParticleBackground from '../components/display/ParticleBackground.jsx'

// ─── Pre-show waiting screen ───────────────────────────────────────────────

function PreShowScreen({ show }) {
  console.log('[PreShowScreen] show prop:', show)
  console.log('[PreShowScreen] show?.teams:', show?.teams)

  const { theme } = useTheme()
  const [teams, setTeams] = useState([])
  const [qrDataUrl, setQrDataUrl] = useState(null)

  if (!show) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2b1e3e' }}>
        <p style={{ color: '#e6e6fa', fontSize: '1.5rem' }}>PreShowScreen: show is null</p>
      </div>
    )
  }

  const joinUrl = `${window.location.origin}/join?show=${show.id}`

  // Load existing teams + subscribe to new registrations
  useEffect(() => {
    supabase
      .from('teams')
      .select('id, name')
      .eq('show_id', show.id)
      .order('registered_at', { ascending: true })
      .then(({ data }) => { if (data) setTeams(data) })

    const channel = supabase
      .channel(`preshow-teams:${show.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'teams',
        filter: `show_id=eq.${show.id}`,
      }, (payload) => {
        setTeams(prev => {
          if (prev.some(t => t.id === payload.new.id)) return prev
          return [...prev, { id: payload.new.id, name: payload.new.name }]
        })
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [show.id])

  // Generate QR code — cream-on-dark for legibility on TV
  useEffect(() => {
    QRCode.toDataURL(joinUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#111111', light: '#f5f0e8' },
    }).then(url => setQrDataUrl(url))
  }, [joinUrl])

  // Ticker: ~55px/s, minimum 14s so it never blazes past on a big TV
  const tickerText = teams.length > 0
    ? teams.map(t => t.name).join('  ·  ') + '  ·  '
    : null
  const tickerDuration = tickerText
    ? Math.max((tickerText.length * 14) / 55, 14)
    : 14

  return (
    <div
      className="w-screen h-screen overflow-hidden relative flex flex-col select-none"
      style={{ background: theme.colors.bg }}
    >
      <ParticleBackground theme={theme} />

      {/* ── Centre content ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-10 relative z-10 px-16">

        {/* Logo + title */}
        <div className="flex flex-col items-center gap-4">
          <img
            src="/baynes-logo.svg"
            alt="Baynes Apple Valley"
            className="h-16 object-contain"
            style={{
              filter: 'brightness(0) invert(1)',
              opacity: 0.35,
              tintColor: theme.colors.highlight,
            }}
          />
          <h1
            className="leading-none text-center"
            style={{
              fontFamily: "'Handters', 'Anton', sans-serif",
              fontSize: 'clamp(4rem, 8vw, 7.5rem)',
              color: theme.colors.text,
              letterSpacing: '-0.02em',
              textWrap: 'balance',
            }}
          >
            Trivia Night
          </h1>
          <p
            className="text-xl tracking-widest uppercase"
            style={{
              fontFamily: "'Roquen', 'Inter', sans-serif",
              color: theme.colors.textMuted,
              letterSpacing: '0.22em',
            }}
          >
            Baynes Apple Valley
          </p>
        </div>

        {/* QR code */}
        <div className="flex flex-col items-center gap-5">
          <div
            className="rounded-3xl overflow-hidden"
            style={{ padding: '18px', background: '#f5f0e8' }}
          >
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Scan to join trivia"
                width={240}
                height={240}
                className="block"
              />
            ) : (
              <div
                className="flex items-center justify-center"
                style={{ width: 240, height: 240 }}
              >
                <div
                  className="w-10 h-10 rounded-full border-[3px] border-t-transparent animate-spin"
                  style={{ borderColor: theme.colors.accent, borderTopColor: 'transparent' }}
                />
              </div>
            )}
          </div>
          <p
            className="text-xl"
            style={{
              fontFamily: "'Roquen', 'Inter', sans-serif",
              color: theme.colors.textMuted,
            }}
          >
            Scan to join tonight's trivia
          </p>
        </div>

        {/* Team count */}
        <div className="flex items-baseline gap-4">
          <span
            className="tabular-nums leading-none"
            style={{
              fontFamily: "'Handters', 'Anton', sans-serif",
              fontSize: 'clamp(3.5rem, 6vw, 5.5rem)',
              color: theme.colors.highlight,
            }}
          >
            {teams.length}
          </span>
          <span
            className="text-2xl"
            style={{
              fontFamily: "'Roquen', 'Inter', sans-serif",
              color: `${theme.colors.text}55`,
            }}
          >
            {teams.length === 1 ? 'team registered' : 'teams registered'}
          </span>
        </div>
      </div>

      {/* ── Ticker ──────────────────────────────────────────────────── */}
      {tickerText && (
        <div
          className="relative z-10 shrink-0 overflow-hidden"
          style={{
            height: '3.75rem',
            background: theme.colors.bgDeep,
            borderTop: `1px solid ${theme.colors.accent}50`,
          }}
          aria-hidden="true"
        >
          <div className="flex items-center h-full">
            <div
              className="ticker-track"
              style={{ animationDuration: `${tickerDuration}s` }}
            >
              <span
                className="whitespace-nowrap px-8"
                style={{
                  fontFamily: "'Roquen', 'Inter', sans-serif",
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  color: `${theme.colors.text}55`,
                }}
              >
                {tickerText}{tickerText}
              </span>
            </div>
          </div>
        </div>
      )}

      <BaynesWatermark />
    </div>
  )
}

// ─── Live display ──────────────────────────────────────────────────────────

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

// ─── Root ──────────────────────────────────────────────────────────────────

export default function Display() {
  const [searchParams] = useSearchParams()
  const showId = searchParams.get('show')
  const [show, setShow] = useState(null)
  const [loading, setLoading] = useState(true)
  const prevIndexRef = useRef(0)
  const [direction, setDirection] = useState(1)

  useEffect(() => {
    async function load() {
      let data = null

      if (showId) {
        // Explicit show ID in URL — load that show directly
        const res = await supabase.from('shows').select('*').eq('id', showId).single()
        data = res.data
      } else {
        // No URL param — load the most recently created show
        const { data: res, error } = await supabase
          .from('shows')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (error) console.error('[Display] show fetch error:', error)
        console.log('[Display] show fetch result:', res)
        data = res
      }

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
        <p
          className="text-white/50 text-3xl font-bold"
          style={{ fontFamily: "'Handters', 'Anton', sans-serif" }}
        >
          Baynes Trivia
        </p>
        <p className="text-white/20 text-sm">No live show — host needs to go live</p>
      </div>
    )
  }

  if (!show) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2b1e3e' }}>
        <p style={{ color: '#e6e6fa', fontSize: '1.5rem' }}>Loading show...</p>
      </div>
    )
  }

  return (
    <ThemeProvider showThemeId={show.theme_id}>
      {show.is_live ? (
        <DisplayInner show={show} direction={direction} />
      ) : (
        <PreShowScreen show={show} />
      )}
    </ThemeProvider>
  )
}
