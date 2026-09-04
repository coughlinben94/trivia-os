import { useState, useEffect, useRef, useCallback } from 'react'
import * as Sentry from '@sentry/react'
import { getToken, refreshToken } from '../lib/spotify'
import { computeFadeBudget } from '../lib/fade'

// Diagnostic-only — no client bound (local dev, no VITE_SENTRY_DSN) makes
// these silent no-ops, same as main.jsx's conditional Sentry.init.
// 2026-09-03: added after a live-show jukebox failure ("worked once, never
// again") turned out to have ZERO telemetry — playTrack's failure branches
// only ever console.error, and Jukebox.jsx's own retry-exhausted toast is
// easy to miss on a live TV. Two root-cause theories were chased and ruled
// out from code/git alone (a deploy-triggered reload, and a stale `ready`
// listener) without ever landing on hard evidence. These breadcrumbs exist
// so the NEXT occurrence leaves a real trace instead of another guessing
// round: which break number, whether a device_id was ever held, and the
// exact HTTP status Spotify returned.
let mountCount = 0
export const reportJukebox = (stage, extra = {}) =>
  Sentry.captureMessage(`jukebox: ${stage}`, { level: 'warning', tags: { area: 'jukebox' }, extra })

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const FADE_STEPS = 24
const FADE_MS = 2500

// Root cause of the 2026-08-25 live-show bug ("worked once, only once" —
// every grading break after the first landed on the plain library instead
// of auto-playing): JukeboxBreakOverlay's Jukebox fully unmounts between
// breaks (Display.jsx removes it from the tree once breakActive/breakEligible
// both go false), so this hook's init effect used to run `new
// window.Spotify.Player(...)` + `.connect()` fresh on EVERY break. The
// Spotify Web Playback SDK reliably fires 'ready' (handing back a device_id)
// for the FIRST player instance built in a tab; a second instance built
// later in the same page session — even well after the first was
// disconnected — does not reliably re-fire 'ready', so deviceIdRef never
// populates on the second+ break and playTrack's waitForRef(deviceIdRef)
// times out every time. That's a deterministic SDK limitation, not the
// transient race the existing retry-once logic in Jukebox.jsx's attemptPlay
// was built for (2026-08-18 note there) — retrying doesn't help a device_id
// that will never arrive. Fix: build the Player object exactly once per page
// load and reuse it across every mount; only this mount's listeners (which
// close over its own React state setters) get rebound each time.
let sharedSpotifyPlayer = null
let sharedDeviceId = null
// Set while reconnect() is rebuilding the shared singleton (see reconnect's
// own comment). A mount's init() effect can fire in that same window — e.g.
// break 3 mounting while break 2's failed playTrack is still reconnecting —
// and without this, init() would see sharedSpotifyPlayer as null (reconnect
// nulls it synchronously before its first await) and build a SECOND
// Spotify.Player concurrently, orphaning one of the two Connect devices
// Spotify registers server-side per connect(). init() awaits this instead of
// racing it (2026-09-04, second-opinion review of 57f0b97).
let reconnectPromise = null

// Root cause of the 2026-07-28 "shuffle plays nothing, forever" bug: every
// other awaited network step in this file (deviceId poll, play-confirmation
// listener, seek landed-poll) has an explicit deadline with a fallback. The
// play PUT and seek PUT fetches did not — a bare `await fetch(...)` with no
// timeout. If that fetch never settles (a stalled connection, a dropped
// response — doesn't matter why), playTrack hangs forever with no error, no
// fade-in, no tonearm drop, no audio, and no recovery. Surviving a page
// refresh or a full Spotify disconnect/reconnect doesn't rule this out: the
// hang isn't caused by stale in-memory state, it's caused by whatever's
// stalling the network path repeating on the next attempt too. Wrap the
// two calls that can block the whole pipeline (play, seek) in a hard
// timeout so a stall degrades to a caught failure instead of an infinite
// hang.
const NETWORK_TIMEOUT_MS = 6000
const fetchWithTimeout = (url, options, timeoutMs = NETWORK_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

// Same gap, different shape (2026-07-30): the Spotify SDK's own
// player.pause() returns a Promise we don't control the way a fetch's
// AbortController does — there's no signal to pass it, it just resolves
// when Spotify acknowledges the pause. If that ack never comes, `await
// player.pause()` blocks forever with no error, same as the unguarded
// fetches above. Reproduced live: start a shuffle session, open a
// DIFFERENT song's preview in SongDetailModal, hit its play button —
// handlePlay's `await onStopLiveShuffle()` (which bottoms out in
// fadeAndPause's `await playerRef.current?.pause()` below) never resolved,
// so the preview's own playTrack call was never even reached. Races the
// pause call against a timeout instead of awaiting it bare — proceeding
// after the timeout (rather than throwing) is deliberate: the caller's
// next step is always to force local volume/state anyway, so a slow-to-ack
// pause shouldn't block that.
const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise(resolve => setTimeout(resolve, ms)),
])
// Manual stop (spacebar/iPad) needs to actually go quiet fast — the host hits
// it because they're about to talk (read a question, make an announcement),
// not because a song is musically ending. The full FADE_MS=2500 fade was
// built for that second case (song-to-song, see startMonitor) and dragging it
// into a deliberate "stop now" left trailing audio bleeding into the first
// couple seconds of whatever the host said next. Short enough to avoid an
// audible click/pop, nowhere near long enough to read as a musical fade-out.
const STOP_FADE_MS = 400

// Poll a ref until it holds a truthy value, or give up after `timeoutMs` and
// resolve null. Shared by playTrack's two "hasn't finished initializing yet"
// races below (the player itself connecting, then its device ID arriving) —
// same shape, different ref. clearInterval runs on BOTH the resolve path and
// the deadline path (2026-08-07, Opus review: losing it on the deadline path
// left the interval running for the life of the page whenever the ref never
// became truthy — exactly when something's already gone wrong).
function waitForRef(ref, timeoutMs = 5000, intervalMs = 100) {
  if (ref.current) return Promise.resolve(ref.current)
  return new Promise(resolve => {
    const poll = setInterval(() => {
      if (ref.current) {
        clearInterval(poll)
        clearTimeout(deadline)
        resolve(ref.current)
      }
    }, intervalMs)
    const deadline = setTimeout(() => { clearInterval(poll); resolve(null) }, timeoutMs)
  })
}

export function useSpotifyPlayer({ onAdvance, onFadeStart } = {}) {
  const [isReady, setIsReady] = useState(false)
  const [isPaused, setIsPaused] = useState(true)
  const [currentTrack, setCurrentTrack] = useState(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(null)
  const [volume, setVolumeState] = useState(0.8)

  const playerRef = useRef(null)
  const deviceIdRef = useRef(null)
  const genRef = useRef(0)
  // Set true in the init effect's own cleanup below. `genRef` alone can't
  // express "this mount is gone" — playTrack unconditionally bumps it on
  // every call, so a call that was ALREADY mid-flight (awaiting
  // waitForRef(playerRef)/waitForRef(deviceIdRef), each up to 5s) when
  // Jukebox.jsx's new unmount-fadeAndPause fires resumes as if nothing
  // happened and plays the track through the full pipeline anyway —
  // resurrecting the exact "audio never stops" bug that fade was added to
  // fix, this time via a zombie playTrack instead of a stuck one (2026-08-26,
  // fable review of that fix). Checked at the two long-wait resume points and
  // right before startMonitor, not on every internal await — those two waits
  // are the only ones long enough to still be pending several seconds after
  // an unmount most calls have already cleared by.
  const deadRef = useRef(false)
  const monitorRef = useRef(null)
  const seekingRef = useRef(false)
  const seekTimerRef = useRef(null)
  const stopWatchDisabledRef = useRef(false)
  const maxVolumeRef = useRef(0.8)
  const onAdvanceRef = useRef(onAdvance)
  const onFadeStartRef = useRef(onFadeStart)
  // Suppresses the transient isPaused=true the SDK emits during auto-advance
  const transitioningRef = useRef(false)
  const fadingRef = useRef(false)
  // Set by the mount effect below so `reconnect` (defined outside that
  // effect, called on demand from a failed playTrack) can rebind listeners
  // onto a freshly-built player the same way the effect's own init() does —
  // see `reconnect`'s own comment for why this exists.
  const bindListenersRef = useRef(null)

  useEffect(() => { onAdvanceRef.current = onAdvance }, [onAdvance])
  useEffect(() => { onFadeStartRef.current = onFadeStart }, [onFadeStart])

  useEffect(() => {
    window.onSpotifyWebPlaybackSDKReady = () => {}

    // Bind THIS mount's listeners (closing over this mount's own state
    // setters) onto whatever player instance is in play — a fresh one or the
    // shared singleton. See sharedSpotifyPlayer's comment above for why the
    // player object itself is never rebuilt after the first mount.
    const bindListeners = (player) => {
      player.addListener('ready', ({ device_id }) => {
        sharedDeviceId = device_id
        deviceIdRef.current = device_id
        setIsReady(true)
      })
      player.addListener('not_ready', () => setIsReady(false))
      player.addListener('player_state_changed', state => {
        if (!state) return
        // The SDK hands us a fresh track object on every state event (buffer,
        // seek, pause…). Keep the previous reference while the URI is unchanged
        // so consumers comparing by identity (memo'd LiveScreen) don't re-render.
        const next = state.track_window.current_track
        setCurrentTrack(prev => (prev?.uri === next?.uri ? prev : next))
        // Suppress the transient paused=true the SDK emits right after auto-advance pause()
        if (!transitioningRef.current) setIsPaused(state.paused)
        setDuration(state.duration)
        if (!seekingRef.current) setPosition(state.position)
      })
      player.addListener('account_error', () =>
        setError('Spotify Premium required for in-browser playback.')
      )
      player.addListener('authentication_error', () =>
        setError('Auth failed — try reconnecting Spotify.')
      )
      player.addListener('initialization_error', ({ message }) =>
        setError(`Player init failed: ${message}`)
      )
    }
    bindListenersRef.current = bindListeners

    const init = async () => {
      mountCount += 1
      // A reconnect() from a different mount is mid-flight — wait for it
      // instead of racing it (see reconnectPromise's own comment above).
      if (reconnectPromise) await reconnectPromise
      if (deadRef.current) return
      if (sharedSpotifyPlayer) {
        // Reuse the already-connected singleton instead of constructing a
        // second Spotify.Player — see the sharedSpotifyPlayer comment above.
        playerRef.current = sharedSpotifyPlayer
        if (sharedDeviceId) deviceIdRef.current = sharedDeviceId
        bindListeners(sharedSpotifyPlayer)
        setIsReady(!!sharedDeviceId)
        if (!sharedDeviceId) reportJukebox('reused player mounted with no cached device_id', { mountCount })
        return
      }

      const token = await getToken()
      if (!token) return

      const player = new window.Spotify.Player({
        name: 'Trivia Jukebox',
        getOAuthToken: cb => getToken().then(cb),
        volume: 0,
      })
      // Assigned here, before connect() resolves, not after (2026-08-24,
      // Opus review) — the cleanup below only ever touched
      // playerRef.current, so an unmount landing mid-connect() (now a real
      // window: the grading-break overlay can mount-then-unmount inside
      // 2.5s if the host advances mid-warp) used to miss null while this
      // local `player` kept connecting anyway, leaking a live "Trivia
      // Jukebox" Spotify Connect device nothing could ever stop.
      sharedSpotifyPlayer = player
      playerRef.current = player

      bindListeners(player)

      await player.connect()
    }

    if (window.Spotify) init()
    else window.onSpotifyWebPlaybackSDKReady = init

    return () => {
      deadRef.current = true
      clearInterval(monitorRef.current)
      // Don't disconnect — sharedSpotifyPlayer stays connected for the whole
      // page session (see its comment above) so the NEXT grading break can
      // reuse it. Just drop this mount's listeners so an unmounted overlay's
      // state setters can't fire after teardown; the next mount rebinds
      // fresh ones via bindListeners.
      const p = playerRef.current
      // 'ready' fires exactly ONCE per player instance for its whole page
      // lifetime (see sharedSpotifyPlayer's comment above). Spotify's
      // removeListener(name) with no callback wipes EVERY listener for that
      // event on the player, not just this mount's own. If this mount
      // unmounts before 'ready' has ever fired on the shared singleton (a
      // real window: the overlay can mount-then-unmount inside 2.5s if the
      // host advances mid-warp), removing it here permanently loses that
      // one-shot event — sharedDeviceId never populates, reproducing the
      // exact "every break after the first breaks" bug this file exists to
      // fix (2026-08-26, Sonnet re-review). Only safe to remove once it's
      // already done its one job.
      if (sharedDeviceId) p?.removeListener('ready')
      p?.removeListener('not_ready')
      p?.removeListener('player_state_changed')
      p?.removeListener('account_error')
      p?.removeListener('authentication_error')
      p?.removeListener('initialization_error')
    }
  }, [])

  // ─── Fade helpers ───────────────────────────────────────────────
  // durationMs defaults to FADE_MS but callers can pass a shorter window when
  // there isn't a full FADE_MS of room outside the trimmed in/out points to
  // spend on the fade (see playTrack/startMonitor).
  const fadeVolume = async (from, to, gen, durationMs = FADE_MS) => {
    const player = playerRef.current
    if (!player) return
    fadingRef.current = true
    const steps = FADE_STEPS
    const stepMs = durationMs / steps
    for (let i = 0; i < steps; i++) {
      if (genRef.current !== gen) { fadingRef.current = false; return }
      const v = from + (to - from) * (i / steps)
      player.setVolume(Math.max(0, Math.min(1, v)))
      await sleep(stepMs)
    }
    // i/steps never reaches 1 inside the loop (i maxes out at steps-1), so the
    // last applied value is one step short of `to` — land exactly on target.
    if (genRef.current === gen) player.setVolume(Math.max(0, Math.min(1, to)))
    fadingRef.current = false
  }

  // ─── Position monitor ────────────────────────────────────────────
  // preview=true: fade+pause at stopMs but do NOT advance to the next song
  // fadeOutBudget: how much of the trim window the out-fade may spend — must
  // match the fade-in's own budget (see playTrack) so the two never overlap.
  const startMonitor = useCallback((stopMs, gen, preview = false, fadeOutBudget = FADE_MS) => {
    clearInterval(monitorRef.current)
    stopWatchDisabledRef.current = false
    // Capture this monitor's own interval id in the closure rather than reading
    // monitorRef.current at clear-time — a stale tick from a superseded generation
    // could otherwise clear a *newer* monitor's interval (it reassigns monitorRef
    // between this tick firing and the ref-based clear running).
    const intervalId = setInterval(async () => {
      if (genRef.current !== gen) { clearInterval(intervalId); return }
      // Capped (2026-08-07, Opus review) — matches the file's own stated
      // discipline (every awaited step needs a deadline) that this specific
      // call missed. Degrades safely: !state just skips one 300ms tick.
      const state = await withTimeout(playerRef.current?.getCurrentState(), 1500)
      if (!state) return
      if (seekingRef.current) return
      const pos = state.position
      if (!state.paused) setPosition(pos)

      const maxVol = maxVolumeRef.current
      // Trigger BEFORE stopMs now, not at it (flipped 2026-07-28) — the fade
      // spends its time INSIDE the trim window, landing at 0 exactly AT
      // stopMs, mirroring how the fade-IN already spends its time inside the
      // window from startMs. The previous approach (trigger at stopMs, fade
      // into the time AFTER it) deliberately kept the trimmed content at full
      // volume all the way through the out-point — but that meant playback
      // always continued up to FADE_MS past the point the host actually
      // chose to stop at, which on some songs ran straight into the next
      // lyric/sentence instead of a clean gap. Trade-off: a song whose
      // punchy final note lands right at stopMs now fades into that note
      // instead of hitting it at full volume — acceptable to avoid ever
      // overshooting the host's chosen stop point.
      // Guard !state.paused: don't trigger on Spotify's own buffering pauses near stopMs
      if (stopMs > 0 && pos >= stopMs - fadeOutBudget && !state.paused && !stopWatchDisabledRef.current) {
        clearInterval(intervalId)
        if (!preview) onFadeStartRef.current?.()
        // Clamp to whatever's actually left before the out-point — polling is
        // only every 300ms, so pos may already be partway into the fade
        // window by the time this tick fires; fade over what's actually left
        // rather than assuming the full budget is still available.
        const roomBefore = Math.max(0, stopMs - pos)
        const fadeMs = Math.min(fadeOutBudget, roomBefore)
        await fadeVolume(maxVol, 0, gen, fadeMs)
        if (genRef.current !== gen) return
        if (!preview) transitioningRef.current = true   // suppress isPaused during advance gap
        // Guarded (2026-08-04, Opus review of the A->B gap): this was the one
        // remaining un-timeout'd SDK await in the file -- the exact shape of
        // hang the header comment above describes, just not yet hit here.
        // Volume is already ramped to 0 by this point and the next playTrack
        // call replaces playback outright, so proceeding after a slow ack
        // risks nothing audible.
        await withTimeout(playerRef.current?.pause(), 200)
        // A stop can land during the await above — re-check before advancing,
        // and skip setVolume(0) too so a superseding play isn't muted.
        if (genRef.current !== gen) return
        playerRef.current?.setVolume(0)
        if (!preview) onAdvanceRef.current?.()
      }
    }, 300)
    monitorRef.current = intervalId
  }, [])

  // ─── Force a fresh Spotify.Player, discarding the shared singleton ──
  // 2026-09-03: the singleton (sharedSpotifyPlayer/sharedDeviceId) is trusted
  // forever once populated — nothing ever re-validates it. If the cached
  // device_id goes stale (Spotify drops the Connect device during a long
  // idle gap between grading breaks, or any other reason), every future
  // playTrack call fails against a dead device_id with no path back except a
  // full page reload. Jukebox.jsx's retry-once wrapper calls this before its
  // retry so the SECOND attempt has an actual chance — retrying the exact
  // same stale connection twice, which is all the old code did, can never
  // recover from this class of failure.
  // 2026-09-04, second-opinion review of the above: two real gaps fixed here.
  // (1) reconnectPromise dedupes concurrent callers (two failed breaks
  // retrying near-simultaneously, or init() racing this — see
  // reconnectPromise's own comment) so only one rebuild ever runs at a time.
  // If the mount that STARTED a reconnect dies before it resolves, that's
  // fine and needs no special-casing: bindListenersRef.current still holds
  // that mount's closure (never cleared on unmount), and its setters are
  // harmless no-ops on a dead component in React 18 — the module-scope
  // sharedSpotifyPlayer/sharedDeviceId still get populated correctly for
  // whichever mount checks next. (Binding listeners can NOT be skipped for a
  // "dead" caller, tempting as that looks — 'ready' only reliably fires ONCE
  // per Spotify.Player instance for its whole lifetime, so a player built
  // and connect()-ed with no listener attached would never have its
  // device_id captured by anyone, including a later mount that tries to
  // reuse it.)
  // (2) Fable review, 2026-09-04: `disconnect()` returns void, not a Promise
  // (confirmed against the SDK) — there's nothing to await here, the SDK
  // gives no completion signal, so this is a fire-and-forget best-effort
  // call, not a capped wait. Left as a plain call rather than dressed up in
  // `withTimeout` around nothing.
  const reconnect = useCallback(async () => {
    // Same review: a dead mount can still reach this call (e.g. the 401 ->
    // refreshToken -> retry branch inside playTrack, which has no deadRef
    // check of its own) well after it unmounted. If that lands after a LATER
    // mount has already reused the singleton this dead mount is trying to
    // tear down, it would clobber a connection that's currently working.
    // Bail before even joining/starting a rebuild.
    if (deadRef.current) return false
    if (reconnectPromise) return reconnectPromise
    reconnectPromise = (async () => {
      reportJukebox('reconnect: discarding player, building fresh', { mountCount })
      try { sharedSpotifyPlayer?.disconnect() } catch { /* best-effort */ }
      sharedSpotifyPlayer = null
      sharedDeviceId = null
      deviceIdRef.current = null
      // Also null playerRef (Fable review): an unrelated playTrack call
      // racing this exact window (e.g. a manual Skip while a different
      // failure's reconnect is mid-flight) would otherwise read the
      // just-disconnected player straight out of playerRef and run the full
      // play pipeline against a dead connection. Every playTrack consumer
      // already handles a null playerRef via its own waitForRef(playerRef)
      // branch, so this just routes that race into the existing wait path
      // instead of a silent failure against a corpse.
      playerRef.current = null
      setIsReady(false)

      const token = await getToken()
      if (!token) return false

      const player = new window.Spotify.Player({
        name: 'Trivia Jukebox',
        getOAuthToken: cb => getToken().then(cb),
        volume: 0,
      })
      sharedSpotifyPlayer = player
      playerRef.current = player
      bindListenersRef.current?.(player)
      await player.connect()

      const deviceId = await waitForRef(deviceIdRef, 6000)
      if (!deviceId) reportJukebox('reconnect: fresh player never became ready', { mountCount })
      return !!deviceId
    })()
    try {
      return await reconnectPromise
    } finally {
      reconnectPromise = null
    }
  }, [])

  // ─── Play a track with custom start/stop ─────────────────────────
  const playTrack = useCallback(async (uri, startMs = 0, stopMs = 0, preview = false) => {
    if (deadRef.current) return false
    let player = playerRef.current
    if (!player) {
      // player.connect() (the init effect) hasn't resolved yet — this is the
      // gap the deviceId wait below doesn't cover, it only starts once
      // playerRef.current already exists. Real failure mode (2026-08-18 show,
      // grading-break auto-shuffle fired the instant the overlay mounted,
      // milliseconds after the SDK player was constructed): both call sites
      // that retry on `started === false` retried within the same tick,
      // long before connect() could possibly finish, so every attempt hit
      // this bail.
      player = await waitForRef(playerRef)
      // deadRef re-checked here (2026-08-26): this wait can run up to 5s —
      // long enough for a host-side unmount to land while it's pending. See
      // deadRef's own comment above.
      if (!player || deadRef.current) return false
    }

    let deviceId = deviceIdRef.current
    if (!deviceId) {
      // SDK ready event hasn't fired yet — wait for up to 5s
      deviceId = await waitForRef(deviceIdRef)
      if (deadRef.current) return false
      if (!deviceId) {
        setError('Spotify player still connecting — try again in a moment.')
        reportJukebox('device_id never arrived (5s timeout)', { mountCount, hadSharedDeviceId: !!sharedDeviceId })
        transitioningRef.current = false
        return false
      }
    }

    genRef.current += 1
    const gen = genRef.current
    clearInterval(monitorRef.current)

    // Await the volume-zero so Spotify can't start audibly before the seek
    await player.setVolume(0)
    setIsPaused(false)

    const token = await getToken()
    if (!token) {
      console.error('[playTrack] token refresh failed — aborting play')
      transitioningRef.current = false
      return false
    }
    // A newer playTrack call already superseded this one while we awaited the
    // token — don't send a now-pointless play command for a stale uri.
    if (genRef.current !== gen) return undefined
    // position_ms in the /play body itself (2026-08-04, Opus review of the
    // A->B gap): asks Spotify to start already at the trim's in-point instead
    // of starting at 0 and seeking after — when it lands close enough (checked
    // below, after confirm), this skips the 400ms buffer sleep + a whole seek
    // round trip + the landed-poll entirely. Nothing below this is deleted:
    // if it DOESN'T land close enough, the existing sleep->seek->poll path
    // still runs untouched as a fallback, so this can only ever save time,
    // never remove the safety net.
    const doPlay = (tok) => fetchWithTimeout(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(startMs > 0 ? { uris: [uri], position_ms: startMs } : { uris: [uri] }),
      }
    )
    let playRes
    try {
      playRes = await doPlay(token)
      if (playRes.status === 401) {
        // getToken() thought this token was fresh — Spotify disagrees. Force a
        // refresh once and retry before giving up.
        const freshToken = await refreshToken()
        // A newer playTrack call superseded this one while we awaited the
        // refresh — don't retry a now-pointless play command for a stale uri.
        if (genRef.current !== gen) return undefined
        if (!freshToken) {
          console.error('[playTrack] 401 on play and token refresh failed')
          transitioningRef.current = false
          return false
        }
        playRes = await doPlay(freshToken)
      }
    } catch (err) {
      // Timeout (AbortError) or a genuine network failure — either way the
      // play request never landed. Fail cleanly instead of hanging forever.
      console.error('[playTrack] play request timed out or failed', err)
      reportJukebox('play request timed out or failed', { mountCount, errMessage: err?.message })
      transitioningRef.current = false
      return false
    }
    if (!playRes.ok) {
      console.error('[playTrack] play request failed', playRes.status)
      // The status is the whole point of this breadcrumb — a 404 means
      // Spotify no longer recognizes deviceId (the device it handed out on
      // `ready` has since gone stale), a 403 means no active/Premium device,
      // anything else is a different failure class entirely.
      reportJukebox('play request failed', { mountCount, status: playRes.status })
      transitioningRef.current = false
      return false
    }

    const confirmed = await new Promise(resolve => {
      const timeout = setTimeout(() => {
        player.removeListener('player_state_changed', check)
        resolve(false)
      }, 4000)
      const check = (state) => {
        if (state?.track_window?.current_track?.uri === uri) {
          clearTimeout(timeout)
          player.removeListener('player_state_changed', check)
          resolve(true)
        }
      }
      player.addListener('player_state_changed', check)
    })

    // A newer playTrack call superseded this one — bail without reporting
    // failure. Callers must treat `undefined` (superseded) differently from
    // `false` (genuine failure): only a real failure should reset the UI.
    // Gen check moved above the transitioningRef write (2026-08-07, Opus
    // review) — writing it first let a superseded call transiently
    // un-suppress isPaused tracking while a newer call was still mid-confirm.
    if (genRef.current !== gen) return undefined
    transitioningRef.current = false  // new track confirmed; restore isPaused tracking

    if (!confirmed) {
      // The state-changed listener never fired a matching uri within 4s — the
      // /play PUT may have landed after a different call's PUT reordered on the
      // network, so Spotify could be playing the wrong track. Double-check
      // directly before blindly seeking/fading against a track that isn't loaded.
      const state = await withTimeout(player.getCurrentState(), 1500)
      if (state?.track_window?.current_track?.uri !== uri) {
        console.error('[playTrack] Spotify never confirmed this track loaded — aborting')
        reportJukebox('Spotify never confirmed track loaded', { mountCount })
        return false
      }
    }

    // Fade-in: seek to startMs itself (the trim's own in-point) and ramp
    // volume 0 → max over the stretch of trimmed content that follows — the
    // clip audibly fades up from its own start. Both the fade-in and the
    // fade-out (see startMonitor) now spend their ramp INSIDE the trim
    // window (2026-07-28), so a short trim can't fit two full FADE_MS ramps
    // without them colliding — fade-in eating the whole window left nothing
    // for the fade-out, which then triggered instantly and cut the song off
    // right after it faded in. computeFadeBudget splits the window evenly
    // between the two fades so they never overlap; both sides must use the
    // SAME budget (passed to startMonitor below) or they'll drift back out
    // of sync.
    const fadeBudget = computeFadeBudget(startMs, stopMs, FADE_MS)
    const fadeInMs = fadeBudget

    // Did the position_ms sent with /play above already land close enough to
    // skip the seek fallback entirely? Checked via getCurrentState, not the
    // player_state_changed payload used for `confirmed` above — position
    // isn't reliably present on that event.
    let seekNeeded = startMs > 0
    if (startMs > 0) {
      const s = await withTimeout(player.getCurrentState(), 1500)
      if (genRef.current !== gen) return undefined
      if (s && s.position >= startMs - 300 && s.position <= startMs + 3000) {
        seekNeeded = false
      }
    }

    if (startMs > 0 && seekNeeded) {
      // Give Spotify 400ms to buffer the start of the track before seeking
      await sleep(400)
      if (genRef.current !== gen) return undefined

      const doSeek = async () => {
        // REST API seek only — more reliable than SDK seek; using both caused a double-seek glitch
        try {
          const t = await getToken()
          await fetchWithTimeout(
            `https://api.spotify.com/v1/me/player/seek?position_ms=${startMs}&device_id=${deviceId}`,
            { method: 'PUT', headers: { Authorization: `Bearer ${t}` } }
          )
        } catch (err) {
          // Timeout (AbortError) or network failure — don't hang the whole
          // playTrack pipeline on a seek that never lands. The landed-poll
          // right after this already has its own 3s deadline and a one-time
          // retry; swallowing here just lets that existing fallback run
          // instead of blocking forever on an unsettled fetch.
          console.error('[playTrack] seek request timed out or failed', err)
        }
      }

      await doSeek()

      // Poll until position lands at or just past the in-point. Checks
      // immediately (2026-08-04) instead of waiting a full 100ms tick before
      // the first check, then falls back to the same 100ms interval.
      // Allow up to 300ms before startMs to handle slight Spotify overshoot.
      // Reject if position is still far before startMs — that means seek hasn't landed yet.
      const landed = await new Promise(resolve => {
        let poll, deadline
        const settle = (result) => { clearInterval(poll); clearTimeout(deadline); resolve(result) }
        const check = async () => {
          const s = await withTimeout(player.getCurrentState(), 1500)
          return !!s && s.position >= startMs - 300 && s.position <= startMs + 5000
        }
        deadline = setTimeout(() => settle(false), 3000)
        poll = setInterval(async () => { if (await check()) settle(true) }, 100)
        check().then(ok => { if (ok) settle(true) })
      })

      // If first seek timed out, try once more
      if (!landed && genRef.current === gen) {
        await doSeek()
        await sleep(800)
      }
    } else if (startMs === 0) {
      await sleep(200)
    }
    // else: position_ms already landed close enough — go straight to fade-in.

    if (genRef.current !== gen) return undefined

    const maxVol = maxVolumeRef.current
    await fadeVolume(0, maxVol, gen, fadeInMs)

    if (genRef.current !== gen) return undefined
    // Last gate before this call would start driving live playback (a real
    // position monitor that keeps the shuffle chain going via onAdvance) —
    // see deadRef's comment above.
    if (deadRef.current) return undefined

    startMonitor(stopMs > startMs ? stopMs : 0, gen, preview, fadeBudget)
    return true
  }, [startMonitor])

  // ─── Fade out and pause — live screen playback only ───────────────
  const fadeAndPause = useCallback(async () => {
    genRef.current += 1
    const gen = genRef.current
    transitioningRef.current = false  // manual stop always restores isPaused tracking
    clearInterval(monitorRef.current)
    const maxVol = maxVolumeRef.current
    await fadeVolume(maxVol, 0, gen, STOP_FADE_MS)
    if (genRef.current !== gen) return
    await withTimeout(playerRef.current?.pause(), 2000)
    // A newer call (e.g. playTrack) may have started while we awaited the
    // pause — don't zero the volume out from under it.
    if (genRef.current !== gen) return
    playerRef.current?.setVolume(0)
  }, [])

  // ─── Pause immediately, no fade — preview/scrubber (SongDetailModal) ──
  const pause = useCallback(async () => {
    genRef.current += 1
    transitioningRef.current = false
    clearInterval(monitorRef.current)
    await withTimeout(playerRef.current?.pause(), 2000)
  }, [])

  // ─── Manual scrub ────────────────────────────────────────────────
  // disableStopWatch: SongDetailModal passes this so dragging past the
  // song's saved trim-out point doesn't immediately trigger the position
  // monitor's fade+pause (it's still watching for the OLD stopMs from
  // whichever playTrack call is live) — lets the preview scrubber roam the
  // whole track. Player.jsx's live-playback scrubber omits it, so trims
  // still stop live playback at the host's chosen out-point.
  const seek = useCallback((ms, { disableStopWatch = false } = {}) => {
    seekingRef.current = true
    clearTimeout(seekTimerRef.current)
    if (disableStopWatch) stopWatchDisabledRef.current = true
    setPosition(ms)
    const deviceId = deviceIdRef.current
    // REST API seek only — more reliable than the SDK's player.seek(), same as playTrack's doSeek
    if (deviceId) {
      getToken().then(token => {
        if (!token) return
        fetch(
          `https://api.spotify.com/v1/me/player/seek?position_ms=${ms}&device_id=${deviceId}`,
          { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }
        )
      })
    }
    seekTimerRef.current = setTimeout(() => { seekingRef.current = false }, 700)
  }, [])

  // ─── Volume control ──────────────────────────────────────────────
  const setVolume = useCallback((v) => {
    maxVolumeRef.current = v
    setVolumeState(v)
    if (fadingRef.current) return
    playerRef.current?.setVolume(v)
  }, [])

  return {
    isReady, isPaused, currentTrack, position, duration, error,
    volume, setVolume,
    playTrack, fadeAndPause, pause, seek, reconnect,
  }
}
