// A fake /display peer for protocol tests. It DECIDES with the real
// runDisplayCommand / displayState / hostReply / snapshot sender over an
// in-memory break. What it PERFORMS is a toy: the warp lands at once, b
// records 'exit', Space flips `playing`. Display.jsx + Jukebox.jsx perform
// the real thing.
import WebSocket from 'ws'
import { runDisplayCommand, displayState } from '../client/src/lib/displayCommands.js'
import { hostReply, makeSnapshotSender } from '../client/src/lib/remoteSnapshot.js'
import { CLOSE_REPLACED, DISPLAY_PATH } from '../client/src/lib/remoteProtocol.js'

export function createStubDisplay({ url, origin, atBreak = true, retryMs = 50 }) {
  const brk = { breakEligible: atBreak, breakActive: false, warp: null, jukebox: { playing: false, handoffPending: false } }
  const stub = { status: 'connecting', ran: [], brk }
  let ws = null
  let stopped = false
  let retry = null
  const sender = makeSnapshotSender(body => {
    if (ws?.readyState !== WebSocket.OPEN) return false
    ws.send(body)
  }, { gapMs: 0 })
  const push = () => sender.offer(JSON.stringify(displayState(brk)))
  let fired = false
  const handles = {
    exitToShow: () => {
      if (fired) return 'already'
      fired = true
      stub.ran.push('exit')
      brk.jukebox.handoffPending = true
      return 'started'
    },
    togglePlay: () => {
      if (brk.jukebox.handoffPending) return 'handoff'
      brk.jukebox.playing = !brk.jukebox.playing
      stub.ran.push(brk.jukebox.playing ? 'shuffle' : 'stop')
      return brk.jukebox.playing ? 'shuffle' : 'stop'
    },
  }
  function run(cmd) {
    const res = runDisplayCommand(cmd, {
      now: Date.now(), ...brk, jukebox: brk.breakActive ? handles : null,
      openJukebox: () => { stub.ran.push('open'); brk.breakActive = true },
    })
    push()
    return res
  }
  function connect() {
    ws = new WebSocket(url + DISPLAY_PATH, { origin })
    ws.on('open', () => { stub.status = 'open'; sender.reset(); push() })
    ws.on('message', data => {
      let m
      try { m = JSON.parse(String(data)) } catch { return }
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
  stub.stop = () => { stopped = true; clearTimeout(retry); ws?.close() }
  return stub
}
