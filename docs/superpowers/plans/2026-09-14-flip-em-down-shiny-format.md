# "Flip 'Em Down!" Shiny Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Trivia OS shiny question format — 8 celebrity faces on screen, 3 host-paced hints narrow the field to one, host speaks the answer aloud.

**Architecture:** New top-level slide type `flip-em-down` (same tier as `grid`/`venn` — its own `SLIDE_COMPONENTS` entry, rendered outside `QuestionSlide.jsx`). Reveal state is a plain `data.elimStep` integer (0-3) flipped by a dedicated host button in `LiveMode.jsx`, copying `ShinyWagerQuestion`'s "own local reveal field, not the shared parts/groupSize stepping system" pattern — confirmed by reading the actual `isConcurrentShiny`/`isConcurrentMediaShiny` code that the shared stepping system only does per-press cumulative reveal for `shinyInputSchema.type === 'text'`. Item/hint authoring lives in a new `ElimEditor` function inside `SlideEditor.jsx`, following `VennEditor`'s exact shape (per-item image + label fields, `writeX`/`scheduleSave` pattern) — but fixed at 8 items / 3 hints, no host-editable count, so it needs no wizard "how many" step at all.

**Tech Stack:** React 18, Vite, Tailwind, Framer Motion, Supabase (project `qwtbgusqfoypvehnungr`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-flip-em-down-shiny-spec.md`

## Global Constraints

- Fixed shape: exactly 8 items, exactly 3 hints. No host-editable counts anywhere in this format.
- GPU-only animation — only `transform`/`opacity` animate; `filter: grayscale(1)` is allowed only as a static end-state, never animated (Critical Rule 2, `references/trivia-os/SKILL.md`).
- Every animated element needs a `prefers-reduced-motion` fallback (opacity-only, no scale/rotate).
- `EASE_OUT` from `client/src/lib/easings.js` for all entrance/state-change motion — never a locally redeclared curve.
- Headline/body text reads `theme.fonts.display`/`theme.fonts.body`, never a hardcoded font family.
- No `introDone` field and no `ShinyIntroScreen` call in the new display component — the announce card is the separate, auto-prepended `shiny-title` slide every shiny format gets for free via `AddSlideWizard.jsx`'s `addShiny()`.
- Answer grading rides the existing generic `AnswerRevealOverlay` (`Display.jsx`) — it reads `currentSlide.data.answer` regardless of slide type, so no new grading UI.
- Center 60%×45% of `/display` stays clear of ambient decoration (Critical Rule 6) — not directly relevant here since this format IS the center content, but the face grid + hint captions must together respect the same footprint discipline the rest of `/display` uses.

---

## Task 1: Seed the `shiny_formats` row

**Files:** none (Supabase MCP `execute_sql` against project `qwtbgusqfoypvehnungr`)

**Interfaces:**
- Produces: a `shiny_formats` row whose `id` every later task's UI references by picking "Flip 'Em Down!" in the format library — no code depends on knowing the literal id string, so no interface to hand downstream tasks beyond "the row exists with `input_schema.type = 'elimination'`."

- [ ] **Step 1: Insert the row**

Run via the Supabase MCP tool (`execute_sql`, project `qwtbgusqfoypvehnungr`):

```sql
insert into shiny_formats (id, name, icon, description, input_schema)
values (
  'fmt_' || substr(md5(random()::text), 1, 8),
  'Flip ''Em Down!',
  '🫥',
  '8 celebrity faces, 3 hints narrow it to one — write the survivor.',
  '{"type": "elimination", "slots": 8}'::jsonb
)
returning id, name, input_schema;
```

- [ ] **Step 2: Verify**

Run: `select id, name, icon, input_schema from shiny_formats where input_schema->>'type' = 'elimination';`
Expected: one row back, `input_schema` = `{"type": "elimination", "slots": 8}`.

- [ ] **Step 3: Record the id**

Note the returned `id` (e.g. `fmt_a1b2c3d4`) in this plan file's Task 1 (edit this file, replace this line with the real id) — later manual-testing tasks pick the format by name in the UI, so no code needs it, but it's useful for direct DB checks.

---

## Task 2: `FIXED_SHAPE_KINDS.elimination` registry entry + `buildElimSlide`

**Files:**
- Modify: `client/src/lib/shinyWizardKinds.jsx`
- Test: `client/src/lib/shinyWizardKinds.test.js`

**Interfaces:**
- Consumes: `nanoid` (already imported at the top of `shinyWizardKinds.jsx`).
- Produces: `buildElimSlide(ctx)` where `ctx` is `{ qNum, roundId, afterId, selectedShinyFmt }` (a subset of the full ctx object `AddSlideWizard.jsx` already passes to every `buildSlideData` call — no wizard changes needed, it always passes every field, unused ones are ignored). Returns `{ type: 'flip-em-down', roundId, afterSlideId, data }` where `data` has `items: [{id, label, imageUrl}]` (8 entries), `hints: [{text, survivors}, {text, survivors}, {text}]` (3 entries), `elimStep: 0`, `answer: ''`, plus the standard `questionNumber/questionLabel/questionMode/isShiny/shinyFormatId/shinyFormatName/shinyFormatIcon` fields every shiny slide carries.

- [ ] **Step 1: Write the failing test**

Add to `client/src/lib/shinyWizardKinds.test.js`, in the existing `describe('FIXED_SHAPE_KINDS registry')` block, update the exact-keys assertion:

```js
  it('has exactly the eight known fixed-shape kinds', () => {
    expect(Object.keys(FIXED_SHAPE_KINDS).sort()).toEqual(['bendle', 'choice', 'elimination', 'grid', 'matching', 'order', 'venn', 'wager'])
  })
```
(replace the existing `'has exactly the seven known fixed-shape kinds'` test with this one — same test, updated name/count/list)

Then add a new top-level `describe` block and import, at the top of the file change:

```js
import { FIXED_SHAPE_KINDS, buildGridSlide, buildVennSlide, buildElimSlide } from './shinyWizardKinds.jsx'
```

```js
describe('elimination kind has no own controls but does have a builder', () => {
  it('has hasOwnControls: false and a buildSlideData function', () => {
    expect(FIXED_SHAPE_KINDS.elimination.hasOwnControls).toBe(false)
    expect(typeof FIXED_SHAPE_KINDS.elimination.buildSlideData).toBe('function')
  })
})

describe('buildElimSlide', () => {
  it('builds a flip-em-down slide with 8 blank items, 3 blank hints, elimStep 0', () => {
    const result = buildElimSlide({
      qNum: 5,
      roundId: 'round_1',
      afterId: 'slide_before',
      selectedShinyFmt: { id: 'fmt_1', name: 'Flip \'Em Down!', icon: '🫥' },
    })
    expect(result.type).toBe('flip-em-down')
    expect(result.roundId).toBe('round_1')
    expect(result.afterSlideId).toBe('slide_before')
    expect(result.data.questionNumber).toBe(5)
    expect(result.data.questionLabel).toBe('Q5')
    expect(result.data.isShiny).toBe(true)
    expect(result.data.shinyFormatId).toBe('fmt_1')
    expect(result.data.shinyFormatName).toBe('Flip \'Em Down!')
    expect(result.data.shinyFormatIcon).toBe('🫥')
    expect(result.data.items).toHaveLength(8)
    for (const item of result.data.items) {
      expect(item).toMatchObject({ label: '', imageUrl: null })
      expect(typeof item.id).toBe('string')
      expect(item.id.length).toBeGreaterThan(0)
    }
    expect(result.data.hints).toHaveLength(3)
    expect(result.data.hints[0]).toEqual({ text: '', survivors: [] })
    expect(result.data.hints[1]).toEqual({ text: '', survivors: [] })
    expect(result.data.hints[2]).toEqual({ text: '' })
    expect(result.data.elimStep).toBe(0)
    expect(result.data.answer).toBe('')
  })

  it('gives every item a distinct id', () => {
    const result = buildElimSlide({ qNum: 1, roundId: 'r', afterId: 'a', selectedShinyFmt: { id: 'fmt_1', name: 'X', icon: '🫥' } })
    const ids = result.data.items.map(i => i.id)
    expect(new Set(ids).size).toBe(8)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `client/`): `npm run test:unit -- src/lib/shinyWizardKinds.test.js`
Expected: FAIL — `buildElimSlide` is not exported / `FIXED_SHAPE_KINDS.elimination` is undefined.

- [ ] **Step 3: Implement**

In `client/src/lib/shinyWizardKinds.jsx`, add `elimination` to the `FIXED_SHAPE_KINDS` object:

```js
export const FIXED_SHAPE_KINDS = {
  matching:    { hasOwnControls: false },
  wager:       { hasOwnControls: false },
  order:       { hasOwnControls: false },
  choice:      { hasOwnControls: false },
  grid:        { hasOwnControls: true, extraControls: gridExtraControls, buildSlideData: buildGridSlide },
  venn:        { hasOwnControls: true, extraControls: vennExtraControls, buildSlideData: buildVennSlide },
  bendle:      { hasOwnControls: true, extraControls: bendleExtraControls, buildSlideData: buildBendleSlide },
  elimination: { hasOwnControls: false, buildSlideData: buildElimSlide },
}
```

Then add the builder function, in the same file (near `buildVennSlide`, same section style):

```js
// ── Elimination ("Flip 'Em Down!") ─────────────────────────────────────────
// Fixed shape, always: 8 items, 3 hints. Unlike grid/venn there is no host
// "how many" step at all — hasOwnControls: false, no extraControls — the
// wizard goes straight from picking the format to creating this blank slide,
// same speed as matching/wager/order. items[]/hints[] are authored entirely
// afterward in ElimEditor (SlideEditor.jsx). Deliberately NOT `parts[]` —
// that name is load-bearing for the shared isConcurrentShiny stepping
// system (revealStepCount, QuestionSlide.jsx's dispatcher), which this
// format does not use. See docs/superpowers/specs/2026-09-14-flip-em-down-
// shiny-spec.md's "Architecture decision" section for why.
export function buildElimSlide(ctx) {
  const fmt = ctx.selectedShinyFmt
  const items = Array.from({ length: 8 }, () => ({ id: nanoid(6), label: '', imageUrl: null }))
  const hints = [
    { text: '', survivors: [] },
    { text: '', survivors: [] },
    { text: '' },
  ]
  const data = {
    questionNumber:  ctx.qNum,
    questionLabel:   `Q${ctx.qNum}`,
    questionMode:    'shiny',
    isShiny:         true,
    shinyFormatId:   fmt.id,
    shinyFormatName: fmt.name,
    shinyFormatIcon: fmt.icon,
    items,
    hints,
    elimStep: 0,
    answer: '',
  }
  return { type: 'flip-em-down', roundId: ctx.roundId ?? null, afterSlideId: ctx.afterId, data }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- src/lib/shinyWizardKinds.test.js`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/shinyWizardKinds.jsx client/src/lib/shinyWizardKinds.test.js
git commit -m "feat(shiny): add elimination kind and buildElimSlide for Flip 'Em Down!"
```

---

## Task 3: `FlipEmDownSlide.jsx` display component

**Files:**
- Create: `client/src/components/display/slides/FlipEmDownSlide.jsx`
- Test: `client/src/components/display/slides/FlipEmDownSlide.test.jsx`

**Interfaces:**
- Consumes: `slide.data.items` (8 `{id, label, imageUrl}`), `slide.data.hints` (3 `{text, survivors?}`), `slide.data.elimStep` (0-3), `useTheme()` from `../../shared/ThemeProvider.jsx`, `EASE_OUT` from `../../../lib/easings.js`, `SHINY_GOLD`/`SHINY_GOLD_GLOW` from `../../../lib/shinyGold.js`.
- Produces: default export `FlipEmDownSlide({ slide })`, a React component — no other file calls anything from this one directly except the import in Task 4.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/display/slides/FlipEmDownSlide.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import FlipEmDownSlide from './FlipEmDownSlide.jsx'

function makeSlide(overrides = {}) {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `id${i}`, label: `Face ${i}`, imageUrl: null }))
  return {
    id: 'slide_1',
    type: 'flip-em-down',
    data: {
      items,
      hints: [
        { text: 'SNL cast member.', survivors: ['id0', 'id1', 'id2', 'id3'] },
        { text: 'Born in Illinois.', survivors: ['id0'] },
        { text: 'Final spoken clue.' },
      ],
      elimStep: 0,
      answer: 'Face 0',
      ...overrides,
    },
  }
}

describe('<FlipEmDownSlide>', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = slide => act(() => {
    root.render(
      <ThemeProvider>
        <FlipEmDownSlide slide={slide} />
      </ThemeProvider>
    )
  })

  it('renders all 8 face labels at elimStep 0', () => {
    render(makeSlide())
    for (let i = 0; i < 8; i++) {
      expect(container.textContent).toContain(`Face ${i}`)
    }
  })

  it('renders no hint caption at elimStep 0', () => {
    render(makeSlide())
    expect(container.textContent).not.toContain('SNL cast member.')
  })

  it('renders hint 1 caption at elimStep 1', () => {
    render(makeSlide({ elimStep: 1 }))
    expect(container.textContent).toContain('SNL cast member.')
    expect(container.textContent).not.toContain('Born in Illinois.')
  })

  it('renders all 3 hint captions at elimStep 3', () => {
    render(makeSlide({ elimStep: 3 }))
    expect(container.textContent).toContain('SNL cast member.')
    expect(container.textContent).toContain('Born in Illinois.')
    expect(container.textContent).toContain('Final spoken clue.')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- src/components/display/slides/FlipEmDownSlide.test.jsx`
Expected: FAIL — `FlipEmDownSlide.jsx` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `client/src/components/display/slides/FlipEmDownSlide.jsx`:

```jsx
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'

// Alive/eliminated state for one item at the current elimStep. Step 0 = grid
// only, nobody eliminated yet. Steps 1-2 apply hints[0]/hints[1].survivors.
// Step 3 (the spoken-only hint) changes no survivors — same board as step 2.
function isAlive(itemId, data) {
  const step = data.elimStep ?? 0
  if (step === 0) return true
  const hintIndex = Math.min(step, 2) - 1
  const survivors = data.hints?.[hintIndex]?.survivors
  return Array.isArray(survivors) ? survivors.includes(itemId) : true
}

function FaceCard({ item, alive, confirmed, size }) {
  const eliminated = !alive
  return (
    <motion.div
      animate={{
        opacity: eliminated ? 0.25 : 1,
        scale: eliminated ? 0.92 : (confirmed ? 1.04 : 1),
      }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      style={{
        width: size, height: size, borderRadius: 14, overflow: 'hidden', position: 'relative',
        boxShadow: confirmed ? `0 0 0 3px ${SHINY_GOLD}, 0 8px 28px ${SHINY_GOLD_GLOW}` : '0 6px 22px rgba(0,0,0,0.5)',
        filter: eliminated ? 'grayscale(1)' : 'none',
        background: 'rgba(0,0,0,0.3)',
      }}
    >
      {item.imageUrl && (
        <img src={item.imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      <span style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1, color: '#fff', fontWeight: 700,
        fontSize: 16, textShadow: '0 2px 8px rgba(0,0,0,0.85)', padding: '6px 8px', textAlign: 'center',
        background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
      }}>{item.label}</span>
    </motion.div>
  )
}

export default function FlipEmDownSlide({ slide }) {
  const { theme } = useTheme()
  useReducedMotion() // FaceCard's opacity/scale-only animation is already reduced-motion-safe; no branch needed, keeping the hook call for future divergence would be premature — read once here so a future rotate/translate addition doesn't forget the gate.
  const { data } = slide
  const items = Array.isArray(data.items) ? data.items : []
  const step = data.elimStep ?? 0
  const revealedHints = (data.hints ?? []).slice(0, step)
  const size = 190

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
        {items.map(item => (
          <FaceCard
            key={item.id}
            item={item}
            alive={isAlive(item.id, data)}
            confirmed={step >= 2 && isAlive(item.id, data)}
            size={size}
          />
        ))}
      </div>
      <div style={{ minHeight: 90, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <AnimatePresence mode="popLayout">
          {revealedHints.map((hint, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              style={{
                color: theme.colors.text, fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
                fontSize: '1.4rem', fontWeight: 600, textShadow: '0 2px 8px rgba(0,0,0,0.6)', margin: 0,
              }}
            >{hint.text}</motion.p>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- src/components/display/slides/FlipEmDownSlide.test.jsx`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/display/slides/FlipEmDownSlide.jsx client/src/components/display/slides/FlipEmDownSlide.test.jsx
git commit -m "feat(shiny): add FlipEmDownSlide display component"
```

---

## Task 4: Wire `flip-em-down` into `SlideRenderer.jsx`

**Files:**
- Modify: `client/src/components/display/SlideRenderer.jsx`

**Interfaces:**
- Consumes: `FlipEmDownSlide` (default export from Task 3).
- Produces: `slide.type === 'flip-em-down'` now renders via `FlipEmDownSlide` with the same opaque-backdrop/shiny-animation treatment `grid`/`venn` get.

- [ ] **Step 1: Add the import**

In `client/src/components/display/SlideRenderer.jsx`, next to the `GridSlide`/`VennDiagramSlide` imports:

```js
import GridSlide from './slides/GridSlide.jsx'
import VennDiagramSlide from './slides/VennDiagramSlide.jsx'
import FlipEmDownSlide from './slides/FlipEmDownSlide.jsx'
```

- [ ] **Step 2: Register in `SLIDE_COMPONENTS`**

```js
const SLIDE_COMPONENTS = {
  // ...existing entries...
  'grid':              GridSlide,
  'venn':              VennDiagramSlide,
  'flip-em-down':      FlipEmDownSlide,
  'pre-show':          PreShowSlide,
  'shiny-title':       ShinyTitleSlide,
}
```

- [ ] **Step 3: Add to the opacity-lock list**

Find the block (documented at length in the surrounding comment about "fixed, theme-independent designs that must never be caught half-transparent"):

```js
  if (slide?.type === 'team-picker' || slide?.type === 'grid' || slide?.type === 'venn' || slide?.type === 'round-intro' || slide?.type === 'swing-round-intro') {
```

Change to:

```js
  if (slide?.type === 'team-picker' || slide?.type === 'grid' || slide?.type === 'venn' || slide?.type === 'flip-em-down' || slide?.type === 'round-intro' || slide?.type === 'swing-round-intro') {
```

(`skipsLockedBackground()` — separate function, earlier in the file — is NOT touched: `flip-em-down` is shiny *content*, which wants the opaque backdrop, same as grid/venn, which are also absent from that function's list.)

- [ ] **Step 4: Manual smoke check**

Run the dev server (`vercel dev` per repo `CLAUDE.md`, or `npm run dev` from `client/`) and confirm the app still builds/boots with no console errors from this file — there's no automated test for `SlideRenderer.jsx`'s dispatch table in this codebase (none of `grid`/`venn`/`pre-show` have one either), so this step is the existing house pattern, not a gap introduced here.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/display/SlideRenderer.jsx
git commit -m "feat(shiny): register flip-em-down slide type in SlideRenderer"
```

---

## Task 5: Sidebar label for `flip-em-down` slides

**Files:**
- Modify: `client/src/components/host/RoundSidebar.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `slideLabel()` returns a real name (`data.shinyFormatName` or `"Flip 'Em Down!"`) for `flip-em-down` slides instead of falling through to the raw type string.

- [ ] **Step 1: Add the branch**

In `slideLabel()`, right after the existing `shiny-title` branch:

```js
  if (type === 'shiny-title') return data.seriesTheme || data.shinyFormatName || '✨ Shiny'
  if (type === 'flip-em-down') return data.shinyFormatName || "Flip 'Em Down!"
```

(The sidebar row's *icon* needs no change — `SlideRow`'s existing `slide.data?.isShiny ? (slide.data?.shinyFormatIcon || meta.icon) : meta.icon` already picks up the format's own icon for any `isShiny` slide, `flip-em-down` included.)

- [ ] **Step 2: Manual smoke check**

In the running dev server, create a Flip 'Em Down slide (once Task 6 exists — if running this task before Task 6, skip this step and return to it once the wizard can create one) and confirm the sidebar shows "Flip 'Em Down!" instead of the literal string `flip-em-down`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/host/RoundSidebar.jsx
git commit -m "feat(shiny): show real label for flip-em-down slides in RoundSidebar"
```

---

## Task 6: `ElimEditor` in `SlideEditor.jsx`

**Files:**
- Modify: `client/src/components/host/SlideEditor.jsx`

**Interfaces:**
- Consumes: `Field`, `TextInput`, `Divider`, `MediaUpload` (all already defined elsewhere in `SlideEditor.jsx`, used identically by `VennEditor`/`GridEditor`), `nanoid` (add the import if not already present in this file — check first, `GridEditor`/`VennEditor` don't create new ids so it may not be imported here yet).
- Produces: `ElimEditor({ data, onChange, setData, scheduleSave, onMediaUpload })`, wired into the slide-type dispatch so `slide.type === 'flip-em-down'` renders it in the right rail.

- [ ] **Step 1: Check for the `nanoid` import**

Run: `grep -n "^import.*nanoid" client/src/components/host/SlideEditor.jsx`
If it prints nothing, add `import { nanoid } from 'nanoid'` near the top of the file with the other imports. If it already prints a line, skip — reuse the existing import.

- [ ] **Step 2: Add the dispatch line**

Right after the `venn` dispatch block (same pattern as the `grid`/`venn` pair):

```jsx
              {slide.type === 'venn' && (
                <VennEditor data={data} onChange={change} setData={setData} scheduleSave={scheduleSave} onMediaUpload={handleMediaUpload}
                  uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} usedPhotoUrls={usedPhotoUrls} />
              )}
              {slide.type === 'flip-em-down' && (
                <ElimEditor data={data} onChange={change} setData={setData} scheduleSave={scheduleSave} onMediaUpload={handleMediaUpload} />
              )}
```

- [ ] **Step 3: Add the `ElimEditor` function**

Add it right after `VennEditor`'s closing brace (before `function GridEditor(...)`), same file:

```jsx
function ElimEditor({ data, onChange, setData, scheduleSave, onMediaUpload }) {
  // Fixed at 8 items / 3 hints, unlike VennEditor's variable 2-6 per side —
  // no "+ Add" control, nothing to grow.
  const blankItems = () => Array.from({ length: 8 }, () => ({ id: nanoid(6), label: '', imageUrl: null }))
  const blankHints = () => [{ text: '', survivors: [] }, { text: '', survivors: [] }, { text: '' }]
  const items = data.items?.length === 8 ? data.items : blankItems()
  const hints = data.hints?.length === 3 ? data.hints : blankHints()

  function writeItem(i, patch) {
    const arr = items.slice()
    arr[i] = { ...arr[i], ...patch }
    const next = { ...data, items: arr }
    setData(next)
    scheduleSave({ data: next })
  }

  async function uploadItemPhoto(i, file) {
    if (!file) return
    const url = await onMediaUpload(file)
    if (url) writeItem(i, { imageUrl: url })
  }

  function writeHint(i, patch) {
    const arr = hints.slice()
    arr[i] = { ...arr[i], ...patch }
    const next = { ...data, hints: arr }
    setData(next)
    scheduleSave({ data: next })
  }

  function toggleSurvivor(hintIdx, itemId) {
    const current = hints[hintIdx]?.survivors ?? []
    const next = current.includes(itemId) ? current.filter(id => id !== itemId) : [...current, itemId]
    writeHint(hintIdx, { survivors: next })
  }

  return (
    <div className="flex flex-col gap-4">
      <Divider label="Flip 'Em Down!" />
      <Field label="Answer">
        <TextInput value={data.answer ?? ''} onChange={v => onChange('answer', v)} placeholder="The one who survives all 3 hints" />
      </Field>

      <Divider label="8 Faces" />
      <div className="grid grid-cols-2 gap-3">
        {items.map((item, i) => (
          <div key={item.id} className="flex items-center gap-2 border border-gray-200 rounded-lg p-2">
            <MediaUpload
              accept="image"
              label={`Face ${i + 1}`}
              currentUrl={item.imageUrl}
              currentType={item.imageUrl ? 'image/jpeg' : null}
              onUpload={file => uploadItemPhoto(i, file)}
              onRemove={() => writeItem(i, { imageUrl: null })}
            />
            <TextInput value={item.label ?? ''} onChange={v => writeItem(i, { label: v })} placeholder="Name" />
          </div>
        ))}
      </div>

      <Divider label="Hints" />
      {[0, 1].map(hi => {
        const survivorCount = hints[hi]?.survivors?.length ?? 0
        const warn = hi === 0
          ? survivorCount > 0 && (survivorCount < 3 || survivorCount > 5)
          : survivorCount > 0 && survivorCount !== 1
        return (
          <div key={hi} className="flex flex-col gap-2">
            <Field label={`Hint ${hi + 1}`}>
              <TextInput value={hints[hi]?.text ?? ''} onChange={v => writeHint(hi, { text: v })} placeholder="e.g. SNL cast member." />
            </Field>
            <div className="flex flex-wrap gap-2">
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleSurvivor(hi, item.id)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    (hints[hi]?.survivors ?? []).includes(item.id)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-gray-100 border-gray-200 text-gray-600'
                  }`}
                >
                  {item.label || `Face ${items.indexOf(item) + 1}`}
                </button>
              ))}
            </div>
            <p className={`text-[11px] ${warn ? 'text-amber-600' : 'text-gray-400'}`}>
              {survivorCount} survive{hi === 1 && survivorCount === 1 ? ' — locked' : ''}
              {warn && hi === 0 && ' — hint 1 usually narrows to 3-5'}
              {warn && hi === 1 && ' — hint 2 needs to land on exactly 1'}
            </p>
          </div>
        )
      })}
      <Field label="Hint 3 (spoken, not a filter)">
        <TextInput value={hints[2]?.text ?? ''} onChange={v => writeHint(2, { text: v })} placeholder="A flavor clue the host reads aloud before giving the answer" />
      </Field>
    </div>
  )
}
```

- [ ] **Step 4: Manual verification (no automated test — this file has no existing test suite for its editor components)**

Run the dev server, open `/host`, load or create a show, add a round, use "Add Question" → pick "Flip 'Em Down!" from the shiny format list → confirm:
- A blank slide is created with 8 empty face slots and 3 empty hint rows.
- Uploading a photo to a face slot shows it immediately.
- Checking boxes in the hint 1 / hint 2 survivor pickers updates the "N survive" line live, including the amber warning text when the count is out of the expected range.
- Reloading the page preserves everything typed (confirms `scheduleSave` actually persisted).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/SlideEditor.jsx
git commit -m "feat(shiny): add ElimEditor for authoring Flip 'Em Down! slides"
```

---

## Task 7: "Next Hint →" host control in `LiveMode.jsx`

**Files:**
- Modify: `client/src/components/host/LiveMode.jsx`

**Interfaces:**
- Consumes: `currentSlide` (already in scope throughout this file), `actions.updateSlide(id, patch)` (already used throughout this file, e.g. `actions.updateSlide(currentSlide.id, {...})`).
- Produces: a button visible only when the live slide is `flip-em-down`, advancing `data.elimStep` by 1 up to a max of 3, and a way to step back (mirrors `Prev`'s existence for the main deck — a host who advances a hint by mistake needs a way back without leaving the slide).

- [ ] **Step 1: Locate the nav bar**

Find the existing button row that has `📊 Scores` (around line 1195-1206 as of this plan's writing — confirm with `grep -n "📊 Scores" client/src/components/host/LiveMode.jsx` since line numbers drift).

- [ ] **Step 2: Add the control**

Add this block immediately before the `📊 Scores` button, inside the same flex row:

```jsx
          {currentSlide?.type === 'flip-em-down' && (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => actions.updateSlide(currentSlide.id, { data: { ...currentSlide.data, elimStep: Math.max(0, (currentSlide.data?.elimStep ?? 0) - 1) } })}
                disabled={(currentSlide.data?.elimStep ?? 0) === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Undo last hint"
              >
                ↩ Hint
              </button>
              <button
                onClick={() => actions.updateSlide(currentSlide.id, { data: { ...currentSlide.data, elimStep: Math.min(3, (currentSlide.data?.elimStep ?? 0) + 1) } })}
                disabled={(currentSlide.data?.elimStep ?? 0) >= 3}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors bg-baynes-forest text-white hover:bg-green-900 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Reveal next hint"
              >
                Next Hint ({Math.min(3, (currentSlide.data?.elimStep ?? 0) + 1)}/3) →
              </button>
            </div>
          )}
```

- [ ] **Step 3: Manual verification**

Run the dev server. Go Live on a Flip 'Em Down slide (built in Task 6). Confirm on `/display`:
- All 8 faces show, no hint caption, "Next Hint" button reads "Next Hint (1/3) →".
- Clicking it once shows hint 1's caption and grays out the eliminated faces.
- Clicking again shows hint 2 and narrows to the single confirmed face (gold outline).
- Clicking a third time shows hint 3's caption, board unchanged.
- Button disables at 3/3. "↩ Hint" steps backward correctly and re-enables faces.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/host/LiveMode.jsx
git commit -m "feat(shiny): add Next Hint host control for Flip 'Em Down! live playback"
```

---

## Task 8: End-to-end manual pass

**Files:** none — verification only.

- [ ] **Step 1: Full run-through**

With the dev server running and Task 1's DB row in place: build a real (or placeholder-photo) Flip 'Em Down question in a test show, go live, step through all 3 hints on `/display`, press the Stream Deck **A** key (or its on-screen equivalent) to confirm `AnswerRevealOverlay` shows the typed `answer` text. Confirm the sidebar (Task 5) and the editor (Task 6) both behave correctly for this same slide start to finish.

- [ ] **Step 2: Run the full unit suite**

Run (from `client/`): `npm run test:unit`
Expected: PASS, no regressions in any other shiny format's tests.

- [ ] **Step 3: Report**

Confirm to Ben: what was tested, what passed, any rough edges found (visual sizing, the survivor-count warning thresholds, anything else) — this task doesn't fix anything found, it surfaces it for a follow-up pass.
