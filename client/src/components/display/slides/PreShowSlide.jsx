import { useState, useEffect, useMemo } from 'react'
import QRCode from 'qrcode'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { PRESHOW_BEN_PHOTO } from '../../shared/BenPhoto.jsx'
import { supabase } from '../../../lib/supabase.js'
import { useClipPlayback } from '../../../audio/useClipPlayback.js'
import { walkoutClip } from '../../../lib/walkoutAudio.js'
import AudioBlockedCue from '../AudioBlockedCue.jsx'

// Same QR-join screen the show already shows automatically before it goes
// live (Display.jsx's PreShowScreen) — ported here as an addable, orderable
// slide so it's not just a one-time pre-show gate. Host can place it as the
// first slide, or return to it any time (e.g. a late-arriving team scans
// while the show is already running a round).
export default function PreShowSlide({ slide, show, isPreview }) {
  const { theme } = useTheme()
  const [teams, setTeams] = useState([])
  const [qrDataUrl, setQrDataUrl] = useState(null)

  // Walkout song — a {videoId, start, end} clip (same shape/editor as shiny audio questions).
  // Plays through ONCE from start, fading out over the last 2.5s of the trimmed range instead of
  // hard-cutting or looping — Ben: "it'll be an x long song that'll fade out at the end scrubbed
  // part," not an ambient loop. No visible player, no host play/pause button, and (reverted
  // 2026-09-09) no auto-advance: the song fades and stops, the host advances by hand.
  //
  // On the audio director: it warms the player at mount (the dominant flow, Go Live -> gate ->
  // reveal press, mounts this with `invoked` already true and Display.jsx warms the same key while
  // the gate is up), claims it on play, fades/stops at the out-point, releases it when the slide
  // leaves, and shows the shared "Click for sound" cue if the tab is locked. Never in the slide
  // editor's preview pane.
  const walkoutSong = slide?.data?.walkoutSong
  const clip = useMemo(
    () => walkoutClip(walkoutSong, 'fade'),
    [walkoutSong?.videoId, walkoutSong?.start, walkoutSong?.end, walkoutSong?.volume], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // trigger: 'invoke' (SlideEditor's "Hold until triggered" checkbox) — stay silent on mount;
  // useShow.js's nextSlide() flips `invoked` on the host's next explicit Next/Stream-Deck press.
  const hold = walkoutSong?.trigger === 'invoke' && !walkoutSong?.invoked
  const playback = useClipPlayback(clip, { slideId: slide.id, isPreview })
  const { play } = playback
  useEffect(() => {
    if (!clip || isPreview || hold) return
    play()
  }, [clip, hold, isPreview, play])

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
      <AudioBlockedCue show={playback.blocked && !isPreview} onRetry={playback.retry} theme={theme} />
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
