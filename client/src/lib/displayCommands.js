// What /display does with an iPad jukebox command (spec §17.2), as a pure
// function of DisplayInner's break state plus the Jukebox's own handles
// (jukeboxControls.js via remoteRef). The relay only ever routes jukebox.*
// here; everything else is unknown-command.
//
// jukebox.open     = the Space/→ "skip the 10s wait" key: setWarp('out') under
//                    its same three conditions (break slide, not yet up, no warp).
//                    Received-and-nothing once the warp or the jukebox is under way.
// jukebox.exit     = b exactly (exitToShow: stop animation, flush, advanceAfterBreak).
// jukebox.playStop = Space inside the jukebox (togglePlay).
import { COMMAND_TTL_MS } from './remoteProtocol.js'

const PLAY_REFUSAL = { modal: 'modal-open', handoff: 'busy' }

export function runDisplayCommand({ cmd, sentAt }, ctx) {
  if (typeof sentAt !== 'number' || ctx.now - sentAt > COMMAND_TTL_MS) return { refuse: 'late' }
  const up = ctx.breakActive && !!ctx.jukebox
  switch (cmd) {
    case 'jukebox.open':
      if (!ctx.breakEligible) return { refuse: 'not-at-break' }
      if (!ctx.breakActive && !ctx.warp) ctx.openJukebox()
      return { ok: true }
    case 'jukebox.exit': {
      if (!up) return { refuse: 'jukebox-not-open' }
      const r = ctx.jukebox.exitToShow()
      return r === 'modal' ? { refuse: 'modal-open' } : { ok: true }
    }
    case 'jukebox.playStop': {
      if (!up) return { refuse: 'jukebox-not-open' }
      const reason = PLAY_REFUSAL[ctx.jukebox.togglePlay()]
      return reason ? { refuse: reason } : { ok: true }
    }
    default:
      return { refuse: 'unknown-command' }
  }
}

// The `display-state` message the peer sends (through the relay) to the iPad.
export function displayState({ breakEligible, breakActive, warp, jukebox }) {
  const open = !!breakActive
  return {
    type: 'display-state',
    breakWaiting: !!breakEligible && !breakActive && !warp,
    jukeboxOpen: open,
    playing: open && !!jukebox?.playing,
    handoffPending: open && !!jukebox?.handoffPending,
  }
}
