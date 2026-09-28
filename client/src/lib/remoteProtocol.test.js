import { describe, it, expect } from 'vitest'
import { parseRemoteMessage, refusalText, remoteStatus, CLOSE_BAD_SECRET, GREY_GATES } from './remoteProtocol.js'

describe('parseRemoteMessage', () => {
  it('accepts a hello with a string secret only', () => {
    expect(parseRemoteMessage('{"type":"hello","secret":"ABC"}')).toEqual({ type: 'hello', secret: 'ABC' })
    expect(parseRemoteMessage('{"type":"hello","secret":42}')).toBe(null)
  })
  it('rejects junk without throwing', () => {
    for (const raw of ['', 'nope', 'null', '[]', '42', '{"type":"cmd"}']) expect(parseRemoteMessage(raw)).toBe(null)
  })
  it('keeps only the known cmd fields', () => {
    expect(parseRemoteMessage(JSON.stringify({ type: 'cmd', id: '1', cmd: 'next', args: { expectGate: 'advance' }, expectSlideId: 's1', sentAt: 5, extra: 'x' })))
      .toEqual({ type: 'cmd', id: '1', cmd: 'next', args: { expectGate: 'advance' }, expectSlideId: 's1', sentAt: 5 })
    expect(parseRemoteMessage(JSON.stringify({ type: 'cmd', id: '1', cmd: 'next', args: [1] })))
      .toEqual({ type: 'cmd', id: '1', cmd: 'next', args: {}, expectSlideId: null, sentAt: null })
  })
  it('caps id and cmd length', () => {
    expect(parseRemoteMessage(JSON.stringify({ type: 'cmd', id: 'x'.repeat(65), cmd: 'next' }))).toBe(null)
  })
})

describe('refusalText', () => {
  it('plain English for every built reason, fallback for unknown', () => {
    for (const r of ['slide-changed', 'gate-changed', 'pending-advance', 'scoring', 'late', 'modal-open', 'paused', 'locking', 'busy', 'laptop-offline', 'unknown-command']) {
      expect(refusalText(r)).toMatch(/\w/)
    }
    expect(refusalText('pending-advance')).toBe(refusalText('gate-changed'))
    expect(refusalText('locking')).toBe('Countdown running')
    expect(refusalText('weird')).toMatch(/laptop/)
  })
})

describe('remoteStatus', () => {
  const ok = { socket: 'open', closeCode: null, hostConnected: true, beatAge: 100, visibility: 'visible' }
  it('green when everything is live', () => expect(remoteStatus(ok)).toMatchObject({ tone: 'green', live: true }))
  it('red on a pairing refusal, even with the socket closed', () =>
    expect(remoteStatus({ ...ok, socket: 'closed', closeCode: CLOSE_BAD_SECRET }).text).toMatch(/Pairing code wrong/))
  it('red when the relay is unreachable', () => expect(remoteStatus({ ...ok, socket: 'closed' })).toMatchObject({ tone: 'red', live: false }))
  it('orange stale when the host is gone', () =>
    expect(remoteStatus({ ...ok, hostConnected: false })).toMatchObject({ tone: 'orange', live: false, text: 'Open Live Mode on the laptop' }))
  it('orange not responding past 5s or before any beat', () => {
    expect(remoteStatus({ ...ok, beatAge: 5001 }).text).toBe('Laptop not responding')
    expect(remoteStatus({ ...ok, beatAge: null }).live).toBe(false)
  })
  it('orange but still live when the laptop tab is hidden', () =>
    expect(remoteStatus({ ...ok, visibility: 'hidden' })).toMatchObject({ tone: 'orange', live: true }))
  it('greys Next on locking/scoring/saving/null', () => expect(GREY_GATES).toEqual(['locking', 'scoring', 'saving', null]))
})
