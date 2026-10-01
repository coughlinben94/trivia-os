// The team-intro ("ceremony") theme on /display, through the audio director. Behavior carried over
// verbatim from TeamPickerSlide's old in-slide <audio> code (2026-08-25 / 2026-09-14 / 2026-09-24):
//  - The file is ~16 min and plays from 3:01 (its own built-in fade-in runs 3:01-3:04); native
//    `loop` would restart at 0:00, so the clip carries loopTo = 3:01 instead.
//  - Fresh entry (currentPart 0): silent through the entrance wipe, then starts just before the
//    first item grows (revealMs - startLeadMs) at level 0 and fades up over fadeInMs.
//  - A MOUNT mid-ceremony (currentPart > 0: reload, stale-chunk reload) resumes where the roll
//    would be now (181s + currentPart * holdMs), at full level, no fade: "already playing" reads
//    far less broken than "restarting".
//  - `settled` (the ring-world wipe leaving) fades out over revealMs then stops; backing out of
//    settled before it finishes cancels the stop and snaps the level back up.
//  - The loudness correction (RMS analysis of the real file, getGainDb) can resolve long after
//    the clip started; it is applied on the live handle without disturbing a fade.
//  - Never in the slide editor's preview pane.
import { useEffect, useMemo, useRef } from 'react'
import { useClipPlayback } from './useClipPlayback.js'

export const TEAM_INTRO_URL = '/audio/team-intro-theme.mp3'
export const TEAM_INTRO_START_S = 3 * 60 + 1
const AUDIO_VOL = 1

export function useTeamIntroAudio({
  slideId, isPreview, currentPart, settled, getGainDb,
  startS = TEAM_INTRO_START_S, holdMs, revealMs, fadeInMs = 4000, startLeadMs = 200, dir,
}) {
  // Fixed at mount: where this mount starts is decided once.
  const clip = useMemo(() => ({
    kind: 'file',
    url: TEAM_INTRO_URL,
    start: currentPart > 0 ? startS + (currentPart * holdMs) / 1000 : startS,
    loopTo: startS,
    gainDb: 0,
    part: 0,
  }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const playback = useClipPlayback(clip, { slideId, isPreview, ...(dir ? { dir } : null) })
  const { play } = playback
  const handleRef = useRef(null)
  const gainDbRef = useRef(null)
  const everSettledRef = useRef(false)
  const stopTimerRef = useRef(null)

  useEffect(() => {
    if (isPreview) return undefined
    let timer = null
    let alive = true
    const begin = level => {
      const h = play({ level })
      handleRef.current = h
      if (h && gainDbRef.current != null) h.setGainDb(gainDbRef.current)
      return h
    }
    Promise.resolve(getGainDb?.()).then(db => {
      if (!alive || typeof db !== 'number') return
      gainDbRef.current = db
      handleRef.current?.setGainDb(db)
    }).catch(() => {})
    if (currentPart > 0) {
      begin(AUDIO_VOL)
    } else {
      timer = setTimeout(() => {
        if (everSettledRef.current) return // the wipe already left: never start the music
        const h = begin(0)
        h?.setLevel(AUDIO_VOL, fadeInMs)
      }, Math.max(0, revealMs - startLeadMs))
    }
    return () => { alive = false; clearTimeout(timer) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = handleRef.current
    if (!settled) {
      // Only a real back-out snaps back up: on mount settled is also false, but nothing has
      // happened yet and the fade-in must run on its own schedule.
      if (everSettledRef.current) h?.setLevel(AUDIO_VOL) // (the effect cleanup already cancelled the pending stop)
      return undefined
    }
    everSettledRef.current = true
    h?.setLevel(0, revealMs)
    stopTimerRef.current = setTimeout(() => h?.stop(), revealMs)
    return () => clearTimeout(stopTimerRef.current)
  }, [settled]) // eslint-disable-line react-hooks/exhaustive-deps

  return { blocked: playback.blocked, retry: playback.retry }
}
