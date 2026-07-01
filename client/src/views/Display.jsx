import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase.js'
import { ThemeProvider, useTheme } from '../components/shared/ThemeProvider.jsx'
import SlideRenderer from '../components/display/SlideRenderer.jsx'
import QuestionCounter from '../components/display/QuestionCounter.jsx'
import BaynesWatermark from '../components/display/BaynesWatermark.jsx'
import ParticleBackground from '../components/display/ParticleBackground.jsx'
import ScoreboardOverlay from '../components/display/ScoreboardOverlay.jsx'
import BenPhoto from '../components/shared/BenPhoto.jsx'

// ─── Pre-show waiting screen ───────────────────────────────────────────────

function PreShowScreen({ show }) {
  const { theme } = useTheme()
  const [teams, setTeams] = useState([])
  const [qrDataUrl, setQrDataUrl] = useState(null)

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

  // Ticker — always visible, always fills the full 1920px width.
  // Uses custom messages from show.ticker_messages when teams < 5.
  // Switches to scrolling team names once 5+ teams have joined.
  const TEAM_THRESHOLD = 5
  const customMessages = show.ticker_messages ?? []
  const defaultMessages = [
    "No teams in yet — get off your booty and scan that code 📱",
    "Don't make Ben do this by himself, he gets lonely 🥺",
    "Scan the QR code to join tonight's trivia — yes, you",
    "First team to join gets bragging rights. Go.",
  ]

  const rawTickerText = teams.length >= TEAM_THRESHOLD
    ? teams.map(t => t.name).join('  ·  ') + '  ·  '
    : (customMessages.length > 0 ? customMessages : defaultMessages).join('  ·  ') + '  ·  '

  const AVG_CHAR_PX = 10
  const MIN_COPY_PX = 2400
  const repeatCount = Math.max(1, Math.ceil(MIN_COPY_PX / (rawTickerText.length * AVG_CHAR_PX)))
  const tickerText = rawTickerText.repeat(repeatCount)
  const tickerDuration = Math.max((tickerText.length * AVG_CHAR_PX) / 55, 20)

  return (
    <div className="w-screen h-screen overflow-hidden relative select-none"
      style={{ background: theme.colors.bg }}>

      <ParticleBackground theme={theme} />

      {/* UI bar — sits at 23% from top, above the treeline */}
      <div style={{
        position: 'absolute',
        top: '23%',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        zIndex: 10,
      }}>
        <h1 style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
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
              fontSize: '1.25rem',
              color: `${theme.colors.text}88`,
            }}>{teams.length === 1 ? 'team in' : 'teams in'}</span>
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '1.1rem',
              color: theme.colors.textMuted,
              textAlign: 'center',
              maxWidth: '120px',
            }}>Scan to join</span>
          </div>
        </div>
      </div>

      {/* Ticker — pinned to bottom, always visible */}
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
              fontSize: '1.1rem',
              fontWeight: 500,
              letterSpacing: '0.04em',
              color: `${theme.colors.text}cc`,
              whiteSpace: 'nowrap',
              padding: '0 2rem',
            }}>{tickerText}{tickerText}</span>
          </div>
        </div>
      </div>

      {/* Ben photo — bottom-left corner */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        left: 40,
        zIndex: 10,
        opacity: 0.7,
      }}>
        <BenPhoto size={120} />
      </div>

      <BaynesWatermark />
    </div>
  )
}

// ─── Preview slide ─────────────────────────────────────────────────────────

function PreviewSlide() {
  const { theme } = useTheme()

  return (
    <div
      className="w-screen h-screen overflow-hidden relative select-none"
      style={{ background: theme.colors.bgDeep }}
    >
      <ParticleBackground theme={theme} />

      {/* PREVIEW MODE label */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        style={{ opacity: 0.25 }}
      >
        <span
          className="text-xs font-bold tracking-widest uppercase"
          style={{ color: theme.colors.text, fontFamily: "'DM Sans', sans-serif" }}
        >
          PREVIEW MODE
        </span>
      </div>

      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 50% 50%, ${theme.colors.accent}20 0%, transparent 70%)`,
        }}
      />

      {/* Sample question text — centered */}
      <div className="absolute inset-0 flex items-center justify-center px-24 py-20">
        <p
          className="text-center leading-relaxed"
          style={{
            color: theme.colors.text,
            fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
            fontSize: 'clamp(2rem, 4.5vw, 4.5rem)',
            fontWeight: 500,
            maxWidth: '80ch',
          }}
        >
          This is what your questions will look like on screen.
        </p>
      </div>

      <BaynesWatermark />
    </div>
  )
}

// ─── Answer reveal overlay ─────────────────────────────────────────────────

const EASE_OUT = [0.23, 1, 0.32, 1]

function AnswerRevealOverlay({ show, currentSlide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const visible = show.answer_reveal ?? show.showState?.answerReveal ?? false

  // Walk back to series lead to find the answer for shiny sub-slides
  const answer = (() => {
    if (!currentSlide) return null
    const d = currentSlide.data
    if (d?.answer) return d.answer
    if (d?.isSeries && (d.slotIndex ?? 1) > 1) {
      const lead = (show.slides ?? []).find(s =>
        s.data?.isSeries &&
        s.data?.slotIndex === 1 &&
        s.data?.shinyFormatId === d.shinyFormatId &&
        s.data?.questionLabel === d.questionLabel
      )
      return lead?.data?.answer ?? null
    }
    return null
  })()

  return (
    <AnimatePresence>
      {visible && answer && (
        <motion.div
          key="answer-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{ backdropFilter: 'blur(18px)', backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <motion.div
            initial={{ scale: reduce ? 1 : 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: { duration: 0.22, delay: 0.04, ease: EASE_OUT } }}
            exit={{ scale: reduce ? 1 : 0.95, opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
            className="px-16 py-12 rounded-3xl text-center w-full mx-16"
            style={{
              background: theme.colors.bg,
              boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
            }}
          >
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-5"
              style={{ color: theme.colors.accent, opacity: 0.7 }}
            >
              Answer
            </p>
            <p
              style={{
                color: theme.colors.accent,
                fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
                fontSize: 'clamp(2rem, 5vw, 4.5rem)',
                lineHeight: 1.15,
              }}
            >
              {answer}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
      <ParticleBackground theme={theme} />

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

      {/* z-50: persistent overlays — always on top */}
      <QuestionCounter slide={currentSlide} show={show} />
      <AnswerRevealOverlay show={show} currentSlide={currentSlide} />
      <ScoreboardOverlay show={show} />
      <BaynesWatermark />
    </div>
  )
}

// ─── Root ──────────────────────────────────────────────────────────────────

export default function Display() {
  const [searchParams] = useSearchParams()
  const isDemo = searchParams.get('demo') === '1'
  const showId = searchParams.get('show')
  const isPreview = searchParams.get('preview') === 'true'
  const [show, setShow] = useState(null)
  const [loading, setLoading] = useState(true)
  const prevIndexRef = useRef(0)
  const [direction, setDirection] = useState(1)

  useEffect(() => {
    if (isDemo) return
    async function load() {
      let data = null

      if (showId) {
        // Explicit show ID in URL — load that show directly
        const res = await supabase.from('shows').select('*').eq('id', showId).single()
        data = res.data
      } else {
        // No URL param — prefer the currently live show, fall back to most recently updated
        const { data: liveRes } = await supabase
          .from('shows')
          .select('*')
          .eq('is_live', true)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single()
        if (liveRes) {
          data = liveRes
        } else {
          const { data: res, error } = await supabase
            .from('shows')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single()
          if (error) console.error('[Display] show fetch error:', error)
          data = res
        }
      }

      if (data) {
        // Jukebox return: advance past grading-break; auto-jump to winner-reveal if last slide and no more grading breaks
        if (searchParams.get('from') === 'jukebox') {
          const sorted = [...(data.slides ?? [])].sort((a, b) => a.order - b.order)
          const cur = data.current_slide_index ?? 0
          const lastSlideIsWinner = sorted[sorted.length - 1]?.type === 'winner-reveal'
          const noMoreGradingBreaks = !sorted.slice(cur + 1).some(s => s.type === 'grading-break')
          const next = (lastSlideIsWinner && noMoreGradingBreaks)
            ? sorted.length - 1
            : Math.min(cur + 1, sorted.length - 1)
          if (next > cur) {
            const nextSlide = sorted[next]
            await supabase.from('shows').update({
              current_slide_index: next,
              current_slide_id: nextSlide?.id ?? null,
            }).eq('id', data.id)
            data = { ...data, current_slide_index: next, current_slide_id: nextSlide?.id ?? null }
          }
          const url = new URL(window.location.href)
          url.searchParams.delete('from')
          window.history.replaceState({}, '', url.toString())
        }

        prevIndexRef.current = data.current_slide_index ?? 0
        setShow({ ...data, theme: data.theme_id ?? data.theme, themeOverrides: data.theme_overrides ?? data.themeOverrides })
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
          setShow({ ...next, theme: next.theme_id ?? next.theme, themeOverrides: next.theme_overrides ?? next.themeOverrides })
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [show?.id])

  // Watch for any show going live — if it's not the one we're showing, switch to it
  useEffect(() => {
    if (showId || isDemo) return
    const global = supabase
      .channel('display:any-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shows' },
        (payload) => {
          const next = payload.new
          if (next.is_live && next.id !== show?.id) {
            prevIndexRef.current = next.current_slide_index ?? 0
            setShow({ ...next, theme: next.theme_id ?? next.theme, themeOverrides: next.theme_overrides ?? next.themeOverrides })
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(global)
  }, [show?.id, showId, isDemo])

  if (isDemo) {
    const demoThemeId = searchParams.get('theme') ?? 'pure-michigan'
    return (
      <ThemeProvider showThemeId={demoThemeId}>
        <DisplayInner
          show={{
            id: 'demo',
            theme: demoThemeId,
            is_live: true,
            current_slide_id: 'demo-q1',
            current_slide_index: 0,
            slides: [{
              id: 'demo-q1', type: 'question', order: 0, roundId: null,
              data: {
                questionNumber: 1, questionLabel: 'Q1', questionMode: 'regular',
                isShiny: false, text: 'What is the capital of France?', mediaSlots: [],
              },
            }],
            rounds: [], showState: { isLive: true }, audio_playing: null,
          }}
          direction={1}
        />
      </ThemeProvider>
    )
  }

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
        <p style={{ color: '#e6e6fa', fontSize: '1.5rem' }}>No show found</p>
      </div>
    )
  }

  if (isPreview) {
    return (
      <ThemeProvider showThemeId={show.theme} overrides={show.themeOverrides}>
        <PreviewSlide />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider showThemeId={show.theme} overrides={show.themeOverrides}>
      {show.is_live && show.current_slide_id !== null ? (
        <DisplayInner show={show} direction={direction} />
      ) : (
        <PreShowScreen show={show} />
      )}
    </ThemeProvider>
  )
}
