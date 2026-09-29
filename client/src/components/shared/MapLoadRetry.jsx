// client/src/components/shared/MapLoadRetry.jsx
import { useEffect, useState } from 'react'
import { retryUsMapData } from '../../hooks/useUsMapData.js'

// Overlay for a Pin It map box (parent must be position: relative). If the
// outline data is still missing after `delayMs`, offer a 44px retry tap
// (or, with retry={false} on a TV, plain "Map unavailable" text).
export default function MapLoadRetry({ states, ink = '#ffffff', delayMs = 4000, retry = true }) {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (states) { setLate(false); return }
    const id = setTimeout(() => setLate(true), delayMs)
    return () => clearTimeout(id)
  }, [states, delayMs])
  if (states || !late) return null
  // A TV cannot be tapped: show plain text there (retry={false}).
  if (!retry) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: `${ink}99`, fontSize: '1.6rem' }}>
        Map unavailable
      </div>
    )
  }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button
        type="button"
        onPointerDown={e => e.stopPropagation()}
        onClick={() => { setLate(false); retryUsMapData() }}
        style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, border: `1px solid ${ink}55`, background: 'rgba(0,0,0,0.45)', color: ink, fontSize: 16, fontWeight: 700 }}
      >Map didn't load. Tap to retry</button>
    </div>
  )
}
