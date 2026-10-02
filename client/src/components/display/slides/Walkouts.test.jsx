// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import { fakeYoutube } from '../../../audio/director.fakes.js'

// Walkout songs: Pre-Show plays once and fades out over its last 2.5s (no auto-advance); State
// of the Union loops at 75% under the host. Both through the audio director + the YouTube pool.
const h = vi.hoisted(() => ({ yt: null }))
vi.mock('../../../lib/youtubeWarmAudio.js', () => ({
  warmYoutubeAudio: (...a) => h.yt.warm(...a),
  claimYoutubeAudio: (...a) => h.yt.claim(...a),
}))
vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }),
    channel: () => ({ on() { return this }, subscribe() { return this } }),
    removeChannel() {},
  },
}))
vi.mock('qrcode', () => ({ default: { toDataURL: () => Promise.resolve('data:image/png;base64,AAAA') } }))
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))

import PreShowSlide from './PreShowSlide.jsx'
import StateOfUnionSlide from './StateOfUnionSlide.jsx'
import { director } from '../../../audio/director.js'

let container, root
const SHOW = { id: 'show-1' }
const walkout = extra => ({ videoId: 'vid1', start: 10, end: 40, volume: 80, ...extra })
const preshow = (w, extra = {}) => ({ id: 'ps1', type: 'pre-show', data: { walkoutSong: w, ...extra } })
const sou = (w, extra = {}) => ({ id: 'sou1', type: 'state-of-union', data: { walkoutSong: w, ...extra } })

const mount = (node) => act(() => { root.render(<ThemeProvider>{node}</ThemeProvider>) })
const tick = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const player = () => h.yt.claims[0]?.player
const cue = () => [...container.querySelectorAll('button')].find(b => b.textContent.includes('Click for sound'))

beforeEach(() => {
  vi.useFakeTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.AudioContext = undefined
  // jsdom has no 2d context: text fitting needs measureText, the waving gradient needs the rest.
  HTMLCanvasElement.prototype.getContext = () => new Proxy({
    font: '16px sans-serif',
    measureText(s) { return { width: s.length * 8 } },
    createImageData: (w, hh) => ({ data: new Uint8ClampedArray(w * hh * 4), width: w, height: hh }),
  }, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true } })
  globalThis.FontFace = class { load() { return Promise.resolve(this) } }
  if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
  h.yt = fakeYoutube({ state: 1 })
  director._internals.reset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  director._internals.reset()
  vi.useRealTimers()
})

describe('PreShowSlide walkout', () => {
  it('warms and plays the clip at mount at its trimmed volume, with no player end (pool key v:start:)', async () => {
    mount(<PreShowSlide slide={preshow(walkout())} show={SHOW} />)
    await tick(0)
    expect(h.yt.warm).toHaveBeenCalledWith('vid1', 10, null)
    expect(h.yt.claim).toHaveBeenCalledWith('vid1', 10, null)
    expect(player().setVolume).toHaveBeenCalledWith(80)
    expect(player().seekTo).toHaveBeenCalledWith(10, true)
    expect(player().playVideo).toHaveBeenCalled()
  })

  it('fades out over the last 2.5s of the trimmed clip, then stops (the host advances by hand)', async () => {
    mount(<PreShowSlide slide={preshow(walkout())} show={SHOW} />)
    await tick(2000)
    h.yt.time = 37 // before the fade window (40 - 2.5 = 37.5): still full volume
    await tick(300)
    expect(player().setVolume).toHaveBeenLastCalledWith(80)
    h.yt.time = 37.6
    await tick(300)
    await tick(1200)
    const mid = player().setVolume.mock.calls.at(-1)[0]
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(80)
    await tick(1500)
    expect(player().setVolume).toHaveBeenLastCalledWith(0)
    expect(player().pauseVideo).toHaveBeenCalled()
  })

  it('"Hold until triggered" stays silent on mount and plays when the host\'s Next flips invoked', async () => {
    mount(<PreShowSlide slide={preshow(walkout({ trigger: 'invoke' }))} show={SHOW} />)
    await tick(0)
    expect(h.yt.claim).not.toHaveBeenCalled()
    mount(<PreShowSlide slide={preshow(walkout({ trigger: 'invoke', invoked: true }))} show={SHOW} />)
    await tick(0)
    expect(h.yt.claim).toHaveBeenCalledTimes(1)
    expect(player().playVideo).toHaveBeenCalled()
  })

  it('never warms or plays in the host preview pane', async () => {
    mount(<PreShowSlide slide={preshow(walkout())} show={SHOW} isPreview />)
    await tick(0)
    expect(h.yt.warm).not.toHaveBeenCalled()
    expect(h.yt.claim).not.toHaveBeenCalled()
  })

  it('leaving the slide destroys the player (the song cuts off)', async () => {
    mount(<PreShowSlide slide={preshow(walkout())} show={SHOW} />)
    await tick(0)
    act(() => root.unmount())
    expect(h.yt.claims[0].destroyed).toBe(true)
    root = createRoot(container)
  })

  it('shows "Click for sound" when the song is not really sounding 2s after it was asked for', async () => {
    h.yt.muted = true
    mount(<PreShowSlide slide={preshow(walkout())} show={SHOW} />)
    await tick(2100)
    expect(cue()).toBeTruthy()
  })

  it('no walkout song: nothing is claimed', async () => {
    mount(<PreShowSlide slide={preshow(null)} show={SHOW} />)
    await tick(0)
    expect(h.yt.claim).not.toHaveBeenCalled()
  })
})

describe('StateOfUnionSlide walkout', () => {
  it('plays under the host at 75% of its trimmed volume', async () => {
    mount(<StateOfUnionSlide slide={sou(walkout())} />)
    await tick(0)
    expect(h.yt.claim).toHaveBeenCalledWith('vid1', 10, null)
    expect(player().setVolume).toHaveBeenCalledWith(60) // 75% of 80
  })

  it('loops: at the out-point it seeks back to the start and keeps playing', async () => {
    mount(<StateOfUnionSlide slide={sou(walkout())} />)
    await tick(2000)
    const seeks = player().seekTo.mock.calls.length
    h.yt.time = 40.2
    await tick(300)
    expect(player().seekTo.mock.calls.length).toBe(seeks + 1)
    expect(player().seekTo).toHaveBeenLastCalledWith(10, true)
  })

  it('an untrimmed clip (duration still 0) never loops early', async () => {
    mount(<StateOfUnionSlide slide={sou(walkout({ end: null }))} />)
    await tick(2000)
    const seeks = player().seekTo.mock.calls.length
    h.yt.time = 3
    h.yt.duration = 0
    await tick(2000)
    expect(player().seekTo.mock.calls.length).toBe(seeks)
  })

  it('never plays in the host preview pane', async () => {
    mount(<StateOfUnionSlide slide={sou(walkout())} isPreview />)
    await tick(0)
    expect(h.yt.claim).not.toHaveBeenCalled()
  })

  it('leaving the slide cuts the song at once', async () => {
    mount(<StateOfUnionSlide slide={sou(walkout())} />)
    await tick(0)
    act(() => root.unmount())
    expect(h.yt.claims[0].destroyed).toBe(true)
    root = createRoot(container)
  })

  it('shows "Click for sound" when the loop is blocked', async () => {
    h.yt.muted = true
    mount(<StateOfUnionSlide slide={sou(walkout())} />)
    await tick(2100)
    expect(cue()).toBeTruthy()
  })
})
