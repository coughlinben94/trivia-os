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
vi.mock('../ShinySignal.jsx', () => ({ default: () => null }))
// jsdom has no canvas, which fitToBox measures with
vi.mock('../../../lib/autoFitText.js', () => ({ fitToBox: () => 60 }))

const { default: ShinyPinQuestion } = await import('./ShinyPinQuestion.jsx')
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
})
