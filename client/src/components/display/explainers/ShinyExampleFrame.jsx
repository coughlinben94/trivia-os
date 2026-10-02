import { useLayoutEffect, useRef, useState } from 'react'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

// TV-first sizes, read from 15-20ft on a 1080p set. The action headline is the
// biggest text on the card; example headings stay at or under ~3.4vmin and no
// example text goes below ~2.2vmin.
export const FRAME_TEXT = Object.freeze({
  action: 'clamp(2.2rem, 4.4vmin, 5rem)',
  scoringFirst: 'clamp(1.8rem, 3.2vmin, 3.6rem)',
  scoringRest: 'clamp(1.5rem, 2.7vmin, 3rem)',
  label: 'clamp(1.1rem, 2.2vmin, 2.4rem)',
})

// Scale (never above 1) that fits the example block's natural height into the
// space left under the rules text. Static, transform-only; it only kicks in
// when the copy wraps more than planned or the screen is short (e.g. 720p),
// so nothing is ever clipped by the frame's overflow:hidden.
function useFitScale(outerRef, contentRef) {
  const [k, setK] = useState(1)
  useLayoutEffect(() => {
    const outer = outerRef.current
    const content = contentRef.current
    if (!outer || !content || typeof ResizeObserver === 'undefined') return
    const recompute = () => {
      const avail = outer.clientHeight
      const natural = content.offsetHeight
      if (avail && natural) setK(Math.min(1, avail / natural))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(outer)
    ro.observe(content)
    return () => ro.disconnect()
  }, [outerRef, contentRef])
  return k
}

export default function ShinyExampleFrame({ action, scoring = [], children }) {
  const { theme } = useTheme()
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const outerRef = useRef(null)
  const contentRef = useRef(null)
  const k = useFitScale(outerRef, contentRef)

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '3.6vmin 5vmin 3vmin', gap: '1.6vmin',
      overflow: 'hidden', color: theme.colors.text, textAlign: 'center',
      fontFamily: bodyFont,
    }}>
      {action && (
        <p style={{
          margin: 0, maxWidth: 'min(88%, 46ch)', fontFamily: displayFont,
          fontSize: FRAME_TEXT.action, lineHeight: 1.08,
          color: theme.colors.text, textWrap: 'balance',
        }}>
          {action}
        </p>
      )}

      {scoring.length > 0 && (
        <div style={{
          width: 'min(100%, 1600px)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: '0.6vmin', padding: '1.1vmin 1.5vmin',
          borderTop: `1px solid ${SHINY_GOLD}66`, borderBottom: `1px solid ${SHINY_GOLD}66`,
        }}>
          {scoring.map((line, index) => (
            <p key={line} style={{
              margin: 0, fontSize: index === 0 ? FRAME_TEXT.scoringFirst : FRAME_TEXT.scoringRest,
              lineHeight: 1.18, color: index === 0 ? SHINY_GOLD : `${theme.colors.text}e6`,
              textShadow: index === 0 ? `0 0 2vmin ${SHINY_GOLD_GLOW}66` : 'none',
              textWrap: 'balance', fontVariantNumeric: 'tabular-nums',
            }}>
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Label + example are one block, centered in the space that's left,
          so the label always sits right on top of the example. */}
      <div ref={outerRef} style={{ position: 'relative', width: '100%', flex: '1 1 0', minHeight: 0 }}>
        <div ref={contentRef} style={{
          position: 'absolute', left: 0, right: 0, top: '50%',
          transform: `translateY(-50%) scale(${k})`, transformOrigin: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.4vmin',
        }}>
          <div style={{
            color: `${theme.colors.text}c8`, fontSize: FRAME_TEXT.label, lineHeight: 1.1,
            letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700,
          }}>
            Example
          </div>
          <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
