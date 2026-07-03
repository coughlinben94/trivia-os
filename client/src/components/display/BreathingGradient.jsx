import { useRef, useEffect } from 'react'

// ─── Mood table ────────────────────────────────────────────────────────────
// p1-p4 = layer periods (seconds, prime-adjacent so nothing phase-locks):
//   p1 = accent glow  p2 = highlight glow  p3 = stop-shift pair  p4 = atmos wash
// accent/highlight/atmos = [lo, hi] opacity ranges.  stop = peak opacity for both stop bands.
//
// Design intent for color travel:
//   lo is kept low so the field reads close to base at trough — the "empty" state.
//   hi is raised so the accent/highlight zones read unmistakably as their own color at peak.
//   Wide lo→hi delta is what creates visible migration, not speed.
//   All three moods stay proportional (warm ~17% faster/broader, electric ~50%).
const MOODS = {
  calm:     { p1: 35, p2: 22, p3: 19, p4: 43, accent: [0.10, 0.84], highlight: [0.08, 0.88], stop: 0.62, atmos: [0.16, 0.52] },
  warm:     { p1: 23, p2: 15, p3: 13, p4: 27, accent: [0.14, 0.92], highlight: [0.12, 0.94], stop: 0.74, atmos: [0.20, 0.64] },
  electric: { p1: 12, p2: 8,  p3: 7,  p4: 14, accent: [0.22, 0.97], highlight: [0.18, 0.97], stop: 0.88, atmos: [0.26, 0.78] },
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

      {/* Layer 5 — atmospheric full-field wash. Wide enough to tint the entire
          frame at peak — 120%×100% so nothing falls outside the gradient.
          color-mix raised 30%→44% so it reads as a real field tint, not a
          suggestion. This is what keeps the middle from being dead black. */}
      <div ref={atmosRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'radial-gradient(ellipse 120% 100% at 50% 50%, color-mix(in srgb, var(--accent-c) 44%, transparent) 0%, transparent 60%)',
      }} />

      {/* Layer 3 — stop-shift A. Accent band centered at 40%.
          color-mix raised 68%→85% so the band is a visible stripe, not a hint. */}
      <div ref={stopARef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'linear-gradient(180deg, transparent 14%, color-mix(in srgb, var(--accent-c) 85%, transparent) 40%, transparent 62%)',
      }} />

      {/* Layer 4 — stop-shift B. Opposite phase: band at 56%.
          Same strength so the migrating stripe looks identical as it travels. */}
      <div ref={stopBRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'linear-gradient(180deg, transparent 30%, color-mix(in srgb, var(--accent-c) 85%, transparent) 56%, transparent 76%)',
      }} />

      {/* Layer 1 — accent radial glow, lower-center. Widened to 92%×72% so it
          fills the lower half and bleeds into the middle; at peak it claims the
          entire bottom of the frame and reaches toward center. */}
      <div ref={accentRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'radial-gradient(ellipse 92% 72% at 47% 76%, var(--accent-c) 0%, color-mix(in srgb, var(--accent-c) 58%, transparent) 40%, transparent 72%)',
      }} />

      {/* Layer 2 — highlight radial glow, upper area, near center.
          Widened to 92%×72% matching the accent, anchored at 52% 14% so it
          fills the top of the frame the same way accent fills the bottom.
          Peak opacity was 0.38 (invisible) — MOODS table now drives it to 0.88+
          so this reads as a distinct second color zone unmistakably. */}
      <div ref={highlightRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'radial-gradient(ellipse 92% 72% at 52% 14%, color-mix(in srgb, var(--highlight-c) 95%, transparent) 0%, color-mix(in srgb, var(--highlight-c) 38%, transparent) 46%, transparent 70%)',
      }} />
    </div>
  )
}
