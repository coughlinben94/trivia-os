import { useEffect, useState } from 'react'

// iPad cue card: the question to read aloud, and the answer only while a
// finger is held on the button, so a table looking over Ben's shoulder never
// sees it. Pointer capture keeps the hold alive if the finger drifts; release,
// cancel, or losing capture hides it again. Hidden state renders no answer
// text at all (not a blur), so nothing can be read off a screenshot.
export default function CueCard({ card }) {
  const [held, setHeld] = useState(false)
  // A hold must never carry onto a different question: the button can be
  // replaced or removed mid-press (Stream Deck advanced the show), and then it
  // never sees pointerup. Any change of card puts the answer away.
  const cardKey = card ? `${card.label}|${card.part?.i}|${card.text}|${card.answer}` : null
  useEffect(() => { setHeld(false) }, [cardKey])
  if (!card) return null
  const hide = () => setHeld(false)
  return (
    <section className="rounded-2xl bg-[#13261a] px-5 py-4 flex flex-col gap-3 min-h-0 min-w-0" aria-label="Cue card">
      <p className="text-[1rem] leading-6 font-semibold text-[#f5f0e8]/75">
        {[card.label, card.subtitle, card.part && `part ${card.part.i + 1} of ${card.part.n}`].filter(Boolean).join(' · ') || 'Question'}
        {card.isShiny && ' · ✨'}
      </p>
      <p className="text-3xl font-bold leading-snug [text-wrap:balance] text-[#f5f0e8]">
        {card.text || 'No question text'}
      </p>
      {card.answer && (
        <button
          type="button"
          onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); setHeld(true) }}
          onPointerUp={hide}
          onPointerCancel={hide}
          onLostPointerCapture={hide}
          onContextMenu={e => e.preventDefault()}
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
          className="select-none touch-none min-h-[72px] rounded-xl px-5 py-3 text-left text-2xl font-bold transition-colors duration-[120ms] active:bg-[#1b3324] bg-[#0a1710] text-[#f5f0e8] border-2 border-[#f5f0e8]/25"
          aria-label="Hold to see the answer"
        >
          {held ? card.answer : 'Hold to see answer'}
        </button>
      )}
    </section>
  )
}
