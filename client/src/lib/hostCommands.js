// What a host command should do, as a pure function of Live Mode's state.
// LiveMode.jsx's runHostCommand builds `ctx`, calls this, and performs the
// returned step — so the keyboard, the on-screen buttons and the iPad remote
// all share one decision (iPad remote spec §5).
//
// cmd: { cmd: 'next'|'prev'|'answer'|'scoreboard'|'scores-reveal', via?, args?, expectSlideId?, sentAt? }
// via: 'button' reproduces the on-screen Next/Prev buttons, which never had the
// modal guard, the answer-hide dance, or Prev's cancel-pending-advance.
// via: 'remote' is the iPad: the keyboard's checks plus the remote-only ones,
// in the spec §5 order (late, paused, busy, modal, slide-changed, per command),
// and end-state `{value}` toggles. The keyboard's A/S/R stay toggles.
//
// Returns { run: step, ... } or { refuse: reason }. run 'noop' = received,
// nothing to do (an end-state command that already matches).
import { COMMAND_TTL_MS } from './remoteProtocol.js'

// Commands whose meaning depends on which slide the sender was looking at.
const SLIDE_BOUND = new Set(['next', 'prev', 'answer'])
const setTo = (run, value, current) => (value === current ? { run: 'noop' } : { run, value })

export function planHostCommand({ cmd, via, args = {}, expectSlideId = null, sentAt = null }, ctx) {
  const button = via === 'button'
  const remote = via === 'remote'
  if (remote) {
    if (typeof sentAt !== 'number' || ctx.now - sentAt > COMMAND_TTL_MS) return { refuse: 'late' }
    if (ctx.paused) return { refuse: 'paused' }
    // Must come before the lock-phase check: updateSlide is optimistic, so
    // the instant handleLockWagers writes wagerTiersLocked, lockPhase reads
    // 'wager-guesses' while wagerBusy is still true — a second Next there
    // would start a phantom countdown the handler's final write then wipes.
    if ((cmd === 'next' || cmd === 'prev') && ctx.remoteBusy) return { refuse: 'busy' }
  }
  if (!button && ctx.modalOpen) return { refuse: 'modal-open' }
  if (remote && SLIDE_BOUND.has(cmd) && expectSlideId !== ctx.slideId) return { refuse: 'slide-changed' }
  switch (cmd) {
    case 'next':
      if (ctx.pendingAdvance) return { refuse: 'pending-advance' }
      // expectGate is the gate the iPad showed (nextPressGate). reveal-owed:
      // the keyboard advances there (pre-existing), the remote refuses and
      // lights Answer instead.
      if (remote && (ctx.gate == null || ctx.gate === 'reveal-owed' || args.expectGate !== ctx.gate)) {
        return { refuse: 'gate-changed' }
      }
      if (ctx.lockPhase) {
        if (ctx.lockCountdownRunning) return { refuse: 'locking' }
        // The lock would be refused by its preCheck WITHOUT closing the phase, so a
        // countdown would just replay on every Next. Say why instead.
        if (ctx.lockBlocked) return { refuse: 'lock-blocked', message: ctx.lockBlocked }
        return { run: 'start-lock-countdown', phase: ctx.lockPhase }
      }
      if (ctx.scoringBlocked) return { refuse: 'scoring' }
      if (ctx.audioPending) return { run: 'play-audio' }
      if (!button && ctx.answerReveal) return { run: 'hide-answer-then-next' }
      return { run: 'next' }
    case 'prev':
      return { run: 'prev', cancelPending: !button }
    case 'answer': {
      if (ctx.scoringBusy) return { refuse: 'scoring' }
      if (!remote) {
        if (ctx.revealPending) return { run: 'reveal-slide' }
        return { run: 'set-answer-reveal', value: !ctx.answerReveal }
      }
      const value = args.value === true
      if (value && ctx.revealPending) return { run: 'reveal-slide' }
      if (value && ctx.phoneRevealed) return { run: 'noop' }
      return setTo('set-answer-reveal', value, ctx.answerReveal)
    }
    case 'scoreboard':
      return remote
        ? setTo('set-scoreboard-visible', args.value === true, ctx.scoreboardVisible)
        : { run: 'set-scoreboard-visible', value: !ctx.scoreboardVisible }
    case 'scores-reveal':
      return remote
        ? setTo('set-scores-revealed', args.value === true, ctx.scoresRevealed)
        : { run: 'set-scores-revealed', value: !ctx.scoresRevealed }
    default:
      return { refuse: 'unknown-command' }
  }
}
