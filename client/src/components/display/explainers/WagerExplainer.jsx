import { motion, useReducedMotion } from 'framer-motion'
import { getWagerTier, scoreWagerRound, wagerOddsLine, wagerTierBar, WAGER_TIERS } from '../../../lib/wagerScoring.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

// Same fixed tier tints as ShinyWagerQuestion / WagerBoard.
const TIER_TINT = { safe: '#5fa8d3', fire: '#e8703a', sun: '#f5c842' }

// A synthetic room of five, scored by the real scorer. B guesses closer than
// C but wagered Sun, so it misses its bar while C's Safe wager pays.
const SAMPLE_ANSWER = 412
const SAMPLE_ENTRIES = [
  { teamId: 'a', teamName: 'A', tier: 'fire', guess: 405 },
  { teamId: 'b', teamName: 'B', tier: 'sun', guess: 430 },
  { teamId: 'c', teamName: 'C', tier: 'safe', guess: 450 },
  { teamId: 'd', teamName: 'D', tier: 'fire', guess: 300 },
  { teamId: 'e', teamName: 'E', tier: 'safe', guess: 600 },
]
const ROOM = SAMPLE_ENTRIES.length
export const SAMPLE_WAGER_RESULTS = scoreWagerRound({ entries: SAMPLE_ENTRIES, correctAnswer: SAMPLE_ANSWER })
// The closest team that still scored 0 — the lesson of the example.
const MISSED = SAMPLE_WAGER_RESULTS.find(result => !result.won)
const MISSED_BAR = wagerTierBar(MISSED.tier, ROOM)

export default function WagerExplainer() {
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
      aria-label={`Example wager room of five teams. Answer ${SAMPLE_ANSWER}. Team ${MISSED.teamName} guessed close but wagered ${getWagerTier(MISSED.tier).label} and scored 0.`}
      style={{
        width: 'min(100%, max(1600px, 148vmin))', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: '5vmin', fontVariantNumeric: 'tabular-nums',
      }}
    >
      {/* The three wagers as the phone and TV show them, with the real
          "Beat N of M" bar for this room size. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8vmin', width: 'min(37%, max(660px, 61vmin))', flexShrink: 0 }}>
        {WAGER_TIERS.map((tier, index) => (
          <motion.div key={tier.id} {...enter(0.2 + index * 0.06)} style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', columnGap: '1.4vmin',
            padding: '1.6vmin 2vmin', borderRadius: 14, textAlign: 'left',
            border: `${1 + index}px solid ${TIER_TINT[tier.id]}cc`, background: `${TIER_TINT[tier.id]}1a`,
          }}>
            <span style={{ gridRow: 'span 2', fontSize: 'max(2.2rem, 4.6vmin)', lineHeight: 1 }}>{tier.emoji}</span>
            <span style={{ fontFamily: displayFont, fontSize: 'max(1.8rem, 3.2vmin)', lineHeight: 1.05, color: text }}>{tier.label}</span>
            <span style={{ gridRow: 'span 2', fontFamily: displayFont, fontSize: 'max(2.1rem, 3.8vmin)', color: TIER_TINT[tier.id] }}>{tier.points}</span>
            <span style={{ fontSize: 'max(1.3rem, 2.3vmin)', color: `${text}e0` }}>{wagerOddsLine(tier.id, ROOM)}</span>
          </motion.div>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0, maxWidth: 'max(860px, 80vmin)', display: 'flex', flexDirection: 'column', gap: '1.2vmin' }}>
        <motion.div {...enter(0.55)} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '1.5vmin' }}>
          <span style={{ fontSize: 'max(1.4rem, 2.6vmin)', color: `${text}d0` }}>Answer</span>
          <span style={{ fontFamily: displayFont, fontSize: 'max(2.6rem, 5vmin)', lineHeight: 1, color: SHINY_GOLD }}>{SAMPLE_ANSWER}</span>
        </motion.div>
        {SAMPLE_WAGER_RESULTS.map((result, index) => {
          const tier = getWagerTier(result.tier)
          const missed = result.teamId === MISSED.teamId
          return (
            <motion.div key={result.teamId} {...enter(0.9 + index * 0.08, 10)} style={{
              // Fixed columns (not auto) so every row's guess and points line up,
              // including B's wider "needs 4" cell.
              display: 'grid', gridTemplateColumns: '1.6em 1.4em 1fr 2.4em 4.4em', alignItems: 'center', columnGap: '1.6vmin',
              padding: '1vmin 2vmin', borderRadius: 12, textAlign: 'left',
              background: result.won ? `${SHINY_GOLD}24` : 'rgba(255,255,255,0.05)',
              outline: result.won ? `2px solid ${SHINY_GOLD}aa` : 'none', outlineOffset: '-2px',
              fontSize: 'max(1.35rem, 2.7vmin)',
            }}>
              <span style={{ fontFamily: displayFont, fontSize: '1.25em', color: text }}>{result.teamName}</span>
              <span style={{ fontSize: '1.15em', lineHeight: 1 }}>{tier.emoji}</span>
              <span style={{ color: missed ? text : `${text}e0`, whiteSpace: 'nowrap', textDecoration: missed ? 'underline wavy' : 'none', textUnderlineOffset: '0.25em' }}>{tier.label}</span>
              <span style={{ color: text, textAlign: 'right' }}>{result.guess}</span>
              <span style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontFamily: displayFont, fontSize: '1.3em', lineHeight: 1, color: result.won ? SHINY_GOLD : `${text}d0` }}>
                  {result.won ? `+${result.points}` : '0'}
                </span>
                {missed && <span style={{ fontSize: '0.82em', color: `${text}e0`, whiteSpace: 'nowrap' }}>needs {MISSED_BAR}</span>}
              </span>
            </motion.div>
          )
        })}
        <motion.p {...enter(1.6, 8)} style={{ margin: '0.6vmin 0 0', fontSize: 'max(1.3rem, 2.4vmin)', color: `${text}e6`, textWrap: 'balance' }}>
          {MISSED.teamName} beat {MISSED.beaten} of {ROOM - 1} but wagered {getWagerTier(MISSED.tier).label}, which needs {MISSED_BAR}.
        </motion.p>
      </div>
    </div>
  )
}
