import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { nanoid } from 'nanoid'
import { supabase } from '../lib/supabase.js'
import { deriveRoundCols, computeTotal, MEDALS } from '../lib/scoreboardMath.js'
import { getTheme } from '../themes/index.js'
import { resolveShinyPart, isMatchingShiny, isWagerShiny } from '../lib/shinySeries.js'
import MatchingBoard from '../components/join/MatchingBoard.jsx'
import WagerBoard from '../components/join/WagerBoard.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import BenPhoto from '../components/shared/BenPhoto.jsx'
import { EASE_OUT, EASE_PANEL, EASE_BAR } from '../lib/easings.js'

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
              transition: 'opacity 120ms ease, transform 120ms cubic-bezier(0.23,1,0.32,1)',
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
          transition={{ delay: pref ? 0 : 0.18, duration: 0.28, ease: EASE_OUT }}
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

      {/* Scores pill — top-left, same spot it lives in during the live show */}
      <div style={{
        position: 'fixed', top: 'calc(0.75rem + env(safe-area-inset-top, 0px))', left: '0.75rem', zIndex: 250,
      }}>
        <ScoresPillButton onOpen={onOpenScores} />
      </div>
    </div>
  )
}

// ─── Scores pill ──────────────────────────────────────────────────────────────
// The scoreboard's entry point, everywhere — a small pill, not a full-width
// bottom-bar button, so it fits inline in the LiveView top bar (next to the
// round/question label) or floats standalone during the waiting screen.
function ScoresPillButton({ onOpen }) {
  return (
    <button
      onClick={onOpen}
      onPointerDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
      onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
      onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0,
        height: 34, padding: '0 0.75rem', borderRadius: 17,
        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)',
        color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem', fontWeight: 600,
        fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        transition: 'transform 120ms cubic-bezier(0.23,1,0.32,1)',
      }}
    >
      📊 Scores
    </button>
  )
}

// ─── Follow toggle ──────────────────────────────────────────────────────────
// Governs browsing on ordinary slides only. A phone-interactive slide (wager,
// matching) ignores this entirely and always shows up when it's this team's
// turn to answer — see LiveView's viewedIndex effect. Persisted per-device,
// not per-show, since it's a browsing preference, not show data.
const FOLLOW_MODE_KEY = 'trivia-os:followMode'
function loadFollowMode() {
  try { return localStorage.getItem(FOLLOW_MODE_KEY) === 'follow' ? 'follow' : 'manual' }
  catch { return 'manual' }
}
function FollowToggle({ mode, onChange, theme }) {
  const highlight = theme?.colors?.highlight ?? '#4dffc3'
  return (
    <div style={{
      display: 'flex', borderRadius: 14, background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.12)', padding: 2, flexShrink: 0,
    }}>
      {[['manual', 'Stay'], ['follow', 'Follow']].map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          style={{
            padding: '0.3rem 0.55rem', borderRadius: 11, border: 'none',
            background: mode === id ? highlight : 'transparent',
            color: mode === id ? '#08120d' : 'rgba(255,255,255,0.55)',
            fontSize: '0.68rem', fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── Slide content ────────────────────────────────────────────────────────────
function SlideContent({ slide, show, theme, team, onInteractiveAnswered }) {
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
      if (d.isShiny && isMatchingShiny(d)) {
        return <MatchingBoard slide={slide} team={team} theme={theme} onAnswered={onInteractiveAnswered} />
      }
      // WagerBoard owns the whole question surface, including the prompt —
      // it must not fall through to the plain text render below, or the
      // question would be readable during the blind-wager phase.
      if (d.isShiny && isWagerShiny(d)) {
        return <WagerBoard slide={slide} team={team} theme={theme} onAnswered={onInteractiveAnswered} />
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

  // Mirrors the panel's own CSS width (`min(86vw, 340px)`) so the left drag
  // constraint stops the panel exactly at fully-closed instead of leaving it
  // unboundedly draggable off-screen with no way to reopen it.
  const panelWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.86, 340) : 340

  // Bar length IS the score — every bar is measured against the current
  // leader's, so the leader's is always full and everyone else reads as a
  // fraction of it at a glance. Phone stays team + total only (no round
  // breakdown) — that's the TV board's job.
  const leaderTotal = Math.max(1, ...teams.map(t => t.total ?? 0))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)', zIndex: 450,
        display: 'flex', flexDirection: 'row', justifyContent: 'flex-start',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={pref ? { opacity: 0 } : { x: '-100%' }}
        animate={{ x: 0, opacity: 1 }}
        exit={pref ? { opacity: 0 } : { x: '-100%' }}
        transition={pref
          ? { duration: 0.22 }
          : { ease: EASE_PANEL, duration: 0.32 }}
        // drag='x' (not 'y', unlike the old bottom sheet this replaced) —
        // framer-motion stamps the OPPOSITE axis's touch-action onto this
        // element (pan-y here), which is what actually lets a finger scroll
        // the rows list below; a vertical-drag sheet blocked exactly that.
        drag={pref ? false : 'x'}
        dragConstraints={{ left: -panelWidth, right: 0 }}
        dragElastic={{ left: 0.4, right: 0.05 }}
        // Without this, framer-motion leaves the panel wherever a drag was
        // released — dragConstraints only bounds the drag, it doesn't spring
        // back on its own. A partial swipe that clears neither the velocity
        // nor offset threshold below used to leave the panel resting stuck
        // partway off-screen (still usable via ✕/backdrop, just visibly
        // wrong) since `animate={{x:0}}` never re-fires for a value that
        // never changed on this element's own account.
        dragSnapToOrigin
        onDragEnd={(_, info) => {
          if (info.velocity.x < -300 || info.offset.x < -100) onClose()
        }}
        style={{
          background: `color-mix(in srgb, ${bg} 93%, #000 7%)`,
          borderRadius: '0 20px 20px 0',
          width: 'min(86vw, 340px)', height: '100dvh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          cursor: 'grab', paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem 0.75rem' }}>
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

        {/* Rows — touchAction explicitly set rather than relying solely on
            the parent drag axis, since some WebKit versions still need it
            stated on the actual scrolling element to reliably scroll it. */}
        <div style={{
          flex: 1, overflowY: 'auto', touchAction: 'pan-y',
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
                const isMe     = t.name.trim().toLowerCase() === myNameNorm
                const medal    = MEDALS[i] ?? null
                const isLeader = i === 0
                // A 2% floor keeps a zero-score row from reading as a render
                // bug — it's a nub, not a bar.
                const pct = Math.max(2, ((t.total ?? 0) / leaderTotal) * 100)

                return (
                  <motion.div
                    key={t.id}
                    // `layout="position"` = the pass. When a fetch reorders the
                    // list, rows slide past each other instead of teleporting.
                    // Position-only so the animated bar width inside never gets
                    // scale-corrected by the projection.
                    layout={pref ? false : 'position'}
                    initial={pref ? { opacity: 0 } : { y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                      delay: pref ? 0 : 0.055 * i, duration: 0.22, ease: EASE_OUT,
                      layout: { duration: 0.45, ease: EASE_PANEL },
                    }}
                    style={{
                      borderRadius: 10, padding: '0.75rem 0.875rem',
                      background: isMe ? `${accent}25` : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isMe ? `#f5c842` : 'transparent'}`,
                      boxShadow: isMe ? `0 0 0 1px #f5c84222` : 'none',
                      position: 'relative', overflow: 'hidden',
                      // Row sits in a flex-column scroll container. Without this,
                      // the browser's default flex-shrink:1 crushes every row to
                      // fit the visible area instead of letting the container
                      // scroll — on any phone short on vertical room (most of
                      // them, with >8 teams) every row's text and score collapse
                      // into an illegible, overlapping mess. flexShrink: 0 forces
                      // rows to their natural height and lets overflowY: auto do
                      // its actual job.
                      flexShrink: 0,
                    }}
                  >
                    {/* The bar. Transparent at the left, bright at the right —
                        the fade IS the comet trail; the leader gets the head. */}
                    <motion.div
                      aria-hidden
                      initial={pref ? false : { width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={pref ? { duration: 0 } : { duration: 0.6, ease: EASE_BAR, delay: 0.08 + 0.05 * i }}
                      style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        borderRadius: 10,
                        background: isLeader
                          ? `linear-gradient(90deg, ${accent}00 0%, ${accent}b3 50%, ${highlight}99 100%)`
                          : `linear-gradient(90deg, ${accent}00 0%, ${accent}80 100%)`,
                        boxShadow: isLeader ? `0 0 20px ${highlight}44` : 'none',
                      }}
                    >
                      {isLeader && !pref && (
                        <motion.span
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                          style={{
                            position: 'absolute', right: -3, top: 0, bottom: 0, width: 9,
                            borderRadius: 9, background: highlight, filter: 'blur(3px)',
                          }}
                        />
                      )}
                    </motion.div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
                      <span style={{ fontSize: '1.05rem', width: 24, textAlign: 'center', flexShrink: 0 }}>
                        {/* Bumped from 30 → 70: the rank now sits on top of a
                            bar instead of flat panel and got lost against it. */}
                        {medal ?? <span style={{ color: `${text}70`, fontSize: '0.8rem', fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}>{i + 1}</span>}
                      </span>
                      <span style={{
                        flex: 1, color: isMe ? '#f5c842' : `${text}f2`,
                        fontSize: '0.9375rem', fontWeight: isMe ? 700 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontFamily: 'DM Sans, sans-serif',
                        textShadow: '0 1px 3px rgba(0,0,0,0.55)',
                      }}>
                        {t.name.length > 22 ? `${t.name.slice(0, 21)}…` : t.name}
                        {isMe && <span style={{ color: '#f5c84266', fontSize: '0.72rem', fontWeight: 400, marginLeft: '0.4rem' }}>← you</span>}
                      </span>
                      <span style={{
                        fontFamily: 'Boogaloo, Anton, sans-serif', fontSize: '1.05rem', flexShrink: 0,
                        color: i === 0 ? '#f5c842' : isMe ? '#f5c842' : `${text}f2`,
                        textShadow: '0 1px 3px rgba(0,0,0,0.55)',
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
function LandscapePrompt({ scoresOpen = false }) {
  // Phone-width gate (< 600px) alongside the portrait check — a portrait
  // iPad (e.g. 768x1024) is still "portrait" but is not a phone, and "turn
  // your phone sideways" is the wrong prompt for a device that's perfectly
  // readable in portrait.
  const isPhoneSize = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth && window.innerWidth < 600
  const [portrait, setPortrait] = useState(isPhoneSize)
  const [dismissed, setDismissed] = useState(false)
  const pref = useReducedMotion()

  useEffect(() => {
    function update() {
      const isPortrait = isPhoneSize()
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
      {portrait && !dismissed && !scoresOpen && (
        <motion.div
          initial={pref ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={pref ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          transition={pref ? { duration: 0.2 } : { ease: EASE_PANEL, duration: 0.35 }}
          style={{
            // Sits above the bottom nav bar (its ~88px fixed height + safe
            // area, see the BOTTOM BAR block below) instead of at bottom:0 —
            // both are fixed to the same edge, so bottom:0 here fully
            // covered the nav's Scores/powerup buttons while this was shown.
            position: 'fixed', bottom: 'calc(5.75rem + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, zIndex: 600,
            background: 'rgba(5,5,5,0.96)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20,
            padding: 'clamp(1.25rem,4vw,1.75rem) 1.5rem',
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

// ─── Scores-locked popup ───────────────────────────────────────────────────
// Shown instead of the scores drawer while ScoreboardModal.jsx is open on
// /host — that component owns show.scores_locked_at (a timestamp refreshed
// every 2 minutes while open, cleared on close), so `visible` here is a
// direct read of whether that timestamp is fresh (see isScoresLocked below),
// not a guess based on which slide happens to be showing. No dismiss
// button: it goes away on its own once Ben closes the modal or the lock
// ages out, same as it appeared.
function ScoresLockedPopup({ visible }) {
  const pref = useReducedMotion()

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={pref ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={pref ? { opacity: 0 } : { y: '100%', opacity: 0 }}
          transition={pref ? { duration: 0.2 } : { ease: EASE_PANEL, duration: 0.35 }}
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
              Ben is currently updating the scores. Hold your pants.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem', margin: '0.25rem 0 0', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.4 }}>
              Scores will be back up in a moment
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
          transition={{ duration: 0.2, ease: EASE_OUT }}
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
  const [followMode, setFollowModeState]      = useState(loadFollowMode)
  const [powerupConfirming, setPowerupConfirming] = useState(false)
  const [powerupInvoking, setPowerupInvoking]   = useState(false)
  const [powerupError, setPowerupError]         = useState(null)

  const bg        = theme?.colors?.bg       ?? '#050505'
  const bgDeep    = theme?.colors?.bgDeep   ?? '#020202'
  const accent    = theme?.colors?.accent   ?? '#1a6b4a'
  const highlight = theme?.colors?.highlight ?? '#4dffc3'
  const text      = theme?.colors?.text      ?? '#ffffff'

  function setFollowMode(mode) {
    setFollowModeState(mode)
    try { localStorage.setItem(FOLLOW_MODE_KEY, mode) } catch { /* best-effort */ }
  }

  const slides = useMemo(
    () => (show?.slides ?? []).slice().sort((a, b) => a.order - b.order),
    [show?.slides]
  )
  const hostIndex = show?.current_slide_index ?? 0
  const liveSlide  = slides[hostIndex] ?? null
  // Same predicate SlideContent uses to pick WagerBoard/MatchingBoard, PLUS
  // introDone — SlideContent checks `!d.introDone` first and renders the
  // teaser text (no board at all) during the intro beat, so treating the
  // slide as interactive before introDone flips would force-pin every phone
  // to a screen with no board mounted and no onAnswered wired up.
  //
  // PLUS: not locked. Once wagerGuessesLocked/matchingLocked flips, the
  // board itself stops accepting input (WagerBoard's keypad and Lock In
  // button are gated on `!guessesLocked`; MatchingBoard's tapItem returns
  // early on `locked`) — a team that didn't finish in time can never
  // satisfy onAnswered after that point, so without this check they'd stay
  // force-pinned to a dead "Answers locked" board with no Back button for
  // however long the host lingers on the reveal, which is often the loudest
  // moment of the round. Pinning only makes sense while input is possible.
  const liveSlideIsInteractive = !!(
    liveSlide?.type === 'question' && liveSlide.data?.isShiny && liveSlide.data?.introDone &&
    !liveSlide.data?.wagerGuessesLocked && !liveSlide.data?.matchingLocked &&
    (isMatchingShiny(liveSlide.data) || isWagerShiny(liveSlide.data))
  )

  // Whether THIS team has done what the live interactive slide currently
  // requires — reported by WagerBoard/MatchingBoard's onAnswered, reset
  // whenever the live slide OR its current phase changes. Starts false on
  // every new interactive slide/phase, the safe default (force delivery
  // until proven answered).
  //
  // The reset must key on the phase flags too, not just the slide id — a
  // wager slide's id doesn't change when wagerTiersLocked flips from false
  // to true. Without this, a team that tiers, gets released, then taps Back
  // (unmounting WagerBoard, dropping onAnswered) keeps a stale
  // interactiveSatisfied=true across the lock, and is never force-navigated
  // to the actual guess phase — the exact silent-miss bug this feature
  // exists to close, just narrowed to teams who back out after tiering.
  const interactivePhaseKey = `${liveSlide?.id}:${liveSlide?.data?.introDone}:${liveSlide?.data?.wagerTiersLocked}:${liveSlide?.data?.wagerGuessesLocked}:${liveSlide?.data?.matchingLocked}`
  const [interactiveSatisfied, setInteractiveSatisfied] = useState(false)
  useEffect(() => { setInteractiveSatisfied(false) }, [interactivePhaseKey])

  const forceInteractive = liveSlideIsInteractive && !interactiveSatisfied

  // Follow Along always tracks the host. Stay on Slide lets a team browse at
  // its own pace on ordinary slides — but a phone-interactive slide (wager,
  // matching) overrides BOTH modes: it's not something a team can silently
  // opt out of and miss, so it always takes over the moment it goes live and
  // stays until answered. Re-evaluated on every render (not just once when
  // the slide first goes live), so a phone that reconnects mid-question
  // catches up immediately rather than only if it happened to be watching at
  // the instant the slide changed.
  useEffect(() => {
    if (followMode === 'follow' || forceInteractive) {
      setViewedIndex(hostIndex)
    } else {
      setViewedIndex(prev => Math.min(prev, hostIndex))
    }
  }, [hostIndex, followMode, forceInteractive])

  const currentSlide  = slides[viewedIndex] ?? null
  // No manual navigation in Follow mode (there's nothing to navigate — you're
  // always on the live slide), and none away from a forced interactive slide
  // until it's answered.
  const canGoBack     = followMode !== 'follow' && !forceInteractive && viewedIndex > 0
  const isBehindLive  = viewedIndex < hostIndex
  const powerup       = show?.powerups?.[0] ?? null

  // A slide the player has scrolled back to review was already revealed by
  // definition (the host can't advance past a slide without revealing it
  // first) — only the LEADING slide (viewedIndex === host's index) needs this
  // check. goLive/goLiveFrom set current_slide_index the instant the host
  // presses Go Live, but deliberately leave current_slide_id null until the
  // host's first explicit "next" reveals it — without this check, a phone
  // would render that slide's real content (question text, etc.) the moment
  // is_live flips true, before the TV shows anything but the pre-show screen.
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
        paddingLeft: '0.75rem', paddingRight: '1rem', gap: '0.5rem',
        minHeight: 56,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: 1 }}>
          <ScoresPillButton onOpen={onOpenScores} />
          <span style={{
            color: `${highlight}cc`, fontSize: '0.8rem', fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
          }}>
            {topLeft}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <FollowToggle mode={followMode} onChange={setFollowMode} theme={theme} />
          <span style={{ color: highlight, fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
            {topRight}
          </span>
        </div>
      </div>

      {/* SCROLLABLE CONTENT — bottom padding only needs to clear the fixed
          bottom bar when it actually renders (i.e. there's a powerup). */}
      <div style={{ flex: 1, padding: `calc(4.5rem + env(safe-area-inset-top, 0px)) 1.25rem ${powerup ? '5.75rem' : '2rem'}`, overflowY: 'auto', maxWidth: 560, margin: '0 auto' }}>
        <ErrorBoundary
          key={visibleSlide?.id}
          fallback={
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
              Content unavailable
            </p>
          }
        >
          {revealed ? (
            <SlideContent
              slide={visibleSlide}
              show={show}
              theme={theme}
              team={team}
              // Only wired up for the actual live slide — a team scrolled
              // back reviewing an earlier (already-answered, already-locked)
              // wager slide must not report into the live slide's state.
              onInteractiveAnswered={visibleSlide?.id === liveSlide?.id ? setInteractiveSatisfied : undefined}
            />
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
                  transition: 'transform 120ms cubic-bezier(0.23,1,0.32,1)',
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
                  transition: 'transform 120ms cubic-bezier(0.23,1,0.32,1)',
                }}
              >
                ← Back
              </button>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM BAR — powerup only now; Scores moved to the top-bar pill */}
      {powerup && (
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 'auto', zIndex: 200,
        background: `${bg}f0`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: `0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px))`,
        gap: '0.5rem', minHeight: 64,
      }}>
          <div style={{ flex: '0 0 auto', position: 'relative' }}>
            {/* Confirm popover */}
            <AnimatePresence>
              {powerupConfirming && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.16, ease: EASE_OUT }}
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
      </div>
      )}
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

  const theme = useMemo(() => show?.theme_id ? getTheme(show.theme_id) : null, [show?.theme_id])

  // scores_locked_at is a timestamp, not a boolean — ScoreboardModal.jsx
  // refreshes it every 2 minutes while open, so a lock older than 10
  // minutes means the host's session ended without a clean close (crash,
  // sleep, lost wifi) rather than that scoring is still genuinely in
  // progress. A plain derivation from `show` alone would never notice that
  // expiry on its own (nothing else changes once the crashed host stops
  // sending updates), so a 30s tick forces a re-check independent of
  // whether a new realtime update ever arrives.
  const [lockCheckTick, setLockCheckTick] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setLockCheckTick(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const scoresLocked = useMemo(() => {
    const lockedAt = show?.scores_locked_at
    if (!lockedAt) return false
    return lockCheckTick - new Date(lockedAt).getTime() < 10 * 60 * 1000
  }, [show?.scores_locked_at, lockCheckTick])

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
          // MERGE over the previous row — Realtime omits unchanged TOASTed
          // columns (a real show's `slides` jsonb) from UPDATE payloads, so a
          // flag-only write arrives without `slides` and a full replace wiped
          // the phone's slide content (same bug as Display.jsx, same fix).
          setShow(prev => prev && prev.id === payload.new.id ? { ...prev, ...payload.new } : payload.new)
          if (payload.new.is_live) setPhase(prev => prev === 'waiting' ? 'live' : prev)
        }
      )
      .subscribe(status => setConnStatus(status))
    return () => supabase.removeChannel(channel)
  }, [show?.id])

  // ── Keep viewedIndex ≤ host (handled inside LiveView) ─────────────────

  // ── Scoreboard drawer live updates ───────────────────────────────────
  // `scoreboard_teams` was added to the `supabase_realtime` publication
  // 2026-08-16, so this subscription actually fires now.
  useEffect(() => {
    if (!scoresDrawerOpen || !show?.id) return
    const channel = supabase
      .channel(`scores-drawer:${show.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'scoreboard_teams', filter: `show_id=eq.${show.id}` },
        () => { refreshScores() }
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

    // RLS ties this team's row (and its phone_answers) to this browser's own
    // anon auth session, not just to knowing the team_id — team_id alone was
    // never actually secret (teams SELECT is public). A returning team on
    // the same browser already has this session restored automatically by
    // supabase-js; only a brand-new registration needs to mint one.
    let ownerUid = (await supabase.auth.getSession()).data.session?.user?.id
    if (!ownerUid) {
      // Supabase rate-limits anonymous sign-in per IP (30/hr default) — a
      // venue's shared wifi NATs every phone behind one address, so a burst
      // of teams joining in the same minute can collide even well under that
      // hourly cap. One short retry absorbs that burst; a real 429 past the
      // hourly budget gets its own message instead of inviting immediate
      // re-tapping, which would only burn what's left of the budget faster.
      let authError
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (!error) { ownerUid = data.user.id; break }
        authError = error
        if (attempt === 0 && error.status !== 429) break
        if (attempt === 0) await new Promise(r => setTimeout(r, 2500))
      }
      if (!ownerUid) {
        throw new Error(authError?.status === 429
          ? "Too many phones joining right now — wait a minute and try again"
          : "Couldn't start your session — try again")
      }
    }

    const color  = TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)]
    const teamId = `team_${nanoid(8)}`
    const { error } = await supabase.from('teams').insert({ id: teamId, show_id: actualShowId, name, color, is_connected: true, powerup_used: false, owner_uid: ownerUid })
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
  // Quiet refetch — no loading flag. A live refresh must not flash the spinner
  // and remount the rows, or the rank-change pass animation never gets to run.
  async function refreshScores() {
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
    }
  }

  async function openScoresDrawer() {
    if (scoresLocked) return
    setScoresDrawerOpen(true)
    setScoresDrawerLoading(true)
    await refreshScores()
    setScoresDrawerLoading(false)
  }

  // Forces the drawer closed if Ben starts editing while a team already has
  // it open — the lock engaging mid-view shouldn't leave mid-edit numbers
  // on screen just because the drawer opened before the lock did.
  useEffect(() => {
    if (scoresLocked && scoresDrawerOpen) setScoresDrawerOpen(false)
  }, [scoresLocked])

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
      <ScoresLockedPopup visible={scoresLocked} />
      {phase === 'register' && <RegistrationScreen onRegister={handleRegister} show={show} theme={theme} />}
      {phase === 'waiting'  && (
        <>
          <WaitingScreen teamName={team?.name ?? ''} theme={theme} onOpenScores={openScoresDrawer} />
          <LandscapePrompt scoresOpen={scoresDrawerOpen} />
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
          <LandscapePrompt scoresOpen={scoresDrawerOpen} />
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
