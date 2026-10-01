// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../lib/supabase.js', () => ({ supabase: {} }))
import DropBuilder from './DropBuilder.jsx'

const tile = (id, label = '', image = '') => ({ id, label, image })

describe('<DropBuilder>', () => {
  let container, root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove() })

  const render = (props = {}) => {
    const p = {
      options: [tile('d0', 'Superior'), tile('d1', 'Michigan'), tile('d2', 'Huron'), tile('d3', 'Erie')],
      correctId: null, total: 25,
      onChangeOptions: vi.fn(), onBatchChange: vi.fn(), onChangeTotal: vi.fn(), onMediaUpload: vi.fn(),
      ...props,
    }
    act(() => root.render(<DropBuilder {...p} />))
    return p
  }
  const radios = () => [...container.querySelectorAll('input[type="radio"]')]
  const totalInput = () => container.querySelector('input[aria-label="Points each team places"]')
  const type = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    act(() => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
  }

  it('letters count only tiles that have text or a photo, exactly like the phone and the TV', () => {
    // tiles: Superior, (blank), Huron, (blank)  ->  the phone and TV show A and B only
    render({ options: [tile('d0', 'Superior'), tile('d1'), tile('d2', 'Huron'), tile('d3')] })
    const labels = radios().map(r => r.getAttribute('aria-label'))
    expect(labels[0]).toBe('Tile A is correct')
    expect(labels[2]).toBe('Tile B is correct')   // third row, second USABLE tile
    expect(labels[1]).toMatch(/unused/i)
    expect(labels[3]).toMatch(/unused/i)
  })

  it('a photo-only tile counts as a tile and gets a letter', () => {
    render({ options: [tile('d0'), tile('d1', '', 'x.png'), tile('d2', 'Huron'), tile('d3')] })
    const labels = radios().map(r => r.getAttribute('aria-label'))
    expect(labels[1]).toBe('Tile A is correct')
    expect(labels[2]).toBe('Tile B is correct')
  })

  it('an unused tile cannot be picked as the correct one', () => {
    render({ options: [tile('d0', 'Superior'), tile('d1'), tile('d2'), tile('d3')] })
    expect(radios()[1].disabled).toBe(true)
    expect(radios()[0].disabled).toBe(false)
  })

  it('shows the same letter next to each tile that the TV and phone will show', () => {
    render({ options: [tile('d0', 'Superior'), tile('d1'), tile('d2', 'Huron'), tile('d3')] })
    const badges = [...container.querySelectorAll('[data-tile-letter]')].map(b => b.textContent)
    expect(badges).toEqual(['A', '–', 'B', '–'])
  })

  it('clearing the points box lets you retype instead of snapping back to the default', () => {
    const p = render({ total: 25 })
    type(totalInput(), '')
    expect(totalInput().value).toBe('')
    expect(p.onChangeTotal).not.toHaveBeenCalled()
    type(totalInput(), '3')
    expect(p.onChangeTotal).toHaveBeenLastCalledWith(3)
  })

  it('zero, negatives and junk are never sent; leaving the box empty restores the real value', () => {
    const p = render({ total: 20 })
    for (const bad of ['0', '-5', 'abc']) type(totalInput(), bad)
    expect(p.onChangeTotal).not.toHaveBeenCalled()
    type(totalInput(), '')
    act(() => { totalInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(totalInput().value).toBe('20')
  })

  it('keeps the box in step when the total changes from outside', () => {
    render({ total: 25 })
    act(() => root.render(<DropBuilder options={[tile('d0', 'A'), tile('d1', 'B'), tile('d2', 'C'), tile('d3', 'D')]} correctId={null} total={30} onChangeOptions={() => {}} onBatchChange={() => {}} onChangeTotal={() => {}} onMediaUpload={() => {}} />))
    expect(totalInput().value).toBe('30')
  })
})
