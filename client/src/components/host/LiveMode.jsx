import { useEffect, useCallback, useState, useRef } from 'react'
import { sortedSlides } from '../../hooks/useShow.js'
import { getTheme, THEMES } from '../../themes/index.js'
import { resolveShinyPart, isMatchingShiny, isWagerShiny, isOrderShiny, isAudioShiny, isBendleShiny } from '../../lib/shinySeries.js'
import ScorePanel from './ScorePanel.jsx'
import LateTeamPopover from './LateTeamPopover.jsx'
import { SELECTION_ANIMATIONS } from '../display/slides/selectionAnimations.js'
import { supabase } from '../../lib/supabase.js'
import { deriveRoundCols, computeTotal, pickableTeams } from '../../lib/scoreboardMath.js'
import { computeMatchingScoreUpdates } from '../../lib/matchingScoring.js'
import { computeOrderScoreUpdates, DEFAULT_ORDER_POINTS } from '../../lib/orderScoring.js'
import { scoreWagerRound, computeWagerScoreUpdates, parseWagerNumber, DEFAULT_TIER_ID } from '../../lib/wagerScoring.js'
import { scoreBendleRound, computeBendleScoreUpdates } from '../../lib/bendleScoring.js'
import { isAutoRollPart, TEAM_PICKER_HOLD_MS, pendingLockPhase, pendingReveal, REVEAL_FIELD, LOCK_COUNTDOWN_MS } from '../../lib/slideStepping.js'

// Named so the UI can recognize this ONE specific refusal and offer a manual
// override for it — every other wager error is a real, unrecoverable-by-
// retrying-differently failure (bad connection, unlocked wagers, non-numeric
// answer), but an empty phone_answers fetch is ALSO exactly what a genuine
// zero-submission round looks like (small crowd, phones failed, or the
// question got skipped by everyone). Without an override, Retry just hits
// this same wall forever with no way to actually score the round (Ben,
// 2026-08-17: "idk why that keeps popping up ... something different" —
// found while investigating: this is the one message with no path forward).
const WAGER_ZERO_ANSWERS_ERROR = 'No wager answers came back — check connection and retry before scoring'

// Bendle's equivalent of the refusal above, and for the identical reason: an
// empty phone_answers fetch is indistinguishable from a genuine
// nobody-guessed round, and Bendle scores from `teams` (not `answers`), so
// without this every team would silently take a real 0 with no retry path.
// Module-level, not inline in the handler, because the JSX below compares
// against it to decide whether to offer the manual override.
const BENDLE_ZERO_ANSWERS_ERROR = 'No guesses came back — check connection and retry before scoring'

// PYL "Pick animation" tiles — same visual language as BuildMode's CARD_STYLE
// (soft gradient + colored border that brightens on hover) but keyed by
// animation id, not slide type, and pitched one shade brighter (100/200 vs
// 50/100) so the row reads as its own family rather than stray slide cards.
export const ANIM_TILE_STYLE = {
  boxing:     'bg-gradient-to-br from-rose-100    to-pink-200   border-rose-300    hover:border-rose-500',
  cards:      'bg-gradient-to-br from-emerald-100 to-green-200  border-emerald-300 hover:border-emerald-500',
  chestduel:  'bg-gradient-to-br from-amber-100   to-orange-200 border-amber-300   hover:border-amber-500',
  battleship: 'bg-gradient-to-br from-cyan-100    to-sky-200    border-cyan-300    hover:border-cyan-500',
  abduction:  'bg-gradient-to-br from-lime-100    to-lime-200   border-lime-300    hover:border-lime-500',
  // Multi-stop on purpose — the one tile that isn't a single animation reads as
  // a mixed bag at a glance, the same trick winner-reveal pulls in BuildMode.
  lotto:      'bg-gradient-to-br from-fuchsia-100 via-violet-200 to-indigo-200 border-fuchsia-300 hover:border-fuchsia-500',
}

const SLIDE_META = {
  'pre-show':          { label: 'Pre-Show',    color: 'bg-sky-100 text-sky-700' },
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
  'winner-reveal':     { label: 'Winner',      color: 'bg-yellow-100 text-yellow-800' },
  'state-of-union':    { label: 'State of Union', color: 'bg-slate-100 text-slate-700' },
  'rules':             { label: 'Rules',          color: 'bg-red-100 text-red-700' },
  'shiny-title':       { label: 'Shiny Title',    color: 'bg-yellow-100 text-yellow-800' },
}

function typeMeta(type) {
  return SLIDE_META[type] ?? { label: type, color: 'bg-gray-100 text-gray-600' }
}

// Which scoreboard column a phone-scored slide folds into — its own round, or
// the bonus column if the slide somehow has no round. Same rule the matching
// lock uses inline; shared here so both phone mechanics can't drift apart.
function roundKeyFor(show, slide) {
  const round = show.rounds.find(r => r.id === slide.roundId)
  return round ? `r_${round.id}` : 'bonus'
}

function counterLabel(slide, index, total, show) {
  if (!slide) return `Slide ${index + 1} / ${total}`
  if (slide.type === 'question' || slide.type === 'multi-question') {
    const roundIdx = (show?.rounds ?? []).findIndex(r => r.id === slide.roundId)
    const r = roundIdx >= 0 ? `R${roundIdx + 1}` : null
    const q = slide.data?.questionLabel ?? (slide.data?.questionNumber ? `Q${slide.data.questionNumber}` : null)
    return [q, r, `Slide ${index + 1} / ${total}`].filter(Boolean).join(' · ')
  }
  return `${typeMeta(slide.type).label} · Slide ${index + 1} / ${total}`
}

// ─── Current slide info ────────────────────────────────────────────────────

function CurrentSlideCard({ slide, show }) {
  if (!slide) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-6 flex items-center justify-center flex-1">
        <p className="text-gray-300 text-sm">No slide</p>
      </div>
    )
  }

  const { data, type } = slide
  const round = show?.rounds?.find(r => r.id === slide.roundId)
  const meta = typeMeta(type)

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
      {/* Type badge + round */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${meta.color}`}>
          {meta.label}
        </span>
        {round && (
          <span className="text-sm font-semibold text-gray-500">{round.title}</span>
        )}
        {data?.isShiny && (
          <span className="text-sm text-yellow-500 font-medium">✨ Shiny</span>
        )}
      </div>

      {/* Main content by type */}
      {type === 'question' && (() => {
        const part = resolveShinyPart(data)
        const parts = data.parts
        const partIdx = Array.isArray(parts) && parts.length > 1 ? (data.currentPart ?? 0) : null
        return (
          <div className="flex flex-col gap-3">
            {data.questionNumber != null && (
              <p className="text-lg font-semibold text-gray-400">
                {data.questionLabel || `Q${data.questionNumber}`}
                {partIdx !== null && String.fromCharCode(97 + partIdx)}
                {partIdx !== null && ` — part ${partIdx + 1} of ${parts.length}`}
              </p>
            )}
            <p className="text-2xl font-semibold text-gray-900 leading-snug">
              {part.text || <span className="text-gray-300">No question text</span>}
            </p>
            {part.answer && (
              <p className="text-sm text-gray-500">Answer: {part.answer}</p>
            )}
            {data.isSeries && data.seriesTheme && (
              <p className="text-sm text-gray-400">
                Series: {data.seriesTheme}{part.subtitle && ` — ${part.subtitle}`}
              </p>
            )}
          </div>
        )
      })()}

      {type === 'multi-question' && (
        <div className="flex flex-col gap-3">
          <p className="text-xl font-bold text-gray-800">{data.seriesTitle || 'Multi-Question'}</p>
          <ol className="space-y-1.5 list-decimal list-inside">
            {(data.questions ?? []).map((q, i) => (
              <li key={i} className="text-base text-gray-700 leading-snug">{q.text || '—'}</li>
            ))}
          </ol>
        </div>
      )}

      {(type === 'round-intro' || type === 'swing-round-intro') && (
        <div className="flex flex-col gap-2">
          <p className="text-4xl font-black text-gray-900 leading-none">
            Round {data.roundNumber}
          </p>
          <p className="text-2xl font-semibold text-gray-700">{data.roundTitle || '—'}</p>
          {data.subtitle && <p className="text-lg italic text-gray-400">{data.subtitle}</p>}
        </div>
      )}

      {type === 'grading-break' && (
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-semibold text-gray-800 leading-snug">
            {data.message || 'Grading time!'}
          </p>
        </div>
      )}

      {type === 'scoreboard-reveal' && (
        <div className="flex flex-col gap-2">
          <p className="text-3xl font-bold text-gray-900">
            {data.title || (data.afterRound != null ? `After Round ${data.afterRound}` : 'Leaderboard')}
          </p>
        </div>
      )}

      {type === 'title' && (
        <div className="flex flex-col gap-2">
          <p className="text-3xl font-black text-gray-900">{data.title || 'Title'}</p>
          {data.subtitle && <p className="text-xl text-gray-500">{data.subtitle}</p>}
        </div>
      )}

      {(type === 'custom' || type === 'pixelate-series' || type === 'pyl-reveal') && (
        <p className="text-xl text-gray-700">{data.title || data.text || meta.label}</p>
      )}
    </div>
  )
}

// ─── Up Next ───────────────────────────────────────────────────────────────

function UpNextCard({ slide, offset }) {
  const meta = typeMeta(slide.type)
  const d = slide.data
  const label = (() => {
    if (slide.type === 'question') return d.questionLabel || `Q${d.questionNumber || '?'}`
    if (slide.type === 'round-intro' || slide.type === 'swing-round-intro') return d.roundTitle || 'Round Intro'
    if (slide.type === 'shiny-title') return d.seriesTheme || d.shinyFormatName || meta.label
    if (slide.type === 'grading-break') return 'Grading Break'
    if (slide.type === 'scoreboard-reveal') return d.title || 'Leaderboard'
    return d.title || meta.label
  })()

  return (
    <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5 flex-1 min-w-0">
      <span className="text-[10px] text-gray-300 font-bold shrink-0">+{offset}</span>
      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 ${meta.color}`}>
        {meta.label}
      </span>
      <span className="text-sm text-gray-600 truncate">{label}</span>
    </div>
  )
}

// ─── LiveMode ──────────────────────────────────────────────────────────────

export default function LiveMode({ show, actions, onExitLive, onThemeChange, onOpenScoreboard, scoreboardModalOpen }) {
  const [lateTeamPopoverOpen, setLateTeamPopoverOpen] = useState(false)
  // 📱 Late Team's "show join QR" jumps the WHOLE show's current_slide_index
  // to the pre-show slide — goLiveFrom is a real navigation, broadcast to
  // every connected phone (Join.jsx's hostIndex effect pulls every phone's
  // viewedIndex toward it via Math.min, follow-mode or not) and to the TV.
  // There was previously no way back to the exact position it interrupted —
  // if the pre-show slide has a walkout song it auto-advances forward once
  // the song ends, past wherever the round actually was, and otherwise the
  // host had to manually re-navigate with nothing marking where they'd been
  // (2026-08-26, phone-suite audit — flagged HIGH, this is likely a real
  // contributor to "the app desynced/broke" reports). This ref-then-button
  // just remembers the exact index to snap everyone straight back to.
  const [preShowReturnIndex, setPreShowReturnIndex] = useState(null)
  const [scorePanelOpen, setScorePanelOpen] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [pylPickerBusy, setPylPickerBusy] = useState(false)
  const [matchingBusy, setMatchingBusy] = useState(false)
  const [matchingScoreError, setMatchingScoreError] = useState(null)
  const [wagerBusy, setWagerBusy] = useState(false)
  const [wagerError, setWagerError] = useState(null)
  const [orderBusy, setOrderBusy] = useState(false)
  const [orderScoreError, setOrderScoreError] = useState(null)
  const [bendleBusy, setBendleBusy] = useState(false)
  const [bendleError, setBendleError] = useState(null)

  // scoringBusy + the 12s cap below (2026-08-31, Opus second-opinion review
  // of the maybeStartLockCountdown fix): the fix that blocks Next during
  // scoring has no timeout of its own — supabase-js calls here have no
  // AbortController/timeout — so on the exact stalled-wifi case it exists
  // for, a *Busy flag can stay true for tens of seconds, and Next was dead
  // on every slide with no escape but a page reload. 12s comfortably covers
  // a real scoring round (three SELECTs + one upsert, normally 1-2s); past
  // that the host gets Next back and any real failure is already showing
  // its error on-screen via the Retry Scoring button.
  const scoringBusy = matchingBusy || orderBusy || wagerBusy || bendleBusy
  const scoringSinceRef = useRef(0)
  useEffect(() => { scoringSinceRef.current = scoringBusy ? Date.now() : 0 }, [scoringBusy])

  const slides = sortedSlides(show)
  const currentIndex = show.showState.currentSlideIndex ?? 0
  const currentSlide = slides[currentIndex] ?? null
  const nextSlides = slides.slice(currentIndex + 1, currentIndex + 3)
  const atStart = currentIndex === 0
  const atEnd = currentIndex >= slides.length - 1

  // wagerError/matchingScoreError used to persist across a slide change —
  // advancing off a wager slide that hit WAGER_ZERO_ANSWERS_ERROR left the
  // "Score anyway — 0 for every team" override armed and rendered on
  // whatever wager slide came next, even one that was never locked or
  // scored, wired to force-zero-score THAT slide via currentSlide in its
  // onClick closure. Clear both on every slide change so a stale error (and
  // the destructive override it unlocks) can never follow the host forward.
  useEffect(() => {
    setWagerError(null)
    setMatchingScoreError(null)
    setOrderScoreError(null)
    setBendleError(null)
  }, [currentSlide?.id])
  // Jump-to-QR — a late team scans in mid-show. Only shown if the show
  // actually has a Pre-Show slide; jumps the TV there without touching the
  // current slide index otherwise (host navigates back manually after).
  const preShowIndex = slides.findIndex(s => s.type === 'pre-show')

  // If the host leaves the pre-show slide by any OTHER means while
  // preShowReturnIndex is armed (Prev/Next, Go Live picker, Stream Deck)
  // rather than the Resume button, drop the stale target — clicking Resume
  // afterward must not snap the show backward over navigation the host
  // already did on purpose.
  useEffect(() => {
    if (preShowReturnIndex != null && currentIndex !== preShowIndex) setPreShowReturnIndex(null)
  }, [currentIndex, preShowIndex, preShowReturnIndex])

  // B6: the scoreboard modal (Host.jsx, fixed inset-0 z-50) renders full-screen
  // on top of everything, including this wager panel's "Lock Answers & Score"
  // button. Opening it mid-wager hides the exact button the host needs next —
  // gate the modal-open trigger instead of fighting z-index against a
  // deliberately full-screen modal.
  const wagerActionShowing = currentSlide?.type === 'question'
    && isWagerShiny(currentSlide?.data)
    && !currentSlide?.data?.wagerRevealed

  const theme = getTheme(show.theme ?? show.theme_id)

  const roundsCompleted = show.rounds.filter(r => {
    const roundSlides = slides.filter(s => s.roundId === r.id)
    const lastRoundSlide = roundSlides[roundSlides.length - 1]
    return lastRoundSlide ? slides.indexOf(lastRoundSlide) < currentIndex : false
  }).length

  async function handlePickAnimation(animId) {
    if (pylPickerBusy || !currentSlide) return
    setPylPickerBusy(true)
    try {
      const { data: rawTeams, error } = await supabase
        .from('scoreboard_teams')
        .select('*')
        .eq('show_id', show.id)
      if (error || !rawTeams?.length) return
      // Excludes not-yet-named teams (`+ Team` starts blank) — same fix as
      // ScoreboardModal's picker buttons, see pickableTeams in scoreboardMath.js.
      const teams = pickableTeams(rawTeams)
      if (!teams.length) return
      const cols = deriveRoundCols(show)
      // Ascending by score, so the pool is everyone OUTSIDE the top 5 (Ben,
      // 2026-08-18: was "bottom half," which shrinks/grows with team count —
      // he wants a fixed cutoff instead, always excluding exactly the top 5
      // regardless of how many teams showed up). Falls back to every team
      // when there aren't even 6 (nothing would be "outside the top 5").
      const sorted = [...teams].sort(
        (a, b) => computeTotal(a.scores, cols) - computeTotal(b.scores, cols)
      )
      const pool = (sorted.length > 5 ? sorted.slice(0, sorted.length - 5) : sorted)
        .map(t => ({ id: t.id, name: t.name }))
      const winnerId = pool[Math.floor(Math.random() * pool.length)].id
      actions.updateSlide(currentSlide.id, {
        data: { ...currentSlide.data, animationId: animId, winnerId, pool },
      })
    } finally {
      setPylPickerBusy(false)
    }
  }

  // Locking stops teams from submitting more answers, so it's written first and
  // stays written even if scoring below fails — but the button (see JSX) stays
  // visible as "Retry Scoring" for as long as matchingRevealed is false, so a
  // transient fetch/write failure never strands the slide with no recovery path
  // short of hand-editing slide JSON.
  async function handleLockAndScoreMatching(slide) {
    setMatchingBusy(true)
    setMatchingScoreError(null)
    try {
      // Lock cutoff (2026-08-19, Ben: the lock system "needs to be reviewed"
      // — it was pure client-trust, a fixed 700ms sleep guessing Realtime
      // delivery time with no DB-side backstop). Any phone_answers row
      // written after this timestamp is a late write that slipped in after
      // the lock and gets discarded below instead of silently scored (or
      // silently NOT scored while the phone still shows a false "locked"
      // success).
      //
      // Persisted in slide.data, NOT recomputed each call — this function is
      // also the "🔁 Retry Scoring" handler for an already-locked slide
      // (matchingRevealed false), and a fresh `new Date()` on that second
      // call would silently reopen the exact window this guards: any answer
      // submitted between the real lock and the retry tap would pass a
      // recomputed cutoff. First lock wins; every retry reuses it.
      let lockedAt = slide.data.matchingLockedAt
      if (!slide.data.matchingLocked) {
        lockedAt = new Date().toISOString()
        // updateSlide is a debounced 600ms write, not a real await — without
        // flushSlides + a buffer here, the phone_answers read below used to
        // run BEFORE the lock had even reached the database, let alone the
        // phones over Realtime. A pair tapped in that gap saved successfully
        // and stayed colored on the phone, but was invisible to this fetch —
        // silently unscored while the phone showed it as submitted.
        actions.updateSlide(slide.id, { data: { ...slide.data, matchingLocked: true, matchingLockedAt: lockedAt } })
        await actions.flushSlides()
        await new Promise(r => setTimeout(r, 700))
      }

      const { data: rawAnswers, error: fetchError } = await supabase
        .from('phone_answers')
        .select('team_id, answer, submitted_at')
        .eq('slide_id', slide.id)
      if (fetchError) { console.error('phone_answers fetch failed:', fetchError); setMatchingScoreError('Scoring failed — check connection and retry'); return }
      const answers = rawAnswers?.filter(a => !a.submitted_at || a.submitted_at <= lockedAt) ?? []
      const lateCount = (rawAnswers?.length ?? 0) - answers.length
      if (lateCount > 0) console.warn(`[LiveMode] discarded ${lateCount} phone_answers row(s) submitted after matching lock`)

      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('show_id', show.id)
      if (teamsError) { console.error('teams fetch failed:', teamsError); setMatchingScoreError('Scoring failed — check connection and retry'); return }

      const { data: scoreboardTeams, error: sbError } = await supabase
        .from('scoreboard_teams')
        .select('id, show_id, name, scores, sort_order')
        .eq('show_id', show.id)
      if (sbError) { console.error('scoreboard_teams fetch failed:', sbError); setMatchingScoreError('Scoring failed — check connection and retry'); return }

      const round = show.rounds.find(r => r.id === slide.roundId)
      const roundKey = round ? `r_${round.id}` : 'bonus'
      const pointsPerMatch = slide.data.pointsPerMatch ?? 2

      const updates = computeMatchingScoreUpdates({ answers, teams, scoreboardTeams, roundKey, pointsPerMatch, slideId: slide.id })

      // Answers exist but none could be attributed to a scoreboard row — a
      // real problem (team-name mismatch, or nobody's been added to the
      // scoreboard yet), not a legitimate "nothing to score" case. Treat it
      // like any other scoring failure: don't reveal, stay on Retry Scoring.
      if ((answers?.length ?? 0) > 0 && updates.length === 0) {
        setMatchingScoreError('No answers could be matched to the scoreboard — check team names match, then retry')
        return
      }

      if (updates.length > 0) {
        const { error: updateError } = await supabase.from('scoreboard_teams').upsert(updates)
        if (updateError) { console.error('scoreboard_teams score fold-in failed:', updateError); setMatchingScoreError('Scoring failed — check connection and retry'); return }
      }

      // matchingLockedAt explicit here too, not just relying on the ...slide.data
      // spread — `slide` is this call's original param and never updates
      // mid-function, so on a first-lock-then-score-in-one-call it would
      // otherwise spread the PRE-lock data and wipe the stamp just written above.
      // No matchingRevealed here (2026-08-25, Ben: "the answer reveal
      // animation for phone questions should only invoke when i hit A"). This
      // write locks and scores; the room sees a held "Answers locked" state
      // until the host presses A (see revealCurrentSlide below). Same split in
      // handleLockAndScoreOrder/handleLockAndScoreWagers.
      await actions.updateSlide(slide.id, { data: { ...slide.data, matchingLocked: true, matchingLockedAt: lockedAt } })
    } finally {
      setMatchingBusy(false)
    }
  }

  // Order question: same lock-then-score shape as handleLockAndScoreMatching
  // above (Order has no Wager-style blind-tier phase to split into a
  // separate first lock). Reveal is a separate later host action (the A
  // key, see revealCurrentSlide below), not part of this write. Kept as its
  // own function rather than parameterizing the Matching handler, same
  // reasoning MatchingBoard/Wager already establish: each mechanic's
  // scoring call, data-shape keys
  // (orderLocked/orderRevealed vs matchingLocked/matchingRevealed) and error
  // copy differ enough that sharing one function would need its own branch
  // per mechanic anyway.
  async function handleLockAndScoreOrder(slide) {
    setOrderBusy(true)
    setOrderScoreError(null)
    try {
      // Same lock-cutoff reasoning as handleLockAndScoreMatching: persisted,
      // not recomputed, so this is also the safe "🔁 Retry Scoring" handler
      // for a slide that's already locked (orderRevealed still false).
      let lockedAt = slide.data.orderLockedAt
      if (!slide.data.orderLocked) {
        lockedAt = new Date().toISOString()
        actions.updateSlide(slide.id, { data: { ...slide.data, orderLocked: true, orderLockedAt: lockedAt } })
        await actions.flushSlides()
        await new Promise(r => setTimeout(r, 700))
      }

      const { data: rawAnswers, error: fetchError } = await supabase
        .from('phone_answers')
        .select('team_id, answer, submitted_at')
        .eq('slide_id', slide.id)
      if (fetchError) { console.error('phone_answers fetch failed:', fetchError); setOrderScoreError('Scoring failed — check connection and retry'); return }
      const answers = rawAnswers?.filter(a => !a.submitted_at || a.submitted_at <= lockedAt) ?? []
      const lateCount = (rawAnswers?.length ?? 0) - answers.length
      if (lateCount > 0) console.warn(`[LiveMode] discarded ${lateCount} phone_answers row(s) submitted after order lock`)

      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('show_id', show.id)
      if (teamsError) { console.error('teams fetch failed:', teamsError); setOrderScoreError('Scoring failed — check connection and retry'); return }

      const { data: scoreboardTeams, error: sbError } = await supabase
        .from('scoreboard_teams')
        .select('id, show_id, name, scores, sort_order')
        .eq('show_id', show.id)
      if (sbError) { console.error('scoreboard_teams fetch failed:', sbError); setOrderScoreError('Scoring failed — check connection and retry'); return }

      const updates = computeOrderScoreUpdates({
        answers, teams, scoreboardTeams,
        roundKey: roundKeyFor(show, slide),
        points: slide.data.pointsForOrder ?? DEFAULT_ORDER_POINTS,
        correctOrder: slide.data.correctOrder ?? [],
        slideId: slide.id,
      })

      // Same real-problem-vs-nothing-to-score distinction as Matching's own
      // guard — answers exist but none could be attributed to the
      // scoreboard means a name mismatch or an empty admin scoreboard, not
      // "no one played."
      if ((answers?.length ?? 0) > 0 && updates.length === 0) {
        setOrderScoreError('No answers could be matched to the scoreboard — check team names match, then retry')
        return
      }

      if (updates.length > 0) {
        const { error: updateError } = await supabase.from('scoreboard_teams').upsert(updates)
        if (updateError) { console.error('scoreboard_teams score fold-in failed:', updateError); setOrderScoreError('Scoring failed — check connection and retry'); return }
      }

      // Reveal is the host's A press, not part of this write — see
      // handleLockAndScoreMatching's final write.
      await actions.updateSlide(slide.id, { data: { ...slide.data, orderLocked: true, orderLockedAt: lockedAt } })
    } finally {
      setOrderBusy(false)
    }
  }

  // ── Wager question: two locks, in order ────────────────────────────────
  //
  // Lock 1 (wagers) is what makes the blind wager real. It SNAPSHOTS every
  // team's chosen tier onto the slide, and scoring below reads only that
  // snapshot — never the live phone_answers row. phone_answers is
  // public-update by design (it's the phone's own data), so without the
  // snapshot a team could rewrite its tier after seeing the question and the
  // host would score the rewrite. A team with no snapshot entry (joined late,
  // never wagered) is scored at Safe, the spec's implicit no-risk default.
  async function handleLockWagers(slide) {
    setWagerBusy(true)
    setWagerError(null)
    try {
      // Lock BEFORE reading, not after — the old order read phone_answers
      // first and only wrote the lock once the snapshot was built, so a tier
      // tapped in the ~600-900ms gap before that write actually reached the
      // database (updateSlide's debounce) and phones (Realtime lag) landed
      // in phone_answers but never made it into the snapshot below, while
      // the team's own phone kept showing it as their picked tier — a
      // contradiction the reveal/popup would later surface as "you played
      // it safe" on a phone that clearly shows a different tier. Locking
      // first, flushing the real write, and giving Realtime a moment to
      // deliver it shrinks that window to roughly just propagation lag
      // instead of debounce+lag combined.
      // See handleLockAndScoreMatching's identical lockedAt cutoff comment —
      // persisted in slide.data, not recomputed, so it survives a re-call.
      let lockedAt = slide.data.wagerTiersLockedAt
      if (!slide.data.wagerTiersLocked) {
        lockedAt = new Date().toISOString()
        actions.updateSlide(slide.id, { data: { ...slide.data, wagerTiersLocked: true, wagerTiersLockedAt: lockedAt } })
        await actions.flushSlides()
        await new Promise(r => setTimeout(r, 700))
      }

      const { data: rawAnswers, error } = await supabase
        .from('phone_answers')
        .select('team_id, answer, submitted_at')
        .eq('slide_id', slide.id)
      if (error) { console.error('phone_answers fetch failed:', error); setWagerError('Couldn’t read wagers — check connection and retry'); return }
      const answers = rawAnswers?.filter(a => !a.submitted_at || a.submitted_at <= lockedAt) ?? []
      const lateCount = (rawAnswers?.length ?? 0) - answers.length
      if (lateCount > 0) console.warn(`[LiveMode] discarded ${lateCount} phone_answers row(s) submitted after wager-tier lock`)

      const wagerTiers = {}
      for (const row of answers ?? []) {
        if (row.answer?.tier) wagerTiers[row.team_id] = row.answer.tier
      }
      // wagerTiersLockedAt explicit here too — same stale-spread reasoning as
      // handleLockAndScoreMatching's final write.
      await actions.updateSlide(slide.id, { data: { ...slide.data, wagerTiersLocked: true, wagerTiersLockedAt: lockedAt, wagerTiers } })
      await actions.flushSlides()
    } finally {
      setWagerBusy(false)
    }
  }

  // Lock 2 (guesses) closes submissions and scores. Same shape as the matching
  // lock: the lock flag is written first and stays written even if scoring
  // fails, and the button stays available as "Retry Scoring" until the slide
  // is revealed, so a transient failure never strands the slide.
  async function handleLockAndScoreWagers(slide, { force = false } = {}) {
    setWagerBusy(true)
    setWagerError(null)
    try {
      if (parseWagerNumber(slide.data.answer) == null) {
        setWagerError('This slide’s Answer isn’t a number — fix it in the slide editor, then score')
        return
      }
      // Defensive: this handler only makes sense once handleLockWagers has
      // actually written a tier snapshot. Reaching it without one (shouldn't
      // happen now that the button dispatch above branches on wagerTiers
      // presence rather than the lock flag — see that fix's comment for
      // exactly the trap this closes) would score every team at the Safe
      // default silently. Refuse instead.
      if (slide.data.wagerTiers == null) {
        setWagerError('Wagers were never locked — tap Lock Wagers first')
        return
      }
      // See handleLockAndScoreMatching's identical lockedAt cutoff comment —
      // persisted, not recomputed, because `force: true` above is a real
      // retry path (the "yes, actually score everyone at 0" override), and a
      // fresh timestamp on that retry would reopen the cutoff window.
      let lockedAt = slide.data.wagerGuessesLockedAt
      if (!slide.data.wagerGuessesLocked) {
        lockedAt = new Date().toISOString()
        // Same fake-await problem as the tier lock above — flush the real
        // write and give phones a moment to actually receive the lock
        // before reading what they submitted, instead of racing the read
        // against a write that hadn't left the browser yet.
        actions.updateSlide(slide.id, { data: { ...slide.data, wagerGuessesLocked: true, wagerGuessesLockedAt: lockedAt } })
        await actions.flushSlides()
        await new Promise(r => setTimeout(r, 700))
      }

      const { data: rawAnswers, error: fetchError } = await supabase
        .from('phone_answers')
        .select('team_id, answer, submitted_at')
        .eq('slide_id', slide.id)
      if (fetchError) { console.error('phone_answers fetch failed:', fetchError); setWagerError('Scoring failed — check connection and retry'); return }
      const answers = rawAnswers?.filter(a => !a.submitted_at || a.submitted_at <= lockedAt) ?? []
      const lateCount = (rawAnswers?.length ?? 0) - answers.length
      if (lateCount > 0) console.warn(`[LiveMode] discarded ${lateCount} phone_answers row(s) submitted after wager-guess lock`)

      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('show_id', show.id)
      if (teamsError) { console.error('teams fetch failed:', teamsError); setWagerError('Scoring failed — check connection and retry'); return }

      const { data: scoreboardTeams, error: sbError } = await supabase
        .from('scoreboard_teams')
        .select('id, show_id, name, scores, sort_order')
        .eq('show_id', show.id)
      if (sbError) { console.error('scoreboard_teams fetch failed:', sbError); setWagerError('Scoring failed — check connection and retry'); return }

      // Unlike matching, entries here come from `teams`, not `answers` — every
      // registered team gets scored regardless of whether the fetch above
      // actually returned anything. That's correct for a team that genuinely
      // never guessed (a real 0), but it means an EMPTY answers fetch (RLS
      // hiccup, a Realtime/PostgREST blip, anything that returns
      // success-with-no-rows) is indistinguishable from "nobody guessed" —
      // every team silently scores 0 and the room gets a reveal where no one
      // won, no error, no retry path. Refuse instead when teams exist but the
      // fetch came back suspicious-empty; matching has an equivalent guard
      // for its own empty-fetch shape (answers exist but can't be matched).
      // `force` (2026-08-17, Ben) skips this ONE check — the UI only offers
      // it after this exact error has already fired once, as a deliberate
      // "yes, actually score everyone at 0" override, not a way to bypass
      // any of the other refusals above.
      if (!force && (answers?.length ?? 0) === 0 && (teams?.length ?? 0) > 0) {
        setWagerError(WAGER_ZERO_ANSWERS_ERROR)
        return
      }

      // Every registered team gets an entry, not just the ones that submitted
      // — a team that never guessed is a real 0 that should be written to the
      // scoreboard and shown in the reveal, not silently skipped.
      const guessByTeam = new Map((answers ?? []).map(r => [r.team_id, r.answer?.guess]))
      const tierSnapshot = slide.data.wagerTiers ?? {}
      const entries = (teams ?? []).map(t => ({
        teamId: t.id,
        teamName: t.name,
        tier: tierSnapshot[t.id] ?? DEFAULT_TIER_ID,
        guess: guessByTeam.get(t.id),
      }))

      const results = scoreWagerRound({ entries, correctAnswer: slide.data.answer })
      const updates = computeWagerScoreUpdates({ results, teams, scoreboardTeams, roundKey: roundKeyFor(show, slide), slideId: slide.id })

      if (entries.length > 0 && updates.length === 0) {
        setWagerError('No teams could be matched to the scoreboard — check team names match, then retry')
        return
      }

      if (updates.length > 0) {
        const { error: updateError } = await supabase.from('scoreboard_teams').upsert(updates)
        if (updateError) { console.error('scoreboard_teams score fold-in failed:', updateError); setWagerError('Scoring failed — check connection and retry'); return }
      }

      await actions.updateSlide(slide.id, {
        data: {
          ...slide.data,
          wagerGuessesLocked: true,
          wagerGuessesLockedAt: lockedAt,
          // No wagerRevealed here — the host's A press flips it (see
          // handleLockAndScoreMatching's final write). wagerResults is still
          // computed and stored NOW, at lock time; A only decides when the
          // room gets to see it.
          // What the TV reveal renders, plus the phone-side result popup's
          // own lookup (Join.jsx). teamId IS included — unlike the original
          // "no team ids, no beatFraction, so the jsonb doesn't bloat" call,
          // a short id string per team is not meaningful bloat, and without
          // it two teams whose names normalize identically would show EACH
          // OTHER's win/lose result on the popup (same ambiguity class as
          // the scoring fold-in's name matching, just now user-visible).
          wagerResults: results.map(r => ({
            teamId: r.teamId, teamName: r.teamName, guess: r.guess, tier: r.tier, points: r.points, won: r.won,
          })),
        },
      })
    } finally {
      setWagerBusy(false)
    }
  }

  // Bendle: ONE lock, not Wager's two — there's no blind pre-question phase to
  // snapshot, the layers just play and teams guess against a running clock. So
  // this is exactly handleLockAndScoreWagers' second half (lock, read, score,
  // fold in, stash results) with Bendle's field names, and the same reveal
  // split: no bendleRevealed here, the host's A press flips it.
  async function handleLockAndScoreBendle(slide, { force = false } = {}) {
    setBendleBusy(true)
    setBendleError(null)
    try {
      // Same class of refusal as Wager's parseWagerNumber guard: without a
      // song there is no answer to match against, and scoreBendleRound would
      // happily mark every guess wrong and write a room-wide 0 to the
      // scoreboard. AddSlideWizard now requires a song before create (Fix 1,
      // 2026-09-05 whole-branch review), so this should be unreachable for any
      // slide built through the wizard — kept as a defensive fallback for a
      // hand-edited slide, since SlideEditor has no bendle-song-picker control
      // to send the host to.
      if (!slide.data.bendleSongId) {
        setBendleError('This slide has no song attached — this shouldn’t be possible. Delete and recreate the slide.')
        return
      }
      // See handleLockAndScoreMatching's identical lockedAt cutoff comment —
      // persisted in slide.data, NOT recomputed, because both "🔁 Retry
      // Scoring" and the `force: true` override re-enter here, and a fresh
      // timestamp on either would reopen the very window this closes.
      let lockedAt = slide.data.bendleGuessesLockedAt
      if (!slide.data.bendleGuessesLocked) {
        lockedAt = new Date().toISOString()
        // updateSlide is debounced, not awaited — flush the real write and
        // give Realtime a moment to deliver the lock to the phones before
        // reading what they submitted (same race the other locks document).
        actions.updateSlide(slide.id, { data: { ...slide.data, bendleGuessesLocked: true, bendleGuessesLockedAt: lockedAt } })
        await actions.flushSlides()
        await new Promise(r => setTimeout(r, 700))
      }

      const { data: rawAnswers, error: fetchError } = await supabase
        .from('phone_answers')
        .select('team_id, answer, submitted_at')
        .eq('slide_id', slide.id)
      if (fetchError) { console.error('phone_answers fetch failed:', fetchError); setBendleError('Scoring failed — check connection and retry'); return }
      const answers = rawAnswers?.filter(a => !a.submitted_at || a.submitted_at <= lockedAt) ?? []
      const lateCount = (rawAnswers?.length ?? 0) - answers.length
      if (lateCount > 0) console.warn(`[LiveMode] discarded ${lateCount} phone_answers row(s) submitted after bendle lock`)

      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('show_id', show.id)
      if (teamsError) { console.error('teams fetch failed:', teamsError); setBendleError('Scoring failed — check connection and retry'); return }

      const { data: scoreboardTeams, error: sbError } = await supabase
        .from('scoreboard_teams')
        .select('id, show_id, name, scores, sort_order')
        .eq('show_id', show.id)
      if (sbError) { console.error('scoreboard_teams fetch failed:', sbError); setBendleError('Scoring failed — check connection and retry'); return }

      // Same refusal (and same one-shot `force` override) as Wager's — see
      // BENDLE_ZERO_ANSWERS_ERROR's comment at the top of this file.
      if (!force && (answers?.length ?? 0) === 0 && (teams?.length ?? 0) > 0) {
        setBendleError(BENDLE_ZERO_ANSWERS_ERROR)
        return
      }

      // Aliases live on the song row, not the slide, so the match has to read
      // the row rather than slide.data.answer (which is only the canonical
      // title the wizard copied in at build time).
      const { data: song, error: songError } = await supabase
        .from('bendle_songs')
        .select('answer, aliases')
        .eq('id', slide.data.bendleSongId)
        .single()
      if (songError || !song) { console.error('bendle_songs fetch failed:', songError); setBendleError('Couldn’t read the song — check connection and retry'); return }

      // Every registered team gets an entry, not just the ones that submitted
      // — a team that never guessed is a real 0 that belongs on the scoreboard
      // and in the reveal, not silently skipped (same as Wager).
      const answerByTeam = new Map((answers ?? []).map(r => [r.team_id, r.answer]))
      const entries = (teams ?? []).map(t => {
        const a = answerByTeam.get(t.id)
        return { teamId: t.id, teamName: t.name, guess: a?.guess ?? null, elapsedSeconds: a?.elapsedSeconds ?? null }
      })

      const results = scoreBendleRound({ entries, song })
      const updates = computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey: roundKeyFor(show, slide), slideId: slide.id })

      if (entries.length > 0 && updates.length === 0) {
        setBendleError('No teams could be matched to the scoreboard — check team names match, then retry')
        return
      }

      if (updates.length > 0) {
        const { error: updateError } = await supabase.from('scoreboard_teams').upsert(updates)
        if (updateError) { console.error('scoreboard_teams score fold-in failed:', updateError); setBendleError('Scoring failed — check connection and retry'); return }
      }

      await actions.updateSlide(slide.id, {
        data: {
          ...slide.data,
          bendleGuessesLocked: true,
          bendleGuessesLockedAt: lockedAt,
          // Exactly what ShinyBendleQuestion's reveal and BendleBoard's phone
          // popup read — teamId included for the same reason wagerResults
          // carries one (two teams whose names normalize alike would otherwise
          // show each other's result on the phone).
          bendleResults: results.map(r => ({
            teamId: r.teamId, teamName: r.teamName, guess: r.guess, correct: r.correct, tierId: r.tierId, points: r.points,
          })),
        },
      })
    } finally {
      setBendleBusy(false)
    }
  }

  // Holds the setTimeout id for the ArrowRight reveal-then-advance sequence
  // (280ms below) while it's pending, else null. A second ArrowRight in that
  // window bails instead of double-firing nextSlide(); ArrowLeft in that
  // window CANCELS it instead of just bailing — without this, pressing Left
  // to correct a Right press reads as "Left did nothing": prevSlide() fires
  // immediately, then the stale deferred nextSlide() fires 280ms later on
  // top of it, net result is right back where the Right press left off.
  const pendingAdvanceRef = useRef(null)

  // Shared debounce for every nav path (2026-08-18 show, Ben: slides "jumped
  // back and forth" and the ring desynced into chaos off it — a chattering
  // Stream Deck button, or just a fast double-tap, fired two real nextSlide/
  // prevSlide calls before React re-rendered, both reading the same stale
  // index). The Next ▶ button already had its own guard (below); this
  // extends the same protection to Prev, and to ArrowLeft/ArrowRight, which
  // had none.
  //
  // 120ms, not the original 350ms (2026-08-19, Ben, live: Team Intro's
  // one-by-one team names "never scrolled through") — a host rapidly
  // clicking Next through a long team roster (or a multi-part shiny series)
  // easily taps faster than 350ms apart on purpose, and every one of those
  // legitimate presses inside that window was getting silently dropped,
  // not just the electrical bounce it was meant to catch. Real hardware
  // contact bounce resolves in single-digit-to-tens of milliseconds — 120ms
  // still catches that with real margin while no longer eating a human's
  // fast deliberate taps.
  const lastNavRef = useRef(0)
  const guardNav = useCallback((fn) => {
    const now = Date.now()
    if (now - lastNavRef.current < 120) return
    lastNavRef.current = now
    fn()
  }, [])

  // `actions` is a fresh object literal every render (Host.jsx builds it as
  // `{ ...showApi }` with no memoization) — putting it directly in the
  // auto-roll effect's deps below would clear and reschedule that effect's
  // timer on every single re-render of Host.jsx, not just the ones that
  // actually change the team-picker part. In a live show with realtime
  // subscriptions firing constantly, that's easily faster than the hold
  // duration, so the timer could starve and never fire. A ref sidesteps the
  // instability without needing Host.jsx's actions object to be stable.
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  // Team Intro (team-picker) auto-roll — once the host starts it, every team
  // name advances on its own, no press per name (2026-08-20, Ben: "one
  // advance button to start the whole animation ... all team names ... flow
  // together, then i have to advance to get to next slide"). The exact flow
  // Ben confirmed:
  //   part 0 (opening text)  — silent, waits for ONE explicit Next
  //   parts 1..N (teams)     — this effect rolls them automatically
  //   part N+1 (closing text)— the roll lands here and STOPS, waits for Next
  //   part N+2 (landed)      — ring-world reveal, then one more Next leaves
  // So the auto range is deliberately [1, len-3]: firing on part 0 would rob
  // the host of the "start the roll" press, and firing on len-2/len-1 would
  // blow through the closing statement and the reveal.
  //
  // /display runs a MIRROR of this effect (see Display.jsx, same constants,
  // same index law). It has to: /host and /display are both open all show,
  // only one has OS keyboard focus, and the Stream Deck's Right-Arrow goes
  // wherever that focus is. With the timer only here, a show driven from the
  // /display window rolled nothing at all — every team name needed its own
  // press (confirmed live, 2026-08-24, twice).
  //
  // The two timers can't double-fire, because each window only paces the roll
  // IT is driving. This one is scoped by construction: `currentSlide` comes
  // from useShow's local state, whose `slides` are only ever changed by this
  // window's own actions — the realtime subscription there deliberately
  // merges showState and never `slides` (useShow.js), so a /display-driven
  // currentPart change simply never reaches this effect and never arms it.
  // /display, whose subscription DOES take `slides`, can't rely on that and
  // checks ownership explicitly instead (ownsAutoRoll, slideStepping.js).
  //
  // That same non-merge is why the FIRST attempt at a /display-side timer
  // (53065d0) was reverted (9401c75): it wrote currentPart to Supabase while
  // the host's local `show.slides` stayed frozen, so the next manual Next
  // here recomputed off that stale value and silently rewound the ceremony.
  // Still true — a mid-roll switch of focus from one window to the other is
  // the one case that can still desync (see below), which is why every step,
  // manual or timed, goes through guardNav + actions.nextSlide() so
  // computeNextStep stays the single writer.
  //
  // The effect is keyed on currentPart, so ANY change to it — this timer
  // firing, or a manual Next/Prev/Stream Deck press cutting the hold short —
  // runs the cleanup, cancels the pending timeout, and reschedules against
  // the new part. That is what prevents a timer and a manual press both
  // advancing the same transition. It does NOT see a /display press (no
  // merge), so a host-armed timer mid-hold plus a sudden /display press can
  // still land two advances on one beat; don't switch windows mid-roll.
  useEffect(() => {
    if (currentSlide?.type !== 'team-picker') return
    // Nothing is revealed yet right after Go Live (computeNextStep's
    // reveal-without-stepping branch keys off a null currentSlideId). A
    // leftover currentPart from an earlier run would otherwise let this
    // timer fire that reveal press itself, so landing on Team Intro would
    // start the ceremony with no host input at all.
    if ((show.showState.currentSlideId ?? null) === null) return
    // parts = [intro, ...teams, outro, landed] — bakeTeamPickerParts() bakes
    // length = teamCount + 3. isAutoRollPart owns that index law (same file,
    // slideStepping.js) so this component can't drift from it.
    const partsLen = currentSlide.data?.parts?.length ?? 0
    const curPart = currentSlide.data?.currentPart ?? 0
    if (!isAutoRollPart(partsLen, curPart)) return
    const t = setTimeout(() => guardNav(actionsRef.current.nextSlide), TEAM_PICKER_HOLD_MS)
    return () => clearTimeout(t)
  }, [
    currentSlide?.type,
    currentSlide?.data?.currentPart,
    currentSlide?.data?.parts?.length,
    show.showState.currentSlideId,
    guardNav,
  ])

  // "Next locks answers" — starts the 3-2-1 countdown ceremony instead of
  // advancing, when the current slide is a phone-scored question with a lock
  // phase still open. pendingLockPhase (slideStepping.js) is the ONE place
  // either window checks that — see its own comment for why this ceremony
  // doesn't need ownsAutoRoll-style ownership arbitration to START safely
  // from either window (only completing it is host-only, see the effect
  // below).
  //
  // Returns true if it handled the press (started the countdown, or no-op'd
  // because one is already running) — callers must return/bail on true
  // instead of falling through to their normal advance. Already-running is
  // checked off currentSlide.data.lockCountdownStartedAt, not local state,
  // so it reads correctly no matter which window's press started it.
  function maybeStartLockCountdown() {
    const phase = pendingLockPhase(currentSlide)
    if (phase) {
      if (!currentSlide.data?.lockCountdownStartedAt) {
        guardNav(async () => {
          actions.updateSlide(currentSlide.id, {
            data: { ...currentSlide.data, lockCountdownPhase: phase, lockCountdownStartedAt: Date.now() },
          })
          // updateSlide is a debounced ~600ms write — without flushing here,
          // the ~600ms debounce plus realtime lag meant /display didn't
          // actually show "3" until ~800-1000ms had already elapsed, making
          // the first beat of the countdown nearly invisible (2026-08-25
          // review). Same pattern the lock handlers themselves already use
          // for the same reason (handleLockAndScoreMatching etc., above).
          await actions.flushSlides()
        })
      }
      return true
    }
    // pendingLockPhase goes false the INSTANT the lock+score handler's first
    // write flips e.g. orderLocked to true (React state, synchronous) — long
    // before that same handler's phone_answers/teams/scoreboard_teams fetch
    // and score upsert (the actually-slow, network-bound part) has finished.
    // Without this check, the ~3s countdown finishing read as "done, move
    // on" and Next was already unblocked by the time it visually completed:
    // pressing it advanced the host to the next slide while scoring for
    // THIS one was still in flight in the background. If that in-flight
    // write then hit a genuine network hiccup (this file's actionsRef
    // block above documents the same venue-wifi class of failure elsewhere)
    // and set matchingScoreError/orderScoreError/wagerError, that error
    // rendered on a component now showing a DIFFERENT currentSlide — so the
    // host never saw it, and the question was permanently left unscored
    // with zero indication anything went wrong (root-caused 2026-08-31
    // against the unresolved 2026-08-25 "Q6 scored 0/23, no error surfaced"
    // incident).
    //
    // NOT a complete guarantee the busy flag always matches currentSlide —
    // this only covers forward nav in THIS window. ArrowLeft/handlePrevClick
    // are ungated (ok, doesn't advance PAST the scoring slide), and
    // /display's own step path has no lock logic at all, so a Stream Deck
    // press landing there can still advance mid-scoring (both pre-existing,
    // not a regression from this fix). Capped at 12s (scoringSinceRef,
    // above) so a genuinely stalled write can't leave Next dead all night.
    return scoringBusy && Date.now() - scoringSinceRef.current < 12000
  }

  // "Next plays audio" — a plain (non-shiny) question's Click-mode clip
  // (2026-09-01, Ben live: "is there not a way to have the audio play on the
  // next button but only after i invoke it" — read the question to the room
  // first, THEN have his own Next/Stream Deck press start the clip, not a
  // literal tap on the TV). First Next after landing on the slide fires
  // show.audio_playing (QuestionAudio reacts to it — see QuestionSlide.jsx)
  // instead of advancing; the second Next, once fired, falls through to the
  // ordinary advance. Advance-mode audio already started itself at slide
  // mount — nothing to gate there, hence the audioTrigger check below.
  //
  // Checked off show.audio_playing itself, not local state, so it reads
  // correctly no matter which window's press fired it — same rationale
  // maybeStartLockCountdown's own comment gives for pendingLockPhase.
  //
  // Returns true if it handled the press — callers must return/bail on true,
  // same contract as maybeStartLockCountdown above.
  function maybeStartAudioPlay() {
    if (!currentSlide || currentSlide.type !== 'question') return false
    if (currentSlide.data?.isShiny) {
      // A shiny audio question (2026-09-01, P1 live, Round 2's "One Hit
      // Unwonder": "hitting next skips to next question, doesnt play
      // audio"). No introDone gate any more: the announce card is its own
      // `shiny-title` slide, so a shiny content slide shows its content from
      // its first frame and the first Next on it is the play press.
      if (!isAudioShiny(currentSlide.data)) return false
    } else if ((currentSlide.data?.audioTrigger ?? 'click') !== 'click') {
      return false
    }
    const part = resolveShinyPart(currentSlide.data)
    const hasAudio = !!part.youtubeId || (!!part.mediaUrl && String(part.mediaType ?? '').startsWith('audio'))
    if (!hasAudio) return false
    if (show.audio_playing?.slideId === currentSlide.id) return false
    guardNav(() => actions.setAudioPlaying({ slideId: currentSlide.id, playing: true }))
    return true
  }

  // The A press, for a phone-scored question that's locked but still holding
  // its answer back (2026-08-25, Ben: reveal "should only invoke when i hit
  // A"). pendingReveal (slideStepping.js) is the ONE place that decides
  // whether this slide owes the room a reveal, and REVEAL_FIELD the one place
  // that knows which flag each mechanic uses — no field names restated here.
  //
  // One-way, not a toggle, unlike the show-level answer_reveal it stands in
  // for: un-revealing a scored result would put the room back in a suspense
  // it has already left, and every renderer treats revealed as terminal.
  //
  // Returns true when it handled the press, so the caller falls through to
  // the ordinary answer_reveal toggle on every other kind of slide.
  function revealCurrentSlide() {
    const mechanic = pendingReveal(currentSlide)
    if (!mechanic) return false
    actions.updateSlide(currentSlide.id, {
      data: { ...currentSlide.data, [REVEAL_FIELD[mechanic]]: true },
    })
    return true
  }

  // Same actionsRef reasoning above, plus: handleLockAndScoreMatching/
  // handleLockWagers/handleLockAndScoreWagers/handleLockAndScoreOrder are
  // ordinary function declarations recreated on every render (they close
  // over this render's setMatchingBusy/etc. state setters), so calling one
  // of them directly from the completion effect's deps would clear and
  // reschedule its countdown timer far more often than a real slide/phase
  // change — same failure mode actionsRef exists to dodge. This ref always
  // points at the latest versions without pulling them into that effect's
  // deps array.
  const lockHandlersRef = useRef(null)
  lockHandlersRef.current = {
    matching: handleLockAndScoreMatching,
    'wager-tiers': handleLockWagers,
    'wager-guesses': handleLockAndScoreWagers,
    order: handleLockAndScoreOrder,
    bendle: handleLockAndScoreBendle,
  }

  // Mirrors currentSlide into a ref for the same reason actionsRef exists —
  // the completion effect below reads the LATEST slide at fire time (up to
  // LOCK_COUNTDOWN_MS later), not whatever currentSlide the effect closed
  // over when it was scheduled.
  const currentSlideRef = useRef(currentSlide)
  currentSlideRef.current = currentSlide

  // "Next locks answers" completion — mirrors the Team Intro auto-roll
  // effect above in shape: keyed on the CURRENT slide's countdown fields,
  // schedules ONE setTimeout for whatever time REMAINS until startedAt +
  // LOCK_COUNTDOWN_MS (not always the full duration — this can mount or
  // re-run partway through an already-running countdown, e.g. a re-render),
  // and on fire calls the real lock+score handler for whichever phase is
  // active. Any change to the deps below — the timer firing (which clears
  // these fields, see the scrub below), a manual Next/Prev, or the host
  // locking manually via the button — cancels and reschedules, same
  // "effect keyed on state" shape team-picker's timer uses.
  //
  // Deliberately LiveMode.jsx-only, no Display.jsx mirror — see
  // pendingLockPhase's comment in slideStepping.js: only /host can perform
  // the actual lock+score (phone_answers/teams reads, scoreboard_teams
  // writes, via `actions` Display.jsx doesn't have), so there is exactly
  // one actor capable of completing this ceremony — no double-completion
  // race to arbitrate, unlike team-picker's auto-roll.
  //
  // The slide handed to the handler has lockCountdownPhase/StartedAt
  // stripped out first — the SAME shape the plan's "cleared as part of the
  // SAME updateSlide call that performs the actual lock" calls for, without
  // touching the handler functions themselves: each one's own first write
  // spreads `...slide.data` verbatim, so scrubbing the param here is enough
  // to keep those fields out of what actually lands in the database — in
  // the normal case, where the handler's first write actually fires.
  //
  // 2026-08-25 review: that's NOT true for handleLockAndScoreWagers's
  // 'wager-guesses' phase specifically — it bails on a bad `parseWagerNumber`
  // BEFORE its first write (unlike Matching/Order/wager-tiers, whose first
  // write is unconditional). A bailed handler never writes anything, so the
  // scrub above never lands in the database either: lockCountdownStartedAt
  // stays stuck true forever, and maybeStartLockCountdown/handleStep's
  // "already running" check reads exactly that field — every subsequent
  // Next on that slide would silently no-op via Stream Deck, no visible
  // countdown to explain why (the overlay self-hides on its own timer
  // regardless of whether these fields ever cleared). The unconditional
  // cleanup write below closes that without touching the handler: whatever
  // the handler did or didn't write, this always clears the countdown
  // fields off the slide afterward, off the FRESHEST slide data (not the
  // pre-handler `slide` snapshot, so it can't stomp a field the handler's
  // own write just set) — and only when they're actually still set, so the
  // normal already-scrubbed case doesn't pay for a redundant write.
  useEffect(() => {
    const phase = currentSlide?.data?.lockCountdownPhase
    const startedAt = currentSlide?.data?.lockCountdownStartedAt
    if (!phase || !startedAt) return
    const remaining = Math.max(startedAt + LOCK_COUNTDOWN_MS - Date.now(), 0)
    const t = setTimeout(async () => {
      const slide = currentSlideRef.current
      // Bail if the slide/phase/timestamp drifted since this fired was
      // scheduled (e.g. the host locked manually via the button in the
      // meantime) — don't fire a stale-phase lock against a slide that's
      // moved on.
      if (!slide || slide.data?.lockCountdownPhase !== phase || slide.data?.lockCountdownStartedAt !== startedAt) return
      const slideId = slide.id
      const scrubbedSlide = { ...slide, data: { ...slide.data, lockCountdownPhase: null, lockCountdownStartedAt: null } }
      try {
        await lockHandlersRef.current?.[phase]?.(scrubbedSlide)
      } finally {
        const latest = currentSlideRef.current
        if (latest?.id === slideId && (latest.data?.lockCountdownPhase || latest.data?.lockCountdownStartedAt)) {
          actionsRef.current.updateSlide(slideId, {
            data: { ...latest.data, lockCountdownPhase: null, lockCountdownStartedAt: null },
          })
        }
      }
    }, remaining)
    return () => clearTimeout(t)
  }, [currentSlide?.id, currentSlide?.data?.lockCountdownPhase, currentSlide?.data?.lockCountdownStartedAt])

  const handleKeyDown = useCallback((e) => {
    // A reflexive Cmd/Ctrl/Alt shortcut (Cmd+A select-all, Cmd+R reload,
    // Cmd+S save) must never fall through to these single-letter hotkeys —
    // e.code is layout-independent and matches 'KeyA' etc. regardless of
    // modifiers, so without this guard a plain select-all mid-question
    // reveals the answer to the whole room.
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
    if (scorePanelOpen || themePickerOpen || scoreboardModalOpen) return
    // Held-key auto-repeat (a long Stream Deck press, or a finger left on
    // the arrow key) must not fire the advance/back logic once per repeat —
    // ArrowRight's own reveal-then-advance sequence below is especially
    // sensitive to this, see advancingRef.
    if (e.repeat) return
    if (e.code === 'ArrowRight') {
      e.preventDefault()
      if (pendingAdvanceRef.current) return
      // "Next locks answers": a phone-scored question with an open lock
      // phase starts the countdown instead of advancing — see
      // maybeStartLockCountdown above. Checked before the answerReveal
      // dance below since starting a countdown isn't an advance at all.
      if (maybeStartLockCountdown()) return
      if (maybeStartAudioPlay()) return
      if (show.showState.answerReveal) {
        actions.setAnswerReveal(false)
        pendingAdvanceRef.current = setTimeout(() => {
          guardNav(actions.nextSlide)
          pendingAdvanceRef.current = null
        }, 280)
      } else {
        guardNav(actions.nextSlide)
      }
    }
    if (e.code === 'ArrowLeft') {
      e.preventDefault()
      if (pendingAdvanceRef.current) {
        clearTimeout(pendingAdvanceRef.current)
        pendingAdvanceRef.current = null
      }
      guardNav(actions.prevSlide)
    }
    if (e.code === 'KeyS')       actions.setScoreboardVisible(!show.showState.scoreboardVisible)
    // A on a locked-but-unrevealed phone-scored question reveals THAT slide's
    // own result instead of toggling the show-level plain-question answer
    // overlay (unrelated flag, unrelated mechanism — see revealCurrentSlide).
    // Every other slide keeps the original toggle, untouched.
    if (e.code === 'KeyA' && !revealCurrentSlide()) actions.setAnswerReveal(!show.showState.answerReveal)
    if (e.code === 'KeyR')       actions.setScoresRevealed?.(!show.showState.scoresRevealed)
  }, [scorePanelOpen, themePickerOpen, scoreboardModalOpen, actions, show.showState.answerReveal, show.showState.scoresRevealed, guardNav, currentSlide])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // The ArrowRight path above is carefully protected against double-firing
  // (e.repeat, pendingAdvanceRef); the Next ▶ button had nothing, so an
  // accidental double-click or a fat-fingered trackpad double-tap advanced
  // TWO slides in front of the room. Timestamp guard rather than a disabled
  // state: the first click always goes through instantly (a host must never
  // feel lag on this button), only a second one inside the window is
  // dropped — see guardNav's own comment above for why that window is
  // 120ms, not the 350ms originally here (350ms turned out NOT invisible to
  // deliberately fast clicking, just to accidental double-clicking).
  // Wrapped here rather than inside actions.nextSlide so the keyboard path,
  // which has its own protection, is untouched.
  // Same pendingAdvanceRef bail ArrowRight has: an ArrowRight that cleared an
  // active answer reveal defers its nextSlide() by 280ms, and the timestamp
  // guard alone can't see that — click Next inside that window and both fire,
  // advancing two slides.
  function handleNextClick() {
    if (pendingAdvanceRef.current) return
    // "Next locks answers" — same check as the ArrowRight branch above.
    if (maybeStartLockCountdown()) return
    if (maybeStartAudioPlay()) return
    guardNav(actions.nextSlide)
  }
  function handlePrevClick() {
    guardNav(actions.prevSlide)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 select-none">

      {/* ── Top nav bar — three absolute zones ─────────────────────── */}
      <div className="relative shrink-0 h-14 bg-white border-b border-gray-100 flex items-center">
        {/* Left: Edit + Prev */}
        <div className="absolute left-0 flex items-center gap-1 px-4 h-full">
          <button
            onClick={onExitLive}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Edit
          </button>
          <NavButton onClick={handlePrevClick} disabled={atStart} label="◀ Prev" title="Previous (←)" />
          {preShowIndex !== -1 && (
            <div className="relative">
              <button
                onClick={() => setLateTeamPopoverOpen(v => !v)}
                title="A team showed up late — add them as new, or reauth a phone that lost its session"
                className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                📱 Late Team
              </button>
              {lateTeamPopoverOpen && (
                <LateTeamPopover
                  show={show}
                  onShowJoinQr={() => {
                    setPreShowReturnIndex(currentIndex)
                    actions.goLiveFrom(preShowIndex)
                  }}
                  onClose={() => setLateTeamPopoverOpen(false)}
                />
              )}
            </div>
          )}
          {preShowReturnIndex != null && (
            <button
              onClick={() => { actions.goLiveFrom(preShowReturnIndex); setPreShowReturnIndex(null) }}
              title="Jump the show (and every phone) back to where it was before showing the join QR"
              className="flex items-center gap-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-lg transition-colors"
            >
              ▶ Resume Round
            </button>
          )}
        </div>

        {/* Center: slide counter + answer-live badge */}
        <div
          className="absolute flex items-center gap-2 text-center"
          style={{ left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
        >
          <span className="text-sm font-medium text-gray-500 tabular-nums">
            {counterLabel(currentSlide, currentIndex, slides.length, show)}
          </span>
          {show.showState.answerReveal && (
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-100 text-green-700 animate-pulse">
              Answer Live
            </span>
          )}
          {!show.showState.answerReveal && currentSlide?.type === 'grading-break' && (
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 animate-pulse">
              Jukebox Live
            </span>
          )}
        </div>

        {/* Right: Next + Theme + Score */}
        <div className="absolute right-0 flex items-center gap-1 px-4 h-full">
          {/* scoringBusy shown here too (2026-08-31, Opus review) — a host
              driving the auto-countdown flow never looks at the per-mechanic
              "Scoring…" button in the score panel, so without this the only
              feedback for why Next isn't responding was that small label on
              a control they're not touching. Still enabled, not disabled —
              maybeStartLockCountdown is what actually blocks the press. */}
          <NavButton onClick={handleNextClick} disabled={atEnd} label={scoringBusy ? 'Scoring…' : 'Next ▶'} title="Next (→)" primary />
          {onThemeChange && (
            <div className="relative ml-1">
              <button
                onClick={() => setThemePickerOpen(v => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: theme.colors.highlight }} />
                World
              </button>
              {themePickerOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setThemePickerOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-52 max-h-72 overflow-y-auto">
                    {/* Only Midnight Galaxy is a real, finished "world" right
                        now — the other 20 legacy themes stay defined in
                        THEMES (nothing deleted) but aren't surfaced as live
                        options until they get the same ring-world treatment. */}
                    {THEMES.filter(t => t.id === 'midnight-galaxy').map(t => (
                      <button
                        key={t.id}
                        onClick={() => { onThemeChange(t.id); setThemePickerOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                      >
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: t.colors.highlight }} />
                        <span className={t.id === theme.id ? 'font-semibold text-gray-900' : 'text-gray-700'}>{t.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => actions.setScoreboardVisible(!show.showState.scoreboardVisible)}
            title="Toggle TV scoreboard (S)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ml-1 ${
              show.showState.scoreboardVisible
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span style={{ fontSize: '0.85em' }}>📊</span>
            Score
          </button>
          {onOpenScoreboard && (
            <button
              onClick={onOpenScoreboard}
              disabled={wagerActionShowing}
              title={wagerActionShowing ? 'Lock/score the wager first — the scoreboard covers that button' : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ml-1 ${
                wagerActionShowing
                  ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📊 Scores
            </button>
          )}
          <button
            onClick={() => setScorePanelOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-baynes-forest text-white text-sm font-semibold hover:bg-green-900 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="9" width="2" height="4" rx="1" fill="currentColor"/>
              <rect x="4.5" y="6" width="2" height="7" rx="1" fill="currentColor"/>
              <rect x="8" y="3" width="2" height="10" rx="1" fill="currentColor"/>
              <rect x="11.5" y="1" width="2" height="12" rx="1" fill="currentColor"/>
            </svg>
            Edit
          </button>
        </div>
      </div>

      {/* ── Main content — two columns ──────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex gap-4 p-4">

        {/* Left column — 60% */}
        <div className="flex flex-col gap-3" style={{ flex: '0 0 60%' }}>
          <CurrentSlideCard slide={currentSlide} show={show} />

          {/* `|| matchingScoreError` (2026-08-25): reveal is no longer bundled
              into scoring, so the host can press A on a slide whose scoring
              actually failed — without this the panel (and its only Retry
              Scoring button) would vanish the moment he did, stranding the
              slide exactly the way this button's own comment exists to
              prevent. Same clause on the Order and Wager panels below. */}
          {currentSlide?.type === 'question' && isMatchingShiny(currentSlide?.data) && (!currentSlide?.data?.matchingRevealed || matchingScoreError) && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
              <p className="text-xs text-gray-400 mb-3">
                {currentSlide?.data?.matchingLocked
                  ? 'Answers locked and scored — press A to reveal them on the TV.'
                  : 'Matching question — teams are submitting on their phones'}
              </p>
              <button
                onClick={() => handleLockAndScoreMatching(currentSlide)}
                disabled={matchingBusy}
                className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
                  matchingBusy
                    ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                    : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'
                }`}
              >
                {matchingBusy ? 'Scoring…' : currentSlide?.data?.matchingLocked ? '🔁 Retry Scoring' : '🔒 Lock Answers & Score'}
              </button>
              {matchingScoreError && (
                <p className="text-xs text-red-600 mt-2 text-center">{matchingScoreError}</p>
              )}
            </div>
          )}

          {currentSlide?.type === 'question' && isOrderShiny(currentSlide?.data) && (!currentSlide?.data?.orderRevealed || orderScoreError) && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
              <p className="text-xs text-gray-400 mb-3">
                {currentSlide?.data?.orderLocked
                  ? 'Answers locked and scored — press A to reveal them on the TV.'
                  : 'Order Up question — teams are submitting on their phones'}
              </p>
              <button
                onClick={() => handleLockAndScoreOrder(currentSlide)}
                disabled={orderBusy}
                className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
                  orderBusy
                    ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                    : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'
                }`}
              >
                {orderBusy ? 'Scoring…' : currentSlide?.data?.orderLocked ? '🔁 Retry Scoring' : '🔒 Lock Answers & Score'}
              </button>
              {orderScoreError && (
                <p className="text-xs text-red-600 mt-2 text-center">{orderScoreError}</p>
              )}
            </div>
          )}

          {currentSlide?.type === 'question' && isWagerShiny(currentSlide?.data) && (!currentSlide?.data?.wagerRevealed || wagerError) && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
              <p className="text-xs text-gray-400 mb-3">
                {currentSlide?.data?.wagerTiers == null
                  ? 'Wager question — teams are picking a risk tier. The question is hidden everywhere until you lock.'
                  : currentSlide?.data?.wagerGuessesLocked
                    ? 'Guesses locked and scored — press A to reveal the answer on the TV.'
                    : 'Wagers locked — the question is up and teams are entering numbers.'}
              </p>
              <button
                onClick={() => (currentSlide?.data?.wagerTiers != null
                  ? handleLockAndScoreWagers(currentSlide)
                  : handleLockWagers(currentSlide))}
                disabled={wagerBusy}
                className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
                  wagerBusy
                    ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                    : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'
                }`}
              >
                {wagerBusy
                  ? 'Working…'
                  : currentSlide?.data?.wagerTiers == null
                    ? '🎲 Lock Wagers & Reveal Question'
                    : currentSlide?.data?.wagerGuessesLocked
                      ? '🔁 Retry Scoring'
                      : '🔒 Lock Answers & Score'}
              </button>
              {wagerError && (
                <p className="text-xs text-red-600 mt-2 text-center">{wagerError}</p>
              )}
              {/* Manual override — ONLY for the empty-answers refusal, and
                  only after it's actually fired once. Retry alone can't get
                  past this if it's a genuine zero-submission round (small
                  crowd, phones failed) rather than a transient fetch blip —
                  before this existed, Retry just hit the same wall forever. */}
              {wagerError === WAGER_ZERO_ANSWERS_ERROR && (
                <button
                  onClick={() => handleLockAndScoreWagers(currentSlide, { force: true })}
                  disabled={wagerBusy}
                  className="w-full mt-2 py-2 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Score anyway — 0 for every team
                </button>
              )}
            </div>
          )}

          {currentSlide?.type === 'question' && isBendleShiny(currentSlide?.data) && (!currentSlide?.data?.bendleRevealed || bendleError) && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
              <p className="text-xs text-gray-400 mb-3">
                {currentSlide?.data?.bendleGuessesLocked
                  ? 'Guesses locked and scored — press A to reveal the song on the TV.'
                  : 'Bendle is playing — teams are guessing as the layers come in.'}
              </p>
              <button
                onClick={() => handleLockAndScoreBendle(currentSlide)}
                disabled={bendleBusy}
                className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
                  bendleBusy
                    ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                    : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'
                }`}
              >
                {bendleBusy ? 'Working…' : currentSlide?.data?.bendleGuessesLocked ? '🔁 Retry Scoring' : '🔒 Lock Answers & Score'}
              </button>
              {bendleError && (
                <p className="text-xs text-red-600 mt-2 text-center">{bendleError}</p>
              )}
              {/* Same one-shot override as the Wager panel above, offered only
                  after the empty-guesses refusal has actually fired. */}
              {bendleError === BENDLE_ZERO_ANSWERS_ERROR && (
                <button
                  onClick={() => handleLockAndScoreBendle(currentSlide, { force: true })}
                  disabled={bendleBusy}
                  className="w-full mt-2 py-2 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Score anyway — 0 for every team
                </button>
              )}
            </div>
          )}

          {currentSlide?.type === 'question' && currentSlide?.data?.shinyType === 'visual' && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
              <p className="text-xs text-gray-400 mb-3">
                {currentSlide?.data?.imagesRevealed
                  ? 'Image revealed — everyone can see it.'
                  : 'Text only for now — Reveal pans the screen up to the image.'}
              </p>
              <button
                onClick={() => actions.updateSlide(currentSlide.id, {
                  data: { ...currentSlide.data, imagesRevealed: !currentSlide.data.imagesRevealed },
                })}
                className="w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50"
              >
                {currentSlide?.data?.imagesRevealed ? '⬆️ Hide Image (pan back down)' : '🖼️ Reveal Image (pan up)'}
              </button>
            </div>
          )}

          {currentSlide?.type === 'pyl-reveal' && !currentSlide?.data?.animationId && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
              <p className="text-xs text-gray-400 mb-3">Pick animation</p>
              {/* Two rows of three rather than one row of six — six across in
                  this panel squeezes the labels to two lines each. */}
              <div className="grid grid-cols-3 gap-3">
                {SELECTION_ANIMATIONS.map(anim => (
                  <button
                    key={anim.id}
                    onClick={() => handlePickAnimation(anim.id)}
                    disabled={pylPickerBusy}
                    className={`flex flex-col items-center gap-2 px-3 py-5 rounded-2xl border-2 transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
                      pylPickerBusy
                        ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                        : `${ANIM_TILE_STYLE[anim.id] ?? 'bg-gray-50 border-gray-200 hover:border-gray-400'} text-gray-700`
                    }`}
                  >
                    <span className="text-3xl">{anim.emoji}</span>
                    <span className="text-sm font-semibold">{anim.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {nextSlides.length > 0 && (
            <div className="shrink-0">
              <p className="text-xs text-gray-400 mb-2">Up next</p>
              <div className="flex gap-2">
                {nextSlides.map((s, i) => (
                  <UpNextCard key={s.id} slide={s} offset={i + 1} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column — 40% */}
        <div className="flex flex-col gap-3 flex-1 min-w-0">

          {/* Quick stats */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
            <p className="text-xs text-gray-400 mb-3">Show status</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{currentIndex + 1}<span className="text-sm font-normal text-gray-400"> / {slides.length}</span></p>
                <p className="text-xs text-gray-400 mt-0.5">Slide</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{roundsCompleted}<span className="text-sm font-normal text-gray-400"> / {show.rounds.length}</span></p>
                <p className="text-xs text-gray-400 mt-0.5">Rounds done</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{slides.length - currentIndex - 1}</p>
                <p className="text-xs text-gray-400 mt-0.5">Remaining</p>
              </div>
            </div>
          </div>

          {/* Theme */}
          <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shrink-0 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full shrink-0" style={{ background: theme.colors.highlight }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{theme.name}</p>
              <p className="text-xs text-gray-400 font-mono truncate">{theme.colors.bg}</p>
            </div>
          </div>

          {/* Keyboard shortcuts */}
          <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shrink-0">
            <p className="text-xs text-gray-400 mb-3">Shortcuts</p>
            <div className="space-y-2">
              {[
                ['← →', 'Navigate slides'],
                ['A', 'Toggle answer'],
                ['S', 'TV scoreboard'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <code className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{key}</code>
                  <span className="text-xs text-gray-400">{label}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <ScorePanel
        open={scorePanelOpen}
        onClose={() => setScorePanelOpen(false)}
        show={show}
        actions={actions}
      />
    </div>
  )
}

function NavButton({ onClick, disabled, label, title, primary }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
        disabled
          ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
          : primary
            ? 'bg-gray-900 text-white hover:bg-gray-800 active:bg-gray-700'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
      }`}
    >
      {label}
    </button>
  )
}
