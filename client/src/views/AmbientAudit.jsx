import { useSearchParams } from 'react-router-dom'
import { THEMES, getTheme } from '../themes/index.js'
import ParticleBackground from '../components/display/ParticleBackground.jsx'
import BaynesWatermark from '../components/display/BaynesWatermark.jsx'

export default function AmbientAudit() {
  const [params] = useSearchParams()
  const themeId = params.get('theme')
  const theme = themeId ? getTheme(themeId) : null

  if (theme) {
    return (
      <div
        style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: theme.colors.bg }}
        data-theme-id={theme.id}
        data-theme-ready="true"
      >
        <ParticleBackground theme={theme} />
        <BaynesWatermark />
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
