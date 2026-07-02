import { STAGE_SCALE } from './stage.js'

// Centered 85%-viewport box that clips all foreground slide content.
// ParticleBackground lives outside this and remains full-viewport.
// pointer-events: none on the frame; the inner wrapper re-enables for children.
export default function StageFrame({ children }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        '--stage-scale': STAGE_SCALE,
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
