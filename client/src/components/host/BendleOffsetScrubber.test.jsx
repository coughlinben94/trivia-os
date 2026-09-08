// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import BendleOffsetScrubber from './BendleOffsetScrubber.jsx'

// No @testing-library/react in this repo — createRoot + act(...) is the
// house pattern (see ShinyBendleQuestion.test.jsx, BendleAdmin.test.jsx).

let updateSpy
let updateResult
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      update: (...args) => {
        updateSpy(...args)
        return { eq: () => ({ select: () => Promise.resolve(updateResult) }) }
      },
    }),
  },
}))

const SONG = {
  id: 'bnd_1', drums_url: 'd.mp3', bass_url: 'b.mp3', other_url: 'o.mp3', start_offset_seconds: 0,
}

class FakeAudioContext {
  constructor() { this.closed = false }
  async decodeAudioData() {
    // 120s @ 100Hz mono, constant amplitude — enough for a real envelope
    // without a slow test.
    const sampleRate = 100
    const length = 120 * sampleRate
    const data = new Float32Array(length).fill(0.5)
    return { duration: 120, sampleRate, getChannelData: () => data }
  }
  async close() { this.closed = true }
}

describe('<BendleOffsetScrubber>', () => {
  let container, root

  beforeEach(() => {
    updateSpy = vi.fn()
    updateResult = { data: [{ start_offset_seconds: 45 }], error: null }
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    global.fetch = vi.fn(() => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))
    window.AudioContext = FakeAudioContext
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

  it('shows an analyzing state, then the envelope graph and controls', async () => {
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    expect(container.textContent).toContain('Analyzing')
    await settle()
    expect(container.querySelector('[data-testid="bendle-envelope-graph"]')).toBeTruthy()
    expect(container.querySelector('input[type="range"]')).toBeTruthy()
  })

  it('clamps the start handle at duration minus the minimum playable length', async () => {
    // Both handles share one 0..duration DOM domain now (2026-09-08 rebuild
    // to a single visual track, Ben: "one in one out") — the maxOffset
    // clamp happens in the onChange handler, not a DOM min/max, so this
    // drags past it and checks the clamped result instead of a static
    // range.max attribute.
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    const startRange = container.querySelector('input[aria-label="Start point"]')
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      nativeSetter.call(startRange, '118') // past maxOffset (120 - 5 = 115)
      startRange.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.textContent).toContain('IN 1:55')
  })

  it('saves the clamped start offset (and end offset defaulted to duration) when saved', async () => {
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    const range = container.querySelector('input[aria-label="Start point"]')
    // React's own value tracker swallows a plain `range.value = '45'` before
    // a dispatched 'change' event ever reaches the onChange handler — the
    // native setter bypasses that tracker. Same workaround this repo already
    // uses in BendleSongSearch.test.jsx / WorldPaletteEditor.test.jsx.
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      nativeSetter.call(range, '45')
      range.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const button = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Set Start'))
    await act(async () => { button.click(); await new Promise(r => setTimeout(r, 0)) })
    // duration is 120 in this fixture; end was never touched, so it defaults
    // to the full duration.
    expect(updateSpy).toHaveBeenCalledWith({ start_offset_seconds: 45, end_offset_seconds: 120 })
  })

  it('renders an end-point handle on the shared 0..duration track and saves both offsets together', async () => {
    // Both handles share one DOM domain (0..duration) on the unified track
    // (2026-09-08 rebuild, Ben: "one in one out") — the start<->end business
    // rule is enforced in the onChange clamp, not the DOM min/max.
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    const endRange = container.querySelector('input[aria-label="End point"]')
    expect(endRange).toBeTruthy()
    expect(endRange.min).toBe('0')
    expect(endRange.max).toBe('120') // duration
    expect(endRange.value).toBe('120') // song.end_offset_seconds is unset -> defaults to duration

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      nativeSetter.call(endRange, '80')
      endRange.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const button = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Set Start'))
    await act(async () => { button.click(); await new Promise(r => setTimeout(r, 0)) })
    expect(updateSpy).toHaveBeenCalledWith({ start_offset_seconds: 0, end_offset_seconds: 80 })
  })

  it('clamps a too-small end offset to a minimum gap past the start when saving', async () => {
    act(() => { root.render(<BendleOffsetScrubber song={{ ...SONG, start_offset_seconds: 40 }} />) })
    await settle()
    const endRange = container.querySelector('input[aria-label="End point"]')
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      // Try to save an end point right on top of the start point.
      nativeSetter.call(endRange, '40')
      endRange.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const button = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Set Start'))
    await act(async () => { button.click(); await new Promise(r => setTimeout(r, 0)) })
    // start_offset_seconds clamps to maxOffset (115) since 40 <= 115; end
    // must be at least MIN_END_GAP_SECONDS (3) past that.
    expect(updateSpy).toHaveBeenCalledWith({ start_offset_seconds: 40, end_offset_seconds: 43 })
  })

  it('previews all three in-round stems together, not just one', async () => {
    // Bug (2026-09-08, Ben: "is it all three combined? just one of the
    // three steps?"): playPreview used to control a single <audio> hardcoded
    // to other_url. Every in-round stem must seek+play together so Preview
    // actually sounds like the round.
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    const audios = [...container.querySelectorAll('audio')]
    expect(audios.map(a => a.getAttribute('src')).sort()).toEqual(['b.mp3', 'd.mp3', 'o.mp3'])
    const button = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Preview'))
    act(() => { button.click() })
    expect(playSpy).toHaveBeenCalledTimes(3)
    for (const a of audios) expect(a.currentTime).toBe(0)
  })

  it('surfaces an error when preview playback fails instead of silently doing nothing', async () => {
    // Bug (2026-09-08, Ben: "there isnt a preview"): a rejected .play() was
    // caught and dropped (`.catch(() => {})`) — a real failure looked
    // identical to a working preview, no sound and no feedback either way.
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.reject(new Error('blocked')))
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    const button = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Preview'))
    await act(async () => { button.click(); await new Promise(r => setTimeout(r, 0)) })
    expect(container.textContent).toContain("Couldn’t play the preview")
  })

  it('renders a bar for every bucket of the full song, dimming past the legal scrub range', async () => {
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    // duration 120, maxOffset 115 -> ceil(100 * 115 / 120) = 96 legal buckets
    // out of 100 total — the graph covers the whole song, not just the
    // scrubbable range, so the off-limits tail is visible instead of hidden.
    const firstRow = container.querySelector('[data-testid="bendle-envelope-graph"] > div')
    expect(firstRow.children).toHaveLength(100)
    expect(firstRow.children[95].style.opacity).toBe('1')
    expect(firstRow.children[96].style.opacity).toBe('0.2')
  })

  it('shows an error and no silent success when the save affects zero rows', async () => {
    updateResult = { data: [], error: null }
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    const button = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Set Start'))
    await act(async () => { button.click(); await new Promise(r => setTimeout(r, 0)) })
    expect(container.textContent).toContain("Couldn’t save the start/end points")
  })

  it('shows the too-short message when the song is under the minimum playable length', async () => {
    window.AudioContext = class {
      async decodeAudioData() {
        const data = new Float32Array(100).fill(0.5)
        return { duration: 3, sampleRate: 100, getChannelData: () => data }
      }
      async close() {}
    }
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    expect(container.textContent).toContain('too short')
    expect(container.querySelector('input[type="range"]')).toBeNull()
  })
})
