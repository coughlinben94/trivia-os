import HostPinGate from '../components/host/HostPinGate.jsx'
import SpotifyConnectGate from '../jukebox/SpotifyConnectGate.jsx'
import Jukebox from '../jukebox/components/Jukebox.jsx'

// Standing music-library manager — the ported jukebox's library UI (sets
// sidebar, song grid, Spotify search, SongDetailModal trim editor) as a host
// dashboard page. PIN gate is consistency/UX (jukebox_state RLS is anon-
// writable by design — QuickAdd depends on that). No initialLib/onExitToShow:
// this surface never auto-plays and never drives the show.
export default function Music() {
  return (
    <HostPinGate>
      <SpotifyConnectGate returnTo="/music">
        {/* Jukebox's Disconnect button calls spotify logout() itself, then
            onLogout — reload drops straight back to the Connect screen. */}
        <Jukebox onLogout={() => window.location.reload()} />
      </SpotifyConnectGate>
    </HostPinGate>
  )
}
