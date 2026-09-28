import { describe, it, expect } from 'vitest'
import { planHostCommand } from './hostCommands.js'

// Pins LiveMode.jsx's pre-refactor handleKeyDown / handleNextClick /
// handlePrevClick behavior (read line by line before the extraction).
const idle = {
  modalOpen: false, pendingAdvance: false,
  lockPhase: null, lockCountdownRunning: false, scoringBlocked: false,
  audioPending: false, answerReveal: false,
  scoringBusy: false, revealPending: false,
  scoreboardVisible: false, scoresRevealed: false,
}
const plan = (cmd, ctx = {}) => planHostCommand(cmd, { ...idle, ...ctx })

describe('modal guard', () => {
  it('refuses every keyboard command while a modal is open', () => {
    for (const cmd of ['next', 'prev', 'answer', 'scoreboard', 'scores-reveal']) {
      expect(plan({ cmd }, { modalOpen: true })).toEqual({ refuse: 'modal-open' })
    }
  })
  it('buttons never had the modal guard', () => {
    expect(plan({ cmd: 'next', via: 'button' }, { modalOpen: true })).toEqual({ run: 'next' })
    expect(plan({ cmd: 'prev', via: 'button' }, { modalOpen: true })).toEqual({ run: 'prev', cancelPending: false })
  })
})

describe('next (ArrowRight)', () => {
  it('bails while a deferred advance is pending, before anything else', () => {
    expect(plan({ cmd: 'next' }, { pendingAdvance: true, lockPhase: 'order', audioPending: true }))
      .toEqual({ refuse: 'pending-advance' })
  })
  it('starts the lock countdown when a lock phase is open', () => {
    expect(plan({ cmd: 'next' }, { lockPhase: 'order', audioPending: true, answerReveal: true }))
      .toEqual({ run: 'start-lock-countdown', phase: 'order' })
  })
  it('no-ops while the countdown already runs', () => {
    expect(plan({ cmd: 'next' }, { lockPhase: 'order', lockCountdownRunning: true }))
      .toEqual({ refuse: 'locking' })
  })
  it('blocks while scoring is in flight (under the 12s cap)', () => {
    expect(plan({ cmd: 'next' }, { scoringBlocked: true, audioPending: true })).toEqual({ refuse: 'scoring' })
  })
  it('plays pending audio instead of advancing', () => {
    expect(plan({ cmd: 'next' }, { audioPending: true, answerReveal: true })).toEqual({ run: 'play-audio' })
  })
  it('hides a shown answer, then advances (280ms deferral)', () => {
    expect(plan({ cmd: 'next' }, { answerReveal: true })).toEqual({ run: 'hide-answer-then-next' })
  })
  it('plain advance otherwise', () => {
    expect(plan({ cmd: 'next' })).toEqual({ run: 'next' })
  })
})

describe('next (on-screen button)', () => {
  const btn = { cmd: 'next', via: 'button' }
  it('keeps the same pending / lock / scoring / audio order', () => {
    expect(plan(btn, { pendingAdvance: true })).toEqual({ refuse: 'pending-advance' })
    expect(plan(btn, { lockPhase: 'matching' })).toEqual({ run: 'start-lock-countdown', phase: 'matching' })
    expect(plan(btn, { lockPhase: 'matching', lockCountdownRunning: true })).toEqual({ refuse: 'locking' })
    expect(plan(btn, { scoringBlocked: true })).toEqual({ refuse: 'scoring' })
    expect(plan(btn, { audioPending: true })).toEqual({ run: 'play-audio' })
  })
  it('never had the answer-hide dance: advances straight away', () => {
    expect(plan(btn, { answerReveal: true })).toEqual({ run: 'next' })
  })
})

describe('prev', () => {
  it('keyboard cancels a pending deferred advance', () => {
    expect(plan({ cmd: 'prev' }, { pendingAdvance: true })).toEqual({ run: 'prev', cancelPending: true })
  })
  it('button does not', () => {
    expect(plan({ cmd: 'prev', via: 'button' }, { pendingAdvance: true })).toEqual({ run: 'prev', cancelPending: false })
  })
  it('is not gated by scoring', () => {
    expect(plan({ cmd: 'prev' }, { scoringBlocked: true, scoringBusy: true })).toEqual({ run: 'prev', cancelPending: true })
  })
})

describe('answer (KeyA)', () => {
  it('does nothing while scoring is busy (no 12s cap on this path)', () => {
    expect(plan({ cmd: 'answer' }, { scoringBusy: true, revealPending: true })).toEqual({ refuse: 'scoring' })
  })
  it('reveals the slide result when one is owed', () => {
    expect(plan({ cmd: 'answer' }, { revealPending: true, answerReveal: true })).toEqual({ run: 'reveal-slide' })
  })
  it('otherwise toggles the show answer overlay', () => {
    expect(plan({ cmd: 'answer' })).toEqual({ run: 'set-answer-reveal', value: true })
    expect(plan({ cmd: 'answer' }, { answerReveal: true })).toEqual({ run: 'set-answer-reveal', value: false })
  })
})

describe('toggles', () => {
  it('scoreboard (KeyS) toggles, ungated by scoring', () => {
    expect(plan({ cmd: 'scoreboard' }, { scoringBusy: true })).toEqual({ run: 'set-scoreboard-visible', value: true })
    expect(plan({ cmd: 'scoreboard' }, { scoreboardVisible: true })).toEqual({ run: 'set-scoreboard-visible', value: false })
  })
  it('scores-reveal (KeyR) toggles', () => {
    expect(plan({ cmd: 'scores-reveal' })).toEqual({ run: 'set-scores-revealed', value: true })
    expect(plan({ cmd: 'scores-reveal' }, { scoresRevealed: true })).toEqual({ run: 'set-scores-revealed', value: false })
  })
})

it('refuses unknown commands', () => {
  expect(plan({ cmd: 'jump' })).toEqual({ refuse: 'unknown-command' })
})

// iPad remote (spec §5 check order): late -> paused -> busy (next/prev) ->
// modal-open -> slide-changed (next/prev/answer) -> per command.
describe('via remote', () => {
  const NOW = 10_000
  const live = { ...idle, now: NOW, paused: false, remoteBusy: false, slideId: 's1', gate: 'advance', phoneRevealed: false }
  const r = (cmd, args = {}, ctx = {}, env = {}) =>
    planHostCommand({ cmd, via: 'remote', args, expectSlideId: 's1', sentAt: NOW - 10, ...env }, { ...live, ...ctx })

  it('drops a command older than 1500ms on laptop time, or with no sentAt', () => {
    expect(r('next', { expectGate: 'advance' }, {}, { sentAt: NOW - 1501 })).toEqual({ refuse: 'late' })
    expect(r('next', { expectGate: 'advance' }, {}, { sentAt: null })).toEqual({ refuse: 'late' })
    expect(r('next', { expectGate: 'advance' }, {}, { sentAt: NOW - 1500 })).toEqual({ run: 'next' })
  })
  it('late beats paused beats busy beats modal', () => {
    expect(r('next', {}, { paused: true, remoteBusy: true, modalOpen: true }, { sentAt: 0 })).toEqual({ refuse: 'late' })
    expect(r('next', {}, { paused: true, remoteBusy: true, modalOpen: true })).toEqual({ refuse: 'paused' })
    expect(r('next', {}, { remoteBusy: true, modalOpen: true })).toEqual({ refuse: 'busy' })
    expect(r('next', {}, { modalOpen: true })).toEqual({ refuse: 'modal-open' })
  })
  it('paused refuses every command, toggles too', () => {
    expect(r('scoreboard', { value: true }, { paused: true })).toEqual({ refuse: 'paused' })
  })
  it('busy is checked BEFORE the lock phase (handleLockWagers phantom countdown)', () => {
    // Tiers just written optimistically: pendingLockPhase already says
    // wager-guesses while wagerBusy is still true.
    const ctx = { remoteBusy: true, lockPhase: 'wager-guesses', gate: 'scoring' }
    expect(r('next', { expectGate: 'lock' }, ctx)).toEqual({ refuse: 'busy' })
    // The keyboard still starts a countdown there: pre-existing, left alone.
    expect(planHostCommand({ cmd: 'next' }, { ...idle, lockPhase: 'wager-guesses', scoringBlocked: true }))
      .toEqual({ run: 'start-lock-countdown', phase: 'wager-guesses' })
  })
  it('duplicate tap during the countdown is refused as busy, not a second countdown', () => {
    expect(r('next', { expectGate: 'lock' }, { remoteBusy: true, lockPhase: 'order', lockCountdownRunning: true, gate: 'locking' }))
      .toEqual({ refuse: 'busy' })
  })
  it('busy does not gate toggles', () => {
    expect(r('scoreboard', { value: true }, { remoteBusy: true })).toEqual({ run: 'set-scoreboard-visible', value: true })
  })
  it('slide-changed for next, prev and answer only', () => {
    for (const cmd of ['next', 'prev', 'answer']) {
      expect(r(cmd, { expectGate: 'advance', value: true }, {}, { expectSlideId: 'old' })).toEqual({ refuse: 'slide-changed' })
    }
    expect(r('scoreboard', { value: true }, {}, { expectSlideId: 'old' })).toEqual({ run: 'set-scoreboard-visible', value: true })
  })
  it('gate-changed when the gate moved, on reveal-owed and on null', () => {
    expect(r('next', { expectGate: 'audio' }, { gate: 'advance' })).toEqual({ refuse: 'gate-changed' })
    expect(r('next', { expectGate: 'reveal-owed' }, { gate: 'reveal-owed' })).toEqual({ refuse: 'gate-changed' })
    expect(r('next', { expectGate: null }, { gate: null })).toEqual({ refuse: 'gate-changed' })
  })
  it('pending-advance comes before the gate check', () => {
    expect(r('next', { expectGate: 'x' }, { pendingAdvance: true })).toEqual({ refuse: 'pending-advance' })
  })
  it('a matching gate runs the keyboard path, answer-hide dance included', () => {
    expect(r('next', { expectGate: 'lock' }, { gate: 'lock', lockPhase: 'order' })).toEqual({ run: 'start-lock-countdown', phase: 'order' })
    expect(r('next', { expectGate: 'audio' }, { gate: 'audio', audioPending: true })).toEqual({ run: 'play-audio' })
    expect(r('next', { expectGate: 'advance' }, { answerReveal: true })).toEqual({ run: 'hide-answer-then-next' })
  })
  it('prev cancels a pending advance like ArrowLeft', () => {
    expect(r('prev')).toEqual({ run: 'prev', cancelPending: true })
  })
  it('answer is end-state: reveal first, no-op if already revealed, then set', () => {
    expect(r('answer', { value: true }, { revealPending: true })).toEqual({ run: 'reveal-slide' })
    expect(r('answer', { value: true }, { phoneRevealed: true })).toEqual({ run: 'noop' })
    expect(r('answer', { value: true })).toEqual({ run: 'set-answer-reveal', value: true })
    expect(r('answer', { value: true }, { answerReveal: true })).toEqual({ run: 'noop' })
    expect(r('answer', { value: false }, { answerReveal: true })).toEqual({ run: 'set-answer-reveal', value: false })
    expect(r('answer', { value: true }, { scoringBusy: true })).toEqual({ refuse: 'scoring' })
  })
  it('scoreboard / scores-reveal are end-state, no-op when they already match', () => {
    expect(r('scoreboard', { value: true }, { scoreboardVisible: true })).toEqual({ run: 'noop' })
    expect(r('scores-reveal', { value: true })).toEqual({ run: 'set-scores-revealed', value: true })
    expect(r('scores-reveal', { value: false })).toEqual({ run: 'noop' })
  })
  it('keyboard A/S/R stay toggles', () => {
    expect(plan({ cmd: 'scoreboard' }, { scoreboardVisible: true })).toEqual({ run: 'set-scoreboard-visible', value: false })
    expect(plan({ cmd: 'answer' }, { answerReveal: true })).toEqual({ run: 'set-answer-reveal', value: false })
  })
  it('unknown commands', () => {
    expect(r('teleport', { index: 3 })).toEqual({ refuse: 'unknown-command' })
  })
})

// Phase 2a: jump, unlock, rescore. Same spine: late -> paused -> busy ->
// modal-open -> slide-changed -> per command.
describe('via remote: jump / unlock / rescore', () => {
  const NOW = 10_000
  const fixOk = { canUnlock: true, unlockRefusal: null, canRescore: true, rescoreRefusal: null }
  const live = {
    ...idle, now: NOW, paused: false, remoteBusy: false, slideId: 's1', gate: 'advance', phoneRevealed: false,
    index: 0, slideIds: ['s1', 's2', 's3', 's4'], fix: fixOk,
  }
  const r = (cmd, args = {}, ctx = {}, env = {}) =>
    planHostCommand({ cmd, via: 'remote', args, expectSlideId: 's1', sentAt: NOW - 10, ...env }, { ...live, ...ctx })

  for (const cmd of ['jump', 'unlock', 'rescore']) {
    it(`${cmd}: late, paused, busy, modal-open, slide-changed, in that order`, () => {
      const all = { paused: true, remoteBusy: true, modalOpen: true }
      const args = { slideId: 's3' }
      expect(r(cmd, args, all, { sentAt: 0 })).toEqual({ refuse: 'late' })
      expect(r(cmd, args, all)).toEqual({ refuse: 'paused' })
      expect(r(cmd, args, { remoteBusy: true, modalOpen: true })).toEqual({ refuse: 'busy' })
      expect(r(cmd, args, { modalOpen: true }, { expectSlideId: 'old' })).toEqual({ refuse: 'modal-open' })
      expect(r(cmd, args, {}, { expectSlideId: 'old' })).toEqual({ refuse: 'slide-changed' })
    })
    it(`${cmd} is remote-only: the keyboard and buttons never send it`, () => {
      expect(plan({ cmd, args: { slideId: 's3' } }, live)).toEqual({ refuse: 'unknown-command' })
      expect(plan({ cmd, via: 'button', args: { slideId: 's3' } }, live)).toEqual({ refuse: 'unknown-command' })
    })
  }

  it('jump by slide id wins over a stale index (slides reordered since the list was sent)', () => {
    expect(r('jump', { slideId: 's3', index: 1 })).toEqual({ run: 'jump', index: 2 })
  })
  it('jump by index when no slide id is sent', () => {
    expect(r('jump', { index: 3 })).toEqual({ run: 'jump', index: 3 })
  })
  it('jump to a slide that is gone, or a bad index, is refused as bad-target', () => {
    expect(r('jump', { slideId: 'nope' })).toEqual({ refuse: 'bad-target' })
    expect(r('jump', { index: 9 })).toEqual({ refuse: 'bad-target' })
    expect(r('jump', { index: -1 })).toEqual({ refuse: 'bad-target' })
    expect(r('jump', { index: 1.5 })).toEqual({ refuse: 'bad-target' })
    expect(r('jump', {})).toEqual({ refuse: 'bad-target' })
  })
  it('jump to the slide already showing is a no-op, not a re-entry', () => {
    expect(r('jump', { slideId: 's1' })).toEqual({ run: 'noop' })
  })
  it('jump is refused while the 280ms deferred advance is pending (it holds the old show)', () => {
    expect(r('jump', { slideId: 's3' }, { pendingAdvance: true })).toEqual({ refuse: 'pending-advance' })
  })
  it('busy covers jumpBusy, scoring, race, PYL, countdown and the phase-3 queue: all arrive as remoteBusy', () => {
    expect(r('jump', { slideId: 's3' }, { remoteBusy: true })).toEqual({ refuse: 'busy' })
  })

  it('unlock runs when the fix state allows it, else refuses with its reason', () => {
    expect(r('unlock')).toEqual({ run: 'unlock' })
    expect(r('unlock', {}, { fix: { ...fixOk, canUnlock: false, unlockRefusal: 'nothing-locked' } })).toEqual({ refuse: 'nothing-locked' })
    expect(r('unlock', {}, { fix: { ...fixOk, canUnlock: false, unlockRefusal: 'scoring' } })).toEqual({ refuse: 'scoring' })
  })
  it('rescore runs when the fix state allows it, else refuses with its reason', () => {
    expect(r('rescore')).toEqual({ run: 'rescore' })
    for (const reason of ['not-locked', 'already-revealed', 'laptop-only', 'scoring', 'locking', 'nothing-to-fix']) {
      expect(r('rescore', {}, { fix: { ...fixOk, canRescore: false, rescoreRefusal: reason } })).toEqual({ refuse: reason })
    }
  })
  it('no fix state at all refuses rather than running', () => {
    expect(r('rescore', {}, { fix: undefined })).toEqual({ refuse: 'nothing-to-fix' })
    expect(r('unlock', {}, { fix: undefined })).toEqual({ refuse: 'nothing-to-fix' })
  })
})
