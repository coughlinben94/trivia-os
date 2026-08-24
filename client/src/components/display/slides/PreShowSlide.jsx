import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { PRESHOW_BEN_PHOTO } from '../../shared/BenPhoto.jsx'
import { supabase } from '../../../lib/supabase.js'
import { warmYoutubeAudio, claimYoutubeAudio } from '../../../lib/youtubeWarmAudio.js'

// Same QR-join screen the show already shows automatically before it goes
// live (Display.jsx's PreShowScreen) — ported here as an addable, orderable
// slide so it's not just a one-time pre-show gate. Host can place it as the
// first slide, or return to it any time (e.g. a late-arriving team scans
// while the show is already running a round).
export default function PreShowSlide({ slide, show, isPreview, onAdvance }) {
  const { theme } = useTheme()
  const [teams, setTeams] = useState([])
  const [qrDataUrl, setQrDataUrl] = useState(null)

  // Walkout song — a {videoId, start, end} clip (same shape/editor as shiny
  // audio questions). Plays through ONCE from start, fading out over the
  // last FADE_MS of the trimmed range instead of hard-cutting or looping —
  // Ben: "it'll be an x long song that'll fade out at the end scrubbed
  // part," not an ambient loop. No visible player, no host play/pause
  // button.
  const walkoutSong = slide?.data?.walkoutSong
  const ytPlayerRef = useRef(null)
  const ytWatchIntervalRef = useRef(null)

  // Warm the player the moment the clip is known (muted, buffered at the
  // trim in-point, parked paused — see youtubeWarmAudio.js), so the invoke
  // press has only unmute+play left to do instead of API-load/build/buffer/
  // seek — the 2-4s of silent dead time Ben hit live (2026-08-24). The
  // dominant flow (Go Live → gate → reveal press invokes in the same write,
  // 514f8ba) mounts this slide with `invoked` already true, so Display.jsx
  // warms the same key while the gate is still up; this covers the other
  // flow, the QR screen re-shown mid-show and sitting un-invoked.
  useEffect(() => {
    if (!walkoutSong?.videoId || isPreview) return
    warmYoutubeAudio(walkoutSong.videoId, walkoutSong.start ?? 0)
  }, [walkoutSong?.videoId, walkoutSong?.start, isPreview])

  useEffect(() => {
    // Never in the slide editor's preview pane — this used to create a real
    // YT player and play it at full volume just from opening the slide to
    // edit it, stacked on top of YoutubeClipEditor's own preview player.
    if (!walkoutSong?.videoId || isPreview) return
    // trigger: 'invoke' (SlideEditor's "Hold until triggered" checkbox) —
    // stay silent on mount; useShow.js's nextSlide() flips `invoked` on the
    // host's next explicit Next/Stream-Deck press, which re-runs this effect.
    if (walkoutSong.trigger === 'invoke' && !walkoutSong.invoked) return
    let cancelled = false
    const FADE_MS = 2500
    const FADE_STEPS = 20

    // Claims the pre-warmed player (or builds fresh if nothing was warmed —
    // same latency as before, never worse). The handle owns the hidden
    // body-level iframe; destroy() in cleanup tears it down.
    const handle = claimYoutubeAudio(walkoutSong.videoId, walkoutSong.start ?? 0)
    handle.whenReady(player => {
      if (cancelled) return
      ytPlayerRef.current = player
      // walkoutSong.volume: manual gain set in YoutubeClipEditor's trim
      // UI (2026-08-19) — a cross-origin YouTube iframe can't be
      // measured/normalized automatically the way an uploaded file can.
      player.setVolume(walkoutSong.volume ?? 100)
      player.unMute()
      player.seekTo(walkoutSong.start ?? 0, true)
      player.playVideo()
      let fading = false
      clearInterval(ytWatchIntervalRef.current)
      ytWatchIntervalRef.current = setInterval(() => {
        const player = ytPlayerRef.current
        if (!player) return
        // A cold /display tab (no click/keydown yet this session) blocks
        // unmuted autoplay — playVideo() above fails silently, no error,
        // no onError, player just sits UNSTARTED forever. Retry every
        // tick: the instant ANY interaction lands on the tab (tap the
        // TV, press F), browser autoplay unlocks and this catches it,
        // instead of requiring the host to remember to tap before Go Live.
        // 2 (PAUSED) added with the warm-player rework: a warmed player is
        // parked paused, and a blocked unmuted play lands it back there —
        // safe to retry from, since nothing in this pre-fade phase ever
        // pauses on purpose (the fade path clears this interval first).
        const state = player.getPlayerState?.()
        if (state === -1 || state === 5 || state === 2) player.playVideo()
        const t = player.getCurrentTime?.() ?? 0
        // getDuration() returns 0 until metadata loads (and stays 0
        // forever for an embedding-disabled video) — `?? Infinity`
        // doesn't catch that (0 isn't null/undefined), so an untrimmed
        // walkout song (end: null, the default until the host drags
        // the trim handle) was computing clipEnd=0 on the very first
        // tick and advancing off this slide within ~250ms of going
        // live, skipping the QR/team-count screen it's meant to hold.
        const duration = player.getDuration?.() ?? 0
        const clipEnd = walkoutSong.end ?? (duration > 0 ? duration : Infinity)
        const fadeStart = clipEnd - FADE_MS / 1000
        if (!fading && clipEnd !== Infinity && t >= fadeStart) {
          fading = true
          clearInterval(ytWatchIntervalRef.current)
          let step = 0
          const fadeTimer = setInterval(() => {
            step += 1
            const v = Math.max(0, (walkoutSong.volume ?? 100) * (1 - step / FADE_STEPS))
            ytPlayerRef.current?.setVolume(v)
            if (step >= FADE_STEPS) {
              clearInterval(fadeTimer)
              ytPlayerRef.current?.pauseVideo()
              // Walkout song ending is the show's real "go" moment —
              // advance off Pre-Show automatically right after the
              // fade completes. Never in preview (would advance the
              // real live show from the host's preview pane).
              if (!isPreview) onAdvance?.()
            }
          }, FADE_MS / FADE_STEPS)
          ytWatchIntervalRef.current = fadeTimer
        }
      }, 250)
    })

    return () => {
      cancelled = true
      clearInterval(ytWatchIntervalRef.current)
      handle.destroy() // pauses + destroys the hidden body-level iframe
      ytPlayerRef.current = null
    }
    // isPreview/onAdvance intentionally excluded — both are stable for the
    // life of one mount (onAdvance is a useCallback from Display.jsx),
    // re-running this effect on their identity would remount the player.
  }, [walkoutSong?.videoId, walkoutSong?.start, walkoutSong?.end, walkoutSong?.trigger, walkoutSong?.invoked]) // eslint-disable-line react-hooks/exhaustive-deps

  const joinUrl = `${window.location.origin}/join?show=${show.id}`

  useEffect(() => {
    supabase
      .from('teams')
      .select('id, name')
      .eq('show_id', show.id)
      .order('registered_at', { ascending: true })
      .then(({ data }) => { if (data) setTeams(data) })

    const channel = supabase
      .channel(`preshow-slide-teams:${show.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'teams',
        filter: `show_id=eq.${show.id}`,
      }, (payload) => {
        setTeams(prev => {
          if (prev.some(t => t.id === payload.new.id)) return prev
          return [...prev, { id: payload.new.id, name: payload.new.name }]
        })
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [show.id])

  useEffect(() => {
    QRCode.toDataURL(joinUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#111111', light: '#f5f0e8' },
    }).then(url => setQrDataUrl(url))
  }, [joinUrl])

  return (
    // No own ambient background — Display.jsx already renders one persistent,
    // full-viewport ParticleBackground behind the stage ("must never
    // re-mount"). SlideRenderer skips its own locked bgDeep box for this
    // slide type (see the team-picker precedent there) so that world shows
    // straight through instead of a second instance painting over it.
    // The walkout song's hidden iframe no longer renders here — it lives in
    // a body-level 1x1 container owned by youtubeWarmAudio.js, so it can be
    // warmed before this component even mounts (and an iframe can't be
    // reparented into this tree without reloading and dropping its buffer).
    <div className="w-full h-full overflow-hidden relative select-none">
      <div style={{
        position: 'absolute',
        top: '23%',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        zIndex: 10,
      }}>
        <h1 style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          fontSize: 'clamp(3rem, 6vw, 5.5rem)',
          color: theme.colors.text,
          letterSpacing: '-0.02em',
          margin: 0,
          lineHeight: 1,
          textWrap: 'balance',
          textAlign: 'center',
        }}>Trivia Night</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '3rem' }}>
          <div style={{ borderRadius: '1.5rem', overflow: 'hidden', padding: '14px', background: '#f5f0e8' }}>
            {qrDataUrl
              ? <img src={qrDataUrl} alt="Scan to join trivia" width={160} height={160} style={{ display: 'block' }} />
              : <div style={{ width: 160, height: 160 }} />}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
              fontSize: 'clamp(3rem, 5vw, 4.5rem)',
              color: theme.colors.highlight,
              lineHeight: 1,
            }}>{teams.length}</span>
            <span style={{
              fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
              fontSize: '1.25rem',
              color: `${theme.colors.text}88`,
            }}>{teams.length === 1 ? 'team in' : 'teams in'}</span>
            <span style={{
              fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
              fontSize: '1.1rem',
              color: theme.colors.textMuted,
              textAlign: 'center',
              maxWidth: '120px',
            }}>Scan to join</span>
          </div>
        </div>

        {/* Ben — pinned to one specific cutout (see PRESHOW_BEN_PHOTO), not a
            random pool pick, and sat on the centre axis directly under the QR
            block instead of the old 120px circle in the bottom-left corner.
            The cutout's pose does the work: both arms are raised, so from here
            he reads as pointing up at the QR code he's asking the room to
            scan. Rendered `contain` on a transparent PNG rather than
            BenPhoto's `cover`-into-a-circle, which would centre-crop this
            1920x1080 canvas and cut the hands off.
            marginTop pulls him up against the QR: the PNG carries ~17% empty
            headroom above the hands, so the flex `gap` alone left an optical
            hole the geometry doesn't show. */}
        <img
          src={PRESHOW_BEN_PHOTO}
          alt=""
          style={{
            // cqh, not vh: this renderer draws inside StageFrame's
            // `container-type: size` box AND inside the host editor's
            // `transform: scale()` preview canvas, where vh would resolve
            // against the whole browser window and blow the photo up.
            // 38cqh, not the 45cqh this used to be: 'pre-show' joined
            // FULL_BLEED_SLIDE_TYPES on 2026-08-24 (see Display.jsx), so
            // StageFrame now hands this slide a scale-1 stage — the query
            // container is the full 1080p viewport, not the old 918px 85%
            // box. 45cqh of 1080 would be 486px; 38cqh is the ~410px
            // validated on a 1920x1080 render. That is also exactly what
            // Display.jsx's PreShowScreen copy of this block uses (38vh),
            // and at scale 1 cqh and vh finally agree — the two renders of
            // this one screen are now identical instead of merely tuned to
            // land on the same photo size from different box sizes.
            height: '38cqh',
            maxWidth: '100%',
            objectFit: 'contain',
            marginTop: '-3rem',
            filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.55))',
            // The cutout ends in a hard horizontal cut across the torso — the
            // old 120px circle crop hid it, at this size it reads as a badly
            // scissored sticker floating in mid-air. Fading the bottom out
            // lets him rise out of the ambient background instead. Verified
            // against a 1920x1080 render, not eyeballed.
            WebkitMaskImage: 'linear-gradient(to bottom, #000 60%, transparent 82%)',
            maskImage: 'linear-gradient(to bottom, #000 60%, transparent 82%)',
          }}
        />
      </div>
    </div>
  )
}
