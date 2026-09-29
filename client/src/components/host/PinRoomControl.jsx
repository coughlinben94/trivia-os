import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { payableRoomSize, scoringGroupSize } from '../../lib/pinScoring.js'

// Shows the host the room size Pin It will use BEFORE they lock, with an
// override. "Room" = teams that can actually be paid (live team + scoreboard row).
export default function PinRoomControl({ showId, override, onOverride }) {
  const [counted, setCounted] = useState(null)
  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('teams').select('id, name').eq('show_id', showId),
      supabase.from('scoreboard_teams').select('id, name').eq('show_id', showId),
    ]).then(([t, s]) => { if (!cancelled) setCounted(payableRoomSize(t.data ?? [], s.data ?? [])) })
    return () => { cancelled = true }
  }, [showId])

  const size = Number.isFinite(override) && override > 0 ? override : counted
  return (
    <div className="mb-3 flex items-center gap-2 text-xs text-gray-600">
      <span>
        Room counted: <strong>{counted ?? '…'}</strong>
        {size != null && <> — top <strong>{scoringGroupSize(size)}</strong> score</>}
      </span>
      <label className="ml-auto flex items-center gap-1">
        Override
        <input
          type="number" min={1} max={99}
          value={override ?? ''}
          placeholder="—"
          onChange={e => { const n = parseInt(e.target.value, 10); onOverride(Number.isFinite(n) && n > 0 ? n : null) }}
          className="w-14 rounded border border-gray-300 px-1.5 py-1 text-center text-xs"
        />
      </label>
    </div>
  )
}
