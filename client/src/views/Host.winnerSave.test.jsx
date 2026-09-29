// @vitest-environment jsdom
// The winner-reveal auto-save (saveResults) waits for the score chain to
// drain, so it never reads scoreboard_teams while an iPad score write is in
// flight. With the chain empty it saves at once, as before. All mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

let showApi
let liveProps = null
vi.mock('../hooks/useShow.js', async orig => ({ ...(await orig()), useShow: () => showApi }))
vi.mock('../lib/supabase.js', () => {
  const ch = { on() { return ch }, subscribe() { return ch } }
  return { supabase: { channel: () => ch, removeChannel() {} } }
})
vi.mock('../components/shared/ThemeProvider.jsx', () => ({ ThemeProvider: ({ children }) => children }))
vi.mock('../components/host/HostPinGate.jsx', () => ({ default: ({ children }) => children }))
vi.mock('../components/host/BuildMode.jsx', () => ({ default: () => null }))
vi.mock('../components/host/ShowLibrary.jsx', () => ({ default: () => null }))
vi.mock('../components/host/ScoreboardModal.jsx', () => ({ default: () => null }))
vi.mock('../components/host/LiveMode.jsx', () => ({ default: props => { liveProps = props; return null } }))

const { default: Host } = await import('./Host.jsx')

const show = index => ({
  id: 'show1', title: 'T', theme: 'midnight-galaxy', updatedAt: new Date().toISOString(),
  rounds: [], slides: [{ id: 'q', order: 0, type: 'question', data: {} }, { id: 'wr', order: 1, type: 'winner-reveal', data: {} }],
  showState: { isLive: true, currentSlideIndex: index, scoreboardVisible: false },
})
let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  liveProps = null
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const api = index => ({ show: show(index), loading: false, saveResults: vi.fn(async () => {}), setScoreboardVisible: vi.fn() })
const flush = () => act(() => new Promise(r => setTimeout(r, 0)))

describe('winner-reveal auto-save', () => {
  it('chain empty: saves as soon as the winner slide is live', async () => {
    showApi = api(0)
    act(() => root.render(<Host />))
    liveProps.scoreChainIdleRef.current = () => null
    showApi = { ...showApi, show: show(1) }
    act(() => root.render(<Host />))
    expect(showApi.saveResults).toHaveBeenCalledTimes(1)
  })

  it('a score write in flight: saves only after the chain drains', async () => {
    showApi = api(0)
    act(() => root.render(<Host />))
    let drain
    liveProps.scoreChainIdleRef.current = () => new Promise(r => { drain = r })
    showApi = { ...showApi, show: show(1) }
    act(() => root.render(<Host />))
    await flush()
    expect(showApi.saveResults).not.toHaveBeenCalled()
    drain()
    await flush()
    expect(showApi.saveResults).toHaveBeenCalledTimes(1)
  })
})
