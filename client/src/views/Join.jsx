import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { nanoid } from 'nanoid'
import { supabase } from '../lib/supabase.js'
import { getTheme } from '../themes/index.js'
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
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
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
function WaitingScreen({ teamName, myScore, theme }) {
  const pref   = useReducedMotion()
  const bg        = theme?.colors?.bg       ?? '#050505'
  const accent    = theme?.colors?.accent   ?? '#1a6b4a'
  const highlight = theme?.colors?.highlight ?? '#4dffc3'
  const text      = theme?.colors?.text      ?? '#ffffff'

  return (
    <div style={{
      minHeight: '100dvh', background: bg,
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
            animation: 'breathePulse 2.2s ease-in-out infinite',
            display: 'inline-block',
          }} />
          <span style={{ color: `${text}45`, fontSize: '0.8rem' }}>Waiting for Ben…</span>
        </motion.div>
      </div>

      {/* Score bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '0.875rem 1.5rem calc(0.875rem + env(safe-area-inset-bottom, 0px))',
        background: `${bg}e8`, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ color: `${text}45`, fontSize: '0.8rem' }}>Your score</span>
        <span style={{ fontFamily: 'Boogaloo, Anton, sans-serif', color: `${text}45`, fontSize: '1rem' }}>
          {myScore > 0 ? `${myScore} pts` : '—'}
        </span>
      </div>
    </div>
  )
}

// ─── Slide content ────────────────────────────────────────────────────────────
function SlideContent({ slide, show, theme }) {
  if (!slide) return null
  const text      = theme?.colors?.text      ?? '#ffffff'
  const accent    = theme?.colors?.accent   ?? '#1a6b4a'
  const highlight = theme?.colors?.highlight ?? '#4dffc3'
  const round     = show?.rounds?.find(r => r.id === slide.roundId) ?? null

  switch (slide.type) {
    case 'question':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {round?.title && (
              <span style={{ color: `${text}55`, fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {round.title}
              </span>
            )}
            {slide.data.questionLabel && (
              <span style={{ background: accent, color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 6, letterSpacing: '0.03em' }}>
                {slide.data.questionLabel}
              </span>
            )}
            {slide.data.isShiny && (
              <span style={{ color: '#f5c842', fontSize: '0.8rem' }}>✨</span>
            )}
          </div>

          {slide.data.isSeries && slide.data.seriesTheme && (
            <div style={{
              background: `${accent}2a`, border: `1px solid ${accent}44`,
              borderRadius: 8, padding: '0.3rem 0.65rem',
              display: 'inline-flex', alignSelf: 'flex-start',
            }}>
              <span style={{ color: highlight, fontSize: '0.8rem', fontWeight: 600 }}>{slide.data.seriesTheme}</span>
            </div>
          )}

          <p style={{
            color: text, fontSize: 'clamp(1.15rem, 4.5vw, 1.35rem)',
            lineHeight: 1.55, margin: 0, fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
          }}>
            {slide.data.text || <span style={{ opacity: 0.3, fontStyle: 'italic' }}>No question text</span>}
          </p>

          {slide.data.mediaUrl && slide.data.mediaType?.startsWith('image/') && (
            <img src={slide.data.mediaUrl} alt="Question media"
              style={{ width: '100%', borderRadius: 10, objectFit: 'cover', maxHeight: 220 }} />
          )}
          {slide.data.mediaUrl && slide.data.mediaType?.startsWith('audio/') && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '0.75rem 1rem', textAlign: 'center' }}>
              <p style={{ color: `${text}55`, fontSize: '0.875rem', margin: 0 }}>🎵 Listen on the main screen</p>
            </div>
          )}
        </div>
      )

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

// ─── Scoreboard sheet ─────────────────────────────────────────────────────────
function ScoreboardSheet({ leaderboard, myTeamId, onClose, theme }) {
  const pref      = useReducedMotion()
  const text      = theme?.colors?.text      ?? '#ffffff'
  const accent    = theme?.colors?.accent   ?? '#1a6b4a'
  const highlight = theme?.colors?.highlight ?? '#4dffc3'
  const bg        = theme?.colors?.bg       ?? '#050505'
  const maxScore  = leaderboard.length > 0 ? Math.max(...leaderboard.map(t => t.total)) : 1

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)', zIndex: 400,
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
            🏆 Leaderboard
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 1rem calc(1.5rem + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: '0.5rem', cursor: 'default' }}>
          {leaderboard.length === 0
            ? <p style={{ color: `${text}30`, textAlign: 'center', fontSize: '0.875rem', paddingTop: '2rem' }}>No scores yet</p>
            : leaderboard.map((team, i) => {
                const isMe    = team.id === myTeamId
                const medal   = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                const barPct  = maxScore > 0 ? Math.max(4, (team.total / maxScore) * 100) : 4

                return (
                  <motion.div
                    key={team.id}
                    initial={pref ? { opacity: 0 } : { y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: pref ? 0 : 0.055 * i, duration: 0.22, ease: EASE_SNAP }}
                    style={{
                      borderRadius: 10, padding: '0.75rem 0.875rem',
                      background: isMe ? `${accent}25` : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isMe ? `${accent}50` : 'transparent'}`,
                      position: 'relative', overflow: 'hidden',
                    }}
                  >
                    {/* Score bar — scaleX is GPU-composited, width is not */}
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: barPct / 100 }}
                      transition={{ delay: pref ? 0 : 0.055 * i + 0.12, duration: 0.48, ease: [0.4, 0, 0.2, 1] }}
                      style={{
                        position: 'absolute', bottom: 0, left: 0, height: 2, width: '100%',
                        transformOrigin: 'left center',
                        background: isMe ? highlight : `${text}28`,
                        borderRadius: '0 2px 2px 0',
                        willChange: 'transform',
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
                      <span style={{ fontSize: '1.05rem', width: 24, textAlign: 'center', flexShrink: 0 }}>
                        {medal ?? <span style={{ color: `${text}30`, fontSize: '0.8rem', fontWeight: 700 }}>{i + 1}</span>}
                      </span>
                      <span style={{
                        flex: 1, color: isMe ? text : `${text}65`,
                        fontSize: '0.9375rem', fontWeight: isMe ? 600 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontFamily: 'DM Sans, sans-serif',
                      }}>
                        {team.name.length > 22 ? `${team.name.slice(0, 21)}…` : team.name}
                        {isMe && <span style={{ color: `${text}35`, fontSize: '0.72rem', fontWeight: 400, marginLeft: '0.4rem' }}>← you</span>}
                      </span>
                      <span style={{
                        fontFamily: 'Boogaloo, Anton, sans-serif', fontSize: '1.05rem', flexShrink: 0,
                        color: i === 0 ? '#f5c842' : isMe ? highlight : `${text}60`,
                      }}>
                        {team.total}
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
function LiveView({ show, team, powerupUsed, onInvokePowerup, myScores, leaderboard, theme }) {
  const [showScoreboard, setShowScoreboard]   = useState(false)
  const [viewedIndex, setViewedIndex]         = useState(show?.current_slide_index ?? 0)
  const [powerupConfirming, setPowerupConfirming] = useState(false)
  const pref = useReducedMotion()
  const prevRevealedRef = useRef(show?.scores_revealed ?? false)

  const bg        = theme?.colors?.bg       ?? '#050505'
  const accent    = theme?.colors?.accent   ?? '#1a6b4a'
  const highlight = theme?.colors?.highlight ?? '#4dffc3'
  const text      = theme?.colors?.text      ?? '#ffffff'

  // Auto-open scoreboard on first scores reveal
  useEffect(() => {
    if (show?.scores_revealed && !prevRevealedRef.current) setShowScoreboard(true)
    prevRevealedRef.current = show?.scores_revealed ?? false
  }, [show?.scores_revealed])

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
  const totalScore    = myScores.reduce((sum, s) => sum + (s.score || 0), 0)
  const scoreboardOn  = (show?.scoreboard_visible ?? false) && leaderboard
  const powerup       = show?.powerups?.[0] ?? null

  // Top bar content
  let topLeft = '', topRight = ''
  if (currentSlide?.type === 'question') {
    const r = show?.rounds?.find(rd => rd.id === currentSlide.roundId)
    topLeft  = r?.title ?? ''
    topRight = currentSlide.data.questionLabel ?? ''
  } else if (currentSlide?.type === 'round-intro') {
    topLeft = currentSlide.data.roundTitle ?? ''
  }

  async function handleBack() {
    if (!canGoBack) return
    setViewedIndex(v => v - 1)
    if (team?.id) {
      await supabase.from('teams').update({ last_action: 'went_back', last_action_at: new Date().toISOString() }).eq('id', team.id)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: bg, display: 'flex', flexDirection: 'column', fontFamily: 'DM Sans, sans-serif' }}>

      {/* Scoreboard sheet */}
      <AnimatePresence>
        {showScoreboard && leaderboard && (
          <ScoreboardSheet
            leaderboard={leaderboard}
            myTeamId={team?.id}
            onClose={() => setShowScoreboard(false)}
            theme={theme}
          />
        )}
      </AnimatePresence>

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
          color: `${accent}cc`, fontSize: '0.8rem', fontWeight: 600,
          maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {topLeft}
        </span>
        <span style={{ color: accent, fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
          {topRight}
        </span>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div style={{ flex: 1, padding: 'calc(4.5rem + env(safe-area-inset-top, 0px)) 1.25rem 5.75rem', overflowY: 'auto' }}>
        <SlideContent slide={currentSlide} show={show} theme={theme} />

        {/* Back navigation */}
        {canGoBack && (
          <button
            onClick={handleBack}
            onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onPointerUp={e   => e.currentTarget.style.transform = 'scale(1)'}
            onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            style={{
              marginTop: '2rem', background: 'rgba(255,255,255,0.07)',
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

      {/* BOTTOM BAR */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 'auto', zIndex: 200,
        background: `${bg}f0`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center',
        padding: `0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px))`,
        gap: '0.5rem', minHeight: 64,
      }}>
        {/* Score */}
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 60 }}>
          <span style={{ color: `${text}45`, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1 }}>Score</span>
          <span style={{ fontFamily: 'Boogaloo, Anton, sans-serif', fontSize: '1.15rem', lineHeight: 1.25, color: totalScore > 0 ? highlight : `${text}35` }}>
            {totalScore > 0 ? `${totalScore} pts` : '—'}
          </span>
        </div>

        {/* Scoreboard pill */}
        <button
          onClick={() => scoreboardOn && setShowScoreboard(true)}
          disabled={!scoreboardOn}
          onPointerDown={e => { if (scoreboardOn) e.currentTarget.style.transform = 'scale(0.97)' }}
          onPointerUp={e   => { e.currentTarget.style.transform = 'scale(1)' }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          style={{
            flex: 1, height: 44, borderRadius: 10,
            background: scoreboardOn ? `${accent}30` : 'rgba(255,255,255,0.05)',
            border: `1px solid ${scoreboardOn ? `${accent}50` : 'rgba(255,255,255,0.08)'}`,
            color: scoreboardOn ? highlight : `${text}28`,
            fontSize: '0.85rem', fontWeight: 600,
            cursor: scoreboardOn ? 'pointer' : 'default',
            opacity: scoreboardOn ? 1 : 0.5,
            transition: 'transform 120ms ease',
            fontFamily: 'DM Sans, sans-serif',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          🏆 Scores
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
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setPowerupConfirming(false)}
                      style={{ flex: 1, padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', color: `${text}65`, fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', minHeight: 44, fontFamily: 'DM Sans, sans-serif' }}
                    >Cancel</button>
                    <button
                      onClick={async () => { await onInvokePowerup(); setPowerupConfirming(false) }}
                      style={{ flex: 1, padding: '0.55rem', borderRadius: 8, background: '#e02020', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', minHeight: 44, fontFamily: 'DM Sans, sans-serif' }}
                    >{powerup.icon} Use it!</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={() => !powerupUsed && setPowerupConfirming(c => !c)}
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
  const [myScores, setMyScores]   = useState([])
  const [leaderboard, setLeaderboard] = useState(null)
  const [connStatus, setConnStatus]   = useState('SUBSCRIBED')

  const theme = useMemo(() => show?.theme_id ? getTheme(show.theme_id) : null, [show?.theme_id])

  // ── Mount: fetch show + restore session ───────────────────────────────
  useEffect(() => {
    if (!showParam) { setPhase('no-show'); return }

    async function init() {
      try {
        let fetchedShow = null
        if (showParam === 'live') {
          const { data } = await supabase.from('shows').select('*').eq('is_live', true).single()
          fetchedShow = data
        } else {
          const { data } = await supabase.from('shows').select('*').eq('id', showParam).single()
          fetchedShow = data
        }
        if (!fetchedShow) { setPhase('no-show'); return }
        setShow(fetchedShow)

        // Session restore — verify team still exists
        const stored = loadStoredTeam(fetchedShow.id)
        if (stored?.id) {
          const { data: teamRow } = await supabase.from('teams').select('id, name, color, powerup_used').eq('id', stored.id).single()
          if (teamRow) {
            setTeam({ ...stored, ...teamRow })
            setPowerupUsed(teamRow.powerup_used ?? false)
            setPhase(fetchedShow.is_live ? 'live' : 'waiting')
            return
          }
        }
        setPhase('register')
      } catch {
        setPhase('register')
      }
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
  // ── Team scores subscription ──────────────────────────────────────────
  useEffect(() => {
    if (!team?.id) return
    supabase.from('team_scores').select('round_index, score').eq('team_id', team.id)
      .then(({ data }) => { if (data) setMyScores(data) })
    const channel = supabase
      .channel(`my-scores:${team.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'team_scores', filter: `team_id=eq.${team.id}` },
        (payload) => {
          if (payload.eventType !== 'DELETE') {
            setMyScores(prev => {
              const rest = prev.filter(s => s.round_index !== payload.new.round_index)
              return [...rest, { round_index: payload.new.round_index, score: payload.new.score }]
            })
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [team?.id])

  // ── Leaderboard ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!show?.scores_revealed || !show?.id) { setLeaderboard(null); return }
    async function load() {
      const [{ data: teams }, { data: scores }] = await Promise.all([
        supabase.from('teams').select('id, name, color').eq('show_id', show.id).order('registered_at'),
        supabase.from('team_scores').select('team_id, score').eq('show_id', show.id),
      ])
      const built = (teams ?? [])
        .map(t => ({ ...t, total: (scores ?? []).filter(s => s.team_id === t.id).reduce((sum, s) => sum + (s.score || 0), 0) }))
        .sort((a, b) => b.total - a.total)
      setLeaderboard(built)
    }
    load()
  }, [show?.scores_revealed, show?.id])

  // ── visibilitychange ──────────────────────────────────────────────────
  useEffect(() => {
    if (!team?.id) return
    function handleVisibility() {
      supabase.from('teams').update({
        is_connected: !document.hidden,
        last_action: document.hidden ? 'left_app' : null,
        last_action_at: new Date().toISOString(),
      }).eq('id', team.id)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [team?.id])

  // ── Register ──────────────────────────────────────────────────────────
  async function handleRegister(name) {
    const actualShowId = show.id
    const { data: existing } = await supabase.from('teams').select('id').eq('show_id', actualShowId).ilike('name', name).single()
    if (existing) throw new Error("That name's taken — try another")

    const color  = TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)]
    const teamId = `team_${nanoid(8)}`
    const { error } = await supabase.from('teams').insert({ id: teamId, show_id: actualShowId, name, color, is_connected: true, powerup_used: false })
    if (error) throw new Error(error.message)

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
    if (!error) setPowerupUsed(true)
  }

  // ── Render ────────────────────────────────────────────────────────────
  const totalScore = myScores.reduce((sum, s) => sum + (s.score || 0), 0)
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

  return (
    <>
      <ReconnectingBanner visible={disconnected} />
      {phase === 'register' && <RegistrationScreen onRegister={handleRegister} show={show} theme={theme} />}
      {phase === 'waiting'  && <WaitingScreen teamName={team?.name ?? ''} myScore={totalScore} theme={theme} />}
      {phase === 'live'     && (
        <LiveView
          show={show}
          team={team}
          powerupUsed={powerupUsed}
          onInvokePowerup={handleInvokePowerup}
          myScores={myScores}
          leaderboard={leaderboard}
          theme={theme}
        />
      )}
    </>
  )
}
