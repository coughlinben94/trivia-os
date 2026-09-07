import { useRef, useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

// Brief format-name beat on a shiny group's first content slide — replaces
// the standalone shiny-title slide as a "dead Next press" for a forward
// advance (see slideStepping.js's skip-forward and its history comment).
// Mount-scoped only: a useRef gate means this never replays on a re-render
// of the same slide instance (answer reveal toggling, etc), only on a
// genuinely fresh mount.
//
// Reduced-motion: verified 2026-09-07 that the project's global
// prefers-reduced-motion CSS (client/src/index.css) only guards specific
// `animation`/`@keyframes` selectors, never a bare `transition` — every
// other component in this codebase (QuestionSlide, GridSlide, etc.) guards
// its own CSS transitions individually via framer-motion's
// useReducedMotion(), so this does the same rather than relying on a global
// rule that doesn't exist for this case.
export default function ShinyGroupAnnounce({ name, icon }) {
  const played = useRef(false)
  const [visible, setVisible] = useState(false)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (reduce || played.current) return
    played.current = true
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 1200)
    return () => clearTimeout(t)
  }, [reduce])

  if (!name || reduce) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: '6%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease',
        pointerEvents: 'none',
      }}
    >
      {icon && <span style={{ fontSize: '1.4rem' }}>{icon}</span>}
      <span style={{
        fontFamily: "'Boogaloo', sans-serif",
        fontSize: '1.1rem',
        color: '#f9e2a8',
        letterSpacing: '0.02em',
      }}>{name}</span>
    </div>
  )
}
