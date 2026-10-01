import { describe, it, expect, vi } from 'vitest'
import handler from '../../../api/movie-chain.js'
import { movieChainRequest } from './movieChainApi.js'

function reply() {
  return { statusCode: 200, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this } }
}

describe('movie chain API', () => {
  it('rejects malformed IDs without a Wikidata request', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
    const res = reply()
    await handler({ method: 'GET', query: { action: 'cast', movieId: 'Q1&x' } }, res)
    expect(res.statusCode).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockRestore()
  })

  it('returns a neutral destination response without an upstream request', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
    const res = reply()
    await handler({ method: 'GET', query: { action: 'check', movieId: 'Q2', personId: 'Q3', destinationId: 'Q2' } }, res)
    expect(res.body).toEqual({ kind: 'destination' })
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockRestore()
  })

  it('turns a non-2xx response into a useful client error', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Wikidata unavailable' }) })
    await expect(movieChainRequest('search', { q: 'Deadpool' }, fetcher)).rejects.toThrow('Wikidata unavailable')
  })
})
