import { useEffect, useRef, useState } from 'react'
import { extractYoutubeId } from '../../lib/youtube.js'

// Module-level singleton loader — the YouTube IFrame Player API script
// registers one global `window.onYouTubeIframeAPIReady` callback, so if two
// instances of this component (e.g. two audio slots, or a slot + a series
// part) each tried to inject the script and set that callback, only the
// last one would ever resolve. A single shared promise means every caller
// awaits the same load regardless of how many editors are mounted.
let ytApiPromise = null
function loadYoutubeIframeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise(resolve => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(window.YT)
    }
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      document.head.appendChild(script)
    }
  })
  return ytApiPromise
}

function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

// props: value = { videoId, start, end } | null, onChange(next) — next is
// the same shape, or null to clear back to the empty/paste-a-URL state.
export default function YoutubeClipEditor({ value, onChange }) {
  const videoId = value?.videoId ?? null

  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState(null)
  const [playerReady, setPlayerReady] = useState(false)
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(value?.start ?? 0)
  const [end, setEnd] = useState(value?.end ?? null)
  const [dragging, setDragging] = useState(null) // 'start' | 'end' | null
  const [previewing, setPreviewing] = useState(false)

  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const trackRef = useRef(null)
  const previewIntervalRef = useRef(null)

  // Local start/end only re-derive from `value` when we're looking at a
  // genuinely different clip (a new videoId) — not on every keystroke of
  // our own committed onChange, or a mid-drag update would fight itself.
  useEffect(() => {
    setStart(value?.start ?? 0)
    setEnd(value?.end ?? null)
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mount/destroy the YT.Player whenever the video changes.
  useEffect(() => {
    if (!videoId) return
    let cancelled = false
    setPlayerReady(false)
    setDuration(0)

    loadYoutubeIframeApi().then(YT => {
      if (cancelled || !containerRef.current) return
      playerRef.current = new YT.Player(containerRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, controls: 1 },
        events: {
          onReady: e => {
            if (cancelled) return
            setPlayerReady(true)
            setDuration(e.target.getDuration() || 0)
          },
        },
      })
    })

    return () => {
      cancelled = true
      clearInterval(previewIntervalRef.current)
      try { playerRef.current?.destroy() } catch { /* already gone */ }
      playerRef.current = null
    }
  }, [videoId])

  function commit(nextStart, nextEnd) {
    onChange({ videoId, start: nextStart, end: nextEnd })
  }

  function handleUrlSubmit(e) {
    e.preventDefault()
    const id = extractYoutubeId(urlInput)
    if (!id) { setUrlError('Could not find a YouTube video in that URL.'); return }
    setUrlError(null)
    setUrlInput('')
    setStart(0)
    setEnd(null)
    onChange({ videoId: id, start: 0, end: null })
  }

  function handleChangeVideo() {
    clearInterval(previewIntervalRef.current)
    try { playerRef.current?.destroy() } catch { /* already gone */ }
    playerRef.current = null
    setPlayerReady(false)
    setDuration(0)
    setPreviewing(false)
    onChange(null)
  }

  function fractionFromClientX(clientX) {
    const rect = trackRef.current.getBoundingClientRect()
    if (!rect.width) return 0
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
  }

  function handleHandlePointerDown(which) {
    return e => {
      e.preventDefault()
      try { e.target.setPointerCapture(e.pointerId) } catch { /* touch/trackpad fallback */ }
      setDragging(which)
    }
  }

  function handleTrackPointerMove(e) {
    if (!dragging || !duration) return
    const t = fractionFromClientX(e.clientX) * duration
    if (dragging === 'start') {
      setStart(Math.min(t, (end ?? duration) - 1))
    } else {
      setEnd(Math.max(t, start + 1))
    }
  }

  function handleTrackPointerUp() {
    if (!dragging) return
    setDragging(null)
    commit(start, end)
  }

  function seekPreview() {
    if (!playerRef.current) return
    clearInterval(previewIntervalRef.current)
    playerRef.current.seekTo(start, true)
    playerRef.current.playVideo()
    setPreviewing(true)
    previewIntervalRef.current = setInterval(() => {
      const t = playerRef.current?.getCurrentTime?.() ?? 0
      const clipEnd = end ?? duration
      if (clipEnd && t >= clipEnd) {
        playerRef.current?.pauseVideo()
        clearInterval(previewIntervalRef.current)
        setPreviewing(false)
      }
    }, 200)
  }

  function stopPreview() {
    clearInterval(previewIntervalRef.current)
    playerRef.current?.pauseVideo()
    setPreviewing(false)
  }

  // ── Empty state: just the URL input ──
  if (!videoId) {
    return (
      <form onSubmit={handleUrlSubmit} className="space-y-1.5">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="Paste a YouTube URL…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-baynes-forest"
          />
          <button
            type="submit"
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors shrink-0"
          >
            Load
          </button>
        </div>
        {urlError && <p className="text-xs text-red-600">{urlError}</p>}
      </form>
    )
  }

  const startPct = duration ? (start / duration) * 100 : 0
  const endPct = duration ? ((end ?? duration) / duration) * 100 : 100

  return (
    <div
      className="space-y-2.5"
      onPointerMove={handleTrackPointerMove}
      onPointerUp={handleTrackPointerUp}
      onPointerCancel={handleTrackPointerUp}
    >
      <div className="rounded-lg overflow-hidden border border-gray-200 bg-black" style={{ aspectRatio: '16 / 9' }}>
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {!playerReady && (
        <p className="text-xs text-gray-400">Loading player…</p>
      )}

      {playerReady && (
        <>
          <div className="pt-0.5">
            <div
              ref={trackRef}
              className="relative h-2 rounded-full bg-gray-200"
              style={{ touchAction: 'none' }}
            >
              <div
                className="absolute top-0 bottom-0 rounded-full bg-baynes-forest"
                style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
              />
              <div
                onPointerDown={handleHandlePointerDown('start')}
                className="absolute top-1/2 w-4 h-4 rounded-full bg-white border-2 border-baynes-forest shadow cursor-grab active:cursor-grabbing"
                style={{ left: `${startPct}%`, marginTop: '-8px', marginLeft: '-8px' }}
                title={`Start: ${formatTime(start)}`}
              />
              <div
                onPointerDown={handleHandlePointerDown('end')}
                className="absolute top-1/2 w-4 h-4 rounded-full bg-white border-2 border-baynes-forest shadow cursor-grab active:cursor-grabbing"
                style={{ left: `${endPct}%`, marginTop: '-8px', marginLeft: '-8px' }}
                title={`End: ${end != null ? formatTime(end) : formatTime(duration)}`}
              />
            </div>
            <div className="flex justify-between text-[11px] text-gray-500 mt-1.5">
              <span>{formatTime(start)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <p className="text-[11px] text-gray-500">
            Clip: <span className="font-medium text-gray-700">{formatTime(start)}</span> – <span className="font-medium text-gray-700">{end != null ? formatTime(end) : 'end'}</span>
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={previewing ? stopPreview : seekPreview}
              className="flex-1 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 hover:border-baynes-forest text-gray-700 transition-colors"
            >
              {previewing ? '⏸ Stop preview' : '▶ Preview clip'}
            </button>
            <button
              type="button"
              onClick={handleChangeVideo}
              className="text-xs text-gray-400 hover:text-red-500 px-2 py-2 transition-colors shrink-0"
            >
              Change video
            </button>
          </div>
        </>
      )}
    </div>
  )
}
