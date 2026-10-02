// @vitest-environment jsdom
// client/src/components/display/slides/BendleRevealList.test.jsx
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import BendleRevealList, { fitStep, MIN_FIT_SCALE } from './BendleRevealList.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const theme = { colors: { text: '#ffffff' }, fonts: { display: 'Boogaloo', body: 'DM Sans' } }
const team = (i, points, guess = { title: `Song ${i}`, artist: `Artist ${i}` }, stepIndex = 0) =>
  ({ teamId: `p${i}`, teamName: `Team ${i}`, guess, stepIndex: guess ? stepIndex : null, correct: points > 0, autoPoints: points, points, overridden: false })
let root, host
afterEach(() => { act(() => root?.unmount()); host?.remove() })
const render = results => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(<BendleRevealList results={results} theme={theme} />))
}

describe('<BendleRevealList>', () => {
  it('lists every team in the given order with guess, step, mark and points', () => {
    render([team(1, 30), team(2, 0, { title: 'Africa', artist: null }, 1), team(3, 0, null)])
    const rows = [...host.querySelectorAll('[role="listitem"]')]
    expect(rows.map(r => r.dataset.correct)).toEqual(['true', 'false', 'false'])
    expect(rows[0].textContent).toContain('Team 1')
    expect(rows[0].textContent).toContain('Song 1 — Artist 1')
    expect(rows[0].textContent).toContain('Step 1')
    expect(rows[0].textContent).toContain('+30')
    expect(rows[1].textContent).toContain('Africa')
    expect(rows[1].textContent).toContain('Step 2')
    expect(rows[2].textContent).toContain('No guess')
    expect(rows[2].textContent).not.toContain('Step')
  })
  // jsdom's style object drops grid properties, so columns are read from data-columns.
  it('one column at 10 teams, two columns (2.2vmin) above 10', () => {
    render(Array.from({ length: 10 }, (_, i) => team(i, 0)))
    const list = host.querySelector('[role="list"]')
    expect(list.dataset.columns).toBe('1')
    expect(list.style.fontSize).toBe('2.8vmin')
    act(() => root.render(<BendleRevealList results={Array.from({ length: 20 }, (_, i) => team(i, 0))} theme={theme} />))
    expect(list.dataset.columns).toBe('2')
    expect(list.style.fontSize).toBe('2.2vmin')
  })
  it('renders nothing harmful for an empty list', () => {
    render([])
    expect(host.querySelectorAll('[role="listitem"]')).toHaveLength(0)
  })
  it('switches to two columns at 11 teams', () => {
    render(Array.from({ length: 11 }, (_, i) => team(i, 0)))
    expect(host.querySelector('[role="list"]').dataset.columns).toBe('2')
  })
  it('zero-point rows keep the 70% text level, never 50%, with no stacked opacity', () => {
    render([team(1, 0)])
    const row = host.querySelector('[role="listitem"]')
    const [mark, , , step, pts] = row.children
    const rowColor = row.style.color
    expect(mark.style.color).toBe(rowColor)
    expect(pts.style.color).toBe(rowColor)
    expect(step.style.opacity).toBe('')
    expect(mark.querySelector('svg').dataset.mark).toBe('wrong')
    expect(pts.textContent).toBe('0')
  })
  it('marks are inline SVG (no font fallback glyph), hidden from screen readers', () => {
    render([team(1, 30), team(2, 0)])
    const [right, wrong] = [...host.querySelectorAll('[role="listitem"]')].map(r => r.children[0])
    expect(right.querySelector('svg').dataset.mark).toBe('right')
    expect(wrong.querySelector('svg').dataset.mark).toBe('wrong')
    expect(right.textContent).toBe('')
    expect(right.getAttribute('aria-hidden')).toBe('true')
    expect(host.querySelector('[role="listitem"]').getAttribute('aria-label')).toContain('30 points')
  })
  // Changed deliberately (browser re-check 2026-10-02): one column used to stay
  // on one line and cut the correct answer at 10 teams; every mode wraps now.
  const cells = () => { const [, name, guess] = host.querySelector('[role="listitem"]').children; return { name, guess } }
  const sweet = { title: 'Sweet Dreams (Are Made of This)', artist: 'Eurythmics' }
  it('one column: name and guess wrap to two lines, never cut to one', () => {
    render(Array.from({ length: 10 }, (_, i) => team(i, 0, sweet)))
    const { name, guess } = cells()
    expect(guess.style.whiteSpace).toBe('normal')
    expect(name.style.whiteSpace).toBe('normal')
    expect(guess.dataset.lines).toBe('2')
    expect(name.dataset.lines).toBe('2')
  })
  // Changed deliberately (round 4): the guess also gets 3 lines up to 8 rows.
  it('two columns: name and guess get 3 lines up to 8 rows per column, 2 above', () => {
    render(Array.from({ length: 16 }, (_, i) => team(i, 0, sweet)))
    expect(cells().guess.style.whiteSpace).toBe('normal')
    expect(cells().guess.dataset.lines).toBe('3')
    expect(cells().name.dataset.lines).toBe('3')
    act(() => root.render(<BendleRevealList results={Array.from({ length: 17 }, (_, i) => team(i, 0, sweet))} theme={theme} />))
    expect(cells().name.dataset.lines).toBe('2')
    expect(cells().guess.dataset.lines).toBe('2')
  })
  it('one column caps the name column at 30% (fit-content), leaving the guess the room', () => {
    render([team(1, 0)])
    const list = host.querySelector('[role="list"]')
    expect(list.dataset.nameColumn).toBe('fit-content(30%)')
  })
  it('a (host) tag widens the step column and never wraps the step cell', () => {
    render([{ ...team(1, 10), overridden: true }, team(2, 30)])
    const list = host.querySelector('[role="list"]')
    expect(list.dataset.stepColumn).toBe('6.5em')
    const step = host.querySelector('[role="listitem"]').children[3]
    expect(step.style.whiteSpace).toBe('nowrap')
    act(() => root.render(<BendleRevealList results={[team(1, 10)]} theme={theme} />))
    expect(host.querySelector('[role="list"]').dataset.stepColumn).toBe('4.2em')
  })
  it('host-changed rows carry a (host) tag', () => {
    render([{ ...team(1, 10), overridden: true }, team(2, 30)])
    const rows = [...host.querySelectorAll('[role="listitem"]')]
    expect(rows[0].textContent).toContain('(host)')
    const tag = [...rows[0].querySelectorAll('span')].find(s => s.textContent === '(host)')
    expect(tag.style.display).toBe('inline')
    expect(rows[0].getAttribute('aria-label')).toContain('changed by the host')
    expect(rows[1].textContent).not.toContain('(host)')
  })
})

describe('fit to the stage height', () => {
  const sweet = { title: 'Sweet Dreams (Are Made of This)', artist: 'Eurythmics' }
  const cells = () => { const [, name, guess] = host.querySelector('[role="listitem"]').children; return { name, guess } }
  it('fitStep: fits as is, tightens first when it can, then scales with a 0.7 floor', () => {
    expect(fitStep({ avail: 500, natural: 400, tight: false, canTighten: true })).toEqual({ tight: false, scale: 1 })
    expect(fitStep({ avail: 420, natural: 510, tight: false, canTighten: true })).toEqual({ tight: true, scale: 1 })
    expect(fitStep({ avail: 420, natural: 543, tight: false, canTighten: false }).scale).toBeCloseTo(420 / 543)
    expect(fitStep({ avail: 420, natural: 435, tight: true, canTighten: true }).scale).toBeCloseTo(420 / 435)
    expect(fitStep({ avail: 100, natural: 1000, tight: true, canTighten: true }).scale).toBe(MIN_FIT_SCALE)
    expect(MIN_FIT_SCALE).toBe(0.7)
    expect(fitStep({ avail: 0, natural: 400, tight: false, canTighten: true })).toEqual({ tight: false, scale: 1 })
  })

  // jsdom has no layout: stub the two sizes the fit reads and a ResizeObserver.
  const sizes = { avail: 420, natural: 600 }
  let restore
  beforeEach(() => {
    const ro = globalThis.ResizeObserver
    const oh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    globalThis.ResizeObserver = class { observe() {} disconnect() {} }
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.dataset?.fit === 'content' ? sizes.natural : 0 } })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return this.dataset?.fit === 'outer' ? sizes.avail : 0 } })
    restore = () => {
      globalThis.ResizeObserver = ro
      if (oh) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', oh)
      if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch)
    }
  })
  afterEach(() => restore())

  it('two columns that overflow drop to 2-line cells, then scale down (origin top center)', () => {
    Object.assign(sizes, { avail: 420, natural: 600 })
    render(Array.from({ length: 16 }, (_, i) => team(i, 0, sweet)))
    expect(cells().name.dataset.lines).toBe('2')
    expect(cells().guess.dataset.lines).toBe('2')
    const content = host.querySelector('[data-fit="content"]')
    expect(content.dataset.scale).toBe('0.7')
    expect(content.style.transformOrigin).toBe('top center')
    expect(content.style.transform).toBe('scale(0.7)')
  })
  it('one column that overflows scales and keeps its 10/11 boundary', () => {
    Object.assign(sizes, { avail: 420, natural: 543 })
    render(Array.from({ length: 10 }, (_, i) => team(i, 0, sweet)))
    expect(host.querySelector('[role="list"]').dataset.columns).toBe('1')
    expect(Number(host.querySelector('[data-fit="content"]').dataset.scale)).toBeCloseTo(420 / 543, 3)
  })
  it('a list that fits is never scaled up', () => {
    Object.assign(sizes, { avail: 900, natural: 300 })
    render(Array.from({ length: 16 }, (_, i) => team(i, 0, sweet)))
    expect(host.querySelector('[data-fit="content"]').dataset.scale).toBe('1')
    expect(cells().name.dataset.lines).toBe('3')
  })
})
