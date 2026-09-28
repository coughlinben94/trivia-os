import { useEffect, useState } from 'react'

// Stream Deck keys are keyboard presses, and they land on whichever window has
// focus. Clicking the TV window to unlock its sound moves focus there, and
// then presses step the show from the TV (no answer lock, no scoring) while
// the laptop's next press works from a stale slide. Nothing on screen said so.
// Polling document.hasFocus() is steadier than blur events alone. It floats over
// the page (fixed) so the host layout never jumps when focus leaves.
export default function FocusWarning() {
  const [focused, setFocused] = useState(() => document.hasFocus())
  useEffect(() => {
    const check = () => setFocused(document.hasFocus())
    const id = setInterval(check, 750)
    window.addEventListener('focus', check)
    window.addEventListener('blur', check)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', check)
      window.removeEventListener('blur', check)
    }
  }, [])
  if (focused) return null
  return (
    <div
      role="alert"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 bg-red-600 text-white text-center text-sm font-bold py-2 px-4 shadow-lg"
    >
      Stream Deck and arrow keys are going to another window, not this one. Click anywhere here first.
    </div>
  )
}
