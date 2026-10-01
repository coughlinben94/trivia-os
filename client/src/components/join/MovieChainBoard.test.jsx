// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, it, expect, vi } from 'vitest'
import MovieChainBoard from './MovieChainBoard.jsx'

const upsert = vi.fn(async () => ({ error: null }))
vi.mock('../../lib/supabase.js', () => ({ supabase: { from: () => ({
  upsert,
  select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
}) } }))
vi.mock('../../lib/movieChainApi.js', () => ({ movieChainRequest: vi.fn(async action => {
  if (action === 'cast') return { performers: [{ id: 'Q10', name: 'Alex Actor' }, { id: 'Q11', name: 'Blair Actor' }] }
  if (action === 'search') return [{ id: 'Q3', title: 'Middle Movie', year: 2001 }]
  return { kind: 'valid' }
}) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks() })

const slide = { id: 'slide-1', showId: 'show-1', data: {
  movieChainStart: { id: 'Q1', title: 'Start Movie' }, movieChainEnd: { id: 'Q2', title: 'End Movie' }, movieChainCount: 2,
} }
const team = { id: 'team-1', showId: 'show-1' }

describe('MovieChainBoard', () => {
  it('checks a typed middle movie and extends the chain before the hidden final step', async () => {
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    await act(async () => root.render(<MovieChainBoard slide={{ ...slide, data: { ...slide.data, movieChainCount: 3 } }} team={team} />))
    await act(async () => host.querySelector('button[data-person-id="Q10"]').click())
    const input = host.querySelector('input[aria-label="Search next movie"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Middle')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Search').click())
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent.includes('Middle Movie')).click())
    expect(host.querySelector('ol').textContent).toContain('Middle Movie')
    expect(host.textContent).not.toMatch(/correct|incorrect/i)
    expect(host.querySelector('button[data-person-id="Q10"]')).toBeNull()
    await act(async () => host.querySelector('button[data-person-id="Q11"]').click())
    await act(async () => host.querySelector('button[data-action="finish"]').click())
    expect(host.querySelector('ol').textContent).toContain('End Movie')
  })
  it('shows both endpoints and saves a final performer without revealing the verdict', async () => {
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    await act(async () => root.render(<MovieChainBoard slide={slide} team={team} />))
    expect(host.textContent).toContain('Start Movie')
    expect(host.textContent).toContain('End Movie')
    expect(host.textContent).toContain('Shortest chain: 2 movies')
    await act(async () => host.querySelector('button[data-person-id="Q10"]').click())
    expect(host.textContent).toContain('Selected performer')
    expect(host.querySelector('button[data-person-id="Q11"]')).toBeNull()
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Change').click())
    expect(host.querySelector('button[data-person-id="Q11"]')).toBeTruthy()
    await act(async () => host.querySelector('button[data-person-id="Q10"]').click())
    await act(async () => host.querySelector('button[data-action="finish"]').click())
    await act(async () => host.querySelector('button[data-action="lock-in"]').click())
    expect(upsert).toHaveBeenCalled()
    expect(upsert.mock.lastCall[0].answer).toEqual({ movies: ['Q1', 'Q2'], performers: ['Q10'] })
    expect(host.textContent).toContain('Waiting for the host')
    expect(host.textContent).not.toMatch(/correct|incorrect/i)
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Undo last step').click())
    expect(host.textContent).toContain('previous chain remains submitted')
    await act(async () => root.render(<MovieChainBoard slide={{ ...slide, data: { ...slide.data, movieChainLocked: true } }} team={team} />))
    expect(host.querySelector('ol').textContent).toContain('End Movie')
    expect(host.textContent).toContain('Waiting for the host')
  })
  it('tells the team the chains are locked when the database refuses a late save', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'movie_chain_locked' } })
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    await act(async () => root.render(<MovieChainBoard slide={slide} team={team} />))
    await act(async () => host.querySelector('button[data-person-id="Q10"]').click())
    await act(async () => host.querySelector('button[data-action="finish"]').click())
    await act(async () => host.querySelector('button[data-action="lock-in"]').click())
    expect(host.textContent).toContain('Chains just locked')
    expect(host.textContent).not.toContain('Could not save your chain')
  })
  it('announces status changes to screen readers', async () => {
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    await act(async () => root.render(<MovieChainBoard slide={{ ...slide, data: { ...slide.data, movieChainLocked: true } }} team={team} />))
    const status = host.querySelector('[role="status"]')
    expect(status?.textContent).toContain('Chains are locked')
  })
  it('marks the saved-chain button as a confirmation, not a dimmed disabled button', async () => {
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    await act(async () => root.render(<MovieChainBoard slide={slide} team={team} />))
    await act(async () => host.querySelector('button[data-person-id="Q10"]').click())
    await act(async () => host.querySelector('button[data-action="finish"]').click())
    const lock = () => host.querySelector('button[data-action="lock-in"]')
    expect(lock().dataset.committed).toBeUndefined()
    await act(async () => lock().click())
    expect(lock().dataset.committed).toBe('true')
    expect(lock().textContent).toContain('Chain locked in')
  })
})
