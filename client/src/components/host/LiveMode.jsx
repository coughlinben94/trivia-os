import { useEffect, useCallback, useState, useRef } from 'react'
import { sortedSlides } from '../../hooks/useShow.js'
import { getTheme, THEMES } from '../../themes/index.js'
import { resolveShinyPart, isMatchingShiny, isWagerShiny } from '../../lib/shinySeries.js'
import ScorePanel from './ScorePanel.jsx'
import LateTeamPopover from './LateTeamPopover.jsx'
import { SELECTION_ANIMATIONS } from '../display/slides/selectionAnimations.js'
import { supabase } from '../../lib/supabase.js'
import { deriveRoundCols, computeTotal } from '../../lib/scoreboardMath.js'
import { computeMatchingScoreUpdates } from '../../lib/matchingScoring.js'
import { scoreWagerRound, computeWagerScoreUpdates, parseWagerNumber, DEFAULT_TIER_ID } from '../../lib/wagerScoring.js'

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
        const introActive = data.isShiny && !data.introDone
        return (
          <div className="flex flex-col gap-3">
            {introActive && (
              <p className="text-xs font-bold uppercase tracking-wider text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1 w-fit">
                🎬 Intro showing — press Next to reveal
              </p>
            )}
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
  const [scorePanelOpen, setScorePanelOpen] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [pylPickerBusy, setPylPickerBusy] = useState(false)
  const [matchingBusy, setMatchingBusy] = useState(false)
  const [matchingScoreError, setMatchingScoreError] = useState(null)
  const [wagerBusy, setWagerBusy] = useState(false)
  const [wagerError, setWagerError] = useState(null)

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
  }, [currentSlide?.id])
  // Jump-to-QR — a late team scans in mid-show. Only shown if the show
  // actually has a Pre-Show slide; jumps the TV there without touching the
  // current slide index otherwise (host navigates back manually after).
  const preShowIndex = slides.findIndex(s => s.type === 'pre-show')

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
      const { data: teams, error } = await supabase
        .from('scoreboard_teams')
        .select('*')
        .eq('show_id', show.id)
      if (error || !teams?.length) return
      const cols = deriveRoundCols(show)
      const sorted = [...teams].sort(
        (a, b) => computeTotal(a.scores, cols) - computeTotal(b.scores, cols)
      )
      const poolCount = Math.ceil(sorted.length / 2)
      const pool = sorted.slice(0, poolCount).map(t => ({ id: t.id, name: t.name }))
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
      if (!slide.data.matchingLocked) {
        // updateSlide is a debounced 600ms write, not a real await — without
        // flushSlides + a buffer here, the phone_answers read below used to
        // run BEFORE the lock had even reached the database, let alone the
        // phones over Realtime. A pair tapped in that gap saved successfully
        // and stayed colored on the phone, but was invisible to this fetch —
        // silently unscored while the phone showed it as submitted.
        actions.updateSlide(slide.id, { data: { ...slide.data, matchingLocked: true } })
        await actions.flushSlides()
        await new Promise(r => setTimeout(r, 700))
      }

      const { data: answers, error: fetchError } = await supabase
        .from('phone_answers')
        .select('team_id, answer')
        .eq('slide_id', slide.id)
      if (fetchError) { console.error('phone_answers fetch failed:', fetchError); setMatchingScoreError('Scoring failed — check connection and retry'); return }

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

      await actions.updateSlide(slide.id, { data: { ...slide.data, matchingLocked: true, matchingRevealed: true } })
    } finally {
      setMatchingBusy(false)
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
      if (!slide.data.wagerTiersLocked) {
        actions.updateSlide(slide.id, { data: { ...slide.data, wagerTiersLocked: true } })
        await actions.flushSlides()
        await new Promise(r => setTimeout(r, 700))
      }

      const { data: answers, error } = await supabase
        .from('phone_answers')
        .select('team_id, answer')
        .eq('slide_id', slide.id)
      if (error) { console.error('phone_answers fetch failed:', error); setWagerError('Couldn’t read wagers — check connection and retry'); return }

      const wagerTiers = {}
      for (const row of answers ?? []) {
        if (row.answer?.tier) wagerTiers[row.team_id] = row.answer.tier
      }
      await actions.updateSlide(slide.id, { data: { ...slide.data, wagerTiersLocked: true, wagerTiers } })
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
      if (!slide.data.wagerGuessesLocked) {
        // Same fake-await problem as the tier lock above — flush the real
        // write and give phones a moment to actually receive the lock
        // before reading what they submitted, instead of racing the read
        // against a write that hadn't left the browser yet.
        actions.updateSlide(slide.id, { data: { ...slide.data, wagerGuessesLocked: true } })
        await actions.flushSlides()
        await new Promise(r => setTimeout(r, 700))
      }

      const { data: answers, error: fetchError } = await supabase
        .from('phone_answers')
        .select('team_id, answer')
        .eq('slide_id', slide.id)
      if (fetchError) { console.error('phone_answers fetch failed:', fetchError); setWagerError('Scoring failed — check connection and retry'); return }

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
          wagerRevealed: true,
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

  // Guards the ArrowRight reveal-then-advance sequence (280ms setTimeout
  // below) against a second press landing inside that window and firing
  // nextSlide() twice — see handleKeyDown.
  const advancingRef = useRef(false)

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
      if (advancingRef.current) return
      if (show.showState.answerReveal) {
        advancingRef.current = true
        actions.setAnswerReveal(false)
        setTimeout(() => { actions.nextSlide(); advancingRef.current = false }, 280)
      } else {
        actions.nextSlide()
      }
    }
    if (e.code === 'ArrowLeft')  { e.preventDefault(); actions.prevSlide() }
    if (e.code === 'KeyS')       actions.setScoreboardVisible(!show.showState.scoreboardVisible)
    if (e.code === 'KeyA')       actions.setAnswerReveal(!show.showState.answerReveal)
    if (e.code === 'KeyR')       actions.setScoresRevealed?.(!show.showState.scoresRevealed)
  }, [scorePanelOpen, themePickerOpen, scoreboardModalOpen, actions, show.showState.answerReveal, show.showState.scoresRevealed])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

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
          <NavButton onClick={actions.prevSlide} disabled={atStart} label="◀ Prev" title="Previous (←)" />
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
                  onShowJoinQr={() => actions.goLiveFrom(preShowIndex)}
                  onClose={() => setLateTeamPopoverOpen(false)}
                />
              )}
            </div>
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
          {show.showState.scoresRevealed && (
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 animate-pulse">
              Scores Live
            </span>
          )}
        </div>

        {/* Right: Next + Theme + Score */}
        <div className="absolute right-0 flex items-center gap-1 px-4 h-full">
          <NavButton onClick={actions.nextSlide} disabled={atEnd} label="Next ▶" title="Next (→)" primary />
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

          {currentSlide?.type === 'question' && isMatchingShiny(currentSlide?.data) && !currentSlide?.data?.matchingRevealed && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
              <p className="text-xs text-gray-400 mb-3">Matching question — teams are submitting on their phones</p>
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

          {currentSlide?.type === 'question' && isWagerShiny(currentSlide?.data) && !currentSlide?.data?.wagerRevealed && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
              <p className="text-xs text-gray-400 mb-3">
                {currentSlide?.data?.wagerTiers == null
                  ? 'Wager question — teams are picking a risk tier. The question is hidden everywhere until you lock.'
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

          {currentSlide?.type === 'pyl-reveal' && !currentSlide?.data?.animationId && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
              <p className="text-xs text-gray-400 mb-3">Pick animation</p>
              <div className="flex gap-3">
                {SELECTION_ANIMATIONS.map(anim => (
                  <button
                    key={anim.id}
                    onClick={() => handlePickAnimation(anim.id)}
                    disabled={pylPickerBusy}
                    className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
                      pylPickerBusy
                        ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                        : 'border-gray-200 hover:border-gray-400 text-gray-700'
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
                ['R', 'Scores live (Join)'],
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
