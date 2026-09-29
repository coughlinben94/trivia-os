// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import UsMap, { PinMarker } from './UsMap.jsx'

const mount = async el => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => { root.render(<svg>{el}</svg>) })
  return { host, done: () => { act(() => root.unmount()); host.remove() } }
}

describe('PinMarker', () => {
  it('defaults: label font 12, scale 1/k', async () => {
    const { host, done } = await mount(<PinMarker lon={-87} lat={41} k={2} label="A" />)
    expect(host.querySelector('text').getAttribute('font-size')).toBe('12')
    expect(host.querySelector('g').getAttribute('transform')).toMatch(/scale\(0\.5\)/)
    done()
  })
  it('size scales the pin about the tip; labelSize is the FINAL label size regardless of size', async () => {
    const { host, done } = await mount(<PinMarker lon={-87} lat={41} k={2} label="A" size={1.8} labelSize={22} />)
    expect(parseFloat(host.querySelector('text').getAttribute('font-size')) * 1.8).toBeCloseTo(22, 6)
    expect(host.querySelector('g').getAttribute('transform')).toMatch(/scale\(0\.9\)/)
    done()
  })
})

describe('UsMap', () => {
  it('cityLabelSize sets city label font, default 10', async () => {
    const cities = [{ name: 'X', lon: -87, lat: 41, minK: 1 }]
    let m = await mount(<UsMap view={{ k: 1, tx: 0, ty: 0 }} states={[]} cities={cities} showCities />)
    expect(m.host.querySelector('text').getAttribute('font-size')).toBe('10'); m.done()
    m = await mount(<UsMap view={{ k: 1, tx: 0, ty: 0 }} states={[]} cities={cities} showCities cityLabelSize={18} />)
    expect(m.host.querySelector('text').getAttribute('font-size')).toBe('18'); m.done()
  })
  it('draws no city labels by default, even at high zoom (labels give away Pin It answers)', async () => {
    const cities = [{ name: 'X', lon: -87, lat: 41, minK: 1 }]
    let m = await mount(<UsMap view={{ k: 4, tx: 0, ty: 0 }} states={[]} cities={cities} />)
    expect(m.host.querySelector('text')).toBeNull(); m.done()
    m = await mount(<UsMap view={{ k: 4, tx: 0, ty: 0 }} states={[]} cities={cities} showCities />)
    expect(m.host.querySelector('text').textContent).toBe('X'); m.done()
  })
})
