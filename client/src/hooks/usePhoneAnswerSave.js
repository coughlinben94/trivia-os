import { useCallback, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// The phone-answer save every /join board shares. One upsert per team+slide,
// queued behind the previous save so two quick taps land in tap order (a plain
// pair of upserts can finish out of order and leave the older answer saved).
// Raced against an 8s timeout so a request that never settles (dead wifi,
// captive portal) can't wedge every save queued behind it — the abandoned fetch
// may still resolve later, but nothing awaits it by then.
//
// submitted_at is NOT sent: a server-side trigger stamps it, so the phone's own
// clock never decides the host's lock cutoff.
//
// `board` and `noun` only shape the log line and timeout message.
export function usePhoneAnswerSave({ preview, slide, team, board, noun }) {
  const [saveFailed, setSaveFailed] = useState(false)
  const saveChainRef = useRef(Promise.resolve())

  const saveAnswer = useCallback((answer) => {
    if (preview) return Promise.resolve(true)
    const run = saveChainRef.current.then(async () => {
      const upsert = supabase.from('phone_answers').upsert(
        { show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id, answer },
        { onConflict: 'slide_id,team_id' }
      )
      let error
      try {
        ;({ error } = await Promise.race([
          upsert,
          new Promise((_, reject) => setTimeout(() => reject(new Error(`${noun} save timed out`)), 8000)),
        ]))
      } catch (err) {
        error = err
      }
      if (error) console.error(`[${board}] ${noun} save failed:`, error)
      setSaveFailed(!!error)
      return !error
    })
    saveChainRef.current = run.catch(() => false)
    return run
  }, [preview, slide.id, slide.showId, team.id, team.showId, board, noun])

  return { saveAnswer, saveFailed, setSaveFailed }
}
