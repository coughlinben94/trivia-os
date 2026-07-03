# Per-Show Theme Font/Color Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the host pick a custom display font and text colors for a specific show's theme, from the existing theme picker modal in Build Mode — without changing the shared theme definition used by other shows.

**Architecture:** Every slide component and `ParticleBackground` reads the active theme via `useTheme()` from `ThemeProvider.jsx`, never as a prop drilled down manually. This means a per-show override only needs to be merged in one place — `ThemeProvider.jsx` — and every consumer picks it up automatically. Overrides are stored as a new `theme_overrides` JSONB column on the `shows` table (shape: `{ fonts: { display }, colors: { text, textMuted } }`), loaded through the existing `useShow.js` hook, and edited via new controls added to `ThemePickerModal.jsx`.

**Tech Stack:** React 18, Supabase (Postgres + JS client), Tailwind.

**Branch:** `feature/theme-font-color-overrides` (already checked out from `main`).

---

## Task 1: Wire `theme.fonts.display` into headline components

Right now every headline/title-style text in the display view hardcodes the literal string `'Boogaloo'` instead of reading `theme.fonts.display`, even though the theme data model already has that field. This must be fixed first — otherwise a font override UI would silently do nothing for headline text.

**Files:**
- Modify: `client/src/components/display/slides/TitleSlide.jsx:52`
- Modify: `client/src/components/display/slides/RoundIntroSlide.jsx:49,67,124`
- Modify: `client/src/components/display/slides/MultiQuestionSlide.jsx:48,76`
- Modify: `client/src/components/display/slides/PixelateSeriesSlide.jsx:103`
- Modify: `client/src/components/display/slides/CustomSlide.jsx:46`
- Modify: `client/src/components/display/slides/ScoreboardRevealSlide.jsx:100,155`
- Modify: `client/src/components/display/slides/PylRevealSlide.jsx:54,80,103,155`
- Modify: `client/src/components/display/slides/QuestionSlide.jsx:52,80,334`

- [ ] **Step 1: Replace every hardcoded Boogaloo reference**

In each file above, every occurrence of the literal pattern:

```js
fontFamily: `'Boogaloo', sans-serif`,
```

must become:

```js
fontFamily: `'${theme.fonts.display}', sans-serif`,
```

Before editing each file, confirm `theme` is already in scope at that point (all of these files already call `const { theme } = useTheme()` near the top per the codebase's `useTheme()` pattern — grep the file for `useTheme` to confirm before assuming). If a specific occurrence is inside a small sub-component that does not itself destructure `theme`, add `const { theme } = useTheme()` inside that sub-component (import `useTheme` from `'../../shared/ThemeProvider.jsx'`, adjusting the relative path to match the file's actual location — these slide files live in `client/src/components/display/slides/`, so the import path is `'../../shared/ThemeProvider.jsx'`).

Do not touch `theme.fonts.body` or `theme.fonts.ui` usages — those are already correctly wired and out of scope for this task. Do not touch `Display.jsx`, `AmbientAudit.jsx`, or `Join.jsx` even if they contain the string `'Boogaloo'` — those are outside the per-slide theme-content rendering path and out of scope.

- [ ] **Step 2: Verify visually**

Run `npm run dev` from the project root (if not already running), then use the `playwright-cli` skill to open `http://localhost:5175/ambient?theme=drive-in-movie` — this won't show slide content, so instead open the real `/display` route in demo mode: `http://localhost:5175/display?demo=true&theme=pure-michigan`. Confirm the page renders without console errors (`playwright-cli console error` should report 0 errors) and the question text still displays in Boogaloo (since `pure-michigan`'s `fonts.display` is still `'Boogaloo'` — this step only proves the wiring didn't break anything, not that fonts changed, since no theme has a non-Boogaloo `fonts.display` yet).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/display/slides/TitleSlide.jsx client/src/components/display/slides/RoundIntroSlide.jsx client/src/components/display/slides/MultiQuestionSlide.jsx client/src/components/display/slides/PixelateSeriesSlide.jsx client/src/components/display/slides/CustomSlide.jsx client/src/components/display/slides/ScoreboardRevealSlide.jsx client/src/components/display/slides/PylRevealSlide.jsx client/src/components/display/slides/QuestionSlide.jsx
git commit -m "Wire theme.fonts.display into headline components instead of hardcoded Boogaloo"
```

---

## Task 2: Add `theme_overrides` column to the `shows` table

**Files:** None (Supabase schema change only — this repo has no local migrations directory; schema changes are applied directly to the live Supabase project).

- [ ] **Step 1: Apply the column via the Supabase MCP tool**

Use `mcp__claude_ai_Supabase__apply_migration` (or `execute_sql` if `apply_migration` requires a project_id you don't have handy — check `list_projects` first if needed) against the Trivia OS Supabase project with:

```sql
ALTER TABLE shows ADD COLUMN IF NOT EXISTS theme_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
```

- [ ] **Step 2: Verify**

Run `mcp__claude_ai_Supabase__list_tables` (or `execute_sql` with `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'shows';`) and confirm `theme_overrides` appears with type `jsonb`.

- [ ] **Step 3: No commit needed** (schema-only change, nothing in git to stage).

---

## Task 3: Wire `themeOverrides` through `useShow.js`

**Files:**
- Modify: `client/src/hooks/useShow.js:10-30` (`normalizeShow`)
- Modify: `client/src/hooks/useShow.js:214-222` (`updateShowMeta`)

- [ ] **Step 1: Read `theme_overrides` in `normalizeShow`**

Current code (lines 10-30):

```js
function normalizeShow(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    theme: row.theme_id ?? 'midnight-galaxy',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slides: row.slides ?? [],
    rounds: row.rounds ?? [],
    powerups: row.powerups ?? [],
    tickerMessages: row.ticker_messages ?? [],
    showState: {
      currentSlideId: row.current_slide_id ?? null,
      currentSlideIndex: row.current_slide_index ?? 0,
      isLive: row.is_live ?? false,
      scoreboardVisible: row.scoreboard_visible ?? false,
      scoresRevealed: row.scores_revealed ?? false,
    },
  }
}
```

Add a `themeOverrides` field right after `theme:`:

```js
function normalizeShow(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    theme: row.theme_id ?? 'midnight-galaxy',
    themeOverrides: row.theme_overrides ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slides: row.slides ?? [],
    rounds: row.rounds ?? [],
    powerups: row.powerups ?? [],
    tickerMessages: row.ticker_messages ?? [],
    showState: {
      currentSlideId: row.current_slide_id ?? null,
      currentSlideIndex: row.current_slide_index ?? 0,
      isLive: row.is_live ?? false,
      scoreboardVisible: row.scoreboard_visible ?? false,
      scoresRevealed: row.scores_revealed ?? false,
    },
  }
}
```

- [ ] **Step 2: Write `theme_overrides` in `updateShowMeta`**

Current code (lines 214-222):

```js
  async function updateShowMeta(meta) {
    if (!show) return
    const row = { updated_at: new Date().toISOString() }
    if (meta.title !== undefined) row.title = meta.title
    if (meta.date !== undefined) row.date = meta.date
    if (meta.theme !== undefined) row.theme_id = meta.theme
    setShow(prev => ({ ...prev, ...meta, updatedAt: row.updated_at }))
    await supabase.from('shows').update(row).eq('id', show.id)
  }
```

Add a branch for `meta.themeOverrides`:

```js
  async function updateShowMeta(meta) {
    if (!show) return
    const row = { updated_at: new Date().toISOString() }
    if (meta.title !== undefined) row.title = meta.title
    if (meta.date !== undefined) row.date = meta.date
    if (meta.theme !== undefined) row.theme_id = meta.theme
    if (meta.themeOverrides !== undefined) row.theme_overrides = meta.themeOverrides
    setShow(prev => ({ ...prev, ...meta, updatedAt: row.updated_at }))
    await supabase.from('shows').update(row).eq('id', show.id)
  }
```

- [ ] **Step 3: Verify**

Run `npm run dev`, open the host build UI for any existing show (`http://localhost:5175/host?show=<any_show_id>`), open the browser console via `playwright-cli console`, and confirm no errors on load. This step only proves the new field doesn't break existing show loading — the write path is exercised in Task 5.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useShow.js
git commit -m "Thread theme_overrides through useShow normalizeShow and updateShowMeta"
```

---

## Task 4: Merge overrides at the `ThemeProvider` chokepoint

**Files:**
- Modify: `client/src/components/shared/ThemeProvider.jsx` (entire file, 25 lines)
- Modify: `client/src/views/Display.jsx:423,430`

- [ ] **Step 1: Add a merge function and `overrides` prop to `ThemeProvider.jsx`**

Current full file:

```js
import { createContext, useContext, useState, useEffect } from 'react'
import { getTheme, DEFAULT_THEME_ID } from '../../themes/index.js'

const ThemeContext = createContext(null)

export function ThemeProvider({ showThemeId, children }) {
  const [themeId, setThemeId] = useState(showThemeId ?? DEFAULT_THEME_ID)

  useEffect(() => {
    if (showThemeId) setThemeId(showThemeId)
  }, [showThemeId])

  const theme = getTheme(themeId)

  return (
    <ThemeContext.Provider value={{ theme, themeId, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
```

Replace with:

```js
import { createContext, useContext, useState, useEffect } from 'react'
import { getTheme, DEFAULT_THEME_ID } from '../../themes/index.js'

const ThemeContext = createContext(null)

function applyOverrides(baseTheme, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return baseTheme
  return {
    ...baseTheme,
    fonts: { ...baseTheme.fonts, ...(overrides.fonts ?? {}) },
    colors: { ...baseTheme.colors, ...(overrides.colors ?? {}) },
  }
}

export function ThemeProvider({ showThemeId, overrides, children }) {
  const [themeId, setThemeId] = useState(showThemeId ?? DEFAULT_THEME_ID)

  useEffect(() => {
    if (showThemeId) setThemeId(showThemeId)
  }, [showThemeId])

  const theme = applyOverrides(getTheme(themeId), overrides)

  return (
    <ThemeContext.Provider value={{ theme, themeId, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
```

`overrides` is optional (defaults to `undefined`, `applyOverrides` handles that by returning `baseTheme` unchanged) — this keeps every existing `<ThemeProvider showThemeId={...}>` call site (including the demo-mode one in `Display.jsx:382`, and any other call sites you find via `grep -rn "ThemeProvider" client/src`) working with zero changes required.

- [ ] **Step 2: Pass `overrides` from the two real-show call sites in `Display.jsx`**

Current code at line 423:

```jsx
      <ThemeProvider showThemeId={show.theme}>
        <PreviewSlide />
      </ThemeProvider>
```

Becomes:

```jsx
      <ThemeProvider showThemeId={show.theme} overrides={show.themeOverrides}>
        <PreviewSlide />
      </ThemeProvider>
```

Current code at line 430:

```jsx
    <ThemeProvider showThemeId={show.theme}>
      {show.is_live && show.current_slide_id !== null ? (
        <DisplayInner show={show} direction={direction} />
      ) : (
        <PreShowScreen show={show} />
      )}
    </ThemeProvider>
```

Becomes:

```jsx
    <ThemeProvider showThemeId={show.theme} overrides={show.themeOverrides}>
      {show.is_live && show.current_slide_id !== null ? (
        <DisplayInner show={show} direction={direction} />
      ) : (
        <PreShowScreen show={show} />
      )}
    </ThemeProvider>
```

Do **not** add `overrides` to the demo-mode call site at line 382 — that path constructs a synthetic `show` object with no `themeOverrides` field, and demo mode is meant to preview a raw theme by ID, not a specific show's customization.

- [ ] **Step 3: Verify**

Run `npm run dev`. Using `playwright-cli`, open `http://localhost:5175/display?demo=true&theme=pure-michigan` and confirm 0 console errors (proves `ThemeProvider` still works with no `overrides` prop passed, since demo mode doesn't pass one). Then manually construct a quick smoke test: temporarily add `overrides={{ colors: { text: '#ff0000' } }}` to the line-430 call site, reload a real show's `/display` route, confirm the question text renders red, then revert that temporary change before committing (this proves the merge chokepoint actually works before you build the UI in Task 5).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/shared/ThemeProvider.jsx client/src/views/Display.jsx
git commit -m "Merge per-show theme overrides at the ThemeProvider chokepoint"
```

---

## Task 5: Add font + color controls to `ThemePickerModal.jsx`

**Files:**
- Modify: `client/src/components/host/ThemePickerModal.jsx` (entire file, 184 lines)
- Modify: `client/src/components/host/BuildMode.jsx:512-516` (the `<ThemePickerModal>` call site)

- [ ] **Step 1: Confirm the loaded font list**

The only fonts registered via `@font-face` in `client/src/index.css` are `Boogaloo`, `Handters`, `Roquen`, plus the system-loaded `DM Sans` (loaded separately, likely via a `<link>` in `index.html` or a Google Fonts import — grep `client/index.html` and `client/src/index.css` for `DM Sans` / `dmsans` / `fonts.googleapis` to confirm the exact family name string to use in the dropdown before hardcoding it). Use exactly the family-name strings confirmed by that grep.

- [ ] **Step 2: Add override state and controls to `ThemePickerModal.jsx`**

Add a `DISPLAY_FONTS` constant near the top of the file (after the existing `SCALE` constant, before the component):

```js
const DISPLAY_FONTS = ['Boogaloo', 'Handters', 'Roquen']
```

Change the component signature from:

```js
export default function ThemePickerModal({ show, onClose, onSelectTheme }) {
  const [previewId, setPreviewId] = useState(show.theme)
  const activeRef = useRef(null)
```

to:

```js
export default function ThemePickerModal({ show, onClose, onSelectTheme, onUpdateOverrides }) {
  const [previewId, setPreviewId] = useState(show.theme)
  const [overrides, setOverrides] = useState(show.themeOverrides ?? {})
  const activeRef = useRef(null)
```

Change the `previewTheme` line from:

```js
  const previewTheme = getTheme(previewId)
```

to:

```js
  const baseTheme = getTheme(previewId)
  const previewTheme = {
    ...baseTheme,
    fonts: { ...baseTheme.fonts, ...(overrides.fonts ?? {}) },
    colors: { ...baseTheme.colors, ...(overrides.colors ?? {}) },
  }
```

Add two handler functions right after `handlePick`:

```js
  function setDisplayFont(font) {
    const next = { ...overrides, fonts: { ...overrides.fonts, display: font } }
    setOverrides(next)
    onUpdateOverrides(next)
  }

  function setTextColor(field, color) {
    const next = { ...overrides, colors: { ...overrides.colors, [field]: color } }
    setOverrides(next)
    onUpdateOverrides(next)
  }
```

In the footer section, replace:

```jsx
        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: previewTheme.colors.highlight }} />
            <span className="text-sm font-semibold text-gray-800">{previewTheme.name}</span>
          </div>
          <button
            onClick={onClose}
            className="bg-gray-900 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Done
          </button>
        </div>
```

with:

```jsx
        {/* Customize */}
        <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-100 shrink-0 flex-wrap">
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            Display font
            <select
              value={overrides.fonts?.display ?? baseTheme.fonts.display}
              onChange={e => setDisplayFont(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1"
            >
              {DISPLAY_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            Text color
            <input
              type="color"
              value={overrides.colors?.text ?? baseTheme.colors.text}
              onChange={e => setTextColor('text', e.target.value)}
              className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            Muted text color
            <input
              type="color"
              value={overrides.colors?.textMuted ?? baseTheme.colors.textMuted}
              onChange={e => setTextColor('textMuted', e.target.value)}
              className="w-7 h-7 border border-gray-200 rounded-md cursor-pointer"
            />
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: previewTheme.colors.highlight }} />
            <span className="text-sm font-semibold text-gray-800">{previewTheme.name}</span>
          </div>
          <button
            onClick={onClose}
            className="bg-gray-900 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Done
          </button>
        </div>
```

Also update the sample question text's `fontFamily` inside the preview panel — currently it only uses `previewTheme.fonts.body` (correct, leave that one alone), but the theme-name label at the bottom of the preview panel is hardcoded `"'DM Sans', sans-serif"` — leave that alone too, it's a UI chrome label, not theme content, out of scope.

- [ ] **Step 3: Wire `onUpdateOverrides` from `BuildMode.jsx`**

Current code (lines 512-516):

```jsx
        <ThemePickerModal
          show={show}
          onClose={() => setShowThemePicker(false)}
          onSelectTheme={themeId => actions.updateShowMeta({ theme: themeId })}
        />
```

Becomes:

```jsx
        <ThemePickerModal
          show={show}
          onClose={() => setShowThemePicker(false)}
          onSelectTheme={themeId => actions.updateShowMeta({ theme: themeId })}
          onUpdateOverrides={themeOverrides => actions.updateShowMeta({ themeOverrides })}
        />
```

- [ ] **Step 4: Verify end-to-end**

Run `npm run dev`. Using `playwright-cli`, open the host build UI for a real show, open the theme picker modal, change the display font dropdown and both color swatches, and confirm the live preview pane updates immediately. Then open that same show's real `/display` route in another tab and confirm the question text reflects the chosen font/colors (proves the full path: UI → `updateShowMeta` → Supabase → `useShow` → `ThemeProvider` merge → slide rendering). Take a screenshot of both the modal and the live display for the record.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/ThemePickerModal.jsx client/src/components/host/BuildMode.jsx
git commit -m "Add per-show display font and text color override controls to theme picker"
```

---

## Task 6: Font file upload + Host.jsx preview fix

Two follow-ups discovered after Task 4/5 landed:

1. The host wants to upload their own font file (`.woff2`/`.woff`/`.ttf`/`.otf`), not just pick from the 4 preset fonts (Boogaloo/DM Sans/Handters/Roquen) added in Task 5.
2. Code review on Task 4 flagged that `client/src/components/host/Host.jsx`'s own `<ThemeProvider showThemeId={show.theme}>` call site (used for the Build Mode background/preview context) never got `overrides={show.themeOverrides}` — Task 4 only touched `Display.jsx`'s two real-show call sites, by design (that was its stated scope). This means a chosen override currently only shows up in `ThemePickerModal`'s own mini-preview and on the real `/display` route, not in Build Mode's background. Fix it here.

**Files:**
- Modify: `client/src/hooks/useShow.js` (add `uploadFont`, mirroring the existing `uploadMedia` function at lines ~403-418)
- Modify: `client/src/components/shared/ThemeProvider.jsx` (dynamically register an uploaded font via the CSS Font Loading API)
- Modify: `client/src/components/host/ThemePickerModal.jsx` (add a file input alongside the Task 5 dropdown)
- Modify: `client/src/components/host/Host.jsx` (pass `overrides` to its own `<ThemeProvider>` call site)
- Supabase: new public Storage bucket `trivia-fonts`

- [ ] **Step 1: Create the `trivia-fonts` Storage bucket**

Use the Supabase MCP tool `mcp__claude_ai_Supabase__execute_sql` (project_id `qwtbgusqfoypvehnungr`) to create a public bucket matching the existing `trivia-show-media`/`trivia-host-photos` buckets' convention:

```sql
insert into storage.buckets (id, name, public)
values ('trivia-fonts', 'trivia-fonts', true)
on conflict (id) do nothing;
```

Then check what RLS policies exist on `storage.objects` for the existing `trivia-show-media` bucket (query `select policyname, cmd, qual from pg_policies where tablename = 'objects' and schemaname = 'storage';`) and create equivalent INSERT/SELECT policies scoped to `bucket_id = 'trivia-fonts'` so uploads work the same way `uploadMedia` already does for the other buckets. Match whatever access pattern (anon vs authenticated) the existing buckets use — don't invent a stricter or looser policy than the precedent.

- [ ] **Step 2: Add `uploadFont` to `useShow.js`**

Read the existing `uploadMedia` function first (grep `async function uploadMedia` in `client/src/hooks/useShow.js`) to match its exact style. Add a new function near it:

```js
const FONT_BUCKET = 'trivia-fonts'

async function uploadFont(file) {
  if (!show) throw new Error('No active show')
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['woff2', 'woff', 'ttf', 'otf'].includes(ext)) {
    throw new Error('Font file must be .woff2, .woff, .ttf, or .otf')
  }
  const familyName = `Custom-${nanoid(8)}`
  const path = `${show.id}/${familyName}.${ext}`

  const { error } = await supabase.storage.from(FONT_BUCKET).upload(path, file, { upsert: false })
  if (error) throw new Error(error.message)

  const { data: { publicUrl } } = supabase.storage.from(FONT_BUCKET).getPublicUrl(path)
  return { familyName, url: publicUrl }
}
```

Add `FONT_BUCKET` next to the existing `SHOW_MEDIA_BUCKET`/`HOST_PHOTOS_BUCKET` constants near the top of the file. Add `uploadFont` to the hook's returned object (find where `uploadMedia` is returned, alongside it — grep `uploadMedia,` in the file's final return statement).

- [ ] **Step 3: Dynamically register the uploaded font in `ThemeProvider.jsx`**

A custom uploaded font can't use a build-time `@font-face` rule (the file doesn't exist at build time). Register it at runtime via the CSS Font Loading API. Add a `useEffect` inside `ThemeProvider` that runs whenever the merged `theme.fonts.displayUrl` changes:

```js
useEffect(() => {
  const url = theme.fonts.displayUrl
  const family = theme.fonts.display
  if (!url || !family) return
  const fontFace = new FontFace(family, `url(${url})`)
  fontFace.load().then(loaded => {
    document.fonts.add(loaded)
  }).catch(() => {
    // Font failed to load — text falls back to the next font in the stack, no crash
  })
}, [theme.fonts.displayUrl, theme.fonts.display])
```

Update `applyOverrides` (from Task 4) — it already does `fonts: { ...baseTheme.fonts, ...(overrides.fonts ?? {}) }`, which will correctly carry an `overrides.fonts.displayUrl` key through automatically since it's a full spread of `overrides.fonts`. No change needed there, just confirm this is true by re-reading the current `applyOverrides` implementation before writing Step 3's code, in case Task 4 landed slightly differently than planned.

- [ ] **Step 4: Add upload UI to `ThemePickerModal.jsx`**

Alongside the `DISPLAY_FONTS` dropdown added in Task 5, add a file input:

```jsx
<label className="flex items-center gap-2 text-xs font-medium text-gray-600">
  Upload font
  <input
    type="file"
    accept=".woff2,.woff,.ttf,.otf"
    onChange={async e => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const { familyName, url } = await uploadFont(file)
        const next = { ...overrides, fonts: { ...overrides.fonts, display: familyName, displayUrl: url } }
        setOverrides(next)
        onUpdateOverrides(next)
      } catch (err) {
        alert(err.message)
      }
    }}
    className="text-xs"
  />
</label>
```

This requires `uploadFont` to be available in `ThemePickerModal` — thread it in as a new prop from `BuildMode.jsx` (`onUploadFont={actions.uploadFont}`), matching how `onUpdateOverrides` was wired in Task 5, rather than importing `useShow` directly into the modal (keep the modal a pure props-in/callbacks-out component, consistent with its existing style).

- [ ] **Step 5: Fix `Host.jsx`'s `ThemeProvider` call site**

Find `<ThemeProvider showThemeId={show.theme}>` in `client/src/components/host/Host.jsx` (around line 40) and add `overrides={show.themeOverrides}`, matching the Task 4 pattern exactly. `Host.jsx` already gets `show` via `useShow()`, which Task 3 already wired to include `themeOverrides` correctly — this is purely additive, no other plumbing needed.

- [ ] **Step 6: Verify end-to-end**

Run `npm run dev`. Using `playwright-cli`, open a show's Build Mode, open the theme picker, upload a real font file (if no test font file is available, note that in your report rather than fabricating one — you can construct a minimal valid `.woff2` test fixture only if truly necessary, but prefer testing with one of the already-present files in `public/fonts/` if suitable, e.g. temporarily uploading `Handters.woff2` as a stand-in to prove the upload pipeline works end-to-end even though it's not a "new" font). Confirm: the upload succeeds, the modal's preview pane updates to show the custom font, Build Mode's own background reflects it too (proving the Task 6 Host.jsx fix), and the real `/display` route for that show also reflects it. Screenshot each stage.

- [ ] **Step 7: Commit**

```bash
git add client/src/hooks/useShow.js client/src/components/shared/ThemeProvider.jsx client/src/components/host/ThemePickerModal.jsx client/src/components/host/BuildMode.jsx client/src/components/host/Host.jsx
git commit -m "Add custom font upload and fix Host.jsx theme override preview"
```

---

## Task 7: Address the 4 non-blocking code-review findings from Task 6

All 4 were explicitly flagged as accepted-for-now, non-blocking gaps by Task 6's code-quality review, but the user wants them fixed now rather than deferred.

**Files:**
- Modify: `client/src/components/shared/ThemeProvider.jsx` (font cleanup on override change)
- Modify: `client/src/views/Host.jsx` (de-fragile the `actions` object)
- Modify: `client/src/components/host/ThemePickerModal.jsx` (extract Customize block) — new file: `client/src/components/host/ThemeCustomizeControls.jsx`
- Modify: `client/src/hooks/useShow.js` (upload size limit on `uploadFont`)

- [ ] **Step 1: Clean up `document.fonts` when the override's font changes or clears**

Read the current `ThemeProvider.jsx` font-registration `useEffect` (added in Task 6, should now include the console.warn fix from the prior bugfix pass). Add a `useRef` to track the currently-registered `FontFace`, and a cleanup function that removes it before the next registration or on unmount:

```js
const registeredFontRef = useRef(null)

useEffect(() => {
  const url = theme.fonts.displayUrl
  const family = theme.fonts.display
  if (!url || !family) return

  const fontFace = new FontFace(family, `url(${url})`)
  let cancelled = false
  fontFace.load().then(loaded => {
    if (cancelled) return
    document.fonts.add(loaded)
    registeredFontRef.current = loaded
  }).catch(err => {
    console.warn(`Failed to load custom font "${family}":`, err)
  })

  return () => {
    cancelled = true
    if (registeredFontRef.current) {
      document.fonts.delete(registeredFontRef.current)
      registeredFontRef.current = null
    }
  }
}, [theme.fonts.displayUrl, theme.fonts.display])
```

The `cancelled` flag guards against a race where the effect re-runs (e.g., rapid font switching) before the previous `.load()` promise resolves — without it, a stale, slow-resolving load could register a font AFTER its own cleanup already ran, leaking it anyway. Read the actual current file first and adapt this to whatever the real current structure is (variable names, exact guard clauses) rather than blindly pasting.

- [ ] **Step 2: De-fragile `Host.jsx`'s `actions` object**

Read the current `actions` object in `client/src/views/Host.jsx` (grep `const actions =`). It's currently a manually-curated object literal listing ~16 functions from `showApi`, which is exactly why `uploadFont` was missing until the last bugfix. Change it to spread `showApi` directly instead of re-listing every function:

```js
const actions = { ...showApi }
```

This is safe: `BuildMode.jsx` and its children only ever call specific named functions off the `actions` prop (e.g. `actions.uploadFont(file)`), so including extra unused keys from `showApi` (like `show`, `loading`, functions used elsewhere) is harmless — JS doesn't care about extra object properties. Do NOT change `liveActions` (the separate object passed to `LiveMode`) unless you find clear evidence it has the same missing-function problem — leave it as its own curated object if it's currently intentional and working; if you're unsure, leave it alone and note that in your report rather than guessing.

- [ ] **Step 3: Extract the Customize block from `ThemePickerModal.jsx`**

Read the current `ThemePickerModal.jsx` in full. Find the JSX block that renders the font dropdown, file upload input, and two color-picker swatches (the "Customize" row, added across Tasks 5 and 6). Extract it into a new file `client/src/components/host/ThemeCustomizeControls.jsx` as its own component, taking whatever props it needs (`baseTheme`, `overrides`, `onSetDisplayFont`, `onSetTextColor`, `onUploadFont`, or however you choose to shape the interface — pick whatever is cleanest given the actual current code, since you're the one reading the real implementation). The parent `ThemePickerModal.jsx` should render `<ThemeCustomizeControls ... />` in place of the inline JSX block, passing down whatever state/handlers it still owns (state can stay in the parent if that's simplest — this is purely a presentational extraction, not a state-ownership change, unless moving state down genuinely simplifies things). Keep behavior 100% identical — this is a refactor, not a feature change. Do not change the debounce logic, the upload handler logic, or any Supabase-facing behavior — only the JSX structure/file boundary.

- [ ] **Step 4: Add a file size limit to `uploadFont`**

Read the current `uploadFont` function in `client/src/hooks/useShow.js`. Add a size check before the upload call:

```js
async function uploadFont(file) {
  if (!show) throw new Error('No active show')
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['woff2', 'woff', 'ttf', 'otf'].includes(ext)) {
    throw new Error('Font file must be .woff2, .woff, .ttf, or .otf')
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Font file must be under 5MB')
  }
  // ... rest unchanged
}
```

5MB is generous for any real font file (even large variable-font families rarely exceed 1-2MB) while still blocking an obviously-wrong file selection. Read the actual current function first and insert this check in the right place relative to the existing validation, matching the file's error-throwing style exactly (it should already throw `Error` objects with user-readable messages, consistent with the extension check right above it).

- [ ] **Step 5: Verify**

Run `npm run dev` if not already running. Using `playwright-cli`:
1. For Step 1: set a test show's `theme_overrides` to include a `displayUrl` via SQL, load `/host` for that show, confirm via `document.fonts` inspection that the font registers; then change `theme_overrides` to `{}` via SQL and force a re-render (reload or navigate), confirm via `document.fonts` that the previously-registered custom family is now GONE (not just that no new one was added — actually gone from the set).
2. For Step 2: confirm the app still builds and loads without errors (`npm run build`), and spot-check that `actions.uploadFont`, `actions.updateShowMeta`, and at least 2-3 other previously-listed functions are still callable from Build Mode (e.g., open Build Mode, confirm no console errors, confirm the theme picker still works end-to-end — dropdown change persists).
3. For Step 3: confirm `ThemePickerModal.jsx` still renders identically (screenshot comparison optional but recommended) — open the theme picker, confirm the Customize row (font dropdown, file upload, 2 color swatches) all still render and function exactly as before.
4. For Step 4: attempt to upload a file over 5MB (if no such file exists in the repo, you can note this as untested-by-real-file but confirm by code reading that the size check is correctly placed and would throw before any network call) and confirm the existing valid-size upload (`public/fonts/Handters.woff2`, which is well under 5MB) still works.
5. Revert any test data set during verification.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/shared/ThemeProvider.jsx client/src/views/Host.jsx client/src/components/host/ThemePickerModal.jsx client/src/components/host/ThemeCustomizeControls.jsx client/src/hooks/useShow.js
git commit -m "Clean up registered fonts on change, de-fragile Host.jsx actions, extract customize controls, cap font upload size"
```

Do NOT touch `ParticleBackground.jsx` or `index.css`.

---

## Final Steps

- [ ] Dispatch a final code-reviewer subagent across the full diff covering all 7 tasks together, checking for consistency across the font-list constant, the override merge shape, the upload path, the cleanup logic, and that no theme's default behavior changed for shows with an empty `theme_overrides`. Use the correct base commit (the commit immediately before Task 1 started — check `git log` for the commit predating the first "Wire theme.fonts.display" commit, since `main` may have diverged/converged with this branch multiple times during development).
- [ ] Use `superpowers:finishing-a-development-branch` to wrap up (do not merge to `main` without explicit user confirmation — this branch was created for this feature specifically per user consent to run subagent-driven-development, but merging back is a separate decision).
