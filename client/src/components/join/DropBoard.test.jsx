// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import DropBoard from './DropBoard.jsx'

// Non-preview mounts rehydrate a saved split with
// from().select().eq().eq().maybeSingle(); `saved.row` is what that resolves.
const saved = vi.hoisted(() => ({ row: null }))
vi.mock('../../lib/supabase.js', () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: () => Promise.resolve({ data: saved.row }) }
  return { supabase: { from: () => chain } }
})

const theme = { colors: { text: '#fff', highlight: '#fc0' }, fonts: { display: 'Boogaloo' } }
const options = ['a', 'b', 'c', 'd'].map(id => ({ id, label: `Tile ${id}` }))
const baseData = { text: 'Q?', options, correctId: 'b', shinyInputSchema: { type: 'drop' } }

describe('<DropBoard>', () => {
  let container, root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove() })

  const render = (data = {}) => act(() => {
    root.render(<DropBoard preview theme={theme} team={{ id: 't', showId: 's' }} slide={{ id: 'sl', data: { ...baseData, ...data } }} />)
  })
  const addBtn = i => container.querySelectorAll('button[aria-label^="Add"]')[i]
  const subBtn = i => container.querySelectorAll('button[aria-label^="Remove"]')[i]
  const lockBtn = () => [...container.querySelectorAll('button')].find(b => /Lock In|Place \d+ more|Split Locked|Update My Split/.test(b.textContent))
  const tap = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

  it('starts with the whole pool unplaced and Lock In off', () => {
    render()
    expect(container.textContent).toContain('25')
    expect(container.textContent).toContain('left to place')
    expect(lockBtn().disabled).toBe(true)
    expect(lockBtn().textContent).toContain('Place 25 more')
  })

  it('each tap places 5 points and − takes them back', () => {
    render()
    tap(addBtn(0)); tap(addBtn(0)); tap(addBtn(1))
    expect(lockBtn().textContent).toContain('Place 10 more')
    tap(subBtn(0))
    expect(lockBtn().textContent).toContain('Place 15 more')
  })

  it('cannot place more than the pool, and Lock In turns on at exactly 0 left', () => {
    render()
    for (let i = 0; i < 5; i++) tap(addBtn(2))
    expect(container.textContent).toContain('all placed')
    expect(lockBtn().disabled).toBe(false)
    tap(addBtn(0)) // pool empty — ignored
    tap(addBtn(3))
    expect(container.textContent).toContain('all placed')
    expect(lockBtn().textContent).toContain('Lock In My Split')
  })

  it('has no one-tap All in button — going all in takes deliberate taps', () => {
    render()
    expect(container.querySelector('button[aria-label^="All in"]')).toBeNull()
    expect(container.textContent).not.toContain('All in')
    for (let i = 0; i < 5; i++) tap(addBtn(2)) // still possible: 5 taps of 5 on one tile
    expect(container.textContent).toContain('all placed')
  })

  it('teams can change the points per tap, 1 to 5, default 5', () => {
    render()
    const per = n => container.querySelector(`button[aria-label="${n} ${n === 1 ? 'point' : 'points'} per tap"]`)
    for (const n of [1, 2, 3, 4, 5]) expect(per(n)).not.toBeNull()
    expect(per(6)).toBeNull()
    expect(per(5).getAttribute('aria-pressed')).toBe('true')
    expect(per(3).getAttribute('aria-pressed')).toBe('false')
    tap(per(3))
    expect(per(3).getAttribute('aria-pressed')).toBe('true')
    tap(addBtn(0)); tap(addBtn(0))
    expect(lockBtn().textContent).toContain('Place 19 more')
    tap(subBtn(0)) // − takes a full step too
    expect(lockBtn().textContent).toContain('Place 22 more')
  })

  it('the last tap places only what is left, whatever the step', () => {
    render({ dropTotal: 7 })
    tap(container.querySelector('button[aria-label="5 points per tap"]'))
    tap(addBtn(0))
    expect(lockBtn().textContent).toContain('Place 2 more')
    tap(addBtn(1)) // a 5-tap with 2 left places 2
    expect(container.textContent).toContain('all placed')
    expect(lockBtn().disabled).toBe(false)
  })

  it('offers only steps that fit inside the pool', () => {
    render({ dropTotal: 3 })
    for (const n of [1, 2, 3]) expect(container.querySelector(`button[aria-label="${n} ${n === 1 ? 'point' : 'points'} per tap"]`)).not.toBeNull()
    expect(container.querySelector('button[aria-label="4 points per tap"]')).toBeNull()
    expect(container.querySelector('button[aria-label="5 points per tap"]')).toBeNull()
  })

  it('uses 1-point taps when the pool is not a multiple of 5', () => {
    render({ dropTotal: 12 })
    tap(addBtn(0))
    expect(lockBtn().textContent).toContain('Place 11 more')
  })

  it('once Ben locks, the board freezes and only the dropped tiles fade', () => {
    render({ dropLocked: true, dropStep: 1 })
    expect(addBtn(0).disabled).toBe(true)
    expect(subBtn(0)).toBeUndefined()
    expect(lockBtn()).toBeUndefined()
    // tile a is first in the drop order (b is correct and never drops)
    const tileOf = i => addBtn(i).parentElement
    expect(tileOf(0).style.opacity).toBe('0.28')
    expect(tileOf(1).style.opacity).toBe('1')
    expect(tileOf(2).style.opacity).toBe('1')
  })

  it('lights the correct tile once the drop is fully revealed', () => {
    render({ dropLocked: true, dropStep: 3, dropRevealed: true })
    const tileOf = i => addBtn(i).parentElement
    expect(tileOf(1).style.borderWidth).toBe('3px')
    expect(tileOf(0).style.borderWidth).toBe('1px')
    expect(container.textContent).toContain('That’s the drop!')
  })

  it('ignores a saved split that no longer fits the pool (host changed the total) instead of showing a negative counter', async () => {
    saved.row = { answer: { a: 25, b: 0, c: 0, d: 0 } }
    await act(async () => {
      root.render(<DropBoard theme={theme} team={{ id: 't', showId: 's' }} slide={{ id: 'sl', data: { ...baseData, dropTotal: 15 } }} />)
    })
    expect(container.textContent).not.toContain('-10')
    expect(container.textContent).toContain('15')
    expect(container.textContent).toContain('left to place')
    expect(lockBtn().textContent).toContain('Place 15 more')
    saved.row = null
  })

  it('restores a saved split that still fits', async () => {
    saved.row = { answer: { a: 10, b: 15, c: 0, d: 0 } }
    await act(async () => {
      root.render(<DropBoard theme={theme} team={{ id: 't', showId: 's' }} slide={{ id: 'sl', data: baseData }} />)
    })
    expect(container.textContent).toContain('all placed')
    expect(lockBtn().textContent).toContain('Split Locked')
    saved.row = null
  })
})
