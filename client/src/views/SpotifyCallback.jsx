import { useEffect, useState } from 'react'
import { handleCallback } from '../jukebox/lib/spotify.js'

// Spotify PKCE redirect lands here (?code=...). Exchange, then bounce back to
// wherever auth started (stashed by SpotifyConnectGate). Registered on the
// Spotify app as <origin>/spotify-callback.
export default function SpotifyCallback() {
  const [error, setError] = useState(null)

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (!code) { window.location.replace('/music'); return }
    handleCallback(code)
      .then(() => {
        const returnTo = sessionStorage.getItem('oauth_return') ?? '/music'
        sessionStorage.removeItem('oauth_return')
        window.location.replace(returnTo)
      })
      .catch(err => { console.error('[SpotifyCallback]', err); setError('Spotify login failed — go back and try again.') })
  }, [])

  return (
    <div className="min-h-screen bg-base text-white flex items-center justify-center">
      {error
        ? <p className="text-sm text-red-400">{error}</p>
        : <div className="w-5 h-5 border-[1.5px] border-white/10 border-t-accent rounded-full animate-spin" />}
    </div>
  )
}
