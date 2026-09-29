import { pendingLockPhase } from './slideStepping.js'
import { parseWagerNumber } from './wagerScoring.js'
import { HUES_CUES_CODE_RE } from './huesCuesGrid.js'

export const HUES_CUES_ANSWER_ERROR = 'Set a correct square before locking — pick one on the grid'
export const WAGER_ANSWER_ERROR = 'This slide’s Answer isn’t a number — fix it in the slide editor, then score'
export const WAGER_TIERS_ERROR = 'Wagers were never locked — tap Lock Wagers first'

// Error text when the open lock phase's preCheck would refuse WITHOUT writing the
// lock (so Next's 3-2-1 would replay forever), else null. Single source: LiveMode's
// preChecks and its Next guard both read this. Pin It has its own (pinMissingSpot).
export function lockRefusal(slide) {
  const d = slide?.data
  switch (pendingLockPhase(slide)) {
    case 'huesCues': return HUES_CUES_CODE_RE.test(d.answer ?? '') ? null : HUES_CUES_ANSWER_ERROR
    case 'wager-guesses':
      if (parseWagerNumber(d.answer) == null) return WAGER_ANSWER_ERROR
      return d.wagerTiers == null ? WAGER_TIERS_ERROR : null
    default: return null
  }
}
