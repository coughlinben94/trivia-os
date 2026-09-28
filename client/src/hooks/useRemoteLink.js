import { useEffect, useRef, useState } from 'react'
import { HOST_RELAY_URL, CLOSE_REPLACED } from '../lib/remoteProtocol.js'
import { hostReply, makeSnapshotSender } from '../lib/remoteSnapshot.js'

// /host's side of the iPad remote (spec §5-§8). OFF unless `enabled`: with it
// off no WebSocket is ever constructed, so Chrome's local-network-access
// prompt never appears and Live Mode behaves exactly as before.
//
// Commands run through runCommandRef.current (LiveMode's runHostCommandRef,
// reassigned every render), so they never act on a stale `show`.
export function useRemoteLink({ enabled, snapshot, runCommandRef, url = HOST_RELAY_URL }) {
  const [status, setStatus] = useState('off') // off | connecting | open | down | replaced
  const [remotes, setRemotes] = useState(0)
  const wsRef = useRef(null)
  const snapRef = useRef(snapshot)
  snapRef.current = snapshot
  const senderRef = useRef(null)
  if (!senderRef.current) {
    senderRef.current = makeSnapshotSender(body => {
      const ws = wsRef.current
      if (ws?.readyState !== WebSocket.OPEN) return false
      ws.send(body)
    })
  }
  const body = () => JSON.stringify({ ...snapRef.current, visibility: document.visibilityState })

  // Every render: the sender drops it unless it changed (and spaces sends 150ms).
  useEffect(() => { if (enabled) senderRef.current.offer(body()) })

  useEffect(() => {
    if (!enabled) { setStatus('off'); return }
    const sender = senderRef.current
    let ws = null
    let retry = null
    let delay = 1000
    let stopped = false
    const connect = () => {
      setStatus('connecting')
      ws = new WebSocket(url)
      wsRef.current = ws
      ws.onopen = () => {
        delay = 1000
        setStatus('open')
        // A relay that restarted has no cached state: resend even if unchanged.
        sender.reset()
        sender.offer(body())
      }
      ws.onmessage = e => {
        let msg
        try { msg = JSON.parse(e.data) } catch { return }
        if (msg.type === 'remotes') { setRemotes(msg.count); return }
        // Beats are answered here, not from a setInterval — hidden tabs throttle timers.
        const reply = hostReply(msg, { run: c => runCommandRef.current(c), now: Date.now(), visibility: document.visibilityState })
        if (reply && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply))
      }
      ws.onclose = e => {
        if (wsRef.current === ws) wsRef.current = null
        setRemotes(0)
        if (stopped) return
        // Another /host tab took over: stop until this one is reloaded (or toggled).
        if (e.code === CLOSE_REPLACED) { setStatus('replaced'); return }
        setStatus('down')
        retry = setTimeout(connect, delay)
        delay = Math.min(delay * 2, 10000)
      }
    }
    connect()
    const onVisibility = () => sender.offer(body())
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      clearTimeout(retry)
      document.removeEventListener('visibilitychange', onVisibility)
      ws?.close()
      wsRef.current = null
    }
  }, [enabled, url])

  return { status, remotes }
}
