// What a host command should do, as a pure function of Live Mode's state.
// LiveMode.jsx's runHostCommand builds `ctx`, calls this, and performs the
// returned step — so the keyboard, the on-screen buttons and the iPad remote
// all share one decision (iPad remote spec §5).
//
// cmd: { cmd: 'next'|'prev'|'answer'|'scoreboard'|'scores-reveal'|'jump'|'unlock'|'rescore'
//        |'scores.get'|'score.set'|'scores.hide', via?, args?, expectSlideId?, sentAt? }
// jump/unlock/rescore are remote-only (phase 2a): the keyboard and buttons
// never send them, so for those they stay unknown-command.
// via: 'button' reproduces the on-screen Next/Prev buttons, which never had the
// modal guard, the answer-hide dance, or Prev's cancel-pending-advance.
// via: 'remote' is the iPad: the keyboard's checks plus the remote-only ones,
// in the spec §5 order (late, paused, busy, modal, slide-changed, per command),
// and end-state `{value}` toggles. The keyboard's A/S/R stay toggles.
//
// Returns { run: step, ... } or { refuse: reason }. run 'noop' = received,
// nothing to do (an end-state command that already matches).
import { COMMAND_TTL_MS } from './remoteProtocol.js'
import { validScoreValue } from './scoreCellWrite.js'

// Commands whose meaning depends on which slide the sender was looking at.
const SLIDE_BOUND = new Set(['next', 'prev', 'answer', 'jump', 'unlock', 'rescore'])
// Commands the remote busy gate refuses (spec §6: jump/unlock/rescore carry
// "expectSlideId + busy gate").
// Phase 3 adds the Scores drawer's scores.get / score.set (not slide-bound: a
// dispute fix is about a team, not the slide on screen).
const BUSY_GATED = new Set(['next', 'prev', 'jump', 'unlock', 'rescore', 'scores.get', 'score.set'])
const REMOTE_ONLY = new Set(['jump', 'unlock', 'rescore', 'scores.get', 'score.set', 'scores.hide'])

// args.slideId wins over args.index: the iPad's list may be a snapshot old,
// and an id still names the slide Ben tapped if slides moved since.
function jumpTarget(args, ctx) {
  const ids = ctx.slideIds ?? []
  if (typeof args.slideId === 'string') {
    const i = ids.indexOf(args.slideId)
    return i === -1 ? null : i
  }
  return Number.isInteger(args.index) && args.index >= 0 && args.index < ids.length ? args.index : null
}
const setTo = (run, value, current) => (value === current ? { run: 'noop' } : { run, value })

export function planHostCommand({ cmd, via, args = {}, expectSlideId = null, sentAt = null }, ctx) {
  const button = via === 'button'
  const remote = via === 'remote'
  // Only stops the laptop attaching scores to its snapshot: never refused.
  if (remote && cmd === 'scores.hide') return { run: 'scores-hide' }
  if (remote) {
    if (typeof sentAt !== 'number' || ctx.now - sentAt > COMMAND_TTL_MS) return { refuse: 'late' }
    if (ctx.paused) return { refuse: 'paused' }
    // Must come before the lock-phase check: updateSlide is optimistic, so
    // the instant handleLockWagers writes wagerTiersLocked, lockPhase reads
    // 'wager-guesses' while wagerBusy is still true — a second Next there
    // would start a phantom countdown the handler's final write then wipes.
    if (BUSY_GATED.has(cmd) && ctx.remoteBusy) return { refuse: 'busy' }
  }
  if (!button && ctx.modalOpen) return { refuse: 'modal-open' }
  if (remote && SLIDE_BOUND.has(cmd) && expectSlideId !== ctx.slideId) return { refuse: 'slide-changed' }
  if (!remote && REMOTE_ONLY.has(cmd)) return { refuse: 'unknown-command' }
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
    case 'jump': {
      // The 280ms deferred nextSlide holds the old show and would overwrite the jump.
      if (ctx.pendingAdvance) return { refuse: 'pending-advance' }
      const index = jumpTarget(args, ctx)
      if (index == null) return { refuse: 'bad-target' }
      if (index === ctx.index) return { run: 'noop' }
      return { run: 'jump', index }
    }
    // ctx.fix is fixFor(currentSlide, ...) (lib/remoteFix.js).
    case 'unlock':
      return ctx.fix?.canUnlock ? { run: 'unlock' } : { refuse: ctx.fix?.unlockRefusal ?? 'nothing-to-fix' }
    case 'rescore':
      return ctx.fix?.canRescore ? { run: 'rescore' } : { refuse: ctx.fix?.rescoreRefusal ?? 'nothing-to-fix' }
    // Phase 3 (reduced): read the scoreboard, or fix one cell. Conservative:
    // the laptop score table closed under 1s ago (its last typed save may
    // still be landing), any scoring at all (uncapped, unlike Next's 12s cap),
    // a jump, or (score.set) anything already on the score chain refuses. A
    // countdown is in remoteBusy, so it is refused above as busy.
    case 'scores.get':
    case 'score.set': {
      if (ctx.modalJustClosed) return { refuse: 'modal-just-closed' }
      if (ctx.anyScoring) return { refuse: 'scoring' }
      if (ctx.jumpBusy) return { refuse: 'busy' }
      if (cmd === 'scores.get') return { run: 'scores-get' }
      // Reachable once the chain has been busy past remoteBusy's 12s cap.
      if (ctx.scoreQueueDepth > 0) return { refuse: 'saving-scores' }
      const { teamId, colKey, value, expectOld } = args
      if (typeof teamId !== 'string' || !teamId || teamId.length > 64) return { refuse: 'no-team' }
      if (!(ctx.scoreCols ?? []).some(c => c.key === colKey)) return { refuse: 'bad-column' }
      if (!validScoreValue(value) || typeof expectOld !== 'number' || !Number.isFinite(expectOld)) return { refuse: 'bad-score' }
      return { run: 'score-set', teamId, colKey, value, expectOld }
    }
    default:
      return { refuse: 'unknown-command' }
  }
}
