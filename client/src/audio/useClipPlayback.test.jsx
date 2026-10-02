// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useClipPlayback } from './useClipPlayback.js'

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('../lib/youtubeWarmAudio.js', () => ({ warmYoutubeAudio: vi.fn(), claimYoutubeAudio: vi.fn() }))

// A hand-rolled director: records calls, lets the test move the snapshot.
function fakeDirector() {
  const listeners = new Set()
  const d = {
    snap: { status: 'unlocked', blocked: [], playing: [] },
    handles: [],
    warm: vi.fn(),
    retryBlocked: vi.fn(),
    play: vi.fn((clip, { slideId }) => {
      const h = { key: slideId, state: 'pending', ended: [], failed: [], stop: vi.fn(() => { h.state = 'stopped' }), release: vi.fn(() => { h.state = 'stopped' }), onEnded(cb) { h.ended.push(cb) }, onFailed(cb) { h.failed.push(cb) } }
      d.handles.push(h)
      return h
    }),
    subscribe: cb => { listeners.add(cb); return () => listeners.delete(cb) },
    getSnapshot: () => d.snap,
    set(snap) { d.snap = snap; listeners.forEach(l => l()) },
  }
  return d
}

let container, root, last
function Probe({ dir, clip, slideId = 's', autoPlay, isPreview }) {
  last = useClipPlayback(clip, { slideId, autoPlay, isPreview, dir })
  return null
}
const render = props => act(() => { root.render(<Probe {...props} />) })
const clipA = { kind: 'file', url: '/a.mp3', part: 0 }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()) })

describe('useClipPlayback', () => {
  it('warms the clip at mount, but not in preview', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    expect(dir.warm).toHaveBeenCalledWith(clipA)
    const dir2 = fakeDirector()
    act(() => root.unmount()); root = createRoot(container)
    render({ dir: dir2, clip: clipA, isPreview: true })
    expect(dir2.warm).not.toHaveBeenCalled()
  })

  it('play() starts the clip under this slide id and marks it active; toggle() stops it', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    act(() => { last.play() })
    expect(dir.play).toHaveBeenCalledWith(clipA, { slideId: 's' })
    expect(last.active).toBe(true)
    dir.handles[0].state = 'playing'
    act(() => { last.toggle() })
    expect(dir.handles[0].stop).toHaveBeenCalled()
    expect(last.active).toBe(false)
  })

  it('a natural end clears active', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    act(() => { last.play() })
    act(() => { dir.handles[0].ended.forEach(cb => cb()) })
    expect(last.active).toBe(false)
  })

  it('autoPlay plays once on mount; never in preview', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA, autoPlay: true })
    expect(dir.play).toHaveBeenCalledTimes(1)
    const dir2 = fakeDirector()
    act(() => root.unmount()); root = createRoot(container)
    render({ dir: dir2, clip: clipA, autoPlay: true, isPreview: true })
    expect(dir2.play).not.toHaveBeenCalled()
  })

  it('a fresh clip object with the same values does not restart or release anything', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    act(() => { last.play() })
    render({ dir, clip: { ...clipA } })
    expect(dir.handles[0].release).not.toHaveBeenCalled()
    expect(last.active).toBe(true)
  })

  it('a clip that fails to load clears active (no pause icon over a dead clip)', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    act(() => { last.play() })
    act(() => { dir.handles[0].state = 'failed'; dir.handles[0].failed.forEach(cb => cb()) })
    expect(last.active).toBe(false)
    act(() => { last.toggle() }) // a press tries again
    expect(dir.play).toHaveBeenCalledTimes(2)
  })

  it('a different clip (next series part) releases the old handle and resets active', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    act(() => { last.play() })
    render({ dir, clip: { ...clipA, part: 1, url: '/b.mp3' } })
    expect(dir.handles[0].release).toHaveBeenCalled()
    expect(last.active).toBe(false)
  })

  it('the same file at a different part is a different clip', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    act(() => { last.play() })
    render({ dir, clip: { ...clipA, part: 1 } })
    expect(dir.handles[0].release).toHaveBeenCalled()
  })

  it('a gain or volume edit is a different clip (it takes effect without a remount)', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    act(() => { last.play() })
    render({ dir, clip: { ...clipA, gainDb: 6 } })
    expect(dir.handles[0].release).toHaveBeenCalled()
    const dir2 = fakeDirector()
    act(() => root.unmount()); root = createRoot(container)
    const yt = { kind: 'youtube', videoId: 'v', start: 0, end: null, volume: 100, part: 0 }
    render({ dir: dir2, clip: yt })
    act(() => { last.play() })
    render({ dir: dir2, clip: { ...yt, volume: 60 } })
    expect(dir2.handles[0].release).toHaveBeenCalled()
  })

  it('unmounting releases the handle', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    act(() => { last.play() })
    act(() => root.unmount()); root = createRoot(container)
    expect(dir.handles[0].release).toHaveBeenCalled()
  })

  it('blocked comes from the director snapshot, only for this slide + part, only while active', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    act(() => { dir.set({ ...dir.snap, blocked: [{ key: 'k', slideId: 's', part: 0, kind: 'file', reason: 'x' }] }) })
    expect(last.blocked).toBe(false) // nothing asked to play yet
    act(() => { last.play() })
    expect(last.blocked).toBe(true)
    act(() => { dir.set({ ...dir.snap, blocked: [{ key: 'k', slideId: 'other', part: 0, kind: 'file', reason: 'x' }] }) })
    expect(last.blocked).toBe(false)
    act(() => { dir.set({ ...dir.snap, blocked: [{ key: 'k', slideId: 's', part: 1, kind: 'file', reason: 'x' }] }) })
    expect(last.blocked).toBe(false)
  })

  it('pressing the button on a clip that was asked but not yet sounding retries it (never stops it)', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    act(() => { last.play() })
    dir.handles[0].state = 'blocked'
    act(() => { last.toggle() })
    expect(dir.handles[0].stop).not.toHaveBeenCalled()
    expect(dir.retryBlocked).toHaveBeenCalled()
    dir.handles[0].state = 'playing'
    act(() => { last.toggle() })
    expect(dir.handles[0].stop).toHaveBeenCalled()
  })

  it('retry() asks the director to retry blocked clips', () => {
    const dir = fakeDirector()
    render({ dir, clip: clipA })
    act(() => { last.retry() })
    expect(dir.retryBlocked).toHaveBeenCalled()
  })


  it('a clip that throws in play() is swallowed (the show keeps running)', () => {
    const dir = fakeDirector()
    dir.play = vi.fn(() => { throw new Error('bad clip') })
    render({ dir, clip: clipA })
    expect(() => act(() => { last.play() })).not.toThrow()
    expect(last.active).toBe(false)
  })

  it('no clip: play() does nothing', () => {
    const dir = fakeDirector()
    render({ dir, clip: null })
    act(() => { last.play() })
    expect(dir.play).not.toHaveBeenCalled()
  })
})
