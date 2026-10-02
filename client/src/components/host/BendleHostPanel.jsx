// client/src/components/host/BendleHostPanel.jsx
// LiveMode's lock/score pane for Bendle. The lock, results and overrides live
// on the step-3 slide (lockData); steps 1-2 only show how many teams have
// locked. Unlock deletes every team's guess, so it takes two taps.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { BENDLE_OVERRIDE_POINTS, guessLabel } from '../../lib/bendleGuessScoring.js'

const POLL_MS = 3000
const CONFIRM_MS = 4000
const DOUBLE_TAP_MS = 400 // a second click this soon is a double-click, not a confirm

export default function BendleHostPanel({ slide, lockData = {}, stepIds = [], showId, busy = false, error = null, onLock, onReveal, onUnlock = () => {}, onOverride = () => {} }) {
  const step = (slide?.data?.bendleStepIndex ?? 0) + 1
  const isLockStep = step === 3
  const locked = !!lockData.bendleLocked
  const revealed = !!lockData.bendleRevealed
  const results = Array.isArray(lockData.bendleResults) ? lockData.bendleResults : null
  const [counts, setCounts] = useState(null)
  const [confirmUnlock, setConfirmUnlock] = useState(false)
  const armedAt = useRef(0)
  const idsKey = stepIds.filter(Boolean).join('|')

  useEffect(() => {
    if (!showId || !idsKey || revealed) return undefined
    let dead = false
    async function poll() {
      try {
        const [answers, teams] = await Promise.all([
          supabase.from('phone_answers').select('team_id').in('slide_id', idsKey.split('|')),
          supabase.from('teams').select('id').eq('show_id', showId),
        ])
        if (dead || answers.error || teams.error) return
        setCounts({ locked: new Set((answers.data ?? []).map(r => r.team_id)).size, total: (teams.data ?? []).length })
      } catch { /* the next poll retries */ }
    }
    poll()
    const t = setInterval(poll, POLL_MS)
    return () => { dead = true; clearInterval(t) }
  }, [showId, idsKey, revealed])

  // any change to the lock, the busy flag or the slide drops a half-finished unlock
  useEffect(() => { setConfirmUnlock(false) }, [locked, busy, slide?.id])

  useEffect(() => {
    if (!confirmUnlock) return undefined
    const t = setTimeout(() => setConfirmUnlock(false), CONFIRM_MS)
    return () => clearTimeout(t)
  }, [confirmUnlock])

  const status = !isLockStep
    ? `Bendle step ${step} of 3. Phones are open; the lock happens on step 3.`
    : revealed
      ? 'Results are on the TV. Change a team’s points below if needed.'
      : locked
        ? 'Guesses locked. Press A to reveal and score.'
        : 'Step 3. Next plays the clip; the next Next locks guesses.'
  const mainLabel = busy ? 'Working…' : revealed ? '🔁 Retry Scoring' : locked ? 'Reveal & Score (A)' : '🔒 Lock Guesses'

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
      <p className="text-xs text-gray-400 mb-1">{status}</p>
      {counts && !revealed && (
        <p className="text-sm font-semibold text-gray-700 mb-3">{counts.locked} of {counts.total} teams locked a guess</p>
      )}
      {isLockStep && (!revealed || error) && (
        <button
          onClick={locked ? onReveal : onLock}
          disabled={busy}
          className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
            busy ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'
          }`}
        >
          {mainLabel}
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-2 text-center">{error}</p>}
      {isLockStep && revealed && results && (
        <div className="mt-3 max-h-72 overflow-y-auto space-y-1.5">
          <p className="text-xs font-semibold text-gray-600">Team results · set points by hand</p>
          {results.map(r => (
            <div key={r.teamId} className="flex items-center justify-between gap-2 text-xs text-gray-700">
              <span className="truncate">
                {r.points > 0 ? '✓' : '✗'} {r.teamName}: {guessLabel(r.guess)}{r.guess && r.stepIndex != null ? ` · step ${r.stepIndex + 1}` : ''}
              </span>
              <select
                aria-label={`Set ${r.teamName} points`}
                value={r.points}
                disabled={busy}
                onChange={e => onOverride(r.teamId, Number(e.target.value))}
                className="min-h-[44px] rounded-lg border border-gray-200 px-3 py-1 text-gray-900"
              >
                {BENDLE_OVERRIDE_POINTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      {isLockStep && locked && (
        <button
          onClick={() => {
            if (!confirmUnlock) { armedAt.current = Date.now(); setConfirmUnlock(true); return }
            if (Date.now() - armedAt.current < DOUBLE_TAP_MS) return
            setConfirmUnlock(false)
            onUnlock()
          }}
          onBlur={() => setConfirmUnlock(false)}
          disabled={busy}
          className="w-full mt-2 min-h-[44px] py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
        >
          {confirmUnlock ? 'Tap again: clears every team’s guess' : '🔓 Unlock — clear every guess and reopen phones'}
        </button>
      )}
    </div>
  )
}
