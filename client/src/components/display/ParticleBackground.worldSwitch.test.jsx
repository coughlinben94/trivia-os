// @vitest-environment jsdom
//
// Halloween spec §4.8 / forest spec §2.4 + gate 7: a live theme switch
// between registered worlds (space ring <-> haunted-october forest) must
// rebuild the ambient (ParticleBackground keyed by world id) and the new one
// must land on slideIndex % 13 before first paint. Slide advances must never
// remount (Critical Rule 1), and switching between two non-ring themes must
// not remount either. Space station read straight off the far layer's
// transform — the on-screen truth — not just the component's own station
// counter; forest station read off its stage's data-forest-station.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import ParticleBackground from './ParticleBackground.jsx'
import { getTheme } from '../../themes/index.js'

const FAR_SURGE = 480
const PANES = 13
const SETTLE_MS = 1700 + 60 + 50 // SURGE_MS + turn()'s unlock pad + slack

let container, root
beforeEach(() => {
  vi.useFakeTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  global.ResizeObserver = class { observe() {} disconnect() {} }
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  document.body.removeChild(container)
  vi.useRealTimers()
})

// ParticleBackground renders <style/> + its root div; a remount swaps the div.
const rootNode = () => container.querySelector(':scope > div')
function onScreenStation() {
  const stages = container.querySelectorAll('.ring-stage')
  expect(stages).toHaveLength(1)
  expect(container.querySelectorAll('.forest-stage')).toHaveLength(0)
  const far = stages[0].querySelectorAll('.ring-surge')[1]
  const m = far.style.transform.match(/translate3d\((-?[\d.]+)px/)
  return (Math.round(-Number(m[1]) / FAR_SURGE) % PANES + PANES) % PANES
}
function forestStation() {
  const stages = container.querySelectorAll('.forest-stage')
  expect(stages).toHaveLength(1)
  expect(container.querySelectorAll('.ring-stage')).toHaveLength(0)
  return Number(stages[0].dataset.forestStation)
}
// [renderer, on-screen station]: ring rows also carry the ring's own world id.
const onScreen = (themeId) => themeId === 'haunted-october'
  ? ['forest', forestStation()]
  : ['ring', onScreenStation(), window.__world.WORLD.id]

describe('ParticleBackground world switch', () => {
  it('space -> haunted (forest) -> space mid-show: one remount per switch, none on advances, station follows the slide', async () => {
    let themeId = 'midnight-galaxy'
    let mounts = 0, last = null
    const log = []
    async function render(slideIndex) {
      await act(async () => {
        root.render(<ParticleBackground theme={getTheme(themeId)} showId="show-x" slideIndex={slideIndex} stationOverride={null} />)
      })
      const node = rootNode()
      if (node !== last) { mounts++; last = node }
      // Checked immediately after the commit: the switch must not paint station 0 first.
      log.push([themeId, slideIndex, ...onScreen(themeId)])
      await act(async () => { vi.advanceTimersByTime(SETTLE_MS) })
    }

    await render(5)          // Go Live resumes mid-show
    await render(6)
    themeId = 'haunted-october'
    await render(6)          // switch
    await render(7); await render(8); await render(9)
    themeId = 'midnight-galaxy'
    await render(9)          // switch back
    await render(10); await render(11); await render(12)

    expect(mounts).toBe(3)   // initial + 2 switches; zero on the 7 advances
    expect(log).toEqual([
      ['midnight-galaxy', 5, 'ring', 5, 'midnight-galaxy'],
      ['midnight-galaxy', 6, 'ring', 6, 'midnight-galaxy'],
      ['haunted-october', 6, 'forest', 6],
      ['haunted-october', 7, 'forest', 7],
      ['haunted-october', 8, 'forest', 8],
      ['haunted-october', 9, 'forest', 9],
      ['midnight-galaxy', 9, 'ring', 9, 'midnight-galaxy'],
      ['midnight-galaxy', 10, 'ring', 10, 'midnight-galaxy'],
      ['midnight-galaxy', 11, 'ring', 11, 'midnight-galaxy'],
      ['midnight-galaxy', 12, 'ring', 12, 'midnight-galaxy'],
    ])
  }, 120_000)

  it('mount past a full lap aligns to slideIndex % 13 (space)', async () => {
    await act(async () => {
      root.render(<ParticleBackground theme={getTheme('midnight-galaxy')} showId="show-x" slideIndex={17} stationOverride={null} />)
    })
    expect(onScreenStation()).toBe(17 % PANES)
  }, 60_000)

  it('forest first paint: slideIndex 20 -> station 7, read in the same commit (before any timer runs)', async () => {
    await act(async () => {
      root.render(<ParticleBackground theme={getTheme('haunted-october')} showId="show-x" slideIndex={20} stationOverride={null} />)
    })
    expect(forestStation()).toBe(7)
    expect(container.querySelector('.fs-stage').dataset.scene).toBe('rest:7')
  }, 60_000)

  it('two non-ring themes and slide advances on them never remount', async () => {
    // BreathingGradient uses Web Animations, which jsdom lacks.
    Element.prototype.animate ??= () => ({ cancel() {} })
    const nodes = new Set()
    for (const [id, i] of [['wine-cellar', 0], ['wine-cellar', 1], ['dive-bar', 1], ['dive-bar', 2], ['wine-cellar', 3]]) {
      await act(async () => { root.render(<ParticleBackground theme={getTheme(id)} showId="show-x" slideIndex={i} />) })
      nodes.add(rootNode())
    }
    expect(nodes.size).toBe(1)
    expect(container.querySelectorAll('.ring-stage')).toHaveLength(0)
  })
})
