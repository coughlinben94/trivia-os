// @vitest-environment jsdom
// client/src/components/display/slides/BendleRevealList.test.jsx
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import BendleRevealList from './BendleRevealList.jsx'

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
  it('two columns let the name and guess wrap to two lines; one column stays one line', () => {
    render(Array.from({ length: 11 }, (_, i) => team(i, 0, { title: 'Sweet Dreams (Are Made of This)', artist: 'Eurythmics' })))
    const [, name, guess] = host.querySelector('[role="listitem"]').children
    expect(guess.style.whiteSpace).toBe('normal')
    expect(name.style.whiteSpace).toBe('normal')
    act(() => root.render(<BendleRevealList results={[team(1, 0)]} theme={theme} />))
    const [, name1, guess1] = host.querySelector('[role="listitem"]').children
    expect(guess1.style.whiteSpace).toBe('nowrap')
    expect(name1.style.whiteSpace).toBe('nowrap')
  })
  it('one column sizes the name column to the names (fit-content, capped at 40%)', () => {
    render([team(1, 0)])
    const list = host.querySelector('[role="list"]')
    expect(list.dataset.nameColumn).toBe('fit-content(40%)')
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
