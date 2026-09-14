// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import RaceSlide from './RaceSlide.jsx'

const baseData = {
  text: 'Which movie made the most money?',
  contenders: [
    { id: 'a', name: 'Lion King', imageUrl: null },
    { id: 'b', name: 'Forrest Gump', imageUrl: null },
    { id: 'c', name: 'True Lies', imageUrl: null },
    { id: 'd', name: 'Speed', imageUrl: null },
  ],
  beats: [
    { label: 'Week 1', values: [40.9, 24.5, 25.9, 14.5] },
    { label: 'Week 2', values: [10, 20, 8, 6] },
    { label: 'Week 3', values: [5, 25, 3, 4] },
  ],
  raceStartedAt: null,
  answer: 'Forrest Gump',
}

function makeSlide(overrides = {}) {
  return { id: 's1', type: 'horse-race', data: { ...baseData, ...overrides } }
}

describe('<RaceSlide>', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // jsdom's 2d context is unimplemented; autoFitText (used for data.text)
    // measures glyph widths through one. Same crude length*size stub
    // CustomSlide.test.jsx/QuestionSlide.test.jsx use.
    HTMLCanvasElement.prototype.getContext = () => ({
      font: '16px sans-serif',
      measureText(s) {
        const px = parseFloat(/^([\d.]+)px/.exec(this.font)?.[1] ?? 16)
        return { width: s.length * px * 0.55 }
      },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = slide => act(() => {
    root.render(
      <ThemeProvider>
        <RaceSlide slide={slide} />
      </ThemeProvider>
    )
  })

  it('renders four lane wrappers at the gate position with no bob', () => {
    render(makeSlide())
    const wrappers = container.querySelectorAll('[data-race-lane]')
    expect(wrappers.length).toBe(4)
    wrappers.forEach(el => expect(el.getAttribute('data-race-state')).toBe('gate'))
  })

  it('renders the finished state immediately when raceStartedAt is far in the past', () => {
    const started = Date.now() - 60_000 // well past total duration (3 beats * 700ms)
    render(makeSlide({ raceStartedAt: started }))
    expect(container.querySelector('[data-race-winner="true"]')).toBeTruthy()
  })

  it('generates one keyframe rule with N+1 stops per lane', () => {
    render(makeSlide({ raceStartedAt: Date.now() }))
    const styleTag = container.querySelector('style[data-race-keyframes]')
    expect(styleTag).toBeTruthy()
    const matches = styleTag.textContent.match(/@keyframes/g) || []
    expect(matches.length).toBe(4) // one block per lane
  })

  it('stretches the final beat into a photo-finish slow-motion duration', () => {
    render(makeSlide({ raceStartedAt: Date.now() }))
    const styleTag = container.querySelector('style[data-race-keyframes]')
    const track = container.querySelector('[data-race-track]')
    expect(track).toBeTruthy()
    // 3 beats at 700ms = 2100ms raw; cinematic remap stretches the last
    // beat to 700*2.5 = 1750ms, so TOTAL_MS = 2*700 + 1750 = 3150ms
    expect(styleTag.textContent).toMatch(/3150ms/)
  })
})

describe('<RaceSlide> — reduced motion', () => {
  let container, root

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('framer-motion', async () => {
      const actual = await vi.importActual('framer-motion')
      return { ...actual, useReducedMotion: () => true }
    })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    HTMLCanvasElement.prototype.getContext = () => ({
      font: '16px sans-serif',
      measureText(s) {
        const px = parseFloat(/^([\d.]+)px/.exec(this.font)?.[1] ?? 16)
        return { width: s.length * px * 0.55 }
      },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.doUnmock('framer-motion')
  })

  it('renders final positions with animation: none under reduced motion', async () => {
    const { default: RaceSlideReduced } = await import('./RaceSlide.jsx')
    const { ThemeProvider: TP } = await import('../../shared/ThemeProvider.jsx')
    act(() => {
      root.render(
        <TP>
          <RaceSlideReduced slide={makeSlide({ raceStartedAt: Date.now() })} />
        </TP>
      )
    })
    const lane = container.querySelector('[data-race-lane]')
    expect(lane.style.animation).toMatch(/none/)
  })
})
