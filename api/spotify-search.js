import { createClient } from '@supabase/supabase-js'
import { getSpotifyToken } from './_lib/spotify-token.js'

export default async function handler(req, res) {
  const authHeader = req.headers.authorization ?? ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!accessToken) return res.status(401).json({ error: 'not authenticated' })

  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data: { user }, error: authError } = await sb.auth.getUser(accessToken)
  if (authError || user?.app_metadata?.host_verified !== true) {
    return res.status(403).json({ error: 'host verification required' })
  }

  const q = (req.query.q || '').trim()
  if (!q) return res.status(200).json({ tracks: [] })

  try {
    const token = await getSpotifyToken()
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`
    const searchRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!searchRes.ok) throw new Error(`Spotify search failed: ${searchRes.status}`)
    const data = await searchRes.json()

    const tracks = (data.tracks?.items ?? []).map(t => ({
      spotifyId: t.id,
      title: t.name,
      artist: t.artists.map(a => a.name).join(', '),
      artworkUrl: t.album?.images?.[2]?.url ?? t.album?.images?.[0]?.url ?? null,
    }))
    res.status(200).json({ tracks })
  } catch (e) {
    res.status(502).json({ error: e.message ?? 'Spotify search failed' })
  }
}
