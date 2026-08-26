import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { WAGER_TIERS, wagerOddsLine, wagerTierReachable, parseWagerNumber } from '../../lib/wagerScoring.js'

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
export default function WagerBoard({ slide, team, theme, preview = false, onAnswered }) {
  const { data } = slide
  const tiersLocked = !!data.wagerTiersLocked
  const guessesLocked = !!data.wagerGuessesLocked
  const text = theme?.colors?.text ?? '#ffffff'
  const highlight = theme?.colors?.highlight ?? '#f5c842'
  const shouldReduceMotion = useReducedMotion()

  const [tier, setTier] = useState(null)
  // `tier` is the immediate tap for visual feedback (button highlight,
  // "Wager placed" copy); `committedTier` is only set once save() confirms
  // the write landed — same split as digits/committed below, and what
  // onAnswered's force-delivery release actually gates on, so a failed save
  // can't release a team with no tier actually recorded.
  const [committedTier, setCommittedTier] = useState(null)
  // `digits` is what the keypad has built so far; `committed` is what was
  // actually written to phone_answers. They differ whenever a team has tapped
  // something it hasn't locked in yet — that gap is what enables the explicit
  // submit instead of an implicit "last digit typed" heuristic.
  const [digits, setDigits] = useState('')
  const [committed, setCommitted] = useState(null)
  const [teamCount, setTeamCount] = useState(0)
  const [saveFailed, setSaveFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  // Quick 🔒 pop on a successful lock-in — pure feedback, no state it reads
  // from (2026-08-18, Ben). Self-clears; nothing else depends on it.
  const [showLockPop, setShowLockPop] = useState(false)
  const lockPopTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(lockPopTimerRef.current), [])

  // Chained rather than fired-and-forgotten so two rapid taps (tier switch,
  // or a guess edited faster than the network round-trip) can't land out of
  // order — the same class of bug useShow.js's slidesSaveChainRef already
  // guards against for slide saves, applied here to phone_answers writes.
  const saveChainRef = useRef(Promise.resolve())

  const save = useCallback((nextTier, nextGuess) => {
    if (preview) return Promise.resolve(true)
    const run = saveChainRef.current.then(async () => {
      const upsert = supabase.from('phone_answers').upsert(
        {
          show_id: slide.showId ?? team.showId,
          slide_id: slide.id,
          team_id: team.id,
          answer: { tier: nextTier, guess: parseWagerNumber(nextGuess) },
          // submitted_at NOT sent — see MatchingBoard.jsx's identical upsert:
          // a server-side trigger (2026-08-26) owns this column now instead
          // of trusting the phone's own clock.
        },
        { onConflict: 'slide_id,team_id' }
      )
      // Raced against a timeout, not just awaited — a request that never
      // settles (dead wifi, captive portal) would otherwise leave `saving`
      // stuck true forever (button dead, team pinned by forceInteractive
      // with no escape) AND wedge every save queued behind it in the chain.
      // The abandoned fetch may still resolve later; nothing awaits it by
      // then, which is fine — we've already moved on.
      let error
      try {
        ;({ error } = await Promise.race([
          upsert,
          new Promise((_, reject) => setTimeout(() => reject(new Error('wager save timed out')), 8000)),
        ]))
      } catch (err) {
        error = err
      }
      if (error) console.error('[WagerBoard] wager save failed:', error)
      setSaveFailed(!!error)
      return !error
    })
    saveChainRef.current = run.catch(() => false)
    return run
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
        if (row.answer.tier) { setTier(row.answer.tier); setCommittedTier(row.answer.tier) }
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
    // A tier the collision bump (wagerTierBar) has pushed past what this
    // room can ever reach cannot pay out no matter the guess — never let a
    // team commit to a tier that's a guaranteed zero with no way to know it.
    if (!wagerTierReachable(id, teamCount)) return
    setTier(id)
    // Only treat the tier as officially picked once the write is confirmed —
    // an optimistic commit here would release a team from force-delivery via
    // onAnswered before anything was actually saved. On failure, saveFailed
    // already shows and the pick stays retriable (tap the tier again).
    save(id, digits).then(ok => { if (ok) setCommittedTier(id) })
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
    if (guessesLocked || !dirty || saving) return
    setSaving(true)
    save(tier, digits).then(ok => {
      setSaving(false)
      // Only mark it committed once the write actually landed — an
      // optimistic commit here used to disable the button and claim
      // "Guess Locked In" on a failed save, leaving no way to retry.
      if (ok) {
        setCommitted(digits)
        setShowLockPop(true)
        clearTimeout(lockPopTimerRef.current)
        lockPopTimerRef.current = setTimeout(() => setShowLockPop(false), 700)
      }
    })
  }

  // Reports to the parent whether THIS phase's required input is satisfied —
  // tier picked during the blind wager, guess locked in once the question is
  // revealed — so LiveView can release a team back to free browsing the
  // instant they've done what's currently asked of them, and re-claim them
  // if the phase changes underneath them (tiers lock, guess still missing).
  useEffect(() => {
    if (!onAnswered) return
    onAnswered(tiersLocked ? committed != null : committedTier != null)
  }, [onAnswered, tiersLocked, committed, committedTier])

  const chosen = WAGER_TIERS.find(t => t.id === committedTier) ?? null
  // Nothing is written until the team taps the button, so "dirty" is what
  // makes the submit button live.
  const dirty = digits !== '' && digits !== committed

  return (
    // maxWidth caps tier cards and the numeric keypad at a comfortable
    // thumb-reach width — a no-op on phone widths (already narrower than
    // this), but without it the 3-column keypad grid stretches its keys
    // into wide, awkward rectangles on an iPad's ~560px content column.
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 420, width: '100%', margin: '0 auto' }}>

      <AnimatePresence>
        {showLockPop && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.9 }}
            transition={shouldReduceMotion
              ? { duration: 0.15 }
              : { type: 'spring', duration: 0.4, bounce: 0.35 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{
              fontSize: '5rem', lineHeight: 1,
              filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.45))',
            }}>
              🔒
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {!tiersLocked ? (
        <>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              margin: 0, color: text, fontSize: '1.15rem', fontWeight: 700,
              fontFamily: 'DM Sans, sans-serif',
            }}>
              Place your wager
            </p>
            <p style={{ margin: '0.35rem 0 0', color: `${text}b3`, fontSize: '0.85rem', lineHeight: 1.45 }}>
              Pick before you see the question. How sure are you?
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {WAGER_TIERS.map((t, i) => {
              const reachable = wagerTierReachable(t.id, teamCount)
              return (
              <motion.button
                key={t.id}
                onClick={() => pickTier(t.id)}
                disabled={!reachable}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
                animate={{ opacity: reachable ? 1 : 0.4, transform: 'translateY(0px)' }}
                transition={{ duration: 0.24, delay: i * 0.05, ease: [0.23, 1, 0.32, 1] }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.85rem',
                  width: '100%', minHeight: 74, padding: '0.85rem 1rem',
                  borderRadius: 16, textAlign: 'left',
                  cursor: reachable ? 'pointer' : 'not-allowed',
                  fontFamily: 'DM Sans, sans-serif',
                  WebkitTapHighlightColor: 'transparent',
                  // Weight escalates with risk: the safe card is a hairline,
                  // the sun card is the loudest thing on the screen. A tier
                  // this room can't reach (see wagerTierReachable) never
                  // gets that treatment regardless of which one it is —
                  // dimmed via the animate opacity above, same as any other
                  // disabled control.
                  // Confirmed (committedTier) gets the full solid treatment.
                  // Picked-but-not-yet-confirmed (tapped, save still in
                  // flight or failed) gets a dashed border instead of solid —
                  // visibly different from "actually recorded," so a failed
                  // save doesn't look identical to a successful one with
                  // only a small red line below as the sole tell.
                  border: committedTier === t.id
                    ? `2px solid ${TIER_STYLE[t.id].tint}`
                    : tier === t.id
                      ? `2px dashed ${TIER_STYLE[t.id].tint}`
                      : `1px solid ${TIER_STYLE[t.id].tint}55`,
                  background: committedTier === t.id
                    ? `${TIER_STYLE[t.id].tint}22`
                    : tier === t.id
                      ? `${TIER_STYLE[t.id].tint}10`
                      : 'rgba(255,255,255,0.05)',
                  boxShadow: committedTier === t.id ? `0 0 18px ${TIER_STYLE[t.id].glow}` : 'none',
                  transition: 'transform 140ms cubic-bezier(0.23,1,0.32,1)',
                }}
                onPointerDown={e => { if (reachable) e.currentTarget.style.transform = 'scale(0.97)' }}
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
                  {wagerOddsLine(t.id, teamCount) && (
                    <span style={{ color: `${text}b3`, fontSize: '0.78rem' }}>
                      {wagerOddsLine(t.id, teamCount)}
                    </span>
                  )}
                </span>
              </motion.button>
              )
            })}
          </div>

          <p style={{ color: `${text}b3`, fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
            {committedTier
              ? 'Wager placed — you can still change it until Ben locks it'
              : tier
                ? (saveFailed ? "Couldn't save — tap it again" : 'Saving your wager…')
                : 'Tap a wager to place it'}
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
                <span style={{ color: `${text}b3`, fontSize: '0.75rem' }}>
                  {chosen.points} pts{wagerOddsLine(chosen.id, teamCount) ? ` · ${wagerOddsLine(chosen.id, teamCount)}` : ''}
                </span>
              </span>
            </div>
          )}
          {!chosen && (
            <p style={{
              color: `${text}b3`, fontSize: '0.85rem', margin: 0, textAlign: 'center',
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
              color: digits ? text : `${text}b3`,
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
                disabled={!dirty || saving}
                onPointerDown={e => { if (dirty && !saving) e.currentTarget.style.transform = 'scale(0.97)' }}
                onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                style={{
                  width: '100%', minHeight: 54, borderRadius: 14,
                  border: dirty ? `2px solid ${highlight}` : `1px solid ${text}20`,
                  background: dirty ? `${highlight}26` : 'transparent',
                  color: dirty ? text : `${text}40`,
                  fontSize: '1rem', fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
                  cursor: dirty && !saving ? 'pointer' : 'default',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'transform 140ms cubic-bezier(0.23,1,0.32,1)',
                }}
              >
                {saving ? 'Saving…' : committed == null ? 'Lock In Guess' : dirty ? 'Update Guess' : 'Guess Locked In'}
              </button>
            </>
          )}

          <p style={{ color: `${text}b3`, fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
            {guessesLocked
              ? 'Answers locked'
              : saving
                ? 'Saving…'
                : committed == null
                  ? 'Tap your number, then lock it in'
                  : dirty
                    ? 'Not submitted yet — tap Update Guess'
                    : `Locked in: ${committed}. You can still change it until Ben locks answers.`}
          </p>
        </>
      )}

      {/* Phase 1's own failure copy lives inline above (right under the tier
          cards) — this banner would just duplicate it, so it's phase-2 only. */}
      {saveFailed && tiersLocked && !guessesLocked && !saving && (
        <p style={{ color: '#ff6b6b', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
          Couldn't save — tap {committed == null ? 'Lock In Guess' : 'Update Guess'} again
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
