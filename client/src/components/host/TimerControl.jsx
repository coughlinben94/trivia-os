import { useState, useEffect, useRef } from 'react'
import {
  parseMinutes, startTimer, pauseTimer, resumeTimer, addTime, timerView,
} from '../../lib/showTimer.js'

// Live Mode's countdown timer card. Writes shows.special_event.timer through
// actions.setShowTimer; /display's TimerOverlay draws it over any slide. No
// hotkey on purpose (A/S/R and the arrows are all taken and a stray key
// mid-show must never start a clock). The input blurs after every action so the
// Stream Deck arrows keep working: LiveMode's key handler ignores keys while an
// input has focus.
export default function TimerControl({ show, actions }) {
  const timer = show?.special_event?.timer ?? null
  const [text, setText] = useState('')
  const [now, setNow] = useState(() => Date.now())
  // Cancel kills a live countdown on every TV, so while one is running it takes two
  // taps (same arm-then-confirm the phone boards use for "Clear all"); it disarms itself.
  const [cancelArmed, setCancelArmed] = useState(false)
  useEffect(() => {
    if (!cancelArmed) return undefined
    const t = setTimeout(() => setCancelArmed(false), 3000)
    return () => clearTimeout(t)
  }, [cancelArmed])
  const inputRef = useRef(null)

  useEffect(() => {
    if (!timer) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [timer?.id, timer?.sentAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const view = timerView(timer, now, 0)
  const live = view.phase !== 'idle' && view.phase !== 'done' // running, urgent or paused
  const ms = parseMinutes(text)
  const canStart = ms != null

  function send(next) {
    actions.setShowTimer(next)
    inputRef.current?.blur()
    document.activeElement?.blur?.()
  }
  function start() {
    if (!canStart) return
    send(startTimer(ms, Date.now()))
    setText('')
  }

  const btn = 'px-3 py-2 rounded-lg text-sm font-semibold transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]'
  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shrink-0" data-timer-control>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400">Timer on the TV</p>
        {view.phase !== 'idle' && (
          <span
            className={`text-2xl font-bold tabular-nums ${view.phase === 'urgent' ? 'text-red-600' : view.phase === 'done' ? 'text-red-600' : 'text-gray-900'}`}
            data-timer-readout
          >
            {view.phase === 'done' ? "Time's up" : view.label}
            {view.phase === 'paused' && <span className="text-xs font-semibold text-gray-400 ml-2">paused</span>}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); start() } }}
          placeholder="minutes (e.g. 1.5)"
          aria-label="Timer minutes"
          className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
        />
        <button
          onClick={start}
          disabled={!canStart}
          title={live ? 'Replace the running timer with a new one' : 'Start the timer on the TV'}
          className={`${btn} ${canStart ? 'bg-baynes-forest text-white hover:opacity-90' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
        >
          {live ? 'Restart' : 'Start'}
        </button>
      </div>
      {text.trim() !== '' && !canStart && (
        <p className="text-xs text-red-600 mt-2">Type minutes from 0.05 to 180, like 5 or 1.5.</p>
      )}

      {view.phase !== 'idle' && (
        <div className="flex items-center gap-2 mt-3">
          {live && (
            <button
              onClick={() => send(view.phase === 'paused' ? resumeTimer(timer, Date.now()) : pauseTimer(timer, Date.now()))}
              className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`}
            >
              {view.phase === 'paused' ? 'Resume' : 'Pause'}
            </button>
          )}
          <button
            onClick={() => send(addTime(timer, 60000, Date.now()))}
            className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`}
          >
            +1 min
          </button>
          <button
            onClick={() => {
              if (view.phase === 'done') { send(null); return }
              if (!cancelArmed) { setCancelArmed(true); return }
              setCancelArmed(false)
              send(null)
            }}
            className={`${btn} border ml-auto ${cancelArmed ? 'border-red-300 text-red-600 bg-red-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {view.phase === 'done' ? 'Clear' : cancelArmed ? 'Tap again to cancel' : 'Cancel'}
          </button>
        </div>
      )}
    </div>
  )
}
