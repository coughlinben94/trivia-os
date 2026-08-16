import { useState, useEffect, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { WAGER_TIERS, wagerOddsLine, parseWagerNumber } from '../../lib/wagerScoring.js'

// Tier signal colors are FIXED across all 21 themes, the same way SHINY_GOLD
// is and the same way MatchingBoard's pair palette is: the escalation from
// calm to dangerous has to read identically whichever theme the show is on,
// so it can't be derived from theme.colors. Everything else on this screen
// (background, text, muted text) does come from the theme.
const TIER_STYLE = {
  safe: { tint: '#5fa8d3', glow: 'rgba(95,168,211,0.45)' },
  fire: { tint: '#e8703a', glow: 'rgba(232,112,58,0.5)' },
  sun:  { tint: '#f5c842', glow: 'rgba(245,200,66,0.55)' },
}

// Sanity bound on the keypad, not a cap on plausible answers — 12 digits is
// past a trillion. It exists so a kid holding down a key can't build a string
// long enough to turn into Infinity or wreck the readout layout.
const MAX_DIGITS = 12

// The two-phase phone screen for a wager question.
//
//   Phase 1 — the BLIND wager. Three risk tiers, shown before the question
//   text exists anywhere on this screen. A team may change its mind freely
//   until the host locks wagers.
//   Phase 2 — the question appears and the tier picker goes read-only. The
//   guess is built on a tap keypad and committed by an explicit "Lock In
//   Guess" tap, never on a "last digit typed" heuristic — every other /join
//   surface commits on a deliberate action too.
//
// The read-only tier buttons in phase 2 are the polite half of the blind-wager
// rule. The enforcing half is host-side: LiveMode snapshots every team's tier
// into slide.data.wagerTiers at the instant it locks wagers, and scoring reads
// that snapshot rather than this table — so a phone that rewrites its row
// after the reveal changes nothing. phone_answers is public-update by design
// (it's the phone's own data), so a disabled button alone would be a request,
// not a rule.
export default function WagerBoard({ slide, team, theme, preview = false }) {
  const { data } = slide
  const tiersLocked = !!data.wagerTiersLocked
  const guessesLocked = !!data.wagerGuessesLocked
  const text = theme?.colors?.text ?? '#ffffff'
  const highlight = theme?.colors?.highlight ?? '#f5c842'
  const shouldReduceMotion = useReducedMotion()

  const [tier, setTier] = useState(null)
  // `digits` is what the keypad has built so far; `committed` is what was
  // actually written to phone_answers. They differ whenever a team has tapped
  // something it hasn't locked in yet — that gap is what enables the explicit
  // submit instead of an implicit "last digit typed" heuristic.
  const [digits, setDigits] = useState('')
  const [committed, setCommitted] = useState(null)
  const [teamCount, setTeamCount] = useState(0)
  const [saveFailed, setSaveFailed] = useState(false)

  const save = useCallback(async (nextTier, nextGuess) => {
    if (preview) return
    const { error } = await supabase.from('phone_answers').upsert(
      {
        show_id: slide.showId ?? team.showId,
        slide_id: slide.id,
        team_id: team.id,
        answer: { tier: nextTier, guess: parseWagerNumber(nextGuess) },
      },
      { onConflict: 'slide_id,team_id' }
    )
    if (error) console.error('[WagerBoard] wager save failed:', error)
    setSaveFailed(!!error)
  }, [preview, slide.id, slide.showId, team.id, team.showId])

  // Restore this team's own row so a phone that reloads mid-question keeps
  // both its wager and its guess.
  useEffect(() => {
    if (preview) return
    let cancelled = false
    supabase
      .from('phone_answers')
      .select('answer')
      .eq('slide_id', slide.id)
      .eq('team_id', team.id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (cancelled || !row?.answer) return
        if (row.answer.tier) setTier(row.answer.tier)
        if (row.answer.guess != null) {
          setDigits(String(row.answer.guess))
          setCommitted(String(row.answer.guess))
        }
      })
    return () => { cancelled = true }
  }, [preview, slide.id, team.id])

  // How many teams are in tonight's show, for the "beat N of M" odds on each
  // tier card. ponytail: one-shot count, no Realtime subscription — the
  // roster is settled well before the wager beat, and this number is an odds
  // hint, not a score input. Add a subscription only if late registrations
  // during a question turn out to be a real thing.
  useEffect(() => {
    if (preview) { setTeamCount(12); return }
    const showId = slide.showId ?? team.showId
    if (!showId) return
    let cancelled = false
    supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('show_id', showId)
      .then(({ count }) => { if (!cancelled) setTeamCount(count ?? 0) })
    return () => { cancelled = true }
  }, [preview, slide.showId, team.showId])

  function pickTier(id) {
    if (tiersLocked || guessesLocked) return
    setTier(id)
    save(id, digits)
  }

  // ponytail: whole non-negative numbers only. Every wager question is a
  // "how many" count, and a keypad without +/- or a decimal point is one less
  // thing to mis-tap on a phone in a dark bar. Add the keys if a question
  // ever genuinely needs them.
  function pressDigit(d) {
    if (guessesLocked) return
    setDigits(prev => {
      if (prev.length >= MAX_DIGITS) return prev      // sanity bound, not a real-answer cap
      if (prev === '' && d === '0') return prev       // no leading zeros
      return prev + d
    })
  }

  function lockInGuess() {
    if (guessesLocked || !dirty) return
    setCommitted(digits)
    save(tier, digits)
  }

  const chosen = WAGER_TIERS.find(t => t.id === tier) ?? null
  // Nothing is written until the team taps the button, so "dirty" is what
  // makes the submit button live.
  const dirty = digits !== '' && digits !== committed

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {!tiersLocked ? (
        <>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              margin: 0, color: text, fontSize: '1.15rem', fontWeight: 700,
              fontFamily: 'DM Sans, sans-serif',
            }}>
              Place your wager
            </p>
            <p style={{ margin: '0.35rem 0 0', color: `${text}70`, fontSize: '0.85rem', lineHeight: 1.45 }}>
              Pick before you see the question. How sure are you?
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {WAGER_TIERS.map((t, i) => (
              <motion.button
                key={t.id}
                onClick={() => pickTier(t.id)}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                transition={{ duration: 0.24, delay: i * 0.05, ease: [0.23, 1, 0.32, 1] }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.85rem',
                  width: '100%', minHeight: 74, padding: '0.85rem 1rem',
                  borderRadius: 16, textAlign: 'left', cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  WebkitTapHighlightColor: 'transparent',
                  // Weight escalates with risk: the safe card is a hairline,
                  // the sun card is the loudest thing on the screen.
                  border: tier === t.id
                    ? `2px solid ${TIER_STYLE[t.id].tint}`
                    : `1px solid ${TIER_STYLE[t.id].tint}55`,
                  background: tier === t.id
                    ? `${TIER_STYLE[t.id].tint}22`
                    : 'rgba(255,255,255,0.05)',
                  boxShadow: tier === t.id ? `0 0 18px ${TIER_STYLE[t.id].glow}` : 'none',
                  transition: 'transform 140ms cubic-bezier(0.23,1,0.32,1)',
                }}
                onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
                onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                <span style={{
                  fontSize: `${1.6 + i * 0.35}rem`, lineHeight: 1, flexShrink: 0,
                  filter: `drop-shadow(0 0 ${6 + i * 5}px ${TIER_STYLE[t.id].glow})`,
                }}>
                  {t.emoji}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
                  <span style={{ color: text, fontSize: '1rem', fontWeight: 700 }}>
                    {t.label}
                  </span>
                  <span style={{ color: TIER_STYLE[t.id].tint, fontSize: '0.9rem', fontWeight: 700 }}>
                    {t.points} pts
                  </span>
                  {wagerOddsLine(t.threshold, teamCount) && (
                    <span style={{ color: `${text}70`, fontSize: '0.78rem' }}>
                      {wagerOddsLine(t.threshold, teamCount)}
                    </span>
                  )}
                </span>
              </motion.button>
            ))}
          </div>

          <p style={{ color: `${text}55`, fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
            {tier ? 'Wager placed — you can still change it until Ben locks it' : 'Tap a wager to place it'}
          </p>
        </>
      ) : (
        <>
          {/* Wager is locked — it now reads as a fact about this team, not a
              choice. Only the chosen tier stays on screen. */}
          {chosen && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.6rem 0.85rem', borderRadius: 12,
              border: `1px solid ${TIER_STYLE[chosen.id].tint}55`,
              background: `${TIER_STYLE[chosen.id].tint}18`,
              fontFamily: 'DM Sans, sans-serif',
            }}>
              <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>{chosen.emoji}</span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: text, fontSize: '0.9rem', fontWeight: 700 }}>{chosen.label}</span>
                <span style={{ color: `${text}70`, fontSize: '0.75rem' }}>
                  {chosen.points} pts{wagerOddsLine(chosen.threshold, teamCount) ? ` · ${wagerOddsLine(chosen.threshold, teamCount)}` : ''}
                </span>
              </span>
            </div>
          )}
          {!chosen && (
            <p style={{
              color: `${text}70`, fontSize: '0.85rem', margin: 0, textAlign: 'center',
              fontFamily: 'DM Sans, sans-serif',
            }}>
              No wager placed — you're playing it safe ({WAGER_TIERS[0].points} pts).
            </p>
          )}

          <p style={{
            color: text, fontSize: 'clamp(1.15rem, 4.5vw, 1.35rem)', lineHeight: 1.55,
            margin: 0, fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
          }}>
            {data.text || <span style={{ opacity: 0.3, fontStyle: 'italic' }}>No question text</span>}
          </p>

          {/* Live readout — the number being built, not an input. The accent
              is theme.colors.highlight, never a hardcoded color. */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 78, padding: '0.5rem 1rem', borderRadius: 16, boxSizing: 'border-box',
            border: `1px solid ${highlight}55`,
            background: `${highlight}12`,
            boxShadow: dirty ? `0 0 20px ${highlight}33` : 'none',
            transition: 'box-shadow 180ms cubic-bezier(0.23,1,0.32,1)',
          }}>
            <span style={{
              color: digits ? text : `${text}45`,
              fontSize: '2.6rem', fontWeight: 800, lineHeight: 1,
              fontFamily: 'DM Sans, sans-serif', fontVariantNumeric: 'tabular-nums',
              textShadow: digits ? `0 0 18px ${highlight}66` : 'none',
              wordBreak: 'break-all', textAlign: 'center',
            }}>
              {digits || '0'}
            </span>
          </div>

          {!guessesLocked && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.55rem' }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'C'].map(key => (
                  <Key
                    key={key}
                    label={key}
                    textColor={text}
                    onTap={() => {
                      if (key === '⌫') return setDigits(d => d.slice(0, -1))
                      if (key === 'C') return setDigits('')
                      pressDigit(key)
                    }}
                  />
                ))}
              </div>

              <button
                onClick={lockInGuess}
                disabled={!dirty}
                onPointerDown={e => { if (dirty) e.currentTarget.style.transform = 'scale(0.97)' }}
                onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                style={{
                  width: '100%', minHeight: 54, borderRadius: 14,
                  border: dirty ? `2px solid ${highlight}` : `1px solid ${text}20`,
                  background: dirty ? `${highlight}26` : 'transparent',
                  color: dirty ? text : `${text}40`,
                  fontSize: '1rem', fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
                  cursor: dirty ? 'pointer' : 'default',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'transform 140ms cubic-bezier(0.23,1,0.32,1)',
                }}
              >
                {committed == null ? 'Lock In Guess' : dirty ? 'Update Guess' : 'Guess Locked In'}
              </button>
            </>
          )}

          <p style={{ color: `${text}55`, fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
            {guessesLocked
              ? 'Answers locked'
              : committed == null
                ? 'Tap your number, then lock it in'
                : dirty
                  ? 'Not submitted yet — tap Update Guess'
                  : `Locked in: ${committed}. You can still change it until Ben locks answers.`}
          </p>
        </>
      )}

      {saveFailed && !guessesLocked && (
        <p style={{ color: '#ff6b6b', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
          Couldn't save — check your connection and tap again
        </p>
      )}
    </div>
  )
}

// One keypad key. Tapped dozens of times per question, so it gets press
// feedback and nothing else — no entrance animation, no hover state (a phone
// has no hover, and a tap would trigger a false one).
function Key({ label, textColor, onTap }) {
  return (
    <button
      onClick={onTap}
      onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.94)' }}
      onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
      onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      style={{
        minHeight: 58, borderRadius: 14,
        border: `1px solid ${textColor}1f`,
        background: 'rgba(255,255,255,0.06)',
        color: textColor, fontSize: '1.45rem', fontWeight: 700,
        fontFamily: 'DM Sans, sans-serif', fontVariantNumeric: 'tabular-nums',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        transition: 'transform 110ms cubic-bezier(0.23,1,0.32,1)',
      }}
    >
      {label}
    </button>
  )
}
