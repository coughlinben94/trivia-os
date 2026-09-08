import { useState, useEffect, useRef } from 'react'
// ponytail: static import — Tone costs ~61kB gzip on the SlideRenderer chunk
// (72.6 → 134.0), paid once at /display page load whether or not tonight has a
// Bendle slide. Deliberately NOT a dynamic import: that would move the fetch to
// the moment the slide goes live in front of the room, adding a "chunk failed to
// load mid-show" failure mode to the one component where a stall is unrecoverable.
// Revisit only if /display's cold load actually becomes a problem on bar wifi.
import * as Tone from 'tone'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { clampBendleOffset, buildBendleTiers } from '../../../lib/bendleScoring.js'
import { AnswersLockedBadge } from '../LockCountdownOverlay.jsx'

const STEM_KEYS = ['drums', 'bass', 'other', 'vocals']
const FADE_SECONDS = 1.5
// A layer waits at -Infinity dB (gain 0 — provably silent, no information
// leaks under the drums) and is stepped to this floor at the instant its
// tier fires, so the ramp that follows is an audible 1.5s fade instead of
// a pop. Ramping straight from -Infinity would not work: Param.rampTo on a
// decibels unit is an EXPONENTIAL gain ramp, so it spends ~1.4 of its 1.5
// seconds below hearing and only the last fraction is audible.
const FADE_FLOOR_DB = -50

// The TV side of a Bendle question. Three beats, one component:
//   1. Playing — a 3-step host-advanced series (data.parts/currentPart, same
//      generic stepping every other sequential shiny series uses — see
//      computeNextStep in slideStepping.js). Step 0's stem is already going;
//      each Next press fades in the next step's stem IN PLACE on the same
//      already-running, already-synced players — never a restart. (2026-09-08
//      rebuild, Ben: "i dont buy the mechanism. i want three subslides, one
//      per step" — replaces the old internal Tone.Transport.scheduleOnce
//      auto-fade timer with fades triggered directly by data.currentPart.)
//   2. Locked  — held after "lock guesses" until the host presses A, audio
//      stopped (same held, legible-from-the-bar badge Wager/Order use).
//   3. Reveal  — the song, then who got it and at which step.
//
// No separate "arm" beat: /display's audible autoplay already rides the
// tab's sticky user activation from the show's setup ritual (tap the TV
// once), the same thing the walkout song and ShinyAudioQuestion rely on, so
// playback starts the moment the slide mounts with no extra ceremony.
export default function ShinyBendleQuestion({ slide, show, theme, isPreview }) {
  const { data } = slide
  const guessesLocked = !!data.bendleGuessesLocked
  const revealed = !!data.bendleRevealed
  const shouldReduceMotion = useReducedMotion()

  const [song, setSong] = useState(null)
  const [loadState, setLoadState] = useState('loading') // 'loading' | 'ready' | 'error'
  const [answered, setAnswered] = useState(0)
  const [teamCount, setTeamCount] = useState(0)

  const tiers = buildBendleTiers(data.bendleTierOrder)
  const currentPart = Math.min(Math.max(data.currentPart ?? 0, 0), tiers.length - 1)
  // Populated once by the load effect below; read (never reloaded) by the
  // separate currentPart-watching effect so a Next press fades an
  // already-loaded, already-synced player instead of tearing everything
  // down and reloading — a rebuild-per-step would mean a real reload/seek
  // gap live on the TV every time the host presses Next.
  const playersRef = useRef({})
  const tiersRef = useRef([])
  const prevPartRef = useRef(0)

  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`

  useEffect(() => {
    let cancelled = false
    // Should be unreachable post-fix (AddSlideWizard now requires a song
    // before create), but defense-in-depth: without this, loadState never
    // leaves 'loading' and the TV shows "Loading song…" forever with no way
    // out — 2026-09-05 whole-branch review, Fix 1.
    if (!data.bendleSongId) { setLoadState('error'); return }
    supabase.from('bendle_songs').select('*').eq('id', data.bendleSongId).single()
      .then(({ data: row }) => { if (!cancelled) setSong(row) })
    return () => { cancelled = true }
  }, [data.bendleSongId])

  // Load the stems, start them all synced from the same point, run the
  // Transport — and own the teardown of everything it built. One effect on
  // purpose: the players and the Transport are one lifecycle, and splitting
  // them let a re-run overwrite playersRef with a second set of Players
  // while the first set stayed synced to the Transport and audible — the
  // same song playing twice, half a beat apart, on a live TV. Cleanup runs
  // on unmount AND the moment guesses lock, so a locked or left slide can
  // never keep playing under the next one.
  //
  // Deliberately NOT keyed on data.currentPart — a Next press must fade the
  // already-loaded players in place (the effect below), not reload/restart
  // them. This effect only runs on song/order change (a genuinely new
  // playback setup), reading whatever currentPart is live at that moment as
  // the STARTING state (covers a slide that (re)mounts mid-round already
  // past step 0 — e.g. after a lock/unlock or a Go Live jump).
  useEffect(() => {
    if (!song || guessesLocked || revealed || isPreview) return
    const transport = Tone.getTransport()
    let killed = false
    const created = []

    async function setup() {
      transport.stop()
      transport.cancel(0)
      transport.seconds = 0

      const loadTiers = buildBendleTiers(data.bendleTierOrder)
      const roundStemKeys = loadTiers.flatMap(tier => tier.stems)

      const players = {}
      for (const key of roundStemKeys) {
        const url = song[`${key}_url`]
        if (!url) continue
        let player = null
        try {
          player = new Tone.Player().toDestination()
          player.volume.value = -Infinity
          await player.load(url)
        } catch (e) {
          // Per-stem failure skips that layer rather than blocking the whole
          // round on a live TV: it is left out of `players`, so it just
          // never becomes audible and the rest of the song plays.
          console.error(`[Bendle] stem load failed for "${key}":`, e)
          player?.dispose()
          continue
        }
        if (killed) { player.dispose(); return }
        created.push(player)
        players[key] = player
      }
      if (killed) return

      if (Object.keys(players).length === 0) { setLoadState('error'); return }

      // One shared offset for every stem, computed from the SHORTEST loaded
      // buffer. Clamping each stem independently off its own buffer.duration
      // risks two stems landing on different offsets (if their encoded
      // lengths ever differ even slightly) and drifting out of sync with
      // each other on a live TV — computing once from the minimum and
      // applying it to all of them keeps every stem starting at the exact
      // same point.
      const roundOffsetSeconds = clampBendleOffset(
        song.start_offset_seconds,
        Math.min(...Object.values(players).map(p => p.buffer.duration)),
      )
      for (const player of Object.values(players)) player.sync().start(0, roundOffsetSeconds)

      // Every step up through whatever part is already live goes straight to
      // full volume (a snap, not a fade — this is the slide's starting
      // state, not a step the host just took); later steps stay silent until
      // a Next press reveals them (the effect below).
      const startPart = Math.min(Math.max(data.currentPart ?? 0, 0), loadTiers.length - 1)
      loadTiers.forEach((tier, i) => {
        for (const key of tier.stems) {
          if (players[key]) players[key].volume.value = i <= startPart ? 0 : -Infinity
        }
      })
      playersRef.current = players
      tiersRef.current = loadTiers
      prevPartRef.current = startPart

      // Fire-and-forget, exactly like RulesSlide's ctx.resume().catch(() => {}):
      // a no-op when the context is already running (the normal case after the
      // setup ritual), and never awaited, because a context still suspended for
      // want of a gesture leaves that promise pending forever — awaiting it
      // would hang the slide on "Loading song…" in front of the room.
      Tone.start().catch(() => {})
      setLoadState('ready')
      transport.start()
    }
    setup()

    return () => {
      killed = true
      transport.stop()
      transport.cancel(0)
      created.forEach(p => p.dispose())
      created.length = 0
      playersRef.current = {}
      tiersRef.current = []
    }
  }, [song, guessesLocked, revealed, isPreview, data.bendleTierOrder])

  // The actual step-advance: fades the newly-revealed step's stem in on the
  // SAME players the load effect above already started — no reload, no
  // restart, just a volume change on an already-running, already-synced
  // Tone.Player, exactly like the old scheduled fade did, just triggered by
  // a host Next press (data.currentPart) instead of the Transport clock.
  // Recomputes every step's target volume from scratch each time (not just
  // the delta) so it's correct after a Prev press or a jump, not only a
  // simple forward step.
  useEffect(() => {
    if (!song || guessesLocked || revealed || isPreview) return
    const tiers = tiersRef.current
    const players = playersRef.current
    if (tiers.length === 0 || Object.keys(players).length === 0) return
    const nowPart = Math.min(Math.max(currentPart, 0), tiers.length - 1)
    if (nowPart === prevPartRef.current) return
    const prevPart = prevPartRef.current
    tiers.forEach((tier, i) => {
      for (const key of tier.stems) {
        const player = players[key]
        if (!player) continue
        if (i <= nowPart && i > prevPart) {
          // Newly revealed by this step — audible fade, same floor-then-ramp
          // trick as before (a straight rampTo from -Infinity would spend
          // most of its time below hearing — see FADE_FLOOR_DB below).
          player.volume.setValueAtTime(FADE_FLOOR_DB, Tone.now())
          player.volume.rampTo(0, FADE_SECONDS, Tone.now())
        } else if (i <= nowPart) {
          player.volume.value = 0
        } else {
          player.volume.value = -Infinity
        }
      }
    })
    prevPartRef.current = nowPart
  }, [currentPart, song, guessesLocked, revealed, isPreview])

  // Polled, not a postgres_changes subscription — same reason
  // ShinyWagerQuestion documents at length: phone_answers' SELECT policy only
  // admits the owning team or a host_verified session, Realtime enforces that
  // same RLS before delivering a change event, and /display is neither, so a
  // subscription here would silently never fire. bendle_answer_counts() is a
  // SECURITY DEFINER RPC returning only the aggregate — no individual guess
  // ever reaches the TV before the reveal. Stops at lock, where the badge
  // replaces the count line and the host may hold for a while.
  useEffect(() => {
    if (guessesLocked) return
    let cancelled = false
    async function load() {
      const { data: counts } = await supabase.rpc('bendle_answer_counts', { p_slide_id: slide.id })
      if (cancelled) return
      // Row ARRAY, not an object: bendle_answer_counts is declared
      // `returns table(answered int)` where wager_answer_counts is `returns
      // jsonb`, so supabase-js hands back [{ answered }]. Copying Wager's
      // `counts?.answered` verbatim reads undefined and pins the TV at "0 of
      // N teams guessed" for the whole round. (The RPC used to also return
      // `total`, computed via a jsonb_array_elements scan over `shows` for a
      // value this component always discarded — dropped in the
      // 2026-09-05 migration; the teams head-count below, from a plain
      // `teams` query, is right from the first frame regardless.)
      setAnswered(counts?.[0]?.answered ?? 0)
    }
    load()
    const interval = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [slide.id, guessesLocked])

  useEffect(() => {
    if (!show?.id) return
    let cancelled = false
    supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('show_id', show.id)
      .then(({ count }) => { if (!cancelled) setTeamCount(count ?? 0) })
    return () => { cancelled = true }
  }, [show?.id])

  if (revealed) {
    return <BendleReveal data={data} song={song} theme={theme} shouldReduceMotion={shouldReduceMotion} isPreview={isPreview} />
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '4rem', gap: '2.5rem',
    }}>
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

      {data.text && (
        <p style={{ margin: 0, color: `${text}80`, fontSize: '1.4rem', fontFamily: bodyFont, textAlign: 'center', maxWidth: 1200 }}>
          {data.text}
        </p>
      )}

      {/* !isPreview: the preview pane never loads audio, so its loadState is
          pinned at 'loading' — without this the host's build-mode editor shows
          a "Loading song…" that can never resolve. */}
      {loadState === 'loading' && !guessesLocked && !isPreview && (
        <p style={{ margin: 0, color: `${text}60`, fontSize: '1.3rem', fontFamily: bodyFont }}>Loading song…</p>
      )}
      {loadState === 'error' && !guessesLocked && (
        <p style={{ margin: 0, color: '#e8703a', fontSize: '1.3rem', fontFamily: bodyFont }}>
          Couldn&rsquo;t load this song&rsquo;s audio — lock and retry on the host panel.
        </p>
      )}
      {loadState === 'ready' && !guessesLocked && (
        <StepIndicator tiers={tiers} currentPart={currentPart} text={text} bodyFont={bodyFont} />
      )}

      {/* Reserved-height slot, same reasoning ShinyWagerQuestion's carries:
          the badge is taller than the count line it replaces and this column
          is centre-justified, so a bare swap nudges everything above it. */}
      <div style={{
        minHeight: '3.4rem', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!guessesLocked ? (
          <CountLine n={answered} total={teamCount} text={text} bodyFont={bodyFont} />
        ) : (
          <AnswersLockedBadge theme={theme} />
        )}
      </div>
    </div>
  )
}

// Which step the room is on — a dot per tier (filled up through currentPart)
// plus the active tier's own label. Replaces the old elapsed-time progress
// bar (2026-09-08 rebuild to host-advanced steps): there's no clock left to
// show progress against, the host's own Next presses ARE the progress.
function StepIndicator({ tiers, currentPart, text, bodyFont }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        {tiers.map((tier, i) => (
          <div
            key={tier.id}
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i <= currentPart ? SHINY_GOLD : 'rgba(255,255,255,0.12)',
              transition: 'background 200ms ease',
            }}
          />
        ))}
      </div>
      <p style={{ margin: 0, color: `${text}70`, fontSize: '1.1rem', fontFamily: bodyFont }}>
        {tiers[currentPart]?.label}
      </p>
    </div>
  )
}

function CountLine({ n, total, text, bodyFont }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      style={{ margin: 0, color: `${text}70`, fontSize: '1.35rem', fontFamily: bodyFont }}
    >
      {total > 0 ? `${n} of ${total} teams guessed` : `${n} team${n === 1 ? '' : 's'} guessed`}
    </motion.p>
  )
}

// The payoff. The song lands first on its own, then the room's results
// cascade in underneath it — the order the host would say them out loud.
function BendleReveal({ data, song, theme, shouldReduceMotion, isPreview }) {
  const results = data.bendleResults ?? []
  const tiers = buildBendleTiers(data.bendleTierOrder)
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const twoCol = results.length > 8

  // The reveal beat's own audio lifecycle, separate from the round-playing
  // effect above: that effect's cleanup already ran the instant `revealed`
  // flipped true (it's in that effect's own dependency array), so by the
  // time this component mounts there are no live players or scheduled
  // fades left to collide with. Every stem that has a URL plays together,
  // full volume, from the same start_offset_seconds the round used — no
  // tier scheduling needed, this is the "whole song, vocals included"
  // payoff landing all at once. Loads are fired in parallel (Promise.all),
  // not one at a time — the round is already over and the reveal text is
  // already on screen, so four sequential fetches over show wifi would be
  // an awkward silent gap before the payoff actually lands. Same isPreview
  // guard as the round-playing effect: the build-mode canvas never plays
  // audio.
  useEffect(() => {
    if (!song || isPreview) return
    const transport = Tone.getTransport()
    let killed = false
    const created = []

    async function setup() {
      transport.stop()
      transport.cancel(0)
      transport.seconds = 0

      const loaded = await Promise.all(STEM_KEYS.map(async key => {
        const url = song[`${key}_url`]
        if (!url) return null
        const player = new Tone.Player().toDestination()
        try {
          await player.load(url)
          return player
        } catch (e) {
          console.error(`[Bendle] reveal stem load failed for "${key}":`, e)
          player.dispose()
          return null
        }
      }))
      if (killed) { loaded.forEach(p => p?.dispose()); return }

      const players = loaded.filter(Boolean)
      if (players.length === 0) return
      players.forEach(p => created.push(p))

      // Same shared-offset reasoning as the round-playing effect: one value,
      // derived from the shortest loaded buffer, applied to every stem.
      const stemDurationSeconds = Math.min(...players.map(p => p.buffer.duration))
      const revealOffsetSeconds = clampBendleOffset(song.start_offset_seconds, stemDurationSeconds)
      players.forEach(p => p.sync().start(0, revealOffsetSeconds))

      // Host-picked end point for the reveal beat only (the round above is
      // untouched — always ROUND_LENGTH_SECONDS from start_offset_seconds).
      // Null/unset means "play to the natural end," same as every song
      // before this column existed — no scheduling needed for that case.
      // Defense in depth: clamp against what's actually loaded right now,
      // not what the scrubber saw — stems could differ (reprocessed) between
      // when the offset was saved and when this plays, same pattern as
      // revealOffsetSeconds above.
      if (song.end_offset_seconds != null) {
        const stopAtSeconds = Math.min(song.end_offset_seconds, stemDurationSeconds)
        if (stopAtSeconds > revealOffsetSeconds) {
          const fadeStartSeconds = Math.max(revealOffsetSeconds, stopAtSeconds - FADE_SECONDS)
          transport.scheduleOnce(time => {
            players.forEach(p => p.volume.rampTo(-Infinity, FADE_SECONDS, time))
          }, fadeStartSeconds)
          // transport.cancel(0) in this effect's cleanup already clears this
          // if the slide unmounts first — no separate event id to track.
          transport.scheduleOnce(() => { transport.stop() }, stopAtSeconds)
        }
      }

      Tone.start().catch(() => {})
      transport.start()
    }
    setup()

    return () => {
      killed = true
      transport.stop()
      transport.cancel(0)
      created.forEach(p => p.dispose())
      created.length = 0
    }
  }, [song, isPreview])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '3rem 4rem', gap: '1.75rem',
    }}>
      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.94)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        transition={{ duration: 0.32, ease: EASE_OUT }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}
      >
        <span style={{ fontFamily: bodyFont, fontSize: '1.15rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: `${text}60` }}>
          The song was
        </span>
        <span style={{
          fontFamily: displayFont, fontSize: '5rem', lineHeight: 1,
          color: SHINY_GOLD, textShadow: `0 0 30px ${SHINY_GOLD_GLOW}77`, textAlign: 'center',
        }}>
          {song?.title ?? data.answer ?? '—'}
        </span>
      </motion.div>

      {results.length === 0 ? (
        <p style={{ margin: 0, color: `${text}60`, fontFamily: bodyFont, fontSize: '1.3rem' }}>
          No one guessed it.
        </p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: twoCol ? '1fr 1fr' : '1fr',
          gap: '0.5rem 2.5rem',
          width: '100%', maxWidth: twoCol ? 1600 : 1000,
        }}>
          {results.map((r, i) => (
            <motion.div
              key={`${r.teamId}-${i}`}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              transition={{ duration: 0.26, delay: 0.28 + i * 0.06, ease: EASE_OUT }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.9rem',
                padding: '0.65rem 1.1rem', borderRadius: 12,
                background: r.correct ? `${SHINY_GOLD}1f` : 'rgba(255,255,255,0.04)',
                border: r.correct ? `1px solid ${SHINY_GOLD}66` : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <span style={{
                flex: 1, minWidth: 0, fontFamily: displayFont, fontSize: '1.9rem',
                color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {r.teamName}
              </span>
              <span style={{ fontFamily: bodyFont, fontSize: '1.1rem', color: `${text}70`, flexShrink: 0 }}>
                {r.correct ? tiers.find(t => t.id === r.tierId)?.label ?? '' : '—'}
              </span>
              <span style={{
                minWidth: '4.5rem', textAlign: 'right', flexShrink: 0,
                fontFamily: displayFont, fontSize: '2rem',
                color: r.correct ? SHINY_GOLD : `${text}40`,
              }}>
                {r.correct ? `+${r.points}` : '0'}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
