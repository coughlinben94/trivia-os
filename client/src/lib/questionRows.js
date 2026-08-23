import { supabase } from './supabase.js'

// Replaces the 6 scattered archiveQuestion/archiveQuestions call sites in
// AddSlideWizard.jsx and BuildMode.jsx (council review, 2026-08-23 — see
// git history for the full design rationale). One extraction function, one
// batch writer, fired only on goLive/goLiveFrom and a manual "Sync archive"
// button — never per-edit. slide_id + a partial unique index on
// (show_id, slide_id) make every write idempotent: upsert with
// ignoreDuplicates never overwrites a row a host hand-edited in /questions.

function blank(s) {
  return !s || !String(s).trim()
}

function roundFor(show, roundId) {
  return show.rounds?.find(r => r.id === roundId) ?? null
}

// Returns a `questions` row for one slide, or null if there's nothing
// genuinely archivable yet (blank/unfinished content). Never throws.
export function slideToArchiveRow(slide, show) {
  const data = slide.data ?? {}
  const round = roundFor(show, slide.roundId)
  const roundType = round?.roundType ?? 'normal'

  const base = {
    slide_id: slide.id,
    show_id: show.id,
    show_title: show.title,
    show_date: show.date ?? null,
    round_type: roundType === 'normal' ? null : roundType,
    round_title: round?.title ?? null,
  }

  switch (slide.type) {
    case 'question': {
      // Series slide — two real shapes share this data.parts structure:
      //  - independent-answer (Drunk History): each part has its own text+answer
      //  - shared-answer (We're not so different): one top-level data.answer,
      //    parts carry only media/label, no per-part text or answer
      if (data.isSeries && Array.isArray(data.parts)) {
        const hasSharedAnswer = !blank(data.answer)
        const partsWithAnswer = data.parts.filter(p => !blank(p.text) || !blank(p.answer))
        if (!hasSharedAnswer && !partsWithAnswer.length) return null
        const partsRow = (hasSharedAnswer ? data.parts : partsWithAnswer).map(p => ({
          label: p.label || null,
          text: p.text?.trim() ?? '',
          answer: p.answer?.trim() ?? '',
          mediaCount: p.mediaSlots?.length ?? 0,
        }))
        return {
          ...base,
          type: 'shiny',
          is_shiny: true,
          shiny_type: data.shinyType ?? null,
          shiny_format_name: data.shinyFormatName ?? null,
          text: data.text?.trim() || null,
          answer: hasSharedAnswer ? data.answer.trim() : null,
          questions_data: partsRow,
        }
      }

      // Matching pairs (Drag and Drop) — built post-creation in SlideEditor,
      // so this only produces a row once the host has actually filled pairs in.
      if (Array.isArray(data.pairs)) {
        const pairs = data.pairs.filter(p => !blank(p.left) || !blank(p.right))
        if (!pairs.length) return null
        return {
          ...base,
          type: 'shiny',
          is_shiny: true,
          shiny_type: data.shinyType ?? 'matching',
          shiny_format_name: data.shinyFormatName ?? null,
          questions_data: pairs,
        }
      }

      // Flat question — regular, most shiny formats, and swing/PYL round items
      // (which reuse the plain 'question' slide type — the round they belong
      // to, not data.isShiny, decides the archived `type`).
      if (blank(data.text) && blank(data.answer)) return null
      const type = data.isShiny
        ? 'shiny'
        : roundType === 'pyl' ? 'pyl'
        : roundType === 'swing' ? 'swing'
        : 'regular'
      return {
        ...base,
        type,
        text: data.text?.trim() ?? null,
        answer: data.answer?.trim() ?? null,
        is_bonus: !!data.isBonus,
        is_shiny: !!data.isShiny,
        shiny_type: data.shinyType ?? null,
        shiny_format_name: data.shinyFormatName ?? null,
        ...(data.pylTheme ? { category: data.pylTheme } : {}),
      }
    }

    case 'grid': {
      if (blank(data.text) && blank(data.answer)) return null
      return {
        ...base,
        type: 'shiny',
        text: data.text?.trim() ?? null,
        answer: data.answer?.trim() ?? null,
        is_shiny: true,
        shiny_type: data.shinyType ?? 'image',
        shiny_format_name: data.shinyFormatName ?? null,
      }
    }

    case 'venn': {
      if (blank(data.text) && blank(data.answer)) return null
      return {
        ...base,
        type: 'shiny',
        text: data.text?.trim() ?? null,
        answer: data.answer?.trim() ?? null,
        is_shiny: true,
        shiny_type: 'venn',
        shiny_format_name: data.shinyFormatName ?? null,
        questions_data: { leftCast: data.leftCast ?? [], rightCast: data.rightCast ?? [] },
      }
    }

    case 'pyl-reveal': {
      if (blank(data.themeName)) return null
      return {
        ...base,
        type: 'pyl',
        text: data.themeName,
        answer: data.themeType ?? null,
      }
    }

    // pyl-lotto (bare), pyl-board (theme-picker nav board), grading-break,
    // custom, winner-reveal, etc — not archivable trivia content.
    default:
      return null
  }
}

// Maps every slide in a show through slideToArchiveRow and writes the
// survivors in one batch. Safe to call repeatedly — ignoreDuplicates means an
// existing (show_id, slide_id) row is never touched again once archived, so
// a hand-edit made later in /questions can't be clobbered by a re-Go-Live.
export async function archiveShow(show) {
  if (!show?.slides?.length) return true
  const rows = show.slides.map(slide => slideToArchiveRow(slide, show)).filter(Boolean)
  if (!rows.length) return true
  const { error } = await supabase
    .from('questions')
    .upsert(rows, { onConflict: 'show_id,slide_id', ignoreDuplicates: true })
  if (error) console.warn('[archive] archiveShow failed:', error.message)
  return !error
}
