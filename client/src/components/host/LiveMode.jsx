import { useEffect, useCallback, useState, useRef, useReducer } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { sortedSlides } from '../../hooks/useShow.js'
import { getTheme, THEMES } from '../../themes/index.js'
import { resolveShinyPart } from '../../lib/shinySeries.js'
import { audioPlayPending as audioPlayPendingFor, audioPartOf } from '../../lib/audioPending.js'
import TimerControl from './TimerControl.jsx'
import { applyTimerStep } from '../../lib/showTimer.js'
import ScorePanel from './ScorePanel.jsx'
import FocusWarning from './FocusWarning.jsx'
import LateTeamPopover from './LateTeamPopover.jsx'
import { SELECTION_ANIMATIONS } from '../display/slides/selectionAnimations.js'
import { supabase } from '../../lib/supabase.js'
import { deriveRoundCols, computeTotal, pickableTeams } from '../../lib/scoreboardMath.js'
import { computeMatchingScoreUpdates } from '../../lib/matchingScoring.js'
import { computeOrderScoreUpdates, DEFAULT_ORDER_POINTS } from '../../lib/orderScoring.js'
import { computeChoiceScoreUpdates, DEFAULT_CHOICE_POINTS } from '../../lib/choiceScoring.js'
import { computeDropScoreUpdates, summarizeDrop, dropOptions, dropStepCount, DEFAULT_DROP_TOTAL } from '../../lib/dropScoring.js'
import { scoreWagerRound, computeWagerScoreUpdates, parseWagerNumber, DEFAULT_TIER_ID } from '../../lib/wagerScoring.js'
import { scoreHuesCuesRound, computeHuesCuesScoreUpdates } from '../../lib/huesCuesScoring.js'
import { computeHorseRaceScoreUpdates, DEFAULT_RACE_POINTS } from '../../lib/raceScoring.js'
import { buildPinRound, isValidPin, pinMissingSpot, pinLockedStatus, PIN_SPOT_ERROR } from '../../lib/pinScoring.js'
import { movieChainConfigError, resolveMovieChainAnswers, computeMovieChainScoreUpdates, eligibleMovieChainAnswers } from '../../lib/movieChainScoring.js'
import { movieChainRequest } from '../../lib/movieChainApi.js'
import PinRoomControl from './PinRoomControl.jsx'
import { HUES_CUES_CODE_RE } from '../../lib/huesCuesGrid.js'
import { lockRefusal, DROP_ANSWER_ERROR, HUES_CUES_ANSWER_ERROR, WAGER_ANSWER_ERROR, WAGER_TIERS_ERROR } from '../../lib/lockRefusal.js'
import { nextPressGate } from '../../lib/nextPressCue.js'
import { planHostCommand } from '../../lib/hostCommands.js'
import { useRemoteLink } from '../../hooks/useRemoteLink.js'
import { REMOTE_LINK_KEY } from '../../lib/remoteProtocol.js'
import { buildSnapshot, hostChipText } from '../../lib/remoteSnapshot.js'
import { createScoreChain, createScoreRemote, withTimeout, SCORE_CALL_TIMEOUT_MS } from '../../lib/scoreCellWrite.js'
import { scoreChangeText } from '../../lib/remoteProtocol.js'
import { EASE_OUT, EASE_EXIT } from '../../lib/easings.js'
import { fixFor } from '../../lib/remoteFix.js'
import { isAutoRollPart, TEAM_PICKER_HOLD_MS, pendingLockPhase, pendingReveal, unlockPatch, PHONE_MECHANICS, REVEAL_FIELD, LOCK_COUNTDOWN_MS } from '../../lib/slideStepping.js'

// Named so the UI can recognize this ONE specific refusal and offer a manual
// override for it — every other wager error is a real, unrecoverable-by-
// retrying-differently failure (bad connection, unlocked wagers, non-numeric
// answer), but an empty phone_answers fetch is ALSO exactly what a genuine
// zero-submission round looks like (small crowd, phones failed, or the
// question got skipped by everyone). Without an override, Retry just hits
// this same wall forever with no way to actually score the round (Ben,
// 2026-08-17: "idk why that keeps popping up ... something different" —
// found while investigating: this is the one message with no path forward).
// localStorage switch for the iPad remote link (spec §7), REMOTE_LINK_KEY
// from remoteProtocol.js. Off unless set to '1' from the chip below, so /host
// never opens a localhost socket (and Chrome never shows its local-network
// prompt) until Ben opts in on this laptop.

const WAGER_ZERO_ANSWERS_ERROR = 'No wager answers came back — check connection and retry before scoring'
const UNMATCHED_ANSWERS_ERROR = 'No answers could be matched to the scoreboard — check team names match, then retry'

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
  'awards':            { label: 'Awards',      color: 'bg-amber-100 text-amber-700' },
  'custom':            { label: 'Custom',      color: 'bg-green-100 text-green-700' },
  'pixelate-series':   { label: 'Pixelate',    color: 'bg-cyan-100 text-cyan-700' },
  'multi-question':    { label: 'Multi-Q',     color: 'bg-orange-100 text-orange-700' },
  'pyl-reveal':        { label: 'PYL',         color: 'bg-red-100 text-red-700' },
  'winner-reveal':     { label: 'Winner',      color: 'bg-yellow-100 text-yellow-800' },
  'state-of-union':    { label: 'State of Union', color: 'bg-slate-100 text-slate-700' },
  'rules':             { label: 'Rules',          color: 'bg-red-100 text-red-700' },
  'shiny-title':       { label: 'Shiny Title',    color: 'bg-yellow-100 text-yellow-800' },
  'last-call':         { label: 'Last Call',      color: 'bg-rose-100 text-rose-700' },
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

export default function LiveMode({ show, actions, onExitLive, onThemeChange, onOpenScoreboard, scoreboardModalOpen, scoreChainIdleRef, scoreChainRunRef }) {
  const [lateTeamPopoverOpen, setLateTeamPopoverOpen] = useState(false)
  const [scorePanelOpen, setScorePanelOpen] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [pylPickerBusy, setPylPickerBusy] = useState(false)
  const [matchingBusy, setMatchingBusy] = useState(false)
  const [matchingScoreError, setMatchingScoreError] = useState(null)
  const [wagerBusy, setWagerBusy] = useState(false)
  const [wagerError, setWagerError] = useState(null)
  const [orderBusy, setOrderBusy] = useState(false)
  const [orderScoreError, setOrderScoreError] = useState(null)
  const [choiceBusy, setChoiceBusy] = useState(false)
  const [choiceScoreError, setChoiceScoreError] = useState(null)
  const [dropBusy, setDropBusy] = useState(false)
  const [dropScoreError, setDropScoreError] = useState(null)
  const [huesCuesBusy, setHuesCuesBusy] = useState(false)
  const [huesCuesScoreError, setHuesCuesScoreError] = useState(null)
  const [pinBusy, setPinBusy] = useState(false)
  const [pinScoreError, setPinScoreError] = useState(null)
  const [movieChainBusy, setMovieChainBusy] = useState(false)
  const [movieChainError, setMovieChainError] = useState(null)
  const movieChainRunRef = useRef(false)
  const [raceBusy, setRaceBusy] = useState(false)
  const [raceScoreError, setRaceScoreError] = useState(null)
  const [endShowConfirm, setEndShowConfirm] = useState(false)
  const endShowConfirmTimerRef = useRef(null)

  function handleEndShowClick() {
    if (!endShowConfirm) {
      setEndShowConfirm(true)
      clearTimeout(endShowConfirmTimerRef.current)
      endShowConfirmTimerRef.current = setTimeout(() => setEndShowConfirm(false), 4000)
      return
    }
    clearTimeout(endShowConfirmTimerRef.current)
    setEndShowConfirm(false)
    actions.endShow()
  }

  // scoringBusy + the 12s cap below (2026-08-31, Opus second-opinion review
  // of the maybeStartLockCountdown fix): the fix that blocks Next during
  // scoring has no timeout of its own — supabase-js calls here have no
  // AbortController/timeout — so on the exact stalled-wifi case it exists
  // for, a *Busy flag can stay true for tens of seconds, and Next was dead
  // on every slide with no escape but a page reload. 12s comfortably covers
  // a real scoring round (three SELECTs + one upsert, normally 1-2s); past
  // that the host gets Next back and any real failure is already showing
  // its error on-screen via the Retry Scoring button.
  const scoringBusy = matchingBusy || orderBusy || wagerBusy || choiceBusy || dropBusy || huesCuesBusy || pinBusy || movieChainBusy
  const scoringSinceRef = useRef(0)
  useEffect(() => { scoringSinceRef.current = scoringBusy ? Date.now() : 0 }, [scoringBusy])
  // iPad remote only (spec §6): horse-race scoring with its own 12s cap.
  // Deliberately NOT folded into scoringBusy — that would change the
  // keyboard's Next, which is not approved (spec §15 Q2).
  const raceSinceRef = useRef(0)
  useEffect(() => { raceSinceRef.current = raceBusy ? Date.now() : 0 }, [raceBusy])
  // iPad remote only (spec §6): a jump or rescore the remote started and
  // hasn't finished, capped at 12s like scoringSinceRef. The ref is the gate
  // (set synchronously, so a second command arriving before React re-renders
  // is refused); the state only re-renders the snapshot. Never gates the keyboard.
  const [remoteRun, setRemoteRun] = useState(null) // 'jump' | 'rescore' | null
  const remoteRunSinceRef = useRef(0)
  const [remoteLinkOn, setRemoteLinkOn] = useState(() => {
    try { return localStorage.getItem(REMOTE_LINK_KEY) === '1' } catch { return false }
  })
  const [remotePaused, setRemotePaused] = useState(false)

  // The score chain (lib/scoreCellWrite.js): lockAndScore's scoreboard_teams
  // read-then-upsert and every iPad score.set run on it, one at a time. Every
  // call on it aborts after SCORE_CALL_TIMEOUT_MS, so a hung request can't
  // hold the chain. The iPad writes only the scores column of a row that
  // still exists (update, not upsert: a row deleted since the read stays gone).
  const scoreChainRef = useRef(null)
  if (!scoreChainRef.current) {
    scoreChainRef.current = createScoreChain({
      readTeams: (showId, signal) => supabase.from('scoreboard_teams').select('id, show_id, name, scores, sort_order').eq('show_id', showId).abortSignal(signal),
      updateScores: (row, signal) => supabase.from('scoreboard_teams').update({ scores: row.scores }).eq('id', row.id).eq('show_id', row.show_id).select('id').abortSignal(signal),
      timeoutMs: SCORE_CALL_TIMEOUT_MS,
    })
  }
  // Host.jsx's winner-reveal auto-save waits on this, so saveResults never
  // reads scoreboard_teams while a score write is still in flight.
  if (scoreChainIdleRef) scoreChainIdleRef.current = () => scoreChainRef.current.whenIdle()
  if (scoreChainRunRef) scoreChainRunRef.current = fn => scoreChainRef.current.run(fn)
  useEffect(() => () => { if (scoreChainRunRef) scoreChainRunRef.current = null }, [scoreChainRunRef])
  // The iPad Scores drawer's view, plus a small fading notice here for every
  // score the iPad changed, so Ben (or a helper) sees what moved.
  const [, rerenderScores] = useReducer(n => n + 1, 0)
  const [scoreNotice, setScoreNotice] = useState(null)
  const scoreRemoteRef = useRef(null)
  if (!scoreRemoteRef.current) {
    scoreRemoteRef.current = createScoreRemote({
      chain: scoreChainRef.current,
      onChange: rerenderScores,
      onSaved: change => {
        const line = scoreChangeText(change)
        console.info("[remote] %s %s", new Date().toISOString(), line)
        setScoreNotice({ line, at: Date.now() })
        // On or past the winner slide, final_scores (Shows/Dashboard) was
        // already saved from the old number: save it again. The TV's winner
        // screen read its teams on mount and can't be updated silently, so
        // the iPad says how to redraw it.
        if (pastWinnerRef.current()) {
          actionsRef.current.saveResults?.()
          return { winnerStale: true }
        }
        return null
      },
    })
  }
  useEffect(() => {
    if (!scoreNotice) return undefined
    const t = setTimeout(() => setScoreNotice(null), 6000)
    return () => clearTimeout(t)
  }, [scoreNotice])
  function toggleRemoteLink() {
    const on = !remoteLinkOn
    try { localStorage.setItem(REMOTE_LINK_KEY, on ? '1' : '0') } catch { /* private mode: session-only */ }
    setRemoteLinkOn(on)
  }

  const slides = sortedSlides(show)
  const currentIndex = show.showState.currentSlideIndex ?? 0
  // Read when a score.set lands (not when it was sent): is the show on or past its winner slide?
  const pastWinnerRef = useRef(() => false)
  pastWinnerRef.current = () => {
    const w = slides.findIndex(s => s.type === 'winner-reveal')
    return w !== -1 && currentIndex >= w
  }
  // The laptop score table's last typed save flushes as it closes: for 1s
  // after, the iPad's scores.get/score.set wait (hostCommands modal-just-closed).
  const modalWasOpenRef = useRef(!!scoreboardModalOpen)
  const modalClosedAtRef = useRef(0)
  if (modalWasOpenRef.current && !scoreboardModalOpen) modalClosedAtRef.current = Date.now()
  modalWasOpenRef.current = !!scoreboardModalOpen
  const currentSlide = slides[currentIndex] ?? null
  const nextSlides = slides.slice(currentIndex + 1, currentIndex + 3)
  const atStart = currentIndex === 0
  const atEnd = currentIndex >= slides.length - 1

  // One call gives the cue text and the machine gate the iPad echoes back as
  // expectGate (spec §8), so the two can't disagree.
  const nextGate = nextPressGate({
    slide: currentSlide, nextSlide: slides[currentIndex + 1] ?? null,
    audioPending: audioPlayPending(),
    scoringBusy: scoringBlocksNext(),
  })
  const nextCue = nextGate.label

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
    setChoiceScoreError(null)
    setDropScoreError(null)
    setHuesCuesScoreError(null)
    setPinScoreError(null)
    setMovieChainError(null)
    setRaceScoreError(null)
  }, [currentSlide?.id])
  // Which phone-scored mechanic (if any) this slide is — the ONE lookup the
  // lock/score control panel and the scoreboard-modal gate below both key off,
  // derived from PHONE_MECHANICS rather than four hand-written isXShiny calls.
  // A slide is exactly one shiny type, so `find` is the whole answer.
  const phoneMechanic = currentSlide?.type === 'question'
    ? (Object.keys(PHONE_MECHANICS).find(k => PHONE_MECHANICS[k].guard(currentSlide?.data)) ?? null)
    : null

  // B6: the scoreboard modal (Host.jsx, fixed inset-0 z-50) renders full-screen
  // on top of everything, including the lock/score panel's "Lock Answers &
  // Score" button. Opening it mid-round hides the exact button the host needs
  // next — gate the modal-open trigger instead of fighting z-index against a
  // deliberately full-screen modal. Was wager-only when B6 was found; it is
  // the same trap on all four phone mechanics, so it now covers all four.
  const phoneActionShowing = !!phoneMechanic
    && !currentSlide?.data?.[REVEAL_FIELD[phoneMechanic]]

  // The iPad Fix drawer's state for this slide: same busy/error pair the
  // lock/score panel below reads for each mechanic, horse race's own pair.
  const [fixBusy, fixError] = currentSlide?.type === 'horse-race'
    ? [raceBusy, raceScoreError]
    : ({
        matching: [matchingBusy, matchingScoreError],
        order: [orderBusy, orderScoreError],
        wager: [wagerBusy, wagerError],
        choice: [choiceBusy, choiceScoreError],
        drop: [dropBusy, dropScoreError],
        huesCues: [huesCuesBusy, huesCuesScoreError],
        pin: [pinBusy, pinScoreError],
        movieChain: [movieChainBusy, movieChainError],
      }[phoneMechanic] ?? [false, null])
  const remoteFix = fixFor(currentSlide, { busy: fixBusy, error: fixError })

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

  // ── The one lock-and-score path, shared by all four phone mechanics ────
  //
  // Matching, Order, Wager (guesses) and Bendle each used to own a
  // hand-copied version of this exact sequence. Every fetch, the lock-cutoff
  // filter, the late-write warning, the unmatched-scoreboard refusal and the
  // upsert were byte-identical across the four except for field names — and
  // they had already started drifting (each fix landed on whichever handler
  // the bug was found in). One implementation, four small configs
  // (2026-09-05 consolidation).
  //
  // Locking stops teams from submitting more answers, so it's written FIRST
  // and stays written even if scoring below fails — the panel button (see
  // JSX) stays visible as "Retry Scoring" until the slide is revealed, so a
  // transient fetch/write failure never strands the slide with no recovery
  // path short of hand-editing slide JSON.
  //
  // The one place the four genuinely differ is buildResults:
  //   · matching/order call their compute*ScoreUpdates straight on the raw
  //     `answers` and persist no results array;
  //   · wager/bendle first build one entry per REGISTERED team (a team that
  //     never guessed is a real 0, not a skip), score that with
  //     score*Round, THEN compute updates, and persist a `*Results` array
  //     the TV reveal and the phone popup both read.
  // That also decides which population's empty-updates case counts as a real
  // "couldn't match the scoreboard" error, so buildResults returns its own
  // unmatchedError rather than this helper guessing.
  //
  // zeroAnswersErrorMsg is opt-in and only wager/bendle pass one: they score
  // from `teams`, so a success-with-no-rows fetch is indistinguishable from
  // "nobody guessed" and would silently write a room-wide 0. Matching and
  // order score from `answers` themselves — zero answers there simply scores
  // nothing, which is the correct outcome, and they have never had (or
  // offered a UI override for) this refusal.
  async function lockAndScore({
    slide,
    lockField,               // e.g. 'matchingLocked', 'wagerGuessesLocked'
    lockedAtField,           // e.g. 'matchingLockedAt', 'wagerGuessesLockedAt'
    resultsField = null,     // 'wagerResults' | 'matchingResults' | null
    preCheck,                // optional: (slide) => error string | null, before any write
    loadExtra,               // optional: async (slide) => extra — `undefined` means it already set its own error and we bail
    buildResults,            // ({ answers, teams, scoreboardTeams, roundKey, slideId, extra }) => { results, updates, unmatchedError }
    zeroAnswersErrorMsg = null,
    lateLogLabel,            // e.g. 'matching lock', 'wager-guess lock'
    force = false,
    setBusy, setError,
  }) {
    setBusy(true)
    setError(null)
    try {
      if (preCheck) {
        const err = preCheck(slide)
        if (err) { setError(err); return }
      }

      // Lock cutoff (2026-08-19, Ben: the lock system "needs to be reviewed"
      // — it was pure client-trust, a fixed 700ms sleep guessing Realtime
      // delivery time with no DB-side backstop). Any phone_answers row
      // written after this timestamp is a late write that slipped in after
      // the lock and gets discarded below instead of silently scored (or
      // silently NOT scored while the phone still shows a false "locked"
      // success).
      //
      // Persisted in slide.data, NOT recomputed each call — this function is
      // also the "🔁 Retry Scoring" handler for an already-locked slide, and
      // the `force: true` override re-enters here too. A fresh `new Date()`
      // on either would silently reopen the exact window this guards: any
      // answer submitted between the real lock and the retry tap would pass
      // a recomputed cutoff. First lock wins; every retry reuses it.
      let lockedAt = slide.data[lockedAtField]
      if (!slide.data[lockField]) {
        lockedAt = new Date().toISOString()
        // updateSlide is a debounced 600ms write, not a real await — without
        // flushSlides + a buffer here, the phone_answers read below used to
        // run BEFORE the lock had even reached the database, let alone the
        // phones over Realtime. An answer tapped in that gap saved
        // successfully and stayed shown as submitted on the phone, but was
        // invisible to this fetch — silently unscored.
        actions.updateSlide(slide.id, { data: { ...slide.data, [lockField]: true, [lockedAtField]: lockedAt } })
        await actions.flushSlides()
        await new Promise(r => setTimeout(r, 700))
      }

      const { data: rawAnswers, error: fetchError } = await supabase
        .from('phone_answers')
        .select('team_id, answer, submitted_at')
        .eq('slide_id', slide.id)
        .eq('show_id', show.id)
      if (fetchError) { console.error('phone_answers fetch failed:', fetchError); setError('Scoring failed — check connection and retry'); return }
      const answers = rawAnswers?.filter(a => !a.submitted_at || a.submitted_at <= lockedAt) ?? []
      const lateCount = (rawAnswers?.length ?? 0) - answers.length
      if (lateCount > 0) console.warn(`[LiveMode] discarded ${lateCount} phone_answers row(s) submitted after ${lateLogLabel}`)

      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('show_id', show.id)
      if (teamsError) { console.error('teams fetch failed:', teamsError); setError('Scoring failed — check connection and retry'); return }

      // The scoreboard_teams read through the upsert runs on the score chain
      // (lib/scoreCellWrite.js), so an iPad score.set can never land between
      // this read and this upsert and be overwritten by it. Same calls, same
      // order as before; each early return below still ends lockAndScore.
      const STOP = Symbol('stop')
      const scored = await scoreChainRef.current.run(async () => {
        const { data: scoreboardTeams, error: sbError } = await withTimeout(signal => supabase
          .from('scoreboard_teams')
          .select('id, show_id, name, scores, sort_order')
          .eq('show_id', show.id)
          .abortSignal(signal), SCORE_CALL_TIMEOUT_MS)
        if (sbError) { console.error('scoreboard_teams fetch failed:', sbError); setError('Scoring failed — check connection and retry'); return STOP }

        // `force` (2026-08-17, Ben) skips this ONE check — the UI only offers
        // it after this exact error has already fired once, as a deliberate
        // "yes, actually score everyone at 0" override, never a way past any
        // of the other refusals.
        if (zeroAnswersErrorMsg && !force && answers.length === 0 && (teams?.length ?? 0) > 0) {
          setError(zeroAnswersErrorMsg)
          return STOP
        }

        let extra
        if (loadExtra) {
          extra = await loadExtra(slide)
          if (extra === undefined) return STOP // loadExtra already set its own error
        }

        const { results, updates, unmatchedError, extraData } = buildResults({
          answers, teams, scoreboardTeams,
          roundKey: roundKeyFor(show, slide),
          slideId: slide.id,
          extra,
        })

        // Something was there to score but none of it could be attributed to a
        // scoreboard row — a real problem (team-name mismatch, or nobody's been
        // added to the scoreboard yet), not a legitimate "nothing to score"
        // case. Treat it like any other scoring failure: don't reveal, stay on
        // Retry Scoring.
        if (unmatchedError) { setError(unmatchedError); return STOP }

        if (updates.length > 0) {
          const { error: updateError } = await withTimeout(signal => supabase.from('scoreboard_teams').upsert(updates).abortSignal(signal), SCORE_CALL_TIMEOUT_MS)
          if (updateError) { console.error('scoreboard_teams score fold-in failed:', updateError); setError('Scoring failed — check connection and retry'); return STOP }
        }
        return { results, extraData }
      })
      // The iPad's open Scores drawer shows what this segment just wrote.
      refreshScoresView()
      if (scored === STOP) return
      const { results, extraData } = scored

      // The lock fields are restated explicitly, not just left to the
      // ...slide.data spread — `slide` is this call's original param and
      // never updates mid-function, so on a first-lock-then-score-in-one-call
      // it would otherwise spread the PRE-lock data and wipe the stamp
      // written above. No `*Revealed` here (2026-08-25, Ben: "the answer
      // reveal animation for phone questions should only invoke when i hit
      // A") — this write locks and scores, the room sees a held "Answers
      // locked" state until the host presses A (see revealCurrentSlide
      // below). Results, where a mechanic has them, are still computed and
      // stored NOW; A only decides when the room gets to see them.
      const finalData = { ...slide.data, [lockField]: true, [lockedAtField]: lockedAt }
      if (resultsField && results) finalData[resultsField] = results
      if (extraData) Object.assign(finalData, extraData)
      await actions.updateSlide(slide.id, { data: finalData })
    } finally {
      setBusy(false)
    }
  }

  async function handleLockAndScoreMatching(slide) {
    await lockAndScore({
      slide,
      lockField: 'matchingLocked', lockedAtField: 'matchingLockedAt',
      lateLogLabel: 'matching lock',
      buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId }) => {
        const updates = computeMatchingScoreUpdates({
          answers, teams, scoreboardTeams, roundKey,
          pointsPerMatch: slide.data.pointsPerMatch ?? 2,
          slideId,
        })
        return {
          results: null,
          updates,
          unmatchedError: answers.length > 0 && updates.length === 0
            ? UNMATCHED_ANSWERS_ERROR
            : null,
        }
      },
      setBusy: setMatchingBusy, setError: setMatchingScoreError,
    })
  }

  // Order Up: same shape as Matching (no Wager-style blind-tier phase to
  // split into a separate first lock), differing only in its scoring call and
  // its field names.
  async function handleLockAndScoreOrder(slide) {
    await lockAndScore({
      slide,
      lockField: 'orderLocked', lockedAtField: 'orderLockedAt',
      lateLogLabel: 'order lock',
      buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId }) => {
        const updates = computeOrderScoreUpdates({
          answers, teams, scoreboardTeams, roundKey,
          points: slide.data.pointsForOrder ?? DEFAULT_ORDER_POINTS,
          correctOrder: slide.data.correctOrder ?? [],
          slideId,
        })
        return {
          results: null,
          updates,
          unmatchedError: answers.length > 0 && updates.length === 0
            ? UNMATCHED_ANSWERS_ERROR
            : null,
        }
      },
      setBusy: setOrderBusy, setError: setOrderScoreError,
    })
  }

  // Choice: same shape as Order — one lock field, no reveal-worthy result
  // object, just a scoreboard fold-in.
  async function handleLockAndScoreChoice(slide) {
    await lockAndScore({
      slide,
      lockField: 'choiceLocked', lockedAtField: 'choiceLockedAt',
      lateLogLabel: 'choice lock',
      buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId }) => {
        const updates = computeChoiceScoreUpdates({
          answers, teams, scoreboardTeams, roundKey,
          points: slide.data.pointsForChoice ?? DEFAULT_CHOICE_POINTS,
          correctIds: slide.data.correctIds ?? [],
          slideId,
        })
        return {
          results: null,
          updates,
          unmatchedError: answers.length > 0 && updates.length === 0
            ? UNMATCHED_ANSWERS_ERROR
            : null,
        }
      },
      setBusy: setChoiceBusy, setError: setChoiceScoreError,
    })
  }

  // The Drop: same shape as Choice (one lock field), but every registered team
  // is scored (no answer = a real 0) and the room-wide aggregate the TV reveals
  // at the end (points per tile, all-in count) is computed here, now, and
  // stored — /display can't read phone_answers itself. Re-entering this on an
  // already-locked slide (Retry Scoring, or the host fixing the correct tile)
  // re-scores from scratch. Plain Retry keeps the drops where they are; only
  // fixDropCorrect rewinds them, since the reveal it showed is then wrong.
  // Scores are keyed by slideId, so nothing doubles.
  async function handleLockAndScoreDrop(slide) {
    await lockAndScore({
      slide,
      lockField: 'dropLocked', lockedAtField: 'dropLockedAt',
      lateLogLabel: 'drop lock',
      preCheck: s => (dropOptions(s.data).some(o => o.id === s.data.correctId) ? null : DROP_ANSWER_ERROR),
      buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId }) => {
        const optionIds = dropOptions(slide.data).map(o => o.id)
        const total = slide.data.dropTotal ?? DEFAULT_DROP_TOTAL
        const correctId = slide.data.correctId
        const updates = computeDropScoreUpdates({
          answers, teams, scoreboardTeams, roundKey, correctId, optionIds, total, slideId,
        })
        return {
          results: null,
          updates,
          // Retry Scoring keeps wherever the drops are (fixDropCorrect is what
          // rewinds them, by handing in a slide already reset to step 0). A
          // slide with no wrong tile to drop has nothing to step, so it is
          // revealed the moment it is scored.
          extraData: {
            dropResults: summarizeDrop(answers, optionIds, correctId, total),
            // Stamped once, on the first lock: the fall order is a shuffle
            // seeded from this, so retries and fix-correct keep it stable and
            // an Unlock (which clears it) gives a fresh order next time.
            dropSeed: slide.data.dropSeed ?? Math.floor(Math.random() * 2 ** 31),
            dropStep: slide.data.dropStep ?? 0,
            dropRevealed: dropStepCount(slide.data) === 0 ? true : !!slide.data.dropRevealed,
          },
          unmatchedError: (teams?.length ?? 0) > 0 && updates.length === 0
            ? 'No teams could be matched to the scoreboard — check team names match, then retry'
            : null,
        }
      },
      setBusy: setDropBusy, setError: setDropScoreError,
    })
  }

  // The host picked the wrong correct tile: set the right one, rewind the
  // drops, and score everyone again against it.
  function fixDropCorrect(id) {
    if (!currentSlide || dropBusy || id === currentSlide.data.correctId) return
    handleLockAndScoreDrop({
      ...currentSlide,
      data: { ...currentSlide.data, correctId: id, dropStep: 0, dropRevealed: false, dropResults: null },
    })
  }

  // Horse race: same shape as Choice — one lock field, no results snapshot
  // (the race animation itself is the reveal, not a TV cascade — Ben's
  // call). Scores against slide.data.answer, the derived winner name
  // RaceEditor already recomputes from contenders+beats — never a second
  // typed answer field to drift from what the race itself shows.
  async function handleLockAndScoreHorseRace(slide) {
    await lockAndScore({
      slide,
      lockField: 'raceLocked', lockedAtField: 'raceLockedAt',
      lateLogLabel: 'horse-race lock',
      buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId }) => {
        const updates = computeHorseRaceScoreUpdates({
          answers, teams, scoreboardTeams, roundKey,
          points: slide.data.pointsForRace ?? DEFAULT_RACE_POINTS,
          correctAnswer: slide.data.answer ?? '',
          slideId,
        })
        return {
          results: null,
          updates,
          unmatchedError: answers.length > 0 && updates.length === 0
            ? UNMATCHED_ANSWERS_ERROR
            : null,
        }
      },
      setBusy: setRaceBusy, setError: setRaceScoreError,
    })
  }

  // Hues and Cues: absolute scoring against slide.data.answer (no scoreboard-
  // relative tiers like wager), and unlike Choice/Order/Matching it DOES
  // persist a results snapshot (huesCuesResults) — the TV reveal (Task 6)
  // needs per-team guess/distance/points to render, not just a scoreboard
  // fold-in.
  async function handleLockAndScoreHuesCues(slide) {
    await lockAndScore({
      slide,
      lockField: 'huesCuesLocked', lockedAtField: 'huesCuesLockedAt',
      resultsField: 'huesCuesResults',
      preCheck: s => HUES_CUES_CODE_RE.test(s.data.answer ?? '') ? null : HUES_CUES_ANSWER_ERROR,
      lateLogLabel: 'hues-cues lock',
      buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId }) => {
        const teamIdToName = new Map((teams ?? []).map(t => [t.id, t.name]))
        const entries = (answers ?? []).map(a => ({
          teamId: a.team_id,
          teamName: teamIdToName.get(a.team_id) ?? null,
          guess: a.answer,
        }))
        const results = scoreHuesCuesRound({ entries, correctAnswer: slide.data.answer })
        const updates = computeHuesCuesScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
        return {
          results,
          updates,
          unmatchedError: answers.length > 0 && updates.length === 0
            ? UNMATCHED_ANSWERS_ERROR
            : null,
        }
      },
      setBusy: setHuesCuesBusy,
      setError: setHuesCuesScoreError,
    })
  }

  // Pin It: room-relative (top 40% by distance), scored against
  // slide.data.pinAnswer. The room size is decided ONCE at first lock
  // (payable teams, or the host's override) and saved on the slide, so
  // "Retry Scoring" and late joiners can never change who scores. Unlock
  // clears it (see PHONE_MECHANICS.pin.clearFields).
  async function handleLockAndScorePin(slide) {
    await lockAndScore({
      slide,
      lockField: 'pinLocked', lockedAtField: 'pinLockedAt',
      resultsField: 'pinResults',
      preCheck: s => isValidPin(s.data.pinAnswer) ? null : PIN_SPOT_ERROR,
      lateLogLabel: 'pin lock',
      buildResults: args => buildPinRound({ ...args, data: slide.data }),
      setBusy: setPinBusy,
      setError: setPinScoreError,
    })
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
        .eq('show_id', show.id)
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
    await lockAndScore({
      slide, force,
      lockField: 'wagerGuessesLocked', lockedAtField: 'wagerGuessesLockedAt',
      resultsField: 'wagerResults',
      lateLogLabel: 'wager-guess lock',
      // Unlike matching, entries below come from `teams`, not `answers`, so an
      // empty answers fetch would silently score the whole room at 0 with no
      // error and no retry path — see WAGER_ZERO_ANSWERS_ERROR's comment.
      zeroAnswersErrorMsg: WAGER_ZERO_ANSWERS_ERROR,
      preCheck: s => {
        if (parseWagerNumber(s.data.answer) == null) {
          return WAGER_ANSWER_ERROR
        }
        // Defensive: this handler only makes sense once handleLockWagers has
        // actually written a tier snapshot. Reaching it without one (shouldn't
        // happen now that the button dispatch below branches on wagerTiers
        // presence rather than the lock flag — see that fix's comment for
        // exactly the trap this closes) would score every team at the Safe
        // default silently. Refuse instead.
        if (s.data.wagerTiers == null) return WAGER_TIERS_ERROR
        return null
      },
      buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId }) => {
        // Every registered team gets an entry, not just the ones that
        // submitted — a team that never guessed is a real 0 that should be
        // written to the scoreboard and shown in the reveal, not skipped.
        const guessByTeam = new Map((answers ?? []).map(r => [r.team_id, r.answer?.guess]))
        const tierSnapshot = slide.data.wagerTiers ?? {}
        const entries = (teams ?? []).map(t => ({
          teamId: t.id,
          teamName: t.name,
          tier: tierSnapshot[t.id] ?? DEFAULT_TIER_ID,
          guess: guessByTeam.get(t.id),
        }))
        const results = scoreWagerRound({ entries, correctAnswer: slide.data.answer })
        const updates = computeWagerScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
        return {
          // What the TV reveal renders, plus the phone-side result popup's
          // own lookup (Join.jsx). teamId IS included — unlike the original
          // "no team ids, no beatFraction, so the jsonb doesn't bloat" call,
          // a short id string per team is not meaningful bloat, and without
          // it two teams whose names normalize identically would show EACH
          // OTHER's win/lose result on the popup (same ambiguity class as
          // the scoring fold-in's name matching, just now user-visible).
          results: results.map(r => ({
            teamId: r.teamId, teamName: r.teamName, guess: r.guess, tier: r.tier, points: r.points, won: r.won,
          })),
          updates,
          unmatchedError: entries.length > 0 && updates.length === 0
            ? 'No teams could be matched to the scoreboard — check team names match, then retry'
            : null,
        }
      },
      setBusy: setWagerBusy, setError: setWagerError,
    })
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
    // parts = [intro, ...teams, roster, outro, landed] — bakeTeamPickerParts()
    // bakes length = teamCount + 4. isAutoRollPart owns that index law (same
    // file, slideStepping.js) so this component can't drift from it.
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
  // planHostCommand (lib/hostCommands.js) decides: an open phase starts the
  // countdown, or no-ops if one is already running — either way the press
  // does not advance. Already-running is checked off
  // currentSlide.data.lockCountdownStartedAt, not local state, so it reads
  // correctly no matter which window's press started it.
  function startLockCountdown(phase) {
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
  // Checked by planHostCommand only when no lock phase is open.
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
  function scoringBlocksNext() {
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
  // startLockCountdown's own comment gives for pendingLockPhase.
  //
  // True when the next press should play the clip; runHostCommand then
  // bails instead of advancing.
  function audioPlayPending() {
    return audioPlayPendingFor(currentSlide, show.audio_playing)
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
  async function handleLockMovieChain(slide) {
    if (movieChainRunRef.current) return
    const issue = movieChainConfigError(slide.data)
    if (issue) { setMovieChainError(issue); return }
    if (slide.data.movieChainLocked) return
    movieChainRunRef.current = true
    setMovieChainBusy(true); setMovieChainError(null)
    try {
      const lockedAt = new Date().toISOString()
      actions.updateSlide(slide.id, { data: { ...slide.data, movieChainLocked: true, movieChainLockedAt: lockedAt } })
      await actions.flushSlides()
    } catch (error) {
      console.error('Movie Chain lock failed:', error)
      setMovieChainError('Could not lock chains. Check connection and retry.')
    } finally { movieChainRunRef.current = false; setMovieChainBusy(false) }
  }

  async function handleRevealMovieChain(slide) {
    if (movieChainRunRef.current || !slide.data.movieChainLocked) return
    movieChainRunRef.current = true
    setMovieChainBusy(true); setMovieChainError(null)
    try {
      const { data: teams, error: teamsError } = await supabase.from('teams').select('id, name').eq('show_id', show.id)
      if (teamsError) throw teamsError
      let results = slide.data.movieChainRevealed && Array.isArray(slide.data.movieChainResults)
        ? slide.data.movieChainResults : null
      if (!results) {
        const { data: raw, error: answerError } = await supabase.from('phone_answers')
          .select('team_id, answer, submitted_at').eq('slide_id', slide.id).eq('show_id', show.id)
        if (answerError) throw answerError
        const cutoff = slide.data.movieChainLockedAt
        if (!cutoff) throw new Error('Movie Chain lock time missing')
        const answers = eligibleMovieChainAnswers(raw, cutoff)
        const scoredResults = await resolveMovieChainAnswers(answers, {
          startId: slide.data.movieChainStart.id,
          endId: slide.data.movieChainEnd.id,
          announcedCount: slide.data.movieChainCount,
        }, id => movieChainRequest('cast', { movieId: id }))
        const teamNames = new Map(teams.map(team => [team.id, team.name]))
        results = scoredResults.map(result => ({ ...result, teamName: teamNames.get(result.teamId) ?? 'Unknown team' }))
      }
      await scoreChainRef.current.run(async () => {
        const { data: scoreboardTeams, error: sbError } = await withTimeout(signal => supabase.from('scoreboard_teams')
          .select('id, show_id, name, scores, sort_order').eq('show_id', show.id).abortSignal(signal), SCORE_CALL_TIMEOUT_MS)
        if (sbError) throw sbError
        const updates = computeMovieChainScoreUpdates({ results, teams, scoreboardTeams, roundKey: roundKeyFor(show, slide), slideId: slide.id })
        if (results.length > 0 && updates.length === 0) throw new Error('No team matched a scoreboard row')
        // Publish verdict and reveal together. No phone or TV reads the results before A.
        if (!slide.data.movieChainRevealed) {
          actions.updateSlide(slide.id, { data: { ...slide.data, movieChainLocked: true, movieChainResults: results, movieChainRevealed: true } })
          await actions.flushSlides()
        }
        if (updates.length > 0) {
          const { error: writeError } = await withTimeout(signal => supabase.from('scoreboard_teams').upsert(updates).abortSignal(signal), SCORE_CALL_TIMEOUT_MS)
          if (writeError) throw writeError
        }
      })
      refreshScoresView()
    } catch (error) {
      console.error('Movie Chain reveal failed:', error)
      setMovieChainError('Could not finish reveal or scoring. Check connection and use Retry below.')
    } finally { movieChainRunRef.current = false; setMovieChainBusy(false) }
  }

  async function correctMovieChainTeam(slide, teamId, points) {
    if (movieChainRunRef.current || !slide.data.movieChainRevealed) return
    movieChainRunRef.current = true
    setMovieChainBusy(true); setMovieChainError(null)
    try {
      const results = slide.data.movieChainResults.map(result => result.teamId === teamId
        ? { ...result, points, valid: points > 0, finalConnected: points > 0, corrected: true, reason: points > 0 ? null : 'host-correction' }
        : result)
      const { data: teams, error: teamsError } = await supabase.from('teams').select('id, name').eq('show_id', show.id)
      if (teamsError) throw teamsError
      await scoreChainRef.current.run(async () => {
        const { data: scoreboardTeams, error: sbError } = await withTimeout(signal => supabase.from('scoreboard_teams')
          .select('id, show_id, name, scores, sort_order').eq('show_id', show.id).abortSignal(signal), SCORE_CALL_TIMEOUT_MS)
        if (sbError) throw sbError
        const updates = computeMovieChainScoreUpdates({ results, teams, scoreboardTeams, roundKey: roundKeyFor(show, slide), slideId: slide.id })
        if (updates.length === 0) throw new Error('No scoreboard team matched correction')
        const { error: writeError } = await withTimeout(signal => supabase.from('scoreboard_teams').upsert(updates).abortSignal(signal), SCORE_CALL_TIMEOUT_MS)
        if (writeError) throw writeError
      })
      actions.updateSlide(slide.id, { data: { ...slide.data, movieChainResults: results } })
      await actions.flushSlides()
      refreshScoresView()
    } catch (error) {
      console.error('Movie Chain correction failed:', error)
      setMovieChainError('Could not save correction. Check connection and retry.')
    } finally { movieChainRunRef.current = false; setMovieChainBusy(false) }
  }

  function revealCurrentSlide() {
    const mechanic = pendingReveal(currentSlide)
    if (!mechanic) return false
    if (mechanic === 'movieChain') { handleRevealMovieChain(currentSlide); return true }
    actions.updateSlide(currentSlide.id, {
      data: { ...currentSlide.data, [REVEAL_FIELD[mechanic]]: true },
    })
    return true
  }

  // Manual safety-net unlock (2026-09-14, Ben: "every question with a lock
  // ie phone questions should have an unlock function... just incase
  // something were to happen. misclick on my end or something"). Reopens
  // phone submissions for the CURRENT slide's mechanic — see unlockPatch's
  // own comment (slideStepping.js) for why this is safe even after
  // scoring/reveal. Button lives in the lock/score panel below, shown
  // whenever the mechanic is locked, independent of whether it's also
  // already revealed.
  function unlockCurrentSlide() {
    if (!phoneMechanic || !currentSlide) return
    const patch = unlockPatch(phoneMechanic, currentSlide.data)
    if (!patch) return
    actions.updateSlide(currentSlide.id, { data: { ...currentSlide.data, ...patch } })
  }

  // Horse race's Unlock (not a PHONE_MECHANICS entry, so unlockCurrentSlide
  // doesn't cover it). Named so the laptop button and the iPad share it.
  function unlockHorseRace() {
    actions.updateSlide(currentSlide.id, {
      data: { ...currentSlide.data, raceLocked: false },
    })
  }

  // The lock/score panel's main button, per phone mechanic: lock and score,
  // or Retry Scoring once locked. Extracted from the panel's inline `act`
  // closures so the iPad's rescore runs the exact same handler. Wager is the
  // one two-phase mechanic: before a tier snapshot exists this runs
  // handleLockWagers (tiers only), after it the shared lock-and-score path —
  // branching on wagerTiers presence, not the lock flag, is deliberate (see
  // handleLockAndScoreWagers' preCheck). Horse race is not here: its button
  // stays laptop-only (spec §6).
  function scoreActionFor(mechanic, slide) {
    const d = slide?.data ?? {}
    return {
      matching: () => handleLockAndScoreMatching(slide),
      order: () => handleLockAndScoreOrder(slide),
      wager: () => (d.wagerTiers != null
        ? handleLockAndScoreWagers(slide)
        : handleLockWagers(slide)),
      choice: () => handleLockAndScoreChoice(slide),
      drop: () => handleLockAndScoreDrop(slide),
      huesCues: () => handleLockAndScoreHuesCues(slide),
      pin: () => handleLockAndScorePin(slide),
      movieChain: () => slide.data.movieChainLocked ? handleRevealMovieChain(slide) : handleLockMovieChain(slide),
    }[mechanic] ?? null
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
    choice: handleLockAndScoreChoice,
    drop: handleLockAndScoreDrop,
    huesCues: handleLockAndScoreHuesCues,
    pin: handleLockAndScorePin,
    movieChain: handleLockMovieChain,
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

  // One dispatcher for every host command (iPad remote spec §5): the keydown
  // wrapper and the on-screen Next/Prev buttons call it today, the remote's
  // socket will later. planHostCommand (lib/hostCommands.js) decides; this
  // performs. Returns {ok:true} | {refuse: reason}.
  function runHostCommand(cmd) {
    const plan = planHostCommand(cmd, {
      modalOpen: scorePanelOpen || themePickerOpen || scoreboardModalOpen,
      pendingAdvance: !!pendingAdvanceRef.current,
      // "Next locks answers": a phone-scored question with an open lock
      // phase starts the countdown instead of advancing — see
      // startLockCountdown above. Checked before the answerReveal dance
      // since starting a countdown isn't an advance at all.
      lockPhase: pendingLockPhase(currentSlide),
      lockCountdownRunning: !!currentSlide?.data?.lockCountdownStartedAt,
      // Next must not start a countdown its own lock would refuse (endless 3-2-1). Only
      // Pin It has its own check; hues-cues and wager-guesses go through lockRefusal.
      lockBlocked: pinMissingSpot(currentSlide) ? PIN_SPOT_ERROR : lockRefusal(currentSlide),
      scoringBlocked: scoringBlocksNext(),
      audioPending: audioPlayPending(),
      answerReveal: show.showState.answerReveal,
      scoringBusy,
      // A on a locked-but-unrevealed phone-scored question reveals THAT
      // slide's own result instead of toggling the show-level plain-question
      // answer overlay (unrelated flag, unrelated mechanism — see
      // revealCurrentSlide). Every other slide keeps the original toggle.
      revealPending: !!pendingReveal(currentSlide),
      scoreboardVisible: show.showState.scoreboardVisible,
      scoresRevealed: show.showState.scoresRevealed,
      // via:'remote' only (the keyboard and buttons never read these).
      now: Date.now(),
      paused: remotePaused,
      remoteBusy: remoteBusyNow(),
      slideId: currentSlide?.id ?? null,
      gate: nextGate.gate,
      phoneRevealed: !!phoneMechanic && !!currentSlide?.data?.[REVEAL_FIELD[phoneMechanic]],
      index: currentIndex,
      slideIds: slides.map(s => s.id),
      fix: remoteFix,
      // Scores drawer (phase 3): any scoring at all, uncapped, refuses.
      anyScoring: scoringBusy || raceBusy,
      jumpBusy: remoteRun === 'jump',
      scoreQueueDepth: scoreChainRef.current.depth(),
      scoreCols: deriveRoundCols(show),
      modalJustClosed: Date.now() - modalClosedAtRef.current < 1000,
      // iPad Timer drawer: the same shows.special_event.timer the Timer card writes.
      timer: show.special_event?.timer ?? null,
    })
    if (plan.refuse === 'lock-blocked') {
      // Surface in the panel that owns this phase's error line.
      const ph = pendingLockPhase(currentSlide)
      if (ph === 'huesCues') setHuesCuesScoreError(plan.message)
      else if (ph === 'wager-guesses') setWagerError(plan.message)
      else if (ph === 'movieChain') setMovieChainError(plan.message)
      else setPinScoreError(plan.message)
    }
    if (plan.refuse) return plan
    switch (plan.run) {
      case 'start-lock-countdown': startLockCountdown(plan.phase); break
      case 'play-audio':
        guardNav(() => actions.setAudioPlaying({ slideId: currentSlide.id, playing: true, part: audioPartOf(currentSlide.data) }))
        break
      case 'hide-answer-then-next':
        actions.setAnswerReveal(false)
        pendingAdvanceRef.current = setTimeout(() => {
          guardNav(actions.nextSlide)
          pendingAdvanceRef.current = null
        }, 280)
        break
      case 'next': guardNav(actions.nextSlide); break
      case 'prev':
        if (plan.cancelPending && pendingAdvanceRef.current) {
          clearTimeout(pendingAdvanceRef.current)
          pendingAdvanceRef.current = null
        }
        guardNav(actions.prevSlide)
        break
      case 'reveal-slide': revealCurrentSlide(); break
      case 'set-answer-reveal': actions.setAnswerReveal(plan.value); break
      case 'set-scoreboard-visible': actions.setScoreboardVisible(plan.value); break
      case 'set-scores-revealed': actions.setScoresRevealed?.(plan.value); break
      // iPad only (planHostCommand refuses these for the keyboard and buttons).
      case 'jump':
        guardNav(() => runRemote('jump', () => actions.jumpTo(plan.index)))
        break
      case 'unlock':
        if (currentSlide?.type === 'horse-race') unlockHorseRace()
        else unlockCurrentSlide()
        break
      case 'rescore': runRemote('rescore', scoreActionFor(phoneMechanic, currentSlide)); break
      // iPad Timer drawer: the Timer card's own math, written the same way.
      case 'timer-start': case 'timer-pause': case 'timer-resume': case 'timer-add': case 'timer-cancel':
        actions.setShowTimer(applyTimerStep(plan, show.special_event?.timer ?? null, Date.now()))
        break
      // iPad Scores drawer: returns { ok, later }, the outcome follows (hostReply).
      case 'scores-get':
      case 'scores-hide':
      case 'score-set': {
        const res = scoreRemoteRef.current.perform(plan, { showId: show.id, cols: deriveRoundCols(show) })
        rerenderScores() // scoreQueueDepth in the snapshot
        res.later?.finally(rerenderScores)
        return res
      }
    }
    return { ok: true }
  }
  // Reassigned every render, same as actionsRef/lockHandlersRef, so a caller
  // holding the ref (the keydown listener now, the remote socket later) never
  // runs a stale copy closed over an old `show`.
  const runHostCommandRef = useRef(runHostCommand)
  runHostCommandRef.current = runHostCommand

  // The iPad remote's busy gate (spec §6): checked before the lock phase in
  // planHostCommand. Never gates the keyboard. Covers next, prev, jump, unlock
  // and rescore. Phase 3 adds the score write queue here (non-empty = busy).
  function remoteBusyNow() {
    return scoringBlocksNext()
      || (raceBusy && Date.now() - raceSinceRef.current < 12000)
      || pylPickerBusy
      || !!currentSlide?.data?.lockCountdownStartedAt
      || (!!remoteRunSinceRef.current && Date.now() - remoteRunSinceRef.current < 12000)
      || (scoreChainRef.current.depth() > 0 && Date.now() - scoreChainRef.current.busySince() < 12000)
  }
  function refreshScoresView() {
    scoreRemoteRef.current.refresh({ showId: show.id, cols: deriveRoundCols(show) })
  }
  function runRemote(kind, fn) {
    remoteRunSinceRef.current = Date.now()
    setRemoteRun(kind)
    Promise.resolve()
      .then(fn)
      .catch(e => console.error(`[remote] ${kind} failed`, e))
      .finally(() => { remoteRunSinceRef.current = 0; setRemoteRun(null) })
  }
  const remoteLink = useRemoteLink({
    enabled: remoteLinkOn,
    runCommandRef: runHostCommandRef,
    snapshot: buildSnapshot({
      slides, index: currentIndex, showState: show.showState, cue: nextGate,
      busy: remoteBusyNow(), paused: remotePaused,
      rounds: show.rounds, jumpBusy: remoteRun === 'jump', fix: remoteFix,
      scoreQueueDepth: scoreChainRef.current.depth(), scores: scoreRemoteRef.current.view(),
      timer: show.special_event?.timer ?? null,
    }),
  })
  // The score table just closed: once its 1s guard is over, re-read an open drawer.
  useEffect(() => {
    if (scoreboardModalOpen) return undefined
    if (Date.now() - modalClosedAtRef.current >= 1000) return undefined
    const t = setTimeout(() => refreshScoresViewRef.current(), 1000)
    return () => clearTimeout(t)
  }, [scoreboardModalOpen])
  const refreshScoresViewRef = useRef(refreshScoresView)
  refreshScoresViewRef.current = refreshScoresView
  // No iPad left: stop attaching the scoreboard to the snapshot.
  useEffect(() => {
    if (remoteLink.remotes === 0 && scoreRemoteRef.current.view()) scoreRemoteRef.current.perform({ run: 'scores-hide' }, {})
  }, [remoteLink.remotes])

  const handleKeyDown = useCallback((e) => {
    // A reflexive Cmd/Ctrl/Alt shortcut (Cmd+A select-all, Cmd+R reload,
    // Cmd+S save) must never fall through to these single-letter hotkeys —
    // e.code is layout-independent and matches 'KeyA' etc. regardless of
    // modifiers, so without this guard a plain select-all mid-question
    // reveals the answer to the whole room.
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
    const cmd = { ArrowRight: 'next', ArrowLeft: 'prev', KeyA: 'answer', KeyS: 'scoreboard', KeyR: 'scores-reveal' }[e.code]
    if (!cmd) return
    // Held-key auto-repeat (a long Stream Deck press, or a finger left on
    // the arrow key) must not fire the advance/back logic once per repeat —
    // ArrowRight's own reveal-then-advance sequence is especially
    // sensitive to this, see pendingAdvanceRef.
    if (e.repeat) return
    const result = runHostCommandRef.current({ cmd })
    // Arrows only, and not when a modal swallowed the key — same as before
    // the extraction, where the modal guard returned ahead of preventDefault.
    if ((cmd === 'next' || cmd === 'prev') && result.refuse !== 'modal-open') e.preventDefault()
  }, [])

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
  // Same pendingAdvanceRef bail ArrowRight has: an ArrowRight that cleared an
  // active answer reveal defers its nextSlide() by 280ms, and the timestamp
  // guard alone can't see that — click Next inside that window and both fire,
  // advancing two slides. via:'button' keeps the buttons' own rules (no
  // modal guard, no answer-hide dance, Prev doesn't cancel a pending
  // advance) — see planHostCommand.
  function handleNextClick() {
    runHostCommand({ cmd: 'next', via: 'button' })
  }
  function handlePrevClick() {
    runHostCommand({ cmd: 'prev', via: 'button' })
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 select-none">
      <FocusWarning />
      {/* What the iPad just changed on the scoreboard. Non-modal, fades out. */}
      <AnimatePresence>
        {scoreNotice && (
          <motion.div
            key={scoreNotice.at}
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.18, ease: EASE_EXIT } }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold shadow-lg"
          >
            {scoreNotice.line}
          </motion.div>
        )}
      </AnimatePresence>

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
          <div className="relative">
            <button
              onClick={() => setLateTeamPopoverOpen(v => !v)}
              title="A team showed up late — add them as new, or reauth a phone that lost its session"
              className={`flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-lg transition-colors ${
                lateTeamPopoverOpen
                  ? 'bg-gray-200 text-gray-900'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              📱 Late Team
            </button>
            {lateTeamPopoverOpen && (
              <LateTeamPopover
                show={show}
                onClose={() => setLateTeamPopoverOpen(false)}
              />
            )}
          </div>
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
              runHostCommand is what actually blocks the press. */}
          {nextCue && (
            <span className="text-xs font-medium text-gray-500 mr-1 whitespace-nowrap">{nextCue}</span>
          )}
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
            title="Show/hide the scoreboard on the TV (S)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ml-1 ${
              show.showState.scoreboardVisible
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span style={{ fontSize: '0.85em' }}>📊</span>
            Score
          </button>
          {currentSlide?.type === 'flip-em-down' && (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => actions.updateSlide(currentSlide.id, { data: { ...currentSlide.data, elimStep: Math.max(0, (currentSlide.data?.elimStep ?? 0) - 1) } })}
                disabled={(currentSlide.data?.elimStep ?? 0) === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Undo last hint"
              >
                ↩ Hint
              </button>
              <button
                onClick={() => actions.updateSlide(currentSlide.id, { data: { ...currentSlide.data, elimStep: Math.min(3, (currentSlide.data?.elimStep ?? 0) + 1) } })}
                disabled={(currentSlide.data?.elimStep ?? 0) >= 3}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors bg-baynes-forest text-white hover:bg-green-900 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Reveal next hint"
              >
                Next Hint ({Math.min(3, (currentSlide.data?.elimStep ?? 0) + 1)}/3) →
              </button>
            </div>
          )}
          {currentSlide?.type === 'horse-race' && (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() =>
                  actions.updateSlide(currentSlide.id, {
                    data: { ...currentSlide.data, raceStartedAt: Date.now() },
                  })
                }
                disabled={Boolean(currentSlide.data?.raceStartedAt)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors bg-baynes-forest text-white hover:bg-green-900 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Start the race"
              >
                🏁 Start Race
              </button>
              <button
                onClick={() =>
                  actions.updateSlide(currentSlide.id, {
                    data: { ...currentSlide.data, raceStartedAt: null },
                  })
                }
                disabled={!currentSlide.data?.raceStartedAt}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Reset the race"
              >
                ↺ Reset
              </button>
            </div>
          )}
          {onOpenScoreboard && (
            <button
              onClick={onOpenScoreboard}
              disabled={phoneActionShowing}
              title={phoneActionShowing ? 'Lock/score this question first — the scoreboard covers that button' : 'Open the full scoreboard to add/edit teams or scores'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ml-1 ${
                phoneActionShowing
                  ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📊 Scores
            </button>
          )}
          <button
            onClick={() => setScorePanelOpen(true)}
            title="Find a team and enter their score for this question"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-baynes-forest text-white text-sm font-semibold hover:bg-green-900 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="9" width="2" height="4" rx="1" fill="currentColor"/>
              <rect x="4.5" y="6" width="2" height="7" rx="1" fill="currentColor"/>
              <rect x="8" y="3" width="2" height="10" rx="1" fill="currentColor"/>
              <rect x="11.5" y="1" width="2" height="12" rx="1" fill="currentColor"/>
            </svg>
            Grade
          </button>
          <button
            onClick={handleEndShowClick}
            title="Marks this show over so it stops showing as live on the TV and phones"
            className={`flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-lg transition-colors ml-1 ${
              endShowConfirm
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            {endShowConfirm ? 'Confirm End Show' : 'End Show'}
          </button>
        </div>
      </div>

      {/* ── Main content — two columns ──────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex gap-4 p-4">

        {/* Left column — 60% */}
        <div className="flex flex-col gap-3" style={{ flex: '0 0 60%' }}>
          <CurrentSlideCard slide={currentSlide} show={show} />

          {/* One lock/score panel for all four phone mechanics — the four
              hand-copied cards this replaces were the same card, the same
              button and the same error line, differing only in copy and which
              handler/state pair they read.

              Shown while `!revealed || error` (2026-08-25): reveal is no
              longer bundled into scoring, so the host can press A on a slide
              whose scoring actually failed — without the `|| error` half the
              panel (and its only Retry Scoring button) vanishes the moment he
              does, stranding the slide exactly the way the Retry button exists
              to prevent. */}
          {(() => {
            if (!phoneMechanic) return null
            const d = currentSlide.data ?? {}
            const panel = {
              matching: {
                busy: matchingBusy, error: matchingScoreError, zeroErr: null,
                status: d.matchingLocked
                  ? 'Answers locked and scored — press A to reveal them on the TV.'
                  : 'Matching question — teams are submitting on their phones',
                label: matchingBusy ? 'Scoring…' : d.matchingLocked ? '🔁 Retry Scoring' : '🔒 Lock Answers & Score',
                act: scoreActionFor('matching', currentSlide),
              },
              order: {
                busy: orderBusy, error: orderScoreError, zeroErr: null,
                status: d.orderLocked
                  ? 'Answers locked and scored — press A to reveal them on the TV.'
                  : 'Order Up question — teams are submitting on their phones',
                label: orderBusy ? 'Scoring…' : d.orderLocked ? '🔁 Retry Scoring' : '🔒 Lock Answers & Score',
                act: scoreActionFor('order', currentSlide),
              },
              // Wager is the one two-phase mechanic: before a tier snapshot
              // exists the button runs handleLockWagers (tiers only, no
              // scoring), after it the shared lock-and-score path. Branching
              // on wagerTiers presence rather than the lock flag is deliberate
              // — see handleLockAndScoreWagers' preCheck.
              wager: {
                busy: wagerBusy, error: wagerError, zeroErr: WAGER_ZERO_ANSWERS_ERROR,
                status: d.wagerTiers == null
                  ? 'Wager question — teams are picking a risk tier. The question is hidden everywhere until you lock.'
                  : d.wagerGuessesLocked
                    ? 'Guesses locked and scored — press A to reveal the answer on the TV.'
                    : 'Wagers locked — the question is up and teams are entering numbers.',
                label: wagerBusy
                  ? 'Working…'
                  : d.wagerTiers == null
                    ? '🎲 Lock Wagers & Reveal Question'
                    : d.wagerGuessesLocked
                      ? '🔁 Retry Scoring'
                      : '🔒 Lock Answers & Score',
                act: scoreActionFor('wager', currentSlide),
                force: () => handleLockAndScoreWagers(currentSlide, { force: true }),
              },
              choice: {
                busy: choiceBusy, error: choiceScoreError, zeroErr: null,
                status: d.choiceLocked
                  ? 'Answers locked and scored — press A to reveal the correct answer on the TV.'
                  : 'Choice question — teams are picking on their phones',
                label: choiceBusy ? 'Scoring…' : d.choiceLocked ? '🔁 Retry Scoring' : '🔒 Lock Answers & Score',
                act: scoreActionFor('choice', currentSlide),
              },
              drop: {
                busy: dropBusy, error: dropScoreError, zeroErr: null,
                status: d.dropLocked
                  ? 'Answers locked and scored — press Next to drop the first wrong tile.'
                  : 'The Drop — teams are placing their points on their phones',
                label: dropBusy ? 'Scoring…' : d.dropLocked ? '🔁 Retry Scoring' : '🔒 Lock Answers & Score',
                act: scoreActionFor('drop', currentSlide),
              },
              huesCues: {
                busy: huesCuesBusy, error: huesCuesScoreError, zeroErr: null,
                status: d.huesCuesLocked
                  ? 'Guesses locked and scored — press A to reveal the correct square on the TV.'
                  : 'Hues, Cues, and Booze — teams are guessing on their phones',
                label: huesCuesBusy ? 'Scoring…' : d.huesCuesLocked ? '🔁 Retry Scoring' : '🔒 Lock Guesses & Score',
                act: scoreActionFor('huesCues', currentSlide),
              },
              pin: {
                busy: pinBusy, error: pinScoreError, zeroErr: null,
                status: d.pinLocked
                  ? pinLockedStatus(d)
                  : 'Pin It — teams are dropping pins on their phones',
                label: pinBusy ? 'Scoring…' : d.pinLocked ? '🔁 Retry Scoring' : '🔒 Lock Pins & Score',
                act: scoreActionFor('pin', currentSlide),
              },
              movieChain: {
                busy: movieChainBusy, error: movieChainError, zeroErr: null,
                status: d.movieChainLocked
                  ? 'Chains locked. Press A to check the final connection and reveal results.'
                  : 'Movie Chain — teams are building connections on their phones.',
                label: movieChainBusy ? 'Working…' : d.movieChainRevealed ? '🔁 Retry Scoring' : d.movieChainLocked ? 'Reveal & Score (A)' : '🔒 Lock Chains',
                act: scoreActionFor('movieChain', currentSlide),
              },
            }[phoneMechanic]
            // isLocked (any lockField true) is checked separately from the
            // reveal gate below — Unlock stays available even after reveal
            // (2026-09-14, Ben: misclick recovery "just incase something
            // were to happen"), so the panel container must keep rendering
            // for that case even when the normal scoring button is hidden.
            const isLocked = PHONE_MECHANICS[phoneMechanic].lockFields.some(f => d[f])
            const hideMainPanel = d[REVEAL_FIELD[phoneMechanic]] && !panel.error
            if (hideMainPanel && !isLocked) return null
            return (
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
                {!hideMainPanel && (
                  <>
                    <p className="text-xs text-gray-400 mb-3">{panel.status}</p>
                    {phoneMechanic === 'pin' && !d.pinLocked && (
                      <PinRoomControl
                        showId={show.id}
                        override={d.pinRoomSizeOverride}
                        onOverride={v => actions.updateSlide(currentSlide.id, { data: { ...currentSlide.data, pinRoomSizeOverride: v } })}
                      />
                    )}
                    <button
                      onClick={panel.act}
                      disabled={panel.busy}
                      className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
                        panel.busy
                          ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                          : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'
                      }`}
                    >
                      {panel.label}
                    </button>
                    {panel.error && (
                      <p className="text-xs text-red-600 mt-2 text-center">{panel.error}</p>
                    )}
                    {/* Manual override — ONLY for the empty-answers refusal, only
                        on the two mechanics that HAVE one (wager/bendle score from
                        `teams`, so an empty fetch is ambiguous), and only after it
                        has actually fired once. Retry alone can't get past it if
                        it's a genuine zero-submission round (small crowd, phones
                        failed) rather than a transient fetch blip — before this
                        existed, Retry just hit the same wall forever. */}
                    {panel.zeroErr && panel.error === panel.zeroErr && (
                      <button
                        onClick={panel.force}
                        disabled={panel.busy}
                        className="w-full mt-2 py-2 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Score anyway — 0 for every team
                      </button>
                    )}
                  </>
                )}
                {phoneMechanic === 'drop' && d.dropLocked && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-400 mb-1.5">Wrong correct tile? Tap the right one — everyone is re-scored and the drops start over.</p>
                    <div className="flex gap-1.5">
                      {dropOptions(d).map((o, i) => (
                        <button
                          key={o.id}
                          onClick={() => fixDropCorrect(o.id)}
                          disabled={dropBusy}
                          className={`flex-1 py-2 rounded-lg border text-xs font-semibold disabled:opacity-40 ${
                            o.id === d.correctId
                              ? 'border-[#1a6b4a] bg-green-50 text-[#1a6b4a]'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {String.fromCharCode(65 + i)}{o.label ? ` · ${o.label.slice(0, 10)}` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {phoneMechanic === 'movieChain' && d.movieChainRevealed && Array.isArray(d.movieChainResults) && (
                  <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
                    <p className="text-xs font-semibold text-gray-600">Team results · correct a disputed credit</p>
                    {d.movieChainResults.map(result => <div key={result.teamId} className="flex items-center justify-between gap-2 text-xs text-gray-700">
                      <span className="truncate">{result.teamName}: {result.movieCount ?? '—'} movies</span>
                      <select aria-label={`Correct ${result.teamName} score`} value={result.points} disabled={movieChainBusy}
                        onChange={event => correctMovieChainTeam(currentSlide, result.teamId, Number(event.target.value))}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-gray-900">
                        <option value={0}>0</option><option value={10}>10</option><option value={15}>15</option>
                      </select>
                    </div>)}
                  </div>
                )}
                {isLocked && (
                  <button
                    onClick={unlockCurrentSlide}
                    className="w-full mt-2 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50"
                  >
                    🔓 Unlock — let teams resubmit
                  </button>
                )}
              </div>
            )
          })()}

          {/* Horse race isn't type:'question', so it sits outside the shared
              PHONE_MECHANICS panel above — its own lock+score button, same
              lockAndScore helper underneath, no results snapshot since the
              race animation itself is the reveal (no TV cascade). Unlock
              (2026-09-14, same misclick-recovery reasoning as the shared
              panel's) is inlined here too rather than folded into
              unlockCurrentSlide, since that helper is built around
              PHONE_MECHANICS/phoneMechanic and horse-race isn't in it. */}
          {currentSlide?.type === 'horse-race' && (() => {
            const d = currentSlide.data ?? {}
            const isLocked = !!d.raceLocked
            return (
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
                <p className="text-xs text-gray-400 mb-3">
                  {isLocked
                    ? 'Picks locked and scored — start the race whenever you\'re ready.'
                    : 'And They\'re Off! — teams are picking a winner on their phones'}
                </p>
                <button
                  onClick={() => handleLockAndScoreHorseRace(currentSlide)}
                  disabled={raceBusy}
                  className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
                    raceBusy
                      ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                      : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'
                  }`}
                >
                  {raceBusy ? 'Scoring…' : isLocked ? '🔁 Retry Scoring' : '🔒 Lock Picks & Score'}
                </button>
                {raceScoreError && (
                  <p className="text-xs text-red-600 mt-2 text-center">{raceScoreError}</p>
                )}
                {isLocked && (
                  <button
                    onClick={unlockHorseRace}
                    className="w-full mt-2 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50"
                  >
                    🔓 Unlock — let teams resubmit
                  </button>
                )}
              </div>
            )
          })()}

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

          <TimerControl show={show} actions={actions} />

          {/* iPad remote (spec §7). Switches are buttons, not checkboxes:
              handleKeyDown ignores keys while an <input> has focus, which
              would swallow the Stream Deck's arrows after a click. */}
          <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-400">iPad remote</p>
              <button
                role="switch"
                aria-checked={remoteLinkOn}
                onClick={toggleRemoteLink}
                title="Lets the iPad remote drive this Live Mode through the relay on this laptop"
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  remoteLinkOn ? 'bg-baynes-forest text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {remoteLinkOn ? 'On' : 'Off'}
              </button>
            </div>
            <p className="text-sm text-gray-700 mt-2">
              {hostChipText({ enabled: remoteLinkOn, status: remoteLink.status, remotes: remoteLink.remotes, paused: remotePaused })}
            </p>
            {remoteLinkOn && (
              <button
                role="switch"
                aria-checked={remotePaused}
                onClick={() => setRemotePaused(p => !p)}
                title="Refuse every iPad command until switched back"
                className={`w-full mt-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  remotePaused ? 'bg-red-600 border-red-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {remotePaused ? 'iPad remote paused — tap to resume' : 'Pause iPad remote'}
              </button>
            )}
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
