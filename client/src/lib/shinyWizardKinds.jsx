import { nanoid } from 'nanoid'

// ── Shiny wizard kind registry ────────────────────────────────────────────
// Every bespoke-shape shiny format (one whose wizard behavior isn't the
// generic "how many assets + how do they relate" flow every image/audio/
// video/text/list format shares) gets ONE entry here, keyed by
// input_schema.type. AddSlideWizard.jsx reads this registry instead of
// repeating `shinyFmtType === 'grid'` / `=== 'venn'` checks across its
// derived-values block, its render block, and handleCreate — the actual
// bug class this fixes: venn was added to the old FIXED_SHAPE_TYPES Set
// months before anyone built its own asset-count control, and nothing
// forced those two facts to be declared in the same place (2026-09-01).
//
// matching/wager/order need no buildSlideData or extraControls of their
// own — they already fall through to AddSlideWizard's existing generic
// "flat single-asset" path (blank shape, filled in by MatchingBuilder/
// WagerBuilder/OrderBuilder after creation) once their asset count is
// pinned to 1. `hasOwnControls: false` just tells the wizard "don't show
// the generic count/relationship UI for this kind either" — they're here
// so FIXED_SHAPE_TYPES can be *derived* from this registry's keys instead
// of hand-maintained as a second, easy-to-forget list.
export const FIXED_SHAPE_KINDS = {
  matching: { hasOwnControls: false },
  wager:    { hasOwnControls: false },
  order:    { hasOwnControls: false },
  grid:     { hasOwnControls: true, extraControls: gridExtraControls, buildSlideData: buildGridSlide },
  venn:     { hasOwnControls: true, extraControls: vennExtraControls, buildSlideData: buildVennSlide },
  bendle:   { hasOwnControls: true, extraControls: bendleExtraControls, buildSlideData: buildBendleSlide },
}

// ── Grid ───────────────────────────────────────────────────────────────────

// ctx: { gridCols, setGridCols, gridRows, setGridRows }
export function gridExtraControls(ctx) {
  return (
    <div className="flex gap-4">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Columns</label>
        <div className="flex gap-2">
          {[1,2,3,4,5,6].map(n => (
            <button key={n} onClick={() => ctx.setGridCols(n)}
              className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-all ${ctx.gridCols === n ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{n}</button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Rows</label>
        <div className="flex gap-2">
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => ctx.setGridRows(n)}
              className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-all ${ctx.gridRows === n ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{n}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ctx: { qNum, roundId, afterId, gridCols, gridRows, selectedShinyFmt,
//        shinyQuestion, shinyAnswer }
// No introDone here (or in buildVennSlide): the announce card is a real
// `shiny-title` slide AddSlideWizard prepends to whatever this returns.
export function buildGridSlide(ctx) {
  const columns = Array.from({ length: ctx.gridCols }, () =>
    Array.from({ length: ctx.gridRows }, () => ({ color: null, mediaUrl: null }))
  )
  const fmt = ctx.selectedShinyFmt
  const data = {
    questionNumber:  ctx.qNum,
    questionLabel:   `Q${ctx.qNum}`,
    questionMode:    'shiny',
    isShiny:         true,
    shinyFormatId:   fmt.id,
    shinyFormatName: fmt.name,
    shinyFormatIcon: fmt.icon,
    columns,
    intraGap:     0,
    interGap:     84,
    columnLabels: fmt.input_schema?.columnLabels !== false,
    text:         ctx.shinyQuestion.trim(),
    answer:       ctx.shinyAnswer.trim(),
  }
  return { type: 'grid', roundId: ctx.roundId ?? null, afterSlideId: ctx.afterId, data }
}

// ── Venn ─────────────────────────────────────────────────────────────────

// ctx: { vennSlideCount, setVennSlideCount, vennNum, vennPerSide, setVennPerSide }
export function vennExtraControls(ctx) {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">How many separate questions?</label>
        <input
          autoFocus
          type="number"
          min={1}
          max={20}
          value={ctx.vennSlideCount}
          onChange={e => ctx.setVennSlideCount(e.target.value)}
          placeholder="1"
          className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-900 text-center focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {ctx.vennNum > 1 && (
          <p className="text-[11px] text-gray-400 mt-1">
            Creates {ctx.vennNum} separate Venn questions — fill each one in from the slide editor.
          </p>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">How many per side?</label>
        <div className="flex gap-2">
          {[2,3,4,5,6].map(n => (
            <button key={n} onClick={() => ctx.setVennPerSide(n)}
              className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-all ${ctx.vennPerSide === n ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>{n}</button>
          ))}
        </div>
      </div>
    </>
  )
}

// ctx: { qNum, roundId, afterId, vennPerSide, vennSlideCount,
//        selectedShinyFmt, shinyQuestion, shinyAnswer }
export function buildVennSlide(ctx) {
  const fmt = ctx.selectedShinyFmt
  const vennNum = Math.min(20, Math.max(1, parseInt(ctx.vennSlideCount, 10) || 1))
  const castArr = () => Array.from({ length: ctx.vennPerSide }, () => ({ name: '', mediaUrl: null }))

  if (vennNum > 1) {
    // N separate standalone venn slides — same shinyGroupId/isSeries shape
    // as the generic 'separate' relationship path, just for a fixed-shape
    // format that never reaches that code.
    const groupId = `sgrp_${nanoid(8)}`
    const slides = Array.from({ length: vennNum }, (_, i) => ({
      type: 'venn',
      roundId: ctx.roundId ?? null,
      data: {
        questionNumber:  ctx.qNum + i,
        questionLabel:   `Q${ctx.qNum + i}`,
        questionMode:    'shiny',
        isShiny:         true,
        shinyFormatId:   fmt.id,
        shinyFormatName: fmt.name,
        shinyFormatIcon: fmt.icon,
        isSeries:        true,
        seriesTheme:     fmt.name,
        shinyGroupId:    groupId,
        leftCast:  castArr(),
        rightCast: castArr(),
        text:      '',
        answer:    '',
      },
    }))
    return { afterSlideId: ctx.afterId, slides }
  }

  const data = {
    questionNumber:  ctx.qNum,
    questionLabel:   `Q${ctx.qNum}`,
    questionMode:    'shiny',
    isShiny:         true,
    shinyFormatId:   fmt.id,
    shinyFormatName: fmt.name,
    shinyFormatIcon: fmt.icon,
    leftCast:  castArr(),
    rightCast: castArr(),
    text:      ctx.shinyQuestion.trim(),
    answer:    ctx.shinyAnswer.trim(),
  }
  return { type: 'venn', roundId: ctx.roundId ?? null, afterSlideId: ctx.afterId, data }
}

// ── Bendle ───────────────────────────────────────────────────────────────

// ctx: { bendleSongs, bendleSongId, setBendleSongId }
export function bendleExtraControls(ctx) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">Song</label>
      <select
        value={ctx.bendleSongId ?? ''}
        onChange={e => ctx.setBendleSongId(e.target.value || null)}
        className="w-full border border-gray-200 rounded-lg px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
      >
        <option value="">Pick a song…</option>
        {(ctx.bendleSongs ?? []).map(s => (
          <option key={s.id} value={s.id}>{s.title}</option>
        ))}
      </select>
      {(ctx.bendleSongs ?? []).length === 0 && (
        <p className="text-[11px] text-gray-400 mt-1">
          No songs prepped yet — upload stems from the Bendle admin panel first.
        </p>
      )}
    </div>
  )
}

// ctx: { qNum, roundId, afterId, selectedShinyFmt, shinyQuestion, bendleSongId, bendleSongs }
export function buildBendleSlide(ctx) {
  const fmt = ctx.selectedShinyFmt
  const song = (ctx.bendleSongs ?? []).find(s => s.id === ctx.bendleSongId)
  const data = {
    questionNumber:  ctx.qNum,
    questionLabel:   `Q${ctx.qNum}`,
    questionMode:    'shiny',
    isShiny:         true,
    shinyFormatId:   fmt.id,
    shinyFormatName: fmt.name,
    shinyFormatIcon: fmt.icon,
    shinyInputSchema: fmt.input_schema ?? { type: 'bendle' },
    bendleSongId:    ctx.bendleSongId ?? null,
    text:            ctx.shinyQuestion.trim(),
    answer:          song?.answer ?? '',
    bendleGuessesLocked: false,
    bendleRevealed:      false,
  }
  return { type: 'question', roundId: ctx.roundId ?? null, afterSlideId: ctx.afterId, data }
}
