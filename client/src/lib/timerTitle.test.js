// Timer label ("Answers due" / "Break"): math, planning and refusal text.
import { describe, it, expect } from 'vitest'
import { planHostCommand } from './hostCommands.js'
import { applyTimerStep, startTimer, pauseTimer, resumeTimer, addTime, timerView } from './showTimer.js'
import { REFUSAL_TEXT } from './remoteProtocol.js'

describe('timer title (the label above the clock)', () => {
  const t = startTimer(60000, 1000, 'Answers due')
  it('startTimer stores a valid title and drops anything else', () => {
    expect(t.title).toBe('Answers due')
    expect(startTimer(60000, 0, 'Break').title).toBe('Break')
    for (const bad of [undefined, null, '', 'answers due', 'Lunch', 5, {}, ['Break']]) {
      expect('title' in startTimer(60000, 0, bad), String(bad)).toBe(false)
    }
  })
  it('pause, resume and add keep it; add on a finished timer restarts with it', () => {
    const p = pauseTimer(t, 5000)
    expect(p.title).toBe('Answers due')
    expect(resumeTimer(p, 6000).title).toBe('Answers due')
    expect(addTime(t, 30000, 5000).title).toBe('Answers due')
    expect(addTime(p, 30000, 6000).title).toBe('Answers due')
    expect(addTime(t, 30000, 999999).title).toBe('Answers due')
  })
  it('timerView passes it through in every phase; garbage reads as no label', () => {
    expect(timerView(t, 2000).title).toBe('Answers due')
    expect(timerView(t, 55000).title).toBe('Answers due') // urgent
    expect(timerView(pauseTimer(t, 5000), 9000).title).toBe('Answers due')
    expect(timerView(t, 62000).title).toBe('Answers due') // done
    expect(timerView({ ...t, title: 'Hacked' }, 2000).title).toBeUndefined()
    expect(timerView({ ...t, title: { x: 1 } }, 2000).phase).toBe('running')
  })
  it('applyTimerStep hands the title to startTimer', () => {
    expect(applyTimerStep({ run: 'timer-start', ms: 30000, title: 'Break' }, null, 0).title).toBe('Break')
    expect('title' in applyTimerStep({ run: 'timer-start', ms: 30000 }, null, 0)).toBe(false)
  })
})

describe('timer.start title (iPad)', () => {
  const idle = {
    modalOpen: false, pendingAdvance: false, lockPhase: null, lockCountdownRunning: false, scoringBlocked: false,
    audioPending: false, answerReveal: false, scoringBusy: false, revealPending: false, scoreboardVisible: false, scoresRevealed: false,
  }
  const run = (args, timer = null) => planHostCommand({ cmd: 'timer.start', via: 'remote', sentAt: 1_000_000, args }, { ...idle, now: 1_000_000, paused: false, remoteBusy: false, slideId: 's1', timer })
  it('passes a valid title through; absent or null means none (legacy clients)', () => {
    expect(run({ seconds: 60, title: 'Answers due' })).toEqual({ run: 'timer-start', ms: 60000, title: 'Answers due' })
    expect(run({ seconds: 60, title: 'Break' }).title).toBe('Break')
    expect(run({ seconds: 60 }).title).toBeUndefined()
    expect(run({ seconds: 60, title: null }).title).toBeUndefined()
    expect(run({ minutes: 2 })).toMatchObject({ run: 'timer-start', ms: 120000 })
  })
  it('refuses bad titles with bad-title: numbers, other strings, objects, long strings', () => {
    for (const title of [5, 0, '', 'answers due', 'Lunch', {}, ['Break'], true, 'x'.repeat(5000)]) {
      expect(run({ seconds: 60, title }), JSON.stringify(title)?.slice(0, 20)).toEqual({ refuse: 'bad-title' })
    }
  })
  it('bad-title text is plain English with no dash of any kind', () => {
    expect(REFUSAL_TEXT['bad-title']).toBeTruthy()
    expect(REFUSAL_TEXT['bad-title']).not.toMatch(/[-—–]/)
  })
  it('the title survives Replace and reaches the stored timer', () => {
    const live = { id: 't1', state: 'running', totalMs: 300000, endsAt: 1_120_000, remainingMs: 300000, sentAt: 999000 }
    const step = run({ seconds: 90, replace: true, title: 'Break' }, live)
    expect(applyTimerStep(step, live, 1_000_000).title).toBe('Break')
  })
})
