// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// No @testing-library/react in this repo — createRoot + act house pattern.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const teams = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }]
const sb = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: (table) => ({
      select: () => ({ eq: () => Promise.resolve({ data: table === 'teams' ? teams : sb }) }),
    }),
  },
}))

import PinRoomControl from './PinRoomControl.jsx'

let root, host
async function mount(props) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(<PinRoomControl showId="s" onOverride={() => {}} {...props} />) })
}
afterEach(() => { act(() => root.unmount()); host.remove() })

function type(input, value) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => { set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('PinRoomControl', () => {
  it('shows the payable room and top group', async () => {
    await mount()
    expect(host.textContent).toContain('Room counted: 2')
    expect(host.textContent).toContain('top 1 score')
  })

  it('reports typed override as a number and cleared as null', async () => {
    const onOverride = vi.fn()
    await mount({ onOverride })
    type(host.querySelector('input'), '12')
    expect(onOverride).toHaveBeenLastCalledWith(12)
    act(() => root.unmount())
    host.remove()
    await mount({ onOverride, override: 12 })
    type(host.querySelector('input'), '')
    expect(onOverride).toHaveBeenLastCalledWith(null)
  })

  it('uses the override for the top group', async () => {
    await mount({ override: 10 })
    expect(host.textContent).toContain('Room counted: 2')
    expect(host.textContent).toContain('top 4 score')
  })
})
