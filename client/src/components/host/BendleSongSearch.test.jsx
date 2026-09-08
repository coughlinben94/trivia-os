// client/src/components/host/BendleSongSearch.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// No @testing-library/react in this repo — createRoot + act(...) is the
// house pattern (see AddSlideWizard.test.jsx, ShinyBendleQuestion.test.jsx),
// so this follows it rather than pulling in a second testing library.
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'test-token' } } }) } },
}))

const { default: BendleSongSearch } = await import('./BendleSongSearch.jsx')

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ tracks: [
      { spotifyId: '1', title: 'Hey Jude', artist: 'The Beatles', artworkUrl: null },
    ] }),
  })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('BendleSongSearch', () => {
  it('searches and calls onPick with the chosen track', async () => {
    const onPick = vi.fn()
    act(() => root.render(<BendleSongSearch onPick={onPick} />))

    const input = host.querySelector('input')
    act(() => {
      // React tracks the DOM value node-side (see WorldPaletteEditor.test.jsx);
      // bypass it so the change event is seen as a real edit.
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
        .set.call(input, 'hey jude')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // The component debounces 350ms before fetching; advance fake timers past
    // that, then flush enough microtask turns for the fetch + json() promise
    // chain and the resulting setState to land.
    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    const resultButton = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Hey Jude'))
    expect(resultButton).toBeTruthy()

    act(() => { resultButton.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onPick).toHaveBeenCalledWith({ spotifyId: '1', title: 'Hey Jude', artist: 'The Beatles', artworkUrl: null })
  })
})
