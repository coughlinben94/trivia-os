// The bodies of Jukebox.jsx's two key handlers, lifted out whole so the
// keyboard (Space, b) and the iPad remote (through /display's relay peer)
// run the exact same path with the exact same guards (spec §17.2). The
// keydown handlers still do their own key/repeat/input-focus checks first.

// Whether the black cover sits over the library grid. On the TV break overlay
// (ringMode) the library must never paint (Ben, 2026-09-30: "I never want it to
// be visible at all") — before this it was covered only while a handoff was
// pending, so a stopped jukebox left the library on the TV until the show
// finished advancing. The standalone /music page keeps its library.
export function libraryCoverUp({ ringMode, libHandoffPending, showLive }) {
  if (showLive) return false // LiveScreen draws its own backdrop
  return ringMode || libHandoffPending
}

// Space: play/stop. Returns what it did; 'modal' and 'handoff' mean it did
// nothing and the key is not claimed (no preventDefault), as before.
export function togglePlay({ modalTrack, libHandoffPending, isPlaying, liveEnding, handleStop, startShuffle }) {
  if (modalTrack) return 'modal'
  // The grading-break handoff owns playback until it resolves or gives up.
  if (libHandoffPending) return 'handoff'
  if (isPlaying) { handleStop(); return 'stop' }
  // While LiveScreen animates out, ignore play; stop is already a no-op here.
  if (liveEnding) return 'ending'
  startShuffle()
  return 'shuffle'
}

// b / Back to Trivia: stop with the exit animation, flush, hand back to the
// show. Returns { result, done }: result is 'started' | 'already' | 'modal'
// | 'no-exit', done resolves when the hand-back has run (started only).
export function exitToShow({
  modalTrack, firedRef, isPlaying, showLive, setLibHandoffPending, handleStop, wait, flushPendingWrite, onExitToShow,
}) {
  if (modalTrack) return { result: 'modal', done: Promise.resolve() }
  if (!onExitToShow) return { result: 'no-exit', done: Promise.resolve() }
  // A real second press (Stream Deck bounce, or the iPad after the key) must
  // not run this twice.
  if (firedRef.current) return { result: 'already', done: Promise.resolve() }
  firedRef.current = true
  const done = (async () => {
    if (isPlaying || showLive) {
      // Re-cover the library so it doesn't flash while the advance lands.
      setLibHandoffPending(true)
      handleStop()
      await wait() // LiveScreen's exit sequence (EXIT_TOTAL_MS)
    }
    // Flush any debounced Supabase write before the overlay unmounts.
    await flushPendingWrite()
    onExitToShow?.()
  })()
  return { result: 'started', done }
}
