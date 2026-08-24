import { useLayoutEffect, useRef } from 'react'
import { STAGE_SCALE } from './stage.js'
import { EASE_BAR } from '../lib/easings.js'

// How long the visual scale morph takes when the stage crosses the
// boxed (85%) <-> full-bleed (100%) boundary. Spans the slide crossfade it
// runs under (exits 0.14-0.3s + enters 0.22-0.6s, SlideRenderer's
// SLIDE_ANIMATIONS) so the size change reads as part of that transition
// instead of a separate event. EASE_BAR: this is an on-screen morph, not an
// enter/exit — ease-in-out territory, not EASE_OUT.
const MORPH_MS = 500

// Centered 85%-viewport box that clips all foreground slide content.
// ParticleBackground lives outside this and remains full-viewport.
// pointer-events: none on the frame; the inner wrapper re-enables for children.
// scale=1 (fullBleed slide types — state-of-union/winner-reveal/rules, 2026-08-19:
// Ben, these were boxed inside the 85% margin with the ring bleeding through
// around them and read as broken/tiny) grows the stage to the full viewport
// so their own content reaches the true screen edges instead of just getting
// an opaque backdrop behind the same small box.
//
// TWO nested layers since 2026-08-24 (Ben: crossing the boxed<->full-bleed
// boundary "just pops to its new size" — no transition ever ran on it):
//
//   OUTER — the real layout box. Snaps to the new size instantly, on purpose:
//   it carries `containerType: size`, and slide components everywhere size
//   themselves in cqh/cqw against it (PreShowSlide's 38cqh photo,
//   ScoreboardOverlay, QuestionSlide...). Container queries read the LAYOUT
//   box — a transform never changes it — so this element must never be the
//   thing that animates, or every cq-sized child silently measures the wrong
//   stage. It also must not animate width/height: this repo's animation law
//   is GPU-only, transform/opacity, never layout properties (references/
//   themes.md; ring-world-mistakes.md has the receipts).
//
//   INNER — the visual morph layer, and the clip (overflow:hidden moved here
//   from the outer so the clip boundary scales WITH the morph — clipping
//   happens in the clipping element's own coordinate space, so on the
//   full -> boxed leg, where the compensating scale starts >1, content still
//   paints out to the old full-viewport edge instead of being pre-clipped at
//   the new 85% box). FLIP: the instant the outer snaps, this layer gets the
//   inverse scale (oldScale/newScale) with no transition — visually nothing
//   moved, cq children are laid out at the new size but drawn at the old one
//   — then releases to scale(1) under a transform transition. transform-only,
//   compositor-driven, interruptible (a rapid boundary re-cross retargets
//   mid-flight instead of restarting).
export default function StageFrame({ children, scale = STAGE_SCALE }) {
  const morphRef = useRef(null)
  const prevScaleRef = useRef(scale)

  useLayoutEffect(() => {
    const prev = prevScaleRef.current
    prevScaleRef.current = scale
    if (prev === scale) return
    const el = morphRef.current
    if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // Reduced motion keeps the pre-2026-08-24 behavior: an instant snap.
      el.style.transition = 'none'
      el.style.transform = 'scale(1)'
      return
    }
    // Retarget from wherever the morph visually IS right now, not from
    // where the last one would have ended — a rapid re-cross of the boundary
    // (host taps Prev mid-morph) interrupts an in-flight transition, and
    // assuming scale(1) there would visibly jump before re-animating.
    // Computed transform serializes as matrix(a, b, c, d, tx, ty); `a` is
    // the current scaleX (this element only ever carries uniform scale).
    const m = getComputedStyle(el).transform
    const cur = m && m.startsWith('matrix(') ? parseFloat(m.slice(7)) || 1 : 1
    el.style.transition = 'none'
    el.style.transform = `scale(${cur * prev / scale})`
    void el.offsetWidth // commit the compensating scale before the release below can transition
    el.style.transition = `transform ${MORPH_MS}ms cubic-bezier(${EASE_BAR.join(',')})`
    el.style.transform = 'scale(1)'
  }, [scale])

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        '--stage-scale': scale,
        width: 'calc(100vw * var(--stage-scale))',
        height: 'calc(100vh * var(--stage-scale))',
        containerType: 'size',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <div
        ref={morphRef}
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', transform: 'scale(1)' }}
      >
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
