// @vitest-environment jsdom
// client/src/components/display/slides/BendleRevealList.test.jsx
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import BendleRevealList, { fitTier, fitScale, roomFor, TWO_COLUMN_FLOOR, ONE_COLUMN_FLOOR } from './BendleRevealList.jsx'

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
  // Changed deliberately (round 5): 3-line cells at any two-column count; the
  // fit decides when to drop to 2 (see 'fit to the stage height').
  it('two columns start with 3-line name and guess cells at any team count', () => {
    for (const n of [11, 16, 17, 20]) {
      act(() => root?.unmount()); host?.remove()
      render(Array.from({ length: n }, (_, i) => team(i, 0, sweet)))
      expect(cells().guess.style.whiteSpace).toBe('normal')
      expect(cells().guess.dataset.lines).toBe('3')
      expect(cells().name.dataset.lines).toBe('3')
    }
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

  it('floors: two columns 0.8 (2.2vmin -> 1.76), one column 0.7 (2.8vmin -> 1.96)', () => {
    expect(TWO_COLUMN_FLOOR).toBe(0.8)
    expect(ONE_COLUMN_FLOOR).toBe(0.7)
  })
  // Numbers from the round-4 browser measurements (room = px left under the answer line).
  it('fitTier: scales the 3-line list first (1080p, 16 teams: 699px in 690px)', () => {
    const t = fitTier({ avail: 690, natural3: 699, natural2: 560 })
    expect(t.lines).toBe(3)
    expect(t.scale).toBeCloseTo(690 / 699, 3)
  })
  it('fitTier: fits as is -> 3 lines, scale 1', () => {
    expect(fitTier({ avail: 420, natural3: 402 })).toEqual({ lines: 3, scale: 1 })
  })
  it('fitTier: 3 lines would need < 0.8 -> 2-line tier (720p 17 teams needs 0.74; 1080p 20 needs 0.78)', () => {
    expect(fitTier({ avail: 420, natural3: 568, natural2: 391 })).toEqual({ lines: 2, scale: 1 })
    expect(fitTier({ avail: 690, natural3: 885, natural2: 623 })).toEqual({ lines: 2, scale: 1 })
  })
  it('fitTier: asks to measure 2 lines when it has only the 3-line height', () => {
    expect(fitTier({ avail: 420, natural3: 568 })).toEqual({ lines: 2, scale: 1 })
  })
  it('fitTier: 2 lines scaled, then the floor (documented overflow past it)', () => {
    const t = fitTier({ avail: 420, natural3: 590, natural2: 435 })
    expect(t.lines).toBe(2)
    expect(t.scale).toBeCloseTo(420 / 435, 3)
    expect(fitTier({ avail: 420, natural3: 900, natural2: 700 })).toEqual({ lines: 2, scale: 0.8 })
  })
  it('fitTier: no 3-line height yet (new width or fonts) -> measure 3 lines first', () => {
    expect(fitTier({ avail: 420, natural2: 391 })).toEqual({ lines: 3, scale: 1 })
    expect(fitTier({ avail: 0, natural3: 500 })).toEqual({ lines: 3, scale: 1 })
  })
  it('fitTier: no latch: the same heights with more room go back to 3 lines', () => {
    expect(fitTier({ avail: 300, natural3: 402, natural2: 330 }).lines).toBe(2)
    expect(fitTier({ avail: 420, natural3: 402, natural2: 330 })).toEqual({ lines: 3, scale: 1 })
  })
  it('fitScale: one column, never above 1, floor 0.7', () => {
    expect(fitScale(690, 814)).toBeCloseTo(690 / 814, 3)
    expect(fitScale(420, 543)).toBeCloseTo(420 / 543, 3)
    expect(fitScale(900, 300)).toBe(1)
    expect(fitScale(100, 1000)).toBe(0.7)
    expect(fitScale(0, 300)).toBe(1)
  })

  // jsdom has no layout: stub the room, the natural height per rendered line
  // mode, and a ResizeObserver whose callback the test can fire.
  const sizes = { avail: 420, n3: 600, n2: 400 }
  let restore, fire
  beforeEach(() => {
    const ro = globalThis.ResizeObserver
    const oh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    const cbs = new Set()
    fire = () => act(() => { cbs.forEach(cb => cb([])) })
    globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb } observe() { cbs.add(this.cb) } disconnect() { cbs.delete(this.cb) } }
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() {
      if (this.dataset?.fit !== 'content') return 0
      return this.querySelector('[data-lines]')?.dataset.lines === '3' ? sizes.n3 : sizes.n2
    } })
    // The room is read from the list's parent (here the test host). Like a real
    // browser, the list's own flex item is only as tall as the list when it
    // fits, so reading the item instead would hide spare room (the old latch).
    const natural = el => (el.querySelector('[data-lines]')?.dataset.lines === '3' ? sizes.n3 : sizes.n2)
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() {
      if (this.dataset?.fit === 'outer') return Math.min(sizes.avail, natural(this))
      return [...this.children].some(c => c.dataset?.fit === 'outer') ? sizes.avail : 0
    } })
    restore = () => {
      globalThis.ResizeObserver = ro
      if (oh) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', oh)
      if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch)
    }
  })
  afterEach(() => restore())
  const scaleNow = () => Number(host.querySelector('[data-fit="content"]').dataset.scale)

  it('roomFor: parent height minus padding, other in-flow children and gaps', () => {
    const parent = document.createElement('div')
    parent.style.paddingTop = '10px'; parent.style.paddingBottom = '10px'; parent.style.rowGap = '5px'
    const heading = document.createElement('h2'); const outer = document.createElement('div')
    const badge = document.createElement('div'); badge.style.position = 'absolute'
    outer.dataset.fit = 'outer'
    parent.append(badge, heading, outer); document.body.append(parent)
    Object.defineProperty(heading, 'offsetHeight', { configurable: true, value: 72 })
    try {
      expect(roomFor(outer)).toBe(sizes.avail - 20 - 72 - 5)
    } finally { parent.remove() }
  })
  it('two columns slightly too tall keep 3 lines and scale (origin top center)', () => {
    Object.assign(sizes, { avail: 690, n3: 699, n2: 560 })
    render(Array.from({ length: 16 }, (_, i) => team(i, 0, sweet)))
    expect(cells().guess.dataset.lines).toBe('3')
    expect(scaleNow()).toBeCloseTo(690 / 699, 3)
    const content = host.querySelector('[data-fit="content"]')
    expect(content.style.transformOrigin).toBe('top center')
  })
  it('two columns far too tall drop to 2 lines, and come back when the room grows', () => {
    // n2/n3 < 0.8 on purpose: reading the shrunken list item (330px) instead of
    // the room would keep it at 2 lines forever.
    Object.assign(sizes, { avail: 375, n3: 450, n2: 330 })
    render(Array.from({ length: 14 }, (_, i) => team(i, 0, sweet)))
    expect(cells().guess.dataset.lines).toBe('3') // 375/450 = 0.83: still 3 lines, scaled
    Object.assign(sizes, { avail: 300 })
    fire()
    expect(cells().guess.dataset.lines).toBe('2') // 300/450 = 0.67 < 0.8
    expect(scaleNow()).toBeCloseTo(300 / 330, 3)
    Object.assign(sizes, { avail: 460 }) // a transient line gone: more room
    fire()
    expect(cells().guess.dataset.lines).toBe('3')
    expect(scaleNow()).toBe(1)
  })
  it('a line added to the slide column after mount (late answer line) re-runs the fit', async () => {
    Object.assign(sizes, { avail: 460, n3: 450, n2: 330 })
    render(Array.from({ length: 16 }, (_, i) => team(i, 0, sweet)))
    expect(cells().guess.dataset.lines).toBe('3')
    expect(scaleNow()).toBe(1)
    // The column itself keeps its size; only a new child takes 160px of room.
    const answerLine = document.createElement('p')
    Object.defineProperty(answerLine, 'offsetHeight', { configurable: true, value: 160 })
    await act(async () => { host.prepend(answerLine); await new Promise(r => setTimeout(r, 0)) })
    expect(cells().guess.dataset.lines).toBe('2') // room 300: 300/450 < 0.8
    expect(scaleNow()).toBeCloseTo(300 / 330, 3)
    // ...and it is re-decided from 3 lines when the line goes away (no latch).
    await act(async () => { answerLine.remove(); await new Promise(r => setTimeout(r, 0)) })
    expect(cells().guess.dataset.lines).toBe('3')
    expect(scaleNow()).toBe(1)
  })
  it('one column scales with the 0.7 floor and keeps its 10/11 boundary', () => {
    Object.assign(sizes, { avail: 420, n3: 543, n2: 543 })
    render(Array.from({ length: 10 }, (_, i) => team(i, 0, sweet)))
    expect(host.querySelector('[role="list"]').dataset.columns).toBe('1')
    expect(scaleNow()).toBeCloseTo(420 / 543, 3)
  })
  it('a list that fits is never scaled up', () => {
    Object.assign(sizes, { avail: 900, n3: 300, n2: 250 })
    render(Array.from({ length: 16 }, (_, i) => team(i, 0, sweet)))
    expect(scaleNow()).toBe(1)
    expect(cells().name.dataset.lines).toBe('3')
  })
})
