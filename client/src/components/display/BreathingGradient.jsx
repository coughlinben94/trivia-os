import { useRef, useEffect } from 'react'

// ─── Mood table ────────────────────────────────────────────────────────────
// Exact values from trivia-shiny.html artifact.
// p1-p4 = layer periods (seconds, prime-adjacent so nothing phase-locks):
//   p1 = accent glow  p2 = highlight glow  p3 = stop-shift pair  p4 = atmos wash
// accent/highlight/atmos = [lo, hi] opacity ranges.  stop = peak opacity for both stop bands.
const MOODS = {
  calm:     { p1: 35, p2: 22, p3: 19, p4: 43, accent: [0.24, 0.52], highlight: [0.04, 0.18], stop: 0.20, atmos: [0.08, 0.22] },
  warm:     { p1: 23, p2: 15, p3: 13, p4: 27, accent: [0.30, 0.62], highlight: [0.06, 0.26], stop: 0.27, atmos: [0.12, 0.30] },
  electric: { p1: 12, p2: 8,  p3: 7,  p4: 14, accent: [0.38, 0.78], highlight: [0.10, 0.34], stop: 0.35, atmos: [0.18, 0.44] },
}

// ─── Component ─────────────────────────────────────────────────────────────
// Props:
//   palette  { bg, bgDeep, accent, highlight } — drives the 4 CSS vars
//   mood     'calm' | 'warm' | 'electric' — drives period + range (default 'calm')
//
// Fills its container (position absolute, inset 0). Caller owns the frame.
// pointer-events none — background layer only.
export default function BreathingGradient({ palette, mood = 'calm' }) {
  const rootRef      = useRef(null)
  const accentRef    = useRef(null)
  const highlightRef = useRef(null)
  const stopARef     = useRef(null)
  const stopBRef     = useRef(null)
  const atmosRef     = useRef(null)
  const animsRef     = useRef([])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // Palette → CSS vars on this container so color-mix() in the gradients
    // resolves correctly without touching the document root.
    root.style.setProperty('--bg-c',        palette.bg)
    root.style.setProperty('--bg-deep-c',   palette.bgDeep)
    root.style.setProperty('--accent-c',    palette.accent)
    root.style.setProperty('--highlight-c', palette.highlight)

    // Cancel any running animations before restarting.
    animsRef.current.forEach(a => a.cancel())
    animsRef.current = []

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const m = MOODS[mood] ?? MOODS.calm

    if (reduced) {
      // Hold all layers at mid-cycle opacity — still visible, no motion.
      accentRef.current.style.opacity    = String((m.accent[0]    + m.accent[1])    / 2)
      highlightRef.current.style.opacity = String((m.highlight[0] + m.highlight[1]) / 2)
      stopARef.current.style.opacity     = String(m.stop / 2)
      stopBRef.current.style.opacity     = String(m.stop / 2)
      atmosRef.current.style.opacity     = String((m.atmos[0]     + m.atmos[1])     / 2)
      return
    }

    // Reset inline opacity so WAAPI keyframes start from the right baseline.
    ;[accentRef, highlightRef, stopARef, stopBRef, atmosRef].forEach(
      r => { r.current.style.opacity = '' }
    )

    // ease-in-out for symmetric breathing (not ease-in, which would read as
    // sluggish on the opening beat — same discipline as emit-design-eng on
    // entering elements, applied symmetrically here).
    const loop = { easing: 'ease-in-out', iterations: Infinity }

    // Layer 1 — accent radial glow, lower-center. Period p1 (longest; most visible).
    animsRef.current.push(accentRef.current.animate(
      [{ opacity: m.accent[0] }, { opacity: m.accent[1] }, { opacity: m.accent[0] }],
      { ...loop, duration: m.p1 * 1000 }
    ))

    // Layer 2 — highlight radial glow, upper area. −37% phase offset so it
    // never crests in sync with the accent glow.
    animsRef.current.push(highlightRef.current.animate(
      [{ opacity: m.highlight[0] }, { opacity: m.highlight[1] }, { opacity: m.highlight[0] }],
      { ...loop, duration: m.p2 * 1000, delay: -m.p2 * 1000 * 0.37 }
    ))

    // Layers 3+4 — stop-shift pair. Opposite phase: A fades out while B
    // fades in. Same period p3 so the bands always swap at the same rate.
    // Net effect: accent color-stop appears to drift from 44%→58%→44%.
    animsRef.current.push(stopARef.current.animate(
      [{ opacity: m.stop }, { opacity: 0 }, { opacity: m.stop }],
      { ...loop, duration: m.p3 * 1000 }
    ))
    animsRef.current.push(stopBRef.current.animate(
      [{ opacity: 0 }, { opacity: m.stop }, { opacity: 0 }],
      { ...loop, duration: m.p3 * 1000 }
    ))

    // Layer 5 — atmospheric full-field wash. −55% phase offset; longest period
    // p4 keeps it drifting slowly relative to all other layers.
    animsRef.current.push(atmosRef.current.animate(
      [{ opacity: m.atmos[0] }, { opacity: m.atmos[1] }, { opacity: m.atmos[0] }],
      { ...loop, duration: m.p4 * 1000, delay: -m.p4 * 1000 * 0.55 }
    ))

    return () => {
      animsRef.current.forEach(a => a.cancel())
      animsRef.current = []
    }
  }, [palette.bg, palette.bgDeep, palette.accent, palette.highlight, mood])

  return (
    <div
      ref={rootRef}
      aria-hidden
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {/* Layer 0 — static deep radial base. Bottom-anchored (108%) so the
          floor is always bgDeep and the background lightens toward center. */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 170% 115% at 50% 108%, var(--bg-deep-c) 0%, var(--bg-c) 52%, color-mix(in srgb, var(--bg-c) 88%, var(--bg-deep-c)) 100%)',
      }} />

      {/* Layer 5 — atmospheric full-field wash (rendered early so it sits
          behind the stop-shift bands and accent glow). */}
      <div ref={atmosRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'radial-gradient(ellipse 105% 82% at 50% 50%, color-mix(in srgb, var(--accent-c) 20%, transparent) 0%, transparent 62%)',
      }} />

      {/* Layer 3 — stop-shift A. Simulates accent stop at 44%. */}
      <div ref={stopARef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'linear-gradient(180deg, transparent 18%, color-mix(in srgb, var(--accent-c) 52%, transparent) 44%, transparent 66%)',
      }} />

      {/* Layer 4 — stop-shift B. Opposite phase: stop at 58%. */}
      <div ref={stopBRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'linear-gradient(180deg, transparent 32%, color-mix(in srgb, var(--accent-c) 52%, transparent) 58%, transparent 80%)',
      }} />

      {/* Layer 1 — accent radial glow, lower-center, slightly left. */}
      <div ref={accentRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'radial-gradient(ellipse 66% 50% at 47% 77%, var(--accent-c) 0%, color-mix(in srgb, var(--accent-c) 32%, transparent) 38%, transparent 70%)',
      }} />

      {/* Layer 2 — highlight radial glow, upper area, slightly right. */}
      <div ref={highlightRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'radial-gradient(ellipse 50% 36% at 55% 17%, color-mix(in srgb, var(--highlight-c) 72%, transparent) 0%, color-mix(in srgb, var(--highlight-c) 16%, transparent) 44%, transparent 70%)',
      }} />
    </div>
  )
}
