import { STAGE_SCALE } from './stage.js'

// Centered 85%-viewport box that clips all foreground slide content.
// ParticleBackground lives outside this and remains full-viewport.
// pointer-events: none on the frame; the inner wrapper re-enables for children.
// scale=1 (fullBleed slide types — state-of-union/winner-reveal/rules, 2026-08-19:
// Ben, these were boxed inside the 85% margin with the ring bleeding through
// around them and read as broken/tiny) grows the stage to the full viewport
// so their own content reaches the true screen edges instead of just getting
// an opaque backdrop behind the same small box.
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
