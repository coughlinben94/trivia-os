import { useReducedMotion } from 'framer-motion'
import { SHINY_GOLD } from '../../lib/shinyGold.js'

export default function WaveformBars({ playing, barCount = 28 }) {
  const reduce = useReducedMotion()
  // Only animate while audio is actually playing (and motion is allowed).
  // When paused, the bars hold a fixed waveform silhouette rather than
  // looping an idle animation forever on a slide with no sound; that static
  // shape is also the prefers-reduced-motion fallback — still reads as audio,
  // just without perpetual motion.
  const animate = playing && !reduce
  return (
    <div className="flex items-end gap-1.5" style={{ height: 80 }}>
      {Array.from({ length: barCount }, (_, i) => {
        // Deterministic resting height per bar so the paused state looks
        // intentional rather than a flat block.
        const rest = 0.22 + 0.2 * Math.abs(Math.sin(i * 0.7))
        return (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: 5,
              height: '100%',
              background: SHINY_GOLD,
              transformOrigin: 'bottom',
              transform: animate ? undefined : `scaleY(${rest.toFixed(3)})`,
              animation: animate
                ? `waveformBar 800ms ${i * 35}ms ease-in-out infinite`
                : 'none',
            }}
          />
        )
      })}
    </div>
  )
}
