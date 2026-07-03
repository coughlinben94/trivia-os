// TEMPORARY dev harness — verify BreathingGradient before wiring into themes.
// Route: /gradient   Remove once the theme collapse is done.
import { useState } from 'react'
import BreathingGradient from '../components/display/BreathingGradient.jsx'

// Hex values pulled verbatim from themes/index.js
const PALETTES = {
  'pure-michigan':   { bg: '#020d12', bgDeep: '#010810', accent: '#1a6b4a', highlight: '#4dffc3' },
  'midnight-galaxy': { bg: '#08001a', bgDeep: '#040010', accent: '#4a1a8f', highlight: '#c060ff' },
  'autumn-harvest':  { bg: '#1a0800', bgDeep: '#0e0400', accent: '#7a2808', highlight: '#ff6820' },
}

const MOODS = ['calm', 'warm', 'electric']

const LABELS = {
  'pure-michigan':   'Pure Michigan',
  'midnight-galaxy': 'Midnight Galaxy',
  'autumn-harvest':  'Autumn Harvest',
}

export default function GradientAudit() {
  const [themeId, setThemeId] = useState('pure-michigan')
  const [mood, setMood] = useState('calm')

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <BreathingGradient palette={PALETTES[themeId]} mood={mood} />

      {/* Controls overlay */}
      <div style={{
        position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 100, padding: '8px 20px',
        zIndex: 100, whiteSpace: 'nowrap',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginRight: 8, fontFamily: 'DM Sans, sans-serif' }}>
          Theme
        </span>
        {Object.keys(PALETTES).map(id => (
          <button
            key={id}
            onClick={() => setThemeId(id)}
            style={{
              padding: '5px 14px', borderRadius: 100,
              border: `1px solid ${themeId === id ? 'rgba(255,255,255,0.18)' : 'transparent'}`,
              background: themeId === id ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: themeId === id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.38)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              transition: 'background 150ms, border-color 150ms, color 150ms',
            }}
          >
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: PALETTES[id].highlight, marginRight: 6, verticalAlign: 'middle',
            }} />
            {LABELS[id]}
          </button>
        ))}

        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', margin: '0 8px' }} />

        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginRight: 8, fontFamily: 'DM Sans, sans-serif' }}>
          Mood
        </span>
        {MOODS.map(m => (
          <button
            key={m}
            onClick={() => setMood(m)}
            style={{
              padding: '5px 14px', borderRadius: 100,
              border: `1px solid ${mood === m ? 'rgba(255,255,255,0.18)' : 'transparent'}`,
              background: mood === m ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: mood === m ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.38)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              transition: 'background 150ms, border-color 150ms, color 150ms',
              textTransform: 'capitalize',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Label */}
      <div style={{
        position: 'absolute', top: 28, left: '50%', transform: 'translateX(-50%)',
        fontFamily: "'Boogaloo', sans-serif", fontSize: '2.2rem',
        color: PALETTES[themeId].highlight,
        textShadow: '0 2px 16px rgba(0,0,0,0.7)',
        zIndex: 10, letterSpacing: '-0.01em', pointerEvents: 'none',
      }}>
        {LABELS[themeId]} · {mood}
      </div>
    </div>
  )
}
