// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

let sets = null
vi.mock('./supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: sets ? { sets } : null }) }) }) }) },
}))
const { useJukeboxLibraries } = await import('./jukeboxSupabase.js')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
async function render() {
  let value
  function Probe() { value = useJukeboxLibraries(); return null }
  const root = createRoot(document.createElement('div'))
  await act(async () => { root.render(<Probe />) })
  return { get: () => value, unmount: () => act(() => root.unmount()) }
}

describe('useJukeboxLibraries', () => {
  it('keeps the fallback list when the fetch yields nothing', async () => {
    sets = null
    const r = await render()
    expect(r.get()).toEqual([{ id: 'main', label: 'Main Library' }])
    r.unmount()
  })
  it('swaps in the live list (main first)', async () => {
    sets = { items: { zed: { name: 'Zed' }, main: { name: 'Main' }, abe: { name: 'Abe' } } }
    const r = await render()
    expect(r.get().map(l => l.id)).toEqual(['main', 'abe', 'zed'])
    r.unmount()
  })
})
