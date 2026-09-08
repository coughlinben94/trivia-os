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
import { clampBendleOffset, buildBendleTiers } from '../../../lib/bendleScoring.js'

const STEM_KEYS = ['drums', 'bass', 'other', 'vocals']
const FADE_SECONDS = 1.5

// The TV side of ONE Bendle step-slide. A round is 3 REAL sibling slides
// (2026-09-08 rebuild, Ben: "i asked you for three different slides. one
// each for each diff step" — not an internal timer, not parts on one
// slide). Each slide plays its own cumulative stem mix from a clean load —
// step 0 is the first instrument alone, step 1 adds the second, step 2 adds
// the third — no cross-slide audio continuity is attempted; advancing to
// the next step slide is a real slide change like any other.
//
// Scoring is MANUAL, not phone-scored: teams write the answer down, the
// host walks around and enters points via Quick Entry, same as any regular
// question (Ben: "the teams are raising hands and writing down name of
// song... ill go around and grade"). So there's no lock/guess/results state
// machine here — pressing the standard "A" key (show.answer_reveal, the
// same Stream Deck action every other question uses) both shows the answer
// via the generic AnswerRevealOverlay (Display.jsx — already reads
// resolveShinyPart(data).answer on ANY slide, no Bendle-specific code
// needed there) and swaps this component's own audio to the full mix,
// vocals included, on whichever step slide it's pressed on.
export default function ShinyBendleQuestion({ slide, show, theme, isPreview }) {
  const { data } = slide
  const tiers = buildBendleTiers(data.bendleTierOrder)
  const stepIndex = Math.min(Math.max(data.bendleStepIndex ?? 0, 0), tiers.length - 1)
  const revealed = !!(show?.answer_reveal ?? show?.showState?.answerReveal)
  const shouldReduceMotion = useReducedMotion()

  const [song, setSong] = useState(null)
  const [loadState, setLoadState] = useState('loading') // 'loading' | 'ready' | 'error'

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

  // Loads and plays exactly what this beat should sound like: this step's
  // cumulative stems, or — once revealed — every stem including vocals. One
  // effect owns load + play + teardown together: the Transport is a global
  // singleton, so splitting "load" from "start" risks two overlapping
  // player sets fighting each other on a live TV.
  useEffect(() => {
    if (!song || isPreview) return
    const transport = Tone.getTransport()
    let killed = false
    const created = []

    async function setup() {
      transport.stop()
      // Clears any scheduleOnce still queued from an earlier Bendle beat —
      // the Transport is a global singleton, so without this a previous
      // beat's un-fired stop/fade rides along into this one.
      transport.cancel(0)
      transport.seconds = 0

      const stemKeys = revealed
        ? STEM_KEYS
        : tiers.slice(0, stepIndex + 1).flatMap(t => t.stems)

      const players = {}
      for (const key of stemKeys) {
        const url = song[`${key}_url`]
        if (!url) continue
        let player = null
        try {
          player = new Tone.Player().toDestination()
          await player.load(url)
        } catch (e) {
          // Per-stem failure skips that layer rather than blocking the whole
          // beat on a live TV: it is left out of `players`, so it just
          // never sounds and the rest of the mix plays.
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
      // buffer — computing once and applying it to all of them keeps every
      // stem starting at the exact same point instead of risking drift if
      // their encoded lengths ever differ even slightly.
      const stemDurationSeconds = Math.min(...Object.values(players).map(p => p.buffer.duration))
      const offsetSeconds = clampBendleOffset(song.start_offset_seconds, stemDurationSeconds)
      for (const player of Object.values(players)) player.sync().start(0, offsetSeconds)

      // Host-picked end point applies only to the revealed (full-mix) beat —
      // the step beats always play to their natural end. Defense in depth:
      // clamp against what's actually loaded right now, not what the
      // scrubber saw — stems could differ (reprocessed) between when the
      // offset was saved and when this plays.
      if (revealed && song.end_offset_seconds != null) {
        const stopAtSeconds = Math.min(song.end_offset_seconds, stemDurationSeconds)
        if (stopAtSeconds > offsetSeconds) {
          const fadeStartSeconds = Math.max(offsetSeconds, stopAtSeconds - FADE_SECONDS)
          transport.scheduleOnce(time => {
            Object.values(players).forEach(p => p.volume.rampTo(-Infinity, FADE_SECONDS, time))
          }, fadeStartSeconds)
          // transport.cancel(0) in this effect's cleanup already clears this
          // if the slide unmounts first — no separate event id to track.
          transport.scheduleOnce(() => { transport.stop() }, stopAtSeconds)
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
  }, [song, isPreview, revealed, stepIndex, data.bendleTierOrder])

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
      {loadState === 'loading' && !isPreview && (
        <p style={{ margin: 0, color: `${text}60`, fontSize: '1.3rem', fontFamily: bodyFont }}>Loading song…</p>
      )}
      {loadState === 'error' && (
        <p style={{ margin: 0, color: '#e8703a', fontSize: '1.3rem', fontFamily: bodyFont }}>
          Couldn&rsquo;t load this song&rsquo;s audio.
        </p>
      )}

      <StepIndicator tiers={tiers} stepIndex={stepIndex} text={text} bodyFont={bodyFont} />
    </div>
  )
}

// 3 dots + the active step's label/points — a visual "how far into the
// reveal are we" reference for the room, and a reminder for Ben's manual
// grading since points are no longer auto-tracked anywhere in the app.
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
