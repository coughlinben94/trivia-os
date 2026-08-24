import { STAGE_SCALE } from './stage.js'

// Centered 85%-viewport box that clips all foreground slide content.
// ParticleBackground lives outside this and remains full-viewport.
// pointer-events: none on the frame; the inner wrapper re-enables for children.
// scale=1 (fullBleed slide types — state-of-union/winner-reveal/rules, 2026-08-19:
// Ben, these were boxed inside the 85% margin with the ring bleeding through
// around them and read as broken/tiny) grows the stage to the full viewport
// so their own content reaches the true screen edges instead of just getting
// an opaque backdrop behind the same small box.
//
// DO NOT re-add a FLIP morph on the boxed<->full-bleed crossing.
// e955eb3 (2026-08-24) added an inner layer that took the inverse scale
// (oldScale/newScale) the instant this box snapped and eased it back to
// scale(1) over 500ms, so the stage would appear to grow/shrink smoothly.
// Reverted the same night, live (Ben, mid-show, on round-intro -> question:
// "the round 1 title thing like jumps, changes size a bit. not smooth").
//
// The math is only correct for content whose rendered size is PROPORTIONAL
// to this box. Almost none of it is: slide text is sized in rem/vw
// (RoundIntroSlide's round number is clamp(6rem, 20vw, 18rem), which pins to
// its 18rem cap = 288px on a 1080p TV and never moves), so the box snapping
// 1632x918 -> 1920x1080 changes nothing about how that text draws. Applying
// the inverse scale to it is not compensation, it is a brand new 15% shrink
// with a 500ms grow-back bolted onto a slide that was previously rock steady.
// Measured on the real component tree (headless, 1920x1080, live show's
// midnight-galaxy theme): the round number's line box went 259.2px -> 220.3px
// in one frame at the slide change, then crept back to 259.2px over ~520ms.
// That IS the jump Ben saw.
//
// It is wrong on the incoming slide too: a fresh slide has no "old size" to
// preserve, so the morph just makes it arrive 15% small and keep growing for
// 280ms after its own 220ms entrance has finished — a slow creep with nothing
// motivating it.
//
// No single transform can serve both content kinds (invariant vs
// proportional) — compensating one is by definition visible error on the
// other — and in this codebase invariant wins by a mile: only ShinyIntroScreen
// and OverlayLayer read cq units on the boxed side of any crossing. So the
// box snaps, as it did for the app's whole history before that commit, and
// the way to kill a crossing that DOES read badly is to stop it crossing —
// add the slide type to FULL_BLEED_SLIDE_TYPES in Display.jsx, which is what
// pre-show and team-picker already did.
export default function StageFrame({ children, scale = STAGE_SCALE }) {
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
        overflow: 'hidden',
        containerType: 'size',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
