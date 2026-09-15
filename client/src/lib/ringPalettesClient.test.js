import { describe, it, expect, vi } from 'vitest'

// ringPalettesClient.js imports the real Supabase client. Stub it and
// capture what gets sent, same pattern as hostPhotos.test.js.
const insertMock = vi.fn(() => ({ error: null }))
const selectMock = vi.fn()
vi.mock('./supabase.js', () => ({
  supabase: {
    from: () => ({
      select: (...args) => {
        selectMock(...args)
        return { eq: () => ({ eq: () => ({ then: resolve => resolve({ data: [], error: null }) }) }) }
      },
      insert: (...args) => insertMock(...args),
    }),
  },
}))

const { findMatch, saveAsPending, fetchCertifiedPalettes } = await import('./ringPalettesClient.js')

const PALETTE = { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35], drift: { arc: 60 } }

describe('fetchCertifiedPalettes', () => {
  it('selects the stations column alongside the palette fields', async () => {
    await fetchCertifiedPalettes()
    expect(selectMock).toHaveBeenCalledWith(expect.stringContaining('stations'))
  })
})

describe('findMatch', () => {
  it('matches an existing palette-only row (no stations on either side)', () => {
    const shelf = [{ id: '1', ...PALETTE }]
    expect(findMatch(shelf, PALETTE)).toBe(shelf[0])
  })

  it('does not match when stations differ', () => {
    const shelf = [{ id: '1', ...PALETTE, stations: ['a', 'b'] }]
    expect(findMatch(shelf, { ...PALETTE, stations: ['a', 'c'] })).toBeUndefined()
  })

  it('matches when both sides have the same stations array', () => {
    const shelf = [{ id: '1', ...PALETTE, stations: ['a', 'b'] }]
    expect(findMatch(shelf, { ...PALETTE, stations: ['a', 'b'] })).toBe(shelf[0])
  })

  it('treats a row with no stations key the same as stations: null', () => {
    const shelf = [{ id: '1', ...PALETTE }] // no `stations` key at all
    expect(findMatch(shelf, { ...PALETTE, stations: null })).toBe(shelf[0])
    expect(findMatch(shelf, { ...PALETTE })).toBe(shelf[0])
  })
})

describe('saveAsPending', () => {
  it('inserts with stations: null when not given (today\'s palette-only flow)', async () => {
    await saveAsPending(PALETTE)
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ ...PALETTE, stations: null }))
  })

  it('inserts the given stations array', async () => {
    await saveAsPending({ ...PALETTE, stations: ['a', 'b'] })
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ stations: ['a', 'b'] }))
  })
})
