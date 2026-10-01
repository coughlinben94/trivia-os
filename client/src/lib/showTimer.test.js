import { describe, it, expect } from 'vitest'
import {
  parseMinutes, parseDuration, startTimer, pauseTimer, resumeTimer, addTime, timerView, shouldChime,
  calibrateOffset, clockLabel, MAX_MS,
  TIMES_UP,
} from './showTimer.js'

describe('parseMinutes / parseDuration', () => {
  it('reads whole and decimal minutes', () => {
    expect(parseMinutes('5')).toBe(300000)
    expect(parseMinutes('1.5')).toBe(90000)
    expect(parseMinutes(' .5 ')).toBe(30000)
    expect(parseMinutes('1,5')).toBe(90000)
    expect(parseMinutes).toBe(parseDuration)
  })
  it('reads m:ss', () => {
    expect(parseDuration('1:30')).toBe(90000)
    expect(parseDuration('0:30')).toBe(30000)
    expect(parseDuration(' 10:00 ')).toBe(600000)
    expect(parseDuration('180:00')).toBe(MAX_MS)
    expect(parseDuration('0:03')).toBe(3000)
  })
  it('reads seconds with s, sec, secs, second, seconds', () => {
    expect(parseDuration('90s')).toBe(90000)
    expect(parseDuration('30 sec')).toBe(30000)
    expect(parseDuration('45 seconds')).toBe(45000)
    expect(parseDuration('1 second')).toBeNull() // under the 3 s minimum
    expect(parseDuration('3S')).toBe(3000)
    expect(parseDuration('10800s')).toBe(MAX_MS)
  })
  it('rejects junk, zero, negatives, too small, too big and bad seconds', () => {
    for (const bad of ['', '  ', 'abc', '0', '-2', '1e3', '0.01', '181', '1.2.3', null, undefined,
      '1:75', '1:60', '1:5', ':30', '1:', '1:30:00', '0:00', '0:02', '180:01', '0s', '2s', '10801s', '-30s', '1.5s', 's', '30 secz', '30 min', '1:30s']) {
      expect(parseDuration(bad), String(bad)).toBeNull()
    }
    expect(parseDuration('180')).toBe(MAX_MS)
  })
})

describe('TIMES_UP', () => {
  it('is one wording, used on the TV, the laptop and the iPad', () => {
    expect(TIMES_UP).toBe('Time’s up!')
  })
})

describe('timerView, damaged rows', () => {
  it('a timer with missing or non-numeric times is treated as no timer (never "Time\u2019s up" forever)', () => {
    for (const bad of [{ id: 'x', state: 'running' }, { id: 'x', state: 'running', endsAt: 'soon' }, { id: 'x', state: 'paused' }, { id: 'x', state: 'running', endsAt: NaN }]) {
      expect(timerView(bad, 1_000_000, 0).phase, JSON.stringify(bad)).toBe('idle')
    }
  })
})

describe('timerView', () => {
  const t = startTimer(60000, 1000)
  it('counts down and goes urgent in the last 10 seconds', () => {
    expect(timerView(t, 1000)).toMatchObject({ phase: 'running', label: '1:00' })
    expect(timerView(t, 50999)).toMatchObject({ phase: 'running', label: '0:11' })
    expect(timerView(t, 51000)).toMatchObject({ phase: 'urgent', label: '0:10' })
    expect(timerView(t, 60500)).toMatchObject({ phase: 'urgent', label: '0:01' })
  })
  it('is done at zero, then idle after 8 seconds', () => {
    expect(timerView(t, 61000)).toMatchObject({ phase: 'done', label: '0:00' })
    expect(timerView(t, 68999).phase).toBe('done')
    expect(timerView(t, 69000).phase).toBe('idle')
  })
  it('idle for null or malformed', () => {
    expect(timerView(null, 5).phase).toBe('idle')
    expect(timerView({}, 5).phase).toBe('idle')
  })
  it('applies the display clock offset', () => {
    // TV clock runs 5s ahead of the host: it calibrates from sentAt and stays right
    const tvNow = 1000 + 5000
    const off = calibrateOffset(tvNow, t)
    expect(off).toBe(5000)
    expect(timerView(t, tvNow + 30000, off).label).toBe('0:30')
    // without calibration it would be 5s short
    expect(timerView(t, tvNow + 30000, 0).label).toBe('0:25')
  })
})

describe('pause / resume / add', () => {
  it('freezes remaining time while paused and resumes from it', () => {
    const t = startTimer(60000, 0)
    const p = pauseTimer(t, 20000)
    expect(timerView(p, 999999)).toMatchObject({ phase: 'paused', label: '0:40' })
    const r = resumeTimer(p, 100000)
    expect(timerView(r, 110000).label).toBe('0:30')
  })
  it('add a minute works running, paused, and after done (fresh timer)', () => {
    const t = startTimer(60000, 0)
    expect(timerView(addTime(t, 60000, 10000), 10000).label).toBe('1:50')
    expect(timerView(addTime(pauseTimer(t, 10000), 60000, 20000), 0).label).toBe('1:50')
    const again = addTime(t, 60000, 65000)
    expect(again.id).not.toBe(t.id)
    expect(timerView(again, 65000).label).toBe('1:00')
  })
  it('pause/resume on the wrong state is a no-op', () => {
    const t = startTimer(60000, 0)
    expect(resumeTimer(t, 5)).toBe(t)
    const p = pauseTimer(t, 5)
    expect(pauseTimer(p, 9)).toBe(p)
  })
})

describe('shouldChime', () => {
  const t = startTimer(10000, 0)
  it('chimes once at zero', () => {
    expect(shouldChime(timerView(t, 10100), null)).toBe(true)
    expect(shouldChime(timerView(t, 10100), t.id)).toBe(false)
  })
  it('stays silent when loaded late, or not finished', () => {
    expect(shouldChime(timerView(t, 14000), null)).toBe(false)
    expect(shouldChime(timerView(t, 5000), null)).toBe(false)
  })
})

describe('clockLabel', () => {
  it('formats', () => {
    expect(clockLabel(0)).toBe('0:00')
    expect(clockLabel(90000)).toBe('1:30')
    expect(clockLabel(3600000)).toBe('1:00:00')
    expect(clockLabel(-5)).toBe('0:00')
  })
})
