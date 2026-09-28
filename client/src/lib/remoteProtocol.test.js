import { describe, it, expect } from 'vitest'
import {
  parseRemoteMessage, refusalText, remoteStatus, CLOSE_BAD_SECRET, GREY_GATES,
  DISPLAY_COMMANDS, LOCAL_COMMANDS, DISPLAY_RELAY_URL, readRemoteLinkFlag, jukeboxView, REFUSAL_TEXT,
} from './remoteProtocol.js'

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
  it('phase 2a reasons (jump, unlock, rescore) have their own plain text, no fallback', () => {
    const fallback = refusalText('weird')
    for (const r of ['bad-target', 'nothing-to-fix', 'nothing-locked', 'not-locked', 'already-revealed', 'laptop-only', 'error']) {
      expect(refusalText(r)).not.toBe(fallback)
    }
    expect(refusalText('laptop-only')).toMatch(/horse race/i)
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

describe('phase 2b: Stream Deck parity', () => {
  it('names the display and local command sets, disjoint', () => {
    expect([...DISPLAY_COMMANDS]).toEqual(['jukebox.open', 'jukebox.exit', 'jukebox.playStop'])
    expect([...LOCAL_COMMANDS]).toEqual(['vol.up', 'vol.down', 'duck', 'sound.play', 'sound.stopAll'])
    expect([...DISPLAY_COMMANDS].some(c => LOCAL_COMMANDS.has(c))).toBe(false)
    expect(DISPLAY_RELAY_URL).toBe('ws://localhost:8794/display')
  })
  it('every new command fits the 32-char cmd cap', () => {
    for (const c of [...DISPLAY_COMMANDS, ...LOCAL_COMMANDS]) {
      expect(parseRemoteMessage(JSON.stringify({ type: 'cmd', id: '1', cmd: c, args: { id: 'x' } }))?.cmd).toBe(c)
    }
  })
  it('plain-English text for every new refusal, no raw codes', () => {
    for (const r of ['display-offline', 'jukebox-not-open', 'not-at-break', 'unknown-sound', 'sound-missing', 'local-failed', 'local-unavailable']) {
      expect(REFUSAL_TEXT[r]).toBeTruthy()
    }
    expect(refusalText('display-offline')).toMatch(/^TV window not linked/)
  })
  it('the /display flag is off unless exactly "1", and off when storage throws', () => {
    const store = v => ({ getItem: () => v })
    expect(readRemoteLinkFlag(store('1'))).toBe(true)
    expect(readRemoteLinkFlag(store('0'))).toBe(false)
    expect(readRemoteLinkFlag(store(null))).toBe(false)
    expect(readRemoteLinkFlag({ getItem() { throw new Error('private') } })).toBe(false)
    expect(readRemoteLinkFlag(undefined)).toBe(false)
  })
  it('jukeboxView: only on a grading break; unlinked, waiting, opening, open', () => {
    const at = type => ({ slide: { type } })
    expect(jukeboxView({ snap: at('question'), jukebox: { linked: true, open: true } })).toBe(null)
    expect(jukeboxView({ snap: null, jukebox: null })).toBe(null)
    expect(jukeboxView({ snap: at('grading-break'), jukebox: { linked: false } })).toEqual({ phase: 'unlinked' })
    expect(jukeboxView({ snap: at('grading-break'), jukebox: { linked: true, waiting: true } })).toEqual({ phase: 'waiting' })
    expect(jukeboxView({ snap: at('grading-break'), jukebox: { linked: true } })).toEqual({ phase: 'opening' })
    expect(jukeboxView({ snap: at('grading-break'), jukebox: { linked: true, open: true, playing: true, handoffPending: false } }))
      .toEqual({ phase: 'open', playing: true, handoffPending: false })
  })
})
