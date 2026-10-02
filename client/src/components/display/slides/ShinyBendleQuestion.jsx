import { useState, useEffect, useRef } from 'react'
// ponytail: static import — Tone costs ~61kB gzip on the SlideRenderer chunk
// (72.6 → 134.0), paid once at /display page load whether or not tonight has a
// Bendle slide. Deliberately NOT a dynamic import: that would move the fetch to
// the moment the slide goes live in front of the room, adding a "chunk failed to
// load mid-show" failure mode to the one component where a stall is unrecoverable.
// Revisit only if /display's cold load actually becomes a problem on bar wifi.
import * as Tone from 'tone'
import * as Sentry from '@sentry/react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { director } from '../../../audio/director.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { clampBendleOffset, buildBendleTiers } from '../../../lib/bendleScoring.js'
import ShinySignal from '../ShinySignal.jsx'
import BendleRevealList from './BendleRevealList.jsx'

// 'guitar' is optional per-song (only songs reprocessed through
// worker/bendle/guitar_stem.py have a guitar_url) — the loader skips any stem
// whose url is missing. When a song HAS one it must stay in the reveal: that
// 5-stem split pulls guitar OUT of 'other'.
const STEM_KEYS = ['drums', 'bass', 'other', 'guitar', 'vocals']
const FADE_SECONDS = 1.5
// Ben: "the longest I'll ever play a Bendle song is 30 seconds." Only this
// window (plus a 1 s decoder pre-roll) is fetched and decoded — ~1.2 MB and
// ~11 MB of PCM per stem instead of the full 11.7 MB file / 113 MB of PCM.
const CLIP_SECONDS = 30
const CLIP_MAX_SECONDS = 30 // Ben, 2026-09-30: no Bendle clip ever plays past 30 s
const PREROLL_SECONDS = 1
const SONG_FETCH_TIMEOUT_MS = 8000
const CLIP_FETCH_TIMEOUT_MS = 15000
const ATTEMPTS = 2

// Sentry gets each distinct problem once per page load (onceKey), however
// many remounts / A-toggles hit it; the console still logs every time.
const reported = new Set()
function report(message, extra, level = 'error', onceKey = JSON.stringify(extra)) {
  console.error(`[Bendle] ${message}`, extra)
  const key = `${message}|${onceKey}`
  if (reported.has(key)) return
  reported.add(key)
  try { Sentry.captureMessage(`bendle: ${message}`, { level, tags: { area: 'audio' }, extra }) } catch { /* never let telemetry break the beat */ }
}

// Abortable: a timed-out fetch is really cancelled (Tone.Player.load() can't
// be), so a retry doesn't compete with its own dead predecessor for bandwidth.
async function fetchBytes(url, headers, timeoutMs) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers, signal: ac.signal })
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e }
    return { status: res.status, bytes: await res.arrayBuffer() }
  } finally {
    clearTimeout(timer)
  }
}

async function retry(fn, label) {
  let last
  for (let i = 0; i < ATTEMPTS; i++) {
    try { return await fn() } catch (e) { last = e; console.warn(`[Bendle] ${label} attempt ${i + 1} failed:`, e) }
  }
  throw last
}

// Byte range for [fromSec, toSec] of a CBR MP3 (the worker encodes every stem
// with libmp3lame -b:a 320k; its first frame carries an "Info" = CBR tag).
// Returns null for anything else (VBR "Xing", unknown header) — the caller
// then falls back to the whole file. The decoder resyncs on the next frame
// header, so the cut needn't be frame-aligned (checked in real Chromium:
// sample-exact match to the full decode, <=24 ms shift, identical across stems).
async function clipByteRange(url, fromSec, toSec) {
  const { status, bytes } = await fetchBytes(url, { Range: 'bytes=0-4095' }, CLIP_FETCH_TIMEOUT_MS)
  // Server ignored Range (200): the probe already IS the whole file — use it
  // rather than downloading all 11.7 MB a second time.
  if (status !== 206) return { full: bytes }
  const b = new Uint8Array(bytes)
  const id3 = b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33
    ? 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f))
    : 0
  if (id3 + 40 > b.length || b[id3] !== 0xff || (b[id3 + 1] & 0xfe) !== 0xfa) return null // MPEG-1 Layer III only
  const kbps = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0][b[id3 + 2] >> 4]
  const rate = [44100, 48000, 32000, 0][(b[id3 + 2] >> 2) & 3]
  const tag = String.fromCharCode(b[id3 + 36], b[id3 + 37], b[id3 + 38], b[id3 + 39])
  if (!kbps || !rate || tag !== 'Info') return null
  const frameBytes = Math.floor(144 * kbps * 1000 / rate)
  const bytesPerSec = kbps * 1000 / 8
  const audioStart = id3 + frameBytes // skip the Info frame itself
  const start = audioStart + Math.floor(Math.max(0, fromSec) * bytesPerSec)
  const end = audioStart + Math.ceil(toSec * bytesPerSec)
  return { start, end, clipStartSec: (start - audioStart) / bytesPerSec }
}

// Module-level, so the three step slides and the reveal share one download +
// decode per stem (and a remount or a realtime re-render costs nothing).
// ponytail: cleared per song, never size-bounded — one song is ~5 x 11 MB of
// PCM. Add an LRU if a show ever runs Bendle songs back to back.
const SONG_ROW_TTL_MS = 20000 // host edits to start/end marks reach the TV within ~20 s
const songRows = new Map() // id -> { p: Promise<row>, at, last: row|null }
const clips = new Map() // `${url}|${from}|${to}` -> Promise<{ buffer, clipStartSec }>
let clipsSongId = null

function getSong(id) {
  const hit = songRows.get(id)
  if (hit && Date.now() - hit.at < SONG_ROW_TTL_MS) return hit.p
  const fetchRow = retry(async () => {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), SONG_FETCH_TIMEOUT_MS)
    try {
      const { data, error } = await supabase.from('bendle_songs').select('*').eq('id', id).abortSignal(ac.signal).single()
      if (error || !data) throw error ?? new Error('song row missing')
      return data
    } finally { clearTimeout(timer) }
  }, 'song fetch')
  // A refresh that fails keeps serving the last good row: an edit that cannot
  // be picked up beats a beat that cannot start.
  const p = hit?.last ? fetchRow.catch(() => hit.last) : fetchRow
  const entry = { p, at: Date.now(), last: hit?.last ?? null }
  fetchRow.then(row => { entry.last = row }, () => { if (!entry.last) songRows.delete(id) })
  songRows.set(id, entry)
  return p
}

// 416 = the start of the window is past the real end of the file (a start mark
// beyond a short song). The header total isn't readable cross-origin, so the
// server's refusal is the signal: take the whole file, like the ignore-Range path.
async function fetchRange(url, range) {
  try {
    return await fetchBytes(url, { Range: `bytes=${range.start}-${range.end}` }, CLIP_FETCH_TIMEOUT_MS)
  } catch (e) {
    if (e.status !== 416) throw e
    report('range unsatisfiable, using full file', { url }, 'warning', url)
    return fetchBytes(url, {}, CLIP_FETCH_TIMEOUT_MS * 3)
  }
}

// Tone must run on the director's ONE shared AudioContext: a second context would be
// suspended until it gets its own gesture and would sit outside the "Click for sound"
// unlock. Must happen before Tone creates any node, so every Tone entry point calls it.
let toneBoundTo = null
function bindToneToDirector() {
  const c = director.getContext()
  if (!c || c === toneBoundTo) return
  try { Tone.setContext(c); toneBoundTo = c } catch (e) { report('could not bind Tone to the shared context', { error: String(e) }, 'error', 'tone-bind') }
}

function getClip(song, url, fromSec, toSec) {
  if (clipsSongId !== song.id) { clips.clear(); clipsSongId = song.id }
  const key = `${url}|${fromSec}|${toSec}`
  if (!clips.has(key)) {
    const p = retry(async () => {
      const t0 = performance.now()
      // A probe that fails on the network retries (below) — it must not fall
      // through to a 45 s full-file download on the same bad connection.
      const range = await clipByteRange(url, fromSec, toSec)
      const { status, bytes } = range?.full
        ? { status: 200, bytes: range.full }
        : range
        ? await fetchRange(url, range)
        : await fetchBytes(url, {}, CLIP_FETCH_TIMEOUT_MS * 3)
      const buffer = await Tone.getContext().decodeAudioData(bytes)
      // A server that ignores Range sends the whole file (200): time 0 is the song start.
      const clipStartSec = range && status === 206 ? range.clipStartSec : 0
      if (!range || status !== 206) report('stem fell back to full file', { url, status }, 'warning', url)
      return { buffer, clipStartSec, ms: Math.round(performance.now() - t0) }
    }, `clip ${url.split('/').pop()}`)
    p.catch(() => clips.delete(key))
    clips.set(key, p)
  }
  return clips.get(key)
}

// The TV side of ONE Bendle step-slide. A round is 3 REAL sibling slides
// (2026-09-08 rebuild). Each slide plays its own cumulative stem mix — step 0
// is the first instrument alone, step 1 adds the second, step 2 the third.
//
// Teams lock one guess on their phones (BendleBoard). The reveal is the
// host's A on step 3 (LiveMode writes bendleRevealed + bendleResults on the
// step-3 slide); the older show-level answer_reveal still counts. Revealed
// swaps the audio to the full mix, vocals included, and lists every team.
export default function ShinyBendleQuestion({ slide, show, theme, isPreview }) {
  const { data } = slide
  const tiers = buildBendleTiers(data.bendleTierOrder)
  // A string, not the array: every realtime payload that carries `slides`
  // (refetch after a socket rejoin, a host edit) hands this component an equal
  // but NEW bendleTierOrder array, which used to restart the beat mid-song.
  const tierKey = JSON.stringify(data.bendleTierOrder ?? null)
  const stepIndex = Math.min(Math.max(data.bendleStepIndex ?? 0, 0), tiers.length - 1)
  const answerReveal = !!(show?.answer_reveal ?? show?.showState?.answerReveal)
  const revealed = answerReveal || !!data.bendleRevealed
  const listShown = !!data.bendleRevealed && Array.isArray(data.bendleResults)
  const shouldReduceMotion = useReducedMotion()

  const [song, setSong] = useState(null)
  const [loadState, setLoadState] = useState('loading') // 'loading' | 'ready' | 'error'
  const readyRef = useRef(false)
  const startedRef = useRef(false)
  // Latest trigger inputs, read by maybeStart — so "beat ready" and "host
  // pressed Next" can land in either order and still start exactly once.
  const trigger = useRef({})
  trigger.current = { revealed, playing: show?.audio_playing, slideId: slide.id }

  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`

  function maybeStart() {
    if (!readyRef.current || startedRef.current) return
    const { revealed: rev, playing, slideId } = trigger.current
    if (!rev && !(playing?.playing && playing.slideId === slideId)) return
    startedRef.current = true
    // Fire-and-forget: a context still suspended for want of a gesture leaves
    // this pending forever — awaiting it would hang the beat.
    Tone.start().catch(() => {})
    Tone.getTransport().start()
    // Still suspended (nobody clicked the TV tab) = a silent beat with no error.
    // Can't be fixed from here, but it must show up in Sentry.
    setTimeout(() => {
      const state = Tone.getContext().state
      if (state && state !== 'running') report('audio context not running at start', { state }, 'error', state)
    }, 1500)
  }

  useEffect(() => {
    let cancelled = false
    if (!data.bendleSongId) { setLoadState('error'); return }
    if (isPreview) return // the host's build-mode preview loads no audio, so it needs no song row
    getSong(data.bendleSongId)
      .then(row => { if (!cancelled) setSong(row) })
      .catch(e => {
        if (cancelled) return
        report('song fetch failed', { songId: data.bendleSongId, error: String(e) }, 'error', data.bendleSongId)
        setLoadState('error')
      })
    return () => { cancelled = true }
  }, [data.bendleSongId, isPreview])

  // Loads and plays exactly what this beat should sound like. One effect owns
  // load + play + teardown: the Transport is a global singleton.
  useEffect(() => {
    if (!song || isPreview) return
    bindToneToDirector()
    const transport = Tone.getTransport()
    let killed = false
    const players = []
    const beat = revealed ? 'reveal' : `step${stepIndex}`
    readyRef.current = false
    startedRef.current = false

    const fromSec = clampBendleOffset(song.start_offset_seconds, Infinity) - PREROLL_SECONDS
    const windowSec = Math.min(CLIP_MAX_SECONDS, Math.max(CLIP_SECONDS, (song.end_offset_seconds ?? 0) - (song.start_offset_seconds ?? 0)))
    const toSec = (song.start_offset_seconds ?? 0) + windowSec + 1
    const stemKeys = revealed ? STEM_KEYS : tiers.slice(0, stepIndex + 1).flatMap(t => t.stems)
    const clipFor = k => getClip(song, song[`${k}_url`], fromSec, toSec)
    const wanted = stemKeys.filter(k => song[`${k}_url`])
    const pending = wanted.map(clipFor)
    // Once this beat's stems are in, fetch the rest of the song (~1.2 MB
    // each) so the next step and the reveal find theirs already decoded —
    // after, not alongside, so they never slow down the beat on screen.
    // One at a time, in the order the show needs them (next tier first).
    const order = [...new Set([...tiers.flatMap(t => t.stems), ...STEM_KEYS])].filter(k => song[`${k}_url`])
    Promise.allSettled(pending).then(async () => {
      for (const k of order) { if (killed) return; await clipFor(k).catch(() => {}) }
    })

    async function setup() {
      transport.stop()
      transport.cancel(0)
      transport.seconds = 0
      const t0 = performance.now()
      const loaded = await Promise.allSettled(pending)
      if (killed) return
      const ok = []
      loaded.forEach((r, i) => {
        if (r.status === 'fulfilled') ok.push({ key: wanted[i], ...r.value })
        else report('stem load failed', { songId: song.id, stem: wanted[i], error: String(r.reason) }, 'error', `${song.id}|${wanted[i]}|${beat}`)
      })
      if (ok.length === 0) { setLoadState('error'); return }

      const durations = ok.map(s => s.clipStartSec + s.buffer.duration)
      const endAbs = Math.min(...durations) // song time where the shortest clip runs out
      // Tone.Player plays NOTHING (no error) if started at or past a buffer's end.
      // ...but never earlier than the first sample of the latest-starting clip: near the
      // end of a file the clip is short, and a start before it would skew the stop timing.
      const startAbs = Math.max(clampBendleOffset(song.start_offset_seconds ?? 0, endAbs), ...ok.map(s => s.clipStartSec))
      for (const s of ok) {
        const player = new Tone.Player(s.buffer).toDestination()
        player.sync().start(0, Math.max(0, startAbs - s.clipStartSec))
        players.push(player)
      }
      // Steps AND reveal stop inside the clip; the reveal keeps the host's end mark.
      const endMark = song.end_offset_seconds > startAbs ? song.end_offset_seconds : null // a mark at/before the start is ignored, not "never stop"
      const stopAbs = Math.min(endAbs, revealed && endMark != null ? Math.min(endMark, startAbs + CLIP_MAX_SECONDS) : startAbs + windowSec)
      const stopAt = stopAbs - startAbs
      if (stopAt > 0) {
        transport.scheduleOnce(time => players.forEach(p => p.volume.rampTo(-Infinity, FADE_SECONDS, time)), Math.max(0, stopAt - FADE_SECONDS))
        transport.scheduleOnce(time => transport.stop(time), stopAt)
      }
      const ms = Math.round(performance.now() - t0)
      if (ms > 3000) report('beat slow to load', { songId: song.id, stems: wanted, ms }, 'warning', `${song.id}|${beat}`)
      readyRef.current = true
      setLoadState('ready')
      maybeStart()
    }
    setup().catch(e => {
      if (killed) return
      report('beat setup failed', { songId: song.id, error: String(e) }, 'error', `${song.id}|${beat}`)
      setLoadState('error')
    })

    return () => {
      killed = true
      readyRef.current = false
      startedRef.current = false
      transport.stop()
      transport.cancel(0)
      players.forEach(p => p.dispose())
    }
  }, [song, isPreview, revealed, stepIndex, tierKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Host's Next (show.audio_playing) — may arrive before or after the beat is ready.
  useEffect(() => { maybeStart() }, [show?.audio_playing?.slideId, show?.audio_playing?.playing, revealed]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: listShown ? '3vmin 4vmin' : '4rem', gap: listShown ? '2vmin' : '2.5rem',
    }}>
      <ShinySignal />
      <motion.h2
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(14px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)' }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        style={{
          margin: 0, fontFamily: displayFont, fontSize: '4.5rem', lineHeight: 1,
          color: SHINY_GOLD, textShadow: `0 0 26px ${SHINY_GOLD_GLOW}66`, textAlign: 'center',
        }}
      >
        Bendle
      </motion.h2>

      {data.text && !listShown && (
        <p style={{ margin: 0, color: `${text}80`, fontSize: '1.4rem', fontFamily: bodyFont, textAlign: 'center', maxWidth: 1200 }}>
          {data.text}
        </p>
      )}

      {revealed && song?.title && (
        <motion.p
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          style={{
            margin: 0, fontFamily: displayFont, fontSize: '2.6rem', lineHeight: 1.15,
            color: SHINY_GOLD, textAlign: 'center', maxWidth: 1200,
          }}
        >
          {song.title}{song.artist ? ` — ${song.artist}` : ''}
        </motion.p>
      )}

      {listShown && <BendleRevealList results={data.bendleResults} theme={theme} />}

      {loadState === 'loading' && !isPreview && (
        <p style={{ margin: 0, color: `${text}60`, fontSize: '1.3rem', fontFamily: bodyFont }}>Loading song…</p>
      )}
      {loadState === 'error' && (
        <p style={{ margin: 0, color: '#e8703a', fontSize: '1.3rem', fontFamily: bodyFont }}>
          Couldn&rsquo;t load this song&rsquo;s audio.
        </p>
      )}

      {!listShown && <StepIndicator tiers={tiers} stepIndex={stepIndex} text={text} bodyFont={bodyFont} />}
    </div>
  )
}

function StepIndicator({ tiers, stepIndex, text, bodyFont }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
    >
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        {tiers.map((tier, i) => (
          <div
            key={tier.id}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i <= stepIndex ? SHINY_GOLD : 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
      </div>
      <p style={{ margin: 0, color: `${text}70`, fontSize: '1.1rem', fontFamily: bodyFont }}>
        {tiers[stepIndex]?.label} · {tiers[stepIndex]?.points} pts
      </p>
    </motion.div>
  )
}
