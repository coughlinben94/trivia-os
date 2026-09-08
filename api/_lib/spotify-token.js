let cached = null // { token, expiresAt } — module-scope cache survives warm Vercel invocations

export async function getSpotifyToken() {
  if (cached && cached.expiresAt > Date.now()) return cached.token

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(
        `${process.env.VITE_SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Spotify token request failed: ${res.status}`)
  const data = await res.json()
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return cached.token
}
