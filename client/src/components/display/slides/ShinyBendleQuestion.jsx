import { useState, useEffect } from 'react'
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
import { BENDLE_TIERS } from '../../../lib/bendleScoring.js'
import { AnswersLockedBadge } from '../LockCountdownOverlay.jsx'

const STEM_KEYS = ['drums', 'bass', 'other', 'vocals']
const ROUND_LENGTH_SECONDS = BENDLE_TIERS[BENDLE_TIERS.length - 1].atSeconds + 20
const FADE_SECONDS = 1.5
// A layer waits at -Infinity dB (gain 0 — provably silent, no information
// leaks under the drums) and is stepped to this floor at the instant its
// tier fires, so the ramp that follows is an audible 1.5s fade instead of
// a pop. Ramping straight from -Infinity would not work: Param.rampTo on a
// decibels unit is an EXPONENTIAL gain ramp, so it spends ~1.4 of its 1.5
// seconds below hearing and only the last fraction is audible.
const FADE_FLOOR_DB = -50

// The TV side of a Bendle question. Three beats, one component:
//   1. Playing — the drums are already going; bass, everything-else and
//      vocals layer in on the BENDLE_TIERS clock while the room guesses.
//   2. Locked  — held after "lock guesses" until the host presses A, audio
//      stopped (same held, legible-from-the-bar badge Wager/Order use).
//   3. Reveal  — the song, then who got it and at which tier.
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

  // Load the stems, schedule the layer-in fades, run the Transport — and own
  // the teardown of everything it built. One effect on purpose: the players,
  // the scheduled events and the Transport are one lifecycle, and splitting
  // them (as the plan sketched) let a re-run overwrite playersRef with a
  // second set of Players while the first set stayed synced to the Transport
  // and audible — the same song playing twice, half a beat apart, on a live
  // TV. Cleanup runs on unmount AND the moment guesses lock, so a locked or
  // left slide can never keep playing under the next one.
  useEffect(() => {
    if (!song || guessesLocked || revealed || isPreview) return
    const transport = Tone.getTransport()
    let killed = false
    const created = []

    async function setup() {
      transport.stop()
      // Clears any scheduleOnce still queued from an earlier Bendle slide —
      // the Transport is a global singleton, so without this a previous
      // round's un-fired fades ride along into this one.
      transport.cancel(0)
      transport.seconds = 0

      const players = {}
      for (const key of STEM_KEYS) {
        const url = song[`${key}_url`]
        if (!url) continue
        let player = null
        try {
          player = new Tone.Player().toDestination()
          player.volume.value = -Infinity
          await player.load(url)
        } catch (e) {
          // Per-stem failure skips that layer rather than blocking the whole
          // round on a live TV: it is left out of `players`, so the schedule
          // below simply never fades it in and the rest of the song plays.
          console.error(`[Bendle] stem load failed for "${key}":`, e)
          player?.dispose()
          continue
        }
        if (killed) { player.dispose(); return }
        player.sync().start(0)
        created.push(player)
        players[key] = player
      }
      if (killed) return

      if (Object.keys(players).length === 0) { setLoadState('error'); return }

      // The first tier's stems are audible from the first frame; every later
      // layer waits silent and is faded up when its tier's atSeconds arrives.
      // Driven by tier.stems, not tier.id — a tier can bring in more than one
      // stem (the last one lands `other` and `vocals` together), so the two
      // lists are not one-to-one. See BENDLE_TIERS.
      for (const key of BENDLE_TIERS[0].stems) {
        if (players[key]) players[key].volume.value = 0
      }
      for (const tier of BENDLE_TIERS.slice(1)) {
        for (const key of tier.stems) {
          const player = players[key]
          if (!player) continue
          transport.scheduleOnce(time => {
            player.volume.setValueAtTime(FADE_FLOOR_DB, time)
            player.volume.rampTo(0, FADE_SECONDS, time)
          }, tier.atSeconds)
        }
      }

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
    }
  }, [song, guessesLocked, revealed, isPreview])

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
    return <BendleReveal data={data} song={song} theme={theme} shouldReduceMotion={shouldReduceMotion} />
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
      {loadState === 'ready' && !guessesLocked && <BendleProgressBar />}

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

// How far into the song the room is. Polled off the Transport rather than a
// React-side timer so it can never drift away from what people are hearing.
function BendleProgressBar() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(Math.min(1, (Tone.getTransport().seconds ?? 0) / ROUND_LENGTH_SECONDS))
    }, 100)
    return () => clearInterval(interval)
  }, [])
  return (
    <div style={{ width: '100%', maxWidth: 900, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{ width: `${progress * 100}%`, height: '100%', background: SHINY_GOLD, transition: 'width 100ms linear' }} />
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
function BendleReveal({ data, song, theme, shouldReduceMotion }) {
  const results = data.bendleResults ?? []
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const twoCol = results.length > 8

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
                {r.correct ? BENDLE_TIERS.find(t => t.id === r.tierId)?.label ?? '' : '—'}
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
