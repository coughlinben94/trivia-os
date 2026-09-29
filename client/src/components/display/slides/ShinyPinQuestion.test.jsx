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
  it('waiting: prompt and dropped-a-pin count line', async () => {
    await render({})
    expect(host.textContent).toContain('Where is Chicago?')
    expect(host.textContent).toContain('dropped a pin')
  })
  it('locked: badge, no count line', async () => {
    await render({ pinLocked: true })
    expect(host.textContent).toContain('Answers locked')
    expect(host.textContent).not.toContain('dropped a pin')
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
})
