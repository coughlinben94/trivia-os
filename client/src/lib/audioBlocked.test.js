// "Fail loud" for a clip that was asked to play but never made sound — the
// 2026-09-29 runner-up cause: Chrome blocks UNMUTED playback on a tab that
// has had no click/key since it loaded (a reloaded /display), and nothing
// ever checked that the clip actually started. Spec: "Failure is loud".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn() }))

let mod, Sentry
beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  Sentry = await import('@sentry/react')
  Sentry.captureMessage.mockClear()
  mod = await import('./audioBlocked.js')
})
afterEach(() => vi.useRealTimers())

const yt = (state, muted = false) => ({ getPlayerState: () => state, isMuted: () => muted })

describe('youtubeIsSounding', () => {
  it('playing and unmuted is sounding', () => {
    expect(mod.youtubeIsSounding(yt(1))).toBe(true)
  })
  it('buffering is NOT blocked (slow network, not autoplay policy)', () => {
    expect(mod.youtubeIsSounding(yt(3))).toBe(true)
  })
  it('unstarted, paused, cued, or still muted is not sounding', () => {
    for (const s of [-1, 2, 5, 0]) expect(mod.youtubeIsSounding(yt(s))).toBe(false)
    expect(mod.youtubeIsSounding(yt(1, true))).toBe(false)
  })
  it('a player that throws or has no such methods is not sounding (and never throws out)', () => {
    expect(mod.youtubeIsSounding({ getPlayerState() { throw new Error('gone') }, isMuted: () => false })).toBe(false)
    expect(mod.youtubeIsSounding({})).toBe(false)
    expect(mod.youtubeIsSounding(null)).toBe(false)
  })
})

describe('mediaIsSounding readiness', () => {
  it('an element that is not paused but has not buffered (readyState < 3) is not sounding yet', () => {
    expect(mod.mediaIsSounding({ paused: false, ended: false, readyState: 1 }, { state: 'running' })).toBe(false)
    expect(mod.mediaIsSounding({ paused: false, ended: false, readyState: 3 }, { state: 'running' })).toBe(true)
  })
})

describe('mediaIsSounding', () => {
  it('is sounding only when not paused and the context is running', () => {
    expect(mod.mediaIsSounding({ paused: false }, { state: 'running' })).toBe(true)
    expect(mod.mediaIsSounding({ paused: false }, null)).toBe(true)
    expect(mod.mediaIsSounding({ paused: true }, { state: 'running' })).toBe(false)
    expect(mod.mediaIsSounding({ paused: false }, { state: 'suspended' })).toBe(false)
    expect(mod.mediaIsSounding(null, null)).toBe(false)
  })
  it('a clip that already ENDED played (shorter than the check delay)', () => {
    expect(mod.mediaIsSounding({ paused: true, ended: true }, { state: 'running' })).toBe(true)
  })
})

describe('reportBlocked', () => {
  it('sends one Sentry warning tagged area:audio per clip per page load', () => {
    mod.reportBlocked('youtube', { slideId: 's1', part: 0 })
    mod.reportBlocked('youtube', { slideId: 's1', part: 0 })
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage.mock.calls[0][0]).toBe('audio: play blocked (youtube)')
    expect(Sentry.captureMessage.mock.calls[0][1]).toMatchObject({ level: 'warning', tags: { area: 'audio' }, extra: { slideId: 's1', part: 0 } })
  })
  it('different clips and kinds report separately', () => {
    mod.reportBlocked('youtube', { slideId: 's1', part: 0 })
    mod.reportBlocked('youtube', { slideId: 's1', part: 1 })
    mod.reportBlocked('upload', { slideId: 's1', part: 0 })
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(3)
  })
  it('never throws if Sentry does', () => {
    Sentry.captureMessage.mockImplementation(() => { throw new Error('down') })
    expect(() => mod.reportBlocked('upload', { slideId: 'x' })).not.toThrow()
  })
})
