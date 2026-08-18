import { useState, useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { fitToBox, TITLE_CARD_BOX } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'
import DEFAULT_PHOTO from '../../../assets/state-of-union-photo.png'
import { loadYoutubeIframeApi } from '../../host/YoutubeClipEditor.jsx'

// Fixed RWB palette — deliberately NOT theme.colors, anywhere in this
// component. "State of the Union" is patriotic by identity; it must read
// the same red-white-blue on every one of the 21 themes, the same way a
// shiny question's gold doesn't shift with the ambient theme either.
const RWB_RED       = '#b22234'
const RWB_WHITE     = '#e8e0d8'
const RWB_BLUE      = '#2a50c0'
const RWB_BLUE_DEEP = '#0d1536'

// ─── Billowing gradient background ───────────────────────────────────────────
// Per-pixel ImageData at quarter resolution (320×180) — CSS scaling blurs it
// smooth. Each pixel's color is its diagonal position through a cyclic
// red→white→blue→white→red LUT, with a traveling wave billowing the whole
// field from the anchored left edge. Two deliberate shape choices:
//   • Diagonal weights (0.809, 1.251) sit the colour bands low — ≈20° off
//     horizontal — and, at this 16:9 canvas, pack them ~25% tighter than the
//     old 1.39/0.62 mapping, so more red/white/blue passes are on screen at
//     once. Both weights scaled together, so the angle is set by their ratio.
//   • A satin sheen sweeps across the field, HIGHLIGHT-ONLY: it brightens as
//     it passes and never dips below full brightness. A two-sided sheen used
//     to punch dark sweeping lines into the already-deep red and blue.
function WavingGradient({ reduce }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const W = 320, H = 180
    canvas.width = W
    canvas.height = H

    const maxAmp = reduce ? 3 : Math.round(H * 0.18)
    const k  = (2 * Math.PI) / (W * 0.55)
    const k2 = k * 1.65  // secondary harmonic — higher freq, different phase speed

    // Cyclic LUT: red → white → blue → white → red (seamless loop, red at both
    // ends). Vivid rose + periwinkle intermediates keep the transitions
    // saturated; smoothstep within each segment makes colours linger near
    // their peaks so it reads as billowing fabric, not a flat blend.
    const N = 512
    const lut = new Uint8Array(N * 3)
    const stops = [
      [0.000, 178,  34,  52],
      [0.125, 224,  68,  86],
      [0.250, 242, 234, 228],
      [0.375, 100, 120, 210],
      [0.500,  52,  78, 195],
      [0.625, 100, 120, 210],
      [0.750, 242, 234, 228],
      [0.875, 224,  68,  86],
      [1.000, 178,  34,  52],
    ]
    for (let i = 0; i < N; i++) {
      const d = i / (N - 1)
      let s = 0
      while (s < stops.length - 2 && d > stops[s + 1][0]) s++
      let p = (d - stops[s][0]) / (stops[s + 1][0] - stops[s][0])
      p = p * p * (3 - 2 * p)
      lut[i * 3]     = Math.round(stops[s][1] + (stops[s + 1][1] - stops[s][1]) * p)
      lut[i * 3 + 1] = Math.round(stops[s][2] + (stops[s + 1][2] - stops[s][2]) * p)
      lut[i * 3 + 2] = Math.round(stops[s][3] + (stops[s + 1][3] - stops[s][3]) * p)
    }

    const imgData = ctx.createImageData(W, H)
    const data = imgData.data

    let t = 0        // wave phase
    let scrollT = 0  // color scroll — independent of wave, loops via modulo
    let rafId

    function draw() {
      for (let x = 0; x < W; x++) {
        const env = Math.pow(x / W, 0.7)
        const wave = (Math.sin(k * x - t) + 0.22 * Math.sin(k2 * x - t * 1.38)) / 1.22
        const waveShift = wave * maxAmp * env
        // Highlight-only satin sheen — brightens as it sweeps, never darkens.
        const sh = 1 + 0.19 * (0.5 + 0.5 * Math.sin((x / W) * Math.PI * 2.4 - t * 1.3))
        for (let y = 0; y < H; y++) {
          const ey   = y - waveShift
          const diag = ((x / W * 0.809 + ey / H * 1.251 - scrollT) % 1.0 + 1.0) % 1.0
          const li   = Math.round(diag * (N - 1)) * 3
          const px   = (y * W + x) * 4
          data[px]     = Math.min(255, lut[li]     * sh)
          data[px + 1] = Math.min(255, lut[li + 1] * sh)
          data[px + 2] = Math.min(255, lut[li + 2] * sh)
          data[px + 3] = 255
        }
      }
      ctx.putImageData(imgData, 0, 0)
      t       += reduce ? 0.007  : 0.028   // wave: ~3.8s period
      scrollT += reduce ? 0.0003 : 0.0014  // scroll: one full RWB cycle ≈ 12s
      rafId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(rafId)
  }, [reduce])

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
}

export default function StateOfUnionSlide({ slide, isPreview }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const rt = slide.data?._regionTransforms ?? {}
  const xf = id => { const t = rt[id]; return t ? { transform: `translate(${t.dx??0}px,${t.dy??0}px) rotate(${t.rotate??0}deg) scale(${t.scale??1})`, transformOrigin: 'center', display: 'inline-block' } : {} }

  // fitToBox measures via canvas — a first paint before the display font
  // loads measures fallback-font metrics. This flips once web fonts are
  // ready purely to force the re-render that re-runs the inline fitToBox
  // call below with real glyph metrics; the value itself is never read.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)) }, [])

  // Walkout song — a {videoId, start, end} clip, same shape/editor as
  // Pre-Show's. UNLIKE Pre-Show (plays once, fades, auto-advances — that
  // slide's whole job is to end when the song ends), this one loops: no
  // fade, no advance, just seeks back to start whenever it hits end and
  // keeps going for as long as the host stays on this slide (2026-08-17,
  // Ben: "loop the chorus... over the state of the union slide").
  const walkoutSong = slide?.data?.walkoutSong
  const ytContainerRef = useRef(null)
  const ytPlayerRef = useRef(null)
  const ytWatchIntervalRef = useRef(null)

  useEffect(() => {
    // Never in the slide editor's preview pane — see PreShowSlide's identical guard.
    if (!walkoutSong?.videoId || isPreview) return
    let cancelled = false

    loadYoutubeIframeApi().then(YT => {
      if (cancelled || !ytContainerRef.current) return
      ytPlayerRef.current = new YT.Player(ytContainerRef.current, {
        videoId: walkoutSong.videoId,
        width: '1',
        height: '1',
        playerVars: { autoplay: 1, controls: 0, playsinline: 1 },
        events: {
          onReady: e => {
            if (cancelled) return
            // 75%, not full volume (2026-08-17, Ben) — this plays under a
            // host monologue, not as the only thing happening.
            e.target.setVolume(75)
            e.target.seekTo(walkoutSong.start ?? 0, true)
            e.target.playVideo()
            clearInterval(ytWatchIntervalRef.current)
            ytWatchIntervalRef.current = setInterval(() => {
              const player = ytPlayerRef.current
              if (!player) return
              const t = player.getCurrentTime?.() ?? 0
              // Same duration-not-loaded-yet guard as PreShowSlide — an
              // untrimmed clip (end: null) must not compute clipEnd=0 on
              // the first tick and loop-restart every 250ms.
              const duration = player.getDuration?.() ?? 0
              const clipEnd = walkoutSong.end ?? (duration > 0 ? duration : Infinity)
              if (clipEnd !== Infinity && t >= clipEnd) {
                player.seekTo(walkoutSong.start ?? 0, true)
              }
            }, 250)
          },
        },
      })
    })

    return () => {
      // Hard stop on leaving this slide (2026-08-17, Ben: "once i go to the
      // next slide the audio should just stop") — pauseVideo before
      // destroy() rather than relying on destroy alone, so the audio cuts
      // the instant the host advances rather than trailing for however long
      // destroy's own teardown takes.
      cancelled = true
      clearInterval(ytWatchIntervalRef.current)
      try { ytPlayerRef.current?.pauseVideo() } catch { /* already gone */ }
      try { ytPlayerRef.current?.destroy() } catch { /* already gone */ }
      ytPlayerRef.current = null
    }
  }, [walkoutSong?.videoId, walkoutSong?.start, walkoutSong?.end]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-24 overflow-hidden"
      style={{ background: RWB_BLUE_DEEP }}>

      {walkoutSong?.videoId && (
        <div
          key={`${walkoutSong.videoId}-${walkoutSong.start}-${walkoutSong.end}`}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        >
          <div ref={ytContainerRef} />
        </div>
      )}

      <WavingGradient reduce={reduce} />

      {/* Dark center vignette — keeps the tilted text readable */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 72% 62% at 50% 55%, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.18) 55%, rgba(0,0,0,0.03) 100%)',
      }} />

      {/* Ben photo — defaults to the flag photo (client/src/assets/state-of-union-photo.png)
          so it's there more often than not without being hardcoded; a host can override
          with a different slide.data.photoUrl. HostPhotoLibrary's "remove photo" affordance
          writes `null` (never `false` — no host surface writes that), so hiding has to key
          off null/empty, not falsy-vs-set: an unset key means "use the default", an
          explicitly-cleared one means "show nothing", and treating both the same was the bug
          (clearing a photo silently showed the default instead of hiding it).
          Pulled out of the centered message column (2026-08-17, Ben: message needs to be
          dead-center, photo goes elsewhere) — bottom-left corner, clear of the vignette's
          brightest center and the watermark's bottom-right. */}
      {slide.data?.photoUrl !== null && slide.data?.photoUrl !== '' && (
        <span
          data-slide-region="photo"
          data-slide-field="photo"
          style={{ position: 'absolute', bottom: 40, left: '6%', zIndex: 2, ...xf('photo') }}
        >
          <motion.img
            src={slide.data?.photoUrl || DEFAULT_PHOTO}
            alt="Host"
            className="rounded-2xl object-cover"
            style={{ display: 'block', height: '24vh', width: 'auto', maxWidth: '100%', opacity: 0.85 }}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 0.85, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          />
        </span>
      )}

      <div className="relative flex flex-col items-center" style={{ zIndex: 2 }}>
        {/* The only text on screen (2026-08-17, Ben: "state of the union are
            the only 4 words on the screen, centered, on that angle") — reads
            "State of the Union" 99.9% of the time, but a host can still
            override via the Message field for the rare show that needs
            different words in the same big tilted RWB-gradient treatment. */}
        <span data-slide-region="message" data-slide-field="message" style={xf('message')}>
          <motion.p
            initial={{ opacity: 0, scale: reduce ? 1 : 0.85, rotate: reduce ? -6 : -14 }}
            animate={{ opacity: 1, scale: 1, rotate: -6 }}
            transition={reduce ? { duration: 0.3, ease: EASE_OUT } : { type: 'spring', duration: 0.5, bounce: 0.25 }}
            style={{
              fontFamily: `'${theme.fonts.display}', sans-serif`,
              fontWeight: 700,
              fontSize: fitToBox(slide.data?.message || 'State of the Union', { ...TITLE_CARD_BOX, family: theme.fonts.display }),
              lineHeight: 1.15,
              textAlign: 'center',
              textWrap: 'balance',
              maxWidth: '22ch',
              filter: 'drop-shadow(0 2px 1px rgba(0,0,20,0.75)) drop-shadow(0 0 28px rgba(0,0,20,0.6))',
            }}
          >
            <span style={{
              background: `linear-gradient(135deg, ${RWB_RED} 0%, ${RWB_WHITE} 48%, ${RWB_BLUE} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              {slide.data?.message || 'State of the Union'}
            </span>
          </motion.p>
        </span>
      </div>
    </div>
  )
}
