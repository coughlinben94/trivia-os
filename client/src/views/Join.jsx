import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { nanoid } from 'nanoid'
import { supabase } from '../lib/supabase.js'
import { deriveRoundCols, computeTotal, MEDALS } from '../lib/scoreboardMath.js'
import { getTheme } from '../themes/index.js'
import { resolveShinyPart } from '../lib/shinySeries.js'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import BenPhoto from '../components/shared/BenPhoto.jsx'

// ─── localStorage ─────────────────────────────────────────────────────────────
function getTeamKey(showId) { return `trivia-os:team:${showId}` }
function loadStoredTeam(showId) {
  try { return JSON.parse(localStorage.getItem(getTeamKey(showId))) ?? null }
  catch { return null }
}
function saveStoredTeam(showId, team) {
  localStorage.setItem(getTeamKey(showId), JSON.stringify(team))
}

const TEAM_COLORS = [
  '#f5c842','#e02020','#60c000','#4a90d9','#c96fff',
  '#ff8c00','#00bcd4','#e91e8c','#8bc34a','#ff5722',
]

// ─── Easing constants ─────────────────────────────────────────────────────────
const EASE_DRAWER = [0.32, 0.72, 0, 1]
const EASE_SNAP   = [0.23, 1, 0.32, 1]

// ─── Loading ──────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100dvh', background: '#050505',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '2.5px solid rgba(255,255,255,0.12)',
        borderTopColor: 'rgba(255,255,255,0.5)',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
}

// ─── Error ────────────────────────────────────────────────────────────────────
function ErrorScreen({ message }) {
  return (
    <div style={{
      minHeight: '100dvh', background: '#050505',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '2rem',
    }}>
      <img src="/baynes-logo.svg" alt="" style={{ height: 40, opacity: 0.3, marginBottom: '1.5rem' }} />
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9375rem', textAlign: 'center', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6 }}>
        {message}
      </p>
    </div>
  )
}

// ─── No show ──────────────────────────────────────────────────────────────────
function NoShowScreen() {
  return (
    <div style={{
      minHeight: '100dvh', background: '#050505',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '2rem',
    }}>
      <img src="/baynes-logo.svg" alt="" style={{ height: 40, opacity: 0.3, marginBottom: '1.5rem' }} />
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9375rem', textAlign: 'center', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6 }}>
        No show running right now.
      </p>
      <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.8rem', marginTop: '0.5rem', textAlign: 'center', fontFamily: 'DM Sans, sans-serif' }}>
        Ask Ben for the QR code when things kick off.
      </p>
    </div>
  )
}

// ─── Registration ─────────────────────────────────────────────────────────────
function RegistrationScreen({ onRegister, show, theme }) {
  const [name, setName]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState(null)
  const inputRef = useRef(null)
  const pref = useReducedMotion()

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 150)
    return () => clearTimeout(t)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('Enter your team name to join'); return }
    if (trimmed.length > 30) { setError('Keep it under 30 characters'); return }
    setSubmitting(true)
    setError(null)
    try { await onRegister(trimmed) }
    catch (err) { setError(err.message); setSubmitting(false) }
  }

  const bg        = theme?.colors?.bg       ?? '#050505'
  const accent    = theme?.colors?.accent   ?? '#1a6b4a'
  const highlight = theme?.colors?.highlight ?? '#4dffc3'
  const text      = theme?.colors?.text      ?? '#ffffff'

  return (
    <div style={{
      minHeight: '100dvh', background: bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: '2rem' }}>

        {/* Ben photo — container reserves 100px so heading doesn't shift when photo loads */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: 100, height: 100, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden', flexShrink: 0,
          }}>
            <BenPhoto size={100} />
          </div>
        </div>

        {/* Heading */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'Boogaloo, Anton, sans-serif',
            fontSize: 'clamp(2.25rem, 10vw, 2.75rem)',
            color: highlight, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.1,
          }}>
            Trivia Night
          </h1>
          <p style={{ color: `${text}b3`, fontSize: '1rem', margin: '0.5rem 0 0', lineHeight: 1.4 }}>
            Enter your team name to join
          </p>
          {show?.title && (
            <p style={{ color: `${text}45`, fontSize: '0.8rem', marginTop: '0.3rem' }}>{show.title}</p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(null) }}
            placeholder="Quiz Khalifa, etc."
            maxLength={30}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck="false"
            style={{
              width: '100%', height: 56, boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.09)',
              border: `1.5px solid ${error ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.20)'}`,
              borderRadius: 12, color: text, fontSize: '1.2rem',
              padding: '0 1rem', outline: 'none',
              fontFamily: 'DM Sans, sans-serif',
              transition: 'border-color 120ms ease',
              WebkitAppearance: 'none',
            }}
            onFocus={e  => { e.target.style.borderColor = `${accent}aa` }}
            onBlur={e   => { e.target.style.borderColor = error ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.20)' }}
          />

          <AnimatePresence>
            {error && (
              <motion.p
                initial={pref ? { opacity: 0 } : { opacity: 0, y: -4 }}
                animate={pref ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ color: '#ff6b6b', fontSize: '0.875rem', margin: 0, lineHeight: 1.4 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={!name.trim() || submitting}
            onPointerDown={e => { if (name.trim() && !submitting) e.currentTarget.style.transform = 'scale(0.98)' }}
            onPointerUp={e   => { e.currentTarget.style.transform = 'scale(1)' }}
            onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            style={{
              width: '100%', height: 56, borderRadius: 12,
              background: submitting ? `${accent}cc` : accent,
              color: '#fff', fontSize: '1.1rem', fontWeight: 700,
              border: 'none', cursor: submitting ? 'default' : 'pointer',
              opacity: !name.trim() ? 0.45 : 1,
              transition: 'opacity 120ms ease, transform 120ms ease',
              fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.01em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            }}
          >
            {submitting
              ? (<><span style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                    animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0,
                  }} />Joining…</>)
              : 'Join the Show'}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: `${text}35`, fontSize: '0.7rem', margin: 0 }}>
          Have fun out there — and don't yell at me, I'm not a professional 😂
        </p>

        {/* Watermark */}
        <p style={{ textAlign: 'center', color: `${text}28`, fontSize: '0.65rem', margin: '-1rem 0 0' }}>
          Baynes Apple Valley Trivia Night
        </p>
      </div>
    </div>
  )
}

// ─── Waiting ──────────────────────────────────────────────────────────────────
function WaitingScreen({ teamName, theme, onOpenScores }) {
  const pref   = useReducedMotion()
  const bg        = theme?.colors?.bg       ?? '#050505'
  const bgDeep    = theme?.colors?.bgDeep   ?? '#020202'
  const accent    = theme?.colors?.accent   ?? '#1a6b4a'
  const highlight = theme?.colors?.highlight ?? '#4dffc3'
  const text      = theme?.colors?.text      ?? '#ffffff'

  return (
    <div style={{
      minHeight: '100dvh', background: `linear-gradient(180deg, ${bg} 0%, ${bgDeep} 100%)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '2rem', fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', textAlign: 'center', maxWidth: 320 }}>

        {/* Logo */}
        <img src="/baynes-logo.svg" alt="Baynes Apple Valley" style={{ height: 34, opacity: 0.65 }} />

        {/* Checkmark */}
        <motion.div
          initial={pref ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={pref
            ? { duration: 0.25 }
            : { type: 'spring', duration: 0.55, bounce: 0.35 }}
          style={{
            width: 72, height: 72, borderRadius: '50%',
            background: `${accent}2e`, border: `2px solid ${accent}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.9rem', color: highlight,
          }}
        >
          ✓
        </motion.div>

        {/* Team name */}
        <motion.div
          initial={pref ? { opacity: 0 } : { y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: pref ? 0 : 0.18, duration: 0.28, ease: EASE_SNAP }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}
        >
          <p style={{ color: `${text}55`, fontSize: '0.7rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            You&rsquo;re in as
          </p>
          <p style={{
            fontFamily: 'Boogaloo, Anton, sans-serif',
            fontSize: 'clamp(1.75rem, 8vw, 2.25rem)',
            color: text, margin: 0, letterSpacing: '-0.01em',
          }}>
            {teamName}
          </p>
        </motion.div>

        {/* Waiting message */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: pref ? 0 : 0.32, duration: 0.35 }}
          style={{ color: `${text}65`, fontSize: '1rem', margin: 0, lineHeight: 1.5 }}
        >
          Show starts soon 🍺
        </motion.p>

        {/* Pulsing dot */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: pref ? 0 : 0.45, duration: 0.3 }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: highlight, flexShrink: 0,
            animation: pref ? 'none' : 'breathePulse 2.2s ease-in-out infinite',
            display: 'inline-block',
          }} />
          <span style={{ color: `${text}45`, fontSize: '0.8rem' }}>Waiting for Ben…</span>
        </motion.div>
      </div>

      {/* Bottom bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px))',
        background: `${bg}e8`, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: 64,
      }}>
        {/* Scoreboard button */}
        <button
          onClick={onOpenScores}
          onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          style={{
            flex: 1, height: 44, padding: '0 1rem', borderRadius: 10,
            background: 'rgba(255,255,255,0.09)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: `${text}90`, fontSize: '0.85rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            WebkitTapHighlightColor: 'transparent',
            transition: 'transform 120ms ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
          }}
        >
          📊 Scoreboard
        </button>
      </div>
    </div>
  )
}

// ─── Slide content ────────────────────────────────────────────────────────────
function SlideContent({ slide, show, theme }) {
  if (!slide) return null
  const text      = theme?.colors?.text      ?? '#ffffff'
  const round     = show?.rounds?.find(r => r.id === slide.roundId) ?? null

  switch (slide.type) {
    case 'question': {
      const d = slide.data
      // Shiny intro beat — host is showing the teaser title, not the question yet.
      if (d.isShiny && !d.introDone) {
        return (
          <p style={{ color: `${text}70`, fontSize: 'clamp(1rem, 4vw, 1.2rem)', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
            {d.isSeries && d.seriesTheme ? d.seriesTheme : 'Next question incoming…'}
          </p>
        )
      }
      const part = resolveShinyPart(d)
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <p style={{
            color: text, fontSize: 'clamp(1.15rem, 4.5vw, 1.35rem)',
            lineHeight: 1.55, margin: 0, fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
          }}>
            {part.text || <span style={{ opacity: 0.3, fontStyle: 'italic' }}>No question text</span>}
          </p>

          {part.mediaUrl && part.mediaType?.startsWith('image/') && (
            <img src={part.mediaUrl} alt="Question media"
              style={{ width: '100%', borderRadius: 10, objectFit: 'cover', maxHeight: 220 }} />
          )}
          {part.mediaUrl && part.mediaType?.startsWith('audio/') && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '0.75rem 1rem', textAlign: 'center' }}>
              <p style={{ color: `${text}55`, fontSize: '0.875rem', margin: 0 }}>🎵 Listen on the main screen</p>
            </div>
          )}
        </div>
      )
    }

    case 'round-intro':
      return (
        <motion.div
          initial={false}
          animate={{ opacity: 1 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '2.5rem', textAlign: 'center' }}
        >
          <p style={{ color: `${text}45`, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
            Round {slide.data.roundNumber}
          </p>
          <h2 style={{
            fontFamily: 'Boogaloo, Anton, sans-serif',
            fontSize: 'clamp(1.9rem, 9vw, 2.5rem)',
            color: text, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.1,
          }}>
            {slide.data.roundTitle}
          </h2>
          {slide.data.subtitle && (
            <p style={{ color: `${text}55`, fontSize: '1rem', margin: 0, fontStyle: 'italic' }}>{slide.data.subtitle}</p>
          )}
        </motion.div>
      )

    case 'grading-break':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', paddingTop: '2.5rem', textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem' }}>✏️</span>
          <p style={{ color: text, fontSize: '1.1rem', margin: 0, lineHeight: 1.6, fontFamily: 'DM Sans, sans-serif' }}>
            {slide.data.message || 'Ben is grading papers… hang tight 😊'}
          </p>
        </div>
      )

    case 'scoreboard-reveal':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', paddingTop: '2.5rem', textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem' }}>🏆</span>
          <h2 style={{ fontFamily: 'Boogaloo, Anton, sans-serif', fontSize: '1.75rem', color: text, margin: 0 }}>
            {slide.data.title || 'Leaderboard'}
          </h2>
          <p style={{ color: `${text}45`, fontSize: '0.875rem', margin: 0 }}>
            Tap Scores below to see where you stand
          </p>
        </div>
      )

    case 'title':
      return (
        <div style={{ paddingTop: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h1 style={{ fontFamily: 'Boogaloo, Anton, sans-serif', fontSize: 'clamp(2rem, 9vw, 2.5rem)', color: text, margin: 0, letterSpacing: '-0.02em' }}>
            {slide.data.title || 'Trivia Night'}
          </h1>
          {slide.data.subtitle && (
            <p style={{ color: `${text}55`, fontSize: '1.1rem', margin: 0 }}>{slide.data.subtitle}</p>
          )}
        </div>
      )

    case 'multi-question':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {round?.title && (
            <p style={{ color: `${text}45`, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{round.title}</p>
          )}
          <h3 style={{ color: text, fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
            {slide.data.title || 'Questions'}
          </h3>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(slide.data.questions ?? []).map((q, i) => (
              <li key={i} style={{ color: text, fontSize: '1rem', lineHeight: 1.5 }}>{q.text}</li>
            ))}
          </ol>
        </div>
      )

    default:
      return (
        <div style={{ paddingTop: '2.5rem', textAlign: 'center' }}>
          <p style={{ color: `${text}35`, fontSize: '0.875rem' }}>{slide.type.replace(/-/g, ' ')}</p>
        </div>
      )
  }
}

// ─── Scores Drawer ───────────────────────────────────────────────────────────
function ScoresDrawer({ teams, loading, myTeamName, onClose, theme }) {
  const pref      = useReducedMotion()
  const text      = theme?.colors?.text      ?? '#ffffff'
  const accent    = theme?.colors?.accent   ?? '#1a6b4a'
  const highlight = theme?.colors?.highlight ?? '#4dffc3'
  const bg        = theme?.colors?.bg       ?? '#050505'

  const myNameNorm = (myTeamName ?? '').trim().toLowerCase()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)', zIndex: 450,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={pref ? { opacity: 0 } : { y: '100%' }}
        animate={{ y: 0, opacity: 1 }}
        exit={pref ? { opacity: 0 } : { y: '100%' }}
        transition={pref
          ? { duration: 0.22 }
          : { ease: EASE_DRAWER, duration: 0.32 }}
        drag={pref ? false : 'y'}
        dragConstraints={{ top: 0 }}
        dragElastic={{ top: 0.05, bottom: 0.4 }}
        onDragEnd={(_, info) => {
          if (info.velocity.y > 300 || info.offset.y > 120) onClose()
        }}
        style={{
          background: `color-mix(in srgb, ${bg} 93%, #000 7%)`,
          borderRadius: '20px 20px 0 0',
          height: '72dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          cursor: 'grab',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem 0 0' }}>
          <div style={{ width: 32, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.22)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem' }}>
          <h2 style={{ fontFamily: 'Boogaloo, Anton, sans-serif', fontSize: '1.5rem', color: text, margin: 0, letterSpacing: '-0.01em' }}>
            📊 Scores
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8,
              color: `${text}65`, fontSize: '0.85rem', cursor: 'pointer',
              minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'DM Sans, sans-serif', WebkitTapHighlightColor: 'transparent',
            }}
          >✕</button>
        </div>

        {/* Rows */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '0.25rem 1rem calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          display: 'flex', flexDirection: 'column', gap: '0.5rem', cursor: 'default',
        }}>
          {loading
            ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '2.5rem' }}>
                <span style={{
                  width: 24, height: 24, borderRadius: '50%',
                  border: `2px solid ${accent}30`, borderTopColor: accent,
                  animation: 'spin 0.8s linear infinite', display: 'inline-block',
                }} />
              </div>
            )
            : teams.length === 0
            ? (
              <p style={{ color: `${text}30`, textAlign: 'center', fontSize: '0.875rem', paddingTop: '2rem' }}>
                No scores yet
              </p>
            )
            : teams.map((t, i) => {
                const isMe   = t.name.trim().toLowerCase() === myNameNorm
                const medal  = MEDALS[i] ?? null

                return (
                  <motion.div
                    key={t.id}
                    initial={pref ? { opacity: 0 } : { y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: pref ? 0 : 0.055 * i, duration: 0.22, ease: EASE_SNAP }}
                    style={{
                      borderRadius: 10, padding: '0.75rem 0.875rem',
                      background: isMe ? `${accent}25` : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isMe ? `#f5c842` : 'transparent'}`,
                      boxShadow: isMe ? `0 0 0 1px #f5c84222` : 'none',
                      position: 'relative', overflow: 'hidden',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
                      <span style={{ fontSize: '1.05rem', width: 24, textAlign: 'center', flexShrink: 0 }}>
                        {medal ?? <span style={{ color: `${text}30`, fontSize: '0.8rem', fontWeight: 700 }}>{i + 1}</span>}
                      </span>
                      <span style={{
                        flex: 1, color: isMe ? '#f5c842' : `${text}f2`,
                        fontSize: '0.9375rem', fontWeight: isMe ? 700 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontFamily: 'DM Sans, sans-serif',
                      }}>
                        {t.name.length > 22 ? `${t.name.slice(0, 21)}…` : t.name}
                        {isMe && <span style={{ color: '#f5c84266', fontSize: '0.72rem', fontWeight: 400, marginLeft: '0.4rem' }}>← you</span>}
                      </span>
                      <span style={{
                        fontFamily: 'Boogaloo, Anton, sans-serif', fontSize: '1.05rem', flexShrink: 0,
                        color: i === 0 ? '#f5c842' : isMe ? '#f5c842' : `${text}8c`,
                      }}>
                        {t.total}
                      </span>
                    </div>
                  </motion.div>
                )
              })
          }
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Landscape prompt ─────────────────────────────────────────────────────────
function LandscapePrompt() {
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth)
  const [dismissed, setDismissed] = useState(false)
  const pref = useReducedMotion()

  useEffect(() => {
    function update() {
      const isPortrait = window.innerHeight > window.innerWidth
      setPortrait(isPortrait)
      if (!isPortrait) setDismissed(false)
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return (
    <AnimatePresence>
      {portrait && !dismissed && (
        <motion.div
          initial={pref ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={pref ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          transition={pref ? { duration: 0.2 } : { ease: EASE_DRAWER, duration: 0.35 }}
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 600,
            background: 'rgba(5,5,5,0.96)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px 20px 0 0',
            padding: 'clamp(1.25rem,4vw,1.75rem) 1.5rem',
            paddingBottom: 'calc(clamp(1.25rem,4vw,1.75rem) + env(safe-area-inset-bottom, 0px))',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <span style={{
              fontSize: '2.5rem', display: 'block', lineHeight: 1,
              animation: pref ? 'none' : 'rotatePulse 2s ease-in-out infinite',
            }}>
              📱
            </span>
            <div>
              <p style={{ fontFamily: 'Boogaloo, sans-serif', fontSize: '1.2rem', color: '#fff', margin: 0, lineHeight: 1.2 }}>
                Rotate for a better view
              </p>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem', margin: '0.25rem 0 0', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.4 }}>
                Turn your phone sideways to see the full question
              </p>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, color: 'rgba(255,255,255,0.45)', fontSize: '0.8rem',
              padding: '0.5rem 1.25rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              WebkitTapHighlightColor: 'transparent', minHeight: 40,
            }}
          >
            Stay in portrait
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Grading popup ────────────────────────────────────────────────────────────
// Shown instead of the scores drawer when a team tries to peek at the
// scoreboard while the host is mid-grading-break — auto-dismisses, no button.
function GradingPopup({ visible, onDismiss }) {
  const pref = useReducedMotion()

  useEffect(() => {
    if (!visible) return
    const t = setTimeout(onDismiss, 2600)
    return () => clearTimeout(t)
  }, [visible, onDismiss])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={pref ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={pref ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          transition={pref ? { duration: 0.2 } : { ease: EASE_DRAWER, duration: 0.35 }}
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 600,
            background: 'rgba(5,5,5,0.96)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px 20px 0 0',
            padding: 'clamp(1.25rem,4vw,1.75rem) 1.5rem',
            paddingBottom: 'calc(clamp(1.25rem,4vw,1.75rem) + env(safe-area-inset-bottom, 0px))',
            display: 'flex', alignItems: 'center', gap: '1.25rem',
          }}
        >
          <div>
            <p style={{ fontFamily: 'Boogaloo, sans-serif', fontSize: '1.2rem', color: '#fff', margin: 0, lineHeight: 1.2 }}>
              Ben is grading right now — calm your pants 👖
            </p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem', margin: '0.25rem 0 0', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.4 }}>
              Scores will be back up once grading wraps
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Reconnecting banner ──────────────────────────────────────────────────────
function ReconnectingBanner({ visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -44, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -44, opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_SNAP }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
            background: 'rgba(255,195,50,0.93)', color: '#1a1000',
            fontSize: '0.8rem', fontWeight: 600, textAlign: 'center',
            padding: '0.55rem', fontFamily: 'DM Sans, sans-serif',
            backdropFilter: 'blur(4px)',
          }}
        >
          Reconnecting…
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Live view ────────────────────────────────────────────────────────────────
function LiveView({ show, team, powerupUsed, onInvokePowerup, theme, onOpenScores }) {
  const [viewedIndex, setViewedIndex]         = useState(0)
  const [powerupConfirming, setPowerupConfirming] = useState(false)
  const [powerupInvoking, setPowerupInvoking]   = useState(false)
  const [powerupError, setPowerupError]         = useState(null)

  const bg        = theme?.colors?.bg       ?? '#050505'
  const bgDeep    = theme?.colors?.bgDeep   ?? '#020202'
  const accent    = theme?.colors?.accent   ?? '#1a6b4a'
  const highlight = theme?.colors?.highlight ?? '#4dffc3'
  const text      = theme?.colors?.text      ?? '#ffffff'

  // Keep viewedIndex ≤ host's position
  useEffect(() => {
    const hostIndex = show?.current_slide_index ?? 0
    setViewedIndex(prev => Math.min(prev, hostIndex))
  }, [show?.current_slide_index])

  const slides = useMemo(
    () => (show?.slides ?? []).slice().sort((a, b) => a.order - b.order),
    [show?.slides]
  )
  const currentSlide  = slides[viewedIndex] ?? null
  const canGoBack     = viewedIndex > 0
  const isBehindLive  = viewedIndex < (show?.current_slide_index ?? 0)
  const powerup       = show?.powerups?.[0] ?? null

  // A slide the player has scrolled back to review was already revealed by
  // definition (the host can't advance past a slide without revealing it
  // first) — only the LEADING slide (viewedIndex === host's index) needs this
  // check. goLive/goLiveFrom set current_slide_index the instant the host
  // presses Go Live, but deliberately leave current_slide_id null until the
  // host's first explicit "next" reveals it — without this check, a phone
  // would render that slide's real content (question text, etc.) the moment
  // is_live flips true, before the TV shows anything but the pre-show screen.
  const hostIndex = show?.current_slide_index ?? 0
  const revealed  = viewedIndex < hostIndex || show?.current_slide_id != null
  const visibleSlide = revealed ? currentSlide : null

  // Top bar content — round context whenever the current slide belongs to a
  // round, regardless of slide type (not just question/round-intro)
  const currentRound = show?.rounds?.find(r => r.id === visibleSlide?.roundId) ?? null
  const topLeft  = currentRound?.title ?? ''
  const topRight = visibleSlide?.type === 'question' ? (visibleSlide.data?.questionLabel ?? '') : ''

  async function handleBack() {
    if (!canGoBack) return
    setViewedIndex(v => v - 1)
    if (team?.id) {
      await supabase.from('teams').update({ last_action: 'went_back', last_action_at: new Date().toISOString() }).eq('id', team.id)
    }
  }

  async function handleJumpToCurrent() {
    if (!isBehindLive) return
    setViewedIndex(show?.current_slide_index ?? 0)
    if (team?.id) {
      await supabase.from('teams').update({ last_action: 'caught_up', last_action_at: new Date().toISOString() }).eq('id', team.id)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(180deg, ${bg} 0%, ${bgDeep} 100%)`, display: 'flex', flexDirection: 'column', fontFamily: 'DM Sans, sans-serif' }}>

      {/* TOP BAR — paddingTop accounts for Dynamic Island / notch when viewport-fit=cover */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        background: `${bg}e8`, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: '1rem', paddingRight: '1rem',
        minHeight: 56,
      }}>
        <span style={{
          color: `${highlight}cc`, fontSize: '0.8rem', fontWeight: 600,
          maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {topLeft}
        </span>
        <span style={{ color: highlight, fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
          {topRight}
        </span>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div style={{ flex: 1, padding: 'calc(4.5rem + env(safe-area-inset-top, 0px)) 1.25rem 5.75rem', overflowY: 'auto' }}>
        <ErrorBoundary
          key={visibleSlide?.id}
          fallback={
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
              Content unavailable
            </p>
          }
        >
          {revealed ? (
            <SlideContent slide={visibleSlide} show={show} theme={theme} />
          ) : (
            <p style={{ color: `${text}50`, fontSize: 'clamp(1rem, 4vw, 1.2rem)', lineHeight: 1.5, margin: 0, fontStyle: 'italic', textAlign: 'center', padding: '2rem 0' }}>
              Get ready…
            </p>
          )}
        </ErrorBoundary>

        {/* Back / catch-up navigation */}
        {(isBehindLive || canGoBack) && (
          <div style={{ marginTop: '2rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {isBehindLive && (
              <button
                onClick={handleJumpToCurrent}
                onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                onPointerUp={e   => e.currentTarget.style.transform = 'scale(1)'}
                onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                style={{
                  background: `${accent}30`, border: `1px solid ${accent}50`, borderRadius: 10, color: highlight,
                  fontSize: '0.875rem', fontWeight: 600, padding: '0.65rem 1rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  minHeight: 44, WebkitTapHighlightColor: 'transparent',
                  fontFamily: 'DM Sans, sans-serif',
                  transition: 'transform 120ms ease',
                }}
              >
                Current Slide →
              </button>
            )}
            {canGoBack && (
              <button
                onClick={handleBack}
                onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                onPointerUp={e   => e.currentTarget.style.transform = 'scale(1)'}
                onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: 'none', borderRadius: 10, color: `${text}65`,
                  fontSize: '0.875rem', fontWeight: 500, padding: '0.65rem 1rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  minHeight: 44, WebkitTapHighlightColor: 'transparent',
                  fontFamily: 'DM Sans, sans-serif',
                  transition: 'transform 120ms ease',
                }}
              >
                ← Back
              </button>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM BAR */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 'auto', zIndex: 200,
        background: `${bg}f0`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center',
        padding: `0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px))`,
        gap: '0.5rem', minHeight: 64,
      }}>
        {/* Scoreboard button */}
        <button
          onClick={onOpenScores}
          onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          style={{
            flex: 1, height: 44, padding: '0 0.75rem', borderRadius: 10,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: `${text}70`, fontSize: '0.8rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            WebkitTapHighlightColor: 'transparent',
            transition: 'transform 120ms ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
            whiteSpace: 'nowrap',
          }}
        >
          📊 Scores
        </button>

        {/* Powerup */}
        {powerup && (
          <div style={{ flex: '0 0 auto', position: 'relative' }}>
            {/* Confirm popover */}
            <AnimatePresence>
              {powerupConfirming && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.16, ease: EASE_SNAP }}
                  style={{
                    position: 'absolute', bottom: 52, right: 0, width: 224,
                    background: `color-mix(in srgb, ${bg} 95%, #fff 5%)`,
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 14, padding: '0.875rem', zIndex: 300,
                    boxShadow: '0 -8px 32px rgba(0,0,0,0.55)',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  <p style={{ color: text, fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
                    Use {powerup.icon} {powerup.name}?
                  </p>
                  <p style={{ color: `${text}55`, fontSize: '0.775rem', lineHeight: 1.5, margin: '0 0 0.75rem' }}>
                    {powerup.description} This can&apos;t be undone.
                  </p>
                  {powerupError && (
                    <p style={{ color: '#ff6b6b', fontSize: '0.75rem', margin: '0 0 0.6rem', lineHeight: 1.4 }}>
                      {powerupError}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => { setPowerupConfirming(false); setPowerupError(null) }}
                      disabled={powerupInvoking}
                      style={{ flex: 1, padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', color: `${text}65`, fontSize: '0.8rem', fontWeight: 500, cursor: powerupInvoking ? 'default' : 'pointer', opacity: powerupInvoking ? 0.4 : 1, minHeight: 44, fontFamily: 'DM Sans, sans-serif' }}
                    >Cancel</button>
                    <button
                      onClick={async () => {
                        if (powerupInvoking) return
                        setPowerupInvoking(true)
                        setPowerupError(null)
                        try {
                          await onInvokePowerup()
                          setPowerupConfirming(false)
                        } catch (err) {
                          setPowerupError(err.message ?? "Couldn't use powerup — try again")
                        } finally {
                          setPowerupInvoking(false)
                        }
                      }}
                      disabled={powerupInvoking}
                      style={{ flex: 1, padding: '0.55rem', borderRadius: 8, background: powerupInvoking ? '#a01010' : '#e02020', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: powerupInvoking ? 'default' : 'pointer', minHeight: 44, fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                    >
                      {powerupInvoking
                        ? (<><span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />Using…</>)
                        : <>{powerup.icon} Use it!</>
                      }
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={() => { if (!powerupUsed) { setPowerupConfirming(c => !c); setPowerupError(null) } }}
              style={{
                height: 44, minWidth: 44, borderRadius: 10, padding: '0 0.6rem',
                background: powerupUsed ? 'rgba(255,255,255,0.04)' : `${accent}20`,
                border: `1px solid ${powerupUsed ? 'rgba(255,255,255,0.08)' : `${accent}40`}`,
                color: powerupUsed ? `${text}22` : highlight,
                fontSize: '1.1rem', cursor: powerupUsed ? 'default' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, WebkitTapHighlightColor: 'transparent',
              }}
              title={powerupUsed ? 'Used' : `Use ${powerup.name}`}
            >
              <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{powerup.icon}</span>
              {powerupUsed && <span style={{ fontSize: '0.6rem', color: `${text}40`, lineHeight: 1, marginTop: 2 }}>Used ✓</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Join() {
  const [searchParams] = useSearchParams()
  const showParam = searchParams.get('show')

  const [phase, setPhase]         = useState('loading')
  const [show, setShow]           = useState(null)
  const [team, setTeam]           = useState(null)
  const [powerupUsed, setPowerupUsed] = useState(false)
  const [initError, setInitError]             = useState(null)
  const [connStatus, setConnStatus]           = useState('SUBSCRIBED')
  const [scoresDrawerOpen, setScoresDrawerOpen]   = useState(false)
  const [scoresDrawerTeams, setScoresDrawerTeams] = useState([])
  const [scoresDrawerLoading, setScoresDrawerLoading] = useState(false)
  const [gradingPopup, setGradingPopup]           = useState(false)

  const theme = useMemo(() => show?.theme_id ? getTheme(show.theme_id) : null, [show?.theme_id])

  // ── Mount: fetch show + restore session ───────────────────────────────
  useEffect(() => {
    if (!showParam) { setPhase('no-show'); return }

    async function init() {
      // Show fetch — hard network failure → error screen, not register
      let fetchedShow = null
      try {
        if (showParam === 'live') {
          const { data } = await supabase.from('shows').select('*').eq('is_live', true).single()
          fetchedShow = data
        } else {
          const { data } = await supabase.from('shows').select('*').eq('id', showParam).single()
          fetchedShow = data
        }
      } catch {
        setInitError("Can't reach the show right now — check your connection and refresh.")
        setPhase('error')
        return
      }
      if (!fetchedShow) { setPhase('no-show'); return }
      setShow(fetchedShow)

      // Session restore — verify team still exists
      const stored = loadStoredTeam(fetchedShow.id)
      if (stored?.id) {
        try {
          const { data: teamRow } = await supabase.from('teams').select('id, name, color, powerup_used').eq('id', stored.id).single()
          if (teamRow) {
            setTeam({ ...stored, ...teamRow })
            setPowerupUsed(teamRow.powerup_used ?? false)
            setPhase(fetchedShow.is_live ? 'live' : 'waiting')
            return
          }
        } catch {
          // network error on session restore — treat as stale, fall through to register
        }
        // stale or unreachable — clear dead entry so it doesn't retry next time
        localStorage.removeItem(getTeamKey(fetchedShow.id))
      }
      setPhase('register')
    }

    init()
  }, [showParam])

  // ── Subscribe to show updates ─────────────────────────────────────────
  useEffect(() => {
    if (!show?.id) return
    const channel = supabase
      .channel(`join-show:${show.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shows', filter: `id=eq.${show.id}` },
        (payload) => {
          setShow(payload.new)
          if (payload.new.is_live) setPhase(prev => prev === 'waiting' ? 'live' : prev)
        }
      )
      .subscribe(status => setConnStatus(status))
    return () => supabase.removeChannel(channel)
  }, [show?.id])

  // ── Keep viewedIndex ≤ host (handled inside LiveView) ─────────────────

  // ── Scoreboard drawer live updates ───────────────────────────────────
  useEffect(() => {
    if (!scoresDrawerOpen || !show?.id) return
    const channel = supabase
      .channel(`scores-drawer:${show.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'scoreboard_teams', filter: `show_id=eq.${show.id}` },
        () => { openScoresDrawer() }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [scoresDrawerOpen, show?.id])

  // ── visibilitychange ──────────────────────────────────────────────────
  useEffect(() => {
    if (!team?.id) return
    async function handleVisibility() {
      const { error } = await supabase.from('teams').update({
        is_connected: !document.hidden,
        last_action: document.hidden ? 'left_app' : null,
        last_action_at: new Date().toISOString(),
      }).eq('id', team.id)
      if (error) console.error('teams presence update failed:', error)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [team?.id])

  // ── Register ──────────────────────────────────────────────────────────
  async function handleRegister(name) {
    const actualShowId = show.id
    // Fetch all names and compare case-insensitively in JS to avoid ILIKE
    // metachar injection (% or _ in a team name would wildcard-match everything).
    // This pre-check is just a fast path for the common case — it's a
    // TOCTOU race (two phones registering the same name within the same
    // ~100ms window could both pass it), so the actual enforcement is the
    // teams_show_id_lower_name_key unique index (show_id, lower(name));
    // the 23505 catch below is what closes the race for real.
    const { data: allTeams } = await supabase.from('teams').select('name').eq('show_id', actualShowId)
    const taken = (allTeams ?? []).some(t => t.name.toLowerCase() === name.toLowerCase())
    if (taken) throw new Error("That name's taken — try another")

    const color  = TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)]
    const teamId = `team_${nanoid(8)}`
    const { error } = await supabase.from('teams').insert({ id: teamId, show_id: actualShowId, name, color, is_connected: true, powerup_used: false })
    if (error) {
      if (error.code === '23505') throw new Error("That name's taken — try another")
      throw new Error(error.message)
    }

    const newTeam = { id: teamId, name, color, showId: actualShowId }
    setTeam(newTeam)
    saveStoredTeam(actualShowId, newTeam)
    setPowerupUsed(false)
    setPhase(show.is_live ? 'live' : 'waiting')
  }

  // ── Powerup ───────────────────────────────────────────────────────────
  async function handleInvokePowerup() {
    if (!team?.id) return
    const { error } = await supabase.from('teams').update({
      powerup_used: true,
      powerup_used_on: show?.current_slide_id ?? null,
      last_action: 'used_powerup',
      last_action_at: new Date().toISOString(),
    }).eq('id', team.id)
    if (error) throw new Error("Couldn't use powerup — try again")
    setPowerupUsed(true)
  }

  // ── Scores drawer ─────────────────────────────────────────────────────
  async function openScoresDrawer() {
    const currentSlide = show?.slides?.find(s => s.id === show.current_slide_id)
    if (currentSlide?.type === 'grading-break') {
      setGradingPopup(true)
      return
    }
    setScoresDrawerOpen(true)
    setScoresDrawerLoading(true)
    try {
      const { data } = await supabase
        .from('scoreboard_teams')
        .select('id, name, scores')
        .eq('show_id', show?.id)
        .order('sort_order', { ascending: true })
      const cols = show ? deriveRoundCols(show) : []
      const withTotals = (data ?? [])
        .map(t => ({ ...t, total: computeTotal(t.scores, cols) }))
        .sort((a, b) => b.total - a.total)
      setScoresDrawerTeams(withTotals)
    } catch {
      setScoresDrawerTeams([])
    } finally {
      setScoresDrawerLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const disconnected = connStatus === 'CHANNEL_ERROR' || connStatus === 'TIMED_OUT' || connStatus === 'CLOSED'

  if (!showParam) {
    return (
      <div style={{ minHeight: '100dvh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.9rem', textAlign: 'center', fontFamily: 'DM Sans, sans-serif' }}>
          Scan the QR code at Baynes to join tonight's trivia!
        </p>
      </div>
    )
  }

  if (phase === 'loading') return <LoadingScreen />
  if (phase === 'no-show') return <NoShowScreen />
  if (phase === 'error')   return <ErrorScreen message={initError} />

  return (
    <>
      <ReconnectingBanner visible={disconnected} />
      <GradingPopup visible={gradingPopup} onDismiss={() => setGradingPopup(false)} />
      {phase === 'register' && <RegistrationScreen onRegister={handleRegister} show={show} theme={theme} />}
      {phase === 'waiting'  && (
        <>
          <WaitingScreen teamName={team?.name ?? ''} theme={theme} onOpenScores={openScoresDrawer} />
          <LandscapePrompt />
        </>
      )}
      {phase === 'live'     && (
        <>
          <LiveView
            show={show}
            team={team}
            powerupUsed={powerupUsed}
            onInvokePowerup={handleInvokePowerup}
            theme={theme}
            onOpenScores={openScoresDrawer}
          />
          <LandscapePrompt />
        </>
      )}

      {/* Global scores drawer — available in waiting + live phases */}
      <AnimatePresence>
        {scoresDrawerOpen && (
          <ScoresDrawer
            teams={scoresDrawerTeams}
            loading={scoresDrawerLoading}
            myTeamName={team?.name ?? ''}
            onClose={() => setScoresDrawerOpen(false)}
            theme={theme}
          />
        )}
      </AnimatePresence>
    </>
  )
}
