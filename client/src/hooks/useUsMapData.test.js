import { describe, it, expect, vi } from 'vitest'
import { loadUsMapData } from './useUsMapData.js'

describe('loadUsMapData', () => {
  it('a failed import is not cached: the next call retries, then success is cached', async () => {
    const bad = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(loadUsMapData(bad)).rejects.toThrow('offline')
    const good = vi.fn().mockResolvedValue({ US_STATES: [{ id: 'MN' }] })
    await expect(loadUsMapData(good)).resolves.toEqual([{ id: 'MN' }])
    expect(bad).toHaveBeenCalledTimes(1); expect(good).toHaveBeenCalledTimes(1)
    await loadUsMapData(good)
    expect(good).toHaveBeenCalledTimes(1)
  })
})

describe('preload / retry', () => {
  it('preload swallows a failed import, and retry re-requests it (even from a stuck request)', async () => {
    vi.resetModules()
    const m = await import('./useUsMapData.js')
    const bad = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(m.preloadUsMapData(bad)).resolves.toBeUndefined()
    const stuck = vi.fn(() => new Promise(() => {}))
    m.preloadUsMapData(stuck) // hangs forever
    const good = vi.fn().mockResolvedValue({ US_STATES: [{ id: 'WI' }] })
    await m.retryUsMapData(good)
    expect(good).toHaveBeenCalledTimes(1)
    await expect(m.loadUsMapData(bad)).resolves.toEqual([{ id: 'WI' }])
  })
})
