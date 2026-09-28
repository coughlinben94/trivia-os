import { describe, it, expect, vi } from 'vitest'
import { runDisplayCommand, displayState } from './displayCommands.js'

const NOW = 1_000_000
const ctx = over => ({
  now: NOW, breakEligible: true, breakActive: true, warp: null,
  openJukebox: vi.fn(),
  jukebox: { exitToShow: vi.fn(() => 'started'), togglePlay: vi.fn(() => 'stop') },
  ...over,
})
const cmd = (c, over = {}) => ({ cmd: c, via: 'remote', args: {}, expectSlideId: null, sentAt: NOW - 100, ...over })

describe('runDisplayCommand', () => {
  it('drops a late or unstamped command before anything runs', () => {
    const c = ctx()
    expect(runDisplayCommand(cmd('jukebox.exit', { sentAt: NOW - 2000 }), c)).toEqual({ refuse: 'late' })
    expect(runDisplayCommand(cmd('jukebox.exit', { sentAt: null }), c)).toEqual({ refuse: 'late' })
    expect(c.jukebox.exitToShow).not.toHaveBeenCalled()
  })
  it('jukebox.exit runs exitToShow (the b path) when the jukebox is up', () => {
    const c = ctx()
    expect(runDisplayCommand(cmd('jukebox.exit'), c)).toEqual({ ok: true })
    expect(c.jukebox.exitToShow).toHaveBeenCalledOnce()
  })
  it('jukebox.exit before the jukebox is up is refused jukebox-not-open', () => {
    expect(runDisplayCommand(cmd('jukebox.exit'), ctx({ breakActive: false }))).toEqual({ refuse: 'jukebox-not-open' })
    expect(runDisplayCommand(cmd('jukebox.exit'), ctx({ jukebox: null }))).toEqual({ refuse: 'jukebox-not-open' })
  })
  it('jukebox.exit: a second press is received and does nothing; a song modal refuses', () => {
    expect(runDisplayCommand(cmd('jukebox.exit'), ctx({ jukebox: { exitToShow: () => 'already' } }))).toEqual({ ok: true })
    expect(runDisplayCommand(cmd('jukebox.exit'), ctx({ jukebox: { exitToShow: () => 'modal' } }))).toEqual({ refuse: 'modal-open' })
  })
  it('jukebox.playStop runs togglePlay; the handoff in flight refuses busy', () => {
    const c = ctx()
    expect(runDisplayCommand(cmd('jukebox.playStop'), c)).toEqual({ ok: true })
    expect(c.jukebox.togglePlay).toHaveBeenCalledOnce()
    expect(runDisplayCommand(cmd('jukebox.playStop'), ctx({ jukebox: { togglePlay: () => 'handoff' } }))).toEqual({ refuse: 'busy' })
    expect(runDisplayCommand(cmd('jukebox.playStop'), ctx({ jukebox: { togglePlay: () => 'modal' } }))).toEqual({ refuse: 'modal-open' })
    expect(runDisplayCommand(cmd('jukebox.playStop'), ctx({ breakActive: false }))).toEqual({ refuse: 'jukebox-not-open' })
  })
  it('jukebox.open skips the 10s wait only in the wait (the Space/→ key\'s three conditions)', () => {
    const waiting = ctx({ breakActive: false })
    expect(runDisplayCommand(cmd('jukebox.open'), waiting)).toEqual({ ok: true })
    expect(waiting.openJukebox).toHaveBeenCalledOnce()
    const notBreak = ctx({ breakEligible: false, breakActive: false })
    expect(runDisplayCommand(cmd('jukebox.open'), notBreak)).toEqual({ refuse: 'not-at-break' })
    const warping = ctx({ breakActive: false, warp: 'out' })
    expect(runDisplayCommand(cmd('jukebox.open'), warping)).toEqual({ ok: true })
    expect(warping.openJukebox).not.toHaveBeenCalled()
    const open = ctx()
    expect(runDisplayCommand(cmd('jukebox.open'), open)).toEqual({ ok: true })
    expect(open.openJukebox).not.toHaveBeenCalled()
  })
  it('anything else is unknown-command (the display never runs host or local commands)', () => {
    for (const c of ['next', 'vol.up', 'duck', 'sound.play']) expect(runDisplayCommand(cmd(c), ctx())).toEqual({ refuse: 'unknown-command' })
  })
})

describe('displayState', () => {
  it('reports the wait, the open jukebox and its playback', () => {
    expect(displayState({ breakEligible: true, breakActive: false, warp: null, jukebox: null })).toEqual({
      type: 'display-state', breakWaiting: true, jukeboxOpen: false, playing: false, handoffPending: false,
    })
    expect(displayState({ breakEligible: true, breakActive: false, warp: 'out', jukebox: null }).breakWaiting).toBe(false)
    expect(displayState({ breakEligible: true, breakActive: true, warp: null, jukebox: { playing: true, handoffPending: false } })).toEqual({
      type: 'display-state', breakWaiting: false, jukeboxOpen: true, playing: true, handoffPending: false,
    })
    expect(displayState({ breakEligible: false, breakActive: false, warp: 'back', jukebox: { playing: true } })).toMatchObject({ jukeboxOpen: false, playing: false })
  })
})
