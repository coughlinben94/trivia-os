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

  it('resets to running after Reset + Start Race following a finished race (no instant-spoiler regression)', () => {
    const finishedStart = Date.now() - 60_000
    render(makeSlide({ raceStartedAt: finishedStart }))
    expect(container.querySelector('[data-race-winner="true"]')).toBeTruthy()

    // Host presses Reset: raceStartedAt -> null
    render(makeSlide({ raceStartedAt: null }))
    let wrappers = container.querySelectorAll('[data-race-lane]')
    wrappers.forEach(el => expect(el.getAttribute('data-race-state')).toBe('gate'))

    // Host presses Start Race again: a fresh, recent raceStartedAt
    render(makeSlide({ raceStartedAt: Date.now() }))
    wrappers = container.querySelectorAll('[data-race-lane]')
    wrappers.forEach(el => expect(el.getAttribute('data-race-state')).toBe('running'))
    expect(container.querySelector('[data-race-winner="true"]')).toBeFalsy()
  })

  it('generates one keyframe rule with N+2 stops per lane (gate hold + N beats)', () => {
    render(makeSlide({ raceStartedAt: Date.now() }))
    const styleTag = container.querySelector('style[data-race-keyframes]')
    expect(styleTag).toBeTruthy()
    const matches = styleTag.textContent.match(/@keyframes/g) || []
    expect(matches.length).toBe(4) // one block per lane

    // 3 beats -> gate hold (0%, gatePercent%) + 3 beat stops = 5 stops per
    // lane, 4 lanes -> 20 stop rules total.
    const stopCount = (styleTag.textContent.match(/transform:/g) || []).length
    expect(stopCount).toBe(20)

    // Gate frame (0%) sits at the start line — fraction 0, no travel yet.
    // Plain transform, no per-stop timing-function — the mechanical clack
    // easing (Fable idea #5) was reverted (Ben, 2026-09-15: "choppy and not
    // smooth"); one smooth curve for the whole run now.
    expect(styleTag.textContent).toMatch(
      /0% \{ transform: translateY\(-50%\) translateX\(0%\); \}/
    )
  })

  it('shows a gate-hold caption during the pre-roll, then "And they\'re off!" for beat 1', () => {
    // Fresh Start Race: still inside the GATE_MS hold (Fable idea #2).
    render(makeSlide({ raceStartedAt: Date.now() }))
    let caption = container.querySelector('[data-race-caption]')
    expect(caption.textContent).toBe('Riders, to the line…')

    // Just past GATE_MS (1100ms): beat 1 has begun.
    render(makeSlide({ raceStartedAt: Date.now() - 1150 }))
    caption = container.querySelector('[data-race-caption]')
    expect(caption.textContent).toBe("And they're off!")
  })

  it('falls back to a generated beat caption when the real label is blank', () => {
    // buildRaceSlide() stamps beats with label: '' until a host fills them in
    // via RaceEditor (SlideEditor.jsx) — the caption must not render empty.
    const started = Date.now() - 60_000
    render(makeSlide({
      raceStartedAt: started,
      beats: [
        { label: '', values: [40.9, 24.5, 25.9, 14.5] },
        { label: '', values: [10, 20, 8, 6] },
        { label: '', values: [5, 25, 3, 4] },
      ],
    }))
    const caption = container.querySelector('[data-race-caption]')
    expect(caption).toBeTruthy()
    expect(caption.textContent).toBe('Beat 3')
  })

  it('always fills the fixed 30s race + gate-hold envelope, regardless of beat count', () => {
    render(makeSlide({ raceStartedAt: Date.now() }))
    const styleTag = container.querySelector('style[data-race-keyframes]')
    const track = container.querySelector('[data-race-track]')
    expect(track).toBeTruthy()
    // TOTAL_RACE_MS (30000) + GATE_MS (1100) = 31100ms total on-screen
    // duration — leg pacing (not total duration) is what adapts to beat
    // count; the final leg still plays slower than a normal one within
    // that fixed envelope.
    expect(styleTag.textContent).toMatch(/31100ms/)
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

    // animation: none alone doesn't prove the FINISHED state rendered —
    // RaceSlide.jsx sets it in the gate branch too. Assert the state
    // attribute directly, and check the winner's transform reflects the
    // finish position, not the gate.
    expect(lane.getAttribute('data-race-state')).toBe('finished')

    const winnerLane = container.querySelector('[data-race-winner="true"]')
    expect(winnerLane).toBeTruthy()
    // The winner's fraction at the last beat is always 1 (raceMath.js
    // normalizes to the winner's own total) — the finish position is
    // translateX(100%), never the gate's translateX(0%). If reduced motion
    // incorrectly rendered the gate instead of jumping straight to
    // finished, this would read translateX(0%) instead.
    expect(winnerLane.style.transform).toContain('translateX(100%)')
    expect(winnerLane.style.transform).not.toContain('translateX(0%)')
  })
})
