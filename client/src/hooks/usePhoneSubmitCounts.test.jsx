// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const rpc = vi.fn()
const eq = vi.fn()
const select = vi.fn()
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: (...a) => { from(...a); return { select: (...s) => { select(...s); return { eq: (...e) => { eq(...e); return Promise.resolve({ count: 5 }) } } } } },
  },
}))
const from = vi.fn()

import { usePhoneSubmitCounts } from './usePhoneSubmitCounts.js'

let host, root, out
function Probe({ opts }) {
  out = usePhoneSubmitCounts('slide1', 'show1', opts)
  return null
}
const render = opts => act(async () => { root.render(<Probe opts={opts} />) })
const tick = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  rpc.mockReset().mockResolvedValue({ data: 3 })
  from.mockReset(); select.mockReset(); eq.mockReset()
  host = document.createElement('div')
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); vi.useRealTimers() })

describe('usePhoneSubmitCounts', () => {
  it('polls rpc every 2s with the slide id and fetches the team head-count once', async () => {
    await render({ pollStop: false, teamsStop: false })
    expect(rpc).toHaveBeenCalledWith('phone_answers_count', { p_slide_id: 'slide1' })
    expect(from).toHaveBeenCalledWith('teams')
    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(eq).toHaveBeenCalledWith('show_id', 'show1')
    expect(out).toEqual({ submitted: 3, teamCount: 5 })
    await tick(2000)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(from).toHaveBeenCalledTimes(1)
  })
  it('stops polling when pollStop flips true', async () => {
    await render({ pollStop: false, teamsStop: false })
    await render({ pollStop: true, teamsStop: false })
    rpc.mockClear()
    await tick(6000)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('does not poll or query when stopped from the start', async () => {
    await render({ pollStop: true, teamsStop: true })
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })
  it('teams: false skips the team query', async () => {
    await render({ pollStop: false, teams: false })
    expect(rpc).toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
    expect(out.teamCount).toBe(0)
  })
})
