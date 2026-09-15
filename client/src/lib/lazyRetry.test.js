import { describe, it, expect, vi } from 'vitest'
import { lazyRetry } from './lazyRetry.js'

describe('lazyRetry', () => {
  it('resolves immediately when the import succeeds', async () => {
    const mod = { default: 'ok' }
    const importFn = vi.fn().mockResolvedValue(mod)
    await expect(lazyRetry(importFn)()).resolves.toBe(mod)
    expect(importFn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and resolves once the import succeeds', async () => {
    const mod = { default: 'ok' }
    const importFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('stale chunk'))
      .mockResolvedValueOnce(mod)
    await expect(lazyRetry(importFn, 2, 1)()).resolves.toBe(mod)
    expect(importFn).toHaveBeenCalledTimes(2)
  })

  it('throws the last error once retries are exhausted', async () => {
    const err = new Error('stale chunk')
    const importFn = vi.fn().mockRejectedValue(err)
    await expect(lazyRetry(importFn, 2, 1)()).rejects.toBe(err)
    expect(importFn).toHaveBeenCalledTimes(3)
  })
})
