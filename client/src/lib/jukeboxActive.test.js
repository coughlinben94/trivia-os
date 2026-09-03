import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setJukeboxActive, isJukeboxActive, onceJukeboxInactive } from './jukeboxActive.js'

describe('jukeboxActive', () => {
  beforeEach(() => setJukeboxActive(false))

  it('tracks active state', () => {
    expect(isJukeboxActive()).toBe(false)
    setJukeboxActive(true)
    expect(isJukeboxActive()).toBe(true)
    setJukeboxActive(false)
    expect(isJukeboxActive()).toBe(false)
  })

  it('fires the callback immediately when already inactive', () => {
    const cb = vi.fn()
    onceJukeboxInactive(cb)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('defers the callback until jukebox goes inactive', () => {
    setJukeboxActive(true)
    const cb = vi.fn()
    onceJukeboxInactive(cb)
    expect(cb).not.toHaveBeenCalled()
    setJukeboxActive(false)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('only fires the most recently registered pending callback', () => {
    setJukeboxActive(true)
    const first = vi.fn()
    const second = vi.fn()
    onceJukeboxInactive(first)
    onceJukeboxInactive(second)
    setJukeboxActive(false)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
