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
