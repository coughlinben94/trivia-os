// Easing curves per SKILL.md §20
const EASE_SNAP = [0.23, 1, 0.32, 1]

// Framer Motion variant configs — shape: { initial, animate, exit }
const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.16, ease: EASE_SNAP } },
  exit:    { opacity: 0, transition: { duration: 0.12, ease: EASE_SNAP } },
}

const registry = {
  'default':      FADE,
  'aurora-sweep': FADE, // Pure Michigan — placeholder until that theme is built
}

export function getTransition(type) {
  return registry[type] ?? registry['default']
}

export default registry
