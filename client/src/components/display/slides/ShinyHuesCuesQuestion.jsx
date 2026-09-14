import { useReducedMotion } from 'framer-motion'
import { getHuesCuesCell } from '../../../lib/huesCuesGrid.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { EASE_OUT, EASE_DROP } from '../../../lib/easings.js'
import { AnswersLockedBadge } from '../LockCountdownOverlay.jsx'

// The TV side of Hues and Cues. Mirrors ShinyWagerQuestion's beat structure
// (waiting -> locked -> reveal), minus wager's separate blind-tier phase:
//   1. Waiting  — clue text only. The color grid + pan/zoom picker live on
//      the phone (Task 5) — that's the priority surface for this mechanic
//      (Ben, 2026-09-14: "the phone display is the a1 priorityy" / "its
//      where i display the question"), so the TV just shows the clue the
//      same generic way it does for every other slide type. No grid, no
//      submitted-count polling here.
//   2. Locked   — held after "lock guesses" until the host presses A to reveal.
//   3. Reveal   — the answer code, then its swatch, then who was close.
export default function ShinyHuesCuesQuestion({ slide, show, theme }) {
  const { data } = slide
  const locked = !!data.huesCuesLocked
  const revealed = !!data.huesCuesRevealed
  const shouldReduceMotion = useReducedMotion()

  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`

  if (revealed) {
    return <HuesCuesReveal data={data} theme={theme} shouldReduceMotion={shouldReduceMotion} />
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '2rem 3rem', gap: '1.25rem', overflow: 'hidden',
    }}>
      {data.text && (
        <p style={{ margin: 0, textAlign: 'center', maxWidth: 1200, fontFamily: bodyFont, fontSize: '1.4rem', lineHeight: 1.35, color: `${theme.colors.text}80` }}>
          {data.text}
        </p>
      )}

      {locked && <AnswersLockedBadge theme={theme} />}
    </div>
  )
}

// The payoff: the code lands first, the color swatch beneath it (per Ben's
// explicit call — flash the code, then the color, not dots-only), then each
// team's guess and how close it landed, cascading in the order the host
// would read them out loud. Structurally the same beat sequence as
// ShinyWagerQuestion's reveal (EASE_DROP land, staggered EASE_OUT rows).
function HuesCuesReveal({ data, theme, shouldReduceMotion }) {
  const results = data.huesCuesResults ?? []
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const twoCol = results.length > 8
  const answerCell = getHuesCuesCell(data.answer)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '3rem 4rem', gap: '1.75rem',
    }}>
      {data.text && (
        <p style={{ margin: 0, textAlign: 'center', maxWidth: 1200, fontFamily: bodyFont, fontSize: '1.4rem', lineHeight: 1.35, color: `${text}80` }}>
          {data.text}
        </p>
      )}

      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.94)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        transition={{ duration: 0.32, ease: EASE_DROP }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
      >
        <span style={{ fontFamily: bodyFont, fontSize: '1.15rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: `${text}60` }}>
          The answer
        </span>
        <span style={{ fontFamily: displayFont, fontSize: '6rem', lineHeight: 1, color: SHINY_GOLD, textShadow: `0 0 30px ${SHINY_GOLD_GLOW}77` }}>
          {data.answer ?? '—'}
        </span>
        <div style={{
          width: 80, height: 80, borderRadius: 12,
          background: answerCell?.hex ?? 'transparent',
          border: `2px solid ${SHINY_GOLD}66`,
        }} />
      </motion.div>

      {results.length === 0 ? (
        <p style={{ margin: 0, color: `${text}60`, fontFamily: bodyFont, fontSize: '1.3rem' }}>
          No answers were submitted.
        </p>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: twoCol ? '1fr 1fr' : '1fr', gap: '0.5rem 2.5rem',
          width: '100%', maxWidth: twoCol ? 1600 : 1000,
        }}>
          {results.map((r, i) => {
            const cell = r.guess ? getHuesCuesCell(r.guess) : null
            return (
              <motion.div
                key={`${r.teamName}-${i}`}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                transition={{ duration: 0.26, delay: 0.4 + i * 0.06, ease: EASE_OUT }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.65rem 1.1rem', borderRadius: 12,
                  background: r.points > 0 ? `${SHINY_GOLD}1f` : 'rgba(255,255,255,0.04)',
                  border: r.points > 0 ? `1px solid ${SHINY_GOLD}66` : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: cell?.hex ?? 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: displayFont, fontSize: '1.9rem', color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.teamName}
                </span>
                <span style={{ fontFamily: bodyFont, fontSize: '1.25rem', color: `${text}75`, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {r.guess ?? '—'}
                </span>
                <span style={{ minWidth: '4.5rem', textAlign: 'right', flexShrink: 0, fontFamily: displayFont, fontSize: '2rem', color: r.points > 0 ? SHINY_GOLD : `${text}40` }}>
                  {r.points > 0 ? `+${r.points}` : '0'}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
