// The laptop side of the iPad remote, as pure pieces (spec §7-§8):
// buildSnapshot  — the one `state` message /host sends
// hostReply      — what /host answers to each relay message (beat, cmd)
// makeSnapshotSender — "only when changed, at most every 150ms", with a reset
//                  for every socket open so a restarted relay gets a snapshot
// hostChipText   — the Live Mode chip's plain-English line
import { slidePickerLabel } from './slidePickerLabel.js'

export function buildSnapshot({ slides, index, showState, cue, busy = false, paused = false }) {
  const slide = slides[index] ?? null
  return {
    type: 'state',
    slide: slide ? { index, total: slides.length, id: slide.id, label: slidePickerLabel(slide), type: slide.type } : null,
    cue: cue.label, gate: cue.gate,
    upNext: slides.slice(index + 1, index + 3).map(s => ({ label: slidePickerLabel(s), type: s.type })),
    toggles: {
      answerReveal: !!showState.answerReveal,
      scoreboardVisible: !!showState.scoreboardVisible,
      scoresRevealed: !!showState.scoresRevealed,
    },
    busy, paused,
  }
}

export function hostReply(msg, { run, now, visibility }) {
  if (msg?.type === 'relay-beat') return { type: 'beat', laptopNow: now, visibility }
  if (msg?.type !== 'cmd') return null
  let res
  try {
    res = run({ cmd: msg.cmd, via: 'remote', args: msg.args ?? {}, expectSlideId: msg.expectSlideId ?? null, sentAt: msg.sentAt ?? null })
  } catch (e) {
    console.error('[remote] command threw', e)
    res = { refuse: 'error' }
  }
  return res?.refuse ? { type: 'result', id: msg.id, refused: res.refuse } : { type: 'result', id: msg.id, received: true }
}

export function makeSnapshotSender(transmit, { gapMs = 150, now = Date.now, later = setTimeout } = {}) {
  let last = null
  let lastAt = -Infinity
  let timer = null
  let pending = null
  function offer(body) {
    pending = body
    if (timer) return
    const wait = lastAt + gapMs - now()
    if (wait > 0) {
      timer = later(() => { timer = null; offer(pending) }, wait)
      return
    }
    if (body === last) return
    // transmit returns false when it couldn't send (socket not open yet):
    // not counted, so the snapshot goes out the moment the socket opens.
    if (transmit(body) === false) return
    last = body
    lastAt = now()
  }
  return { offer, reset() { last = null } }
}

export function hostChipText({ enabled, status, remotes = 0, paused = false }) {
  if (!enabled) return 'iPad remote: off'
  if (status === 'replaced') return 'Another /host tab took over the iPad remote'
  if (status === 'connecting') return 'iPad remote: connecting…'
  if (status !== 'open') return 'iPad remote: relay not running, or Chrome blocked local network access for this site (Site settings)'
  if (paused) return 'iPad remote: paused'
  return remotes > 0 ? 'iPad remote: connected' : 'iPad remote: no iPad'
}
