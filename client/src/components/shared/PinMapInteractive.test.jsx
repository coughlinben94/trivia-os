// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import PinMapInteractive from './PinMapInteractive.jsx'

let host, root
beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

function mount(props) {
  act(() => root.render(<PinMapInteractive dropMode="hold" {...props} />))
  const surface = host.querySelector('[data-pin-surface]')
  // jsdom has no layout: give the surface a real size so px -> map units works
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 300, right: 500, bottom: 300 })
  return surface
}
function fire(el, type, x, y, id = 1, button = 0) {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button })
  Object.defineProperty(e, 'pointerId', { value: id })
  Object.defineProperty(e, 'pointerType', { value: 'mouse' })
  act(() => { el.dispatchEvent(e) })
}

describe('PinMapInteractive hold-to-drop', () => {
  it('a quick tap never drops a pin', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin })
    fire(s, 'pointerdown', 250, 150); act(() => { vi.advanceTimersByTime(100) }); fire(s, 'pointerup', 250, 150)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onPin).not.toHaveBeenCalled()
  })
  it('holding ~350ms then lifting commits exactly one valid pin', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin })
    fire(s, 'pointerdown', 250, 150); act(() => { vi.advanceTimersByTime(400) }); fire(s, 'pointerup', 250, 150)
    expect(onPin).toHaveBeenCalledTimes(1)
    const { lat, lon } = onPin.mock.calls[0][0]
    expect(Number.isFinite(lat) && Number.isFinite(lon)).toBe(true)
  })
  it('moving past the slop before 350ms cancels the drop (it becomes a pan)', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin })
    fire(s, 'pointerdown', 250, 150); fire(s, 'pointermove', 290, 150); act(() => { vi.advanceTimersByTime(600) }); fire(s, 'pointerup', 290, 150)
    expect(onPin).not.toHaveBeenCalled()
  })
  it('a second finger cancels a pending drop (pinch)', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin })
    fire(s, 'pointerdown', 250, 150, 1); fire(s, 'pointerdown', 300, 150, 2)
    act(() => { vi.advanceTimersByTime(600) }); fire(s, 'pointerup', 250, 150, 1); fire(s, 'pointerup', 300, 150, 2)
    expect(onPin).not.toHaveBeenCalled()
  })
  it('ignores everything when disabled', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin, disabled: true })
    fire(s, 'pointerdown', 250, 150); act(() => { vi.advanceTimersByTime(600) }); fire(s, 'pointerup', 250, 150)
    expect(onPin).not.toHaveBeenCalled()
  })
  it('pointercancel after a hold does not commit', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin })
    fire(s, 'pointerdown', 250, 150); act(() => { vi.advanceTimersByTime(400) }); fire(s, 'pointercancel', 250, 150)
    fire(s, 'pointerup', 250, 150)
    expect(onPin).not.toHaveBeenCalled()
  })
  it('hold, second finger lands, lift both: no commit', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin })
    fire(s, 'pointerdown', 250, 150, 1); act(() => { vi.advanceTimersByTime(400) })
    fire(s, 'pointerdown', 300, 150, 2)
    fire(s, 'pointerup', 300, 150, 2); fire(s, 'pointerup', 250, 150, 1)
    expect(onPin).not.toHaveBeenCalled()
  })
  it('a lost pointer capture ends the gesture without committing', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin })
    fire(s, 'pointerdown', 250, 150); act(() => { vi.advanceTimersByTime(400) }); fire(s, 'lostpointercapture', 250, 150)
    fire(s, 'pointerup', 250, 150)
    expect(onPin).not.toHaveBeenCalled()
  })
  it('the pin lands ~48px above the finger', () => {
    const held = vi.fn(), clicked = vi.fn()
    let s = mount({ pin: null, onPin: held })
    fire(s, 'pointerdown', 250, 150); act(() => { vi.advanceTimersByTime(400) }); fire(s, 'pointerup', 250, 150)
    act(() => root.unmount()); root = createRoot(host)
    s = mount({ pin: null, onPin: clicked, dropMode: 'click' })
    fire(s, 'pointerdown', 250, 150); fire(s, 'pointerup', 250, 150)
    expect(held.mock.calls[0][0].lat).toBeGreaterThan(clicked.mock.calls[0][0].lat)
    // lift of 48px on a 500px-wide surface == a click 48px higher
    const exp = vi.fn()
    act(() => root.unmount()); root = createRoot(host)
    s = mount({ pin: null, onPin: exp, dropMode: 'click' })
    fire(s, 'pointerdown', 250, 102); fire(s, 'pointerup', 250, 102)
    expect(held.mock.calls[0][0]).toEqual(exp.mock.calls[0][0])
  })
  it('disabled flipping true mid-hold: pointerup does not commit', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin })
    fire(s, 'pointerdown', 250, 150); act(() => { vi.advanceTimersByTime(400) })
    act(() => root.render(<PinMapInteractive dropMode="hold" pin={null} onPin={onPin} disabled />))
    fire(s, 'pointerup', 250, 150)
    expect(onPin).not.toHaveBeenCalled()
  })
  it('an out-of-bounds hold-release calls onPin zero times and dims the preview', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin })
    fire(s, 'pointerdown', 2, 60); act(() => { vi.advanceTimersByTime(400) })
    expect(s.querySelector('[data-pin-preview]').getAttribute('opacity')).toBe('0.3')
    fire(s, 'pointerup', 2, 60)
    expect(onPin).not.toHaveBeenCalled()
  })
  it('an in-bounds hold preview is not dimmed', () => {
    const s = mount({ pin: null, onPin: vi.fn() })
    fire(s, 'pointerdown', 250, 150); act(() => { vi.advanceTimersByTime(400) })
    expect(s.querySelector('[data-pin-preview]').getAttribute('opacity')).toBe('1')
  })
  it('a pointerup right after a move commits even before any re-render (no lost commit)', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin })
    fire(s, 'pointerdown', 250, 150); act(() => { vi.advanceTimersByTime(400) })
    const mv = new MouseEvent('pointermove', { bubbles: true, clientX: 260, clientY: 150 }); Object.defineProperty(mv, 'pointerId', { value: 1 })
    const up = new MouseEvent('pointerup', { bubbles: true, clientX: 260, clientY: 150 }); Object.defineProperty(up, 'pointerId', { value: 1 })
    act(() => { s.dispatchEvent(mv); s.dispatchEvent(up) })
    expect(onPin).toHaveBeenCalledTimes(1)
  })
})

describe('PinMapInteractive click mode (host picker)', () => {
  it('a plain click commits a pin at the click point', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin, dropMode: 'click' })
    fire(s, 'pointerdown', 250, 150); fire(s, 'pointerup', 250, 150)
    expect(onPin).toHaveBeenCalledTimes(1)
  })
  it('a click-mode pan (move past slop) does not commit', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin, dropMode: 'click' })
    fire(s, 'pointerdown', 250, 150); fire(s, 'pointermove', 290, 150); fire(s, 'pointerup', 290, 150)
    expect(onPin).not.toHaveBeenCalled()
  })
  it('a non-primary mouse button never commits', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin, dropMode: 'click' })
    fire(s, 'pointerdown', 250, 150, 1, 2); fire(s, 'pointerup', 250, 150, 1, 2)
    expect(onPin).not.toHaveBeenCalled()
  })

  it('zoom buttons live OUTSIDE the gesture surface so a hold on the map is never eaten by one', () => {
    mount({ pin: null })
    const surface = host.querySelector('[data-pin-surface]')
    const btns = host.querySelectorAll('button[aria-label^="Zoom"]')
    expect(btns.length).toBe(2)
    btns.forEach(b => expect(surface.contains(b)).toBe(false))
  })
  it('zoom buttons still zoom and stop pointerdown from reaching the surface', () => {
    const s = mount({ pin: null })
    const before = s.querySelector('svg > g').getAttribute('transform')
    act(() => host.querySelector('button[aria-label="Zoom in"]').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(s.querySelector('svg > g').getAttribute('transform')).not.toBe(before)
  })
  it('a touch pointerdown on the surface does not reach an ancestor (carousel swipe) handler; a mouse one does', () => {
    const s = mount({ pin: null })
    const ancestor = vi.fn()
    host.addEventListener('pointerdown', ancestor)
    const down = type => { const e = new MouseEvent('pointerdown', { bubbles: true, clientX: 250, clientY: 150 }); Object.defineProperty(e, 'pointerId', { value: 7 }); Object.defineProperty(e, 'pointerType', { value: type }); act(() => { s.dispatchEvent(e) }) }
    down('touch')
    expect(ancestor).not.toHaveBeenCalled()
    fire(s, 'pointerup', 250, 150, 7)
    down('mouse')
    expect(ancestor).toHaveBeenCalledTimes(1)
  })
  it('touch hold-to-drop still works with the ancestor shield (hold, lift, one commit)', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin })
    const t = (type, x, y) => { const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }); Object.defineProperty(e, 'pointerId', { value: 3 }); Object.defineProperty(e, 'pointerType', { value: 'touch' }); act(() => { s.dispatchEvent(e) }) }
    t('pointerdown', 250, 150); act(() => { vi.advanceTimersByTime(400) }); t('pointerup', 250, 150)
    expect(onPin).toHaveBeenCalledTimes(1)
  })
})

describe('PinMapInteractive pin size', () => {
  it('pin is ~52px on screen: scale = size/k, size ~5.54 at 335px wide, tip on the point', () => {
    const orig = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 335, height: 200, right: 335, bottom: 200 })
    try {
      act(() => root.render(<PinMapInteractive pin={{ lat: 41, lon: -87 }} />))
      const t = host.querySelector('[data-pin-preview] g').getAttribute('transform')
      const m = t.match(/^translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)$/)
      expect(m).not.toBeNull()
      expect(parseFloat(m[3])).toBeCloseTo(5.54, 1) // k = 1
      // on-screen height = scale * 28 units * (335 / MAP_W) ~ 40px
      expect(parseFloat(m[3]) * 28 * 0.335).toBeCloseTo(52, 0)
      expect(host.querySelector('[data-pin-preview] [data-pin-halo]')).not.toBeNull()
      // zoom in: k grows, scale shrinks by k, so on-screen size (scale * k) is unchanged
      act(() => { host.querySelector('button[aria-label="Zoom in"]').click() })
      const m2 = host.querySelector('[data-pin-preview] g').getAttribute('transform').match(/scale\(([-\d.]+)\)/)
      expect(parseFloat(m2[1])).toBeCloseTo(5.54 / 1.6, 1)
    } finally { Element.prototype.getBoundingClientRect = orig }
  })
})
