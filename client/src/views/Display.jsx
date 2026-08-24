import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase.js'
import { ThemeProvider, useTheme } from '../components/shared/ThemeProvider.jsx'
import SlideRenderer, { SHINY_EXIT_DURATION_S } from '../components/display/SlideRenderer.jsx'
import { ringVisibleStationIndex, ringPeekIndex } from '../lib/ringStationIndex.js'
import QuestionCounter from '../components/display/QuestionCounter.jsx'
import ParticleBackground from '../components/display/ParticleBackground.jsx'
import ScoreboardOverlay from '../components/display/ScoreboardOverlay.jsx'
import JukeboxBreakOverlay from '../components/display/JukeboxBreakOverlay.jsx'
import WarpTransition from '../components/display/WarpTransition.jsx'
import { RING_RETURN } from '../components/display/RingAmbient.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import StageFrame from '../display/StageFrame.jsx'
import { PRESHOW_BEN_PHOTO } from '../components/shared/BenPhoto.jsx'
import { resolveShinyPart, isWagerShiny } from '../lib/shinySeries.js'
import { EASE_OUT } from '../lib/easings.js'
import { resolvePreviewShow } from '../lib/previewSlide.js'
import {
  computeNextStep,
  computePrevStep,
  sortSlides,
  cursorAfterStep,
  teamPickerCursor,
  ownsAutoRoll,
  TEAM_PICKER_HOLD_MS,
} from '../lib/slideStepping.js'
import { warmYoutubeAudio } from '../lib/youtubeWarmAudio.js'

// See the FULL_BLEED_SLIDE_TYPES comment at StageFrame's usage below.
// team-picker added 2026-08-19 (Ben, live: "sits on top of the ring world,
// not full screen") — same root cause as the other three: its own black
// warp canvas is `absolute inset-0 w-full h-full`, meant to cover the FULL
// viewport during the ceremony and then wipe away to reveal the ring-world
// "running full-viewport behind this slide the whole time" (its own file's
// comment) — but confined to StageFrame's 85% box, that cover/reveal only
// ever happened in the center, with the real ring-world visible in the
// margins around it the whole time instead of hidden until the wipe.
// pre-show added 2026-08-24 (Ben: "jumping from the first slide to slide two
// then to slide three is jumpy — the assets get bigger then smaller"). A real
// show opens pre-show -> state-of-union -> rules -> team-picker -> ...; every
// one of those but pre-show was already full-bleed, so slide 1 rendered in the
// 85% box and slide 2 snapped out to the full viewport. pre-show is not a
// boxed design that happened to be omitted — it is the SAME screen as the
// automatic pre-show gate (PreShowScreen below), which renders full-viewport
// outside this stage entirely, and PreShowScreen's own comment says to "keep
// the two in step or the screen visibly changes when the host re-shows it
// mid-show". Boxing one copy and not the other was the drift. The paired
// change is PreShowSlide's Ben photo, 45cqh -> 38cqh, since the container it
// measures against just grew from 85% of the viewport to all of it.
const FULL_BLEED_SLIDE_TYPES = new Set(['state-of-union', 'winner-reveal', 'rules', 'team-picker', 'question', 'team-preview', 'grading-break', 'pre-show'])

// ─── No-show holding screen (before any show goes live) ────────────────────

function WaitingScreen() {
  const { theme } = useTheme()
  return (
    <div className="w-screen h-screen overflow-hidden relative select-none"
      style={{ background: theme.colors.bg }}>
      <ParticleBackground theme={theme} />
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '1rem',
      }}>
        <h1 style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          fontSize: 'clamp(3rem, 6vw, 5.5rem)',
          color: theme.colors.text,
          letterSpacing: '-0.02em',
          margin: 0,
          lineHeight: 1,
        }}>Trivia Night</h1>
        <p style={{
          fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
          fontSize: '1.2rem',
          color: `${theme.colors.text}55`,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          margin: 0,
        }}>Starting soon</p>
      </div>
    </div>
  )
}

// ─── Nav-denied banner (RLS-D-1 guard) ─────────────────────────────────────
// Shown when a display-side nav write (jukebox-return jump) is denied or
// errors — the show did NOT advance and the host needs to drive from /host.
// Static render, no animation: nothing to gate behind reduced-motion.

function NavDeniedBanner({ visible }) {
  const { theme } = useTheme()
  if (!visible) return null
  return (
    <div
      style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 200, pointerEvents: 'none',
        background: `${theme.colors.bgDeep}f2`,
        border: `1px solid ${theme.colors.highlight}66`,
        color: theme.colors.text,
        fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
        fontSize: '0.95rem', fontWeight: 600, letterSpacing: '0.02em',
        padding: '8px 18px', borderRadius: 999,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        whiteSpace: 'nowrap',
      }}
    >
      ⚠ Display can’t advance the show — use the host controls
    </div>
  )
}

// ─── Inline host-PIN prompt ────────────────────────────────────────────────
// /display must keep rendering the live show to the room no matter what, so
// it is NOT wrapped in <HostPinGate> — a full-screen PIN modal over the venue
// TV is unacceptable. This is the small corner-card version instead: it only
// appears the first time someone tries to step the show from the TV itself,
// makes the exact same verify-host-pin call HostPinGate makes, and never
// comes back once the session carries host_verified (Supabase Auth persists
// that session in localStorage, so it survives reloads — same free
// persistence /questions already gets).
function isHostVerified(session) {
  return session?.user?.app_metadata?.host_verified === true
}

function DisplayPinPrompt({ onVerified, onDismiss }) {
  const { theme } = useTheme()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (pin.length !== 4) return
    setSubmitting(true)
    setError(null)
    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { data, error: signInError } = await supabase.auth.signInAnonymously()
        if (signInError) throw new Error('Could not start a session — try again')
        session = data.session
      }
      const { data, error: fnError } = await supabase.functions.invoke('verify-host-pin', { body: { pin } })
      if (fnError) throw new Error('Could not reach the server — try again')
      if (!data?.ok) throw new Error(data?.error || 'Incorrect PIN')
      const { data: { session: refreshed } } = await supabase.auth.refreshSession()
      if (!isHostVerified(refreshed)) throw new Error('Verification did not take — try again')
      onVerified()
    } catch (err) {
      setError(err.message)
      setPin('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      data-pin-prompt
      onSubmit={handleSubmit}
      // Escape closes it without touching the show. stopPropagation so the
      // key never reaches the global step handlers.
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onDismiss() } }}
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 12,
        background: `${theme.colors.bgDeep}f2`,
        border: `1px solid ${theme.colors.highlight}66`,
        color: theme.colors.text,
        fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
        padding: '14px 16px', borderRadius: 18,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}
    >
      <span style={{ fontSize: '0.95rem', fontWeight: 600, opacity: 0.85, whiteSpace: 'nowrap' }}>
        {error ? error : 'Host PIN'}
      </span>
      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        autoFocus
        value={pin}
        onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(null) }}
        placeholder="••••"
        style={{
          width: 130, height: 56, textAlign: 'center',
          fontSize: '1.6rem', letterSpacing: '0.5em', textIndent: '0.5em',
          background: 'rgba(0,0,0,0.45)', color: theme.colors.text,
          border: `1px solid ${theme.colors.highlight}55`, borderRadius: 12, outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={pin.length !== 4 || submitting}
        style={{
          height: 56, minWidth: 110, padding: '0 20px', borderRadius: 12, border: 'none',
          fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
          background: theme.colors.accent, color: theme.colors.bgDeep,
          opacity: pin.length !== 4 || submitting ? 0.4 : 1,
        }}
      >
        {submitting ? '…' : 'Unlock'}
      </button>
    </form>
  )
}

// ─── Pre-show waiting screen ───────────────────────────────────────────────

// One ParticleBackground instance, rendered as a sibling of the
// PreShowScreen<->DisplayInner ternary so it survives that swap (Critical
// Rule 1). DisplayInner reports stationOverride up via onRingStateChange;
// PreShowScreen has no override, so the default (stationOverride: null)
// applies while it's showing. slideIndex drives RingAmbient's own
// forward-glide-vs-snap decision (see RingAmbient's slideIndex effect) —
// it's the numeric show.current_slide_index, not a slide id.
// Deliberately NOT skipsLockedBackground(s) — that function also answers
// "is THIS render of the slide painting its own opaque lock", which for a
// shiny question/grid/venn is DATA-dependent (data.introDone): true during
// the intro/closing beat (ambient, ring shows through — see SlideRenderer's
// isShinyIntroBeat), false during content (opaque backdrop, ring hidden).
// ringVisibleStationIndex sums isVisible(slide) INCLUSIVE of the current
// index every render, so reusing that same data-dependent check here meant
// the running total could change TWICE for one physical slide — once on
// entry (content's introDone flips true, uncounting it) and, since
// 2026-08-24's closing beat, AGAIN on exit (outroShown flips introDone back
// to false, re-counting it) — a second, spurious turn() on a slide the show
// never actually left. Ben: "coming out of not so different... there was a
// ring move. shouldnt be diff from the original intro." Station-visibility
// has to be a stable, TYPE-only fact for the whole lifetime of a slide, so a
// shiny question/grid/venn — like team-picker — never moves the ring no
// matter how many times its own introDone toggles internally; the ring only
// advances once you actually leave to a real ring-visible slide.
const isRingVisible = s =>
  s?.type === 'team-preview' || s?.type === 'grading-break' ||
  (s?.type === 'question' && !s?.data?.isShiny) ||
  s?.type === 'pre-show' || s?.type === 'round-intro' || s?.type === 'swing-round-intro'

function PersistentRing({ slideIndex, stationOverride, showStationDebug }) {
  const { theme } = useTheme()
  // ParticleBackground's own root is `absolute inset-0` — it needs a sized,
  // positioned ancestor of its own now that it's not nested inside
  // PreShowScreen's/DisplayInner's `w-screen h-screen relative` div anymore.
  // Also owns the base fill: those two divs' own background is transparent
  // now (see their own comments) so this paints through underneath them.
  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: theme.colors.bg }}>
      <ParticleBackground
        theme={theme}
        slideIndex={slideIndex}
        stationOverride={stationOverride}
        showStationDebug={showStationDebug}
      />
    </div>
  )
}

function PreShowScreen({ show, onInstall }) {
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

  return (
    <div className="w-screen h-screen overflow-hidden relative select-none">

      {/* No own background fill — PersistentRing (rendered as our sibling at
          Display's root) paints theme.colors.bg underneath. This div used to
          set it directly, back when ParticleBackground was nested inside it. */}

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
              fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
              fontSize: 'clamp(3rem, 5vw, 4.5rem)',
              color: theme.colors.highlight,
              lineHeight: 1,
            }}>{teams.length}</span>
            <span style={{
              fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
              fontSize: '1.25rem',
              color: `${theme.colors.text}88`,
            }}>{teams.length === 1 ? 'team in' : 'teams in'}</span>
            <span style={{
              fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
              fontSize: '1.1rem',
              color: theme.colors.textMuted,
              textAlign: 'center',
              maxWidth: '120px',
            }}>Scan to join</span>
          </div>
        </div>

        {/* Ben — centred under the QR, arms up, pointing at the code. Same
            block as PreShowSlide.jsx (this is the automatic pre-show gate,
            that one is the addable slide version); keep the two in step or
            the screen visibly changes when the host re-shows it mid-show.
            Rationale for the pin, the `contain` fit, the negative margin and
            the bottom fade is documented there and on PRESHOW_BEN_PHOTO.
            vh here vs cqh there is deliberate, not drift: this gate renders
            full-viewport with no query container, that slide renders inside
            StageFrame — which since 2026-08-24 hands 'pre-show' a scale-1
            stage, so its container IS the viewport and 38cqh there resolves
            to the same 38vh here. Both land on ~410px at 1080p. */}
        <img
          src={PRESHOW_BEN_PHOTO}
          alt=""
          style={{
            height: '38vh',
            maxWidth: '100%',
            objectFit: 'contain',
            marginTop: '-3rem',
            filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.55))',
            WebkitMaskImage: 'linear-gradient(to bottom, #000 60%, transparent 82%)',
            maskImage: 'linear-gradient(to bottom, #000 60%, transparent 82%)',
          }}
        />
      </div>

      {onInstall && (
        <button
          onClick={onInstall}
          style={{
            position: 'absolute',
            top: 20,
            right: 24,
            zIndex: 20,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.55)',
            fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
            fontSize: '0.8rem',
            fontWeight: 500,
            letterSpacing: '0.06em',
            padding: '6px 14px',
            borderRadius: '999px',
            cursor: 'pointer',
          }}
        >
          + Add to Dock
        </button>
      )}
    </div>
  )
}

// ─── Preview badge ─────────────────────────────────────────────────────────
// Overlaid on top of the real DisplayInner render in preview mode — the show's
// actual current slide, actual theme, actual data (e.g. a matching question's
// real live submit count), just labeled so the host knows it's not the real
// live broadcast. Previously this route rendered a hardcoded placeholder
// sentence instead of any real slide — this badge is the only preview-specific
// UI left; the slide itself is the same SlideRenderer path the TV uses.

function PreviewBadge() {
  const { theme } = useTheme()
  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      style={{ opacity: 0.35 }}
    >
      <span
        className="text-xs font-bold tracking-widest uppercase"
        style={{ color: theme.colors.text, fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif` }}
      >
        PREVIEW MODE
      </span>
    </div>
  )
}

// ─── Answer reveal overlay ─────────────────────────────────────────────────

function AnswerRevealOverlay({ show, currentSlide }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const visible = show.answer_reveal ?? show.showState?.answerReveal ?? false

  // Multi-part series slides fall back to the shared answer (if any) when
  // this specific part doesn't have its own — see resolveShinyPart.
  const answer = currentSlide ? resolveShinyPart(currentSlide.data).answer : null

  // A wager question's `answer` is the true NUMBER every guess is scored
  // against, and it must not appear before the host locks and reveals — an
  // accidental Stream Deck "A" during the blind-wager beat would spoil the
  // whole round. The mechanic has its own reveal, so this generic overlay is
  // suppressed on wager slides outright rather than merely phase-gated.
  const suppressed = currentSlide ? isWagerShiny(currentSlide.data) : false

  return (
    <AnimatePresence>
      {visible && answer && !suppressed && (
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

// ─── Break advance (the one display-side nav write) ────────────────────────
// Same logic the ?from=jukebox return path has always run: normally +1, but if
// the show's last slide is a winner-reveal and no grading breaks remain, jump
// straight to it (hands-off show close — see SKILL.md "Final Break"). Now also
// called by the in-app break overlay's b-hold exit.
// advance_show is a SECURITY DEFINER RPC (supabase/migrations/20260706001000) —
// the TV browser has no PIN session, so a raw shows UPDATE gets silently
// RLS-denied (0 rows). The RPC is the one nav write anon may perform, and it
// reports success explicitly so a denial can't be silent again.
async function advanceAfterBreak(showRow) {
  const sorted = [...(showRow.slides ?? [])].sort((a, b) => a.order - b.order)
  const cur = showRow.current_slide_index ?? 0
  const lastSlideIsWinner = sorted[sorted.length - 1]?.type === 'winner-reveal'
  const noMoreGradingBreaks = !sorted.slice(cur + 1).some(s => s.type === 'grading-break')
  const next = (lastSlideIsWinner && noMoreGradingBreaks)
    ? sorted.length - 1
    : Math.min(cur + 1, sorted.length - 1)
  if (next <= cur) return { advanced: false, denied: false }
  const nextSlide = sorted[next]
  const { data: advanced, error } = await supabase.rpc('advance_show', {
    p_show_id: showRow.id,
    p_slide_id: nextSlide?.id ?? null,
    p_slide_index: next,
  })
  if (error || advanced !== true) {
    console.error('[Display] break advance denied:', error ?? '0 rows')
    return { advanced: false, denied: true }
  }
  return { advanced: true, next, nextSlide, denied: false }
}

// ─── Step-through from the TV itself ────────────────────────────────────────
// Ben rehearses a whole show by clicking through it on the TV, and wants that
// to behave IDENTICALLY to pressing Next on /host — invoke-gated walkout
// audio, shiny intro beats, multi-part stepping and all. So this runs the
// SAME decision functions the host's nextSlide()/prevSlide() run
// (client/src/lib/slideStepping.js) against /display's own raw show row, and
// writes the resulting patch directly.
//
// advance_show (the anon RPC above) can't serve this: it only does index+1,
// and teaching an anonymous-callable endpoint the full parts/invoke state
// machine is exactly the unrestricted-anon-write surface RLS-D-1/RLS-D-2
// (supabase/migrations/20260716000000) closed off on purpose — any phone in
// the venue holds the same anon key. Instead /display PIN-verifies once
// (DisplayPinPrompt below, same verify-host-pin call HostPinGate makes), and
// this becomes a plain authenticated UPDATE that RLS accepts.
//
// The jukebox break return still uses advanceAfterBreak() — that path wants
// the whole-slide Final Break jump, not a step.
async function stepShow(showRow, direction) {
  const fetchTeamCount = async () => {
    const { data, error } = await supabase.from('teams').select('id').eq('show_id', showRow.id)
    if (error) console.error('[Display] team count fetch failed:', error)
    return data?.length ?? 0
  }
  const args = {
    slides: showRow.slides,
    currentSlideIndex: showRow.current_slide_index,
    currentSlideId: showRow.current_slide_id,
  }
  const patch = direction > 0
    ? await computeNextStep(args, fetchTeamCount)
    : await computePrevStep(args, fetchTeamCount)
  if (!patch) return { advanced: false, denied: false, cursor: null }
  const { data, error } = await supabase
    .from('shows')
    .update(patch)
    .eq('id', showRow.id)
    .eq('is_live', true)
    .select('id')
  if (error || !data?.length) {
    console.error('[Display] display step denied:', error ?? '0 rows — not host-authenticated on this browser')
    return { advanced: false, denied: true, cursor: null }
  }
  // Where this window's OWN press just left the show — the team-picker
  // auto-roll's ownership token (see ownsAutoRoll in slideStepping.js).
  return { advanced: true, denied: false, cursor: cursorAfterStep(args, patch) }
}

// ─── Live display ──────────────────────────────────────────────────────────

// The ring's dedicated music slot — index 10, the `record` station added
// 2026-08-16 at index 12 and swapped to 10 the same day for silhouette-family
// spacing (see client/src/worlds/midnightGalaxy.ring.js's record entry). Ben:
// the jukebox grading-break "needs to have its own ring slot" rather than
// consuming an arbitrary station and hiding it under the overlay, which is
// what it did before. Declared here rather than imported from the world module
// so a non-ring theme still compiles — the value is simply never used unless a
// ring world is mounted. This constant must always point at the station whose
// prim is 'record' — the routing contract follows the record, not the index.
const MUSIC_STATION = 10

// How long the grading-break slide holds before the warp takes the TV.
// 2026-08-17, Ben: was 5s, now 10s ("after the slide is there for 10 seconds,
// it 'warps' to the jukebox"). Space/ArrowRight still skip the wait.
const BREAK_DELAY_MS = 10000

// How far into the swirl to wait before starting the jukebox handoff
// (2026-08-24, Ben, live: "the music started too early during the
// transition. needs to be pushed back a bit"). Mounting at warp START
// (0ms) meant a fast handoff could go audible while the vortex is still in
// its deliberately-readable wind-up — WarpTransition's veil stays under
// ~30% opaque through roughly this point (veil = (t/0.94)^2, t = elapsed/
// 2500ms). Not pushed all the way back to onDone — that's the pre-
// 2026-08-24 behavior this feature exists to improve on — just far enough
// that a fast handoff's audio lands once the swirl is visually taking over,
// not while the grading-break slide is still mostly readable underneath.
// One-line tunable if it still needs to move.
const HEAD_START_DELAY_MS = 1200

function DisplayInner({ show, direction, isPreview = false, onBreakAdvance, onRingStateChange }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const sortedSlides = [...(show.slides ?? [])].sort((a, b) => a.order - b.order)
  const currentSlide = sortedSlides[show.current_slide_index ?? 0] ?? null

  // ── Grading-break music overlay ──
  // The break lifecycle lives here now, not in GradingBreakSlide (which used to
  // full-page-navigate to the standalone jukebox app and is pure visual again).
  // Tracked as "which slide id has been activated" rather than a bare boolean so
  // a second consecutive grading-break slide re-arms the countdown by itself.
  const [activeBreakId, setActiveBreakId] = useState(null)
  // Never in the host's preview window — that pane would start playing music.
  const breakEligible = currentSlide?.type === 'grading-break' && !isPreview
  const breakActive = breakEligible && activeBreakId === currentSlide?.id

  // ── The warp (2026-08-17, Ben) ──
  // 'out'  = leaving the break's own station for the jukebox's record.
  // 'back' = the mirrored return onto that same station.
  // null the rest of the time. See WarpTransition.jsx for the effect itself and
  // RingAmbient.jsx's stationOverride effect for the Sx memory.
  const [warp, setWarp] = useState(null)
  const breakWasActiveRef = useRef(false)
  const lastSlideIdRef = useRef(currentSlide?.id)

  // Gates the jukebox head-start mount (below) to HEAD_START_DELAY_MS after
  // the warp actually starts, instead of the instant it does. See
  // HEAD_START_DELAY_MS's own comment for why.
  const [headStartArmed, setHeadStartArmed] = useState(false)
  useEffect(() => {
    if (warp !== 'out') { setHeadStartArmed(false); return }
    const t = setTimeout(() => setHeadStartArmed(true), HEAD_START_DELAY_MS)
    return () => clearTimeout(t)
  }, [warp])

  // Report break/warp ring state up to Display's persistent, root-level
  // ParticleBackground instead of rendering our own (see PersistentRing) —
  // this component mounts/unmounts around Go Live (PreShowScreen<->
  // DisplayInner), and Critical Rule 1 is ParticleBackground must never
  // remount. slideId is NOT reported this way — root derives it straight
  // from show.current_slide_id every render (see Display()). This effect
  // fires a render AFTER the one that swaps PreShowScreen for DisplayInner
  // (effects run post-paint), so bridging slideId through it left a one-
  // frame gap where the new slide's content was already on screen but the
  // ring was still keyed to the old (null) slideId — read as a stale-
  // background flash right at Go Live. breakActive/warp don't have that
  // problem: both start false/null and only change deep into a live show,
  // long after any Go Live transition.
  useEffect(() => {
    onRingStateChange?.({
      stationOverride: breakActive ? MUSIC_STATION : (warp === 'back' ? RING_RETURN : null),
      showStationDebug: isPreview,
    })
  }, [onRingStateChange, breakActive, warp, isPreview])

  // Auto-open after BREAK_DELAY_MS (Ben's timing — the break screen reads, then
  // music takes the TV). Space/ArrowRight skip the wait, unchanged from the old
  // slide behavior: those keys were already claimed by the break slide, and
  // RLS-D-1's "no keyboard nav on /display" removal explicitly carved this out
  // as the exception. Once the overlay is up the listener is gone — Jukebox owns
  // Space.
  // The timer no longer opens the overlay directly: it starts the warp, and the
  // warp's own completion mounts the jukebox (see WarpTransition below), so the
  // ring's snap onto the record happens behind the streaks instead of as a
  // silent hard cut under an opaque panel.
  useEffect(() => {
    if (!breakEligible || breakActive || warp) return
    const timer = setTimeout(() => setWarp('out'), BREAK_DELAY_MS)
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        clearTimeout(timer)
        setWarp('out')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey) }
  }, [breakEligible, breakActive, warp, currentSlide?.id])

  // Return trip. breakActive can only fall by the show moving to another slide
  // (activeBreakId never clears itself), so the slide id is the honest trigger —
  // it covers both exits, the in-overlay b-hold and a host-side advance. Guards
  // on the last slide id actually seen rather than firing on every run of the
  // effect, the same shape RingAmbient's own turn-per-slide effect uses, so
  // StrictMode's dev double-invoke can't cancel the warp it just started.
  useEffect(() => { if (breakActive) breakWasActiveRef.current = true }, [breakActive])
  useEffect(() => {
    const id = currentSlide?.id
    if (lastSlideIdRef.current === id) return
    lastSlideIdRef.current = id
    // Also the cleanup path: a slide change mid-'out' (host advanced past the
    // break early) drops that warp instead of letting it open a jukebox for a
    // slide that is no longer on screen.
    setWarp(breakWasActiveRef.current ? 'back' : null)
    breakWasActiveRef.current = false
  }, [currentSlide?.id])

  const slideFallback = (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: theme.colors.bgDeep,
    }}>
      <p style={{
        color: `${theme.colors.text}55`,
        fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
        fontSize: '1rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}>
        Slide unavailable
      </p>
    </div>
  )

  return (
    <div
      className="w-screen h-screen overflow-hidden relative select-none"
      // Transparent when PersistentRing owns the base fill (the normal
      // live-show case, onRingStateChange set) — opaque in the standalone
      // isDemo/isPreview paths, which still render their own ParticleBackground
      // as a child below and need this div to paint the base color itself.
      style={{ background: onRingStateChange ? 'transparent' : theme.colors.bg }}
    >
      {/* ParticleBackground lives OUTSIDE the ErrorBoundary — it must never re-mount.
          onRingStateChange is only unset for the standalone isDemo/isPreview
          root paths (Display() renders DisplayInner alone there, no swap with
          PreShowScreen ever happens) — everywhere else Display's root owns
          one persistent instance and DisplayInner just reports state to it. */}
      {!onRingStateChange && (
        <ParticleBackground
          theme={theme}
          slideIndex={ringVisibleStationIndex(sortedSlides, ringPeekIndex(sortedSlides, show.current_slide_index ?? 0), isRingVisible)}
          stationOverride={breakActive ? MUSIC_STATION : (warp === 'back' ? RING_RETURN : null)}
          showStationDebug={isPreview}
        />
      )}

      {/* Shiny content's opaque backdrop, full-viewport (2026-08-18, Ben:
          "the pan up away from the ring stations are supposed to be 100%
          covered by opaque background"). Every Shiny*Question component
          already paints its own theme.colors.shinyBg on a w-full h-full div,
          but that div renders inside StageFrame below, which clips ALL slide
          content to a centered 85%-viewport box — confirmed via measurement,
          a 1512x745 stage rendered that backdrop at 1285x633. The ring, which
          IS meant to show through StageFrame's own 15% margin for every other
          slide type, was bleeding through it for shiny content too, which is
          supposed to read as a full takeover once panned up. Rendered here,
          between ParticleBackground and StageFrame (z-index 1, between the
          ring's implicit 0 and StageFrame's own 2), so it fills exactly the
          margin StageFrame leaves uncovered — StageFrame's own content still
          paints on top of it. Gated on introDone specifically: false during
          the intro title card (ring is meant to show through that) and false
          again during the closing beat's pan back down. */}
      <AnimatePresence>
        {currentSlide?.data?.isShiny && currentSlide?.data?.introDone && (
          <motion.div
            key="shiny-fullbleed-backdrop"
            className="absolute inset-0"
            style={{ background: theme.colors.shinyBg, zIndex: 1 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            // Held up through the outgoing shiny slide's own exit
            // (SHINY_EXIT_DURATION_S, SlideRenderer.jsx — same value
            // SLIDE_ANIMATIONS['shiny'].exit uses, imported rather than
            // copied so the two can't drift out of sync) before this starts
            // fading — both AnimatePresences here fire off the same
            // currentSlide change, so without the delay this backdrop was
            // uncovering the ring margin while StageFrame's shiny content was
            // still fading out in the center: "coming out of it ... has a
            // ring world transition behind it when it shouldn't" (2026-08-24).
            exit={{ opacity: 0, transition: { delay: reduce ? 0 : SHINY_EXIT_DURATION_S } }}
            transition={{ duration: reduce ? 0 : 0.3 }}
          />
        )}
      </AnimatePresence>

      {/* StageFrame: 85% viewport, centered, overflow:hidden — all slide content clips here.
          ParticleBackground stays OUTSIDE (full-viewport behind the stage).
          FULL_BLEED_SLIDE_TYPES (2026-08-19, Ben: state-of-union/winner-reveal/
          rules all read as broken/tiny boxed inside the 85% margin with the
          ring bleeding through around them) get the full viewport instead —
          these are one-off graphic/interstitial moments, not ring-framed
          question content, so there's no margin worth preserving for them. */}
      <StageFrame scale={FULL_BLEED_SLIDE_TYPES.has(currentSlide?.type) ? 1 : undefined}>
        {/* AnimatePresence must be the STABLE element here — it never remounts,
            so its enter/exit animations (below) actually get to run. Its
            tracked child is keyed on slide.id ONLY, changing exclusively on
            a real slide swap, never on a part-step within one slide.
            (2026-08-23, Opus review: this used to be the other way around —
            an ErrorBoundary wrapping AnimatePresence, keyed on
            `${slide.id}:${introDone}:${currentPart}` — which meant every
            part-step, not just every slide change, destroyed and recreated
            AnimatePresence from scratch, so no exit animation it was ever
            asked to run — mode="sync" below, holdExitForReveal on
            SlideRenderer — actually executed.) */}
        <AnimatePresence mode={currentSlide?.type === 'team-picker' ? 'sync' : 'wait'}>
          {currentSlide && (
            // resetKey (not key) clears a tripped boundary on a part-step —
            // e.g. a crash on one team name during Team Intro doesn't leave
            // "Slide unavailable" stuck through every name after it — without
            // remounting this boundary (which would remount AnimatePresence
            // too, see above). key IS slide.id, so AnimatePresence sees a new
            // child exactly when the real slide changes.
            <ErrorBoundary
              key={currentSlide.id}
              resetKey={`${currentSlide.data?.introDone}:${currentSlide.data?.currentPart}`}
              fallback={slideFallback}
            >
              {/* mode="wait" (the default everywhere else) fully unmounts the
                  outgoing slide — including its own opaque lock/background —
                  before the incoming one mounts. That's fine for a plain fade,
                  but team-picker's entrance IS a black panel sliding down to
                  cover the previous slide (SLIDE_ANIMATIONS['team-picker'],
                  REVEAL_S run backwards) — under "wait" the previous slide is
                  already gone by the time it starts sliding, so the panel
                  descends over the bare ring instead of over what was actually
                  on screen (2026-08-23, Ben: "team intro slide should slide
                  over the rules slide, instead of jumping to a new ring world
                  slide, then the intro slide sliding down on that"). "sync"
                  (Framer Motion's default) keeps the outgoing slide mounted and
                  animating its own exit while the incoming one animates in on
                  top — DOM order puts the new team-picker panel after the old
                  slide, so it paints over it while descending. Scoped to just
                  this direction (entering team-picker) so every other
                  transition keeps its existing sequential "wait" behavior. */}
              <SlideRenderer
                slide={currentSlide}
                show={show}
                direction={direction}
                isPreview={isPreview}
                onAdvance={onBreakAdvance}
                // Carried on every render so the LAST props this slide held
                // before exiting (AnimatePresence clones them, doesn't
                // re-render an exiting child) already say whether ITS OWN
                // next slide is team-picker — see SlideRenderer's own
                // comment on holdExitForReveal.
                holdExitForReveal={sortedSlides[(show.current_slide_index ?? 0) + 1]?.type === 'team-picker'}
              />
            </ErrorBoundary>
          )}
        </AnimatePresence>
        {/* Scoreboard lives inside the stage — clips at the stage wall.
            fallback={null}: this and every boundary below sit on top of an
            already-rendering TV scene — the default fallback is a full
            white 100vh reload card, which would be strictly worse than the
            crash itself (it'd cover the whole show, not just this overlay).
            A crash here should just make the overlay disappear, not the TV. */}
        <ErrorBoundary fallback={null}>
          <ScoreboardOverlay show={show} />
        </ErrorBoundary>
      </StageFrame>

      {/* z-50: persistent overlays — always on top */}
      <ErrorBoundary fallback={null}>
        <QuestionCounter slide={currentSlide} show={show} />
        <AnswerRevealOverlay show={show} currentSlide={currentSlide} />
      </ErrorBoundary>

      {/* Break music — above everything except the nav-denied banner (z-200).
          Teardown on external advance is automatic: the host advancing from
          /host changes currentSlide, breakActive goes false, the overlay
          unmounts, and useSpotifyPlayer's cleanup (player.disconnect()) stops
          audio.
          ponytail: unmount-disconnect cuts audio without a fade on host-side
          advance; the b-hold path (the normal gesture) keeps the full exit
          animation + fade. Add a pre-unmount fade only if Ben ever advances
          breaks from /host in practice. */}
      {/* Hyperspace between the ring's own station and the jukebox's record.
          'out' finishing is what makes the overlay below VISIBLE and flips
          stationOverride to MUSIC_STATION — one commit, so the jump lands on
          the warp's last (fully black) frame. 'back' mounts in the same commit
          that asks for RING_RETURN, so that snap is covered too. z-[80]: above
          the stage and its overlays, below the nav-denied banner (z-200); the
          jukebox (z-[70]) is only ever VISIBLE while no warp is — but since
          2026-08-24 it MOUNTS (hidden) the moment 'out' starts, see below. */}
      {warp && (
        <ErrorBoundary fallback={null}>
          <WarpTransition
            key={`${currentSlide?.id}-${warp}`}
            dir={warp}
            onDone={() => {
              if (warp === 'out') setActiveBreakId(currentSlide?.id)
              setWarp(null)
            }}
          />
        </ErrorBoundary>
      )}

      {/* Head start (2026-08-24, Ben: "cant [the swirl] have the black screen
          behind it? … invoke the jukebox playing earlier in theory"): the
          overlay used to mount only in the warp's onDone commit, so its whole
          handoff chain (Spotify token check -> Supabase jukebox_state sync ->
          shuffle pick -> SDK player connect -> play confirm) started AFTER the
          2.5s vortex had fully finished — that chain's real latency is what
          the black handoff cover (Jukebox's libHandoffPending) then sat on.
          Now the overlay mounts HEAD_START_DELAY_MS after 'out' STARTS (not
          instantly — see that constant's own comment, 2026-08-24 follow-up:
          Ben, "the music started too early ... needs to be pushed back a
          bit"), so the handoff runs concurrently with most of the warp and
          the residual black hold after it shrinks, without a fast handoff's
          audio landing while the swirl is still mostly transparent.
          visibility:hidden until breakActive, NOT a bare early mount: the warp
          canvas's veil is (t/0.94)^2 — near-transparent for its first ~1.5s
          (deliberately, "the scene stays readable while the vortex spins up")
          — so an unhidden overlay would slam its opaque bg-black over the
          still-visible grading-break slide mid-wind-up. Hidden, nothing paints
          and the visual timeline is byte-identical to before; only the DATA/
          PLAYBACK work starts early. The reveal is the same commit as before:
          onDone sets activeBreakId -> breakActive flips true (visibility on)
          AND warp goes null (canvas unmounts) in one batched commit, so the
          mount condition below never goes false across it — Jukebox does NOT
          remount at the handover. The ring's station jump (stationOverride ->
          MUSIC_STATION, effect above) stays keyed to breakActive, i.e. still
          lands on onDone's fully-black frame — deliberately NOT moved earlier.
          If the host advances mid-'out', breakEligible drops and this unmounts
          exactly like a host-side advance mid-break always has (player
          disconnect cuts any early audio).
          ponytail: audio can start under the warp's tail if the handoff beats
          2.5s (a J-cut — Ben asked for exactly this); if it ever reads wrong,
          the upgrade is deferring only playTrack (not sync/connect) to onDone. */}
      {(breakActive || (breakEligible && warp === 'out' && headStartArmed)) && (
        <ErrorBoundary fallback={null}>
          <div style={{ visibility: breakActive ? 'visible' : 'hidden' }}>
            <JukeboxBreakOverlay
              key={currentSlide.id}
              lib={currentSlide?.data?.jukeboxLib ?? 'random'}
              onExit={onBreakAdvance}
            />
          </div>
        </ErrorBoundary>
      )}
    </div>
  )
}

// ─── Root ──────────────────────────────────────────────────────────────────

export default function Display() {
  const [searchParams] = useSearchParams()
  const isDemo = searchParams.get('demo') === '1'
  const showId = searchParams.get('show')
  const isPreview = searchParams.get('preview') === 'true'
  const previewSlideId = searchParams.get('slide')
  const [show, setShow] = useState(null)
  const [loading, setLoading] = useState(true)
  const prevIndexRef = useRef(0)
  const lastUpdatedAtRef = useRef(null)
  const [direction, setDirection] = useState(1)
  const installPromptRef = useRef(null)
  const [canInstall, setCanInstall] = useState(false)
  // A display nav write was denied (RLS, network, anything) — the host must
  // advance from /host. Cleared when any show update lands (someone advanced
  // successfully) or a later nav write succeeds. Guard the RESULT, not the
  // cause: any 0-row/error outcome must surface, including unknown future ones.
  const [navDenied, setNavDenied] = useState(false)
  // Break/warp ring state, reported up by DisplayInner (see its
  // onRingStateChange effect) — lives here so ONE ParticleBackground instance
  // can render across the PreShowScreen<->DisplayInner swap at Go Live
  // without remounting (Critical Rule 1). slideId is NOT part of this — it's
  // derived straight from `show` on every render instead, see the JSX below.
  const [ringState, setRingState] = useState({ stationOverride: null, showStationDebug: false })
  // Host-verified state for step-through. `null` while the initial session
  // check is in flight — a step attempted in that window opens the prompt
  // rather than silently doing nothing. Mirrored into a ref because the
  // click/key handlers are registered once with a stable identity.
  const [hostVerified, setHostVerified] = useState(null)
  const hostVerifiedRef = useRef(null)
  hostVerifiedRef.current = hostVerified
  const [pinOpen, setPinOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setHostVerified(isHostVerified(session)))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setHostVerified(isHostVerified(session)))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Jukebox has already run its exit animation + fade + flushed pending
  // Supabase writes before calling this (its 'b'-hold path awaits EXIT_TOTAL_MS
  // + flushPendingWrite). Advance the show; the realtime UPDATE flips
  // currentSlide, which unmounts the overlay.
  // Identity must stay stable: it lands in Jukebox's b-hold effect deps, and
  // that effect's cleanup clears the in-flight hold timer — a re-created
  // callback (any Display re-render, e.g. an S-key scoreboard toggle mid-break)
  // would silently cancel a hold in progress. Read the show through a ref.
  const showRef = useRef(null)
  showRef.current = show
  const handleBreakAdvance = useCallback(async () => {
    const res = await advanceAfterBreak(showRef.current)
    if (res.denied) setNavDenied(true)
  }, [])
  // Step-through from the TV — see stepShow's own comment. Runs the identical
  // decision logic /host's Next/Prev run; needs a host_verified session, which
  // the inline PIN prompt below establishes once per browser.
  const stepRef = useRef(null)
  // One shared timestamp across BOTH directions — the same shape (and the same
  // 120ms) as LiveMode.jsx's guardNav, for the same reason: stepShow() reads
  // showRef.current, which only refreshes after a realtime round-trip, so two
  // presses closer together than that both compute off the same stale row and
  // fire two real advances. See guardNav's comment in LiveMode.jsx for why the
  // window is 120ms and not the 350ms it started at.
  const lastStepRef = useRef(0)
  // The cursor THIS window's own last successful step wrote — the team-picker
  // auto-roll's ownership token (see the effect below, and ownsAutoRoll in
  // slideStepping.js). State, not a ref, on purpose: it and the realtime echo
  // of the same write land in either order, and whichever lands second has to
  // be what re-runs the effect that arms the timer.
  const [ownedCursor, setOwnedCursor] = useState(null)
  const handleStep = useCallback(async (direction) => {
    // Preview/demo windows render a real show row but must never drive it —
    // the host opens Preview alongside Live Mode, and a stray click there
    // used to be harmless because dev_mode gated this off.
    if (isPreview || isDemo || !showRef.current?.is_live) return
    if (hostVerifiedRef.current !== true) {
      stepRef.current = direction
      setPinOpen(true)
      return
    }
    const res = await stepShow(showRef.current, direction)
    if (res.denied) setNavDenied(true)
    setOwnedCursor(res.cursor)
    // Deliberately no optimistic local apply here (2026-08-24 council
    // review): it would only buy back the write+realtime-echo leg — a few
    // hundred ms — while the walkout song's real 2-4s gap is the warm-pool's
    // job below. Low value for tonight's risk budget on a live-show deploy;
    // revisit if the host UI still feels laggy on its own merits.
  }, [isPreview, isDemo])

  // One shared debounce for EVERY nav path on this window — the click/key
  // listeners below and the team-picker auto-roll timer. Hoisted out of the
  // listener effect (where it used to live) so the timer can't slip a step
  // past the guard a hair after a manual press already fired one.
  const guardedStep = useCallback((direction) => {
    const now = Date.now()
    if (now - lastStepRef.current < 120) return
    lastStepRef.current = now
    handleStep(direction)
  }, [handleStep])

  // Team Intro (team-picker) auto-roll, /display's half. LiveMode.jsx runs the
  // identical timer for the host window — read the long comment there for the
  // ceremony's shape and why the auto range is [1, len-3].
  //
  // Why BOTH windows need one: /host and /display are both open and alive all
  // show (laptop + the extended monitor driving the TV), but only one of them
  // has OS keyboard focus, and the Stream Deck's simulated Right-Arrow goes
  // wherever that focus is. When it landed on /display, every team-picker
  // advance was fully manual (confirmed live, 2026-08-24, twice) — /display
  // wrote the new currentPart straight to Supabase, and the host's
  // subscription deliberately merges only showState, never `slides`
  // (useShow.js), so the host's local currentPart never moved and its timer
  // never armed.
  //
  // Why this can't double-fire with the host's copy: ownership. This arms
  // only when the state it's observing is the state THIS window's own last
  // write produced (ownsAutoRoll + cursorAfterStep, slideStepping.js). A
  // transition merely watched arriving over realtime — i.e. one the host
  // caused — never arms it. The mirror image protects the host: its local
  // `slides` only ever change through its own actions, so a /display-driven
  // transition can't arm the host's timer either. Whichever window is being
  // driven is the one that paces the roll.
  //
  // Keyed on the observed cursor, so any change to it — this timer firing, a
  // manual press cutting the hold short, or the host taking over mid-roll —
  // runs the cleanup and cancels the pending advance before anything is
  // rescheduled.
  useEffect(() => {
    if (isPreview || isDemo || !show?.is_live) return
    const cursor = teamPickerCursor({
      slides: show.slides,
      currentSlideIndex: show.current_slide_index,
      currentSlideId: show.current_slide_id,
    })
    if (!ownsAutoRoll(cursor, ownedCursor)) return
    const t = setTimeout(() => guardedStep(1), TEAM_PICKER_HOLD_MS)
    return () => clearTimeout(t)
  }, [
    isPreview,
    isDemo,
    show?.is_live,
    show?.slides,
    show?.current_slide_index,
    show?.current_slide_id,
    ownedCursor,
    guardedStep,
  ])

  // Pre-warm walkout-song players ahead of need (see youtubeWarmAudio.js):
  // a muted player buffered at the trim point is built for the queued
  // reveal target while the pre-live gate is up, and for the current + next
  // slide once live. This is what makes the walkout song audible ~instantly
  // on the invoke press even in the dominant flow, where the reveal press
  // invokes in the same write (514f8ba) and PreShowSlide therefore mounts
  // with `invoked` already true — too late to warm from inside the slide.
  // It also covers state-of-union's loop, which autoplays at mount and so
  // can only be warmed from the slide BEFORE it. Shiny audio questions warm
  // themselves at content mount instead (their PLAY press comes well after).
  // Idempotent per clip; the pool caps at 2 hidden muted iframes.
  useEffect(() => {
    if (isPreview || isDemo || !show?.is_live) return
    const sorted = sortSlides(show.slides)
    const cur = show.current_slide_index ?? 0
    const targets = (show.current_slide_id ?? null) === null
      ? [sorted[cur]] // gate is up — the next press reveals (and may invoke) this slide
      : [sorted[cur], sorted[cur + 1]]
    for (const s of targets) {
      const clip = s?.data?.walkoutSong
      if (clip?.videoId) warmYoutubeAudio(clip.videoId, clip.start ?? 0)
    }
  }, [isPreview, isDemo, show?.is_live, show?.slides, show?.current_slide_index, show?.current_slide_id])

  // Capture Chrome's install prompt — only fires when not already installed
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    if (isStandalone) return
    function onPrompt(e) { e.preventDefault(); installPromptRef.current = e; setCanInstall(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function handleInstall() {
    if (!installPromptRef.current) return
    installPromptRef.current.prompt()
    installPromptRef.current.userChoice.then(() => { installPromptRef.current = null; setCanInstall(false) })
  }

  // Inject PWA manifest scoped to /display so Chrome offers "Add to Dock"
  useEffect(() => {
    const existing = document.querySelector('link[rel="manifest"]')
    if (existing) return
    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = '/display-manifest.json'
    document.head.appendChild(link)
    return () => { if (document.head.contains(link)) document.head.removeChild(link) }
  }, [])


  // First interaction → fullscreen. F key toggles.
  // STALE as of 2026-08-24 (2ab9720 added a second nav path, the always-armed
  // click/keydown stepper below — see its own comment) — this used to be
  // true, isn't anymore, and the mismatch is exactly what caused the
  // fullscreen-click/step collision documented on that stepper's `blocked()`.
  // Kept as history of why keyboard nav was ever removed from here in the
  // first place (still true: Stream Deck goes to /host, not this page), not
  // as a current description of what /display's total nav surface is.
  useEffect(() => {
    function enter() {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {})
    }
    function onKey(e) {
      // The break overlay's library UI has text inputs (song search, set names);
      // /display had none before, so this handler never needed a target check.
      // Without it, typing an "f" into the jukebox toggles fullscreen.
      if (e.target?.closest?.('input, textarea, [contenteditable]')) return
      if (e.key === 'f' || e.key === 'F') {
        document.fullscreenElement ? document.exitFullscreen() : enter()
      }
    }
    function onFirstInteraction() {
      enter()
      // Prime Web Audio on whatever the first click/keydown of the show
      // happens to be. On Chrome this is belt-and-suspenders — sticky user
      // activation already unlocks any AudioContext created later in the
      // same tab (including RulesSlide.jsx's own, built at slide-mount) the
      // instant ANY gesture occurs, so this specific call doesn't unlock
      // anything Chrome wouldn't already allow on its own. Kept anyway
      // because it's zero-cost and WebKit/Safari autoplay gating is less
      // consistently "sticky" per-context, where actually resuming inside
      // the gesture handler can matter. This does NOT solve the genuinely
      // cold case — zero interaction anywhere on the TV before Rules plays —
      // there is no code-only fix for that; a tab that's never been touched
      // still can't unlock audio no matter where the priming call lives. The
      // real mitigation for that case stays physical: tap/click the TV once
      // during setup, before the show goes live.
      try {
        const AC = window.AudioContext || window.webkitAudioContext
        const ctx = new AC()
        ctx.resume().then(() => ctx.close()).catch(() => {})
      } catch {}
      window.removeEventListener('click', onFirstInteraction)
      window.removeEventListener('keydown', onFirstInteraction)
    }
    window.addEventListener('click', onFirstInteraction)
    window.addEventListener('keydown', onFirstInteraction)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onFirstInteraction)
      window.removeEventListener('keydown', onFirstInteraction)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Step the show from the TV itself — click / ArrowRight / Space / Enter go
  // forward, ArrowLeft goes back, running the SAME logic /host's Next/Prev
  // run (see stepShow). Always armed, no per-show flag: the gate is the
  // host_verified session, and an unverified press opens the inline PIN
  // prompt instead of advancing. This replaced the old `dev_mode` toggle,
  // which was a dumb index±1 with no awareness of invoke-gated audio,
  // multi-part stepping, or shiny intro beats.
  useEffect(() => {
    function blocked(e) {
      // Same three guards the host's own Next path has (LiveMode.jsx's
      // handleKeyDown): a held key on the TV must not fire the stepper once
      // per auto-repeat, and a reflexive Cmd/Ctrl/Alt shortcut must never
      // fall through to Space/Enter/Arrow. e.repeat is undefined on clicks,
      // so this one expression covers both event types.
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return true
      // A click, specifically, is ambiguous until the TV is actually in
      // performance mode: the SAME window 'click' listener that requests
      // fullscreen (the effect above, onFirstInteraction) fires on every one
      // of the 1-3 clicks it typically takes a browser to actually enter
      // fullscreen (a real quirk Ben hit live: "click it, click it again, it
      // refocuses/gets bigger, then click... then it goes"). Every one of
      // those clicks was ALSO reaching this stepper — the first reveals AND
      // invokes the walkout song in one press (see computeNextStep's reveal
      // branch), and the very next click, still just trying to get
      // fullscreen, immediately fell through to a real advance — "plays for
      // like a second, then jumps to the next slide." Keyboard (Stream Deck)
      // isn't part of the fullscreen ritual, so it stays always-armed
      // regardless — only `click` needs this gate.
      if (e.type === 'click' && !document.fullscreenElement) return true
      // The ENTIRE grading-break window belongs to the break, not the stepper.
      // Space/ArrowRight during the BREAK_DELAY_MS wait are the break's own
      // skip-the-wait keys (DisplayInner's warp effect) — but the same press
      // also reached this always-armed stepper, which advanced the show, and
      // the slide-change effect then tore down the in-progress 'out' warp. Net
      // result: the jukebox never opened and the break was skipped outright.
      // The [data-break-overlay] check below only covers the window AFTER the
      // overlay mounts; this covers the 10s before it, where nothing visible
      // has happened yet. Every legitimate exit from a grading break moves the
      // show off the slide (the jukebox b-hold -> advanceAfterBreak), so this
      // releases on its own the moment the break is really over.
      // (current_slide_id null = queued but not yet revealed, the state
      // PreShowScreen is up in — DisplayInner isn't mounted, no break timer is
      // running, and that first press is the reveal press. Nothing to collide
      // with there, so don't block it.)
      const row = showRef.current
      if (row && (row.current_slide_id ?? null) !== null &&
          sortSlides(row.slides)[row.current_slide_index ?? 0]?.type === 'grading-break') return true
      // Typing in the jukebox search / PIN box must never step the show, and
      // while the break overlay owns the screen its own b-hold is the advance
      // path — a click on a song row must not double as a Next press.
      // [data-no-step] covers /display's own interactive controls whose
      // clicks bubble to window with nothing to stop them — the audio
      // PLAY/pause button (QuestionSlide, StateOfUnionSlide) and PYL's jump
      // tiles are the two that matter: under the old dev_mode toggle this
      // listener was off during a real show, so nobody hit it; always-armed,
      // a PLAY press — the single most common /display click during a real
      // show — would otherwise also fire a step (2026-08-23, Fable 5 review).
      // The scoreboard overlay gets the same treatment as the break overlay:
      // it's a full-screen z-60 layer over the live show, and a click meant
      // to dismiss/interact with it must not step what's hidden underneath.
      return !!e.target?.closest?.('input, textarea, [contenteditable], [data-pin-prompt], [data-no-step]') ||
        !!document.querySelector('[data-break-overlay], [data-scoreboard-overlay]')
    }
    function onAdvance(e) {
      if (e.type === 'keydown' && !['ArrowRight', 'Space', 'Enter'].includes(e.code)) return
      if (blocked(e)) return
      guardedStep(1)
    }
    function onRetreat(e) {
      if (e.code !== 'ArrowLeft') return
      if (blocked(e)) return
      guardedStep(-1)
    }
    window.addEventListener('click', onAdvance)
    window.addEventListener('keydown', onAdvance)
    window.addEventListener('keydown', onRetreat)
    return () => {
      window.removeEventListener('click', onAdvance)
      window.removeEventListener('keydown', onAdvance)
      window.removeEventListener('keydown', onRetreat)
    }
  }, [guardedStep])

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
        // Jukebox return: the standalone-app fallback round trip (Ben opens
        // trivia-jukebox.vercel.app by hand if the in-app overlay misbehaves).
        // Same advance the in-app break exit runs — one function, one behavior.
        if (searchParams.get('from') === 'jukebox') {
          const res = await advanceAfterBreak(data)
          if (res.denied) setNavDenied(true)
          else if (res.advanced) {
            setNavDenied(false)
            data = { ...data, current_slide_index: res.next, current_slide_id: res.nextSlide?.id ?? null }
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

  // TEAM-2 fix: postgres_changes over a live socket is at-most-once with no
  // replay on rejoin — a channel that goes CHANNEL_ERROR/TIMED_OUT/CLOSED
  // (e.g. a brief network blip) previously stayed dead silently: .subscribe()
  // had no status callback, so every subsequent DB write vanished into a dead
  // channel until someone hard-reloaded the TV. Reproduced live on Team
  // Intro's step-advance — the DB write was always correct, the socket just
  // wasn't delivering it anymore. Fix: watch subscribe() status, tear down
  // and rejoin on any non-SUBSCRIBED terminal status, and on a RE-subscribe
  // (i.e. we previously dropped) refetch the row once to catch up on
  // whatever was missed during the dead window — self-heals in ~1.5s
  // instead of requiring a manual reload.
  useEffect(() => {
    if (!show?.id) return
    let channel
    let retryTimer
    let everSubscribed = false

    function handlePayload(payload) {
      const next = payload.new
      // Drop a payload older than (or equal to) the last one applied — the
      // host UI has its own echo guard (markLocalNav) but /display's
      // subscription had nothing comparable, so two writes landing out of
      // delivery order could apply the stale one last (2026-08-18 show,
      // Ben: slides "jumped back and forth"). `updated_at` is stamped on
      // every write in updateShowRow now.
      if (next.updated_at && lastUpdatedAtRef.current && next.updated_at <= lastUpdatedAtRef.current) return
      if (next.updated_at) lastUpdatedAtRef.current = next.updated_at
      const nextIndex = next.current_slide_index ?? 0
      setDirection(nextIndex >= prevIndexRef.current ? 1 : -1)
      prevIndexRef.current = nextIndex
      // MERGE over the previous row — never replace it. Postgres logical
      // replication omits unchanged TOASTed columns (any jsonb over ~2KB,
      // i.e. every real show's `slides`) from UPDATE payloads, so a
      // flag-only write (answer_reveal, scoreboard_visible) arrives here
      // WITHOUT `slides`. A full replace blanked the TV on every A/S/R
      // toggle and on the display's own jukebox-return jump.
      setShow(prev => {
        const merged = prev && prev.id === next.id ? { ...prev, ...next } : next
        return { ...merged, theme: merged.theme_id ?? merged.theme, themeOverrides: merged.theme_overrides ?? merged.themeOverrides }
      })
      // Any successful show update means navigation is flowing again.
      setNavDenied(false)
    }

    function refetchRow(showId) {
      supabase.from('shows').select('*').eq('id', showId).single().then(({ data }) => {
        if (!data) return
        prevIndexRef.current = data.current_slide_index ?? 0
        // Never move backward — a realtime payload can land in the window
        // between the reconnect firing and this fetch resolving, advancing
        // lastUpdatedAtRef past what this now-stale snapshot holds. Rolling
        // it back would let a genuinely-stale redelivery through afterward.
        if (data.updated_at && (!lastUpdatedAtRef.current || data.updated_at > lastUpdatedAtRef.current)) {
          lastUpdatedAtRef.current = data.updated_at
        }
        setShow(prev => (prev && prev.id === data.id
          ? { ...prev, ...data, theme: data.theme_id ?? data.theme, themeOverrides: data.theme_overrides ?? data.themeOverrides }
          : prev))
      })
    }

    function subscribe(showId) {
      channel = supabase
        .channel(`display:${showId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'shows', filter: `id=eq.${showId}` },
          handlePayload
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(retryTimer)
            if (everSubscribed) {
              console.warn('[Display] realtime channel rejoined — refetching to catch up on any missed updates')
              refetchRow(showId)
            }
            everSubscribed = true
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[Display] realtime channel dropped:', status, '— rejoining in 1.5s')
            clearTimeout(retryTimer)
            retryTimer = setTimeout(() => {
              supabase.removeChannel(channel)
              subscribe(showId)
            }, 1500)
          }
        })
    }

    subscribe(show.id)
    return () => {
      clearTimeout(retryTimer)
      if (channel) supabase.removeChannel(channel)
    }
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
            // Switching to a different show: there is no previous row to merge
            // over, and this payload may be missing its TOASTed `slides`
            // column (see the merge note above) — fetch the full row instead
            // of trusting the payload.
            supabase.from('shows').select('*').eq('id', next.id).single().then(({ data }) => {
              if (!data || !data.is_live) return
              prevIndexRef.current = data.current_slide_index ?? 0
              setShow({ ...data, theme: data.theme_id ?? data.theme, themeOverrides: data.theme_overrides ?? data.themeOverrides })
            })
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
          onBreakAdvance={() => {}}
        />
      </ThemeProvider>
    )
  }

  if (loading) {
    // Fetch in flight — render nothing themed. Painting WaitingScreen's
    // default-theme ambient here is what caused the pure-michigan flash
    // before the real show's theme (e.g. midnight-galaxy) landed: `show`
    // and `loading` are set in the same tick once the fetch resolves, so
    // there's nothing to gain by guessing a theme during this window.
    return <div className="w-screen h-screen" style={{ background: '#000' }} />
  }

  if (!show) {
    return (
      <ThemeProvider showThemeId={null}>
        <WaitingScreen />
      </ThemeProvider>
    )
  }

  if (isPreview) {
    return (
      <ThemeProvider showThemeId={show.theme} overrides={show.themeOverrides}>
        <DisplayInner show={resolvePreviewShow(show, previewSlideId)} direction={1} isPreview />
        <PreviewBadge />
      </ThemeProvider>
    )
  }

  // Root boundary — ThemeProvider and PreShowScreen otherwise have no crash
  // containment at all (unlike DisplayInner's live-slide path, which has one
  // around SlideRenderer). fallback={null}, not the default reload card: a
  // crash here should read as a blank TV, not paint a desktop-styled error
  // card over the venue screen.
  //
  // DELIBERATELY UNKEYED (fixed 2026-08-18). This boundary was originally
  // keyed on current_slide_id so a host advance could clear a tripped
  // boundary — but this boundary is an ANCESTOR of ThemeProvider →
  // DisplayInner → ParticleBackground, and a changed `key` remounts the
  // entire subtree. That broke Critical Rule 1 ("ParticleBackground never
  // re-mounts"), and the fallout was silent rather than loud: RingAmbient
  // seeds `lastSlideKeyRef` from the CURRENT slideKey on mount, so a
  // remount-per-advance meant its one-station-per-question turn() never
  // fired again for the whole show — the ring world would simply stop
  // rotating, with nothing on screen to say so. It also re-ran RingAmbient's
  // ~2,900-line ringPrimitives build on every slide and reset DisplayInner's
  // break/warp refs, killing the Event Horizon return warp.
  //
  // The recovery the key was reaching for still exists one level down: the
  // StageFrame boundary below IS keyed per slide, and it wraps the slide
  // content most likely to throw. Do not re-add a key here — put it on an
  // inner boundary that does not sit above ParticleBackground.
  return (
    <ErrorBoundary fallback={null}>
      <ThemeProvider showThemeId={show.theme} overrides={show.themeOverrides}>
        <PersistentRing
          slideIndex={show.is_live && show.current_slide_index != null
            ? (() => {
                const sorted = [...(show.slides ?? [])].sort((a, b) => a.order - b.order)
                return ringVisibleStationIndex(sorted, ringPeekIndex(sorted, show.current_slide_index), isRingVisible)
              })()
            : null}
          {...ringState}
        />
        {show.is_live && show.current_slide_id !== null ? (
          <DisplayInner show={show} direction={direction} onBreakAdvance={handleBreakAdvance} onRingStateChange={setRingState} />
        ) : (
          <PreShowScreen show={show} onInstall={canInstall ? handleInstall : null} />
        )}
        <NavDeniedBanner visible={navDenied} />
        {pinOpen && (
          <DisplayPinPrompt
            onDismiss={() => { stepRef.current = null; setPinOpen(false) }}
            onVerified={() => {
              setHostVerified(true)
              hostVerifiedRef.current = true
              setPinOpen(false)
              const pending = stepRef.current
              stepRef.current = null
              // Carry out the press that opened the prompt, so unlocking
              // doesn't cost an extra click.
              if (pending) handleStep(pending)
            }}
          />
        )}
      </ThemeProvider>
    </ErrorBoundary>
  )
}
