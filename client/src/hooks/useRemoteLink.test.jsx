// @vitest-environment jsdom
// The default-off guarantee and the laptop socket's wiring, against a fake
// WebSocket. createRoot + act is the house pattern (no testing-library here).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { useRemoteLink, useRemoteLinkFlag } from './useRemoteLink.js'
import { REMOTE_LINK_KEY } from '../lib/remoteProtocol.js'

class FakeWS {
  static OPEN = 1
  static all = []
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this) }
  send(s) { this.sent.push(JSON.parse(s)) }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }) }
  open() { this.readyState = 1; this.onopen?.() }
  msg(m) { this.onmessage?.({ data: JSON.stringify(m) }) }
  drop(code) { this.readyState = 3; this.onclose?.({ code }) }
}

let host, root, run, link
function Probe({ enabled, snapshot }) {
  const ref = useRef(null)
  ref.current = run
  link = useRemoteLink({ enabled, snapshot, runCommandRef: ref })
  return null
}
const render = props => act(() => root.render(<Probe snapshot={{ type: 'state', cue: 'A' }} {...props} />))

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  FakeWS.all = []
  vi.stubGlobal('WebSocket', FakeWS)
  run = vi.fn(() => ({ ok: true }))
  host = document.createElement('div')
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useRemoteLink', () => {
  it('off: never constructs a socket', () => {
    render({ enabled: false })
    render({ enabled: false, snapshot: { type: 'state', cue: 'B' } })
    expect(FakeWS.all).toHaveLength(0)
    expect(link.status).toBe('off')
  })
  it('on: connects to localhost, sends a snapshot on open, answers beats and commands', () => {
    render({ enabled: true })
    const ws = FakeWS.all[0]
    expect(ws.url).toBe('ws://localhost:8794')
    act(() => ws.open())
    expect(link.status).toBe('open')
    expect(ws.sent[0]).toMatchObject({ type: 'state', cue: 'A', visibility: 'visible' })
    act(() => ws.msg({ type: 'relay-beat' }))
    expect(ws.sent.at(-1)).toMatchObject({ type: 'beat', visibility: 'visible' })
    act(() => ws.msg({ type: 'cmd', id: '1', cmd: 'next', args: { expectGate: 'advance' }, expectSlideId: 's', sentAt: 5 }))
    expect(run).toHaveBeenCalledWith({ cmd: 'next', via: 'remote', args: { expectGate: 'advance' }, expectSlideId: 's', sentAt: 5 })
    expect(ws.sent.at(-1)).toEqual({ type: 'result', id: '1', received: true })
    act(() => ws.msg({ type: 'remotes', count: 1 }))
    expect(link.remotes).toBe(1)
  })
  it('resends the unchanged snapshot on every re-open (relay restart)', () => {
    render({ enabled: true })
    act(() => FakeWS.all[0].open())
    act(() => FakeWS.all[0].drop(1006))
    expect(link.status).toBe('down')
    act(() => vi.advanceTimersByTime(1000))
    const again = FakeWS.all[1]
    act(() => again.open())
    expect(again.sent[0]).toMatchObject({ type: 'state', cue: 'A' })
  })
  it('backs off 1s, 2s, 4s… capped at 10s', () => {
    render({ enabled: true })
    for (const [i, wait] of [[0, 1000], [1, 2000], [2, 4000], [3, 8000], [4, 10000], [5, 10000]]) {
      act(() => FakeWS.all[i].drop(1006))
      act(() => vi.advanceTimersByTime(wait - 1))
      expect(FakeWS.all).toHaveLength(i + 1)
      act(() => vi.advanceTimersByTime(1))
      expect(FakeWS.all).toHaveLength(i + 2)
    }
  })
  it('kicked by a newer tab (4001): stops for good', () => {
    render({ enabled: true })
    act(() => FakeWS.all[0].drop(4001))
    expect(link.status).toBe('replaced')
    act(() => vi.advanceTimersByTime(60000))
    expect(FakeWS.all).toHaveLength(1)
  })
  it('switching off closes the socket and stops reconnecting', () => {
    render({ enabled: true })
    act(() => FakeWS.all[0].open())
    render({ enabled: false })
    expect(FakeWS.all[0].readyState).toBe(3)
    act(() => vi.advanceTimersByTime(60000))
    expect(FakeWS.all).toHaveLength(1)
    expect(link.status).toBe('off')
  })
  it('a command that finishes later (score.set) gets its outcome posted on the socket under the same id', async () => {
    run = vi.fn(() => ({ ok: true, later: Promise.resolve({ done: { team: 'A', col: 'R1', from: 1, to: 2 } }) }))
    render({ enabled: true })
    const ws = FakeWS.all[0]
    act(() => ws.open())
    act(() => ws.msg({ type: 'cmd', id: '5', cmd: 'score.set', args: {}, sentAt: 5 }))
    expect(ws.sent.at(-1)).toEqual({ type: 'result', id: '5', received: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(ws.sent.at(-1)).toEqual({ type: 'result', id: '5', done: true, scoreSet: { team: 'A', col: 'R1', from: 1, to: 2 } })
  })
})

// /display is pinned open all night; the /host chip's localStorage write
// fires `storage` in it, so the peer follows the chip without a reload.
describe('useRemoteLinkFlag (the /display side of the chip)', () => {
  function FlagProbe() {
    const ref = useRef(null)
    ref.current = run
    link = useRemoteLink({ enabled: useRemoteLinkFlag(), snapshot: { type: 'display-state' }, runCommandRef: ref })
    return null
  }
  const flip = (v, key = REMOTE_LINK_KEY) => act(() => {
    localStorage.setItem(REMOTE_LINK_KEY, v)
    window.dispatchEvent(new StorageEvent('storage', { key }))
  })
  beforeEach(() => localStorage.clear())

  it('flag off to on opens the peer; on to off closes it', () => {
    act(() => root.render(<FlagProbe />))
    expect(FakeWS.all).toHaveLength(0)
    flip('1')
    expect(FakeWS.all).toHaveLength(1)
    const ws = FakeWS.all[0]
    act(() => ws.open())
    flip('0')
    expect(ws.readyState).toBe(3)
    expect(link.status).toBe('off')
  })
  it('ignores storage events for other keys', () => {
    act(() => root.render(<FlagProbe />))
    flip('1', 'something-else')
    expect(FakeWS.all).toHaveLength(0)
  })
})
