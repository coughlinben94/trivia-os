import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { THEMES, getTheme } from '../themes/index.js'
import ParticleBackground from '../components/display/ParticleBackground.jsx'
import RingAmbient from '../components/display/RingAmbient.jsx'
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'
import { recolorWorld } from '../lib/ringRecolor.js'

export default function AmbientAudit() {
  const [params] = useSearchParams()
  const themeId = params.get('theme')
  const theme = themeId ? getTheme(themeId) : null
  const ringMode = params.get('ring') === '1'
  const ringRef = useRef(null)
  // ?colors=%23ff2200,%23ffd400&weights=0.55,0.45 — same recolorWorld the
  // app and the CLI script use, synced with world-07-ring.html's own
  // ?colors= handling. No colors param -> the authored base, unchanged.
  // Keyed on the raw query string so a param edit recomputes without
  // re-running on every unrelated render.
  const searchString = params.toString()
  const ringWorldData = useMemo(() => {
    const colorsParam = params.get('colors')
    if (!colorsParam) return midnightGalaxyRing
    const weightsParam = params.get('weights')
    const driftParam = params.get('drift')
    try {
      return recolorWorld(midnightGalaxyRing, {
        colors: colorsParam.split(','),
        weights: weightsParam ? weightsParam.split(',').map(Number) : undefined,
        drift: driftParam ? { arc: Number(driftParam) } : undefined,
      }, getTheme('midnight-galaxy'))
    } catch (err) {
      console.warn('[AmbientAudit] bad ?colors= palette, using base:', err.message)
      return midnightGalaxyRing
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchString])
  // Display-only counter — independent of RingAmbient's own internal
  // station ref, so clicking Turn re-renders THIS button without ever
  // passing a station-shaped prop into RingAmbient (which must never
  // re-render/remount; see that component's own header comment).
  const [displayStation, setDisplayStation] = useState(0)
  const stationCount = ringWorldData.stations.length
  // Auto-play: walk the ring on a timer, exactly like a show would move
  // slide-to-slide, so a person can just watch it turn instead of clicking
  // 13 times — off by default, same manual Turn button still works.
  const [autoPlay, setAutoPlay] = useState(false)

  useEffect(() => {
    if (!ringMode || !autoPlay) return
    const id = setInterval(() => {
      ringRef.current?.turn()
      setDisplayStation(ringRef.current?.station ?? 0)
    }, 4000)
    return () => clearInterval(id)
  }, [ringMode, autoPlay])

  if (ringMode) {
    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: '#000' }}>
        <RingAmbient ref={ringRef} worldData={ringWorldData} />
        <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 30, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => {
              setAutoPlay(false)
              ringRef.current?.turn()
              setDisplayStation(ringRef.current?.station ?? 0)
            }}
            style={{ padding: '10px 20px' }}
          >
            Turn ▶ (station {displayStation} / {stationCount})
          </button>
          <button
            onClick={() => setAutoPlay(p => !p)}
            style={{ padding: '10px 20px', background: autoPlay ? '#2a6' : undefined }}
          >
            {autoPlay ? '⏸ Pause auto-play' : '▶ Auto-play (4s/station)'}
          </button>
        </div>
      </div>
    )
  }

  if (theme) {
    return (
      <div
        style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: theme.colors.bg }}
        data-theme-id={theme.id}
        data-theme-ready="true"
      >
        <ParticleBackground theme={theme} />
        <div style={{
          position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)',
          fontFamily: "'Boogaloo', sans-serif", fontSize: '3rem', color: theme.colors.text,
          textShadow: '0 2px 12px rgba(0,0,0,0.6)', whiteSpace: 'nowrap', zIndex: 20,
          letterSpacing: '-0.02em',
        }}>
          {theme.name}
        </div>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          fontFamily: "'DM Sans', sans-serif", fontSize: '1.25rem', color: `${theme.colors.text}70`,
          textAlign: 'center', zIndex: 20, maxWidth: '60ch',
          lineHeight: 1.5,
        }}>
          What is the capital of France?
        </div>
      </div>
    )
  }

  // Index — show all theme links
  return (
    <div style={{ background: '#111', minHeight: '100vh', padding: '2rem', fontFamily: 'monospace' }}>
      <h1 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '1.2rem' }}>Theme Audit — {THEMES.length} themes</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        {THEMES.map(t => (
          <a key={t.id} href={`/ambient?theme=${t.id}`}
            style={{ color: '#aef', textDecoration: 'none', padding: '0.5rem', background: '#222', borderRadius: 4 }}>
            {t.id}
          </a>
        ))}
      </div>
    </div>
  )
}
