// iPad timer: protocol, planning and applying (feat/ipad-timer).
import { describe, it, expect } from 'vitest'
import { planHostCommand } from './hostCommands.js'
import { applyTimerStep, startTimer, pauseTimer, resumeTimer, addTime, parseDuration } from './showTimer.js'
import { REFUSAL_TEXT, TIMER_PRESETS_SECONDS, TIMER_MIN_SECONDS, TIMER_MAX_SECONDS, TIMER_STEP_SECONDS, parseRemoteMessage } from './remoteProtocol.js'

const idle = {
  modalOpen: false, pendingAdvance: false,
  lockPhase: null, lockCountdownRunning: false, scoringBlocked: false,
  audioPending: false, answerReveal: false,
  scoringBusy: false, revealPending: false,
  scoreboardVisible: false, scoresRevealed: false,
}

describe('timer commands (remote only)', () => {
  const NOW = 1_000_000
  const ctx = (extra = {}) => ({ now: NOW, paused: false, remoteBusy: false, slideId: 's1', timer: null, ...extra })
  const run = (cmd, args, c) => planHostCommand({ cmd, via: 'remote', sentAt: NOW, args }, { ...idle, ...ctx(c) })
  const running = { id: 't1', state: 'running', totalMs: 300000, endsAt: NOW + 120000, remainingMs: 300000, sentAt: NOW - 1000 }
  const paused = { ...running, state: 'paused', remainingMs: 90000 }
  const finished = { ...running, endsAt: NOW - 1000 }

  it('keyboard and buttons never send timer commands', () => {
    expect(planHostCommand({ cmd: 'timer.start', args: { seconds: 300 } }, { ...idle, ...ctx() })).toEqual({ refuse: 'unknown-command' })
    expect(planHostCommand({ cmd: 'timer.start', via: 'button' }, { ...idle, ...ctx() })).toEqual({ refuse: 'unknown-command' })
  })
  it('start: seconds in 30 steps become ms', () => {
    expect(run('timer.start', { seconds: 30 })).toEqual({ run: 'timer-start', ms: 30000 })
    expect(run('timer.start', { seconds: 90 })).toEqual({ run: 'timer-start', ms: 90000 })
    expect(run('timer.start', { seconds: 300 })).toEqual({ run: 'timer-start', ms: 300000 })
    expect(run('timer.start', { seconds: 10800 })).toEqual({ run: 'timer-start', ms: 10_800_000 })
  })
  it('start refuses every seconds value that is not a whole multiple of 30 in range', () => {
    for (const seconds of [0, -30, 15, 45, 30.5, 10830, 10801, 1e9, NaN, Infinity, -Infinity, '30', '', null, true, [30], { a: 1 }, 1e21]) {
      expect(run('timer.start', { seconds }), String(seconds)).toEqual({ refuse: 'bad-minutes' })
    }
    expect(run('timer.start', {})).toEqual({ refuse: 'bad-minutes' })
  })
  it('legacy { minutes } from a cached iPad page still works, whole minutes 1 to 180 only', () => {
    expect(run('timer.start', { minutes: 5 })).toEqual({ run: 'timer-start', ms: 300000 })
    expect(run('timer.start', { minutes: 180 })).toEqual({ run: 'timer-start', ms: 10_800_000 })
    for (const minutes of [0, -1, 181, 1.5, 0.5, NaN, Infinity, '5', null, true, [5]]) {
      expect(run('timer.start', { minutes }), String(minutes)).toEqual({ refuse: 'bad-minutes' })
    }
  })
  it('seconds wins over minutes, and a bad seconds is never rescued by a good minutes', () => {
    expect(run('timer.start', { seconds: 60, minutes: 5 })).toEqual({ run: 'timer-start', ms: 60000 })
    expect(run('timer.start', { seconds: 45, minutes: 5 })).toEqual({ refuse: 'bad-minutes' })
  })
  it('a Start over a live timer needs explicit replace:true', () => {
    expect(run('timer.start', { seconds: 300 }, { timer: running })).toEqual({ refuse: 'timer-running' })
    expect(run('timer.start', { seconds: 300 }, { timer: paused })).toEqual({ refuse: 'timer-running' })
    expect(run('timer.start', { seconds: 300, replace: 'yes' }, { timer: running })).toEqual({ refuse: 'timer-running' })
    expect(run('timer.start', { seconds: 300, replace: true }, { timer: running })).toEqual({ run: 'timer-start', ms: 300000 })
  })
  it('a finished timer can be started over without replace (same as the laptop)', () => {
    expect(run('timer.start', { seconds: 120 }, { timer: finished })).toEqual({ run: 'timer-start', ms: 120000 })
  })
  it('pause and resume are end-state and need the timer id the iPad saw', () => {
    expect(run('timer.pause', { timerId: 't1' }, { timer: running })).toEqual({ run: 'timer-pause' })
    expect(run('timer.pause', { timerId: 't1' }, { timer: paused })).toEqual({ run: 'noop' })
    expect(run('timer.resume', { timerId: 't1' }, { timer: paused })).toEqual({ run: 'timer-resume' })
    expect(run('timer.resume', { timerId: 't1' }, { timer: running })).toEqual({ run: 'noop' })
    expect(run('timer.pause', { timerId: 'old' }, { timer: running })).toEqual({ refuse: 'timer-changed' })
    expect(run('timer.pause', {}, { timer: running })).toEqual({ refuse: 'timer-changed' })
    expect(run('timer.pause', { timerId: 't1' }, { timer: finished })).toEqual({ refuse: 'no-timer' })
    expect(run('timer.resume', { timerId: 't1' }, { timer: finished })).toEqual({ refuse: 'no-timer' })
  })
  it('add: 30 or 60 seconds, default 60 for old pages; anything else refuses', () => {
    for (const timer of [running, paused, finished]) {
      expect(run('timer.add', { timerId: 't1' }, { timer })).toEqual({ run: 'timer-add', ms: 60000 })
      expect(run('timer.add', { timerId: 't1', seconds: 60 }, { timer })).toEqual({ run: 'timer-add', ms: 60000 })
      expect(run('timer.add', { timerId: 't1', seconds: 30 }, { timer })).toEqual({ run: 'timer-add', ms: 30000 })
    }
    for (const seconds of [0, 45, 90, -30, 30.5, NaN, '30', null, 1e9]) {
      expect(run('timer.add', { timerId: 't1', seconds }, { timer: running }), String(seconds)).toEqual({ refuse: 'bad-add' })
    }
    expect(run('timer.add', { timerId: 't1' })).toEqual({ refuse: 'no-timer' })
    expect(run('timer.add', { timerId: 'x' }, { timer: running })).toEqual({ refuse: 'timer-changed' })
  })
  it('cancel clears; with no timer it is already done', () => {
    expect(run('timer.cancel', { timerId: 't1' }, { timer: running })).toEqual({ run: 'timer-cancel' })
    expect(run('timer.cancel', { timerId: 't1' }, { timer: finished })).toEqual({ run: 'timer-cancel' })
    expect(run('timer.cancel', { timerId: 't1' })).toEqual({ run: 'noop' })
    expect(run('timer.cancel', { timerId: 'x' }, { timer: running })).toEqual({ refuse: 'timer-changed' })
  })
  it('the usual remote rails: late and paused refuse; busy and a laptop modal do not', () => {
    expect(planHostCommand({ cmd: 'timer.start', via: 'remote', sentAt: NOW - 5000, args: { seconds: 300 } }, { ...idle, ...ctx() })).toEqual({ refuse: 'late' })
    expect(planHostCommand({ cmd: 'timer.start', via: 'remote', args: { seconds: 300 } }, { ...idle, ...ctx() })).toEqual({ refuse: 'late' })
    expect(run('timer.start', { seconds: 300 }, { paused: true })).toEqual({ refuse: 'paused' })
    expect(run('timer.start', { seconds: 300 }, { remoteBusy: true, modalOpen: true })).toEqual({ run: 'timer-start', ms: 300000 })
  })
  it('other commands still refuse a modal and ignore ctx.timer', () => {
    expect(planHostCommand({ cmd: 'answer', via: 'remote', sentAt: NOW, expectSlideId: 's1', args: { value: true } }, { ...idle, ...ctx({ modalOpen: true, timer: running }) })).toEqual({ refuse: 'modal-open' })
  })
})

describe('applyTimerStep', () => {
  it('maps each planned step onto the existing timer math', () => {
    const t = startTimer(300000, 1000)
    expect(applyTimerStep({ run: 'timer-start', ms: 120000 }, null, 5000)).toMatchObject({ state: 'running', totalMs: 120000, endsAt: 125000 })
    expect(applyTimerStep({ run: 'timer-pause' }, t, 2000)).toEqual(pauseTimer(t, 2000))
    const p = pauseTimer(t, 2000)
    expect(applyTimerStep({ run: 'timer-resume' }, p, 3000)).toEqual(resumeTimer(p, 3000))
    expect(applyTimerStep({ run: 'timer-add', ms: 60000 }, t, 2000)).toEqual(addTime(t, 60000, 2000))
    expect(applyTimerStep({ run: 'timer-cancel' }, t, 2000)).toBeNull()
  })
})

const run0 = args => planHostCommand({ cmd: 'timer.start', via: 'remote', sentAt: 1, args }, { ...idle, now: 1, paused: false, remoteBusy: false, slideId: 's1', timer: null })

describe('timer protocol', () => {
  it('refusal texts exist and carry no dash; presets are valid steps; the relay parser passes timer commands', () => {
    for (const r of ['timer-running', 'timer-changed', 'no-timer', 'bad-minutes', 'bad-add']) {
      expect(REFUSAL_TEXT[r], r).toBeTruthy()
      expect(REFUSAL_TEXT[r]).not.toMatch(/[\u2014\u2013-]/)
    }
    expect(REFUSAL_TEXT['bad-minutes']).toContain('30 second')
    for (const n of [...TIMER_PRESETS_SECONDS, TIMER_MIN_SECONDS, TIMER_MAX_SECONDS]) {
      expect(n % TIMER_STEP_SECONDS, String(n)).toBe(0)
      expect(parseDuration(`${n}s`), String(n)).toBe(n * 1000)
      expect(run0({ seconds: n }), String(n)).toEqual({ run: 'timer-start', ms: n * 1000 })
    }
    expect(TIMER_PRESETS_SECONDS).toEqual([30, 60, 120, 180, 300, 600])
    const raw = JSON.stringify({ type: 'cmd', id: 'a-1', cmd: 'timer.start', args: { seconds: 90, replace: true }, sentAt: 5 })
    expect(parseRemoteMessage(raw)).toMatchObject({ cmd: 'timer.start', args: { seconds: 90, replace: true } })
  })
})
