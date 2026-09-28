// A fake /host Live Mode peer for protocol tests. It DECIDES with the laptop's
// real planHostCommand / nextPressGate / buildSnapshot / hostReply / snapshot
// sender over an in-memory show — no React, no Supabase. What it PERFORMS is a
// toy (index ±1 or a jump, a countdown flag, an unlock); LiveMode.jsx performs the real thing.
import WebSocket from 'ws'
import { planHostCommand } from '../client/src/lib/hostCommands.js'
import { nextPressGate } from '../client/src/lib/nextPressCue.js'
import { pendingLockPhase, pendingReveal, unlockPatch } from '../client/src/lib/slideStepping.js'
import { fixFor } from '../client/src/lib/remoteFix.js'
import { buildSnapshot, hostReply, makeSnapshotSender } from '../client/src/lib/remoteSnapshot.js'
import { CLOSE_REPLACED } from '../client/src/lib/remoteProtocol.js'

export function createStubHost({ url, origin, slides, rounds = [], retryMs = 50 }) {
  const show = { index: 0, showState: { answerReveal: false, scoreboardVisible: false, scoresRevealed: false } }
  const stub = { status: 'connecting', paused: false, ran: [], remotes: 0 }
  let ws = null
  let stopped = false
  let retry = null
  const sender = makeSnapshotSender(body => {
    if (ws?.readyState !== WebSocket.OPEN) return false
    ws.send(body)
  }, { gapMs: 0 })
  const slide = () => slides[show.index]
  const cue = () => nextPressGate({ slide: slide(), nextSlide: slides[show.index + 1] ?? null })
  const busy = () => !!slide()?.data?.lockCountdownStartedAt
  const push = () => sender.offer(JSON.stringify(buildSnapshot({
    slides, index: show.index, showState: show.showState, cue: cue(), busy: busy(), paused: stub.paused, fix: fixFor(slide()), rounds,
  })))

  function run(cmd) {
    const s = slide()
    const plan = planHostCommand(cmd, {
      modalOpen: false, pendingAdvance: false,
      lockPhase: pendingLockPhase(s), lockCountdownRunning: busy(),
      scoringBlocked: false, audioPending: false, scoringBusy: false,
      answerReveal: show.showState.answerReveal, revealPending: !!pendingReveal(s), phoneRevealed: false,
      scoreboardVisible: show.showState.scoreboardVisible, scoresRevealed: show.showState.scoresRevealed,
      paused: stub.paused, remoteBusy: busy(), slideId: s?.id ?? null, gate: cue().gate, now: Date.now(),
      index: show.index, slideIds: slides.map(x => x.id), fix: fixFor(s),
    })
    if (plan.refuse) return plan
    stub.ran.push(plan.run)
    if (plan.run === 'next' || plan.run === 'hide-answer-then-next') show.index = Math.min(show.index + 1, slides.length - 1)
    if (plan.run === 'prev') show.index = Math.max(show.index - 1, 0)
    if (plan.run === 'start-lock-countdown') s.data = { ...s.data, lockCountdownPhase: plan.phase, lockCountdownStartedAt: Date.now() }
    if (plan.run === 'jump') show.index = plan.index
    if (plan.run === 'unlock') {
      const f = fixFor(s)
      s.data = f.mechanic === 'horse-race' ? { ...s.data, raceLocked: false } : { ...s.data, ...unlockPatch(f.mechanic, s.data) }
    }
    // 'rescore' is only recorded: the real one reads and writes Supabase.
    if (plan.run === 'set-answer-reveal') show.showState.answerReveal = plan.value
    if (plan.run === 'set-scoreboard-visible') show.showState.scoreboardVisible = plan.value
    if (plan.run === 'set-scores-revealed') show.showState.scoresRevealed = plan.value
    push()
    return { ok: true }
  }

  function connect() {
    ws = new WebSocket(url, { origin })
    ws.on('open', () => { stub.status = 'open'; sender.reset(); push() })
    ws.on('message', data => {
      let m
      try { m = JSON.parse(String(data)) } catch { return }
      if (m.type === 'remotes') { stub.remotes = m.count; return }
      const reply = hostReply(m, { run, now: Date.now(), visibility: 'visible' })
      if (reply) ws.send(JSON.stringify(reply))
    })
    ws.on('error', () => {})
    ws.on('close', code => {
      if (stopped) return
      if (code === CLOSE_REPLACED) { stub.status = 'replaced'; return }
      stub.status = 'down'
      retry = setTimeout(connect, retryMs)
    })
  }
  connect()
  stub.setPaused = p => { stub.paused = p; push() }
  stub.stop = () => { stopped = true; clearTimeout(retry); ws?.close() }
  return stub
}
