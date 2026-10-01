// The laptop side of the iPad remote, as pure pieces (spec §7-§8):
// buildSnapshot  — the one `state` message /host sends
// hostReply      — what /host answers to each relay message (beat, cmd)
// makeSnapshotSender — "only when changed, at most every 150ms", with a reset
//                  for every socket open so a restarted relay gets a snapshot
// hostChipText   — the Live Mode chip's plain-English line
import { slidePickerLabel } from './slidePickerLabel.js'
import { resolveShinyPart } from './shinySeries.js'

// The cue card: what Ben reads aloud, and the answer he checks a table's
// shout against, on the iPad. Same source the laptop's Live Mode card reads
// (resolveShinyPart), so both show the same part of a series. The answer
// travels only over the private relay to the paired iPad, never Supabase,
// and the iPad keeps it hidden until a finger is held down. Question slides
// only; anything else sends null and the iPad shows no card.
export function buildCard(slide) {
  if (slide?.type !== 'question' || !slide.data) return null
  const data = slide.data
  const part = resolveShinyPart(data)
  const multi = Array.isArray(data.parts) && data.parts.length > 1
  const label = data.questionNumber != null ? (data.questionLabel || `Q${data.questionNumber}`) : null
  return {
    label,
    text: part.text || '',
    answer: part.answer || null,
    subtitle: part.subtitle || null,
    part: multi ? { i: Math.min(Math.max(data.currentPart ?? 0, 0), data.parts.length - 1), n: data.parts.length } : null,
    isShiny: !!data.isShiny,
  }
}

// The Jump drawer's list: every slide, labelled like the laptop's Go Live
// picker, with its round so the iPad can group rows and name the target in
// its confirm ("Jump to Round 3 Q4?").
function jumpList(slides, rounds = []) {
  return slides.map((s, index) => {
    const i = s.roundId ? rounds.findIndex(r => r.id === s.roundId) : -1
    const round = i === -1 ? null : rounds[i]
    return {
      index, id: s.id, label: slidePickerLabel(s), type: s.type,
      round: round ? `Round ${round.number ?? i + 1}` : null,
      roundTitle: round?.title ?? null,
    }
  })
}

// scores: the Scores drawer's view (scoreCellWrite scoresView + `last`),
// attached only while the iPad has the drawer open; null otherwise.
export function buildSnapshot({ slides, index, showState, cue, busy = false, paused = false, rounds = [], jumpBusy = false, fix = null, scoreQueueDepth = 0, scores = null, timer = null }) {
  const slide = slides[index] ?? null
  return {
    type: 'state',
    slide: slide ? { index, total: slides.length, id: slide.id, label: slidePickerLabel(slide), type: slide.type } : null,
    card: buildCard(slide),
    cue: cue.label, gate: cue.gate,
    upNext: slides.slice(index + 1, index + 3).map(s => ({ label: slidePickerLabel(s), type: s.type })),
    toggles: {
      answerReveal: !!showState.answerReveal,
      scoreboardVisible: !!showState.scoreboardVisible,
      scoresRevealed: !!showState.scoresRevealed,
    },
    busy, paused, jumpBusy, fix, scoreQueueDepth, scores,
    slides: jumpList(slides, rounds),
    // Only while a timer exists, so a show with none sends exactly what it always did.
    ...(timer ? { timer } : {}),
  }
}

// A command whose work finishes later (score.set on the score chain) returns
// { ok, later: Promise<{refuse} | {done}> }: the reply now is only "received",
// and `post` sends the outcome under the same id once it settles.
export function hostReply(msg, { run, now, visibility, post }) {
  if (msg?.type === 'relay-beat') return { type: 'beat', laptopNow: now, visibility }
  if (msg?.type !== 'cmd') return null
  let res
  try {
    res = run({ cmd: msg.cmd, via: 'remote', args: msg.args ?? {}, expectSlideId: msg.expectSlideId ?? null, sentAt: msg.sentAt ?? null })
  } catch (e) {
    console.error('[remote] command threw', e)
    res = { refuse: 'error' }
  }
  if (res?.later) {
    Promise.resolve(res.later)
      .then(r => (r?.refuse ? { type: 'result', id: msg.id, refused: r.refuse } : { type: 'result', id: msg.id, done: true, scoreSet: r?.done ?? null }))
      .catch(e => { console.error('[remote] command failed', e); return { type: 'result', id: msg.id, refused: 'error' } })
      .then(out => post?.(out))
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
