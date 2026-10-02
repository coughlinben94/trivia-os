import { motion, useReducedMotion } from 'framer-motion'
import { scoreMovieChainSubmission } from '../../../lib/movieChainScoring.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

// Sample movies and actors with stand-in IDs. Each cast list holds only the
// credits this example uses, and every one is a real credit.
const MOVIES = {
  Q1: 'Titanic',
  Q2: 'The Departed',
  Q3: 'Inception',
  Q4: 'Interstellar',
  Q5: 'Good Will Hunting',
}
const ACTORS = { Q11: 'Leonardo DiCaprio', Q12: 'Matt Damon', Q13: 'Michael Caine', Q14: 'Jack Nicholson' }
const CAST = new Map([
  ['Q1', new Set(['Q11'])],
  ['Q2', new Set(['Q11', 'Q12', 'Q14'])],
  ['Q3', new Set(['Q11', 'Q13'])],
  ['Q4', new Set(['Q13', 'Q12'])],
  ['Q5', new Set(['Q12'])],
])
const START = 'Q1'
const END = 'Q5'
const ANNOUNCED = 3

// Three sample chains scored by the real scorer: the announced length, one
// movie longer, and one with a wrong last link.
export const SAMPLE_CHAINS = [
  { movies: ['Q1', 'Q2', 'Q5'], performers: ['Q11', 'Q12'] },
  { movies: ['Q1', 'Q3', 'Q4', 'Q5'], performers: ['Q11', 'Q13', 'Q12'] },
  { movies: ['Q1', 'Q2', 'Q5'], performers: ['Q11', 'Q14'] },
].map(chain => ({
  ...chain,
  ...scoreMovieChainSubmission(chain, { startId: START, endId: END, announcedCount: ANNOUNCED, castByMovie: CAST }),
}))

const noteFor = chain => {
  if (!chain.valid) return `${ACTORS[chain.performers.at(-1)]} isn’t in ${MOVIES[END]}`
  return `${chain.movieCount} movies`
}

export default function MovieChainExplainer() {
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
      aria-label={`Example: link ${MOVIES[START]} to ${MOVIES[END]}, shortest chain ${ANNOUNCED} movies. A ${ANNOUNCED}-movie chain scores ${SAMPLE_CHAINS[0].points}, a ${ANNOUNCED + 1}-movie chain scores ${SAMPLE_CHAINS[1].points}, a chain with a wrong link scores 0.`}
      style={{
        width: 'min(100%, max(1600px, 148vmin))', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '2vmin',
      }}
    >
      <motion.div {...enter(0.15)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6vmin' }}>
        <p style={{ margin: 0, fontFamily: displayFont, fontSize: 'max(2rem, 3.4vmin)', lineHeight: 1, color: text }}>
          {MOVIES[START]} <span aria-hidden="true" style={{ color: SHINY_GOLD }}>→</span> {MOVIES[END]}
        </p>
        <p style={{ margin: 0, fontSize: 'max(1.3rem, 2.6vmin)', color: SHINY_GOLD, textShadow: `0 0 1.6vmin ${SHINY_GOLD_GLOW}55` }}>
          Shortest chain: {ANNOUNCED} movies
        </p>
      </motion.div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2vmin', width: '100%' }}>
        {SAMPLE_CHAINS.map((chain, row) => {
          const scored = chain.points > 0
          return (
            <motion.div key={row} {...enter(0.7 + row * 0.5, 10)} style={{
              // Fixed mark and result columns so ✓ and ✗ rows line up.
                    display: 'grid', gridTemplateColumns: '1.6em 1fr minmax(4.5em, auto)', alignItems: 'center', columnGap: '2vmin',
              padding: '1.3vmin 2.4vmin', borderRadius: 12, textAlign: 'left',
              background: scored ? `${SHINY_GOLD}24` : 'rgba(255,255,255,0.05)',
              outline: scored ? `2px solid ${SHINY_GOLD}aa` : 'none', outlineOffset: '-2px',
              fontSize: 'max(1.35rem, 2.6vmin)', color: text,
            }}>
              <span aria-hidden="true" style={{ justifySelf: 'center', fontFamily: displayFont, fontSize: '1.4em', lineHeight: 1, color: scored ? SHINY_GOLD : `${text}c8` }}>
                {scored ? '✓' : '✗'}
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.3em 0.55em', lineHeight: 1.25 }}>
                {chain.movies.map((id, index) => {
                  const actor = chain.performers[index - 1]
                  const broken = !chain.valid && index === chain.movies.length - 1
                  return (
                    <span key={id + index} style={{ display: 'contents' }}>
                      {index > 0 && (
                        <span style={{ whiteSpace: 'nowrap', fontSize: '0.85em', color: broken ? text : SHINY_GOLD }}>
                          <span aria-hidden="true">→ </span>
                          <span style={{ textDecoration: broken ? 'underline wavy' : 'none', textUnderlineOffset: '0.25em' }}>
                            {ACTORS[actor]}
                          </span>
                          <span aria-hidden="true"> →</span>
                        </span>
                      )}
                      <strong style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{MOVIES[id]}</strong>
                    </span>
                  )
                })}
              </span>
              <span style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontFamily: displayFont, fontSize: '1.3em', lineHeight: 1, color: scored ? SHINY_GOLD : `${text}c8`, fontVariantNumeric: 'tabular-nums' }}>
                  {scored ? `+${chain.points}` : '0'}
                </span>
                <span style={{ fontSize: '0.85em', color: `${text}e0`, whiteSpace: 'nowrap' }}>{noteFor(chain)}</span>
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
