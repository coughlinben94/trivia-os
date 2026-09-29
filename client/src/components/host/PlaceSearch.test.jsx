// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import PlaceSearch from './PlaceSearch.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const TC = { lat: '44.7631', lon: '-85.6206', name: 'Traverse City', address: { state: 'Michigan' } }
const AK = { lat: '64.8', lon: '-147.7', name: 'Fairbanks', address: { state: 'Alaska' } }
const okFetch = rows => vi.fn(async () => ({ ok: true, json: async () => rows }))

let host, root
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })

async function mount(props) {
  await act(async () => { root.render(<PlaceSearch onPick={() => {}} {...props} />) })
}
async function type(text) {
  const input = host.querySelector('input')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function enter() {
  await act(async () => { host.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
}
const rows = () => [...host.querySelectorAll('[data-testid="place-result"]')]

describe('<PlaceSearch>', () => {
  it('typing + Enter shows results from the fetcher', async () => {
    const f = okFetch([TC, AK])
    await mount({ fetchImpl: f })
    await type('Traverse City')
    await enter()
    expect(f).toHaveBeenCalledTimes(1)
    expect(rows().map(r => r.textContent)).toEqual(['Traverse City, Michigan', 'Fairbanks, Alaska (outside the lower 48)'])
  })
  it('clicking a valid result calls onPick with lat, lon, label', async () => {
    const onPick = vi.fn()
    await mount({ fetchImpl: okFetch([TC]), onPick })
    await type('tc'); await enter()
    await act(async () => { rows()[0].click() })
    expect(onPick).toHaveBeenCalledWith({ lat: 44.7631, lon: -85.6206, label: 'Traverse City, Michigan' })
  })
  it('an out-of-bounds row is not clickable', async () => {
    const onPick = vi.fn()
    await mount({ fetchImpl: okFetch([AK]), onPick })
    await type('fairbanks'); await enter()
    expect(rows()[0].disabled).toBe(true)
    await act(async () => { rows()[0].click() })
    expect(onPick).not.toHaveBeenCalled()
  })
  it('shows the fallback message on error', async () => {
    await mount({ fetchImpl: vi.fn(async () => { throw new Error('offline') }) })
    await type('x'); await enter()
    expect(host.textContent).toContain('Search unavailable — paste lat, lon or click the map')
  })
  it('shows a hint when nothing is found', async () => {
    await mount({ fetchImpl: okFetch([]) })
    await type('zzzz'); await enter()
    expect(host.textContent).toContain('Nothing found — try adding the state')
  })
  it('empty query does not call fetch', async () => {
    const f = okFetch([TC])
    await mount({ fetchImpl: f })
    await type('   '); await enter()
    await act(async () => { host.querySelector('button').click() })
    expect(f).not.toHaveBeenCalled()
  })
})
