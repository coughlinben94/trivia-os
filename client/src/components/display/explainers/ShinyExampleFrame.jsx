import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

export default function ShinyExampleFrame({ action, scoring = [], children }) {
  const { theme } = useTheme()
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '4vmin 5.5vmin 3.4vmin', gap: '1.7vmin',
      overflow: 'hidden', color: theme.colors.text, textAlign: 'center',
      fontFamily: bodyFont,
    }}>
      {action && (
        <p style={{
          margin: 0, maxWidth: '88%', fontFamily: displayFont,
          fontSize: 'clamp(2rem, 3.7vmin, 4.5rem)', lineHeight: 1.08,
          color: theme.colors.text, textWrap: 'balance',
        }}>
          {action}
        </p>
      )}

      {scoring.length > 0 && (
        <div style={{
          width: 'min(100%, 1500px)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: '0.55vmin', padding: '1.2vmin 1.5vmin',
          borderTop: `1px solid ${SHINY_GOLD}66`, borderBottom: `1px solid ${SHINY_GOLD}66`,
        }}>
          {scoring.map((line, index) => (
            <p key={line} style={{
              margin: 0, fontSize: index === 0 ? 'clamp(1.35rem, 2.35vmin, 2.65rem)' : 'clamp(1.1rem, 1.8vmin, 2rem)',
              lineHeight: 1.2, color: index === 0 ? SHINY_GOLD : `${theme.colors.text}d9`,
              textShadow: index === 0 ? `0 0 2vmin ${SHINY_GOLD_GLOW}66` : 'none',
              textWrap: 'balance', fontVariantNumeric: 'tabular-nums',
            }}>
              {line}
            </p>
          ))}
        </div>
      )}

      <div style={{
        width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '0.8vmin',
      }}>
        <div style={{
          flex: '0 0 auto', color: `${theme.colors.text}b8`, fontSize: 'clamp(1rem, 1.7vmin, 1.65rem)',
          letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700,
        }}>
          Example
        </div>
        <div style={{
          position: 'relative', width: '100%', flex: 1, minHeight: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}
