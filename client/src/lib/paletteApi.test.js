import { describe, it, expect, vi, afterEach } from 'vitest'
import handler from '../../../api/palette.js'

function run(url) {
  const out = { headers: {} }
  const res = {
    status(c) { out.status = c; return res },
    json(b) { out.body = b; return res },
    setHeader(k, v) { out.headers[k] = v },
  }
  return handler({ query: { url } }, res).then(() => out)
}
afterEach(() => vi.unstubAllGlobals())

describe('api/palette fetch handling', () => {
  it('502 with a clear message when the CDN answers non-2xx (not a vague 500)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    vi.stubGlobal('fetch', fetchMock)
    const out = await run('https://i.scdn.co/image/abc')
    expect(out.status).toBe(502)
    expect(out.body.error).toMatch(/404/)
  })
  it('passes a timeout signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    vi.stubGlobal('fetch', fetchMock)
    await run('https://i.scdn.co/image/abc')
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
  it('still rejects non-Spotify hosts before fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const out = await run('https://evil.example/?x=i.scdn.co')
    expect(out.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
