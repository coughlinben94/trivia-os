// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/supabase.js', () => ({ supabase: {} }))
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('../../../lib/youtubeWarmAudio.js', () => ({ warmYoutubeAudio: vi.fn(), claimYoutubeAudio: vi.fn() }))

import { playDrumRoll } from './WinnerRevealSlide.jsx'
import { director } from '../../../audio/director.js'

// The drum roll drives the whole reveal: "ended" must reveal, and a clip that is refused,
// dead or stalled must STILL reveal (three TVs on "And the winner is..." forever is the
// failure this guards).
const el = () => document.querySelector('audio')

beforeEach(() => {
  vi.useFakeTimers()
  director._internals.reset()
  HTMLMediaElement.prototype.play = vi.fn(function () { Object.defineProperty(this, 'paused', { value: false, configurable: true }); return Promise.resolve() })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 4, configurable: true })
})
afterEach(() => {
  director._internals.reset()
  vi.useRealTimers()
})

describe('playDrumRoll', () => {
  it('plays /drum-roll.mp3 and reveals once when it really ends', async () => {
    const reveal = vi.fn()
    playDrumRoll(reveal, false, 's')
    await vi.advanceTimersByTimeAsync(0)
    expect(el().getAttribute('src')).toBe('/drum-roll.mp3')
    expect(reveal).not.toHaveBeenCalled()
    el().dispatchEvent(new Event('ended'))
    expect(reveal).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20000) // the stall timer must not reveal a second time
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('a refused play (autoplay block) still reveals 2s later', async () => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))
    const reveal = vi.fn()
    playDrumRoll(reveal, false, 's')
    await vi.advanceTimersByTimeAsync(0)
    expect(reveal).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('refused, retried by a click, refused again: still exactly one reveal', async () => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))
    const reveal = vi.fn()
    playDrumRoll(reveal, false, 's')
    await vi.advanceTimersByTimeAsync(500)
    director.retryBlocked() // a click lands while the reveal timer is pending
    await vi.advanceTimersByTimeAsync(5000)
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('a dead file (play rejects NotSupportedError, or an error event) reveals 2s later', async () => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.reject(new DOMException('no', 'NotSupportedError')))
    const reveal = vi.fn()
    playDrumRoll(reveal, false, 's')
    await vi.advanceTimersByTimeAsync(2100)
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('a stalled load (play never settles, nothing sounds) is blocked by the 2s check and reveals 2s after that', async () => {
    HTMLMediaElement.prototype.play = vi.fn(() => new Promise(() => {}))
    const reveal = vi.fn()
    playDrumRoll(reveal, false, 's')
    await vi.advanceTimersByTimeAsync(3900)
    expect(reveal).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('a roll that sounds but never reports its end still reveals at the 8s hard fallback', async () => {
    const reveal = vi.fn()
    playDrumRoll(reveal, false, 's')
    await vi.advanceTimersByTimeAsync(7900)
    expect(reveal).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('reduced motion skips the sound and reveals after 1.2s', async () => {
    const reveal = vi.fn()
    expect(playDrumRoll(reveal, true, 's')).toBeNull()
    expect(el()).toBeNull()
    await vi.advanceTimersByTimeAsync(1200)
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('a roll that was refused and revealed never starts sounding later over the reveal', async () => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))
    const reveal = vi.fn()
    playDrumRoll(reveal, false, 's')
    await vi.advanceTimersByTimeAsync(2100)
    expect(reveal).toHaveBeenCalledTimes(1)
    expect(el()).toBeNull() // released: a later click cannot bring the roll back
  })

  it('the returned handle can be released (leaving the slide cuts the roll)', async () => {
    const h = playDrumRoll(vi.fn(), false, 's')
    await vi.advanceTimersByTimeAsync(0)
    h.release()
    expect(el()).toBeNull()
  })
})
