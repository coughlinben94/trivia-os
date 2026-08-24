import { describe, it, expect } from 'vitest'
import { ringVisibleStationIndex, ringNavAction, ringPeekIndex } from './ringStationIndex.js'

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

describe('ringPeekIndex (2026-08-24: team-picker landing previews the next station)', () => {
  const teamPicker = (currentPart, partsLen) =>
    ({ type: 'team-picker', data: { currentPart, parts: new Array(partsLen).fill(null) } })

  it('leaves any non-team-picker slide untouched', () => {
    const slides = [{ type: 'question' }, { type: 'team-preview' }]
    expect(ringPeekIndex(slides, 0)).toBe(0)
    expect(ringPeekIndex(slides, 1)).toBe(1)
  })

  it('does not peek ahead while team-picker is still rolling', () => {
    // [intro, team1, team2, outro, landed] — length 5, landed is index 4
    const slides = [teamPicker(0, 5), { type: 'team-preview' }]
    expect(ringPeekIndex(slides, 0)).toBe(0)
    const rolling = [teamPicker(2, 5), { type: 'team-preview' }]
    expect(ringPeekIndex(rolling, 0)).toBe(0)
  })

  it('peeks to the next index the instant team-picker lands', () => {
    const landed = [teamPicker(4, 5), { type: 'team-preview' }]
    expect(ringPeekIndex(landed, 0)).toBe(1)
  })

  it('an unbaked team-picker (no parts yet) never peeks', () => {
    expect(ringPeekIndex([{ type: 'team-picker', data: {} }], 0)).toBe(0)
  })

  it('produces the same ringVisibleStationIndex value landed and after the real advance', () => {
    const slides = [{ type: 'question' }, teamPicker(4, 5), { type: 'team-preview' }]
    const isVisible = s => s.type === 'team-preview' || s.type === 'question'
    const whileLanded = ringVisibleStationIndex(slides, ringPeekIndex(slides, 1), isVisible)
    const afterAdvance = ringVisibleStationIndex(slides, ringPeekIndex(slides, 2), isVisible)
    expect(whileLanded).toBe(afterAdvance)
  })
})
