import Jukebox from '../../jukebox/components/Jukebox.jsx'
import SpotifyConnectGate from '../../jukebox/SpotifyConnectGate.jsx'

// Full-screen music layer for grading breaks — an OVERLAY over the live
// grading-break slide, not a slide type (see the 2026-08-16 jukebox plan §A1).
// Mounts the ported Jukebox with initialLib, which reuses the exact same
// auto-shuffle flow the standalone app's ?lib= handoff ran: sync jukebox_state,
// select the set, shuffle, open LiveScreen with the turntable entrance.
// The 'b'-hold inside Jukebox fires onExit (Display advances the show).
// Escape inside LiveScreen falls back to the library UI on the TV — identical
// to today's standalone behavior on the same screen.
//
// If Spotify isn't actually usable right now, render a quiet host-facing
// banner instead of a login prompt on the live TV — the break simply stays on
// the grading-break slide, and the show is not blocked.
//
// 2026-08-16 (hyper-critique finding): this used to gate on a synchronous
// `hasSpotifySession()` — true the instant a *stored* refresh token exists,
// even a revoked or expired one. A revoked token passed that check, the
// overlay mounted Jukebox, and playback would silently fail on the live TV
// with no banner and no way to tell why. SpotifyConnectGate already does the
// real check (an actual getToken() round-trip, refreshing if stale) for the
// /music page's login screen — reusing it here via renderDisconnected gets
// the same real verification instead of a second, weaker reimplementation.
// SpotifyConnectGate's own `loading` state isn't fixed-positioned or
// transparent (it's built for a normal page, not a break-time overlay) —
// wrapped here in a transparent fixed layer so that brief getToken()
// round-trip doesn't render somewhere unpredictable in Display's layout.
// Stays transparent (no black bg) at this level on purpose: both the
// loading beat and the disconnected banner are meant to sit OVER the still-
// visible grading-break slide, not black it out — only the connected state
// (real Jukebox) should paint an opaque background, which it does itself.
const disconnectedBanner = (
  <div className="absolute inset-0 pointer-events-none flex items-end justify-center" style={{ paddingBottom: 24 }}>
    <span className="text-xs font-semibold text-white/80 bg-black/70 border border-white/15 px-4 py-2 rounded-full">
      🎵 Spotify not connected — open /music on the host laptop to connect
    </span>
  </div>
)

export default function JukeboxBreakOverlay({ lib, onExit }) {
  return (
    // data-break-overlay: Display.jsx's click/key step-through handlers bail
    // while this is mounted — the break's own b-hold is the advance path here,
    // and a click on a song row must not also step the show.
    <div className="fixed inset-0 z-[70]" data-break-overlay>
      <SpotifyConnectGate renderDisconnected={disconnectedBanner}>
        <div className="absolute inset-0 bg-black">
          <Jukebox initialLib={lib} onExitToShow={onExit} onLogout={() => {}} ringMode />
        </div>
      </SpotifyConnectGate>
    </div>
  )
}
