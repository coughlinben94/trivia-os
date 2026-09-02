import { describe, it, expect } from 'vitest'
import { fetchAllPages } from './fetchAllPages.js'

// Serve `total` synthetic rows through Supabase's inclusive-range contract,
// capped at `pageSize` per call, and record the ranges asked for.
function fakeTable(total, pageSize) {
  const calls = []
  const all = Array.from({ length: total }, (_, i) => ({ id: i }))
  return {
    calls,
    fetchPage: async (from, to) => {
      calls.push([from, to])
      return { data: all.slice(from, Math.min(to + 1, from + pageSize)), error: null }
    },
  }
}

describe('fetchAllPages', () => {
  it('returns every row when the table is larger than one page', async () => {
    // The real case this exists for: `questions` is ~1,900 rows against a
    // 1,000-row cap, and a single select would return 1,000 with no error.
    const t = fakeTable(1900, 1000)
    const rows = await fetchAllPages(t.fetchPage, 1000)
    expect(rows).toHaveLength(1900)
    expect(rows[0].id).toBe(0)
    expect(rows[1899].id).toBe(1899)
    expect(t.calls).toEqual([[0, 999], [1000, 1999]])
  })

  it('asks one more time when the total is an exact multiple of the page', async () => {
    // A full final page is indistinguishable from "more to come", so the
    // loop must not stop on it.
    const t = fakeTable(2000, 1000)
    const rows = await fetchAllPages(t.fetchPage, 1000)
    expect(rows).toHaveLength(2000)
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('stops after one request when the table fits in a page', async () => {
    const t = fakeTable(3, 1000)
    expect(await fetchAllPages(t.fetchPage, 1000)).toHaveLength(3)
    expect(t.calls).toEqual([[0, 999]])
  })

  it('returns an empty array for an empty table', async () => {
    const t = fakeTable(0, 1000)
    expect(await fetchAllPages(t.fetchPage, 1000)).toEqual([])
  })

  it('treats a null data payload as the end, not a crash', async () => {
    const rows = await fetchAllPages(async () => ({ data: null, error: null }), 1000)
    expect(rows).toEqual([])
  })

  it('throws the Supabase error message instead of returning a short read', async () => {
    // Silently returning the rows collected so far would write a truncated
    // backup over a good one.
    const fail = async () => ({ data: null, error: { message: 'permission denied' } })
    await expect(fetchAllPages(fail, 1000)).rejects.toThrow('permission denied')
  })

  it('surfaces an error raised on a later page', async () => {
    let n = 0
    const flaky = async (from, to) => {
      if (n++ === 0) return { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }
      return { data: null, error: { message: 'timeout' } }
    }
    await expect(fetchAllPages(flaky, 1000)).rejects.toThrow('timeout')
  })

  it('throws when a row repeats across pages instead of returning a corrupt set', async () => {
    // What an unordered Postgres scan actually does: the same row drifts
    // into a second page while another is never served. Returning these
    // rows would be a backup that looks clean and silently lost a row.
    const pages = [
      [{ id: 1 }, { id: 2 }],
      [{ id: 2 }, { id: 4 }],
    ]
    let n = 0
    const drifting = async () => ({ data: pages[n++] ?? [], error: null })
    await expect(fetchAllPages(drifting, 2)).rejects.toThrow(/came back twice/)
  })

  it('names the offending id and the missing .order() in the message', async () => {
    const pages = [[{ id: 'show_abc' }], [{ id: 'show_abc' }]]
    let n = 0
    const dupe = async () => ({ data: pages[n++] ?? [], error: null })
    await expect(fetchAllPages(dupe, 1)).rejects.toThrow(/show_abc.*\.order\('id'\)/)
  })

  it('allows a repeated id when the caller opts out of the check', async () => {
    const pages = [[{ id: 1 }], [{ id: 1 }], []]
    let n = 0
    const dupe = async () => ({ data: pages[n++] ?? [], error: null })
    expect(await fetchAllPages(dupe, 1, { idKey: null })).toHaveLength(2)
  })

  it('ignores rows with no id rather than treating them as duplicates', async () => {
    // Two id-less rows are not evidence of unstable paging.
    const pages = [[{ name: 'a' }, { name: 'b' }], []]
    let n = 0
    const noIds = async () => ({ data: pages[n++] ?? [], error: null })
    expect(await fetchAllPages(noIds, 2)).toHaveLength(2)
  })

  it('rejects a nonsense page size rather than looping forever', async () => {
    await expect(fetchAllPages(async () => ({ data: [], error: null }), 0)).rejects.toThrow('positive integer')
  })
})
