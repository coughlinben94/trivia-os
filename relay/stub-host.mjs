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
import { CLOSE_REPLACED, scoreChangeText } from '../client/src/lib/remoteProtocol.js'
import { createScoreChain, createScoreRemote } from '../client/src/lib/scoreCellWrite.js'
import { deriveRoundCols } from '../client/src/lib/scoreboardMath.js'

// An in-memory scoreboard_teams for the score chain. `gate` (a promise) holds
// reads, so a test can keep one score.set in flight; `afterRead` runs once a
// read has its rows (a test can delete one before the write).
function memoryTable(rows) {
  const db = { rows: structuredClone(rows), log: [], gate: null, afterRead: null }
  db.readTeams = async showId => {
    db.log.push('read')
    if (db.gate) await db.gate
    const data = structuredClone(db.rows.filter(r => r.show_id === showId))
    db.afterRead?.()
    return { data, error: null }
  }
  // LiveMode's update({ scores }).eq('id').eq('show_id').select('id').
  db.updateScores = async row => {
    db.log.push(`update ${row.id}`)
    const hit = db.rows.find(r => r.id === row.id && r.show_id === row.show_id)
    if (hit) hit.scores = structuredClone(row.scores)
    return { data: hit ? [{ id: hit.id }] : [], error: null }
  }
  return db
}

export function createStubHost({ url, origin, slides, rounds = [], retryMs = 50, teams = [] }) {
  const show = { index: 0, showState: { answerReveal: false, scoreboardVisible: false, scoresRevealed: false } }
  const stub = { status: 'connecting', paused: false, modalOpen: false, ran: [], remotes: 0, notices: [] }
  const db = memoryTable(teams)
  stub.db = db
  const chain = createScoreChain(db)
  const scores = createScoreRemote({ chain, onChange: () => push(), onSaved: c => stub.notices.push(scoreChangeText(c)) })
  const scoreCtx = () => ({ showId: 'stub-show', cols: deriveRoundCols({ rounds, slides }) })
  let ws = null
  let stopped = false
  let retry = null
  const sender = makeSnapshotSender(body => {
    if (ws?.readyState !== WebSocket.OPEN) return false
    ws.send(body)
  }, { gapMs: 0 })
  const slide = () => slides[show.index]
  const cue = () => nextPressGate({ slide: slide(), nextSlide: slides[show.index + 1] ?? null })
  // Like LiveMode's remoteBusyNow: a countdown, or anything on the score chain.
  const busy = () => !!slide()?.data?.lockCountdownStartedAt || chain.depth() > 0
  const push = () => sender.offer(JSON.stringify(buildSnapshot({
    slides, index: show.index, showState: show.showState, cue: cue(), busy: busy(), paused: stub.paused, fix: fixFor(slide()), rounds,
    scoreQueueDepth: chain.depth(), scores: scores.view(),
  })))

  function run(cmd) {
    const s = slide()
    const plan = planHostCommand(cmd, {
      modalOpen: stub.modalOpen, pendingAdvance: false,
      lockPhase: pendingLockPhase(s), lockCountdownRunning: !!s?.data?.lockCountdownStartedAt,
      scoringBlocked: false, audioPending: false, scoringBusy: false,
      answerReveal: show.showState.answerReveal, revealPending: !!pendingReveal(s), phoneRevealed: false,
      scoreboardVisible: show.showState.scoreboardVisible, scoresRevealed: show.showState.scoresRevealed,
      paused: stub.paused, remoteBusy: busy(), slideId: s?.id ?? null, gate: cue().gate, now: Date.now(),
      index: show.index, slideIds: slides.map(x => x.id), fix: fixFor(s),
      anyScoring: false, jumpBusy: false, scoreQueueDepth: chain.depth(), scoreCols: scoreCtx().cols,
    })
    if (plan.refuse) return plan
    stub.ran.push(plan.run)
    if (plan.run.startsWith('score')) {
      const res = scores.perform(plan, scoreCtx())
      push()
      res.later?.finally(push)
      return res
    }
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
      const post = out => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(out)) }
      const reply = hostReply(m, { run, now: Date.now(), visibility: 'visible', post })
      if (reply) post(reply)
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
  stub.setModalOpen = o => { stub.modalOpen = o }
  stub.stop = () => { stopped = true; clearTimeout(retry); ws?.close() }
  return stub
}
