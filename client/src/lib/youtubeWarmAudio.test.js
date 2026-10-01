// @vitest-environment jsdom
// Fail-loud contract for the warm YouTube audio pool (2026-10-01, audio
// pipeline spec "Failure is loud"): a stalled or rebuilt clip must leave a
// Sentry trail tagged area:audio. Before this, both paths were silent — the
// 2026-09-29 round-1 "Next did not start sound" night left no signal at all.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const H = vi.hoisted(() => ({ apiMode: 'ok', players: [] }))

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn() }))
vi.mock('../components/host/YoutubeClipEditor.jsx', () => ({
  loadYoutubeIframeApi: () =>
    H.apiMode === 'hang'
      ? new Promise(() => {}) // a blocked/stalled script never settles in a real browser
      : H.apiMode === 'reject'
      ? Promise.reject(new Error('iframe api blocked'))
      : Promise.resolve({
          Player: class {
            constructor(el, opts) {
              this.opts = opts
              H.players.push(this)
            }
            mute() {}
            seekTo() {}
            playVideo() {}
            pauseVideo() {}
            destroy() {}
          },
        }),
}))

let mod
let Sentry
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
const sent = () => Sentry.captureMessage.mock.calls

beforeEach(async () => {
  vi.useFakeTimers()
  H.apiMode = 'ok'
  H.players = []
  vi.resetModules()
  Sentry = await import('@sentry/react')
  Sentry.captureMessage.mockClear()
  mod = await import('./youtubeWarmAudio.js')
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('youtubeWarmAudio telemetry', () => {
  it('reports a claim that never became ready, then rebuilds (timeout-rebuild)', async () => {
    H.apiMode = 'reject'
    const entry = mod.claimYoutubeAudio('vid1', 10, 40)
    await flush()
    vi.advanceTimersByTime(1500)
    await flush()
    const calls = sent().filter(c => c[0] === 'youtube audio: claim timeout, rebuilding cold')
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toMatchObject({
      level: 'warning',
      tags: { area: 'audio' },
      extra: { videoId: 'vid1', start: 10, end: 40 },
    })
    entry.destroy()
  })

  it('reports an iframe API load failure for a clip somebody is waiting on', async () => {
    H.apiMode = 'reject'
    const entry = mod.claimYoutubeAudio('vid2', 0, 30)
    await flush()
    const calls = sent().filter(c => c[0] === 'youtube audio: iframe api failed to load')
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toMatchObject({ level: 'error', tags: { area: 'audio' }, extra: { videoId: 'vid2' } })
    entry.destroy()
  })

  it('stays quiet when the warm player is ready before the claim timeout', async () => {
    const entry = mod.claimYoutubeAudio('vid3', 0, 30)
    await flush()
    H.players[0].opts.events.onReady({ target: H.players[0] })
    vi.advanceTimersByTime(5000)
    await flush()
    expect(sent()).toHaveLength(0)
    entry.destroy()
  })

  it('reports once per clip per page load, even when a slide remounts and re-claims it', async () => {
    H.apiMode = 'reject'
    const a = mod.claimYoutubeAudio('vid4', 0, 30)
    await flush()
    vi.advanceTimersByTime(1500)
    await flush()
    a.destroy()
    const b = mod.claimYoutubeAudio('vid4', 0, 30)
    await flush()
    vi.advanceTimersByTime(1500)
    await flush()
    expect(sent().filter(c => c[0] === 'youtube audio: claim timeout, rebuilding cold')).toHaveLength(1)
    expect(sent().filter(c => c[0] === 'youtube audio: iframe api failed to load')).toHaveLength(1)
    b.destroy()
  })

  // Review of c8a260b (2026-10-01): the loader never rejects in a real
  // browser (a blocked script just hangs), so the claim timeout is the real
  // stall signal — and the cold rebuild reuses the same hung promise, so it
  // must not go quiet after one warning.
  it('reports an error if the cold rebuild is still not ready (stall never recovers)', async () => {
    H.apiMode = 'hang'
    const entry = mod.claimYoutubeAudio('vid6', 5, 35)
    await flush()
    vi.advanceTimersByTime(1500)
    await flush()
    expect(sent().filter(c => c[0] === 'youtube audio: claim timeout, rebuilding cold')).toHaveLength(1)
    expect(sent().filter(c => c[0] === 'youtube audio: still not ready after cold rebuild')).toHaveLength(0)
    vi.advanceTimersByTime(3000)
    await flush()
    const final = sent().filter(c => c[0] === 'youtube audio: still not ready after cold rebuild')
    expect(final).toHaveLength(1)
    expect(final[0][1]).toMatchObject({ level: 'error', tags: { area: 'audio' }, extra: { videoId: 'vid6', start: 5, end: 35 } })
    entry.destroy()
  })

  it('does not report the final error if the rebuild does become ready', async () => {
    H.apiMode = 'hang'
    const entry = mod.claimYoutubeAudio('vid7', 0, 30)
    await flush()
    vi.advanceTimersByTime(1500)
    await flush()
    entry.destroy()
    vi.advanceTimersByTime(5000)
    await flush()
    expect(sent().filter(c => c[0] === 'youtube audio: still not ready after cold rebuild')).toHaveLength(0)
  })

  it('says whether the clip had been warmed ahead (a slow cold load is not a broken one)', async () => {
    H.apiMode = 'hang'
    mod.warmYoutubeAudio('vidW', 0, 30)
    const warmed = mod.claimYoutubeAudio('vidW', 0, 30)
    const cold = mod.claimYoutubeAudio('vidC', 0, 30)
    await flush()
    vi.advanceTimersByTime(1500)
    await flush()
    const t = sent().filter(c => c[0] === 'youtube audio: claim timeout, rebuilding cold')
    expect(t.find(c => c[1].extra.videoId === 'vidW')[1].extra.wasWarm).toBe(true)
    expect(t.find(c => c[1].extra.videoId === 'vidC')[1].extra.wasWarm).toBe(false)
    warmed.destroy(); cold.destroy()
  })

  it('does not report a failed load for a clip nobody has claimed yet', async () => {
    H.apiMode = 'reject'
    mod.warmYoutubeAudio('vidU', 0, 30)
    await flush()
    expect(sent()).toHaveLength(0)
  })

  it('reports different clips separately (dedupe is per clip, not global)', async () => {
    H.apiMode = 'hang'
    const a = mod.claimYoutubeAudio('vidA', 0, 30)
    const b = mod.claimYoutubeAudio('vidB', 0, 30)
    await flush()
    vi.advanceTimersByTime(1500)
    await flush()
    expect(sent().filter(c => c[0] === 'youtube audio: claim timeout, rebuilding cold')).toHaveLength(2)
    a.destroy(); b.destroy()
  })

  // Review of c8a260b: destroy() removed only the ORIGINAL hidden container, so a
  // claim that rebuilt cold left its fresh 1x1 iframe holder in <body> forever.
  it('destroy() removes the rebuilt clip\'s hidden container too (no 1x1 leak)', async () => {
    H.apiMode = 'hang'
    // every hidden holder the module appends to <body> is a position:fixed 1x1 div
    const holders = () => [...document.body.children].filter(el => el.style.position === 'fixed' && el.style.width === '1px').length
    const entry = mod.claimYoutubeAudio('vidL', 0, 30)
    await flush()
    expect(holders()).toBe(1)
    vi.advanceTimersByTime(1500) // claim timeout: rebuild cold into a fresh container
    await flush()
    expect(holders()).toBe(1) // old one removed, new one added
    entry.destroy()
    expect(holders()).toBe(0)
  })

  it('never throws if Sentry itself throws', async () => {
    H.apiMode = 'reject'
    Sentry.captureMessage.mockImplementation(() => { throw new Error('sentry down') })
    const entry = mod.claimYoutubeAudio('vid5', 0, 30)
    await flush()
    expect(() => vi.advanceTimersByTime(1500)).not.toThrow()
    entry.destroy()
  })
})
