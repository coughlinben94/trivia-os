import { motion, useReducedMotion } from 'framer-motion'
import { DEFAULT_CHOICE_POINTS, scoreChoiceSubmission } from '../../../lib/choiceScoring.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

// One 'choice' schema type covers single-pick (Mandela Effect) and multi-pick
// (Mixology). The title slide only stamps the type, so the card shows both
// kinds side by side; the phone's caption and ○/☐ glyphs (ChoiceBoard.jsx)
// tell teams which one they're on. Synthetic text options stand in for the
// real pictures/chips. Points are host-set per slide, so only score vs 0.
const SAMPLES = [
  {
    key: 'one',
    heading: 'Pick one',
    glyph: '○',
    prompt: 'Which is spelled right?',
    options: [{ id: 'a', label: 'Neccessary' }, { id: 'b', label: 'Necessary' }],
    correctIds: ['b'],
    answers: [
      { ids: ['b'], note: 'Right pick' },
      { ids: ['a'], note: 'Wrong pick' },
    ],
  },
  {
    key: 'all',
    heading: 'Pick every one that fits',
    glyph: '☐',
    prompt: 'Which are planets?',
    options: [{ id: 'mars', label: 'Mars' }, { id: 'pluto', label: 'Pluto' }, { id: 'venus', label: 'Venus' }, { id: 'moon', label: 'The Moon' }],
    correctIds: ['mars', 'venus'],
    answers: [
      { ids: ['mars', 'venus'], note: 'All of them, nothing extra' },
      { ids: ['mars', 'venus', 'pluto'], note: 'Extra pick: Pluto' },
    ],
  },
]

export const SAMPLE_CHOICE_RESULTS = SAMPLES.map(sample => ({
  ...sample,
  answers: sample.answers.map(answer => ({
    ...answer,
    points: scoreChoiceSubmission(answer.ids, sample.correctIds, DEFAULT_CHOICE_POINTS),
  })),
}))

export default function ChoiceExplainer() {
  const reduce = useReducedMotion()
  const { theme } = useTheme()
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const enter = (delay, y = 14) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, transform: `translateY(${y}px)` },
    animate: reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' },
    transition: { duration: 0.3, delay: reduce ? 0 : delay, ease: EASE_OUT },
  })

  return (
    <div
      role="img"
      aria-label="Example: a pick-one question and a pick-every-one question. Only the exact right picks score; a wrong, missing or extra pick scores 0."
      style={{
        width: 'min(100%, 1600px)', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', gap: '4vmin',
      }}
    >
      {SAMPLE_CHOICE_RESULTS.map((sample, col) => {
        const base = 0.15 + col * 0.9
        const labelOf = id => sample.options.find(o => o.id === id).label
        return (
          <div key={sample.key} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.6vmin' }}>
            <motion.p {...enter(base)} style={{ margin: 0, fontFamily: displayFont, fontSize: 'clamp(2rem, 4vmin, 4.2rem)', lineHeight: 1, color: SHINY_GOLD }}>
              {sample.heading}
            </motion.p>
            <motion.p {...enter(base + 0.06)} style={{ margin: 0, fontSize: 'clamp(1.4rem, 2.8vmin, 2.9rem)', color: text }}>
              {sample.prompt}
            </motion.p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1vmin' }}>
              {sample.options.map((opt, i) => (
                <motion.span key={opt.id} {...enter(base + 0.12 + i * 0.05)} style={{
                  padding: '0.9vmin 2vmin', borderRadius: 999, whiteSpace: 'nowrap',
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.22)',
                  fontSize: 'clamp(1.3rem, 2.6vmin, 2.7rem)', color: text,
                }}>
                  <span aria-hidden="true" style={{ marginRight: '0.4em', opacity: 0.7 }}>{sample.glyph}</span>
                  {opt.label}
                </motion.span>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1vmin', width: '100%' }}>
              {sample.answers.map((answer, row) => {
                const scored = answer.points > 0
                return (
                  <motion.div key={answer.note} {...enter(base + 0.45 + row * 0.2, 10)} style={{
                    display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', columnGap: '1.6vmin',
                    padding: '1.1vmin 2vmin', borderRadius: 12, textAlign: 'left',
                    background: scored ? `${SHINY_GOLD}24` : 'rgba(255,255,255,0.05)',
                    outline: scored ? `2px solid ${SHINY_GOLD}aa` : 'none', outlineOffset: '-2px',
                    fontSize: 'clamp(1.3rem, 2.5vmin, 2.6rem)', color: text,
                  }}>
                    <span aria-hidden="true" style={{ fontFamily: displayFont, fontSize: '1.4em', lineHeight: 1, color: scored ? SHINY_GOLD : `${text}c8` }}>
                      {scored ? '✓' : '✗'}
                    </span>
                    <span>
                      <span style={{ display: 'block' }}>{answer.ids.map(labelOf).join(', ')}</span>
                      <span style={{ fontSize: '0.75em', color: `${text}cc` }}>{answer.note}</span>
                    </span>
                    <span style={{ fontFamily: displayFont, fontSize: '1.3em', lineHeight: 1, color: scored ? SHINY_GOLD : `${text}c8` }}>
                      {scored ? 'Scores' : '0'}
                    </span>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
