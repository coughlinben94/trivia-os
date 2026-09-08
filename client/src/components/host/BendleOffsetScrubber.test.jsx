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

  it('caps the range at duration minus a full round length', async () => {
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    const range = container.querySelector('input[type="range"]')
    // duration 120, round needs 60 -> max is 60
    expect(range.max).toBe('60')
  })

  it('saves the clamped offset when "Set Start Here" is clicked', async () => {
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    const range = container.querySelector('input[type="range"]')
    // React's own value tracker swallows a plain `range.value = '45'` before
    // a dispatched 'change' event ever reaches the onChange handler — the
    // native setter bypasses that tracker. Same workaround this repo already
    // uses in BendleSongSearch.test.jsx / WorldPaletteEditor.test.jsx.
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      nativeSetter.call(range, '45')
      range.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const button = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Set Start Here'))
    await act(async () => { button.click(); await new Promise(r => setTimeout(r, 0)) })
    expect(updateSpy).toHaveBeenCalledWith({ start_offset_seconds: 45 })
  })

  it('renders only as many envelope bars as the legal scrub range covers', async () => {
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    // duration 120, maxOffset 60 -> ceil(100 * 60 / 120) = 50 bars
    const firstRow = container.querySelector('[data-testid="bendle-envelope-graph"] > div')
    expect(firstRow.children).toHaveLength(50)
  })

  it('shows an error and no silent success when the save affects zero rows', async () => {
    updateResult = { data: [], error: null }
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    const button = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Set Start Here'))
    await act(async () => { button.click(); await new Promise(r => setTimeout(r, 0)) })
    expect(container.textContent).toContain("Couldn’t save the start point")
  })

  it('shows the too-short message when the song is under one round length', async () => {
    window.AudioContext = class {
      async decodeAudioData() {
        const data = new Float32Array(100).fill(0.5)
        return { duration: 30, sampleRate: 100, getChannelData: () => data }
      }
      async close() {}
    }
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    expect(container.textContent).toContain('too short')
    expect(container.querySelector('input[type="range"]')).toBeNull()
  })
})
