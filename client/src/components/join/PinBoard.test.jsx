// client/src/components/join/PinBoard.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const upsert = vi.fn()
let restoreRow = null
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      upsert: (...a) => upsert(...a),
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: restoreRow }) }) }) }),
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
beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); upsert.mockReset(); restoreRow = null; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
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
    const err = [...host.querySelectorAll('p')].find(p => p.textContent.includes("Couldn't save"))
    expect(parseFloat(err.style.fontSize) * 16).toBeGreaterThanOrEqual(14)
  })
  it('preview mode never writes', async () => {
    act(() => root.render(<PinBoard preview slide={slide()} team={team} theme={theme} />))
    await flush()
    act(() => btn('drop').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await act(async () => { btn('Lock In').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(upsert).not.toHaveBeenCalled()
  })
  it('once the host locks pins, no Lock In button remains', async () => {
    restoreRow = { answer: { lat: 40, lon: -80 } }
    act(() => root.render(<PinBoard slide={slide({ pinLocked: true })} team={team} theme={theme} />))
    await flush()
    expect(btn('Lock In')).toBeUndefined()
    expect(host.textContent).toContain('locked')
  })
  it('after reveal a team sees its own result under the map (scorer, no points, no pin)', async () => {
    const results = [
      { teamId: 't1', pin: { lat: 41, lon: -87 }, miles: 312, points: 10 },
      { teamId: 't2', pin: { lat: 41, lon: -87 }, miles: 900, points: 0 },
      { teamId: 't3', pin: null, miles: null, points: 0 },
    ]
    const render = id => act(() => root.render(<PinBoard slide={slide({ pinLocked: true, pinRevealed: true, pinResults: results })} team={{ ...team, id }} theme={theme} />))
    render('t1'); await flush()
    expect(host.textContent).toContain('Your pin: 312 mi · +10')
    render('t2'); await flush()
    expect(host.textContent).toContain('Your pin: 900 mi')
    expect(host.textContent).not.toContain('+10')
    render('t3'); await flush()
    expect(host.textContent).toContain('No pin locked in') // row exists, null miles
    render('t9'); await flush()
    // no row at all (e.g. unpaid team dropped from the scoreboard): "no pin" would be a guess
    expect(host.textContent).toContain('No result recorded for your team')
    expect(host.textContent).not.toContain('No pin locked in')
  })
  it('the "move it" hint names the host, not a person', async () => {
    act(() => root.render(<PinBoard slide={slide()} team={team} theme={theme} />))
    await flush()
    upsert.mockResolvedValue({ error: null })
    act(() => btn('drop').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await act(async () => { btn('Lock In').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await flush()
    expect(host.textContent).toContain('until the host locks pins')
    expect(host.textContent).not.toContain('Ben')
  })
  it('hint, outcome and error text are at least 14px', async () => {
    const px = el => { const v = el.style.fontSize; return v.endsWith('rem') ? parseFloat(v) * 16 : parseFloat(v) }
    const hint = () => [...host.querySelectorAll('p')].find(p => p.textContent.includes('Press and hold'))
    act(() => root.render(<PinBoard slide={slide()} team={team} theme={theme} />))
    await flush()
    expect(px(hint())).toBeGreaterThanOrEqual(14)
    act(() => root.render(<PinBoard slide={slide({ pinLocked: true, pinRevealed: true, pinResults: [{ teamId: 't1', pin: { lat: 41, lon: -87 }, miles: 5, points: 0 }] })} team={{ ...team, id: 't1' }} theme={theme} />))
    await flush()
    const outcome = [...host.querySelectorAll('p')].find(p => p.textContent.includes('Your pin'))
    expect(px(outcome)).toBeGreaterThanOrEqual(14)
  })
  it('preview with no results shows no outcome line', async () => {
    act(() => root.render(<PinBoard preview slide={slide({ pinLocked: true, pinRevealed: true })} team={team} theme={theme} />))
    await flush()
    expect(host.textContent).not.toContain('Your pin')
    expect(host.textContent).not.toContain('No pin locked in')
  })
  it('once locked the map shows the last CONFIRMED pin, not a moved-but-unsaved one', async () => {
    restoreRow = { answer: { lat: 40, lon: -80 } }
    act(() => root.render(<PinBoard slide={slide()} team={team} theme={theme} />))
    await flush()
    act(() => btn('drop').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(host.querySelector('[data-pin]').textContent).toBe('41.9,-87.6')
    act(() => root.render(<PinBoard slide={slide({ pinLocked: true })} team={team} theme={theme} />))
    expect(host.querySelector('[data-pin]').textContent).toBe('40,-80')
  })
  it('locked with nothing confirmed: no pin on the map and a plain message', async () => {
    act(() => root.render(<PinBoard slide={slide()} team={team} theme={theme} />))
    await flush()
    act(() => btn('drop').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    act(() => root.render(<PinBoard slide={slide({ pinLocked: true })} team={team} theme={theme} />))
    expect(host.querySelector('[data-pin]').textContent).toBe('none')
    expect(host.textContent).toContain("You didn't lock in a pin")
  })
})
