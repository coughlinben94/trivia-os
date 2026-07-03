import { useRef, useLayoutEffect } from 'react'

// ─── Mood table ────────────────────────────────────────────────────────────
// p1-p4 = layer periods (seconds, prime-adjacent so nothing phase-locks):
//   p1 = accent glow  p2 = highlight glow  p3 = stop-band glide  p4 = atmos wash
// accent/highlight/atmos = [lo, hi] opacity ranges.
// stop = constant base opacity of the single gliding stop-band layer (it
//   moves via transform, not opacity — see Layer 3 below).
//
// Design intent for color travel:
//   lo is kept low so the field reads close to base at trough — the "empty" state.
//   hi is raised enough that the accent/highlight zones read as their own color
//   at peak, but stop short of a near-solid flash — a slow tide, not a strobe.
//   All three moods stay proportional (warm hi values ~+15%, electric ~+30%
//   over calm's hi values; stop is given directly per mood).
const MOODS = {
  calm:     { p1: 35, p2: 22, p3: 19, p4: 43, accent: [0.14, 0.55], highlight: [0.10, 0.45], stop: 0.30, atmos: [0.14, 0.38] },
  warm:     { p1: 23, p2: 15, p3: 13, p4: 27, accent: [0.16, 0.63], highlight: [0.12, 0.52], stop: 0.40, atmos: [0.16, 0.44] },
  electric: { p1: 12, p2: 8,  p3: 7,  p4: 14, accent: [0.18, 0.72], highlight: [0.13, 0.59], stop: 0.50, atmos: [0.18, 0.49] },
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
  const stopBandRef  = useRef(null)
  const atmosRef     = useRef(null)
  const animsRef     = useRef([])

  // useLayoutEffect, not useEffect: these custom properties gate what every
  // gradient stop below resolves to, and none of the var() calls carry a
  // fallback. useEffect runs after the browser paints, so on mount (e.g.
  // clicking between slides in the editor's instant, non-cross-fading
  // preview) there's a guaranteed first frame where --accent-c etc. are
  // unset — an unresolvable var() with no fallback invalidates the whole
  // `background` declaration, so every layer paints fully transparent and
  // whatever sits behind the preview (the show's actual theme) shows through
  // for a frame before this fires and the real RWB palette snaps in.
  // useLayoutEffect runs synchronously after DOM mutation but before paint,
  // closing that gap.
  useLayoutEffect(() => {
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
      atmosRef.current.style.opacity     = String((m.atmos[0]     + m.atmos[1])     / 2)
      stopBandRef.current.style.opacity   = String(m.stop)
      stopBandRef.current.style.transform = 'translateY(0%)'
      return
    }

    // Reset inline opacity so WAAPI keyframes start from the right baseline.
    // stopBandRef is excluded — its opacity is a constant (set directly
    // below), only its transform is WAAPI-animated.
    ;[accentRef, highlightRef, atmosRef].forEach(
      r => { r.current.style.opacity = '' }
    )
    stopBandRef.current.style.opacity = String(m.stop)

    // Per-keyframe easing, not shared options easing: easing on the *options*
    // object eases the WHOLE iteration as one curve, so velocity peaks at the
    // 50% mark — exactly where opacity/position also peaks. Every breath hit
    // its crest at max speed and reversed instantly (a sharp V — reads as a
    // throb/pulse-snap). Putting 'ease-in-out' on each keyframe instead eases
    // each *segment* (lo→hi, then hi→lo) independently, so velocity is zero
    // at both the crest and the trough — a rounded, sine-like breath.
    const loop = { iterations: Infinity }

    // Layer 1 — accent radial glow, lower-center. Period p1 (longest; most visible).
    animsRef.current.push(accentRef.current.animate(
      [
        { opacity: m.accent[0], easing: 'ease-in-out' },
        { opacity: m.accent[1], easing: 'ease-in-out' },
        { opacity: m.accent[0] },
      ],
      { ...loop, duration: m.p1 * 1000 }
    ))

    // Layer 2 — highlight radial glow, upper area. −37% phase offset so it
    // never crests in sync with the accent glow.
    animsRef.current.push(highlightRef.current.animate(
      [
        { opacity: m.highlight[0], easing: 'ease-in-out' },
        { opacity: m.highlight[1], easing: 'ease-in-out' },
        { opacity: m.highlight[0] },
      ],
      { ...loop, duration: m.p2 * 1000, delay: -m.p2 * 1000 * 0.37 }
    ))

    // Layer 3 — stop-band glide. A single band physically translates between
    // the two positions the old crossfading A/B pair used to simulate (40%
    // and 56% of the frame height) via transform: translateY(±8%), instead of
    // two static bands fading in and out in place. Opacity stays constant
    // (m.stop, set above) — only transform animates, so this is a real
    // migration you can track with your eye, not a blink between two fixed
    // stripes.
    animsRef.current.push(stopBandRef.current.animate(
      [
        { transform: 'translateY(-8%)', easing: 'ease-in-out' },
        { transform: 'translateY(8%)',  easing: 'ease-in-out' },
        { transform: 'translateY(-8%)' },
      ],
      { ...loop, duration: m.p3 * 1000 }
    ))

    // Layer 5 — atmospheric full-field wash. −55% phase offset; longest period
    // p4 keeps it drifting slowly relative to all other layers.
    animsRef.current.push(atmosRef.current.animate(
      [
        { opacity: m.atmos[0], easing: 'ease-in-out' },
        { opacity: m.atmos[1], easing: 'ease-in-out' },
        { opacity: m.atmos[0] },
      ],
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
          frame at peak — 120%×100% so nothing falls outside the gradient. */}
      <div ref={atmosRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'radial-gradient(ellipse 120% 100% at 50% 50%, color-mix(in srgb, var(--accent-c) 44%, transparent) 0%, transparent 60%)',
      }} />

      {/* Layer 3 — stop-band glide. Single band, statically centered at 48%
          (the midpoint of the old A/B pair's 40%/56% peaks) — transform carries
          it the rest of the way each direction. transform+opacity only. */}
      <div ref={stopBandRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'transform',
        background: 'linear-gradient(180deg, transparent 22%, color-mix(in srgb, var(--accent-c) 85%, transparent) 48%, transparent 74%)',
      }} />

      {/* Layer 1 — accent radial glow, lower-center. Widened to 92%×72% so it
          fills the lower half and bleeds into the middle; at peak it claims the
          entire bottom of the frame and reaches toward center. */}
      <div ref={accentRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'radial-gradient(ellipse 92% 72% at 47% 76%, var(--accent-c) 0%, color-mix(in srgb, var(--accent-c) 58%, transparent) 40%, transparent 72%)',
      }} />

      {/* Layer 2 — highlight radial glow, upper area, near center. Widened to
          92%×72% matching the accent, anchored at 52% 14% so it fills the top
          of the frame the same way accent fills the bottom. Core softened to
          70% color-mix (was 95%) so peak reads as a clear color zone, not a
          near-solid flash. */}
      <div ref={highlightRef} style={{
        position: 'absolute', inset: 0, opacity: 0, willChange: 'opacity',
        background: 'radial-gradient(ellipse 92% 72% at 52% 14%, color-mix(in srgb, var(--highlight-c) 70%, transparent) 0%, color-mix(in srgb, var(--highlight-c) 38%, transparent) 46%, transparent 70%)',
      }} />
    </div>
  )
}
