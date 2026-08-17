import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import BaynesWatermark from '../BaynesWatermark.jsx'
import BenPhoto from '../../shared/BenPhoto.jsx'
import { supabase } from '../../../lib/supabase.js'
import { loadYoutubeIframeApi } from '../../host/YoutubeClipEditor.jsx'

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
  const ytContainerRef = useRef(null)
  const ytPlayerRef = useRef(null)
  const ytWatchIntervalRef = useRef(null)

  useEffect(() => {
    // Never in the slide editor's preview pane — this used to create a real
    // YT player and play it at full volume just from opening the slide to
    // edit it, stacked on top of YoutubeClipEditor's own preview player.
    if (!walkoutSong?.videoId || isPreview) return
    let cancelled = false
    const FADE_MS = 2500
    const FADE_STEPS = 20

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
            e.target.setVolume(100)
            e.target.seekTo(walkoutSong.start ?? 0, true)
            e.target.playVideo()
            let fading = false
            clearInterval(ytWatchIntervalRef.current)
            ytWatchIntervalRef.current = setInterval(() => {
              const player = ytPlayerRef.current
              if (!player) return
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
                  const v = Math.max(0, 100 * (1 - step / FADE_STEPS))
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
          },
        },
      })
    })

    return () => {
      cancelled = true
      clearInterval(ytWatchIntervalRef.current)
      try { ytPlayerRef.current?.destroy() } catch { /* already gone */ }
      ytPlayerRef.current = null
    }
    // isPreview/onAdvance intentionally excluded — both are stable for the
    // life of one mount (onAdvance is a useCallback from Display.jsx),
    // re-running this effect on their identity would remount the player.
  }, [walkoutSong?.videoId, walkoutSong?.start, walkoutSong?.end]) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="w-full h-full overflow-hidden relative select-none">
      {walkoutSong?.videoId && (
        <div
          key={`${walkoutSong.videoId}-${walkoutSong.start}-${walkoutSong.end}`}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        >
          <div ref={ytContainerRef} />
        </div>
      )}

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
      </div>

      <div style={{
        position: 'absolute',
        bottom: 40,
        left: 40,
        zIndex: 10,
        opacity: 0.7,
      }}>
        <BenPhoto size={120} />
      </div>

      <BaynesWatermark />
    </div>
  )
}
