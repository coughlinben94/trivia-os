import { useEffect, useRef, useState } from 'react'
import { motion, MotionConfig, AnimatePresence, useReducedMotion } from 'framer-motion'
import { EASE_OUT, EASE_PANEL, EASE_EXIT } from '../lib/easings.js'
import { REMOTE_LOOK, lookCssVars, lookFontsHref, LOOK_DERIVED } from '../lib/remoteLook.js'
import { SCORE_MIN, SCORE_MAX } from '../lib/scoreCellWrite.js'
import { DEFAULT_REMOTE_URL, CLOSE_BAD_SECRET, BEAT_MS, STALE_BEAT_MS, GREY_GATES, refusalText, remoteStatus, jukeboxView } from '../lib/remoteProtocol.js'

// /remote — the iPad host remote (spec docs/superpowers/specs/2026-09-28-
// ipad-remote-design.md §9). A remote control only: it never touches
// Supabase. It pairs with the laptop relay, shows what the laptop's Live Mode
// says, and sends commands the laptop may refuse. The laptop is the engine.

// Applied once, on the root element.
const lookVars = { ...lookCssVars(REMOTE_LOOK), ...LOOK_DERIVED }

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

// Colours, fonts, sizes and radius all come from lib/remoteLook.js as
// --rl-* CSS vars set on the root below; nothing here hard-codes the look.
const TONE = {
  green: { icon: IconCheck, color: 'text-[color:var(--rl-next)]' },
  orange: { icon: IconAlert, color: 'text-[color:var(--rl-amber)]' },
  red: { icon: IconCross, color: 'text-[color:var(--rl-red-bright)]' },
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
      { tag: 'meta', name: 'theme-color', content: REMOTE_LOOK.colors.night },
      { tag: 'link', rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { tag: 'link', rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
      { tag: 'link', rel: 'stylesheet', href: lookFontsHref(REMOTE_LOOK) },
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
  const [drawer, setDrawer] = useState(null) // 'jump' | 'fix' | 'sounds' | 'scores' | null
  // The one score.set in flight from the Scores drawer: { id, state: 'saving'|'saved'|'refused', scoreSet?, reason? }
  const [scoreSend, setScoreSend] = useState(null)
  const scoreSendIdRef = useRef(null)
  // Phase 2b, both straight from the relay (not the laptop's Live Mode):
  const [local, setLocal] = useState(null)     // {type:'local-state', available, volume, ducked, sounds}
  const [jukebox, setJukebox] = useState(null) // {type:'jukebox', linked, waiting, open, playing, handoffPending}
  const [skipArmed, setSkipArmed] = useState(false)
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
        else if (m.type === 'local-state') setLocal(m)
        else if (m.type === 'jukebox') setJukebox(m)
        else if (m.type === 'result') {
          if (m.refused) setNotice(refusalText(m.refused))
          if (m.id === scoreSendIdRef.current) {
            if (m.done) setScoreSend({ id: m.id, state: 'saved', scoreSet: m.scoreSet })
            else if (m.refused) setScoreSend({ id: m.id, state: 'refused', reason: m.refused })
          }
        }
      }
      ws.onclose = e => {
        clearTimeout(watchdog)
        if (wsRef.current === ws) wsRef.current = null
        setSocket('closed')
        setCloseCode(e.code)
        setHostConnected(false)
        setLocal(null)
        setJukebox(null)
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

  // Jukebox mode (spec §17.2): the laptop is on a grading-break slide.
  const jb = jukeboxView({ snap, jukebox })
  // A second tap arms-then-sends; the arm lapses after 4s or off the break.
  useEffect(() => {
    if (!skipArmed) return undefined
    const t = setTimeout(() => setSkipArmed(false), 4000)
    return () => clearTimeout(t)
  }, [skipArmed])
  const atBreak = !!jb
  useEffect(() => { if (!atBreak) setSkipArmed(false) }, [atBreak])
  // Volume, Duck and sounds run on the relay itself, so they work without
  // Live Mode; local-state only arrives once paired. Pause still blocks them.
  const localBlock = !local ? 'Waiting for the laptop…'
    : !local.available ? splitMsg(refusalText('local-unavailable'))[0]
      : snap?.paused ? 'Paused on the laptop' : null
  // The jukebox commands go to the TV window, not Live Mode.
  const jukeboxOk = socket === 'open' && !!jukebox?.linked && !snap?.paused

  function send(cmd, args = {}, ok = live) {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN || !ok) return null
    setNotice(null)
    const id = String(++idRef.current)
    ws.send(JSON.stringify({
      type: 'cmd', id, cmd, args,
      expectSlideId: snap?.slide?.id ?? null,
      sentAt: Date.now() + offsetRef.current, // laptop time, for its 1500ms cut
    }))
    return id
  }

  // Scores drawer: the laptop only reads and sends the scoreboard while it is open.
  function openScores() {
    setScoreSend(null)
    scoreSendIdRef.current = null
    setDrawer('scores')
    send('scores.get')
  }
  function closeScores() {
    setDrawer(null)
    send('scores.hide', {}, true)
  }
  function sendScore(args) {
    const id = send('score.set', args)
    scoreSendIdRef.current = id
    setScoreSend(id ? { id, state: 'saving' } : null)
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
      className="h-[100dvh] overflow-hidden bg-[color:var(--rl-night)] text-[color:var(--rl-text)] flex flex-col select-none touch-manipulation"
      style={{
        ...lookVars,
        fontFamily: 'var(--rl-body)',
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
          <span className="text-xl font-semibold text-[color:var(--rl-text-75)] tabular-nums whitespace-nowrap truncate min-w-0 max-w-[45%]">
            {snap.slide.label} · {snap.slide.index + 1} / {snap.slide.total}
          </span>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="w-16 h-16 shrink-0 grid place-items-center rounded-[var(--rl-r)] text-[color:var(--rl-text-80)] active:bg-[color:var(--rl-raised)]"
        >
          <IconGear className="w-8 h-8" />
        </button>
      </header>

      {snap?.paused && (
        <div className="mx-4 mb-1 px-5 py-3 rounded-[var(--rl-r)] bg-[color:var(--rl-red)] text-xl font-bold flex items-center gap-3 shrink-0">
          <IconPause className="w-7 h-7 shrink-0" />
          Remote paused on the laptop
        </div>
      )}

      <main className="flex-1 min-h-0 grid gap-3 px-4 pb-4 pt-1
        portrait:grid-cols-2 portrait:grid-rows-[auto_1fr_auto_auto]
        landscape:grid-cols-[repeat(4,minmax(0,1fr))_minmax(240px,0.9fr)] landscape:grid-rows-[1fr_auto_auto]">
        {/* Up Next: reading, not tapping, so it sits away from the thumb */}
        <aside className="portrait:col-span-2 portrait:order-first landscape:col-start-5 landscape:row-start-1 landscape:row-span-3
          rounded-[var(--rl-r)] bg-[color:var(--rl-surface)] px-5 py-4 flex portrait:flex-row portrait:items-center landscape:flex-col gap-x-6 gap-y-3 min-h-0 min-w-0">
          <p className="text-[1rem] leading-6 font-semibold text-[color:var(--rl-text-75)] shrink-0">Up next</p>
          {(snap?.upNext ?? []).map((s, i) => (
            <p key={i} className={`text-2xl font-bold truncate min-w-0 ${i ? 'text-[color:var(--rl-text-75)]' : ''}`}>› {s.label}</p>
          ))}
          {snap && snap.upNext.length === 0 && <p className="text-2xl font-bold text-[color:var(--rl-text-75)]">End of show</p>}
          {!snap && <p className="text-xl text-[color:var(--rl-text-75)]">Nothing yet</p>}
          {/* Volume, Duck, Sounds: on the relay, so they work even without Live Mode */}
          <AudioBar
            local={local}
            block={localBlock}
            onVolDown={() => send('vol.down', {}, !localBlock)}
            onVolUp={() => send('vol.up', {}, !localBlock)}
            onDuck={() => send('duck', {}, !localBlock)}
            onSounds={() => setDrawer('sounds')}
          />
        </aside>

        {jb ? (
          <JukeboxPanel
            view={jb}
            ok={jukeboxOk}
            skipArmed={skipArmed}
            skipOff={nextOff}
            onOpen={() => send('jukebox.open', {}, jukeboxOk)}
            onExit={() => send('jukebox.exit', {}, jukeboxOk)}
            onPlay={() => send('jukebox.playStop', {}, jukeboxOk)}
            onSkip={() => {
              if (!skipArmed) { setSkipArmed(true); return }
              setSkipArmed(false)
              send('next', { expectGate: snap?.gate ?? null })
            }}
          />
        ) : (
        <button
          onClick={() => send('next', { expectGate: snap?.gate ?? null })}
          disabled={nextOff}
          className={`portrait:col-span-2 landscape:col-span-4 landscape:row-start-1 min-h-[240px] rounded-[var(--rl-r)] px-6 flex flex-col items-center justify-center gap-2 text-center
            transition-transform duration-[120ms] ease-snap enabled:active:scale-[0.97]
            focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--rl-text)] ${
            nextOff
              ? 'bg-[color:var(--rl-surface)] text-[color:var(--rl-text-75)] border-[3px] border-dashed border-[color:var(--rl-text-30)]'
              : 'bg-[color:var(--rl-next)] text-[color:var(--rl-nextink)] active:bg-[color:var(--rl-next-press)]'
          }`}
        >
          <span className="flex items-center gap-4 leading-none" style={{ fontFamily: 'var(--rl-display)', fontSize: 'var(--rl-word)' }}>
            NEXT
            {nextOff ? <IconPause className="w-[0.7em] h-[0.7em]" /> : <IconArrow className="w-[0.7em] h-[0.7em]" />}
          </span>
          <span className="font-bold leading-tight max-w-full [text-wrap:balance]" style={{ fontSize: 'var(--rl-cue)' }} data-cue>
            {cueHead}
          </span>
          {cueHint && <span className="text-2xl font-semibold max-w-full [text-wrap:balance]">{cueHint}</span>}
        </button>
        )}

        {/* Refusals: a reserved slot, so the buttons never jump under a thumb */}
        <div className="portrait:col-span-2 landscape:col-span-4 min-h-[64px] flex" role="status">
          {notice && (
            <motion.p
              key={notice}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="flex-1 flex items-center gap-3 px-5 py-2 rounded-[var(--rl-r)] bg-[color:var(--rl-amber)] text-[color:var(--rl-amber-ink)]"
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
              className="flex-1 flex items-center gap-3 px-5 py-2 rounded-[var(--rl-r)] border-2 border-[color:var(--rl-amber)] text-[color:var(--rl-text)]"
            >
              <IconAlert className="w-8 h-8 shrink-0 text-[color:var(--rl-amber)]" />
              <span className="text-xl font-semibold">{statusHint}</span>
            </motion.p>
          )}
        </div>

        {/* Two rows: the four quick presses, then the three drawers */}
        <div className="portrait:col-span-2 landscape:col-span-4 grid grid-cols-12 gap-3 [&>*:nth-child(-n+4)]:col-span-3 [&>*:nth-child(n+5)]:col-span-4">
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
        <DrawerButton onClick={openScores} disabled={!!jumpBlock} icon={IconTable}
          hint={jumpBlock ?? 'Fix one team\u2019s score'}>
          Scores
        </DrawerButton>
        </div>
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

      <Sheet open={drawer === 'scores'} onClose={closeScores} title="Scores" subtitle="Fix one team's score" tall wide>
        <ScoresPanel
          scores={snap?.scores ?? null}
          blocked={jumpBlock}
          notice={notice}
          send={scoreSend}
          onSet={sendScore}
          onClearSend={() => { setScoreSend(null); scoreSendIdRef.current = null; setNotice(null) }}
        />
      </Sheet>

      <Sheet open={drawer === 'sounds'} onClose={() => setDrawer(null)} title="Sounds" subtitle={localBlock ?? 'Plays on the laptop speakers'}>
        <SoundGrid
          sounds={local?.sounds ?? []}
          off={!!localBlock}
          onPlay={id => send('sound.play', { id }, !localBlock)}
          onStopAll={() => send('sound.stopAll', {}, !localBlock)}
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
            className="w-full max-w-xl max-h-full overflow-y-auto bg-[color:var(--rl-surface)] rounded-t-[calc(var(--rl-r)*1.4)] landscape:rounded-[var(--rl-r)] p-6 flex flex-col gap-5"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-4xl leading-none" style={{ fontFamily: 'var(--rl-display)' }}>Remote settings</h2>
              {cfg.secret && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="h-14 px-5 rounded-[var(--rl-r)] bg-[color:var(--rl-raised)] text-xl font-semibold"
                >
                  Close
                </button>
              )}
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-xl font-semibold">Pairing code</span>
              <span className="text-[1rem] leading-6 text-[color:var(--rl-text-75)]">
                On the laptop, run <code className="font-mono">npm run relay -- --init</code> and type the code it prints.
              </span>
              <input
                name="secret"
                defaultValue={cfg.secret}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-16 px-4 rounded-[var(--rl-r)] bg-[color:var(--rl-night)] border-2 border-[color:var(--rl-text-25)] focus:border-[color:var(--rl-next)] outline-none text-2xl text-[color:var(--rl-text)] tracking-widest font-mono"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xl font-semibold">Laptop address</span>
              <span className="text-[1rem] leading-6 text-[color:var(--rl-text-75)]">Leave this alone unless the laptop changed.</span>
              <input
                name="url"
                defaultValue={cfg.url}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-16 px-4 rounded-[var(--rl-r)] bg-[color:var(--rl-night)] border-2 border-[color:var(--rl-text-25)] focus:border-[color:var(--rl-next)] outline-none text-lg text-[color:var(--rl-text)] font-mono"
              />
            </label>
            <button
              type="submit"
              className="h-16 rounded-[var(--rl-r)] bg-[color:var(--rl-next)] text-[color:var(--rl-nextink)] text-2xl font-bold active:bg-[color:var(--rl-next-press)]"
            >
              Save
            </button>
            <p className="text-[1rem] leading-6 text-[color:var(--rl-text-75)]">
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
      className={`relative min-h-[var(--rl-bh)] min-w-0 rounded-[var(--rl-r)] px-4 py-3 flex flex-col justify-center gap-1 text-left
        focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)] ${
        disabled
          ? 'bg-[color:var(--rl-surface)] text-[color:var(--rl-text-50)] border-2 border-dashed border-[color:var(--rl-text-20)]'
          : lit
            ? 'bg-[color:var(--rl-text)] text-[color:var(--rl-nextink)] active:bg-[color:var(--rl-text-press)]'
            : 'bg-[color:var(--rl-raised)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-raised-press)]'
      } ${glow && !disabled ? 'ring-[5px] ring-[color:var(--rl-amber)] ring-offset-2 ring-offset-[color:var(--rl-night)]' : ''}`}
    >
      <span className="flex items-center gap-2 text-2xl font-bold leading-tight">
        {Icon && <Icon className="w-7 h-7 shrink-0" />}
        {children}
      </span>
      {toggle && (
        <span className="flex items-center gap-2 text-lg font-semibold">
          {glow && !disabled && !lit ? (
            <span className="text-[color:var(--rl-amber)] motion-safe:animate-pulse">Tap to reveal</span>
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
      className={`min-h-[var(--rl-bh)] min-w-0 rounded-[var(--rl-r)] px-4 py-3 flex flex-col justify-center gap-1 text-left
        focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)] ${
        disabled
          ? 'bg-[color:var(--rl-surface)] text-[color:var(--rl-text-50)] border-2 border-dashed border-[color:var(--rl-text-20)]'
          : 'bg-[color:var(--rl-raised)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-raised-press)]'
      }`}
    >
      <span className="flex items-center gap-2 text-2xl font-bold leading-tight">
        <Icon className="w-7 h-7 shrink-0" />
        {children}
      </span>
      {hint && <span className="text-[1rem] leading-5 font-semibold opacity-80 [overflow-wrap:anywhere]">{hint}</span>}
    </button>
  )
}

// Bottom sheet. Enter 280ms on the iOS drawer curve, exit faster (200ms);
// transform and opacity only. Reduced motion: fade only, no slide.
function Sheet({ open, onClose, title, subtitle, tall = false, wide = false, children }) {
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
            className={`w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} ${tall ? 'h-[85dvh]' : 'max-h-[85dvh]'} bg-[color:var(--rl-surface)] rounded-t-[calc(var(--rl-r)*1.4)] flex flex-col`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center gap-4 px-6 pt-5 pb-3 shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-4xl leading-none" style={{ fontFamily: 'var(--rl-display)' }}>{title}</h2>
                {subtitle && <p className="text-xl font-semibold text-[color:var(--rl-text-75)] mt-1 truncate">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="h-16 px-6 rounded-[var(--rl-r)] bg-[color:var(--rl-raised)] text-xl font-semibold"
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
            <h3 className="sticky top-0 z-10 bg-[color:var(--rl-surface)] px-2 py-2 text-[1rem] leading-6 font-semibold text-[color:var(--rl-text-75)]">{g.title}</h3>
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
                    className={`min-h-[72px] rounded-[var(--rl-r)] px-5 flex items-center gap-4 text-left
                      focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)] ${
                      here
                        ? 'bg-[color:var(--rl-night)] border-[3px] border-[color:var(--rl-next)] text-[color:var(--rl-text)]'
                        : picked
                          ? 'bg-[color:var(--rl-text)] text-[color:var(--rl-nextink)]'
                          : 'bg-[color:var(--rl-raised)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-raised-press)]'
                    }`}
                  >
                    <span className="w-12 shrink-0 text-lg font-semibold tabular-nums opacity-75">{s.index + 1}</span>
                    <span className="flex-1 min-w-0 text-2xl font-bold truncate">{s.label}</span>
                    {here && <span className="shrink-0 px-3 py-1 rounded-full bg-[color:var(--rl-next)] text-[color:var(--rl-nextink)] text-lg font-bold">Showing now</span>}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      {pick && (
        <div className="shrink-0 border-t-2 border-[color:var(--rl-text-15)] px-5 py-4 flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[12rem] text-2xl font-bold">
            Jump to {jumpName(pick)}?
            {blocked && <span className="block text-lg font-semibold text-[color:var(--rl-amber)]">{blocked}</span>}
          </p>
          <button
            onClick={() => setPick(null)}
            className="h-16 px-6 rounded-[var(--rl-r)] bg-[color:var(--rl-raised)] text-xl font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={() => onJump(pick)}
            disabled={!!blocked}
            className="h-16 px-7 rounded-[var(--rl-r)] text-xl font-bold
              bg-[color:var(--rl-next)] text-[color:var(--rl-nextink)] active:bg-[color:var(--rl-next-press)] disabled:bg-[color:var(--rl-surface)] disabled:text-[color:var(--rl-text-50)] disabled:border-2 disabled:border-dashed disabled:border-[color:var(--rl-text-20)]"
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
        className={`min-h-[112px] rounded-[var(--rl-r)] px-6 py-4 flex items-center gap-5 text-left
          focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)] ${
          off
            ? 'bg-[color:var(--rl-night)] text-[color:var(--rl-text-60)] border-2 border-dashed border-[color:var(--rl-text-20)]'
            : 'bg-[color:var(--rl-raised)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-raised-press)]'
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

// ─── Scores drawer (phase 3, reduced: fix one team's score) ────────────────
// Three levels plus a confirm: teams, a team's rounds, one round's editor,
// then "Change X Round 2 from 7 to 9?". The laptop does a fresh read, writes
// only that cell, and sends back what the database now says.
const MINUS = '\u2212'
const signed = n => (n < 0 ? `${MINUS}${-n}` : String(n))
function roundName(label) {
  if (label === '?') return 'Bonus'
  if (label === 'SW') return 'Swing round'
  if (label === 'PYL') return 'Press Your Luck'
  const m = /^R(\d+)$/.exec(label ?? '')
  return m ? `Round ${m[1]}` : label ?? 'Round'
}
const ordinal = n => {
  const t = n % 100
  if (t >= 11 && t <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] ?? 'th'}`
}
const row = `min-h-[80px] rounded-[var(--rl-r)] px-5 flex items-center gap-4 text-left
  focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)]
  bg-[color:var(--rl-raised)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-raised-press)]`
const barBtn = 'h-16 px-6 rounded-[var(--rl-r)] text-xl font-semibold'
const goBtn = `h-16 px-7 rounded-[var(--rl-r)] text-xl font-bold bg-[color:var(--rl-next)] text-[color:var(--rl-nextink)] active:bg-[color:var(--rl-next-press)]
  disabled:bg-[color:var(--rl-surface)] disabled:text-[color:var(--rl-text-50)] disabled:border-2 disabled:border-dashed disabled:border-[color:var(--rl-text-20)]`

function ScoresPanel({ scores, blocked, notice, send, onSet, onClearSend }) {
  const [teamId, setTeamId] = useState(null)
  const [edit, setEdit] = useState(null) // { colKey, old, draft, fresh, confirm }
  const team = scores?.teams.find(t => t.id === teamId) ?? null
  const cell = edit && team ? team.cells.find(c => c.key === edit.colKey) : null
  const [noticeHead, noticeHint] = splitMsg(notice)

  const back = () => {
    const refused = send?.state === 'refused'
    onClearSend()
    // After a refusal (the number moved on the laptop), start again from what it says now.
    if (edit?.confirm && refused && cell) setEdit({ colKey: cell.key, old: cell.value, draft: cell.value, fresh: true, confirm: false })
    else if (edit?.confirm) setEdit({ ...edit, confirm: false })
    else if (edit) setEdit(null)
    else setTeamId(null)
  }
  const bar = (left, right) => (
    <div className="shrink-0 border-t-2 border-[color:var(--rl-text-15)] px-5 py-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[12rem]">{left}</div>
      {right}
    </div>
  )
  const backBtn = <button onClick={back} className={`${barBtn} bg-[color:var(--rl-raised)]`}>Back</button>
  const noticeBox = notice && (
    <div role="status" className="mx-5 mb-3 flex items-center gap-3 px-5 py-3 rounded-[var(--rl-r)] bg-[color:var(--rl-amber)] text-[color:var(--rl-amber-ink)]">
      <IconAlert className="w-8 h-8 shrink-0" />
      <span className="flex flex-col">
        <span className="text-2xl font-bold">{noticeHead}</span>
        {noticeHint && <span className="text-xl font-semibold">{noticeHint}</span>}
      </span>
    </div>
  )

  if (!scores) {
    return (
      <>
        {noticeBox}
        <p className="px-6 py-4 text-2xl font-semibold text-[color:var(--rl-text-75)]">
          {notice ? 'Close this and try again in a moment.' : 'Getting scores from the laptop…'}
        </p>
      </>
    )
  }

  // Level 1: teams by place.
  if (!team) {
    return (
      <>
        {noticeBox}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 flex flex-col gap-2">
          {scores.teams.length === 0 && <p className="px-2 text-2xl text-[color:var(--rl-text-75)]">No teams on the scoreboard yet.</p>}
          {scores.teams.map(t => (
            <button key={t.id} data-team={t.id} onClick={() => { onClearSend(); setTeamId(t.id) }} className={row}>
              <span className="w-20 shrink-0 text-xl font-semibold text-[color:var(--rl-text-75)] tabular-nums">{t.place ? ordinal(t.place) : 'No points'}</span>
              <span className="flex-1 min-w-0 text-2xl font-bold truncate">{t.name || 'Unnamed team'}</span>
              <span className="shrink-0 text-3xl font-bold tabular-nums">{signed(t.total)}</span>
            </button>
          ))}
        </div>
      </>
    )
  }

  // Level 2: one team's rounds.
  if (!edit || !cell) {
    return (
      <>
        <p className="px-6 pb-2 text-2xl font-bold truncate">{team.name} · {signed(team.total)} total</p>
        {noticeBox}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 grid grid-cols-2 landscape:grid-cols-3 gap-2 content-start">
          {team.cells.map(c => (
            <button key={c.key} data-col={c.key} onClick={() => { onClearSend(); setEdit({ colKey: c.key, old: c.value, draft: c.value, fresh: true, confirm: false }) }} className={row}>
              <span className="flex-1 min-w-0 text-2xl font-bold truncate">{roundName(c.label)}</span>
              <span className="shrink-0 text-3xl font-bold tabular-nums">{signed(c.value)}</span>
            </button>
          ))}
        </div>
        {bar(<span className="text-lg font-semibold text-[color:var(--rl-text-75)]">Tap a round to change it</span>, backBtn)}
      </>
    )
  }

  // Level 3: the editor, then its confirm.
  const name = `${team.name} ${roundName(cell.label)}`
  const draft = edit.draft
  const valid = Number.isInteger(draft) && draft >= SCORE_MIN && draft <= SCORE_MAX
  const changed = valid && draft !== edit.old
  const clamp = n => Math.max(SCORE_MIN, Math.min(SCORE_MAX, n))
  const step = n => setEdit(e => ({ ...e, draft: clamp(e.draft + n), fresh: true }))
  const digit = d => setEdit(e => {
    const base = e.fresh ? 0 : e.draft
    const sign = !e.fresh && e.draft < 0 ? -1 : 1
    const next = sign * (Math.abs(base) * 10 + d)
    return Math.abs(next) > SCORE_MAX ? e : { ...e, draft: next, fresh: false }
  })
  const del = () => setEdit(e => ({ ...e, draft: Math.trunc(e.draft / 10), fresh: false }))
  const flip = () => setEdit(e => ({ ...e, draft: -e.draft || 0, fresh: false }))
  const sending = send?.state === 'saving'
  const saved = send?.state === 'saved' ? send.scoreSet : null
  const key = `h-16 rounded-[var(--rl-r)] text-2xl font-bold bg-[color:var(--rl-raised)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-raised-press)]
    focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)]`
  const stepBtn = `${key} w-24 text-3xl`

  if (edit.confirm) {
    return (
      <>
        {noticeBox}
        <div className="flex-1 min-h-0 px-6 py-4 flex flex-col justify-center gap-4">
          {saved ? (
            <p className="text-4xl font-bold leading-tight" role="status">
              Saved. {saved.team} {roundName(saved.col)} is now {signed(saved.to)}
            </p>
          ) : (
            <p className="text-4xl font-bold leading-tight [text-wrap:balance]">
              Change {name} from {signed(edit.old)} to {signed(draft)}?
            </p>
          )}
          {sending && <p className="text-2xl font-semibold text-[color:var(--rl-text-75)]">Saving on the laptop…</p>}
          {blocked && !saved && <p className="text-xl font-semibold text-[color:var(--rl-amber)]">{blocked}</p>}
        </div>
        {bar(
          <span className="text-lg font-semibold text-[color:var(--rl-text-75)]">
            {saved ? 'The number above is what the laptop saved' : 'Phone scoreboards update right away'}
          </span>,
          saved ? (
            <button onClick={() => { onClearSend(); setEdit(null) }} className={goBtn}>Done</button>
          ) : (
            <>
              {backBtn}
              <button
                onClick={() => onSet({ teamId: team.id, colKey: cell.key, value: draft, expectOld: edit.old })}
                disabled={!!blocked || sending || send?.state === 'refused'}
                className={goBtn}
              >
                Yes, change it
              </button>
            </>
          ),
        )}
      </>
    )
  }

  return (
    <>
      <p className="px-6 pb-1 text-3xl font-bold truncate">{team.name}, {roundName(cell.label)}: {signed(edit.old)}</p>
      {cell.phone !== 0 && (
        <p className="px-6 pb-1 text-lg font-semibold text-[color:var(--rl-text-75)]">{signed(cell.phone)} of these came from phones. Phone points stay; the rest moves.</p>
      )}
      {noticeBox}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2 flex landscape:flex-row portrait:flex-col items-center justify-center gap-6">
        <div className="flex items-center gap-3">
          <button onClick={() => step(-5)} className={stepBtn}>{MINUS}5</button>
          <button onClick={() => step(-1)} className={stepBtn}>{MINUS}1</button>
          <span data-draft className="w-40 text-center tabular-nums leading-none" style={{ fontFamily: 'var(--rl-display)', fontSize: 'clamp(4rem, 10vmin, 6rem)' }}>{signed(draft)}</span>
          <button onClick={() => step(1)} className={stepBtn}>+1</button>
          <button onClick={() => step(5)} className={stepBtn}>+5</button>
        </div>
        <div className="grid grid-cols-3 gap-2 w-[17rem] shrink-0">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => <button key={d} onClick={() => digit(d)} className={key}>{d}</button>)}
          <button onClick={flip} aria-label="Minus sign" className={key}>±</button>
          <button onClick={() => digit(0)} className={key}>0</button>
          <button onClick={del} aria-label="Delete" className={key}>⌫</button>
        </div>
      </div>
      {bar(
        <span className="text-lg font-semibold text-[color:var(--rl-text-75)]">{changed ? `Now ${signed(edit.old)}, new ${signed(draft)}` : 'Change the number to save'}</span>,
        <>
          {backBtn}
          <button onClick={() => { onClearSend(); setEdit({ ...edit, confirm: true }) }} disabled={!changed} className={goBtn}>Save</button>
        </>,
      )}
    </>
  )
}

// Jukebox mode (spec §17.2): takes Next's place while the laptop sits on a
// grading break. Back to Trivia is the b key (music fades, jukebox saves,
// Final Break jumps to the winner); plain Next would cut all of that, so it
// hides behind a second, confirming tap.
function JukeboxPanel({ view, ok, skipArmed, skipOff, onOpen, onExit, onPlay, onSkip }) {
  const big = 'flex-[2] min-w-0 min-h-[200px] rounded-[var(--rl-r)] px-6 flex flex-col items-center justify-center gap-2 text-center focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--rl-text)]'
  const on = 'bg-[color:var(--rl-next)] text-[color:var(--rl-nextink)] active:bg-[color:var(--rl-next-press)]'
  const offCls = 'bg-[color:var(--rl-surface)] text-[color:var(--rl-text-75)] border-[3px] border-dashed border-[color:var(--rl-text-30)]'
  const title = t => <span className="leading-none" style={{ fontFamily: 'var(--rl-display)', fontSize: 'clamp(3rem, 8vmin, 5rem)' }}>{t}</span>
  const sub = t => <span className="text-2xl font-bold leading-tight [text-wrap:balance]">{t}</span>
  let main
  if (view.phase === 'open') {
    main = (
      <button data-k="jukebox-exit" onClick={onExit} disabled={!ok} className={`${big} ${ok ? on : offCls}`}>
        {title('Back to Trivia')}
        {sub(ok ? 'Fades the music, then the next slide' : 'Paused on the laptop')}
      </button>
    )
  } else if (view.phase === 'waiting') {
    main = (
      <button data-k="jukebox-open" onClick={onOpen} disabled={!ok} className={`${big} ${ok ? on : offCls}`}>
        {title('Open jukebox now')}
        {sub('Skips the 10 second wait')}
      </button>
    )
  } else {
    const [head, hint] = view.phase === 'unlinked'
      ? splitMsg(refusalText('display-offline'))
      : ['Jukebox opening…', null]
    main = (
      <div className={`${big} ${offCls}`} role="status">
        {title(view.phase === 'unlinked' ? 'Jukebox' : 'Music')}
        {sub(head)}
        {hint && <span className="text-xl font-semibold">{hint}</span>}
      </div>
    )
  }
  const playOff = !ok || view.phase !== 'open' || view.handoffPending
  const playing = view.phase === 'open' && view.playing
  return (
    <div className="portrait:col-span-2 landscape:col-span-4 landscape:row-start-1 min-h-[240px] flex gap-3">
      {main}
      <div className="flex-1 min-w-[180px] flex flex-col gap-3">
        <button
          data-k="jukebox-play"
          onClick={onPlay}
          disabled={playOff}
          aria-pressed={playing}
          className={`flex-1 min-h-[104px] rounded-[var(--rl-r)] px-5 py-3 flex flex-col justify-center gap-1 text-left
            focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)] ${
            playOff
              ? 'bg-[color:var(--rl-surface)] text-[color:var(--rl-text-50)] border-2 border-dashed border-[color:var(--rl-text-20)]'
              : playing ? 'bg-[color:var(--rl-text)] text-[color:var(--rl-nextink)] active:bg-[color:var(--rl-text-press)]' : 'bg-[color:var(--rl-raised)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-raised-press)]'
          }`}
        >
          <span className="flex items-center gap-2 text-2xl font-bold leading-tight">
            {playing ? <IconStop className="w-7 h-7 shrink-0" /> : <IconArrow className="w-7 h-7 shrink-0" />}
            {playing ? 'Stop' : 'Play'}
          </span>
          <span className="flex items-center gap-2 text-lg font-semibold">
            <span className={`w-4 h-4 rounded-full border-[3px] border-current ${playing ? 'bg-current' : ''}`} aria-hidden />
            {view.phase === 'open' && view.handoffPending ? 'Starting…' : playing ? 'Playing' : 'Stopped'}
          </span>
        </button>
        <button
          data-k="skip-break"
          onClick={onSkip}
          disabled={skipOff}
          className={`min-h-[72px] rounded-[var(--rl-r)] px-4 py-2 text-left text-lg font-bold leading-tight
            focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)] ${
            skipOff
              ? 'bg-[color:var(--rl-surface)] text-[color:var(--rl-text-50)] border-2 border-dashed border-[color:var(--rl-text-20)]'
              : skipArmed ? 'bg-[color:var(--rl-amber)] text-[color:var(--rl-amber-ink)]' : 'bg-[color:var(--rl-surface)] text-[color:var(--rl-text)] border-2 border-[color:var(--rl-text-30)] active:bg-[color:var(--rl-raised)]'
          }`}
        >
          {skipArmed ? 'Tap again to skip. No fade, no save' : 'Skip the break (no fade)'}
        </button>
      </div>
    </div>
  )
}

// System volume, Duck and the Sounds drawer, run by the relay on the laptop
// (macOS output, the same as the Stream Deck keys). Compact on the main
// screen, taller in jukebox mode.
function AudioBar({ local, block, onVolDown, onVolUp, onDuck, onSounds }) {
  const off = !!block
  const btn = `min-h-[72px] rounded-[var(--rl-r)] px-3 flex items-center justify-center gap-2 text-2xl font-bold
    focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)]`
  const idle = off ? 'bg-[color:var(--rl-night)] text-[color:var(--rl-text-50)] border-2 border-dashed border-[color:var(--rl-text-20)]' : 'bg-[color:var(--rl-raised)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-raised-press)]'
  const ducked = !!local?.ducked
  return (
    <div className="landscape:mt-auto portrait:ml-auto portrait:w-[22rem] flex flex-col gap-2 min-w-0 shrink-0">
      <p className="text-[1rem] leading-6 font-semibold text-[color:var(--rl-text-75)]">
        {off && local ? block : 'Laptop sound'}
      </p>
      <div className="flex gap-2 min-w-0">
        <button data-k="vol-down" aria-label="Volume down" onClick={onVolDown} disabled={off} className={`${btn} ${idle} w-16 shrink-0`}>
          <IconMinus className="w-8 h-8" />
        </button>
        <div data-k="vol-level" aria-label="Laptop volume" className="min-h-[72px] flex-1 min-w-0 flex items-center justify-center text-3xl font-bold tabular-nums">
          {local?.volume ?? '–'}
        </div>
        <button data-k="vol-up" aria-label="Volume up" onClick={onVolUp} disabled={off} className={`${btn} ${idle} w-16 shrink-0`}>
          <IconPlus className="w-8 h-8" />
        </button>
      </div>
      <button
        data-k="duck"
        onClick={onDuck}
        disabled={off}
        aria-pressed={ducked}
        className={`${btn} flex-col !gap-0 ${off ? idle : ducked ? 'bg-[color:var(--rl-text)] text-[color:var(--rl-nextink)] active:bg-[color:var(--rl-text-press)]' : idle}`}
      >
        <span>Duck</span>
        <span className="flex items-center gap-2 text-lg font-semibold">
          <span className={`w-4 h-4 rounded-full border-[3px] border-current ${ducked ? 'bg-current' : ''}`} aria-hidden />
          {ducked ? 'On, tap to restore' : 'Off'}
        </span>
      </button>
      <button data-k="sounds" onClick={onSounds} disabled={off} className={`${btn} ${idle}`}>
        <IconSpeaker className="w-8 h-8 shrink-0" />
        Sounds
      </button>
    </div>
  )
}

// The Stream Deck's soundboard page. Only the id ever leaves the iPad; the
// relay looks the file up in its own list. The drawer stays open between
// taps, like the Stream Deck page.
function SoundGrid({ sounds, off, onPlay, onStopAll }) {
  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-3 pt-1 grid grid-cols-2 landscape:grid-cols-3 gap-3 content-start">
        {sounds.length === 0 && (
          <p className="col-span-full text-xl text-[color:var(--rl-text-75)]">
            No sounds set up. On the laptop, run <code className="font-mono">npm run relay -- --init-sounds</code>.
          </p>
        )}
        {sounds.map(snd => {
          const dead = off || snd.missing
          return (
            <button
              key={snd.id}
              data-sound={snd.id}
              onClick={() => onPlay(snd.id)}
              disabled={dead}
              className={`min-h-[96px] rounded-[var(--rl-r)] px-5 py-3 flex flex-col justify-center gap-1 text-left
                focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--rl-text)] ${
                dead ? 'bg-[color:var(--rl-night)] text-[color:var(--rl-text-50)] border-2 border-dashed border-[color:var(--rl-text-20)]' : 'bg-[color:var(--rl-raised)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-raised-press)]'
              }`}
            >
              <span className="text-2xl font-bold leading-tight">{snd.label}</span>
              {snd.missing && <span className="text-lg font-semibold">File missing on the laptop</span>}
            </button>
          )
        })}
      </div>
      <div className="shrink-0 border-t-2 border-[color:var(--rl-text-15)] px-5 py-4">
        <button
          data-k="stop-all"
          onClick={onStopAll}
          disabled={off}
          className="w-full min-h-[80px] rounded-[var(--rl-r)] text-2xl font-bold flex items-center justify-center gap-3
            bg-[color:var(--rl-red)] text-[color:var(--rl-text)] active:bg-[color:var(--rl-red-press)] disabled:bg-[color:var(--rl-surface)] disabled:text-[color:var(--rl-text-50)] disabled:border-2 disabled:border-dashed disabled:border-[color:var(--rl-text-20)]"
        >
          <IconStop className="w-8 h-8" />
          Stop all sounds
        </button>
      </div>
    </>
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
function IconTable(p) { return svg(<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M9.5 9.5v10" /></>)(p) }
function IconWrench(p) { return svg(<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />)(p) }
function IconUnlock(p) { return svg(<><rect x="4.5" y="11" width="15" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7" /></>)(p) }
function IconRedo(p) { return svg(<><path d="M20 5v5h-5" /><path d="M20 10a8 8 0 1 0 1.5 5" /></>)(p) }
function IconStop(p) { return svg(<rect x="6" y="6" width="12" height="12" rx="1.5" />, true)(p) }
function IconPlus(p) { return svg(<path d="M12 5v14M5 12h14" />)(p) }
function IconMinus(p) { return svg(<path d="M5 12h14" />)(p) }
function IconSpeaker(p) { return svg(<><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" /><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>)(p) }
