import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

// TV-side "N of M teams submitted" feed for the phone-scored Shiny mechanics.
// Polled, not a postgres_changes subscription: /display is anonymous and
// phone_answers' SELECT policy never opens to it, so Realtime would never
// deliver. phone_answers_count(slide_id) is the SECURITY DEFINER count.
//   pollStop  — stop polling the count (usually locked || revealed)
//   teamsStop — skip the one-shot team head-count (Choice/Order/Matching/Hues:
//               revealed; Drop: locked)
//   teams     — false when the caller runs its own teams query (Pin)
export function usePhoneSubmitCounts(slideId, showId, { pollStop = false, teamsStop = false, teams = true } = {}) {
  const [submitted, setSubmitted] = useState(0)
  const [teamCount, setTeamCount] = useState(0)

  useEffect(() => {
    if (pollStop) return
    let cancelled = false
    async function load() {
      const { data: count } = await supabase.rpc('phone_answers_count', { p_slide_id: slideId })
      if (!cancelled) setSubmitted(count ?? 0)
    }
    load()
    const interval = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [slideId, pollStop])

  useEffect(() => {
    if (!teams || !showId || teamsStop) return
    let cancelled = false
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('show_id', showId)
      .then(({ count }) => { if (!cancelled) setTeamCount(count ?? 0) })
    return () => { cancelled = true }
  }, [showId, teamsStop, teams])

  return { submitted, teamCount }
}
