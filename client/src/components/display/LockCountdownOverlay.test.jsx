// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../shared/ThemeProvider.jsx'
import LockCountdownOverlay, { countdownFrame } from './LockCountdownOverlay.jsx'

// The frame math is what keeps the two windows showing the SAME number: it is
// derived from the shared `startedAt` stamp, so /display picking a countdown up
// mid-flight (or re-rendering) must land on the same frame /host is on, not
// restart at 3. Boundary-off-by-one here reads on the TV as a countdown that
// skips a number or hangs on the lock.
describe('countdownFrame', () => {
  const t = 1_000_000

  it('holds each number for its full second, 3 -> 2 -> 1', () => {
    expect([0, 999, 1000, 1999, 2000, 2999].map(ms => countdownFrame(t, t + ms)))
      .toEqual([3, 3, 2, 2, 1, 1])
  })

  it('shows the lock from zero until the flash window is spent, then nothing', () => {
    expect(countdownFrame(t, t + 3000)).toBe('lock')
    expect(countdownFrame(t, t + 4199)).toBe('lock')
    expect(countdownFrame(t, t + 4200)).toBe(null)
  })

  it('clamps a startedAt in this window\'s future instead of blanking', () => {
    // The window that pressed Next stamps it off ITS clock; the other window's
    // may sit a little behind. Rendering nothing (or "4") for that gap would
    // make the ceremony look broken on exactly one of the two screens.
    expect(countdownFrame(t, t - 500)).toBe(3)
  })

  it('renders nothing when no countdown is running', () => {
    expect(countdownFrame(null, t)).toBe(null)
    expect(countdownFrame(undefined, t)).toBe(null)
  })
})

// The effect-driven half, which countdownFrame's pure asserts can't reach: the
// self-rescheduling timeout that walks the ceremony to zero, the once-only
// onComplete, and cleanup on an unmount partway through (the host advancing,
// or the lock write landing and clearing the countdown fields, both unmount
// this overlay mid-flight — a leaked timeout there would setState on a dead
// tree).
//
// jsdom + react-dom/client directly rather than Testing Library: this repo had
// no component tests and no DOM test deps at all, and RTL would only add
// query/cleanup sugar over the ~10 lines below. `jsdom` is the one devDep this
// needed. Swap in RTL if component tests become common here.
//
// KNOWN CEILING — read before adding asserts here: framer-motion's animation
// loop doesn't run under jsdom + fake timers, so an <AnimatePresence> child
// never finishes EXITING and its replacement never mounts. The big glyph lives
// inside one, so it is frozen at whatever it first mounted as for the life of
// the test; only things outside AnimatePresence (the label) visibly change.
// So the frames are asserted by MOUNTING at each offset — which is also the
// real /display case, a window picking a countdown up mid-flight — and the
// timer is asserted through the label plus onComplete. Asserting a glyph
// changing in place would silently pass on a frozen node. The in-place swap is
// verified in a real browser during Task 2's live trace.
describe('<LockCountdownOverlay>', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // jsdom ships neither, and ThemeProvider registers the theme's display
    // font on mount.
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  const render = props => act(() => {
    root.render(<ThemeProvider><LockCountdownOverlay {...props} /></ThemeProvider>)
  })

  it('renders the right frame for however far into the countdown it mounts', () => {
    // The real /display case this protects: the window that did NOT press Next
    // picks the countdown up over realtime, part-way through. Each of these is
    // a fresh mount at a different offset off the same shared stamp.
    for (const [elapsed, glyph] of [[0, '3'], [1200, '2'], [2400, '1'], [3100, '🔒']]) {
      act(() => root.unmount())
      root = createRoot(container)
      render({ startedAt: Date.now() - elapsed })
      expect(container.textContent).toContain(glyph)
    }
  })

  it('walks itself to zero on its own timer and fires onComplete exactly once', () => {
    const onComplete = vi.fn()
    const startedAt = Date.now()
    render({ startedAt, onComplete })
    expect(container.textContent).toContain('Locking answers')

    // Nothing may fire early — the lock+score is a scoring write, and a host
    // still watching 2 on the TV would see the room's answers cut short.
    act(() => vi.advanceTimersByTime(2999))
    expect(onComplete).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Locking answers')

    // Zero. The component had to reschedule its own timeout three times to get
    // here from a single mount — no external tick drives it.
    act(() => vi.advanceTimersByTime(1))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Answers locked')

    // Still inside the lock frame, a parent re-render must not re-fire it. A
    // mount site passing an inline arrow hands this a NEW callback identity
    // every render — and /display re-renders on every realtime message the
    // show receives — so the dep array cannot be what holds the line here.
    // The ref guard is.
    render({ startedAt, onComplete: () => onComplete() })
    render({ startedAt, onComplete: () => onComplete() })
    expect(onComplete).toHaveBeenCalledTimes(1)

    // And every later tick, including the flash window expiring, is silent.
    act(() => vi.advanceTimersByTime(10_000))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('renders nothing, and arms nothing, with no countdown running', () => {
    render({ startedAt: null })
    expect(container.textContent).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels its pending timer when unmounted mid-countdown', () => {
    render({ startedAt: Date.now() })
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    act(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
    // A leaked timer would setState on the unmounted tree here.
    act(() => vi.advanceTimersByTime(10_000))
    root = createRoot(container) // afterEach unmounts whatever `root` holds
  })
})
