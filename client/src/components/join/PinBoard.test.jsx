// client/src/components/join/PinBoard.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const upsert = vi.fn()
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      upsert: (...a) => upsert(...a),
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
    }),
  },
}))
vi.mock('../shared/PinMapInteractive.jsx', () => ({
  default: ({ onPin, pin }) => (
    <div>
      <button data-drop onClick={() => onPin({ lat: 41.9, lon: -87.6 })}>drop</button>
      <span data-pin>{pin ? `${pin.lat},${pin.lon}` : 'none'}</span>
    </div>
  ),
}))

const { default: PinBoard } = await import('./PinBoard.jsx')
const theme = { colors: { text: '#fff', highlight: '#f5c842' }, fonts: { body: 'DM Sans', display: 'Boogaloo' } }
const team = { id: 't1', showId: 'show_1' }
const slide = (data = {}) => ({ id: 's1', showId: 'show_1', data: { text: 'Where is Chicago?', ...data } })

let host, root
let errSpy
beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); upsert.mockReset(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); errSpy.mockRestore() })
const flush = () => act(async () => { await Promise.resolve() })
const btn = t => [...host.querySelectorAll('button')].find(b => b.textContent.includes(t))

describe('PinBoard', () => {
  it('Lock In is disabled until a pin is dropped, then saves {lat, lon} and reports answered only after the save confirms', async () => {
    upsert.mockResolvedValue({ error: null })
    const onAnswered = vi.fn()
    act(() => root.render(<PinBoard slide={slide()} team={team} theme={theme} onAnswered={onAnswered} />))
    await flush()
    expect(btn('Lock In').disabled).toBe(true)
    act(() => btn('drop').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(btn('Lock In').disabled).toBe(false)
    expect(onAnswered).not.toHaveBeenLastCalledWith(true)
    await act(async () => { btn('Lock In').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await flush()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0]).toMatchObject({ slide_id: 's1', team_id: 't1', show_id: 'show_1', answer: { lat: 41.9, lon: -87.6 } })
    expect(onAnswered).toHaveBeenLastCalledWith(true)
  })
  it('a failed save reports NOT answered and shows the retry message', async () => {
    upsert.mockResolvedValue({ error: { message: 'boom' } })
    const onAnswered = vi.fn()
    act(() => root.render(<PinBoard slide={slide()} team={team} theme={theme} onAnswered={onAnswered} />))
    await flush()
    act(() => btn('drop').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await act(async () => { btn('Lock In').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await flush()
    expect(onAnswered).not.toHaveBeenCalledWith(true)
    expect(host.textContent).toContain('tap Lock In again')
  })
  it('preview mode never writes', async () => {
    act(() => root.render(<PinBoard preview slide={slide()} team={team} theme={theme} />))
    await flush()
    act(() => btn('drop').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await act(async () => { btn('Lock In').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(upsert).not.toHaveBeenCalled()
  })
  it('once the host locks pins, no Lock In button remains', async () => {
    act(() => root.render(<PinBoard slide={slide({ pinLocked: true })} team={team} theme={theme} />))
    await flush()
    expect(btn('Lock In')).toBeUndefined()
    expect(host.textContent).toContain('locked')
  })
})
