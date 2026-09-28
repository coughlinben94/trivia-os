// What the iPad's Fix drawer may do on the current slide (spec §6 unlock /
// rescore). Pure: LiveMode passes the slide plus that mechanic's own busy flag
// and last scoring error; the answer feeds both the snapshot (so the iPad can
// grey a button and say why) and planHostCommand (so a stale tap is refused).
//
// canRescore = !pendingLockPhase && last lock field set && !busy && no
// countdown && !(revealed && !error) — the last part is the laptop panel's
// hideMainPanel rule: once the TV shows the result, a rescore would rewrite it
// underneath. Wager also needs its tier snapshot, because without one the
// laptop's button runs handleLockWagers (re-lock tiers), not a rescore.
// Horse race is excluded from rescore (laptop only, spec §6); it can unlock.
import { PHONE_MECHANICS, pendingLockPhase } from './slideStepping.js'

const NONE = {
  mechanic: null,
  canUnlock: false, unlockRefusal: 'nothing-to-fix',
  canRescore: false, rescoreRefusal: 'nothing-to-fix', rescoreLabel: null,
}

// The same lookup LiveMode's phoneMechanic does: type 'question' only.
function mechanicOf(slide) {
  if (slide?.type === 'horse-race') return 'horse-race'
  if (slide?.type !== 'question' || !slide.data) return null
  return Object.keys(PHONE_MECHANICS).find(k => PHONE_MECHANICS[k].guard(slide.data)) ?? null
}

export function fixFor(slide, { busy = false, error = null } = {}) {
  const mechanic = mechanicOf(slide)
  if (!mechanic) return NONE
  const d = slide.data ?? {}
  const race = mechanic === 'horse-race'
  const m = PHONE_MECHANICS[mechanic]
  const lastLocked = race ? !!d.raceLocked : !!d[m.lockFields[m.lockFields.length - 1]]
  const blocked = d.lockCountdownStartedAt ? 'locking' : busy ? 'scoring' : null

  const unlockRefusal = blocked ?? (lastLocked ? null : 'nothing-locked')
  let rescoreRefusal
  if (race) rescoreRefusal = 'laptop-only'
  else if (blocked) rescoreRefusal = blocked
  else if (pendingLockPhase(slide) || !lastLocked || (mechanic === 'wager' && d.wagerTiers == null)) rescoreRefusal = 'not-locked'
  else if (d[m.revealField] && !error) rescoreRefusal = 'already-revealed'
  else rescoreRefusal = null

  return {
    mechanic,
    canUnlock: !unlockRefusal, unlockRefusal,
    canRescore: !rescoreRefusal, rescoreRefusal,
    rescoreLabel: race ? null : error ? 'Retry scoring' : 'Rescore',
  }
}
