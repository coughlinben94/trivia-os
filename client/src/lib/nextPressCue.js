// What the next Next press will do, as a short host-facing label. Read-only
// mirror of the press order in LiveMode.jsx's handleNextClick / ArrowRight
// branch (lock countdown -> audio play -> answer-hide -> computeNextStep's
// part stepping -> plain advance). Labels only — never decides or performs
// a press, so a drift here misleads the host's eyes, not the show.
import { pendingLockPhase, pendingReveal, revealStepCount } from './slideStepping.js'
import { isDropShiny } from './shinySeries.js'
import { dropStepCount } from './dropScoring.js'

// The slide the press lands on, as "Show Round 3" / "Show Grading break" etc.
function landingLabel(slide) {
  if (!slide) return null
  const d = slide.data ?? {}
  switch (slide.type) {
    case 'round-intro': return d.roundNumber ? `Show Round ${d.roundNumber}` : 'Show round intro'
    case 'swing-round-intro': return 'Show Swing Round'
    case 'question': return d.questionNumber ? `Show question ${d.questionNumber}` : 'Show question'
    case 'grading-break': return 'Start grading break'
    case 'scoreboard-reveal': return 'Show scoreboard'
    case 'winner-reveal': return 'Reveal winner'
    case 'pre-show': return 'Show QR screen'
    default: return 'Next slide'
  }
}

/**
 * The label AND a machine-readable gate from one decision, so the host's
 * cue and the iPad remote's expectGate (spec §8) can't disagree. Gates:
 * lock, locking, scoring, saving, audio, walkout, reveal-part, reveal-owed,
 * advance, null (Next does nothing).
 *
 * @param {object} p
 * @param {object|null} p.slide       current slide
 * @param {object|null} p.nextSlide   the slide after it (null at the end)
 * @param {boolean} p.audioPending    LiveMode's audioPlayPending()
 * @param {boolean} p.scoringBusy
 * @param {boolean} p.saving          score writes queued (phase 3; false until then)
 * @returns {{label: string|null, gate: string|null}}
 */
export function nextPressGate({ slide, nextSlide, audioPending = false, scoringBusy = false, saving = false }) {
  if (scoringBusy) return { label: 'Scoring…', gate: 'scoring' }
  if (saving) return { label: 'Saving scores…', gate: 'saving' }
  const d = slide?.data
  const phase = slide ? pendingLockPhase(slide) : null
  if (phase) {
    if (d?.lockCountdownStartedAt) return { label: 'Locking…', gate: 'locking' }
    return { label: phase === 'wager-tiers' ? 'Lock wagers' : 'Lock answers', gate: 'lock' }
  }
  // Locked but not yet revealed: A reveals it. The keyboard's Next still
  // advances here (pre-existing); the remote refuses and lights Answer.
  if (pendingReveal(slide)) return { label: 'Press Answer to reveal', gate: 'reveal-owed' }
  // The Drop: each Next after the lock drops one wrong tile.
  if (d && isDropShiny(d) && d.dropLocked) {
    const total = dropStepCount(d)
    const step = d.dropStep ?? 0
    if (step < total) return { label: `Drop tile ${step + 1} of ${total}`, gate: 'reveal-part' }
  }
  if (audioPending) return { label: 'Play clip', gate: 'audio' }
  // computeNextStep's invoke-gated walkout song (slideStepping.js ~:510).
  const w = d?.walkoutSong
  if (w?.trigger === 'invoke' && w.videoId && !w.invoked) return { label: 'Play walkout song', gate: 'walkout' }
  const steps = revealStepCount(d)
  if (Array.isArray(d?.parts) && steps > 1) {
    const cur = d.currentPart ?? 0
    if (cur < steps - 1) return { label: `Reveal ${cur + 2} of ${steps}`, gate: 'reveal-part' }
  }
  const label = landingLabel(nextSlide)
  return label ? { label, gate: 'advance' } : { label: null, gate: null }
}

// Label only — the laptop's cue text.
export function nextPressCue(p) {
  return nextPressGate(p).label
}
