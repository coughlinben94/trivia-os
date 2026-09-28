import { useEffect, useRef, useState } from 'react'
import { motion, MotionConfig, AnimatePresence, useReducedMotion } from 'framer-motion'
import { EASE_OUT, EASE_PANEL, EASE_EXIT } from '../lib/easings.js'
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

// "Midnight orchard" palette for a dark bar: a forest-tinted night, cream ink,
// Bright Leaf for the one button that matters. Contrast (measured):
// cream/night 16.2, ink/leaf 7.4, muted/surface 7.9, ink/amber 10.2, cream/red 5.8.
// NIGHT #0a1710 · SURFACE #13261a · RAISED #1b3324 · CREAM #f5f0e8
// LEAF #60c000 · INK #06200a · AMBER #f2b632 · RED #b8161a
const TONE = {
  green: { icon: IconCheck, color: 'text-[#60c000]' },
  orange: { icon: IconAlert, color: 'text-[#f2b632]' },
  red: { icon: IconCross, color: 'text-[#ff6b5e]' },
}

// Protocol strings read "what happened — what to do". Split them so the
// glance line is short and the fix sits under it, without the dash.
function splitMsg(text) {
  if (!text) return [null, null]
  const [head, ...rest] = String(text).split(' — ')
  const hint = rest.join(' — ')
  return [head, hint ? hint[0].toUpperCase() + hint.slice(1) : null]
}

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
      { tag: 'meta', name: 'theme-color', content: '#0a1710' },
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
  const [drawer, setDrawer] = useState(null) // 'jump' | 'fix' | null
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
  // Jump and Fix go through the laptop's busy gate too: grey them for the
  // same reasons, and say which one on the button.
  const fix = snap?.fix ?? null
  const jumpBlock = !live ? 'Laptop not ready' : snap.paused ? 'Paused on the laptop' : snap.jumpBusy ? 'Jumping…' : snap.busy ? 'Laptop is busy' : null
  const fixBlock = jumpBlock ?? (!fix?.mechanic ? splitMsg(refusalText('nothing-to-fix'))[0] : null)

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

  const [statusHead, statusHint] = splitMsg(status.text)
  const [noticeHead, noticeHint] = splitMsg(notice)
  const tone = TONE[status.tone]
  // What the big button says under NEXT: the cue when live, otherwise why not.
  const [cueHead, cueHint] = !status.live
    ? [statusHead, statusHint]
    : snap?.paused
      ? ['Paused on the laptop', null]
      : snap
        ? [snap.cue ?? 'Nothing next', null]
        : ['Waiting for the laptop…', null]
  const pad = 'env(safe-area-inset-left)'
  const padR = 'env(safe-area-inset-right)'

  return (
    <MotionConfig reducedMotion="user">
    <div
      className="h-[100dvh] overflow-hidden bg-[#0a1710] text-[#f5f0e8] flex flex-col select-none touch-manipulation"
      style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: pad, paddingRight: padR,
      }}
    >
      {/* Status strip: icon shape + words carry the state, colour only backs it up */}
      <header className="flex items-center gap-3 pl-5 pr-2 py-2 shrink-0">
        <motion.span
          key={status.text}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="flex items-center gap-3 flex-1 min-w-0"
          data-tone={status.tone}
        >
          <tone.icon className={`w-8 h-8 shrink-0 ${tone.color}`} />
          <span className="text-xl font-bold truncate">{statusHead}</span>
        </motion.span>
        {snap?.slide && (
          <span className="text-xl font-semibold text-[#f5f0e8]/75 tabular-nums whitespace-nowrap truncate min-w-0 max-w-[45%]">
            {snap.slide.label} · {snap.slide.index + 1} / {snap.slide.total}
          </span>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="w-16 h-16 shrink-0 grid place-items-center rounded-2xl text-[#f5f0e8]/80 transition-transform duration-[120ms] ease-snap active:scale-[0.94] active:bg-[#1b3324]"
        >
          <IconGear className="w-8 h-8" />
        </button>
      </header>

      {snap?.paused && (
        <div className="mx-4 mb-1 px-5 py-3 rounded-xl bg-[#b8161a] text-xl font-bold flex items-center gap-3 shrink-0">
          <IconPause className="w-7 h-7 shrink-0" />
          Remote paused on the laptop
        </div>
      )}

      <main className="flex-1 min-h-0 grid gap-3 px-4 pb-4 pt-1
        portrait:grid-cols-2 portrait:grid-rows-[auto_1fr_auto_auto_auto_auto]
        landscape:grid-cols-[repeat(4,minmax(0,1fr))_minmax(240px,0.9fr)] landscape:grid-rows-[1fr_auto_auto_auto]">
        {/* Up Next: reading, not tapping, so it sits away from the thumb */}
        <aside className="portrait:col-span-2 portrait:order-first landscape:col-start-5 landscape:row-start-1 landscape:row-span-4
          rounded-2xl bg-[#13261a] px-5 py-4 flex portrait:flex-row portrait:items-center landscape:flex-col gap-x-6 gap-y-3 min-h-0 min-w-0">
          <p className="text-[1rem] leading-6 font-semibold text-[#f5f0e8]/75 shrink-0">Up next</p>
          {(snap?.upNext ?? []).map((s, i) => (
            <p key={i} className={`text-2xl font-bold truncate min-w-0 ${i ? 'text-[#f5f0e8]/75' : ''}`}>› {s.label}</p>
          ))}
          {snap && snap.upNext.length === 0 && <p className="text-2xl font-bold text-[#f5f0e8]/75">End of show</p>}
          {!snap && <p className="text-xl text-[#f5f0e8]/75">Nothing yet</p>}
        </aside>

        <button
          onClick={() => send('next', { expectGate: snap?.gate ?? null })}
          disabled={nextOff}
          className={`portrait:col-span-2 landscape:col-span-4 landscape:row-start-1 min-h-[240px] rounded-[20px] px-6 flex flex-col items-center justify-center gap-2 text-center
            transition-transform duration-[120ms] ease-snap enabled:active:scale-[0.97]
            focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#f5f0e8] ${
            nextOff
              ? 'bg-[#13261a] text-[#f5f0e8]/75 border-[3px] border-dashed border-[#f5f0e8]/30'
              : 'bg-[#60c000] text-[#06200a] active:bg-[#58b000]'
          }`}
        >
          <span className="flex items-center gap-4 leading-none" style={{ fontFamily: "'Boogaloo', cursive", fontSize: 'clamp(4rem, 10vmin, 6rem)' }}>
            NEXT
            {nextOff ? <IconPause className="w-[0.7em] h-[0.7em]" /> : <IconArrow className="w-[0.7em] h-[0.7em]" />}
          </span>
          <span className="font-bold leading-tight max-w-full [text-wrap:balance]" style={{ fontSize: 'clamp(2.5rem, 6.2vmin, 3.75rem)' }} data-cue>
            {cueHead}
          </span>
          {cueHint && <span className="text-2xl font-semibold max-w-full [text-wrap:balance]">{cueHint}</span>}
        </button>

        {/* Refusals: a reserved slot, so the buttons never jump under a thumb */}
        <div className="portrait:col-span-2 landscape:col-span-4 min-h-[64px] flex" role="status">
          {notice && (
            <motion.p
              key={notice}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="flex-1 flex items-center gap-3 px-5 py-2 rounded-xl bg-[#f2b632] text-[#1a1206]"
            >
              <IconAlert className="w-8 h-8 shrink-0" />
              <span className="text-2xl font-bold">{noticeHead}</span>
              {noticeHint && <span className="text-xl font-semibold">{noticeHint}</span>}
            </motion.p>
          )}
          {/* Live but degraded (laptop tab hidden): the fix would be cut off in the strip */}
          {!notice && status.live && statusHint && (
            <motion.p
              key={statusHint}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="flex-1 flex items-center gap-3 px-5 py-2 rounded-xl border-2 border-[#f2b632] text-[#f5f0e8]"
            >
              <IconAlert className="w-8 h-8 shrink-0 text-[#f2b632]" />
              <span className="text-xl font-semibold">{statusHint}</span>
            </motion.p>
          )}
        </div>

        <BigButton onClick={() => send('prev')} disabled={!live || snap?.paused || snap?.busy} icon={IconBack}>Prev</BigButton>
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

        {/* Jump and fix: rarer, costlier presses, so they open a drawer first */}
        <DrawerButton onClick={() => setDrawer('jump')} disabled={!!jumpBlock} icon={IconList}
          hint={jumpBlock ?? (snap?.slide ? `Now on ${snap.slide.label}` : null)}>
          Jump
        </DrawerButton>
        <DrawerButton onClick={() => setDrawer('fix')} disabled={!!fixBlock} icon={IconWrench}
          hint={fixBlock ?? 'Unlock or rescore'}>
          Fix
        </DrawerButton>
      </main>

      <Sheet open={drawer === 'jump'} onClose={() => setDrawer(null)} title="Jump to a slide" tall>
        <JumpList
          slides={snap?.slides ?? []}
          current={snap?.slide?.index ?? -1}
          blocked={jumpBlock}
          onJump={s => { send('jump', { slideId: s.id, index: s.index }); setDrawer(null) }}
        />
      </Sheet>
      <Sheet open={drawer === 'fix'} onClose={() => setDrawer(null)} title="Fix this slide" subtitle={snap?.slide?.label}>
        <FixPanel
          fix={fix}
          blocked={jumpBlock}
          onUnlock={() => { send('unlock'); setDrawer(null) }}
          onRescore={() => { send('rescore'); setDrawer(null) }}
        />
      </Sheet>

      {settingsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className="fixed inset-0 z-50 bg-black/70 flex items-end landscape:items-center justify-center"
          onClick={() => cfg.secret && setSettingsOpen(false)}
        >
          <motion.form
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: EASE_PANEL }}
            onSubmit={saveSettings}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl max-h-full overflow-y-auto bg-[#13261a] rounded-t-2xl landscape:rounded-2xl p-6 flex flex-col gap-5"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-4xl leading-none" style={{ fontFamily: "'Boogaloo', cursive" }}>Remote settings</h2>
              {cfg.secret && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="h-14 px-5 rounded-xl bg-[#1b3324] text-xl font-semibold transition-transform duration-[120ms] ease-snap active:scale-[0.97]"
                >
                  Close
                </button>
              )}
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-xl font-semibold">Pairing code</span>
              <span className="text-[1rem] leading-6 text-[#f5f0e8]/75">
                On the laptop, run <code className="font-mono">npm run relay -- --init</code> and type the code it prints.
              </span>
              <input
                name="secret"
                defaultValue={cfg.secret}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-16 px-4 rounded-xl bg-[#0a1710] border-2 border-[#f5f0e8]/25 focus:border-[#60c000] outline-none text-2xl text-[#f5f0e8] tracking-widest font-mono"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xl font-semibold">Laptop address</span>
              <span className="text-[1rem] leading-6 text-[#f5f0e8]/75">Leave this alone unless the laptop changed.</span>
              <input
                name="url"
                defaultValue={cfg.url}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-16 px-4 rounded-xl bg-[#0a1710] border-2 border-[#f5f0e8]/25 focus:border-[#60c000] outline-none text-lg text-[#f5f0e8] font-mono"
              />
            </label>
            <button
              type="submit"
              className="h-16 rounded-xl bg-[#60c000] text-[#06200a] text-2xl font-bold transition-transform duration-[120ms] ease-snap active:scale-[0.97] active:bg-[#58b000]"
            >
              Save
            </button>
            <p className="text-[1rem] leading-6 text-[#f5f0e8]/75">
              If the remote acts up, press Pause iPad remote on the laptop and run the show from there.
              The laptop checks in every {BEAT_MS / 1000} seconds.
            </p>
          </motion.form>
        </motion.div>
      )}
    </div>
    </MotionConfig>
  )
}

// Toggle state is told three ways: fill, a filled or hollow dot, and the word On or Off.
function BigButton({ onClick, disabled, lit = false, glow = false, icon: Icon, children }) {
  const toggle = !Icon
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={toggle ? lit : undefined}
      className={`relative min-h-[104px] rounded-2xl px-4 py-3 flex flex-col justify-center gap-1 text-left
        transition-transform duration-[120ms] ease-snap enabled:active:scale-[0.97]
        focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#f5f0e8] ${
        disabled
          ? 'bg-[#13261a] text-[#f5f0e8]/50 border-2 border-dashed border-[#f5f0e8]/20'
          : lit
            ? 'bg-[#f5f0e8] text-[#06200a] active:bg-[#e4dfd6]'
            : 'bg-[#1b3324] text-[#f5f0e8] active:bg-[#244130]'
      } ${glow && !disabled ? 'ring-[5px] ring-[#f2b632] ring-offset-2 ring-offset-[#0a1710]' : ''}`}
    >
      <span className="flex items-center gap-2 text-2xl font-bold leading-tight">
        {Icon && <Icon className="w-7 h-7 shrink-0" />}
        {children}
      </span>
      {toggle && (
        <span className="flex items-center gap-2 text-lg font-semibold">
          {glow && !disabled && !lit ? (
            <span className="text-[#f2b632] motion-safe:animate-pulse">Tap to reveal</span>
          ) : (
            <>
              <span className={`w-4 h-4 rounded-full border-[3px] border-current ${lit ? 'bg-current' : ''}`} aria-hidden />
              {lit ? 'On' : 'Off'}
            </>
          )}
        </span>
      )}
    </button>
  )
}

// A wide button that opens a drawer: name, and a hint line that doubles as
// the reason when it is off.
function DrawerButton({ onClick, disabled, icon: Icon, hint, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`portrait:col-span-1 landscape:col-span-2 min-h-[88px] rounded-2xl px-5 py-3 flex items-center gap-4 text-left
        transition-transform duration-[120ms] ease-snap enabled:active:scale-[0.97]
        focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#f5f0e8] ${
        disabled
          ? 'bg-[#13261a] text-[#f5f0e8]/50 border-2 border-dashed border-[#f5f0e8]/20'
          : 'bg-[#1b3324] text-[#f5f0e8] active:bg-[#244130]'
      }`}
    >
      <Icon className="w-9 h-9 shrink-0" />
      <span className="flex flex-col min-w-0">
        <span className="text-2xl font-bold leading-tight">{children}</span>
        {hint && <span className="text-lg font-semibold truncate opacity-80">{hint}</span>}
      </span>
    </button>
  )
}

// Bottom sheet. Enter 280ms on the iOS drawer curve, exit faster (200ms);
// transform and opacity only. Reduced motion: fade only, no slide.
function Sheet({ open, onClose, title, subtitle, tall = false, children }) {
  const reduce = useReducedMotion()
  const hidden = reduce ? { opacity: 0 } : { opacity: 1, transform: 'translateY(100%)' }
  const shown = reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0%)' }
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.24, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.18, ease: EASE_EXIT } }}
          className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={hidden}
            animate={{ ...shown, transition: { duration: 0.28, ease: EASE_PANEL } }}
            exit={{ ...hidden, transition: { duration: 0.2, ease: EASE_EXIT } }}
            onClick={e => e.stopPropagation()}
            className={`w-full max-w-3xl ${tall ? 'h-[85dvh]' : 'max-h-[85dvh]'} bg-[#13261a] rounded-t-3xl flex flex-col`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center gap-4 px-6 pt-5 pb-3 shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-4xl leading-none" style={{ fontFamily: "'Boogaloo', cursive" }}>{title}</h2>
                {subtitle && <p className="text-xl font-semibold text-[#f5f0e8]/75 mt-1 truncate">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="h-16 px-6 rounded-xl bg-[#1b3324] text-xl font-semibold transition-transform duration-[120ms] ease-snap active:scale-[0.97]"
              >
                Close
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Consecutive slides in the same round share a heading.
function groupByRound(slides) {
  const groups = []
  for (const s of slides) {
    const key = s.round ?? null
    const last = groups.at(-1)
    if (last && last.key === key) last.slides.push(s)
    else groups.push({ key, title: s.round ? [s.round, s.roundTitle].filter(Boolean).join(' · ') : null, slides: [s] })
  }
  const seenRound = i => groups.slice(0, i).some(g => g.key)
  const laterRound = i => groups.slice(i + 1).some(g => g.key)
  groups.forEach((g, i) => {
    if (!g.title) g.title = !seenRound(i) ? 'Start of show' : laterRound(i) ? 'Between rounds' : 'End of show'
  })
  return groups
}
const jumpName = s => (s.round ? `${s.round} ${s.label}` : s.label)

// A jump in front of the room is costly, so the first tap only picks; the
// confirm bar names the target and a second tap sends it.
function JumpList({ slides, current, blocked, onJump }) {
  const [pick, setPick] = useState(null)
  const hereRef = useRef(null)
  useEffect(() => { hereRef.current?.scrollIntoView?.({ block: 'center' }) }, [])
  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
        {groupByRound(slides).map((g, gi) => (
          <section key={gi} className="mt-1">
            <h3 className="sticky top-0 z-10 bg-[#13261a] px-2 py-2 text-[1rem] leading-6 font-semibold text-[#f5f0e8]/75">{g.title}</h3>
            <div className="flex flex-col gap-2">
              {g.slides.map(s => {
                const here = s.index === current
                const picked = pick?.id === s.id
                return (
                  <button
                    key={s.id}
                    data-slide={s.id}
                    ref={here ? hereRef : undefined}
                    aria-current={here ? 'true' : undefined}
                    aria-pressed={picked}
                    disabled={here}
                    onClick={() => setPick(s)}
                    className={`min-h-[72px] rounded-2xl px-5 flex items-center gap-4 text-left
                      transition-transform duration-[120ms] ease-snap enabled:active:scale-[0.98]
                      focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#f5f0e8] ${
                      here
                        ? 'bg-[#0a1710] border-[3px] border-[#60c000] text-[#f5f0e8]'
                        : picked
                          ? 'bg-[#f5f0e8] text-[#06200a]'
                          : 'bg-[#1b3324] text-[#f5f0e8] active:bg-[#244130]'
                    }`}
                  >
                    <span className="w-12 shrink-0 text-lg font-semibold tabular-nums opacity-75">{s.index + 1}</span>
                    <span className="flex-1 min-w-0 text-2xl font-bold truncate">{s.label}</span>
                    {here && <span className="shrink-0 px-3 py-1 rounded-full bg-[#60c000] text-[#06200a] text-lg font-bold">Showing now</span>}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      {pick && (
        <div className="shrink-0 border-t-2 border-[#f5f0e8]/15 px-5 py-4 flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[12rem] text-2xl font-bold">
            Jump to {jumpName(pick)}?
            {blocked && <span className="block text-lg font-semibold text-[#f2b632]">{blocked}</span>}
          </p>
          <button
            onClick={() => setPick(null)}
            className="h-16 px-6 rounded-xl bg-[#1b3324] text-xl font-semibold transition-transform duration-[120ms] ease-snap active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={() => onJump(pick)}
            disabled={!!blocked}
            className="h-16 px-7 rounded-xl text-xl font-bold transition-transform duration-[120ms] ease-snap enabled:active:scale-[0.97]
              bg-[#60c000] text-[#06200a] active:bg-[#58b000] disabled:bg-[#13261a] disabled:text-[#f5f0e8]/50 disabled:border-2 disabled:border-dashed disabled:border-[#f5f0e8]/20"
          >
            Jump there
          </button>
        </div>
      )}
    </>
  )
}

function FixPanel({ fix, blocked, onUnlock, onRescore }) {
  const why = reason => splitMsg(refusalText(reason))
  const row = (label, sub, ok, reason, onClick, Icon) => {
    const [head, hint] = ok ? [sub, null] : blocked ? [blocked, null] : why(reason)
    const off = !ok || !!blocked
    return (
      <button
        onClick={onClick}
        disabled={off}
        className={`min-h-[112px] rounded-2xl px-6 py-4 flex items-center gap-5 text-left
          transition-transform duration-[120ms] ease-snap enabled:active:scale-[0.98]
          focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#f5f0e8] ${
          off
            ? 'bg-[#0a1710] text-[#f5f0e8]/60 border-2 border-dashed border-[#f5f0e8]/20'
            : 'bg-[#1b3324] text-[#f5f0e8] active:bg-[#244130]'
        }`}
      >
        <Icon className="w-10 h-10 shrink-0" />
        <span className="flex flex-col gap-1 min-w-0">
          <span className="text-3xl font-bold leading-tight">{label}</span>
          <span className="text-xl font-semibold">{head}</span>
          {hint && <span className="text-lg">{hint}</span>}
        </span>
      </button>
    )
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-2 flex flex-col gap-3">
      {row('Unlock', 'Let teams answer again on their phones', fix?.canUnlock, fix?.unlockRefusal ?? 'nothing-to-fix', onUnlock, IconUnlock)}
      {row(fix?.rescoreLabel ?? 'Rescore', 'Score the locked answers again', fix?.canRescore, fix?.rescoreRefusal ?? 'nothing-to-fix', onRescore, IconRedo)}
    </div>
  )
}

const svg = (paths, fill = false) => function Icon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  )
}
function IconCheck(p) { return svg(<><circle cx="12" cy="12" r="10" /><path d="m7.5 12.5 3 3 6-6.5" /></>)(p) }
function IconAlert(p) { return svg(<><path d="M12 3 2.5 20h19Z" /><path d="M12 10v4.5M12 17.5v.01" /></>)(p) }
function IconCross(p) { return svg(<><circle cx="12" cy="12" r="10" /><path d="m8.5 8.5 7 7m0-7-7 7" /></>)(p) }
function IconArrow(p) { return svg(<path d="M6 4.5v15L19 12Z" />, true)(p) }
function IconBack(p) { return svg(<path d="M15 5 8 12l7 7" />)(p) }
function IconPause(p) { return svg(<><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>, true)(p) }
function IconGear(p) {
  return svg(<><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>)(p)
}
function IconList(p) { return svg(<><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>)(p) }
// Wrench outline after Lucide's (ISC).
function IconWrench(p) { return svg(<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />)(p) }
function IconUnlock(p) { return svg(<><rect x="4.5" y="11" width="15" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7" /></>)(p) }
function IconRedo(p) { return svg(<><path d="M20 5v5h-5" /><path d="M20 10a8 8 0 1 0 1.5 5" /></>)(p) }
