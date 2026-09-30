// Characterization of the two Jukebox.jsx key handlers (Space, b), pinned
// before their bodies moved into these shared functions. The keyboard and
// the iPad (through the /display relay peer) both call them, so each guard
// below is one the keys already had.
import { describe, it, expect, vi } from 'vitest'
import { togglePlay, exitToShow, libraryCoverUp } from './jukeboxControls.js'

const play = over => ({
  modalTrack: null, libHandoffPending: false, isPlaying: false, liveEnding: false,
  handleStop: vi.fn(), startShuffle: vi.fn(), ...over,
})

describe('togglePlay (Space)', () => {
  it('playing: stops', () => {
    const s = play({ isPlaying: true })
    expect(togglePlay(s)).toBe('stop')
    expect(s.handleStop).toHaveBeenCalledOnce()
    expect(s.startShuffle).not.toHaveBeenCalled()
  })
  it('stopped: shuffles', () => {
    const s = play()
    expect(togglePlay(s)).toBe('shuffle')
    expect(s.startShuffle).toHaveBeenCalledOnce()
  })
  it('a song modal open: does nothing (and the key is not claimed)', () => {
    const s = play({ modalTrack: { id: 't' }, isPlaying: true })
    expect(togglePlay(s)).toBe('modal')
    expect(s.handleStop).not.toHaveBeenCalled()
  })
  it('grading-break handoff in flight: does nothing', () => {
    const s = play({ libHandoffPending: true, isPlaying: true })
    expect(togglePlay(s)).toBe('handoff')
    expect(s.handleStop).not.toHaveBeenCalled()
    expect(s.startShuffle).not.toHaveBeenCalled()
  })
  it('LiveScreen animating out (liveEnding) while stopped: ignores play, still claims the key', () => {
    const s = play({ liveEnding: true })
    expect(togglePlay(s)).toBe('ending')
    expect(s.startShuffle).not.toHaveBeenCalled()
  })
})

const exit = over => ({
  modalTrack: null, firedRef: { current: false }, isPlaying: false, showLive: false,
  setLibHandoffPending: vi.fn(), handleStop: vi.fn(), wait: vi.fn(() => Promise.resolve()),
  flushPendingWrite: vi.fn(() => Promise.resolve()), onExitToShow: vi.fn(), ...over,
})

describe('exitToShow (b, Back to Trivia)', () => {
  it('playing: covers the library, stops with the exit animation, waits it out, flushes, then hands back', async () => {
    const order = []
    const s = exit({
      isPlaying: true,
      setLibHandoffPending: vi.fn(v => order.push(`cover:${v}`)),
      handleStop: vi.fn(() => order.push('stop')),
      wait: vi.fn(async () => order.push('wait')),
      flushPendingWrite: vi.fn(async () => order.push('flush')),
      onExitToShow: vi.fn(() => order.push('exit')),
    })
    const r = exitToShow(s)
    expect(r.result).toBe('started')
    await r.done
    expect(order).toEqual(['cover:true', 'stop', 'wait', 'flush', 'exit'])
  })
  it('LiveScreen up but not playing: same stop path', async () => {
    const s = exit({ showLive: true })
    await exitToShow(s).done
    expect(s.handleStop).toHaveBeenCalledOnce()
    expect(s.wait).toHaveBeenCalledOnce()
  })
  it('nothing playing: no stop, no wait, just flush then hand back', async () => {
    const s = exit()
    await exitToShow(s).done
    expect(s.handleStop).not.toHaveBeenCalled()
    expect(s.wait).not.toHaveBeenCalled()
    expect(s.flushPendingWrite).toHaveBeenCalledOnce()
    expect(s.onExitToShow).toHaveBeenCalledOnce()
  })
  it('a second press (Stream Deck bounce or iPad after keyboard) is dropped by the fired guard', async () => {
    const s = exit({ isPlaying: true })
    await exitToShow(s).done
    expect(exitToShow(s).result).toBe('already')
    expect(s.onExitToShow).toHaveBeenCalledOnce()
    expect(s.handleStop).toHaveBeenCalledOnce()
  })
  it('a song modal open: does nothing and does not arm the guard', () => {
    const s = exit({ modalTrack: { id: 't' } })
    expect(exitToShow(s).result).toBe('modal')
    expect(s.firedRef.current).toBe(false)
  })
  it('no onExitToShow (the /music page): does nothing', () => {
    const s = exit({ onExitToShow: null })
    expect(exitToShow(s).result).toBe('no-exit')
    expect(s.firedRef.current).toBe(false)
  })
})

// Ben, 2026-09-30: after going back to the show from a grading break, the
// jukebox LIBRARY showed on the TV for a few seconds. "I never want it to be
// visible at all." On the TV break overlay (ringMode) the library grid must
// never paint, whatever the handoff state is.
describe('libraryCoverUp', () => {
  it('covers the library on the TV break overlay even after the handoff resolved', () => {
    expect(libraryCoverUp({ ringMode: true, libHandoffPending: false, showLive: false })).toBe(true)
  })
  it('covers the library on the TV overlay while the handoff is pending', () => {
    expect(libraryCoverUp({ ringMode: true, libHandoffPending: true, showLive: false })).toBe(true)
  })
  it('does not cover once the live screen is up (it draws its own backdrop)', () => {
    expect(libraryCoverUp({ ringMode: true, libHandoffPending: true, showLive: true })).toBe(false)
  })
  it('keeps the standalone /music page unchanged: library visible unless a handoff is pending', () => {
    expect(libraryCoverUp({ ringMode: false, libHandoffPending: false, showLive: false })).toBe(false)
    expect(libraryCoverUp({ ringMode: false, libHandoffPending: true, showLive: false })).toBe(true)
    expect(libraryCoverUp({ ringMode: false, libHandoffPending: true, showLive: true })).toBe(false)
  })
})
