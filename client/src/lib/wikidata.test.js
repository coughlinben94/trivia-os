import { describe, it, expect, vi } from 'vitest'
import { searchMovies, getMovieCast, checkMiddleCredit } from '../../../api/_lib/wikidata.js'

const value = id => ({ mainsnak: { datavalue: { value: { id } } } })
const film = (cast = [], voice = []) => ({
  id: 'Q1', labels: { en: { value: 'Example Film' } },
  claims: { P31: [value('Q11424')], P577: [{ mainsnak: { datavalue: { value: { time: '+2001-01-01T00:00:00Z' } } } }], P161: cast.map(value), P725: voice.map(value) },
})
const response = body => ({ ok: true, json: async () => body })

describe('Wikidata movie lookup', () => {
  it('searches globally but returns films only, with years and canonical IDs', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ search: [{ id: 'Q1' }, { id: 'Q2' }] }))
      .mockResolvedValueOnce(response({ entities: {
        Q1: film(),
        Q2: { id: 'Q2', labels: { en: { value: 'Example Song' } }, claims: { P31: [value('Q7366')] } },
      } }))
    expect(await searchMovies('Example', fetcher)).toEqual([{ id: 'Q1', title: 'Example Film', year: 2001 }])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('combines cast and voice performers without duplicate people', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ entities: { Q1: film(['Q11', 'Q12'], ['Q12', 'Q13']) } }))
      .mockResolvedValueOnce(response({ entities: {
        Q11: { labels: { en: { value: 'Actor A' } } },
        Q12: { labels: { en: { value: 'Actor B' } } },
        Q13: { labels: { en: { value: 'Voice C' } } },
      } }))
    expect(await getMovieCast('Q1', fetcher)).toEqual({
      movie: { id: 'Q1', title: 'Example Film', year: 2001 },
      performers: [
        { id: 'Q11', name: 'Actor A' },
        { id: 'Q12', name: 'Actor B' },
        { id: 'Q13', name: 'Voice C' },
      ],
    })
  })

  it('never checks a destination movie as an intermediate connection', async () => {
    const fetcher = vi.fn()
    expect(await checkMiddleCredit('Q9', 'Q11', 'Q9', fetcher)).toEqual({ kind: 'destination' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects malformed QIDs before calling Wikidata', async () => {
    const fetcher = vi.fn()
    await expect(getMovieCast('Q1&action=delete', fetcher)).rejects.toThrow('Invalid movie ID')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reports upstream errors instead of claiming a performer is absent', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    await expect(getMovieCast('Q1', fetcher)).rejects.toThrow('Wikidata unavailable')
  })
})
