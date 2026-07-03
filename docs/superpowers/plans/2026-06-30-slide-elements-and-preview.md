# Slide Elements + Preview Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a host add text boxes and images to any slide with constrained (preset position/size, not freeform drag) controls, and add a Preview/Edit toggle to the slide editor so changes can be seen rendered as they'll actually look on the TV — starting with fixing the currently-broken/empty-feeling Custom slide type, wired into all slide types from the start.

**Architecture:** A new `data.elements` array (shape: `{ id, type: 'text'|'image', content/url, font?, position, size }`) any slide's data can carry, rendered by a new shared `SlideElements.jsx` component (position/size enums → CSS), edited by a new shared `ElementsEditor.jsx` host component (reuses the existing `MediaUpload.jsx` for image upload and the existing `DISPLAY_FONTS` list for text font choice). `SlideEditor.jsx` gets a Preview/Edit toggle — Preview renders the real slide component scaled down (reusing `ThemePickerModal.jsx`'s proven `INNER_W/INNER_H/SCALE` pattern) so elements show live as edited; Edit shows the existing per-type form fields plus the new Elements section.

**Tech Stack:** React 18, Supabase Storage (existing `uploadMedia`/buckets), Tailwind.

**Branch:** work directly on `main` (per established precedent for this project this session — multiple concurrent sessions already share this working directory; no new branch needed unless a fresh session mid-flight makes one necessary, in which case follow the same reconciliation pattern documented in `SKILL.md`'s "Multiple sessions on this repo" note).

---

## Task 1: Data model + `SlideElements.jsx` renderer

**Files:**
- Create: `client/src/components/display/SlideElements.jsx`

- [ ] **Step 1: Define the constants and renderer**

```jsx
import { motion } from 'framer-motion'

// Preset positions — a 3x3 grid plus full-bleed. Values are CSS placement,
// not raw coordinates, so elements always land somewhere sane regardless
// of aspect ratio.
export const ELEMENT_POSITIONS = {
  'top-left':      { top: '8%', left: '8%' },
  'top-center':    { top: '8%', left: '50%', transform: 'translateX(-50%)' },
  'top-right':     { top: '8%', right: '8%' },
  'center-left':   { top: '50%', left: '8%', transform: 'translateY(-50%)' },
  'center':        { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  'center-right':  { top: '50%', right: '8%', transform: 'translateY(-50%)' },
  'bottom-left':   { bottom: '8%', left: '8%' },
  'bottom-center': { bottom: '8%', left: '50%', transform: 'translateX(-50%)' },
  'bottom-right':  { bottom: '8%', right: '8%' },
  'full-bleed':    { inset: 0 },
}

export const ELEMENT_POSITION_LABELS = {
  'top-left': 'Top left', 'top-center': 'Top center', 'top-right': 'Top right',
  'center-left': 'Center left', 'center': 'Center', 'center-right': 'Center right',
  'bottom-left': 'Bottom left', 'bottom-center': 'Bottom center', 'bottom-right': 'Bottom right',
  'full-bleed': 'Full bleed',
}

// Image sizes are a percentage of the slide's width (height auto via object-fit).
export const IMAGE_SIZES = { sm: '18%', md: '32%', lg: '50%', xl: '72%', full: '100%' }

// Text sizes use clamp() so they scale between phone-preview and 4K TV
// consistently, matching the pattern already used across every slide component.
export const TEXT_SIZES = {
  sm: 'clamp(1.2rem, 2vw, 1.8rem)',
  md: 'clamp(1.8rem, 3.2vw, 3rem)',
  lg: 'clamp(2.8rem, 5vw, 4.5rem)',
  xl: 'clamp(4rem, 8vw, 7rem)',
}

export function makeElement(type) {
  return {
    id: `el_${Math.random().toString(36).slice(2, 10)}`,
    type,
    position: 'center',
    size: 'md',
    ...(type === 'text' ? { content: '', font: 'Boogaloo' } : { url: null }),
  }
}

function TextElement({ el, theme }) {
  if (!el.content) return null
  return (
    <motion.p
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } }}
      style={{
        position: 'absolute',
        ...ELEMENT_POSITIONS[el.position] ?? ELEMENT_POSITIONS.center,
        color: theme.colors.text,
        fontFamily: `'${el.font ?? 'Boogaloo'}', sans-serif`,
        fontSize: TEXT_SIZES[el.size] ?? TEXT_SIZES.md,
        textAlign: 'center',
        maxWidth: '80%',
        margin: 0,
        zIndex: 10,
      }}
    >
      {el.content}
    </motion.p>
  )
}

function ImageElement({ el }) {
  if (!el.url) return null
  return (
    <motion.img
      src={el.url}
      alt=""
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } }}
      style={{
        position: 'absolute',
        ...ELEMENT_POSITIONS[el.position] ?? ELEMENT_POSITIONS.center,
        width: IMAGE_SIZES[el.size] ?? IMAGE_SIZES.md,
        height: 'auto',
        objectFit: 'contain',
        zIndex: 10,
      }}
    />
  )
}

export default function SlideElements({ elements, theme }) {
  if (!elements || elements.length === 0) return null
  return (
    <>
      {elements.map(el => el.type === 'text'
        ? <TextElement key={el.id} el={el} theme={theme} />
        : <ImageElement key={el.id} el={el} />
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify**

Run `npm run build` — should compile cleanly (nothing imports this file yet, this step just proves it's syntactically correct in isolation).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/display/SlideElements.jsx
git commit -m "Add SlideElements renderer: preset-position text/image overlays for any slide"
```

---

## Task 2: `ElementsEditor.jsx` host editor

**Files:**
- Create: `client/src/components/host/ElementsEditor.jsx`

- [ ] **Step 1: Build the editor**

Reuses `MediaUpload.jsx` (already imported elsewhere in `SlideEditor.jsx` the same way) for image upload, and the same font list already established in `client/src/components/host/ThemeCustomizeControls.jsx` (`const DISPLAY_FONTS = ['Boogaloo', 'Handters', 'Roquen', 'DM Sans']` — import it from there rather than redefining it, to guarantee they never drift apart; if it's not exported from that file yet, add `export` to its declaration as part of this step).

```jsx
import { useState } from 'react'
import MediaUpload from './MediaUpload.jsx'
import { DISPLAY_FONTS } from './ThemeCustomizeControls.jsx'
import { makeElement, ELEMENT_POSITION_LABELS } from '../display/SlideElements.jsx'

const POSITIONS = Object.keys(ELEMENT_POSITION_LABELS)
const SIZES = ['sm', 'md', 'lg', 'xl']

function ElementRow({ el, onChange, onDelete, onUpload }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen(o => !o)} className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
          <span>{el.type === 'text' ? '📝' : '🖼️'}</span>
          {el.type === 'text' ? (el.content?.slice(0, 24) || 'Empty text') : 'Image'}
        </button>
        <button onClick={onDelete} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
      </div>

      {open && (
        <div className="space-y-2 pt-1">
          {el.type === 'text' ? (
            <>
              <textarea
                value={el.content ?? ''}
                onChange={e => onChange({ ...el, content: e.target.value })}
                placeholder="Text…"
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
              />
              <select
                value={el.font ?? 'Boogaloo'}
                onChange={e => onChange({ ...el, font: e.target.value })}
                className="text-xs border border-gray-200 rounded-md px-2 py-1"
              >
                {DISPLAY_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </>
          ) : (
            <MediaUpload
              accept="image"
              currentUrl={el.url}
              onUpload={async file => {
                const result = await onUpload(file)
                if (result?.url) onChange({ ...el, url: result.url })
                return result
              }}
              onRemove={() => onChange({ ...el, url: null })}
            />
          )}

          <div className="flex items-center gap-2">
            <select
              value={el.position}
              onChange={e => onChange({ ...el, position: e.target.value })}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 flex-1"
            >
              {POSITIONS.map(p => <option key={p} value={p}>{ELEMENT_POSITION_LABELS[p]}</option>)}
            </select>
            <select
              value={el.size}
              onChange={e => onChange({ ...el, size: e.target.value })}
              className="text-xs border border-gray-200 rounded-md px-2 py-1"
            >
              {SIZES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ElementsEditor({ elements, onChange, onUpload }) {
  const list = elements ?? []

  function update(id, next) {
    onChange(list.map(el => el.id === id ? next : el))
  }
  function remove(id) {
    onChange(list.filter(el => el.id !== id))
  }
  function add(type) {
    onChange([...list, makeElement(type)])
  }

  return (
    <div className="space-y-2">
      {list.map(el => (
        <ElementRow key={el.id} el={el} onChange={next => update(el.id, next)} onDelete={() => remove(el.id)} onUpload={onUpload} />
      ))}
      <div className="flex gap-2">
        <button onClick={() => add('text')} className="flex-1 text-xs font-medium text-gray-600 border border-dashed border-gray-300 rounded-lg py-2 hover:border-baynes-forest hover:text-baynes-forest transition-colors">
          + Add text
        </button>
        <button onClick={() => add('image')} className="flex-1 text-xs font-medium text-gray-600 border border-dashed border-gray-300 rounded-lg py-2 hover:border-baynes-forest hover:text-baynes-forest transition-colors">
          + Add image
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Export `DISPLAY_FONTS` from `ThemeCustomizeControls.jsx`**

Read the current top of that file — change `const DISPLAY_FONTS = [...]` to `export const DISPLAY_FONTS = [...]`. Nothing else in that file changes.

- [ ] **Step 3: Verify**

Run `npm run build` — should compile cleanly (still not imported anywhere else yet).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/host/ElementsEditor.jsx client/src/components/host/ThemeCustomizeControls.jsx
git commit -m "Add ElementsEditor: host-side controls for adding text/image elements to a slide"
```

---

## Task 3: Preview/Edit toggle in `SlideEditor.jsx`

**Files:**
- Modify: `client/src/components/host/SlideEditor.jsx`

- [ ] **Step 1: Read the current file's header and main-content render regions**

The header is around lines 73-85 (a flex row with a title/back area and a `<div className="w-20" />` spacer near the end for layout balance). The scrollable content area is around line 88 (`<div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">`) containing the `slide.type === X && <XEditor .../>` blocks. Read the actual current file — line numbers may have drifted from concurrent work on this branch — before editing, and adapt to whatever it currently contains.

- [ ] **Step 2: Add `viewMode` state and the toggle button**

Add near the top of the component, alongside the existing `data`/`confirmingDelete` state:

```js
const [viewMode, setViewMode] = useState('edit') // 'edit' | 'preview'
```

Replace the `<div className="w-20" />` spacer in the header with a toggle:

```jsx
<div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
  <button
    onClick={() => setViewMode('edit')}
    className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${viewMode === 'edit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
  >
    Edit
  </button>
  <button
    onClick={() => setViewMode('preview')}
    className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${viewMode === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
  >
    Preview
  </button>
</div>
```

- [ ] **Step 3: Render a live scaled preview when `viewMode === 'preview'`**

Import `SlideRenderer` (`client/src/components/display/SlideRenderer.jsx`) and the theme hook. Wrap the existing per-type editor content region so it only renders when `viewMode === 'edit'`, and add a sibling preview block for `viewMode === 'preview'` that mirrors `ThemePickerModal.jsx`'s exact scaling pattern (read that file's `INNER_W`/`INNER_H`/`PREVIEW_W`/`SCALE` constants and the scaled-wrapper `<div>` structure — copy the same approach, don't reinvent it):

```jsx
const INNER_W = 1280, INNER_H = 720
```

(reuse `ThemePickerModal.jsx`'s exact `PREVIEW_W`/`SCALE` values and wrapper div structure — the goal is visual/structural consistency between the two preview surfaces in the app, not a new one-off implementation).

Inside the scaled wrapper, render:

```jsx
<SlideRenderer slide={{ ...slide, data }} show={show} direction={1} />
```

Passing `{ ...slide, data }` (not the original `slide`) is what makes the preview live-reflect unsaved edits — `data` is the component's own local editable state, already kept in sync via the existing `change()` handler.

**Constraint:** `SlideRenderer` expects to be inside a container with real theme context (`useTheme()`) — `SlideEditor` is rendered inside `BuildMode`, which is NOT wrapped in a `<ThemeProvider>` today (verify this by checking `Host.jsx`'s actual component tree — the `<ThemeProvider>` at line 40 wraps `HostInner`, which renders `BuildMode`, so it SHOULD already be in a `ThemeProvider` context — confirm this holds before assuming `useTheme()` works inside the preview; if it doesn't, wrap just the preview block in its own `<ThemeProvider showThemeId={show.theme} overrides={show.themeOverrides}>` to guarantee correct theme rendering).

- [ ] **Step 4: Verify**

Run `npm run dev`, use `playwright-cli` to open a real show's Build Mode, click into any slide, confirm the Edit/Preview toggle appears and switching to Preview renders a themed, scaled version of that slide with 0 console errors. Switch back to Edit and confirm the existing form fields still work exactly as before (no regression).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/SlideEditor.jsx
git commit -m "Add Preview/Edit toggle to SlideEditor, reusing ThemePickerModal's scaled-preview pattern"
```

---

## Task 4: Wire elements + preview into `custom` — the flagship integration

**Files:**
- Modify: `client/src/components/display/slides/CustomSlide.jsx`
- Modify: `client/src/components/host/SlideEditor.jsx` (`CustomEditor`)

- [ ] **Step 1: Render `SlideElements` in `CustomSlide.jsx`**

Read the current file (74 lines, renders `title`/`body`/`mediaUrl` with Framer Motion entrances). Add, near the end of the component's returned JSX (as a sibling to the existing content, not replacing it):

```jsx
<SlideElements elements={data.elements} theme={theme} />
```

Import `SlideElements` from `'./SlideElements.jsx'` — check the actual relative path from `client/src/components/display/slides/CustomSlide.jsx` to `client/src/components/display/SlideElements.jsx` (one directory up: `'../SlideElements.jsx'`).

- [ ] **Step 2: Add the Elements section to `CustomEditor` in `SlideEditor.jsx`**

Current `CustomEditor` (read the real current version first, may have drifted):

```jsx
function CustomEditor({ data, onChange, onMediaUpload }) {
  return (
    <>
      <Field label="Title"><TextInput value={data.title} onChange={v => onChange('title', v)} placeholder="Slide title" /></Field>
      <Field label="Body"><TextArea value={data.body} onChange={v => onChange('body', v)} placeholder="Slide content…" rows={6} /></Field>
      <MediaUpload
        accept="image"
        label="Optional Image"
        currentUrl={data.mediaUrl}
        currentType={data.mediaType}
        onUpload={onMediaUpload}
        onRemove={() => { onChange('mediaUrl', null); onChange('mediaType', null) }}
      />
    </>
  )
}
```

Add an Elements section using the existing `Divider` convention (same pattern `GradingBreakEditor` uses for its "Ben Photo" section):

```jsx
function CustomEditor({ data, onChange, onMediaUpload }) {
  return (
    <>
      <Field label="Title"><TextInput value={data.title} onChange={v => onChange('title', v)} placeholder="Slide title" /></Field>
      <Field label="Body"><TextArea value={data.body} onChange={v => onChange('body', v)} placeholder="Slide content…" rows={6} /></Field>
      <MediaUpload
        accept="image"
        label="Optional Image"
        currentUrl={data.mediaUrl}
        currentType={data.mediaType}
        onUpload={onMediaUpload}
        onRemove={() => { onChange('mediaUrl', null); onChange('mediaType', null) }}
      />
      <Divider label="Elements" />
      <ElementsEditor
        elements={data.elements}
        onChange={next => onChange('elements', next)}
        onUpload={onMediaUpload}
      />
    </>
  )
}
```

Add the import: `import ElementsEditor from './ElementsEditor.jsx'` at the top of `SlideEditor.jsx`, alongside the existing `MediaUpload`/`HostPhotoLibrary` imports.

Find where `<CustomEditor .../>` is actually invoked (around the `slide.type === 'custom'` block) and confirm `onMediaUpload` is already being passed as a prop there (it should be, since the existing image upload already works) — no change needed to the call site itself, `ElementsEditor` reuses the same `onMediaUpload` prop already flowing into `CustomEditor`.

- [ ] **Step 3: Verify**

Run `npm run dev`. Using `playwright-cli`: create or find a `custom`-type slide, open it, add a text element (type some content, pick a font, pick a position, pick a size), add an image element (upload `public/fonts` — no, use an actual image; if no test image is handy in the repo, check `public/ben/` for a real photo to use as a test upload source), switch to Preview mode, confirm both elements render at the chosen position/size with 0 console errors. Switch back to Edit, remove one element, confirm it's gone from the list and (switching to Preview again) from the render. Confirm data persists: reload the page, reopen the same slide, confirm the elements are still there (proving `elements` actually saved to Supabase via the existing debounced-save mechanism already in `SlideEditor.jsx` — no new save logic needed since `onChange('elements', next)` goes through the same `change()` → `scheduleSave` path every other field already uses).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/display/slides/CustomSlide.jsx client/src/components/host/SlideEditor.jsx
git commit -m "Wire SlideElements + ElementsEditor into the Custom slide type"
```

---

## Task 5: Wire elements into every other slide type

**Files:**
- Modify: `client/src/components/display/slides/TitleSlide.jsx`
- Modify: `client/src/components/display/slides/RoundIntroSlide.jsx`
- Modify: `client/src/components/display/slides/QuestionSlide.jsx`
- Modify: `client/src/components/display/slides/GradingBreakSlide.jsx`
- Modify: `client/src/components/display/slides/ScoreboardRevealSlide.jsx`
- Modify: `client/src/components/display/slides/MultiQuestionSlide.jsx`
- Modify: `client/src/components/display/slides/PixelateSeriesSlide.jsx`
- Modify: `client/src/components/display/slides/PylRevealSlide.jsx`
- Modify: `client/src/components/display/slides/StateOfUnionSlide.jsx`
- Modify: `client/src/components/display/slides/WinnerRevealSlide.jsx`
- Modify: `client/src/components/host/SlideEditor.jsx` (every remaining `*Editor` function)

- [ ] **Step 1: Add `<SlideElements elements={data.elements} theme={theme} />` to each display slide component**

For each of the 10 files listed, read the actual current component, confirm it has `theme` in scope (via `useTheme()` or a `theme` prop — every one of them does, per Task 1 of the earlier font-override feature which touched most of these same files), and add the `SlideElements` render as a sibling to the slide's existing content — same pattern as Task 4's `CustomSlide.jsx` change. Import path is consistently `'../SlideElements.jsx'` from any file in `client/src/components/display/slides/`.

**Be careful with slide types that have their own internal z-index/layering choreography** (`WinnerRevealSlide.jsx` has a `Confetti` canvas at `zIndex: 30` and its own content at `zIndex: 10`; `QuestionSlide.jsx` has multiple sub-components). Place `<SlideElements>` so it doesn't render UNDER an opaque full-bleed layer another part of the slide already draws — for most slides this just means adding it near the end of the returned JSX tree, but read each file's actual structure rather than assuming a fixed position works everywhere.

- [ ] **Step 2: Add an Elements section to each corresponding `*Editor` function in `SlideEditor.jsx`**

For each of: `TitleEditor`, `RoundIntroEditor`, `QuestionEditor` (or however question editing is structured — read the actual current code, it may be split across sub-editors for regular vs. shiny), `GradingBreakEditor`, `ScoreboardEditor` (if one exists — `scoreboard-reveal` is auto-computed, confirm whether it has an editor at all before assuming), `MultiQuestionEditor`, `PixelateSeriesEditor`, `PylRevealEditor`, `StateOfUnionEditor`, `WinnerRevealEditor` (if one exists — `winner-reveal` has no editable data fields per the Slide Types reference doc, confirm before assuming one needs creating) — add the same `<Divider label="Elements" /><ElementsEditor elements={data.elements} onChange={next => onChange('elements', next)} onUpload={onMediaUpload} />` block used in Task 4, adapting to each editor's actual current structure and confirming `onMediaUpload` (or equivalent) is already available in that editor's scope — if a specific editor doesn't currently receive an upload handler prop, thread it through from the parent the same way `CustomEditor` already does, don't invent a different mechanism.

**Skip slide types where it genuinely doesn't make sense to add arbitrary elements without a stronger signal from the user** — if a slide type has no editable data at all today (e.g. `scoreboard-reveal`, `winner-reveal`), still wire the DISPLAY side (Step 1) so the capability exists globally as asked, but for the EDITOR side, add a minimal new editor section if none exists rather than skipping — every slide type should get the Elements section in its editor, creating a new one-section editor for types that currently have zero host-editable fields.

- [ ] **Step 3: Verify**

Run `npm run build` (should be clean across all 10+ files). Using `playwright-cli`, spot-check at least 3 different slide types (e.g. `title`, `question`, `grading-break`) — open each, add a text element via the new Elements section, switch to Preview, confirm it renders correctly layered with that slide type's existing content (no z-index collision, no layout break), with 0 console errors. Confirm the real `/display` route for a show with an element-bearing slide also renders it correctly (not just the in-editor preview) — the whole point is this shows up on the actual TV.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/display/slides/ client/src/components/host/SlideEditor.jsx
git commit -m "Wire SlideElements + ElementsEditor into every remaining slide type"
```

---

## Task 6: Fix the latent `result.mimetype` bug found during research

**Files:**
- Modify: `client/src/components/host/SlideEditor.jsx`

- [ ] **Step 1: Fix the property name mismatch**

`useShow.js`'s `uploadMedia` returns `{ url, filename, type }` (confirmed via direct code read). `SlideEditor.jsx`'s media-upload handler (around line 101, exact line may have drifted — grep for `mimetype` to find it) reads `result.mimetype`, which is always `undefined` since the actual key is `type`. Find every occurrence of `.mimetype` on an upload result in `SlideEditor.jsx` and change it to `.type`.

- [ ] **Step 2: Verify**

Grep the file after the fix to confirm zero remaining `.mimetype` references. Using `playwright-cli`, upload an image to any slide's media field, confirm the resulting `mediaType`/equivalent field gets a real MIME type string (e.g. `image/png`) persisted to Supabase rather than `null`/`undefined` — query the show's `slides` JSONB via `mcp__claude_ai_Supabase__execute_sql` to confirm.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/host/SlideEditor.jsx
git commit -m "Fix uploadMedia result field mismatch (result.type, not result.mimetype)"
```

---

## Final Steps

- [ ] Dispatch a final code-reviewer subagent across the full diff for this feature, checking: consistency of the `elements` data shape across every slide type's render + editor, that `DISPLAY_FONTS` is genuinely imported (not duplicated) everywhere it's used, that the Preview/Edit toggle doesn't regress any existing SlideEditor behavior, and that no slide type's existing choreography (Winner Reveal's confetti, Round Intro's slam animation, etc.) got visually broken by the `SlideElements` addition.
- [ ] Use `superpowers:finishing-a-development-branch` to wrap up, or simply confirm with Ben the feature is ready as-is (this plan runs directly on `main` per this project's established pattern this session, so there's no separate branch to merge back).
