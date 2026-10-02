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
    expect(rows[0].textContent).toContain('Song 1 - Artist 1')
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
})
