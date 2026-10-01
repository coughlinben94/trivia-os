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
    H.apiMode === 'reject'
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

  it('never throws if Sentry itself throws', async () => {
    H.apiMode = 'reject'
    Sentry.captureMessage.mockImplementation(() => { throw new Error('sentry down') })
    const entry = mod.claimYoutubeAudio('vid5', 0, 30)
    await flush()
    expect(() => vi.advanceTimersByTime(1500)).not.toThrow()
    entry.destroy()
  })
})
