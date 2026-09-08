import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { ROUND_LENGTH_SECONDS, clampBendleOffset } from '../../lib/bendleScoring.js'
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

// props: song = { id, drums_url, bass_url, other_url, start_offset_seconds }
export default function BendleOffsetScrubber({ song }) {
  const [envelopes, setEnvelopes] = useState(null)
  const [duration, setDuration] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [offset, setOffset] = useState(song.start_offset_seconds ?? 0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const audioRef = useRef(null)
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

  const maxOffset = duration ? Math.max(0, duration - ROUND_LENGTH_SECONDS) : 0
  const tooShort = duration > 0 && maxOffset === 0

  function handleSeek(e) {
    const value = Number(e.target.value)
    setOffset(value)
    if (audioRef.current) audioRef.current.currentTime = value
  }

  function playPreview() {
    if (!audioRef.current) return
    clearTimeout(previewTimerRef.current)
    audioRef.current.currentTime = offset
    audioRef.current.play().catch(() => {})
    previewTimerRef.current = setTimeout(() => audioRef.current?.pause(), PREVIEW_SECONDS * 1000)
  }

  async function handleSetStart() {
    setSaving(true)
    setSaveError(false)
    const clamped = clampBendleOffset(offset, duration)
    const { data, error } = await supabase.from('bendle_songs')
      .update({ start_offset_seconds: Math.round(clamped) })
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
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={song.other_url} />
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
          {/* Width-capped to the same fraction of the row as the graph's
              undimmed (legal) portion above, so the slider's track lines up
              with where the graph actually goes dim instead of spanning the
              full song width at a different scale. */}
          <div style={{ width: `${(maxOffset / duration) * 100}%` }}>
            <input
              type="range" min="0" max={maxOffset} step="1" value={Math.min(offset, maxOffset)}
              onChange={handleSeek}
              className="w-full accent-baynes-forest"
              aria-label="Start point"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span>{formatOffsetTime(offset)}</span>
            <span>{formatOffsetTime(maxOffset)}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={playPreview} className="flex-1 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 hover:border-baynes-forest text-gray-700 transition-colors">
              ▶ Preview 5s
            </button>
            <button type="button" onClick={handleSetStart} disabled={saving} className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : '🎯 Set Start Here'}
            </button>
          </div>
          {saveError && <p className="text-xs text-red-500">Couldn&rsquo;t save the start point — try again.</p>}
        </>
      )}
    </div>
  )
}
