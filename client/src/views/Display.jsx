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
import ThemeCanvas from '../components/display/ThemeCanvas.jsx'
import ThemeForeground from '../components/display/ThemeForeground.jsx'

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
    <div className="w-screen h-screen overflow-hidden relative select-none"
      style={{ background: theme.colors.bg }}>

      <ThemeCanvas theme={theme} />
      <ThemeForeground theme={theme} />
      <ParticleBackground theme={theme} />

      {/* UI bar — sits at 8% from top, above the treeline */}
      <div style={{
        position: 'absolute',
        top: '8%',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        zIndex: 10,
      }}>
        <h1 style={{
          fontFamily: "'Boogaloo', sans-serif",
          fontSize: 'clamp(3rem, 6vw, 5.5rem)',
          color: theme.colors.text,
          letterSpacing: '-0.02em',
          margin: 0,
          lineHeight: 1,
          textWrap: 'balance',
          textAlign: 'center',
        }}>Trivia Night</h1>

        {/* QR + team count side by side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3rem' }}>
          <div style={{ borderRadius: '1.5rem', overflow: 'hidden', padding: '14px', background: '#f5f0e8' }}>
            {qrDataUrl
              ? <img src={qrDataUrl} alt="Scan to join trivia" width={160} height={160} style={{ display: 'block' }} />
              : <div style={{ width: 160, height: 160 }} />}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              fontFamily: "'Boogaloo', sans-serif",
              fontSize: 'clamp(3rem, 5vw, 4.5rem)',
              color: theme.colors.highlight,
              lineHeight: 1,
            }}>{teams.length}</span>
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '1rem',
              color: `${theme.colors.text}88`,
            }}>{teams.length === 1 ? 'team in' : 'teams in'}</span>
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.75rem',
              color: theme.colors.textMuted,
              textAlign: 'center',
              maxWidth: '120px',
            }}>Scan to join</span>
          </div>
        </div>
      </div>

      {/* Ticker — pinned to bottom */}
      {tickerText && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '3rem',
          background: theme.colors.bgDeep,
          borderTop: `1px solid ${theme.colors.accent}50`,
          overflow: 'hidden',
          zIndex: 10,
        }}>
          <div className="flex items-center h-full">
            <div className="ticker-track" style={{ animationDuration: `${tickerDuration}s` }}>
              <span style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.85rem',
                fontWeight: 500,
                letterSpacing: '0.04em',
                color: `${theme.colors.text}55`,
                whiteSpace: 'nowrap',
                padding: '0 2rem',
              }}>{tickerText}{tickerText}</span>
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
      {/* z-0: theme background canvas — draws per-theme ambient animation */}
      <ThemeCanvas theme={theme} />

      {/* z-auto: slide content — above canvas via DOM order */}
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

      {/* z-20: theme foreground overlay — above slides, below z-50 persistent overlays */}
      <ThemeForeground theme={theme} />

      {/* z-50: persistent overlays — always on top */}
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
