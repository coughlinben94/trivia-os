import { useState, useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { WAGER_TIERS, getWagerTier, wagerOddsLine, wagerTierReachable, parseWagerNumber } from '../../../lib/wagerScoring.js'
import { useFitToBox, WAGER_Q_FLOOR, WAGER_Q_CEIL } from '../../../lib/autoFitText.js'

// Fixed tier signal colors, same rule as SHINY_GOLD: the calm → dangerous
// escalation must read identically on all 21 themes, so it is not derived
// from theme.colors. Every other color on this screen is.
const TIER_TINT = { safe: '#5fa8d3', fire: '#e8703a', sun: '#f5c842' }

// The TV side of a wager question. Four beats, one component:
//   1. Wagering  — the three tiers at stake, no question text anywhere.
//   2. Question  — the prompt, once the host has locked wagers.
//   3. Scoring   — the gap between "lock guesses" and the scores landing.
//   4. Reveal    — the true number, then who beat the room and who didn't.
export default function ShinyWagerQuestion({ slide, show, theme }) {
  const { data } = slide
  const tiersLocked = !!data.wagerTiersLocked
  const guessesLocked = !!data.wagerGuessesLocked
  const revealed = !!data.wagerRevealed
  const shouldReduceMotion = useReducedMotion()

  const [wagered, setWagered] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [teamCount, setTeamCount] = useState(0)

  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`

  // Polled, not a postgres_changes subscription — phone_answers' SELECT
  // policy (tightened 2026-08-17) only allows the owning team or a
  // host_verified session to read a row, and Supabase Realtime enforces that
  // same RLS check before delivering a change event, not just on initial
  // fetch. /display is neither, so a postgres_changes subscription here
  // would silently never fire. wager_answer_counts() is a SECURITY DEFINER
  // RPC returning only the two aggregate counts this component ever used —
  // it never reads individual tiers/guesses, same numbers the old client-side
  // filter over raw rows produced (its 'answered' count mirrors
  // parseWagerNumber(guess) != null exactly, because a stored guess is
  // already guaranteed clean — WagerBoard.jsx's save() runs it through
  // parseWagerNumber before the upsert, so "guess is non-null in the DB" and
  // "guess parses" are the same fact by the time it's written).
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: counts } = await supabase.rpc('wager_answer_counts', { p_slide_id: slide.id })
      if (cancelled) return
      setWagered(counts?.wagered ?? 0)
      setAnswered(counts?.answered ?? 0)
    }
    load()
    const interval = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [slide.id])

  useEffect(() => {
    if (!show?.id) return
    let cancelled = false
    supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('show_id', show.id)
      .then(({ count }) => { if (!cancelled) setTeamCount(count ?? 0) })
    return () => { cancelled = true }
  }, [show?.id])

  if (revealed) {
    return <WagerReveal data={data} theme={theme} shouldReduceMotion={shouldReduceMotion} />
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '4rem', gap: '2.5rem',
    }}>
      {!tiersLocked ? (
        <>
          <motion.h2
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(14px)' }}
            animate={{ opacity: 1, transform: 'translateY(0px)' }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            style={{
              margin: 0, fontFamily: displayFont, fontSize: '4.5rem', lineHeight: 1,
              color: SHINY_GOLD, textShadow: `0 0 26px ${SHINY_GOLD_GLOW}66`, textAlign: 'center',
            }}
          >
            Place Your Wager
          </motion.h2>
          <p style={{ margin: 0, color: `${text}70`, fontSize: '1.35rem', fontFamily: bodyFont, textAlign: 'center' }}>
            Before you see the question. How sure are you?
          </p>

          <div style={{ display: 'flex', gap: '2rem', width: '100%', maxWidth: 1400, justifyContent: 'center' }}>
            {WAGER_TIERS.map((t, i) => {
              const reachable = wagerTierReachable(t.id, teamCount)
              return (
              <motion.div
                key={t.id}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(16px)' }}
                animate={{ opacity: reachable ? 1 : 0.35, transform: 'translateY(0px)' }}
                transition={{ duration: 0.3, delay: 0.08 + i * 0.07, ease: EASE_OUT }}
                style={{
                  flex: 1, maxWidth: 420,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                  padding: '2rem 1.5rem', borderRadius: 22,
                  // Presence escalates with risk: a hairline on Safe, a lit
                  // edge on Sun. Static shadow, never animated.
                  border: `${1 + i}px solid ${TIER_TINT[t.id]}${['55', '88', 'cc'][i]}`,
                  background: `${TIER_TINT[t.id]}${['10', '16', '1f'][i]}`,
                  boxShadow: `0 0 ${10 + i * 18}px ${TIER_TINT[t.id]}${['22', '33', '44'][i]}`,
                }}
              >
                <span style={{ fontSize: `${3 + i * 0.9}rem`, lineHeight: 1 }}>{t.emoji}</span>
                <span style={{ fontFamily: displayFont, fontSize: '2.4rem', color: text, textAlign: 'center', lineHeight: 1.05 }}>
                  {t.label}
                </span>
                <span style={{ fontFamily: displayFont, fontSize: '2.1rem', color: TIER_TINT[t.id] }}>
                  {t.points} pts
                </span>
                {wagerOddsLine(t.id, teamCount) && (
                  <span style={{ fontFamily: bodyFont, fontSize: '1.05rem', color: `${text}80` }}>
                    {wagerOddsLine(t.id, teamCount)}
                  </span>
                )}
              </motion.div>
              )
            })}
          </div>

          <CountLine
            n={wagered}
            total={teamCount}
            verb="wagered"
            text={text}
            bodyFont={bodyFont}
          />
        </>
      ) : (
        <>
          <TierStrip theme={theme} bodyFont={bodyFont} />
          <QuestionText text={data.text} theme={theme} />
          {!guessesLocked ? (
            <CountLine n={answered} total={teamCount} verb="answered" text={text} bodyFont={bodyFont} />
          ) : (
            <p style={{ margin: 0, color: `${text}45`, fontSize: '1.2rem', fontFamily: bodyFont }}>
              Locked — scoring…
            </p>
          )}
        </>
      )}
    </div>
  )
}

function QuestionText({ text: questionText, theme }) {
  const boxRef = useRef(null)
  const size = useFitToBox(boxRef, questionText ?? '', {
    family: theme.fonts.display,
    floorPx: WAGER_Q_FLOOR * 16,
    ceilPx: WAGER_Q_CEIL * 16,
    maxLines: 3,
    lineHeight: 1.15,
  })
  return (
    <div ref={boxRef} style={{ width: '100%', maxWidth: 1500, height: '38vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{
        margin: 0, textAlign: 'center',
        fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
        fontSize: `${size}px`, lineHeight: 1.15, color: theme.colors.text,
      }}>
        {questionText}
      </p>
    </div>
  )
}

// A quiet reminder of what's riding on the answer, once the question is up.
function TierStrip({ theme, bodyFont }) {
  return (
    <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'center' }}>
      {WAGER_TIERS.map(t => (
        <span key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: bodyFont, fontSize: '1.05rem', color: `${theme.colors.text}70` }}>
          <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{t.emoji}</span>
          <span style={{ color: TIER_TINT[t.id], fontWeight: 700 }}>{t.points}</span>
        </span>
      ))}
    </div>
  )
}

function CountLine({ n, total, verb, text, bodyFont }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      style={{ margin: 0, color: `${text}70`, fontSize: '1.35rem', fontFamily: bodyFont }}
    >
      {total > 0 ? `${n} of ${total} teams ${verb}` : `${n} team${n === 1 ? '' : 's'} ${verb}`}
    </motion.p>
  )
}

// The payoff. The true number lands first on its own, then the room's results
// cascade in underneath it — the order the host would say them out loud.
function WagerReveal({ data, theme, shouldReduceMotion }) {
  const results = data.wagerResults ?? []
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const twoCol = results.length > 8

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '3rem 4rem', gap: '1.75rem',
    }}>
      {/* The prompt stays on screen, small — the reveal is meaningless
          without the question still in front of the room. */}
      {data.text && (
        <p style={{
          margin: 0, textAlign: 'center', maxWidth: 1200,
          fontFamily: bodyFont, fontSize: '1.4rem', lineHeight: 1.35, color: `${text}80`,
        }}>
          {data.text}
        </p>
      )}

      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.94)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        transition={{ duration: 0.32, ease: EASE_OUT }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}
      >
        <span style={{ fontFamily: bodyFont, fontSize: '1.15rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: `${text}60` }}>
          The answer
        </span>
        <span style={{
          fontFamily: displayFont, fontSize: '6rem', lineHeight: 1,
          color: SHINY_GOLD, textShadow: `0 0 30px ${SHINY_GOLD_GLOW}77`,
        }}>
          {data.answer ?? '—'}
        </span>
      </motion.div>

      {results.length === 0 ? (
        <p style={{ margin: 0, color: `${text}60`, fontFamily: bodyFont, fontSize: '1.3rem' }}>
          No answers were submitted.
        </p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: twoCol ? '1fr 1fr' : '1fr',
          gap: '0.5rem 2.5rem',
          width: '100%', maxWidth: twoCol ? 1600 : 1000,
        }}>
          {results.map((r, i) => {
            const tier = getWagerTier(r.tier)
            return (
              <motion.div
                key={`${r.teamName}-${i}`}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                transition={{ duration: 0.26, delay: 0.28 + i * 0.06, ease: EASE_OUT }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.9rem',
                  padding: '0.65rem 1.1rem', borderRadius: 12,
                  background: r.won ? `${SHINY_GOLD}1f` : 'rgba(255,255,255,0.04)',
                  border: r.won ? `1px solid ${SHINY_GOLD}66` : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>{tier.emoji}</span>
                <span style={{
                  flex: 1, minWidth: 0, fontFamily: displayFont, fontSize: '1.9rem',
                  color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {r.teamName}
                </span>
                <span style={{ fontFamily: bodyFont, fontSize: '1.25rem', color: `${text}75`, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {r.guess ?? '—'}
                </span>
                <span style={{
                  minWidth: '4.5rem', textAlign: 'right', flexShrink: 0,
                  fontFamily: displayFont, fontSize: '2rem',
                  color: r.won ? SHINY_GOLD : `${text}40`,
                }}>
                  {r.won ? `+${r.points}` : '0'}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
