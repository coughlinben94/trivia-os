import { useEffect, useState } from 'react'
import { login, getToken } from './lib/spotify.js'

// Wraps any jukebox surface: resolves the stored Spotify session (refreshing
// if stale), or shows the Connect button. `returnTo` is stashed so the
// /spotify-callback route can restore the page the user started from.
// `renderDisconnected` lets the display overlay show a quiet banner instead
// of a login prompt on the live TV.
export default function SpotifyConnectGate({ children, returnTo = '/music', renderDisconnected = null }) {
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // refreshToken() already swallows network/timeout failures and returns
    // null, but a malformed token response can still reject — catch so a bad
    // refresh degrades to the Connect button instead of an unhandled rejection.
    getToken()
      .then(setToken)
      .catch(err => { console.error('[SpotifyConnectGate]', err); setError('Could not reach Spotify — try connecting again.') })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    // renderDisconnected is only passed by JukeboxBreakOverlay — skip the
    // opaque bg-base there so the still-visible grading-break slide shows
    // through during the brief getToken() round-trip instead of being
    // blacked out. The standalone /music page (no renderDisconnected) keeps
    // its normal full-screen background.
    return (
      <div className={`min-h-screen flex items-center justify-center ${renderDisconnected ? '' : 'bg-base'}`}>
        <div className="w-5 h-5 border-[1.5px] border-white/10 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (!token) {
    if (renderDisconnected) return renderDisconnected
    return (
      <div className="min-h-screen bg-base text-white flex flex-col items-center justify-center gap-8">
        <div className="text-center space-y-2">
          <div className="text-5xl mb-4">🎵</div>
          <h1 className="text-2xl font-semibold tracking-tight">Music Library</h1>
          <p className="text-sm text-white/60">Connect Spotify to manage songs and play breaks</p>
        </div>
        <button
          onClick={() => { sessionStorage.setItem('oauth_return', returnTo); login() }}
          className="bg-accent hover:bg-accent-hover text-black text-sm font-semibold px-7 py-3 rounded-full transition-all duration-150 active:scale-[0.97]"
        >
          Connect Spotify
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    )
  }

  return children
}

// Synchronous check for callers that must not render a login UI (the display
// overlay): a stored refresh token means getToken() can mint access tokens.
export function hasSpotifySession() {
  return !!localStorage.getItem('spotify_refresh_token')
}
