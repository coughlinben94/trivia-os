import { useEffect, useRef, useState } from 'react'
import { DEFAULT_REMOTE_URL, CLOSE_BAD_SECRET, BEAT_MS, STALE_BEAT_MS, GREY_GATES, refusalText, remoteStatus } from '../lib/remoteProtocol.js'

// /remote — the iPad host remote (spec docs/superpowers/specs/2026-09-28-
// ipad-remote-design.md §9). A remote control only: it never touches
// Supabase. It pairs with the laptop relay, shows what the laptop's Live Mode
// says, and sends commands the laptop may refuse. The laptop is the engine.

const CFG_KEY = 'trivia-remote:cfg'
function loadCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY))
    if (c) return { url: c.url || DEFAULT_REMOTE_URL, secret: c.secret || '' }
  } catch { /* fall through */ }
  return { url: DEFAULT_REMOTE_URL, secret: '' }
}
function saveCfg(cfg) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)) } catch { /* private mode */ }
}

const DOT = { green: 'bg-green-500', orange: 'bg-amber-400', red: 'bg-red-500' }

// Scoped home-screen tags, same pattern as Join.jsx: added on mount, removed
// on unmount, since the SPA shares one document head across routes.
function useHeadTags() {
  useEffect(() => {
    const tags = [
      { tag: 'link', rel: 'manifest', href: '/remote-manifest.json' },
      { tag: 'link', rel: 'apple-touch-icon', href: '/join-icon-180.png' },
      { tag: 'meta', name: 'apple-mobile-web-app-capable', content: 'yes' },
      { tag: 'meta', name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { tag: 'meta', name: 'apple-mobile-web-app-title', content: 'Remote' },
      { tag: 'meta', name: 'theme-color', content: '#030712' },
    ]
    const added = tags.map(({ tag, ...attrs }) => {
      const el = document.createElement(tag)
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
      document.head.appendChild(el)
      return el
    })
    return () => added.forEach(el => document.head.contains(el) && document.head.removeChild(el))
  }, [])
}

// Keep the screen awake: asked on the first tap (iOS wants a gesture) and
// again whenever the page comes back, since iOS drops the lock when hidden.
// Needs iPadOS 18.4+ in home-screen apps; otherwise set Auto-Lock to Never.
function useWakeLock() {
  useEffect(() => {
    let lock = null
    let asking = false
    const grab = () => {
      if (lock || asking || document.visibilityState !== 'visible' || !navigator.wakeLock) return
      asking = true
      navigator.wakeLock.request('screen')
        .then(l => { lock = l; l.addEventListener('release', () => { lock = null }) })
        .catch(() => {})
        .finally(() => { asking = false })
    }
    document.addEventListener('visibilitychange', grab)
    window.addEventListener('pointerdown', grab)
    grab()
    return () => {
      document.removeEventListener('visibilitychange', grab)
      window.removeEventListener('pointerdown', grab)
      lock?.release().catch(() => {})
    }
  }, [])
}

export default function Remote() {
  const [cfg, setCfg] = useState(loadCfg)
  const [settingsOpen, setSettingsOpen] = useState(() => !loadCfg().secret)
  const [socket, setSocket] = useState('closed')
  const [closeCode, setCloseCode] = useState(null)
  const [hostConnected, setHostConnected] = useState(false)
  const [snap, setSnap] = useState(null)
  const [beat, setBeat] = useState(null) // { at, visibility } of the last laptop beat
  const [notice, setNotice] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const wsRef = useRef(null)
  const offsetRef = useRef(0) // laptopNow − iPadNow, from the latest beat
  const idRef = useRef(0)

  useHeadTags()
  useWakeLock()
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // One socket per (url, secret). After a 4003 it stays closed until the
  // pairing code changes, so a wrong code doesn't hammer the relay.
  useEffect(() => {
    if (!cfg.secret) return
    let ws = null
    let retry = null
    let watchdog = null
    let delay = 1000
    let stopped = false
    const connect = () => {
      setSocket('connecting')
      ws = new WebSocket(cfg.url)
      wsRef.current = ws
      // No relay-beat for 5s: the pipe is dead even if the socket says open.
      const kick = () => { clearTimeout(watchdog); watchdog = setTimeout(() => ws.close(), STALE_BEAT_MS) }
      ws.onopen = () => {
        delay = 1000
        setSocket('open')
        setCloseCode(null)
        ws.send(JSON.stringify({ type: 'hello', secret: cfg.secret })) // first message, never in the URL
        kick()
      }
      ws.onmessage = e => {
        let m
        try { m = JSON.parse(e.data) } catch { return }
        if (m.type === 'relay-beat') kick()
        else if (m.type === 'beat') {
          offsetRef.current = m.laptopNow - Date.now()
          setBeat({ at: Date.now(), visibility: m.visibility })
        }
        else if (m.type === 'host') setHostConnected(!!m.connected)
        else if (m.type === 'state') setSnap(m)
        else if (m.type === 'result' && m.refused) setNotice(refusalText(m.refused))
      }
      ws.onclose = e => {
        clearTimeout(watchdog)
        if (wsRef.current === ws) wsRef.current = null
        setSocket('closed')
        setCloseCode(e.code)
        setHostConnected(false)
        if (stopped || e.code === CLOSE_BAD_SECRET) return
        retry = setTimeout(connect, delay)
        delay = Math.min(delay * 2, 10000)
      }
    }
    connect()
    return () => {
      stopped = true
      clearTimeout(retry)
      clearTimeout(watchdog)
      ws?.close()
    }
  }, [cfg.url, cfg.secret])

  const status = remoteStatus({
    socket, closeCode, hostConnected,
    beatAge: beat ? now - beat.at : null,
    visibility: beat?.visibility,
  })
  const live = status.live && !!snap
  const nextOff = !live || snap.paused || snap.busy || GREY_GATES.includes(snap.gate)
  const toggles = snap?.toggles ?? {}
  const revealOwed = snap?.gate === 'reveal-owed'

  function send(cmd, args = {}) {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN || !live) return
    setNotice(null)
    ws.send(JSON.stringify({
      type: 'cmd', id: String(++idRef.current), cmd, args,
      expectSlideId: snap?.slide?.id ?? null,
      sentAt: Date.now() + offsetRef.current, // laptop time, for its 1500ms cut
    }))
  }

  function saveSettings(e) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const next = {
      url: String(form.get('url') || '').trim() || DEFAULT_REMOTE_URL,
      secret: String(form.get('secret') || '').replace(/\s+/g, '').toUpperCase(),
    }
    saveCfg(next)
    setCfg(next)
    setSettingsOpen(false)
  }

  return (
    <div
      className="min-h-[100dvh] bg-gray-950 text-white flex flex-col select-none touch-manipulation"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Status strip */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <span className={`w-4 h-4 rounded-full shrink-0 ${DOT[status.tone]}`} aria-hidden />
        <span className="text-base font-semibold flex-1 min-w-0 truncate">{status.text}</span>
        {snap?.slide && (
          <span className="text-base text-white/70 tabular-nums whitespace-nowrap">
            {snap.slide.label} · {snap.slide.index + 1} / {snap.slide.total}
          </span>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="w-16 h-16 -my-2 rounded-2xl text-3xl active:bg-white/10"
        >
          ⚙
        </button>
      </header>

      {snap?.paused && (
        <div className="px-4 py-3 bg-red-600 text-lg font-semibold text-center">Remote paused on the laptop</div>
      )}

      <main className="flex-1 grid gap-4 p-4 portrait:grid-rows-[1fr_auto] landscape:grid-cols-[2fr_1fr]">
        <section className="flex flex-col gap-4 min-h-0">
          <button
            onClick={() => send('next', { expectGate: snap?.gate ?? null })}
            disabled={nextOff}
            className={`flex-1 min-h-[220px] rounded-3xl flex flex-col items-center justify-center gap-3 transition-transform duration-100 active:scale-[0.98] ${
              nextOff ? 'bg-white/10 text-white/30' : 'bg-green-600 text-white active:bg-green-700'
            }`}
          >
            <span className="text-6xl" style={{ fontFamily: "'Boogaloo', cursive" }}>NEXT ▶</span>
            <span className="text-2xl font-semibold px-4 text-center">{snap?.cue ?? '—'}</span>
          </button>

          <div className="grid grid-cols-2 landscape:grid-cols-4 gap-4">
            <BigButton onClick={() => send('prev')} disabled={!live || snap?.paused || snap?.busy}>◀ Prev</BigButton>
            <BigButton
              onClick={() => send('answer', { value: revealOwed ? true : !toggles.answerReveal })}
              disabled={!live || snap?.paused}
              lit={toggles.answerReveal}
              glow={revealOwed}
            >
              Answer
            </BigButton>
            <BigButton onClick={() => send('scoreboard', { value: !toggles.scoreboardVisible })} disabled={!live || snap?.paused} lit={toggles.scoreboardVisible}>
              Scoreboard
            </BigButton>
            <BigButton onClick={() => send('scores-reveal', { value: !toggles.scoresRevealed })} disabled={!live || snap?.paused} lit={toggles.scoresRevealed}>
              Phone scores
            </BigButton>
          </div>

          <p className="min-h-[2rem] text-xl font-semibold text-amber-300 text-center" role="status">{notice}</p>
        </section>

        <aside className="rounded-3xl bg-white/5 p-4 flex flex-col gap-3 min-h-0">
          <p className="text-sm uppercase tracking-wider text-white/50">Up next</p>
          {(snap?.upNext ?? []).map((s, i) => (
            <p key={i} className="text-2xl font-semibold truncate">› {s.label}</p>
          ))}
          {snap && snap.upNext.length === 0 && <p className="text-xl text-white/40">End of show</p>}
          {!snap && <p className="text-xl text-white/40">Waiting for the laptop…</p>}
        </aside>
      </main>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end landscape:items-center justify-center" onClick={() => cfg.secret && setSettingsOpen(false)}>
          <form
            onSubmit={saveSettings}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl bg-gray-900 rounded-t-3xl landscape:rounded-3xl p-6 flex flex-col gap-4"
          >
            <h2 className="text-3xl" style={{ fontFamily: "'Boogaloo', cursive" }}>Remote settings</h2>
            <label className="flex flex-col gap-2 text-base text-white/70">
              Pairing code (from <code>npm run relay -- --init</code> on the laptop)
              <input
                name="secret"
                defaultValue={cfg.secret}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-16 px-4 rounded-2xl bg-white/10 text-2xl text-white tracking-widest font-mono"
              />
            </label>
            <label className="flex flex-col gap-2 text-base text-white/70">
              Relay address
              <input
                name="url"
                defaultValue={cfg.url}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-16 px-4 rounded-2xl bg-white/10 text-lg text-white font-mono"
              />
            </label>
            <button type="submit" className="h-16 rounded-2xl bg-green-600 text-2xl font-semibold active:bg-green-700">Save</button>
            <p className="text-sm text-white/50">
              Heartbeat every {BEAT_MS / 1000}s. If the remote misbehaves, use Pause iPad remote on the laptop and run the show from there.
            </p>
          </form>
        </div>
      )}
    </div>
  )
}

function BigButton({ onClick, disabled, lit = false, glow = false, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={lit}
      className={`min-h-[96px] rounded-2xl text-2xl font-semibold transition-transform duration-100 active:scale-[0.97] ${
        disabled
          ? 'bg-white/5 text-white/30'
          : lit
            ? 'bg-amber-400 text-gray-950'
            : glow
              ? 'bg-white/15 text-white ring-4 ring-amber-400'
              : 'bg-white/15 text-white active:bg-white/25'
      }`}
    >
      {children}
      {lit && <span className="ml-2" aria-hidden>●</span>}
    </button>
  )
}
