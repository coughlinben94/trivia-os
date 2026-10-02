// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useTeamIntroAudio, TEAM_INTRO_URL, TEAM_INTRO_START_S } from './useTeamIntroAudio.js'

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('../lib/youtubeWarmAudio.js', () => ({ warmYoutubeAudio: vi.fn(), claimYoutubeAudio: vi.fn() }))

// The team-intro theme: a ~16 min file started at 3:01, faded in with the reveal, faded out as the
// ring-world wipe lands, resumed mid-roll after a remount, loudness-corrected after a late analysis.
function fakeDirector() {
  const listeners = new Set()
  const d = {
    snap: { status: 'unlocked', blocked: [] },
    plays: [],
    warm: vi.fn(),
    retryBlocked: vi.fn(),
    play: vi.fn((clip, opts) => {
      const h = {
        state: 'playing', ended: [], failed: [],
        setLevel: vi.fn(), setGainDb: vi.fn(),
        stop: vi.fn(() => { h.state = 'stopped' }), release: vi.fn(() => { h.state = 'stopped' }),
        onEnded(cb) { h.ended.push(cb) }, onFailed(cb) { h.failed.push(cb) },
      }
      d.plays.push({ clip, opts, h })
      return h
    }),
    subscribe: cb => { listeners.add(cb); return () => listeners.delete(cb) },
    getSnapshot: () => d.snap,
    set(snap) { d.snap = snap; listeners.forEach(l => l()) },
  }
  return d
}

const OPTS = { startS: 181, holdMs: 5000, revealMs: 850, fadeInMs: 4000, startLeadMs: 200 }
let container, root, last
function Probe(props) { last = useTeamIntroAudio(props); return null }
const render = props => act(() => { root.render(<Probe {...OPTS} slideId="tp1" currentPart={0} settled={false} isPreview={false} getGainDb={() => new Promise(() => {})} {...props} />) })
const tick = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); vi.useRealTimers() })

describe('useTeamIntroAudio', () => {
  it('fresh entry: silent until the reveal, then plays from 3:01 at level 0 and fades in over 4s', async () => {
    const dir = fakeDirector()
    render({ dir })
    expect(dir.play).not.toHaveBeenCalled()
    await tick(649)
    expect(dir.play).not.toHaveBeenCalled() // revealMs (850) - lead (200) = 650
    await tick(2)
    expect(dir.play).toHaveBeenCalledTimes(1)
    const { clip, opts, h } = dir.plays[0]
    expect(clip).toMatchObject({ kind: 'file', url: TEAM_INTRO_URL, start: 181, loopTo: 181 })
    expect(opts).toMatchObject({ slideId: 'tp1', level: 0 })
    expect(h.setLevel).toHaveBeenCalledWith(1, 4000)
  })

  it('the loop re-seeks to 3:01, not 0:00 (loopTo is the mid-track start)', async () => {
    const dir = fakeDirector()
    render({ dir })
    await tick(700)
    expect(dir.plays[0].clip.loopTo).toBe(TEAM_INTRO_START_S)
  })

  it('a remount mid-roll resumes where the roll would be, at full level, with no fade', async () => {
    const dir = fakeDirector()
    render({ dir, currentPart: 3 })
    await tick(0)
    const { clip, opts, h } = dir.plays[0]
    expect(clip.start).toBe(181 + (3 * 5000) / 1000)
    expect(clip.loopTo).toBe(181)
    expect(opts.level).toBe(1)
    expect(h.setLevel).not.toHaveBeenCalled()
  })

  it('loudness analysis that resolves AFTER the clip started corrects the gain on the live handle', async () => {
    const dir = fakeDirector()
    let resolve
    render({ dir, getGainDb: () => new Promise(r => { resolve = r }) })
    await tick(700)
    resolve(-5)
    await tick(0)
    expect(dir.plays[0].h.setGainDb).toHaveBeenCalledWith(-5)
  })

  it('loudness analysis that resolved BEFORE the clip started is applied as soon as it starts', async () => {
    const dir = fakeDirector()
    render({ dir, getGainDb: () => Promise.resolve(-4) })
    await tick(700)
    expect(dir.plays[0].h.setGainDb).toHaveBeenCalledWith(-4)
  })

  it('never warms or plays in the host preview pane', async () => {
    const dir = fakeDirector()
    render({ dir, isPreview: true })
    await tick(5000)
    expect(dir.warm).not.toHaveBeenCalled()
    expect(dir.play).not.toHaveBeenCalled()
  })

  it('settling fades out over the wipe, then stops the clip', async () => {
    const dir = fakeDirector()
    render({ dir, currentPart: 2 })
    await tick(0)
    const h = dir.plays[0].h
    render({ dir, currentPart: 2, settled: true })
    expect(h.setLevel).toHaveBeenLastCalledWith(0, 850)
    expect(h.stop).not.toHaveBeenCalled()
    await tick(851)
    expect(h.stop).toHaveBeenCalledTimes(1)
  })

  it('backing out of settled mid-fade cancels the stop and snaps the level back up', async () => {
    const dir = fakeDirector()
    render({ dir, currentPart: 2 })
    await tick(0)
    const h = dir.plays[0].h
    render({ dir, currentPart: 2, settled: true })
    await tick(300)
    render({ dir, currentPart: 2, settled: false })
    expect(h.setLevel).toHaveBeenLastCalledWith(1)
    await tick(2000)
    expect(h.stop).not.toHaveBeenCalled()
  })

  it('the first render (settled false on mount) does NOT snap the level up over the fade-in', async () => {
    const dir = fakeDirector()
    render({ dir })
    await tick(700)
    const h = dir.plays[0].h
    expect(h.setLevel.mock.calls.every(c => c[0] !== 1 || c[1] === 4000)).toBe(true)
  })

  it('settling before the delayed start fires means the music never starts', async () => {
    const dir = fakeDirector()
    render({ dir })
    render({ dir, settled: true })
    await tick(2000)
    expect(dir.play).not.toHaveBeenCalled()
  })

  it('unmount before the start cancels it; unmount after releases the clip', async () => {
    const dir = fakeDirector()
    render({ dir })
    act(() => root.unmount())
    await tick(2000)
    expect(dir.play).not.toHaveBeenCalled()
    root = createRoot(container)
    const dir2 = fakeDirector()
    render({ dir: dir2, currentPart: 1 })
    await tick(0)
    act(() => root.unmount())
    expect(dir2.plays[0].h.release).toHaveBeenCalled()
    root = createRoot(container)
  })

  it('exposes the blocked cue state from the director', async () => {
    const dir = fakeDirector()
    render({ dir, currentPart: 1 })
    await tick(0)
    expect(last.blocked).toBe(false)
    act(() => { dir.set({ status: 'locked', blocked: [{ key: 'k', slideId: 'tp1', part: 0, kind: 'file', reason: 'not-allowed' }] }) })
    expect(last.blocked).toBe(true)
    act(() => { last.retry() })
    expect(dir.retryBlocked).toHaveBeenCalled()
  })
})
