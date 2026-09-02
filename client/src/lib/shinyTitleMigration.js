import { nanoid } from 'nanoid'
import { isShinySeriesSibling, buildShinyTitleSlide } from './shinySeries.js'

// Pure transform behind scripts/migrate-shiny-title-slides.mjs — the
// one-time migration of a show built under the OLD shiny architecture
// (every shiny content slide swapped ShinyIntroScreen in while
// data.introDone was false) to the standalone `shiny-title` slide
// (SPEC.md, 2026-09-01). Lives here, Supabase-free, so it can be unit
// tested next to the stepping/grouping code it has to agree with.
//
// For a show's `slides` array, in authored order:
//   - every consecutive run of shiny slides that isShinySeriesSibling ties
//     together is one group; a shiny slide with no sibling on either side is
//     a group of one. Non-shiny slides are left alone.
//   - a group with no shinyGroupId (legacy rows, matched by the old
//     format+theme heuristic) gets a fresh one stamped on every member, so
//     the title and its content group together everywhere else too.
//   - a group whose first slide is not already a `shiny-title` gets one
//     inserted immediately before it, built from that first member's
//     seriesTheme / shinyFormatName / shinyFormatIcon / introSubtitle /
//     hostPhotoUrl.
//   - introDone / outroShown are stripped from every shiny slide.
//   - `order` is renumbered 0..n-1 over the result.
// Idempotent: a group already led by a shiny-title slide is skipped, and a
// second pass over a migrated show changes nothing (`changed: false`).
//
// One title per FORMAT per ROUND, not one per group — mirroring the old
// wizard's own rule (formatAlreadyIntroducedThisRound). A second run of the
// same format in the same round was created with introDone: true baked in,
// so it played NO announce card; inserting a title per group would give a
// round of N separately-added same-format questions N announce cards where
// the show actually ran 1. The skipped groups are still stamped with a
// shinyGroupId and still have their flags stripped — they're real groups,
// just title-less, exactly like a repeat created today (withShinyGroupId).
// A `shiny-title` a show already has counts as that format's title for its
// round, which is what keeps a re-run idempotent.
export function migrateShinyTitleSlides(slides, { newGroupId = () => `sgrp_${nanoid(8)}`, newSlideId = () => `slide_${nanoid(8)}` } = {}) {
  const sorted = [...(slides ?? [])].sort((a, b) => a.order - b.order)
  const out = []
  const inserted = []
  let stripped = 0
  let stamped = 0
  let i = 0
  // roundId + format -> that format has already been announced in that round.
  const titledInRound = new Set()
  while (i < sorted.length) {
    const first = sorted[i]
    if (!first.data?.isShiny) { out.push(first); i++; continue }
    // Collect the run of siblings starting here.
    let j = i
    while (j + 1 < sorted.length && isShinySeriesSibling(sorted[j], sorted[j + 1])) j++
    let group = sorted.slice(i, j + 1)
    i = j + 1

    if (!group[0].data.shinyGroupId) {
      const gid = newGroupId()
      group = group.map(s => ({ ...s, data: { ...s.data, shinyGroupId: gid } }))
      stamped += group.length
    }
    group = group.map(s => {
      if (!('introDone' in s.data) && !('outroShown' in s.data)) return s
      const { introDone, outroShown, ...rest } = s.data
      stripped++
      return { ...s, data: rest }
    })

    const d0 = group[0].data
    // Legacy rows predating the format library have no shinyFormatId — fall
    // back to the name (then the theme, which is stamped as the format name).
    const fmtKey = `${group[0].roundId ?? ''}::${d0.shinyFormatId || d0.shinyFormatName || d0.seriesTheme || ''}`
    const alreadyTitled = titledInRound.has(fmtKey)
    titledInRound.add(fmtKey)

    if (group[0].type !== 'shiny-title' && !alreadyTitled) {
      const d = group[0].data
      const fmt = { id: d.shinyFormatId, name: d.shinyFormatName || d.seriesTheme || 'Shiny Question', icon: d.shinyFormatIcon }
      const title = buildShinyTitleSlide(fmt, d.shinyGroupId, group[0].roundId)
      title.id = newSlideId()
      title.data.seriesTheme = d.seriesTheme || d.shinyFormatName || 'Shiny Question'
      if (d.introSubtitle) title.data.introSubtitle = d.introSubtitle
      if (d.hostPhotoUrl !== undefined) title.data.hostPhotoUrl = d.hostPhotoUrl
      inserted.push({ id: title.id, title: title.data.seriesTheme, before: group[0].id, members: group.length })
      out.push(title)
    }
    out.push(...group)
  }
  const renumbered = out.map((s, idx) => s.order === idx ? s : { ...s, order: idx })
  const changed = inserted.length > 0 || stripped > 0 || stamped > 0 || renumbered.some((s, idx) => s !== sorted[idx])
  return { slides: renumbered, inserted, stripped, stamped, changed }
}
