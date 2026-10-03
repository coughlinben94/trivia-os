// client/src/lib/bendleSongExtras.test.js
import { describe, it, expect, vi } from 'vitest'
import { buildCatalogIndex, searchCatalog } from './bendleCatalog.js'
import { songKey, isInSongList, ensureSongInList, fetchExtras, mergeExtras } from './bendleSongExtras.js'

const catalog = buildCatalogIndex([['Mr. Brightside', 'The Killers', 60], ['Africa', 'Toto', 50]])
const okRpc = (data = true) => vi.fn(async () => ({ data, error: null }))

describe('songKey', () => {
  it('matches the catalog build key (normalized title|artist)', () => {
    expect(songKey({ title: 'The Middle (Remastered)', artist: 'Jimmy Eat World' })).toBe('middle|jimmy eat world')
    expect(songKey({ title: 'Mr. Brightside', artist: 'The Killers' })).toBe('mr brightside|killers')
  })
})

describe('isInSongList', () => {
  it('finds a catalog song despite "The", feat. and brackets', () => {
    expect(isInSongList({ title: 'Mr. Brightside [Live]', artist: 'Killers feat. Someone' }, catalog, [])).toBe(true)
    expect(isInSongList({ title: 'africa (2018 remaster)', artist: 'TOTO' }, catalog, [])).toBe(true)
  })
  it('finds a song in the extras', () => {
    expect(isInSongList({ title: 'Uptown Funk', artist: 'Mark Ronson' }, catalog, [{ title: 'Uptown Funk', artist: 'Mark Ronson', norm_key: 'uptown funk|mark ronson' }])).toBe(true)
  })
  it('misses a different artist (a cover)', () => {
    expect(isInSongList({ title: 'Africa', artist: 'Weezer' }, catalog, [])).toBe(false)
  })
})

describe('ensureSongInList', () => {
  it('returns present without calling the RPC when the song is listed', async () => {
    const rpc = okRpc()
    expect(await ensureSongInList({ title: 'Africa', artist: 'Toto' }, { catalogRows: catalog, extras: [], rpc })).toBe('present')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('adds a missing song with its normalized key', async () => {
    const rpc = okRpc(true)
    expect(await ensureSongInList({ title: ' Uptown Funk ', artist: 'Mark Ronson feat. Bruno Mars' }, { catalogRows: catalog, extras: [], rpc })).toBe('added')
    expect(rpc).toHaveBeenCalledWith('add_bendle_song_extra', { p_title: 'Uptown Funk', p_artist: 'Mark Ronson feat. Bruno Mars', p_norm_key: 'uptown funk|mark ronson' })
  })
  it('treats an RPC "already there" (false) as present', async () => {
    expect(await ensureSongInList({ title: 'Uptown Funk', artist: 'Mark Ronson' }, { catalogRows: catalog, extras: [], rpc: okRpc(false) })).toBe('present')
  })
  it('still adds when the extras failed to load (extras = null)', async () => {
    expect(await ensureSongInList({ title: 'Uptown Funk', artist: 'Mark Ronson' }, { catalogRows: catalog, extras: null, rpc: okRpc(true) })).toBe('added')
  })
  it('throws when the RPC fails', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'not authorized' } }))
    await expect(ensureSongInList({ title: 'Uptown Funk', artist: 'Mark Ronson' }, { catalogRows: catalog, extras: [], rpc })).rejects.toThrow('not authorized')
  })
  it('returns no-artist for a missing song with no artist (cannot be listed)', async () => {
    const rpc = okRpc()
    expect(await ensureSongInList({ title: 'Some Upload', artist: null }, { catalogRows: catalog, extras: [], rpc })).toBe('no-artist')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('fetchExtras', () => {
  it('returns rows, throws on error', async () => {
    const client = err => ({ from: () => ({ select: async () => ({ data: err ? null : [{ title: 'A', artist: 'B', norm_key: 'a|b' }], error: err }) }) })
    expect(await fetchExtras(client(null))).toEqual([{ title: 'A', artist: 'B', norm_key: 'a|b' }])
    await expect(fetchExtras(client({ message: 'boom' }))).rejects.toThrow('boom')
  })
})

describe('mergeExtras', () => {
  it('makes an extra searchable and skips one already in the catalog', () => {
    const merged = mergeExtras(catalog, [{ title: 'Uptown Funk', artist: 'Mark Ronson' }, { title: 'Africa', artist: 'Toto' }])
    expect(searchCatalog(merged, 'uptown')).toEqual([{ title: 'Uptown Funk', artist: 'Mark Ronson' }])
    expect(searchCatalog(merged, 'africa')).toEqual([{ title: 'Africa', artist: 'Toto' }])
    expect(mergeExtras(catalog, [])).toBe(catalog)
  })
})
