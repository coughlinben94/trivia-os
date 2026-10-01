// One slide's view of the audio director (Plan 2). A slide describes its clip and calls
// play/stop/toggle; this hook owns the handle, releases it when the clip changes or the
// slide unmounts, and reads "was it blocked?" from the director's shared snapshot.
// Slides never touch AudioContext, Audio or YT.Player.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { director } from './director.js'

// Value-stable identity for a clip: callers build a fresh clip object every render.
const idOf = c => (c ? `${c.kind}|${c.part ?? 0}|${c.videoId ?? c.url}|${c.start ?? 0}|${c.end ?? ''}|${c.gainDb ?? ''}|${c.volume ?? ''}` : '')

export function useClipPlayback(clip, { slideId, autoPlay = false, isPreview = false, dir = director } = {}) {
  const snap = useSyncExternalStore(dir.subscribe, dir.getSnapshot)
  const [active, setActive] = useState(false)
  const handleRef = useRef(null)
  const clipRef = useRef(clip)
  clipRef.current = clip
  const clipId = idOf(clip)

  // Pre-build the player before the press (not in the host's preview pane).
  useEffect(() => {
    if (clipRef.current && !isPreview) dir.warm(clipRef.current)
  }, [clipId, isPreview, dir])

  // The clip changed (next series part) or the slide left: give the player back.
  useEffect(() => () => {
    handleRef.current?.release()
    handleRef.current = null
    setActive(false)
  }, [clipId, slideId])

  const play = useCallback(() => {
    if (!clipRef.current) return null
    let h
    try { h = dir.play(clipRef.current, { slideId }) } catch { return null } // a malformed clip is a report, not a crash
    handleRef.current = h
    setActive(true)
    h.onEnded(() => { if (handleRef.current === h) setActive(false) })
    h.onFailed?.(() => { if (handleRef.current === h) setActive(false) }) // a dead clip is not "playing"
    return h
  }, [dir, slideId])

  const stop = useCallback(() => {
    handleRef.current?.stop()
    setActive(false)
  }, [])

  // A press on a clip that was asked but is not sounding yet (pending/blocked) is a RETRY, never
  // a stop: the TV's gesture handler may already have restarted it on this same pointerdown,
  // and a stop here would turn a recovered clip back into silence.
  const toggle = useCallback(() => {
    const h = handleRef.current
    if (!h || !active || h.state === 'failed') return play()
    if (h.state === 'playing' || h.state === 'paused') return stop()
    return dir.retryBlocked()
  }, [active, play, stop, dir])

  // Plain-question 'advance' mode: start as the slide mounts (mount-only on purpose; a
  // Prev back into the slide remounts it and plays again).
  useEffect(() => {
    if (autoPlay && !isPreview && clipRef.current) play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const part = clip?.part ?? 0
  const blocked = active && snap.blocked.some(b => b.slideId === slideId && b.part === part)
  const retry = useCallback(() => dir.retryBlocked(), [dir])

  return { active, blocked, play, stop, toggle, retry }
}
