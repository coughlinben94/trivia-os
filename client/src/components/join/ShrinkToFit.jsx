import { useRef } from 'react'
import { useShrinkToFit } from '../../hooks/useShrinkToFit.js'

// Height-fit wrapper for the /join answer boards (Wager/Choice/Matching/
// Order/Bendle). The outer box takes whatever height the carousel hands it
// (the flex chain from .join-content down in Join.jsx's LiveView); the
// content is pulled out of flow so its natural height can never prop the
// outer box open, then scaled down to fit — WYSIWYG by construction, the
// same idea as host/SlideCanvasEditor.jsx's scaled canvas.
//
// `disabled` renders children bare: SlideEditor's phone preview mounts
// boards in a plain block, where an out-of-flow child would collapse the
// box to zero height.
export default function ShrinkToFit({ children, disabled = false }) {
  const outerRef = useRef(null)
  const contentRef = useRef(null)
  const k = useShrinkToFit(outerRef, contentRef, !disabled)
  if (disabled) return children
  return (
    <div ref={outerRef} style={{ position: 'relative', flex: '1 0 auto' }}>
      <div
        ref={contentRef}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          transform: `scale(${k})`, transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </div>
  )
}
