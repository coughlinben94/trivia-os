import { describe, it, expect, vi } from 'vitest'
import { trackWrite } from './writeTracking.js'

describe('trackWrite', () => {
  it('clears writeError and returns true on a successful write', async () => {
    const setWriteError = vi.fn()
    const ok = await trackWrite(Promise.resolve({ error: null }), setWriteError)
    expect(ok).toBe(true)
    expect(setWriteError).toHaveBeenCalledWith(null)
  })

  it('sets a host-visible writeError and returns false on a failed write', async () => {
    const setWriteError = vi.fn()
    const ok = await trackWrite(Promise.resolve({ error: { message: 'RLS denied' } }), setWriteError)
    expect(ok).toBe(false)
    expect(setWriteError).toHaveBeenCalledTimes(1)
    const arg = setWriteError.mock.calls[0][0]
    expect(arg.message).toBe('Save failed — check connection')
    expect(arg.id).toBeTruthy()
  })
})
