// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, it, expect, vi } from 'vitest'
import MovieChainEditor from './MovieChainEditor.jsx'
import { movieChainRequest } from '../../lib/movieChainApi.js'

vi.mock('../../lib/movieChainApi.js', () => ({ movieChainRequest: vi.fn() }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, host
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks() })

describe('Movie Chain host editor', () => {
  it('stores canonical movie IDs and a shortest count, with cast readiness', async () => {
    movieChainRequest.mockImplementation(async action => action === 'search'
      ? [{ id: 'Q1', title: 'Deadpool', year: 2016 }]
      : { performers: [{ id: 'Q11', name: 'Ryan Reynolds' }] })
    const onChange = vi.fn()
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    await act(async () => root.render(<MovieChainEditor data={{}} onChange={onChange} />))
    const input = host.querySelector('input[placeholder="Search starting movie"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Deadpool')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => host.querySelector('button[aria-label="Search starting movie"]').click())
    await act(async () => host.querySelector('button[data-movie-id="Q1"]').click())
    expect(onChange).toHaveBeenCalledWith('movieChainStart', { id: 'Q1', title: 'Deadpool', year: 2016 })
    await act(async () => root.render(<MovieChainEditor data={{ movieChainStart: { id: 'Q1', title: 'Deadpool', year: 2016 } }} onChange={onChange} />))
    expect(host.textContent).toContain('1 credited performer')
  })

  it('does not carry a selected movie into the next blank slide', async () => {
    movieChainRequest.mockImplementation(async action => action === 'search'
      ? [{ id: 'Q1', title: 'Deadpool', year: 2016 }]
      : { performers: [] })
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    await act(async () => root.render(<MovieChainEditor data={{}} onChange={() => {}} />))
    const input = host.querySelector('input[placeholder="Search starting movie"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Deadpool')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => host.querySelector('button[aria-label="Search starting movie"]').click())
    await act(async () => host.querySelector('button[data-movie-id="Q1"]').click())
    await act(async () => root.render(<MovieChainEditor data={{ movieChainStart: { id: 'Q1', title: 'Deadpool', year: 2016 } }} onChange={() => {}} />))
    expect(host.textContent).toContain('Deadpool')
    await act(async () => root.render(<MovieChainEditor data={{}} onChange={() => {}} />))
    expect(host.textContent).not.toContain('Deadpool')
  })
})
