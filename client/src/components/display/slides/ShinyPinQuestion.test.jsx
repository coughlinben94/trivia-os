// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const chain = () => {
  const c = { select: () => c, eq: () => c, then: r => Promise.resolve({ data: [], count: 0 }).then(r) }
  return c
}
vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: 2 }),
    from: () => chain(),
  },
}))
vi.mock('../../../hooks/useUsMapData.js', () => ({ useUsMapData: () => null }))
const mapProps = []
vi.mock('../../shared/UsMap.jsx', async (orig) => {
  const actual = await orig()
  return { ...actual, default: p => { mapProps.push(p); return actual.default(p) } }
})
vi.mock('../ShinySignal.jsx', () => ({ default: () => null }))
vi.mock('../../shared/MapLoadRetry.jsx', () => ({ default: p => <i data-retry-overlay={String(p.retry)} /> }))
// jsdom has no canvas, which fitToBox measures with
vi.mock('../../../lib/autoFitText.js', () => ({ fitToBox: () => 60 }))

const { default: ShinyPinQuestion, TV_LABEL, TV_CITY_LABEL, TV_PIN_SIZE, Q_BOX, REVEAL_COL_W } = await import('./ShinyPinQuestion.jsx')
const theme = { colors: { text: '#ffffff' }, fonts: { body: 'DM Sans', display: 'Boogaloo' } }
const mk = (data = {}) => ({ id: 's1', data: { text: 'Where is Chicago?', ...data } })
const show = { id: 'show_1' }
const res = (n, o = {}) => ({ teamId: `t${n}`, teamName: `Team ${n}`, pin: { lat: 41 + n * 0.1, lon: -87 }, miles: n * 10, points: 0, ...o })

let host, root, warn
beforeEach(() => {
  warn = vi.spyOn(console, 'error').mockImplementation(() => {})
  document.fonts = { ready: Promise.resolve() }
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); warn.mockRestore() })
const render = async data => { await act(async () => { root.render(<ShinyPinQuestion slide={mk(data)} show={show} theme={theme} />) }) }

describe('ShinyPinQuestion', () => {
  it('waiting: prompt and locked-in count line', async () => {
    await render({})
    expect(host.textContent).toContain('Where is Chicago?')
    expect(host.textContent).toContain('2 teams locked in')
    expect(host.textContent).not.toContain('dropped a pin')
  })
  it('locked: badge, no count line', async () => {
    await render({ pinLocked: true })
    expect(host.textContent).toContain('Answers locked')
    expect(host.textContent).not.toContain('teams locked in')
  })
  it('revealed: ranked list with miles, +10 for scorers, no pin', async () => {
    await render({ pinRevealed: true, pinAnswer: { lat: 41.88, lon: -87.63 }, answer: 'Chicago',
      pinResults: [res(1, { points: 10 }), res(2), res(3, { pin: null, miles: null })] })
    const t = host.textContent
    expect(t).toContain('Team 1'); expect(t).toContain('10 mi'); expect(t).toContain('20 mi')
    expect(t).toContain('+10'); expect(t).toContain('no pin')
  })
  it('revealed with 25 results: 12 rows + "+13 more"', async () => {
    await render({ pinRevealed: true, pinAnswer: { lat: 41.88, lon: -87.63 },
      pinResults: Array.from({ length: 25 }, (_, i) => res(i + 1)) })
    expect(host.querySelectorAll('ol li').length).toBe(13)
    expect(host.textContent).toContain('+13 more')
  })
  it('revealed without pinAnswer or results does not throw', async () => {
    await render({ pinRevealed: true })
    expect(host.textContent).toContain('Where is Chicago?')
    await render({ pinRevealed: true, pinResults: [res(1)] })
    expect(host.textContent).toContain('Team 1')
  })
  it('map box aspect ratio matches the map frame', async () => {
    await render({})
    expect(host.innerHTML).toContain('aspect-ratio: 1000 / 632')
  })
  it('revealed on first render schedules no camera tween when already at target', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    await render({ pinRevealed: true })
    expect(raf).not.toHaveBeenCalled()
    raf.mockRestore()
  })
  it('revealed: pins fade in as one opacity group with a dashed line from each scoring pin to the true spot', async () => {
    await render({ pinRevealed: true, pinAnswer: { lat: 41.88, lon: -87.63 },
      pinResults: [res(1, { points: 10 }), res(2, { points: 10 }), res(3)] })
    const g = host.querySelector('[data-pin-fade]')
    expect(g).not.toBeNull()
    expect(g.getAttribute('opacity')).toBe('0') // fades in later; nothing pops during the camera move
    const lines = g.querySelectorAll('line')
    expect(lines.length).toBe(2)
    expect(lines[0].getAttribute('stroke-dasharray')).toBeTruthy()
    expect(lines[0].getAttribute('vector-effect')).toBe('non-scaling-stroke')
  })
  it('tied whole-mile distances share a rank (1,2,2,4); rows without a pin show a dash', async () => {
    await render({ pinRevealed: true, pinAnswer: { lat: 41.88, lon: -87.63 },
      pinResults: [res(1, { miles: 10 }), res(2, { miles: 20 }), res(3, { miles: 20 }), res(4, { miles: 30 }), res(5, { pin: null, miles: null })] })
    const ranks = [...host.querySelectorAll('ol li')].map(li => li.querySelector('span').textContent)
    expect(ranks).toEqual(['1', '2', '2', '4', '–'])
  })
  it('map box width is capped to the aspect at the 62vh height cap so it never letterboxes', async () => {
    await render({})
    // jsdom folds calc(62vh * 1000 / 632) to calc(98.1013vh)
    expect(host.innerHTML).toMatch(/max-width: calc\(98\.10\d*vh\)/)
  })
  it('TV text sizes: team names ~36px and city labels ~27px at 1080p (1 map unit ~ 1.059px)', () => {
    expect(TV_LABEL * 1.059).toBeGreaterThanOrEqual(35)
    expect(TV_CITY_LABEL * 1.059).toBeGreaterThanOrEqual(26)
    expect(TV_PIN_SIZE).toBeGreaterThan(0)
  })
  it('side list uses a TV-sized font, matching the Hues & Cues list', async () => {
    await render({ pinRevealed: true, pinAnswer: { lat: 41.88, lon: -87.63 }, pinResults: [res(1)] })
    expect(host.querySelector('ol li').getAttribute('style')).toContain('clamp(1.6rem, 2vw, 2.3rem)')
  })
  it('prompt fit box is no wider than the prompt column at reveal, so a 3-line prompt cannot clip', () => {
    expect(Q_BOX.boxW).toBeLessThanOrEqual(REVEAL_COL_W)
    expect(Q_BOX.maxLines).toBe(2)
  })
  it('city labels are never drawn on the TV: waiting, locked, revealed (names give away the answer)', async () => {
    for (const d of [{}, { pinLocked: true }, { pinRevealed: true, pinAnswer: { lat: 41.88, lon: -87.63 }, pinResults: [res(1)] }]) {
      mapProps.length = 0
      await render(d)
      expect(mapProps.length).toBeGreaterThan(0)
      expect(mapProps.every(p => p.showCities !== true)).toBe(true)
    }
  })
  const pinLabels = () => [...host.querySelectorAll('[data-pin-fade] text')].map(t => t.textContent)
  it('identical pins: one merged label with +N, every marker still drawn', async () => {
    const same = { lat: 41.5, lon: -87.5 }
    await render({ pinRevealed: true, pinAnswer: { lat: 41.88, lon: -87.63 },
      pinResults: [res(1, { pin: same, teamName: 'Quiz Kids' }), res(2, { pin: same, teamName: 'Other' }), res(3)] })
    expect(pinLabels()).toEqual(['Quiz Kids +1', 'Team 3'])
    expect(host.querySelectorAll('[data-pin-fade] path').length).toBe(3)
  })
  it('distinct pins are unchanged and the top-5 named rule counts distinct spots', async () => {
    await render({ pinRevealed: true, pinAnswer: { lat: 41.88, lon: -87.63 },
      pinResults: [1, 2, 3].map(n => res(n)) })
    expect(pinLabels()).toEqual(['Team 1', 'Team 2', 'Team 3'])
    const same = { lat: 40, lon: -80 }
    await render({ pinRevealed: true, pinAnswer: { lat: 41.88, lon: -87.63 },
      pinResults: [res(1, { pin: same }), res(2, { pin: same }), res(3), res(4), res(5), res(6), res(7)] })
    expect(pinLabels()).toEqual(['Team 1 +1', 'Team 3', 'Team 4', 'Team 5', 'Team 6', '7'])
  })
  it('TV never offers a tap-to-retry overlay', async () => {
    await render({})
    expect(host.querySelector('[data-retry-overlay]').getAttribute('data-retry-overlay')).toBe('false')
  })
})
