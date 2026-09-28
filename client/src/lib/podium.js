// Winner Reveal podium: 1st/2nd/3rd from ONE snapshot of team totals.
//
// Placement rule (competition ranking, same as computePlaces everywhere else):
//   - 1st = every team on the top total, names joined with ' & ' — exactly the
//     string/isTie the reveal has always shown. Top total <= 0 (or no teams)
//     is noData, also unchanged.
//   - 2nd/3rd = teams whose computePlaces rank is 2 / 3. A tie uses up the
//     places below it: two co-winners means no 2nd, the next team is 3rd;
//     two teams tied for 2nd means no 3rd.
//   - A team on 0 points or with a blank name never takes 2nd/3rd.
//   - A blank-name row (the host's `+ Team` before it's typed) keeps its place
//     in the order but is never announced: it drops out of the winner's
//     name, and a winner group with no named team reads as noData rather
//     than a blank name (or "Team & ") on the TV.
import { computePlaces } from './scoreboardMath.js'

const num = v => (Number.isFinite(v) ? v : 0)

function group(entries) {
  if (!entries.length) return null
  const named = entries.filter(e => String(e.name ?? '').trim())
  if (!named.length) return null
  return { name: named.map(e => e.name).join(' & '), total: entries[0].total, isTie: named.length > 1 }
}

export function buildPodium(entries) {
  const sorted = (entries ?? [])
    .map(e => ({ ...e, total: num(e.total) }))
    .sort((a, b) => b.total - a.total)
  if (!sorted.length || sorted[0].total <= 0) return { noData: true }

  const places = computePlaces(sorted)
  const at = p => sorted.filter((_, i) => places[i] === p)
  const lower = p => group(at(p).filter(e => e.total > 0 && String(e.name ?? '').trim()))

  const winner = group(at(1))
  if (!winner) return { noData: true }
  return { winner, second: lower(2), third: lower(3) }
}

// Lower-place beats that run before the drum roll, in order.
export function lowerBeats(podium) {
  return ['third', 'second'].filter(k => podium?.[k])
}
