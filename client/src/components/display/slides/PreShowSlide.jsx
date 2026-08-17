import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import ParticleBackground from '../ParticleBackground.jsx'
import BaynesWatermark from '../BaynesWatermark.jsx'
import BenPhoto from '../../shared/BenPhoto.jsx'
import { supabase } from '../../../lib/supabase.js'
import { loadYoutubeIframeApi } from '../../host/YoutubeClipEditor.jsx'

// Same QR-join screen the show already shows automatically before it goes
// live (Display.jsx's PreShowScreen) — ported here as an addable, orderable
// slide so it's not just a one-time pre-show gate. Host can place it as the
// first slide, or return to it any time (e.g. a late-arriving team scans
// while the show is already running a round).
export default function PreShowSlide({ slide, show }) {
  const { theme } = useTheme()
  const [teams, setTeams] = useState([])
  const [qrDataUrl, setQrDataUrl] = useState(null)

  // Walkout song — a {videoId, start, end} clip (same shape/editor as shiny
  // audio questions), looped for as long as this slide is up. No visible
  // player, no host play/pause button — it's ambient, not a question.
  const walkoutSong = slide?.data?.walkoutSong
  const ytContainerRef = useRef(null)
  const ytPlayerRef = useRef(null)
  const ytLoopIntervalRef = useRef(null)

  useEffect(() => {
    if (!walkoutSong?.videoId) return
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
            e.target.seekTo(walkoutSong.start ?? 0, true)
            e.target.playVideo()
            clearInterval(ytLoopIntervalRef.current)
            ytLoopIntervalRef.current = setInterval(() => {
              const t = ytPlayerRef.current?.getCurrentTime?.() ?? 0
              const clipEnd = walkoutSong.end ?? ytPlayerRef.current?.getDuration?.() ?? Infinity
              if (clipEnd && t >= clipEnd) {
                ytPlayerRef.current.seekTo(walkoutSong.start ?? 0, true)
              }
            }, 250)
          },
        },
      })
    })

    return () => {
      cancelled = true
      clearInterval(ytLoopIntervalRef.current)
      try { ytPlayerRef.current?.destroy() } catch { /* already gone */ }
      ytPlayerRef.current = null
    }
  }, [walkoutSong?.videoId, walkoutSong?.start, walkoutSong?.end])

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
    <div className="w-full h-full overflow-hidden relative select-none">
      <ParticleBackground theme={theme} />

      {walkoutSong?.videoId && (
        <div
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
