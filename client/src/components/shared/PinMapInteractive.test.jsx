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
function fire(el, type, x, y, id = 1) {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperty(e, 'pointerId', { value: id })
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
})

describe('PinMapInteractive click mode (host picker)', () => {
  it('a plain click commits a pin at the click point', () => {
    const onPin = vi.fn()
    const s = mount({ pin: null, onPin, dropMode: 'click' })
    fire(s, 'pointerdown', 250, 150); fire(s, 'pointerup', 250, 150)
    expect(onPin).toHaveBeenCalledTimes(1)
  })
})
