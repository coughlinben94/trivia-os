import { describe, it, expect } from 'vitest'
import { ringVisibleStationIndex, ringNavAction } from './ringStationIndex.js'

const visible = () => true
const hidden = () => false

describe('ringVisibleStationIndex', () => {
  it('counts one station per slide when every slide is visible', () => {
    const slides = [{}, {}, {}, {}]
    expect(ringVisibleStationIndex(slides, 3, visible)).toBe(3)
  })

  it('stays flat across a run of hidden slides', () => {
    // visible, hidden, hidden, visible
    const isVisible = i => i % 3 === 0
    const slides = [0, 1, 2, 3].map(i => ({ i }))
    expect(ringVisibleStationIndex(slides, 0, s => isVisible(s.i))).toBe(0)
    expect(ringVisibleStationIndex(slides, 1, s => isVisible(s.i))).toBe(0)
    expect(ringVisibleStationIndex(slides, 2, s => isVisible(s.i))).toBe(0)
    expect(ringVisibleStationIndex(slides, 3, s => isVisible(s.i))).toBe(1)
  })

  it('returns -1 before the first visible slide is reached', () => {
    const slides = [{}, {}, {}]
    expect(ringVisibleStationIndex(slides, 1, hidden)).toBe(-1)
  })
})

describe('ringNavAction (2026-08-24: both single-step directions glide)', () => {
  it('one step forward turns', () => {
    expect(ringNavAction(4, 5)).toBe('turn')
  })

  it('one step backward turns back — the Prev that used to snap', () => {
    expect(ringNavAction(5, 4)).toBe('turn-back')
  })

  it('back and forth across one boundary glides both ways', () => {
    expect(ringNavAction(7, 8)).toBe('turn')
    expect(ringNavAction(8, 7)).toBe('turn-back')
  })

  it('multi-station moves jump, either direction', () => {
    expect(ringNavAction(2, 5)).toBe('jump')
    expect(ringNavAction(5, 2)).toBe('jump')
  })

  it('first real index (Go Live resuming mid-show) jumps to align', () => {
    expect(ringNavAction(null, 6)).toBe('jump')
    expect(ringNavAction(undefined, 0)).toBe('jump')
  })

  it('no movement / no index does nothing', () => {
    expect(ringNavAction(3, 3)).toBe('none')
    expect(ringNavAction(3, null)).toBe('none')
    expect(ringNavAction(3, undefined)).toBe('none')
  })

  it('the pre-first-visible sentinel (-1) still steps like any index', () => {
    // ringVisibleStationIndex returns -1 before any ring-visible slide;
    // crossing into/out of the first visible slide is still a single step.
    expect(ringNavAction(-1, 0)).toBe('turn')
    expect(ringNavAction(0, -1)).toBe('turn-back')
  })
})
