import { SHINY_GOLD_GLOW } from '../../lib/shinyGold.js'

// The universal shiny SIGNAL — gold glow burst + ✨ badge — every shiny
// question slide must carry (references/themes.md). Was hand-copied inline
// JSX across 6 display components; this is the single source of truth so it
// never drifts again. See references/themes.md "Shiny" section.
export default function ShinySignal() {
  return (
    <>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
        background: `radial-gradient(ellipse at center, ${SHINY_GOLD_GLOW}55 0%, transparent 58%)`,
        animation: 'shinyGlow 0.75s ease-out forwards',
      }} />
      <div style={{ position: 'absolute', top: 28, left: 30, zIndex: 40, fontSize: 40, filter: `drop-shadow(0 0 12px ${SHINY_GOLD_GLOW})` }}>✨</div>
    </>
  )
}
