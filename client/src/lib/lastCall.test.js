import { describe, it, expect } from 'vitest'
import {
  LAST_CALL_MS,
  nextLastCallNonce,
  withLastCall,
  lastCallStep,
  canTriggerLastCall,
} from './lastCall.js'

describe('nextLastCallNonce', () => {
  it('starts at 1 with no prior nonce', () => {
    expect(nextLastCallNonce(undefined)).toBe(1)
    expect(nextLastCallNonce(null)).toBe(1)
  })
  it('increments an integer nonce', () => {
    expect(nextLastCallNonce(41)).toBe(42)
  })
  it('treats garbage as no prior nonce', () => {
    expect(nextLastCallNonce('7')).toBe(1)
    expect(nextLastCallNonce(2.5)).toBe(1)
  })
})

describe('withLastCall', () => {
  it('keeps other special_event keys', () => {
    expect(withLastCall({ other: 'x', lastCall: 3 }, 4)).toEqual({ other: 'x', lastCall: 4 })
  })
  it('handles a null column', () => {
    expect(withLastCall(null, 1)).toEqual({ lastCall: 1 })
  })
  it('does not mutate its input', () => {
    const prev = { lastCall: 1 }
    withLastCall(prev, 2)
    expect(prev).toEqual({ lastCall: 1 })
  })
})

describe('lastCallStep', () => {
  it('seeds from the first row seen and never plays it (reload / late TV)', () => {
    expect(lastCallStep(null, 'show_a', 5)).toEqual({ play: false, seen: { showId: 'show_a', nonce: 5 } })
  })
  it('seeds with no nonce yet, then plays the first real one', () => {
    const first = lastCallStep(null, 'show_a', undefined)
    expect(first.play).toBe(false)
    expect(lastCallStep(first.seen, 'show_a', 1)).toEqual({ play: true, seen: { showId: 'show_a', nonce: 1 } })
  })
  it('plays when the nonce changes after mount', () => {
    expect(lastCallStep({ showId: 'show_a', nonce: 5 }, 'show_a', 6).play).toBe(true)
  })
  it('does not replay the same nonce (unrelated column updates re-deliver it)', () => {
    const seen = { showId: 'show_a', nonce: 6 }
    expect(lastCallStep(seen, 'show_a', 6)).toEqual({ play: false, seen })
  })
  it('ignores a missing nonce and keeps what it had seen', () => {
    const seen = { showId: 'show_a', nonce: 6 }
    expect(lastCallStep(seen, 'show_a', null)).toEqual({ play: false, seen })
    expect(lastCallStep(seen, 'show_a', undefined)).toEqual({ play: false, seen })
  })
  it('re-seeds without playing when the TV switches to another show', () => {
    expect(lastCallStep({ showId: 'show_a', nonce: 6 }, 'show_b', 9))
      .toEqual({ play: false, seen: { showId: 'show_b', nonce: 9 } })
  })
})

describe('canTriggerLastCall', () => {
  it('allows the first press', () => {
    expect(canTriggerLastCall(null, 1000)).toBe(true)
  })
  it('ignores a second press while the sign is still up', () => {
    expect(canTriggerLastCall(1000, 1000 + LAST_CALL_MS - 1)).toBe(false)
  })
  it('allows a press once the sign has gone', () => {
    expect(canTriggerLastCall(1000, 1000 + LAST_CALL_MS)).toBe(true)
  })
})
