import { describe, it, expect } from 'vitest'
import { migrateShinyTitleSlides } from './shinyTitleMigration.js'

const slide = (id, order, type = 'question', data = {}, roundId = 'r1') => ({ id, order, type, roundId, data })
let n = 0
const opts = () => ({ newGroupId: () => `g${++n}`, newSlideId: () => `t${++n}` })

describe('migrateShinyTitleSlides', () => {
  it('inserts a shiny-title before a shinyGroupId group and strips the old swap flags', () => {
    const grp = { isShiny: true, shinyGroupId: 'sg1', shinyFormatId: 'f1', shinyFormatName: 'Close Up', shinyFormatIcon: '🔍', seriesTheme: 'Dog Edition' }
    const slides = [
      slide('q1', 0, 'question', {}),
      slide('a', 1, 'question', { ...grp, introDone: true, outroShown: true, introSubtitle: 'Woof', hostPhotoUrl: 'ben.png' }),
      slide('b', 2, 'question', { ...grp, introDone: false }),
      slide('q2', 3, 'question', {}),
    ]
    const { slides: out, inserted, stripped, changed } = migrateShinyTitleSlides(slides, opts())
    expect(changed).toBe(true)
    expect(out.map(s => s.id)).toEqual(['q1', expect.stringMatching(/^t/), 'a', 'b', 'q2'])
    expect(out.map(s => s.order)).toEqual([0, 1, 2, 3, 4])
    const title = out[1]
    expect(title.type).toBe('shiny-title')
    expect(title.roundId).toBe('r1')
    expect(title.data).toMatchObject({ isShiny: true, shinyGroupId: 'sg1', seriesTheme: 'Dog Edition', shinyFormatName: 'Close Up', shinyFormatIcon: '🔍', introSubtitle: 'Woof', hostPhotoUrl: 'ben.png' })
    expect(inserted).toHaveLength(1)
    expect(stripped).toBe(2)
    for (const id of ['a', 'b']) {
      const d = out.find(s => s.id === id).data
      expect(d).not.toHaveProperty('introDone')
      expect(d).not.toHaveProperty('outroShown')
    }
  })

  it('stamps a fresh shinyGroupId on a legacy series matched by the old format+theme heuristic', () => {
    const legacy = { isShiny: true, isSeries: true, shinyFormatId: 'f1', seriesTheme: 'Same Run', introDone: false }
    const slides = [slide('a', 0, 'question', legacy), slide('b', 1, 'question', legacy)]
    const { slides: out, stamped } = migrateShinyTitleSlides(slides, opts())
    expect(stamped).toBe(2)
    const [title, a, b] = out
    expect(title.type).toBe('shiny-title')
    expect(a.data.shinyGroupId).toBeTruthy()
    expect(a.data.shinyGroupId).toBe(b.data.shinyGroupId)
    expect(title.data.shinyGroupId).toBe(a.data.shinyGroupId)
  })

  it('gives a lone legacy shiny slide its own title, and leaves non-shiny slides untouched', () => {
    const slides = [slide('a', 0, 'question', { isShiny: true, shinyFormatName: 'One Hit', introDone: false }), slide('b', 1, 'round-intro', {})]
    const { slides: out } = migrateShinyTitleSlides(slides, opts())
    expect(out.map(s => s.type)).toEqual(['shiny-title', 'question', 'round-intro'])
    expect(out[0].data.seriesTheme).toBe('One Hit')
    // only its order moved (renumbered past the inserted title) — data untouched
    expect(out[2]).toEqual({ ...slides[1], order: 2 })
    expect(out[2].data).toBe(slides[1].data)
  })

  it('is idempotent — a migrated show comes back unchanged', () => {
    const grp = { isShiny: true, shinyGroupId: 'sg1', shinyFormatId: 'f1', shinyFormatName: 'Close Up', seriesTheme: 'Dog Edition', introDone: true }
    const first = migrateShinyTitleSlides([slide('a', 0, 'question', grp), slide('b', 1, 'question', grp)], opts())
    const second = migrateShinyTitleSlides(first.slides, opts())
    expect(second.changed).toBe(false)
    expect(second.inserted).toHaveLength(0)
    expect(second.slides).toEqual(first.slides)
  })

  it('keeps two adjacent runs of the same format separate when their group ids differ', () => {
    const base = { isShiny: true, isSeries: true, shinyFormatId: 'f1', seriesTheme: 'Same Format' }
    const slides = [
      slide('a', 0, 'question', { ...base, shinyGroupId: 'g1' }),
      slide('b', 1, 'question', { ...base, shinyGroupId: 'g2' }),
    ]
    const { slides: out } = migrateShinyTitleSlides(slides, opts())
    // Two groups, but the second is a repeat of the same format in the same
    // round — the old wizard baked introDone:true into it and it played no
    // announce card, so no title is inserted for it (see below).
    expect(out.map(s => s.type)).toEqual(['shiny-title', 'question', 'question'])
    expect(out[0].data.shinyGroupId).toBe('g1')
    expect(out[1].data.shinyGroupId).toBe('g1')
    expect(out[2].data.shinyGroupId).toBe('g2')
  })

  it('inserts one title per format per round — a repeat run in the same round gets none', () => {
    // The old wizard's formatAlreadyIntroducedThisRound baked introDone:true
    // into the second run of a format in a round, so it played NO announce
    // card. A round of N separately-added same-format questions must migrate
    // to ONE title, not N.
    const base = { isShiny: true, shinyFormatId: 'f1', shinyFormatName: 'Close Up', seriesTheme: 'Close Up' }
    const slides = [
      slide('a', 0, 'question', { ...base, shinyGroupId: 'g1', introDone: false }),
      slide('mid', 1, 'question', {}),
      slide('b', 2, 'question', { ...base, shinyGroupId: 'g2', introDone: true }),
      slide('c', 3, 'question', { ...base, shinyGroupId: 'g3', introDone: true }),
    ]
    const { slides: out, inserted } = migrateShinyTitleSlides(slides, opts())
    expect(inserted).toHaveLength(1)
    expect(out.map(s => s.id)).toEqual([expect.stringMatching(/^t/), 'a', 'mid', 'b', 'c'])
    // every group still keeps/gets its own id, and the flags are still stripped
    expect(out.filter(s => s.data.isShiny && s.type !== 'shiny-title').map(s => s.data.shinyGroupId)).toEqual(['g1', 'g2', 'g3'])
    for (const s of out) expect(s.data).not.toHaveProperty('introDone')
  })

  it('matches repeats on shinyFormatName when legacy rows have no shinyFormatId', () => {
    const base = { isShiny: true, shinyFormatName: 'Close Up', seriesTheme: 'Close Up' }
    const slides = [
      slide('a', 0, 'question', { ...base, shinyGroupId: 'g1' }),
      slide('b', 1, 'question', { ...base, shinyGroupId: 'g2' }),
    ]
    expect(migrateShinyTitleSlides(slides, opts()).inserted).toHaveLength(1)
  })

  it('gives the same format its own title in each round it appears in', () => {
    const base = { isShiny: true, shinyFormatId: 'f1', shinyFormatName: 'Close Up', seriesTheme: 'Close Up' }
    const slides = [
      slide('a', 0, 'question', { ...base, shinyGroupId: 'g1' }, 'r1'),
      slide('b', 1, 'question', { ...base, shinyGroupId: 'g2' }, 'r2'),
    ]
    const { slides: out, inserted } = migrateShinyTitleSlides(slides, opts())
    expect(inserted).toHaveLength(2)
    expect(out.map(s => s.type)).toEqual(['shiny-title', 'question', 'shiny-title', 'question'])
    expect(out[0].roundId).toBe('r1')
    expect(out[2].roundId).toBe('r2')
  })

  it('counts a title a show already has as that format\'s title for the round', () => {
    const base = { isShiny: true, shinyFormatId: 'f1', shinyFormatName: 'Close Up', seriesTheme: 'Close Up' }
    const slides = [
      slide('t0', 0, 'shiny-title', { ...base, shinyGroupId: 'g1' }),
      slide('a', 1, 'question', { ...base, shinyGroupId: 'g1' }),
      slide('b', 2, 'question', { ...base, shinyGroupId: 'g2' }),
    ]
    const { inserted } = migrateShinyTitleSlides(slides, opts())
    expect(inserted).toHaveLength(0)
  })
})
