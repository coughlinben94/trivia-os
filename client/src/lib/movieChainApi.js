export async function movieChainRequest(action, params = {}, fetcher = fetch, signal) {
  const query = new URLSearchParams({ action })
  for (const [key, value] of Object.entries(params)) {
    if (value != null) query.set(key, String(value))
  }
  const response = await fetcher(`/api/movie-chain?${query}`, { signal: signal ?? AbortSignal.timeout(20000) })
  const body = await response.json()
  if (!response.ok) throw new Error(body?.error ?? 'Movie lookup failed')
  return body
}
