import { describe, it, expect } from 'vitest'
import { countdownFrame } from './LockCountdownOverlay.jsx'

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
