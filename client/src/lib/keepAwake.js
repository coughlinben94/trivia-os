// Keeps the /display screen from sleeping. The Mac's display sleep blanks
// every TV on the splitter, and with the iPad remote the laptop can go a long
// time with no keyboard input. Wake locks release when the tab is hidden, so
// this re-requests on return, and retries on the first tap/key in case the
// browser wanted a gesture. Failure is silent: no support or a refused
// request must never break the TV.
export function keepAwake({ nav = globalThis.navigator, doc = globalThis.document, win = globalThis.window } = {}) {
  if (!nav?.wakeLock?.request) return () => {}
  let lock = null
  let stopped = false
  let asking = false
  async function acquire() {
    if (stopped || lock || asking || doc.visibilityState !== 'visible') return
    asking = true
    try {
      const l = await nav.wakeLock.request('screen')
      if (stopped) { l.release?.().catch?.(() => {}); return }
      lock = l
      l.addEventListener?.('release', () => { if (lock === l) lock = null })
    } catch { /* refused: try again on the next gesture or wake */ } finally { asking = false }
  }
  const onVisible = () => { acquire() }
  doc.addEventListener('visibilitychange', onVisible)
  win.addEventListener('pointerdown', onVisible)
  win.addEventListener('keydown', onVisible)
  acquire()
  return () => {
    stopped = true
    doc.removeEventListener('visibilitychange', onVisible)
    win.removeEventListener('pointerdown', onVisible)
    win.removeEventListener('keydown', onVisible)
    try { lock?.release?.()?.catch?.(() => {}) } catch { /* already released */ }
    lock = null
  }
}
