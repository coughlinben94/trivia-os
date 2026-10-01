import { useEffect, useState } from 'react'
import { timerView } from '../lib/showTimer.js'
import { TIMER_PRESETS, TIMER_MAX_MINUTES } from '../lib/remoteProtocol.js'

// The iPad's timer: a tile on the main screen that shows the clock, and a
// drawer (Remote.jsx's Sheet) to start, pause, add a minute and cancel. Every
// press is a `timer.*` command to the laptop, which writes the same
// shows.special_event.timer its own Timer card does. Looks come from the
// --rl-* vars Remote.jsx sets on its root; no fonts or colours here.

// The timer as the laptop sees it right now. `offsetMs` is laptop clock minus
// iPad clock (Remote's offsetRef); timerView wants the opposite sign.
export function useTimerView(timer, offsetMs) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!timer) return undefined
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [timer?.id, timer?.sentAt]) // eslint-disable-line react-hooks/exhaustive-deps
  return timerView(timer, now, -offsetMs)
}

const WORD = { running: 'Running', urgent: 'Running', paused: 'Paused', done: 'Time’s up' }

// A shape as well as words: dot = running, bars = paused, ring = finished.
function PhaseMark({ phase, className = 'w-5 h-5' }) {
  if (phase === 'paused') {
    return <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.2" /><rect x="14" y="4" width="5" height="16" rx="1.2" /></svg>
  }
  if (phase === 'done') {
    return <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="3.4"><circle cx="12" cy="12" r="8" /></svg>
  }
  return <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><circle cx="12" cy="12" r="8" /></svg>
}

export function TimerTile({ timer, offsetMs, block, onOpen }) {
  const view = useTimerView(timer, offsetMs)
  const active = view.phase !== 'idle'
  const red = view.phase === 'urgent' || view.phase === 'done'
  return (
    <button
      data-k="timer-open"
      onClick={onOpen}
      disabled={!!block}
      className={`min-h-[72px] rounded-[var(--rl-r)] px-4 py-2 flex items-center gap-3 text-left shrink-0 min-w-0
        transition-transform duration-[120ms] ease-snap enabled:active:scale-[0.97]
        focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)] ${
        block
          ? 'bg-[color:var(--rl-night)] text-[color:var(--rl-text-50)] border-2 border-dashed border-[color:var(--rl-text-20)]'
          : 'bg-[color:var(--rl-raised)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-raised-press)]'
      }`}
    >
      <span className="text-2xl font-bold shrink-0">Timer</span>
      <span className="flex-1 min-w-0 flex flex-col items-end leading-tight">
        {block ? (
          <span className="text-[1rem] font-semibold">{block}</span>
        ) : active ? (
          <>
            <span className={`text-3xl font-bold tabular-nums ${red ? 'text-[color:var(--rl-red-bright)]' : ''}`} style={{ fontFamily: 'var(--rl-display)' }}>
              {view.phase === 'done' ? WORD.done : view.label}
            </span>
            {view.phase !== 'done' && (
              <span className="flex items-center gap-1.5 text-[1rem] font-semibold text-[color:var(--rl-text-75)]">
                <PhaseMark phase={view.phase} className="w-3.5 h-3.5" />
                {WORD[view.phase]}
              </span>
            )}
          </>
        ) : (
          <span className="text-[1rem] font-semibold text-[color:var(--rl-text-75)]">Tap to set</span>
        )}
      </span>
    </button>
  )
}

const press = 'transition-transform duration-[120ms] ease-snap enabled:active:scale-[0.97]'
const focus = 'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)]'
const raised = 'bg-[color:var(--rl-raised)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-raised-press)]'
const off = 'disabled:bg-[color:var(--rl-night)] disabled:text-[color:var(--rl-text-50)] disabled:border-2 disabled:border-dashed disabled:border-[color:var(--rl-text-20)]'
const go = `bg-[color:var(--rl-next)] text-[color:var(--rl-nextink)] active:bg-[color:var(--rl-next-press)] ${off}`

// timer: the laptop's shows.special_event.timer, as in the snapshot (or null).
// block: why the buttons are off ('Laptop not ready', 'Paused on the laptop') or null.
// send(cmd, args): sends one command (Remote.jsx's send, with its tap guard).
export function TimerPanel({ timer, offsetMs, block, send }) {
  const view = useTimerView(timer, offsetMs)
  const [minutes, setMinutes] = useState(null) // chosen number of minutes, or null
  const [custom, setCustom] = useState(false) // the number pad is open
  const [cancelArmed, setCancelArmed] = useState(false)
  useEffect(() => {
    if (!cancelArmed) return undefined
    const t = setTimeout(() => setCancelArmed(false), 3000)
    return () => clearTimeout(t)
  }, [cancelArmed])

  const live = view.phase === 'running' || view.phase === 'urgent' || view.phase === 'paused'
  const done = view.phase === 'done'
  const shown = view.phase !== 'idle'
  const timerId = timer?.id
  const can = !block
  const canStart = can && minutes != null
  const pick = m => { setCustom(false); setMinutes(m) }
  const digit = d => setMinutes(cur => {
    const next = (cur ?? 0) * 10 + d
    return next < 1 || next > TIMER_MAX_MINUTES ? cur : next
  })
  const clearPick = () => { setMinutes(null); setCustom(false) }
  const sendCancel = () => { setCancelArmed(false); send('timer.cancel', { timerId }) }

  const big = `min-h-[80px] rounded-[var(--rl-r)] px-5 text-2xl font-bold flex items-center justify-center gap-2 ${press} ${focus}`
  const red = view.phase === 'urgent' || done
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 pt-1 flex flex-col gap-4">
      {block && <p className="text-xl font-semibold text-[color:var(--rl-amber)]">{block}</p>}

      <div className="rounded-[var(--rl-r)] bg-[color:var(--rl-night)] px-6 py-3 flex items-center gap-5 min-h-[104px]" role="timer" aria-live="off">
        {shown ? (
          <>
            <span className={`text-[4.5rem] leading-none tabular-nums ${red ? 'text-[color:var(--rl-red-bright)]' : ''}`} style={{ fontFamily: 'var(--rl-display)' }} data-k="timer-readout">
              {done ? WORD.done : view.label}
            </span>
            {!done && (
              <span className="flex items-center gap-2 text-2xl font-bold text-[color:var(--rl-text-75)]">
                <PhaseMark phase={view.phase} />
                {WORD[view.phase]}
              </span>
            )}
          </>
        ) : (
          <span className="text-2xl font-semibold text-[color:var(--rl-text-75)]">No timer on the TV</span>
        )}
      </div>

      <div>
        <p className="text-[1rem] leading-6 font-semibold text-[color:var(--rl-text-75)] mb-2">
          {live ? 'Restart with a new time' : 'Minutes'}
        </p>
        <div className="grid grid-cols-6 gap-2">
          {TIMER_PRESETS.map(m => (
            <button
              key={m}
              data-k={`preset-${m}`}
              onClick={() => pick(m)}
              aria-pressed={!custom && minutes === m}
              className={`min-h-[72px] rounded-[var(--rl-r)] text-3xl font-bold tabular-nums ${press} ${focus} ${
                !custom && minutes === m ? 'bg-[color:var(--rl-text)] text-[color:var(--rl-nextink)]' : raised
              }`}
            >
              {m}
            </button>
          ))}
          <button
            data-k="preset-custom"
            onClick={() => { setCustom(true); setMinutes(null) }}
            aria-pressed={custom}
            className={`min-h-[72px] rounded-[var(--rl-r)] text-xl font-bold ${press} ${focus} ${
              custom ? 'bg-[color:var(--rl-text)] text-[color:var(--rl-nextink)]' : raised
            }`}
          >
            Other
          </button>
        </div>
        {custom && (
          <div className="mt-2 grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5].map(d => <PadKey key={d} d={d} onTap={digit} />)}
            <button data-k="pad-back" aria-label="Delete a digit" onClick={() => setMinutes(cur => (cur >= 10 ? Math.trunc(cur / 10) : null))}
              className={`min-h-[64px] rounded-[var(--rl-r)] text-3xl font-bold ${press} ${focus} ${raised}`}>{'⌫'}</button>
            {[6, 7, 8, 9, 0].map(d => <PadKey key={d} d={d} onTap={digit} />)}
            <span className="min-h-[64px] grid place-items-center text-xl font-semibold text-[color:var(--rl-text-75)]">min</span>
          </div>
        )}
      </div>

      {live ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <button data-k="timer-pause" disabled={!can}
              onClick={() => send(view.phase === 'paused' ? 'timer.resume' : 'timer.pause', { timerId })}
              className={`${big} ${raised} ${off}`}>
              {view.phase === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button data-k="timer-add" disabled={!can} onClick={() => send('timer.add', { timerId })} className={`${big} ${raised} ${off}`}>
              +1 min
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button data-k="timer-restart" disabled={!canStart}
              onClick={() => { send('timer.start', { minutes, replace: true }); clearPick() }}
              className={`${big} ${go}`}>
              {minutes != null ? `Restart ${minutes} min` : 'Restart'}
            </button>
            <button data-k="timer-cancel" disabled={!can}
              onClick={() => (cancelArmed ? sendCancel() : setCancelArmed(true))}
              className={`${big} border-[3px] ${off} ${cancelArmed ? 'border-[color:var(--rl-red-bright)] bg-[color:var(--rl-red)] text-[color:var(--rl-text)]' : 'border-[color:var(--rl-text-30)] text-[color:var(--rl-text)]'}`}>
              {cancelArmed ? 'Tap again to cancel' : 'Cancel timer'}
            </button>
          </div>
        </>
      ) : (
        <div className={`grid gap-3 ${done ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button data-k="timer-start" disabled={!canStart}
            onClick={() => { send('timer.start', { minutes }); clearPick() }}
            className={`${big} min-h-[96px] text-3xl ${done ? 'col-span-2' : ''} ${go}`}>
            {minutes != null ? `Start ${minutes} min` : 'Pick the minutes'}
          </button>
          {done && (
            <>
              <button data-k="timer-add" disabled={!can} onClick={() => send('timer.add', { timerId })} className={`${big} ${raised} ${off}`}>+1 min</button>
              <button data-k="timer-cancel" disabled={!can} onClick={() => send('timer.cancel', { timerId })} className={`${big} ${raised} ${off}`}>Clear</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PadKey({ d, onTap }) {
  return (
    <button data-k={`pad-${d}`} onClick={() => onTap(d)}
      className={`min-h-[64px] rounded-[var(--rl-r)] text-3xl font-bold tabular-nums ${press} ${focus} ${raised}`}>
      {d}
    </button>
  )
}
