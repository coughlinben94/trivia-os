import { describe, it, expect } from 'vitest'
import { createStationCamera } from './stationCamera.js'

// Fake renderer with a manual clock: walks finish when the test calls tick(ms).
function rig(queuePolicy, { syncWalk = false } = {}) {
  let now = 0
  const timers = new Set()
  const log = []
  const at = (ms, fn) => { const t = { due: now + ms, fn }; timers.add(t); return () => timers.delete(t) }
  const renderer = {
    startWalk(from, to, dir, done) { log.push(`walk ${from}>${to}`); if (syncWalk) { done(); return } return at(100, done) },
    snap(from, to) { log.push(`snap ${from}>${to}`) },
    cut(from, to, done) { log.push(`cut ${from}>${to}`); return at(40, done) },
  }
  const cam = createStationCamera({ panes: 13, renderer, queuePolicy })
  const tick = (ms) => {
    const end = now + ms
    for (;;) {
      const next = [...timers].filter(t => t.due <= end).sort((a, b) => a.due - b.due)[0]
      if (!next) break
      now = next.due; timers.delete(next); next.fn()
    }
    now = end
  }
  return { cam, tick, log, timers }
}

describe('stationCamera drain policy (space)', () => {
  it('idle turn walks at once; busy turns queue and drain one per walk, in order', () => {
    const { cam, tick, log } = rig('drain')
    cam.turn(); cam.turn(); cam.turn(); cam.turn(-1)
    expect(cam.station).toBe(1)
    tick(100); expect(cam.station).toBe(2)
    tick(100); expect(cam.station).toBe(3)
    tick(100); expect(cam.station).toBe(2)
    expect(log).toEqual(['walk 0>1', 'walk 1>2', 'walk 2>3', 'walk 3>2'])
  })
  it('wraps both ways', () => {
    const { cam, tick } = rig('drain')
    cam.jumpTo(12); cam.turn(); expect(cam.station).toBe(0)
    tick(100); cam.turn(-1); expect(cam.station).toBe(12)
  })
  it('jumpTo cancels the walk and drops the queue; its stale completion never fires', () => {
    const { cam, tick, timers } = rig('drain')
    cam.turn(); cam.turn(); cam.turn()
    cam.jumpTo(7)
    expect(timers.size).toBe(0)
    tick(1000)
    expect(cam.station).toBe(7)
    expect(cam.busy).toBe(false)
  })
  it('a cancelled walk cannot release the next walk early (token)', () => {
    // Renderer that ignores cancel(): the controller must still drop the stale done().
    let stale
    const renderer = { startWalk(f, t, d, done) { stale ??= done; return undefined }, snap() {} }
    const cam = createStationCamera({ panes: 13, renderer })
    cam.turn(); const first = stale
    cam.jumpTo(5); stale = undefined
    cam.turn() // walk B running
    first() // A's late completion
    expect(cam.busy).toBe(true)
    cam.turn(); expect(cam.station).toBe(6) // queued behind B, not applied yet
    stale()
    expect(cam.station).toBe(7) // B finished, queued turn drained
  })
  it('synchronous completion (reduced motion) drains the queue in the same call', () => {
    const { cam, log } = rig('drain', { syncWalk: true })
    cam.turn(); cam.turn(); cam.turn()
    expect(cam.station).toBe(3)
    expect(log).toEqual(['walk 0>1', 'walk 1>2', 'walk 2>3'])
    expect(cam.busy).toBe(false)
  })
  it('jumpTo normalizes out-of-range and snaps from the current station', () => {
    const { cam, log } = rig('drain')
    cam.jumpTo(15); cam.jumpTo(-1)
    expect(cam.station).toBe(12)
    expect(log).toEqual(['snap 0>2', 'snap 2>12'])
  })
  it('dispose cancels the walk without moving', () => {
    const { cam, tick, timers } = rig('drain')
    cam.turn(); cam.dispose()
    expect(timers.size).toBe(0); tick(500)
    expect(cam.station).toBe(1)
  })
})

describe('stationCamera retarget policy (forest)', () => {
  it('turn during a walk cancels it and cuts to the latest station; nothing queues', () => {
    const { cam, tick, log, timers } = rig('retarget')
    cam.turn(); expect(log).toEqual(['walk 0>1'])
    tick(30); cam.turn()
    expect(log).toEqual(['walk 0>1', 'cut 1>2'])
    expect(timers.size).toBe(1) // the walk's timer was cancelled
    tick(39); cam.turn(); cam.turn() // two more while the cut runs: each retargets
    expect(log.slice(2)).toEqual(['cut 2>3', 'cut 3>4'])
    expect(cam.station).toBe(4)
    tick(40); expect(cam.busy).toBe(false)
    expect(cam.station).toBe(4)
  })
  it('reversal retargets the other way', () => {
    const { cam, log } = rig('retarget')
    cam.turn(); cam.turn(-1)
    expect(log).toEqual(['walk 0>1', 'cut 1>0'])
    expect(cam.station).toBe(0)
  })
  it('jumpTo during a cut cancels it', () => {
    const { cam, tick, timers } = rig('retarget')
    cam.turn(); cam.turn(); cam.jumpTo(9)
    expect(timers.size).toBe(0); tick(500)
    expect(cam.station).toBe(9); expect(cam.busy).toBe(false)
  })
  it('requires renderer.cut', () => {
    expect(() => createStationCamera({ panes: 13, queuePolicy: 'retarget', renderer: { startWalk() {}, snap() {} } })).toThrow(/cut/)
  })
})
