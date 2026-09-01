# Shiny Wizard Kind Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `AddSlideWizard.jsx`'s scattered per-format `if (shinyFmtType === 'x')` branches (spread across the derived-values block, the render block, and `handleCreate`) with one declarative registry — `client/src/lib/shinyWizardKinds.jsx` — that each bespoke-shape format's behavior lives in as a single, testable entry, so adding or auditing a format's wizard behavior means reading/editing one file instead of hunting through four sections of a 1000+ line component.

**Architecture:** Extract the two currently-bespoke formats' logic (grid, venn) into named pure functions (`buildGridSlide`, `buildVennSlide`, `gridExtraControls`, `vennExtraControls`) living in a new registry module, keyed by `input_schema.type`. `AddSlideWizard.jsx` looks up the current format's registry entry once and calls through it instead of repeating `shinyFmtType === 'grid'` / `=== 'venn'` checks in multiple places. Matching/wager/order get a registry entry too (`{ hasOwnControls: false }`) — they don't need their own builder because they already fall through to the existing generic "flat single-asset" path; giving them an entry just makes `FIXED_SHAPE_TYPES` (a Set that has to be kept in sync with reality by hand) derivable from the registry's keys instead. Zero behavior change: every task's regression gate is "produces the exact same `onAddSlide` argument object as the current code," verified by unit tests on the extracted pure functions before they're ever wired into the component.

**Tech Stack:** React + Vite, Vitest for unit tests, no new dependencies.

**Spec:** No separate spec doc — captured live in conversation with Ben, 2026-09-01. He named the actual pain point directly: "i dont really know why its gated to certain questions and such" — the wizard's format-specific behavior (which controls show, what data gets built) is invisible/undiscoverable without reading scattered code, and every time a new bespoke format (grid, then venn) got added, at least one piece of its wizard behavior was missed until Ben hit it live (venn's missing asset-count control, discovered and fixed earlier this session). A prior research pass (forked agent, this session) surveyed every shiny kind's wizard/editor/render scaffolding and confirmed: generic image/audio/video/text/list already share one correct handler; matching/wager/order share a "no wizard controls, blank slide, filled in later" shape with zero further code in common; grid/venn share a "own count controls, own top-level slide type" shape with genuinely different data structures. Recommendation from that research, followed here: give matching/wager/order and grid/venn each their own registry entries rather than forcing a fake shared abstraction across groups — the goal is one place to *look*, not fewer lines of bespoke code.

## Global Constraints

- Zero behavior change. This is a structural refactor, not a feature change — every existing format (image/audio/video/text/list × sequential/concurrent/separate, matching, wager, order, grid, venn single, venn per-side, venn batch) must produce byte-identical `onAddSlide` call arguments before and after.
- No new dependencies.
- Follow the existing file's conventions: plain functions (not classes), Tailwind utility classes copied verbatim from existing JSX for any relocated UI, comments explaining *why* not *what* (matches this file's existing comment style — see the `FIXED_SHAPE_TYPES` comment block at the top of `AddSlideWizard.jsx` for the tone to match).
- Runtime dispatch (`SlideRenderer.jsx`, `QuestionSlide.jsx`'s `isXShiny` flags, `Join.jsx`) is explicitly OUT OF SCOPE. This plan only touches the wizard's *creation-time* code (`AddSlideWizard.jsx` + the new registry module). Don't touch `SlideEditor.jsx`'s post-creation editors, `FormatLibrary.jsx`, or any TV/phone renderer.

---

### Task 1: Extract grid + venn creation logic into a tested, standalone registry module

**Files:**
- Create: `client/src/lib/shinyWizardKinds.jsx`
- Test: `client/src/lib/shinyWizardKinds.test.js`
- Read (don't modify yet): `client/src/components/host/AddSlideWizard.jsx:182-379` (current handleCreate shiny branch — this is the exact logic being relocated)

**Interfaces:**
- Produces: `FIXED_SHAPE_KINDS` (plain object, keyed by `input_schema.type` string: `'matching' | 'wager' | 'order' | 'grid' | 'venn'`), each value shaped `{ hasOwnControls: boolean, extraControls?: (ctx) => JSX.Element | null, buildSlideData?: (ctx) => object }`. Also produces standalone exports `buildGridSlide(ctx)`, `buildVennSlide(ctx)`, `gridExtraControls(ctx)`, `vennExtraControls(ctx)` (the registry's `grid`/`venn` entries just reference these).
- Consumes: nothing from other tasks — this task is self-contained and ships with zero call sites yet.

This task does NOT touch `AddSlideWizard.jsx`. It only creates and tests the new module in isolation — the safest possible order, since the extracted functions are unit-testable without React/DOM, and Task 2 becomes a pure "delete old code, call new code" mechanical change that can be diffed for exactness once this task's tests already prove the new code is correct.

- [ ] **Step 1: Write the failing test file**

Create `client/src/lib/shinyWizardKinds.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { FIXED_SHAPE_KINDS, buildGridSlide, buildVennSlide } from './shinyWizardKinds.jsx'

const baseFmt = { id: 'fmt_1', name: 'Test Format', icon: '✨' }

describe('FIXED_SHAPE_KINDS registry', () => {
  it('has exactly the five known fixed-shape kinds', () => {
    expect(Object.keys(FIXED_SHAPE_KINDS).sort()).toEqual(['grid', 'matching', 'order', 'venn', 'wager'])
  })

  it('matching/wager/order have no own controls or builder — they fall through to the generic flat-asset path', () => {
    for (const kind of ['matching', 'wager', 'order']) {
      expect(FIXED_SHAPE_KINDS[kind].hasOwnControls).toBe(false)
      expect(FIXED_SHAPE_KINDS[kind].buildSlideData).toBeUndefined()
    }
  })

  it('grid and venn have their own controls and builder', () => {
    for (const kind of ['grid', 'venn']) {
      expect(FIXED_SHAPE_KINDS[kind].hasOwnControls).toBe(true)
      expect(typeof FIXED_SHAPE_KINDS[kind].buildSlideData).toBe('function')
    }
  })
})

describe('buildGridSlide', () => {
  it('builds a 2D columns array sized cols x rows, with the format metadata and trimmed text/answer', () => {
    const result = buildGridSlide({
      qNum: 3,
      roundId: 'round_1',
      afterId: 'slide_before',
      gridCols: 2,
      gridRows: 3,
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'grid', columnLabels: true } },
      shinyQuestion: '  What connects these?  ',
      shinyAnswer: '  Golf terms  ',
      formatAlreadyIntroducedThisRound: () => false,
    })
    expect(result).toEqual({
      type: 'grid',
      roundId: 'round_1',
      afterSlideId: 'slide_before',
      data: {
        questionNumber: 3,
        questionLabel: 'Q3',
        questionMode: 'shiny',
        isShiny: true,
        introDone: false,
        shinyFormatId: 'fmt_1',
        shinyFormatName: 'Test Format',
        shinyFormatIcon: '✨',
        columns: [
          [{ color: null, mediaUrl: null }, { color: null, mediaUrl: null }, { color: null, mediaUrl: null }],
          [{ color: null, mediaUrl: null }, { color: null, mediaUrl: null }, { color: null, mediaUrl: null }],
        ],
        intraGap: 0,
        interGap: 84,
        columnLabels: true,
        text: 'What connects these?',
        answer: 'Golf terms',
      },
    })
  })

  it('defaults columnLabels to true when the format schema does not set it to false', () => {
    const result = buildGridSlide({
      qNum: 1, roundId: null, afterId: null, gridCols: 1, gridRows: 1,
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'grid' } },
      shinyQuestion: '', shinyAnswer: '',
      formatAlreadyIntroducedThisRound: () => true,
    })
    expect(result.data.columnLabels).toBe(true)
    expect(result.data.introDone).toBe(true)
  })
})

describe('buildVennSlide', () => {
  it('builds a single venn slide with leftCast/rightCast sized to vennPerSide when vennSlideCount is 1', () => {
    const result = buildVennSlide({
      qNum: 5,
      roundId: 'round_1',
      afterId: 'slide_before',
      vennPerSide: 3,
      vennSlideCount: '1',
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'venn' } },
      shinyQuestion: 'Name the movie',
      shinyAnswer: 'The Joker - Steve Miller Band',
      formatAlreadyIntroducedThisRound: () => false,
    })
    expect(result).toEqual({
      type: 'venn',
      roundId: 'round_1',
      afterSlideId: 'slide_before',
      data: {
        questionNumber: 5,
        questionLabel: 'Q5',
        questionMode: 'shiny',
        isShiny: true,
        introDone: false,
        shinyFormatId: 'fmt_1',
        shinyFormatName: 'Test Format',
        shinyFormatIcon: '✨',
        leftCast: [{ name: '', mediaUrl: null }, { name: '', mediaUrl: null }, { name: '', mediaUrl: null }],
        rightCast: [{ name: '', mediaUrl: null }, { name: '', mediaUrl: null }, { name: '', mediaUrl: null }],
        text: 'Name the movie',
        answer: 'The Joker - Steve Miller Band',
      },
    })
  })

  it('builds N separate standalone venn slides sharing one shinyGroupId when vennSlideCount > 1, each blank', () => {
    const result = buildVennSlide({
      qNum: 5,
      roundId: 'round_1',
      afterId: 'slide_before',
      vennPerSide: 2,
      vennSlideCount: '3',
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'venn' } },
      shinyQuestion: 'ignored for batch',
      shinyAnswer: 'ignored for batch',
      formatAlreadyIntroducedThisRound: () => false,
    })
    expect(result.afterSlideId).toBe('slide_before')
    expect(result.slides).toHaveLength(3)
    const groupId = result.slides[0].data.shinyGroupId
    expect(groupId).toMatch(/^sgrp_/)
    result.slides.forEach((slide, i) => {
      expect(slide.type).toBe('venn')
      expect(slide.roundId).toBe('round_1')
      expect(slide.data.questionNumber).toBe(5 + i)
      expect(slide.data.questionLabel).toBe(`Q${5 + i}`)
      expect(slide.data.shinyGroupId).toBe(groupId)
      expect(slide.data.isSeries).toBe(true)
      expect(slide.data.leftCast).toHaveLength(2)
      expect(slide.data.rightCast).toHaveLength(2)
      expect(slide.data.text).toBe('')
      expect(slide.data.answer).toBe('')
      // Only the first slide of a run plays the announce beat.
      expect(slide.data.introDone).toBe(i > 0)
    })
  })

  it('clamps vennSlideCount and vennPerSide to sane bounds', () => {
    const result = buildVennSlide({
      qNum: 1, roundId: null, afterId: null, vennPerSide: 3, vennSlideCount: 'not a number',
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'venn' } },
      shinyQuestion: '', shinyAnswer: '',
      formatAlreadyIntroducedThisRound: () => false,
    })
    // Garbage input falls back to 1 (single slide), not a batch.
    expect(result.slides).toBeUndefined()
    expect(result.type).toBe('venn')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run client/src/lib/shinyWizardKinds.test.js`
Expected: FAIL — `Cannot find module './shinyWizardKinds.jsx'`

- [ ] **Step 3: Create the registry module**

Create `client/src/lib/shinyWizardKinds.jsx`:

```jsx
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
//        shinyQuestion, shinyAnswer, formatAlreadyIntroducedThisRound }
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
    introDone:       ctx.formatAlreadyIntroducedThisRound(fmt.id),
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
//        selectedShinyFmt, shinyQuestion, shinyAnswer,
//        formatAlreadyIntroducedThisRound }
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
        introDone:       i > 0 || ctx.formatAlreadyIntroducedThisRound(fmt.id),
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
    introDone:       ctx.formatAlreadyIntroducedThisRound(fmt.id),
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run client/src/lib/shinyWizardKinds.test.js`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Run the full suite to confirm no collateral breakage**

Run: `npx vitest run`
Expected: all existing tests still pass, plus the 7 new ones (435 total, up from 428 wherever the count sits when this task starts — confirm the delta is exactly +7, not more or fewer).

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/shinyWizardKinds.jsx client/src/lib/shinyWizardKinds.test.js
git commit -m "Add shiny wizard kind registry (grid + venn extracted, unit-tested, not yet wired)"
```

---

### Task 2: Wire `AddSlideWizard.jsx`'s `handleCreate` to the registry, deleting the inline grid/venn blocks

**Files:**
- Modify: `client/src/components/host/AddSlideWizard.jsx:182-264` (delete the inline `isGrid`/`isVenn` blocks), `:1,47` (import the registry, delete `FIXED_SHAPE_TYPES` Set), `:436` (derive `isFixedShapeFmt` from the registry)
- Read: `client/src/lib/shinyWizardKinds.jsx` (from Task 1 — already tested, treat as ground truth)

**Interfaces:**
- Consumes: `FIXED_SHAPE_KINDS` from Task 1's module.
- Produces: `handleCreate`'s behavior is unchanged from the outside (same `onAddSlide` calls for every kind) — this task has no new exports, it's a like-for-like swap.

- [ ] **Step 1: Import the registry and delete the old Set**

In `client/src/components/host/AddSlideWizard.jsx`, add near the top imports:

```js
import { FIXED_SHAPE_KINDS } from '../../lib/shinyWizardKinds.jsx'
```

Delete this block (currently around line 36-47):

```js
// ── Shiny creation shape (2026-08-26 rebuild) ────────────────────────────────
// ... (the whole comment block)
const FIXED_SHAPE_TYPES = new Set(['matching', 'wager', 'order', 'venn', 'grid'])
```

Replace with a short comment pointing at the new source of truth:

```js
// Which formats skip the generic count/relationship UI, and what each
// bespoke one does instead, now lives in shinyWizardKinds.jsx — see that
// file's header comment for why (2026-09-01, replacing the hand-maintained
// FIXED_SHAPE_TYPES Set this used to be).
```

- [ ] **Step 2: Derive `isFixedShapeFmt` from the registry**

Find (currently around line 436):

```js
const isFixedShapeFmt = FIXED_SHAPE_TYPES.has(shinyFmtType)
```

Replace with:

```js
const fixedShapeKind = shinyFmtType ? FIXED_SHAPE_KINDS[shinyFmtType] : null
const isFixedShapeFmt = !!fixedShapeKind
```

- [ ] **Step 3: Delete the local `isVenn`/`vennNum` derived values (now redundant) — keep them only where still directly used**

The render-scope `isVenn`/`vennNum` (currently around lines 455-456) were added earlier today specifically to gate the two venn-only render blocks and the Answer field's `autoFocus`. Since the venn extra-controls block itself is being replaced by the registry call (Step 5 below), only the `autoFocus` use site still needs a venn check. Keep `isVenn` defined (it's one line, still reads clearly at that use site) but delete the now-unused `vennNum` — it was only ever consumed by the venn render block, which Step 5 removes:

```js
const isVenn = shinyFmtType === 'venn'
```

(Delete the `const vennNum = ...` line that follows it in the current code.)

- [ ] **Step 4: Replace the inline `isGrid`/`isVenn` blocks in `handleCreate` with registry calls**

Find the block starting `const isGrid = selectedShinyFmt.input_schema?.type === 'grid'` (currently line 185) through the `const isVenn = selectedShinyFmt.input_schema?.type === 'venn'` block's closing `return` (currently line 264) — this is the entire two-format special case handleCreate currently hardcodes. Replace the whole span with:

```js
        const kind = fixedShapeKind
        if (kind?.buildSlideData) {
          const afterId = insertAfterSlideId(roundSlides, sorted)
          await onAddSlide(kind.buildSlideData({
            qNum, roundId, afterId, selectedShinyFmt,
            shinyQuestion, shinyAnswer, formatAlreadyIntroducedThisRound,
            gridCols, gridRows, vennPerSide, vennSlideCount,
          }))
          return
        }
```

This one block now covers grid AND venn (and any future bespoke format that gets a `buildSlideData`) — the registry entry decides which builder actually runs, `handleCreate` no longer needs to know grid or venn exist by name.

- [ ] **Step 5: Replace the two hardcoded render blocks with one registry-driven call**

Find the two blocks (currently around lines 655-698): the `{isVenn && (...)}` "How many separate questions?" + "How many per side?" block, and the `{shinyFmtType === 'grid' && (...)}` Columns/Rows block. Delete both in full. Replace with:

```jsx
            {fixedShapeKind?.extraControls?.({
              gridCols, setGridCols, gridRows, setGridRows,
              vennSlideCount, setVennSlideCount, vennNum, vennPerSide, setVennPerSide,
            })}
```

Note `vennNum` is still needed here as a prop into `vennExtraControls` even though Step 3 removed it as a wizard-local derived value — compute it inline for this call site only:

```jsx
            {fixedShapeKind?.extraControls?.({
              gridCols, setGridCols, gridRows, setGridRows,
              vennSlideCount, setVennSlideCount,
              vennNum: Math.min(20, Math.max(1, parseInt(vennSlideCount, 10) || 1)),
              vennPerSide, setVennPerSide,
            })}
```

- [ ] **Step 6: Manually diff-check the extraction is byte-identical**

Run: `git diff client/src/components/host/AddSlideWizard.jsx client/src/lib/shinyWizardKinds.jsx`

Read the full diff. Confirm every line of logic that was deleted from `AddSlideWizard.jsx` has an exact counterpart already sitting (and already unit-tested, from Task 1) in `shinyWizardKinds.jsx` — this is a relocation, not a rewrite, so the diff should read as "delete this block here, it now lives there unchanged."

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: same pass count as the end of Task 1 (this task adds no new tests — it's a wiring change covered by Task 1's tests plus Task 3's parse check).

- [ ] **Step 8: Parse-check the modified file (no render test exists for this component)**

Run: `npx esbuild client/src/components/host/AddSlideWizard.jsx --bundle=false --outfile=/dev/null`
Expected: clean parse, no errors.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/host/AddSlideWizard.jsx
git commit -m "Wire AddSlideWizard to the shiny kind registry, delete inline grid/venn special cases"
```

---

### Task 3: Fable overseer pass — behavioral-equivalence review + ease/function recommendations

This task has no code changes of its own. It's the explicit second opinion Ben asked for: "invoking... fable 5 as overseer and recomender on ease and function. ensure no regression at all."

- [ ] **Step 1: Dispatch a fable-model review**

Prompt the review agent (model: fable) with:
- The full diff from Tasks 1-2 (`git diff` against the commit before Task 1 started).
- Explicit instruction: verify byte-for-byte behavioral equivalence between the old inline `handleCreate` blocks (quote them from git history/the diff's removed lines) and the new registry functions, for every one of: grid single-asset, venn single (perSide 2/3/4/5/6), venn batch (slideCount 2-20), matching/wager/order (confirm they still fall through to the untouched generic flat-asset path exactly as before — this task touched zero lines of that path, but confirm the `isFixedShapeFmt` derivation change didn't accidentally affect them).
- Separately (not blocking the regression verdict): ease-of-use and function recommendations — does the registry shape itself make sense, is there a clearer way to express `hasOwnControls`/`buildSlideData`/`extraControls`, would a future bespoke format (a 4th "own-slide-type" kind, say) slot in cleanly or would it strain this shape? Report as suggestions, not requirements — Ben decides what to act on.

- [ ] **Step 2: Address any CONFIRMED regression finding**

If Fable's review surfaces a real behavioral difference (not a stylistic opinion), fix it with a single targeted change, re-run the full test suite, and re-request Fable's review of just that fix before considering Task 3 done. If Fable's review is UX/ease suggestions only (no regression), record them in the final report to Ben — do not implement speculative suggestions without his sign-off.

- [ ] **Step 3: Final full verification**

Run: `npx vitest run` and `npx esbuild client/src/components/host/AddSlideWizard.jsx --bundle=false --outfile=/dev/null` one more time after any fixes from Step 2.

---

## Self-Review

**Spec coverage:** Ben's ask was (1) refactor the wizard so format-specific behavior isn't scattered/opaque, (2) Opus builds, (3) Fable overseers for ease/function and regression. Task 1 (extraction + tests) and Task 2 (wiring) cover (1); Task 3 covers (2)-(3) explicitly. No gaps against what was actually asked. Runtime dispatch unification (the `own-slide-type` vs `question-flag` fork the research pass found) is a real but separate finding — noted as an explicit non-goal in Global Constraints rather than silently expanded scope, since Ben's complaint was specifically about the wizard, not the renderers.

**Placeholder scan:** No TBD/TODO markers; every step has real, complete code, not descriptions of code.

**Type consistency:** `ctx` object shape is consistent across `gridExtraControls`/`buildGridSlide`/`vennExtraControls`/`buildVennSlide` and their call sites in Task 2 — same key names throughout (`qNum`, `roundId`, `afterId`, `selectedShinyFmt`, `shinyQuestion`, `shinyAnswer`, `formatAlreadyIntroducedThisRound`, `gridCols`/`gridRows`, `vennPerSide`/`vennSlideCount`/`vennNum`).
