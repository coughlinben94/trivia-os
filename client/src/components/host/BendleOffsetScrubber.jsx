import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { MIN_PLAYABLE_SECONDS, clampBendleOffset } from '../../lib/bendleScoring.js'
import { computeRmsEnvelope, resampleEnvelope, normalizeEnvelope } from '../../lib/bendleAudioAnalysis.js'
import { formatTime as formatOffsetTime } from '../../lib/formatTime.js'
export { formatOffsetTime }

// Which stems get a bar graph — drums/bass/other are the three in-round
// tiers (see BENDLE_TIERS), so this is literally "show me where all three
// tiers would already sound full." Vocals is deliberately excluded: it
// never plays during the round (see bendleScoring.js's BENDLE_TIERS
// comment), so its timing is irrelevant to picking a start point here.
const GRAPH_ROWS = [
  { key: 'drums_url', label: 'Drums', color: '#9333ea' },
  { key: 'bass_url', label: 'Bass', color: '#2563eb' },
  { key: 'other_url', label: 'Other', color: '#16a34a' },
]
const BUCKET_COUNT = 100
const PREVIEW_SECONDS = 5
// Floor on the start->end gap a host can save — stops an accidental
// zero-length (or negative) reveal window from a slider drag gone wrong.
const MIN_END_GAP_SECONDS = 3

// props: song = { id, drums_url, bass_url, other_url, start_offset_seconds }
export default function BendleOffsetScrubber({ song }) {
  const [envelopes, setEnvelopes] = useState(null)
  const [duration, setDuration] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [offset, setOffset] = useState(song.start_offset_seconds ?? 0)
  // null until duration is known — then defaults to the natural end of the
  // song (matching pre-existing songs, which have no end_offset_seconds and
  // have always played to the stem's own end).
  const [endOffset, setEndOffset] = useState(song.end_offset_seconds ?? null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  // .play() rejects silently on a real failure (blocked autoplay, a bad
  // decode, a network blip) — was swallowed outright (`.catch(() => {})`),
  // so a broken preview looked identical to a working one with no sound:
  // no error, no feedback, nothing (Ben, 2026-09-08: "there isnt a
  // preview"). Surfaced instead of silently eaten.
  const [previewError, setPreviewError] = useState(false)
  // Keyed by GRAPH_ROWS' row.key (drums_url/bass_url/other_url) — one
  // <audio> per in-round stem so Preview actually plays what the round
  // sounds like (layered drums+bass+other), not just one track. Was a
  // single ref hardcoded to other_url only (bug, 2026-09-08 — Ben: "is it
  // all three combined? just one of the three steps?").
  const audioRefs = useRef({})
  const previewTimerRef = useRef(null)

  // Re-syncs the local offset when the DB value changes out from under this
  // component — e.g. a second host device saves a different start point for
  // the same song while this one is still mounted (BendleAdmin's realtime
  // subscription merges the row update in without remounting the scrubber).
  // Without this, a stale local `offset` could get written right back over
  // the other host's save the next time "Set Start Here" is clicked.
  useEffect(() => {
    setOffset(song.start_offset_seconds ?? 0)
  }, [song.start_offset_seconds])

  // Same re-sync rationale as the start offset above — a second host device
  // could save a different end point while this one stays mounted.
  useEffect(() => {
    setEndOffset(song.end_offset_seconds ?? null)
  }, [song.end_offset_seconds])

  // Decodes drums/bass/other once per song via the Web Audio API (never
  // Tone.js — see this plan's Global Constraints on keeping Tone out of the
  // Host bundle). Deliberately NOT stored anywhere: recomputed every time
  // the admin opens this song's scrubber, which is rare (once per prepped
  // song) and cheap (one ~3-4 min mp3 decode + a linear RMS scan, done at
  // home on a laptop, not on bar wifi mid-show).
  useEffect(() => {
    let cancelled = false
    // No webkitAudioContext fallback — the host runs this on a current
    // Chrome or Safari (14.1+), both of which have had unprefixed
    // AudioContext for years; window.AudioContext is also what the test in
    // Step 5 below mocks.
    const ctx = new window.AudioContext()

    async function analyze() {
      try {
        const nextEnvelopes = {}
        let minDuration = Infinity
        // Decode-then-analyze one stem at a time, not all three held in
        // memory together — each decoded buffer is tens of MB (a few
        // minutes of float32 PCM), and only the small resulting envelope
        // array needs to survive past this loop.
        for (const row of GRAPH_ROWS) {
          const res = await fetch(song[row.key])
          const arrayBuffer = await res.arrayBuffer()
          const buffer = await ctx.decodeAudioData(arrayBuffer)
          if (cancelled) return
          minDuration = Math.min(minDuration, buffer.duration)
          const raw = computeRmsEnvelope(buffer.getChannelData(0), buffer.sampleRate)
          nextEnvelopes[row.key] = normalizeEnvelope(resampleEnvelope(raw, BUCKET_COUNT))
        }
        if (cancelled) return
        setEnvelopes(nextEnvelopes)
        setDuration(minDuration)
      } catch (e) {
        console.error('[Bendle] scrubber analysis failed:', e)
        if (!cancelled) setLoadError(true)
      }
    }
    analyze()

    return () => {
      cancelled = true
      ctx.close().catch(() => {})
      clearTimeout(previewTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id])

  const maxOffset = duration ? Math.max(0, duration - MIN_PLAYABLE_SECONDS) : 0
  const tooShort = duration > 0 && maxOffset === 0

  function handleSeek(value) {
    setOffset(value)
    for (const el of Object.values(audioRefs.current)) {
      if (el) el.currentTime = value
    }
  }

  function playPreview() {
    clearTimeout(previewTimerRef.current)
    setPreviewError(false)
    let anyPlayed = false
    for (const el of Object.values(audioRefs.current)) {
      if (!el) continue
      el.currentTime = offset
      el.play().then(() => { anyPlayed = true }).catch(e => {
        console.error('[Bendle] preview playback failed:', e)
        setPreviewError(true)
      })
    }
    previewTimerRef.current = setTimeout(() => {
      for (const el of Object.values(audioRefs.current)) el?.pause()
      if (!anyPlayed) setPreviewError(true)
    }, PREVIEW_SECONDS * 1000)
  }

  function handleSeekEnd(value) {
    setEndOffset(value)
  }

  // Saves both the start and end point in one round-trip — the reveal beat
  // plays exactly the start->end window this sets (Ben: "then that portion
  // is what gets taken to the live show").
  async function handleSave() {
    setSaving(true)
    setSaveError(false)
    const clampedStart = Math.round(clampBendleOffset(offset, duration))
    const rawEnd = endOffset ?? duration
    const clampedEnd = Math.round(Math.min(duration, Math.max(clampedStart + MIN_END_GAP_SECONDS, rawEnd)))
    const { data, error } = await supabase.from('bendle_songs')
      .update({ start_offset_seconds: clampedStart, end_offset_seconds: clampedEnd })
      .eq('id', song.id)
      .select('start_offset_seconds')
    setSaving(false)
    if (error || !data?.length) setSaveError(true)
  }

  if (loadError) {
    return <p className="text-xs text-red-500">Couldn&rsquo;t load this song&rsquo;s stems to scrub.</p>
  }
  if (!envelopes) {
    return <p className="text-xs text-gray-400">Analyzing song…</p>
  }

  return (
    <div className="space-y-2">
      {GRAPH_ROWS.map(row => (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio key={row.key} ref={el => { audioRefs.current[row.key] = el }} src={song[row.key]} />
      ))}
      <div className="space-y-0.5" data-testid="bendle-envelope-graph">
        {/* Renders every bucket across the FULL song (not just the legal
            [0, maxOffset] range) so the slider's cutoff reads as a real
            boundary against the whole track — bars past it are dimmed
            instead of just not being there. Used to slice+flex-stretch to
            only the legal range, which silently hid how much of the song
            was off-limits (Ben, 2026-09-08: "there isn't a scrubbed out
            part"). */}
        {GRAPH_ROWS.map(row => {
          const legalBuckets = Math.max(1, Math.ceil(BUCKET_COUNT * maxOffset / duration))
          return (
            <div key={row.key} className="flex items-end h-6 gap-px" title={row.label}>
              {envelopes[row.key].map((v, i) => (
                <div
                  key={i}
                  style={{
                    height: `${Math.max(4, v * 100)}%`,
                    backgroundColor: row.color,
                    opacity: i < legalBuckets ? 1 : 0.2,
                    flex: 1,
                  }}
                />
              ))}
            </div>
          )
        })}
      </div>
      {tooShort ? (
        <p className="text-xs text-gray-400">Song&rsquo;s too short to pick a start point — it&rsquo;ll always play from 0:00.</p>
      ) : (
        <>
          {/* One track, two handles — IN (start) and OUT (end) — instead of
              two stacked sliders (Ben, 2026-09-08: "why is there still two
              scrub lines" / "one in one out"). A native <input type="range">
              only ever has one thumb, so this stacks two of them on the same
              track with their own backgrounds made transparent (see the
              inline <style> below) — only each one's thumb stays clickable,
              same trick noUiSlider-style dual sliders use. Both share the
              same 0..duration domain so they can share one visual track; the
              business-rule clamp (start can't pass maxOffset, end can't sit
              closer than MIN_END_GAP_SECONDS past start) happens in the
              onChange handlers below, not the DOM min/max. */}
          <style>{`
            .bendle-dual-range { pointer-events: none; background: transparent; -webkit-appearance: none; appearance: none; }
            .bendle-dual-range::-webkit-slider-runnable-track { background: transparent; }
            .bendle-dual-range::-webkit-slider-thumb { pointer-events: auto; }
            .bendle-dual-range::-moz-range-track { background: transparent; }
            .bendle-dual-range::-moz-range-thumb { pointer-events: auto; }
          `}</style>
          <div className="relative h-5">
            {/* Visual track: full song in light gray, the selected
                start->end window highlighted on top. */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gray-200" />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-baynes-forest/70"
              style={{
                left: `${(Math.min(offset, maxOffset) / duration) * 100}%`,
                right: `${100 - (Math.min(Math.max(endOffset ?? duration, offset), duration) / duration) * 100}%`,
              }}
            />
            <input
              type="range" min={0} max={duration} step="1" value={Math.min(offset, maxOffset)}
              onChange={e => handleSeek(Math.min(Number(e.target.value), maxOffset))}
              className="bendle-dual-range absolute inset-0 w-full accent-baynes-forest"
              aria-label="Start point"
            />
            <input
              type="range" min={0} max={duration} step="1" value={Math.min(Math.max(endOffset ?? duration, offset), duration)}
              onChange={e => handleSeekEnd(Math.max(Number(e.target.value), Math.min(offset, maxOffset) + MIN_END_GAP_SECONDS))}
              className="bendle-dual-range absolute inset-0 w-full accent-baynes-forest"
              aria-label="End point"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span>IN {formatOffsetTime(offset)}</span>
            <span>OUT {formatOffsetTime(endOffset ?? duration)}</span>
          </div>
          <p className="text-[11px] text-gray-400">Round steps always play to their own natural end — this only sets where the reveal starts and stops.</p>

          <div className="flex gap-2">
            <button type="button" onClick={playPreview} className="flex-1 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 hover:border-baynes-forest text-gray-700 transition-colors">
              ▶ Preview 5s
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : '🎯 Set Start & End'}
            </button>
          </div>
          {saveError && <p className="text-xs text-red-500">Couldn&rsquo;t save the start/end points — try again.</p>}
          {previewError && <p className="text-xs text-red-500">Couldn&rsquo;t play the preview — check connection and try again.</p>}
        </>
      )}
    </div>
  )
}
