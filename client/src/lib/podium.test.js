import { describe, it, expect } from 'vitest'
import { buildPodium, lowerBeats } from './podium.js'

const t = (name, total, id = name) => ({ id, name, total })

describe('buildPodium', () => {
  it('no teams at all is noData', () => {
    expect(buildPodium([])).toEqual({ noData: true })
    expect(buildPodium(null)).toEqual({ noData: true })
  })

  it('nobody scored (every team on 0) is noData, same as today', () => {
    expect(buildPodium([t('A', 0), t('B', 0)])).toEqual({ noData: true })
  })

  it('crowns 1st, 2nd, 3rd from unsorted input', () => {
    const p = buildPodium([t('C', 30), t('A', 50), t('D', 10), t('B', 40)])
    expect(p.winner).toEqual({ name: 'A', total: 50, isTie: false })
    expect(p.second).toEqual({ name: 'B', total: 40, isTie: false })
    expect(p.third).toEqual({ name: 'C', total: 30, isTie: false })
  })

  it('1 team: winner only, no lower places (looks like today)', () => {
    const p = buildPodium([t('Solo', 12)])
    expect(p.winner).toEqual({ name: 'Solo', total: 12, isTie: false })
    expect(p.second).toBeNull()
    expect(p.third).toBeNull()
  })

  it('2 teams: winner + 2nd, no 3rd', () => {
    const p = buildPodium([t('A', 12), t('B', 9)])
    expect(p.second.name).toBe('B')
    expect(p.third).toBeNull()
  })

  it('tie for 1st keeps today\'s winner string exactly and skips 2nd (competition ranking)', () => {
    const p = buildPodium([t('A', 50), t('B', 50), t('C', 40)])
    expect(p.winner).toEqual({ name: 'A & B', total: 50, isTie: true })
    expect(p.second).toBeNull()
    expect(p.third).toEqual({ name: 'C', total: 40, isTie: false })
  })

  it('three-way tie for 1st: no lower places', () => {
    const p = buildPodium([t('A', 5), t('B', 5), t('C', 5), t('D', 1)])
    expect(p.winner).toEqual({ name: 'A & B & C', total: 5, isTie: true })
    expect(p.second).toBeNull()
    expect(p.third).toBeNull()
  })

  it('all tied: everyone co-wins, nothing below', () => {
    const p = buildPodium([t('A', 7), t('B', 7)])
    expect(p.winner.isTie).toBe(true)
    expect(p.second).toBeNull()
    expect(p.third).toBeNull()
  })

  it('tie for 2nd: both share 2nd, 3rd is skipped', () => {
    const p = buildPodium([t('A', 50), t('B', 40), t('C', 40), t('D', 30)])
    expect(p.second).toEqual({ name: 'B & C', total: 40, isTie: true })
    expect(p.third).toBeNull()
  })

  it('tie for 3rd: both share 3rd', () => {
    const p = buildPodium([t('A', 50), t('B', 40), t('C', 30), t('D', 30), t('E', 5)])
    expect(p.third).toEqual({ name: 'C & D', total: 30, isTie: true })
  })

  it('a team on 0 never takes a lower place', () => {
    const p = buildPodium([t('A', 10), t('B', 0), t('C', 0)])
    expect(p.winner.name).toBe('A')
    expect(p.second).toBeNull()
    expect(p.third).toBeNull()
  })

  it('a blank-named team never takes a lower place', () => {
    const p = buildPodium([t('A', 10), t('  ', 8), t('C', 6)])
    expect(p.second).toBeNull()
    expect(p.third).toEqual({ name: 'C', total: 6, isTie: false })
  })

  it('tolerates missing/NaN totals (team with no score row) as 0', () => {
    const p = buildPodium([{ id: 1, name: 'A', total: 10 }, { id: 2, name: 'B' }, { id: 3, name: 'C', total: NaN }])
    expect(p.winner.name).toBe('A')
    expect(p.second).toBeNull()
  })

  it('does not mutate the input', () => {
    const input = [t('B', 1), t('A', 2)]
    buildPodium(input)
    expect(input.map(x => x.name)).toEqual(['B', 'A'])
  })
})

describe('lowerBeats', () => {
  it('runs 3rd then 2nd, skipping empty places', () => {
    expect(lowerBeats(buildPodium([t('A', 3), t('B', 2), t('C', 1)]))).toEqual(['third', 'second'])
    expect(lowerBeats(buildPodium([t('A', 3), t('B', 2)]))).toEqual(['second'])
    expect(lowerBeats(buildPodium([t('A', 3), t('B', 3), t('C', 1)]))).toEqual(['third'])
    expect(lowerBeats(buildPodium([t('A', 3)]))).toEqual([])
    expect(lowerBeats({ noData: true })).toEqual([])
  })
})

describe('buildPodium: blank names', () => {
  it('never announces a blank-name leader, and keeps its place', () => {
    const p = buildPodium([{ name: '', total: 50 }, { name: 'A', total: 40 }, { name: 'B', total: 30 }])
    expect(p).toEqual({ noData: true })
  })

  it('drops a blank name from a tie for first instead of printing "Team & "', () => {
    const p = buildPodium([{ name: '  ', total: 50 }, { name: 'A', total: 50 }])
    expect(p.winner).toEqual({ name: 'A', total: 50, isTie: false })
  })

  it('reports noData when only blank rows have points', () => {
    expect(buildPodium([{ name: '', total: 9 }])).toEqual({ noData: true })
  })
})
