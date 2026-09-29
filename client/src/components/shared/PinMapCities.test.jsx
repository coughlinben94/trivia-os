// @vitest-environment jsdom
// City names give away Pin It answers: team maps (default) never draw them; only the host picker opts in.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../hooks/useUsMapData.js', () => ({ useUsMapData: () => [{ id: 'IL', d: 'M0 0L1 1' }] }))
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      upsert: () => Promise.resolve({ error: null }),
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
    }),
  },
}))
const { default: PinMapInteractive } = await import('./PinMapInteractive.jsx')
const { default: PinBoard } = await import('../join/PinBoard.jsx')

let host, root
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })
const zoomIn = n => { for (let i = 0; i < n; i++) act(() => host.querySelector('[aria-label="Zoom in"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))) }
const theme = { colors: { text: '#fff', highlight: '#f5c842' }, fonts: { body: 'DM Sans' } }

describe('Pin It city labels', () => {
  it('PinBoard (phone) shows no city names, even zoomed all the way in', async () => {
    await act(async () => { root.render(<PinBoard slide={{ id: 's1', showId: 'x', data: { text: 'Where?' } }} team={{ id: 't1', showId: 'x' }} theme={theme} />) })
    zoomIn(6)
    expect(host.textContent).not.toContain('Chicago')
    expect(host.querySelector('svg text')).toBeNull()
  })
  it('PinMapInteractive defaults to no cities', () => {
    act(() => root.render(<PinMapInteractive dropMode="click" />))
    zoomIn(6)
    expect(host.textContent).not.toContain('Chicago')
  })
  it('PinMapInteractive showCities (host picker) draws city names when zoomed in', () => {
    act(() => root.render(<PinMapInteractive dropMode="click" showCities />))
    zoomIn(6)
    expect(host.textContent).toContain('Chicago')
  })
})
