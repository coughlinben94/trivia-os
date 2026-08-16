import Jukebox from '../../jukebox/components/Jukebox.jsx'
import { hasSpotifySession } from '../../jukebox/SpotifyConnectGate.jsx'

// Full-screen music layer for grading breaks — an OVERLAY over the live
// grading-break slide, not a slide type (see the 2026-08-16 jukebox plan §A1).
// Mounts the ported Jukebox with initialLib, which reuses the exact same
// auto-shuffle flow the standalone app's ?lib= handoff ran: sync jukebox_state,
// select the set, shuffle, open LiveScreen with the turntable entrance.
// The 'b'-hold inside Jukebox fires onExit (Display advances the show).
// Escape inside LiveScreen falls back to the library UI on the TV — identical
// to today's standalone behavior on the same screen.
//
// If Spotify was never connected in this browser, render a quiet host-facing
// banner instead of a login prompt on the live TV — the break simply stays on
// the grading-break slide, and the show is not blocked.
export default function JukeboxBreakOverlay({ lib, onExit }) {
  if (!hasSpotifySession()) {
    return (
      <div className="fixed left-1/2 -translate-x-1/2 z-[70] pointer-events-none" style={{ bottom: 24 }}>
        <span className="text-xs font-semibold text-white/80 bg-black/70 border border-white/15 px-4 py-2 rounded-full">
          🎵 Spotify not connected — open /music on the host laptop to connect
        </span>
      </div>
    )
  }
  return (
    <div className="fixed inset-0 z-[70] bg-black">
      <Jukebox initialLib={lib} onExitToShow={onExit} onLogout={() => {}} />
    </div>
  )
}
