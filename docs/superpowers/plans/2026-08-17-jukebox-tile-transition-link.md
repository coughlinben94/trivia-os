# Jukebox Tile Transition-Concepts Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the host dashboard's single "Music Library" tile into a compound tile with two independently-clickable subtiles: the existing Music Library link (unchanged), and a new "Album Transitions" link that opens the published comparison artifact for the 3 ring-world song-transition concepts.

**Architecture:** `BuildMode.jsx`'s dashboard grid (`restBoxContent` / `restBoxOrder`) renders every tile as one flat `<button>` with a single `onClick`. This plan adds an optional `subtiles` array to a tile's definition; when present, the render loop swaps the single button for a `<div>` wrapper containing one stacked button per subtile (same outer footprint/drag-handle, so grid layout and drag-reorder are untouched). Only the `music` entry gets `subtiles` — every other tile keeps its current single-button shape. No new components, no new routes, no backend/schema changes — this is a pure content/render change in one file.

**Tech Stack:** React (BuildMode.jsx), Tailwind, existing Playwright e2e conventions (no new test framework).

---

## File Structure

- Modify: `client/src/components/host/BuildMode.jsx`
  - `restBoxContent.music` (~line 640): change from `{ onClick }` to `{ subtiles: [...] }`
  - The `restBoxOrder.map(...)` render loop (~line 643-663): branch on `box.subtiles` to render the compound layout
- Modify: `e2e/connection-check.spec.js` (~line 58-67): extend the existing "Dashboard: type cards render" test with 2 new assertions

No new files.

---

### Task 1: Compound Music/Transitions tile

**Files:**
- Modify: `client/src/components/host/BuildMode.jsx:640`
- Modify: `client/src/components/host/BuildMode.jsx:643-663`
- Modify: `e2e/connection-check.spec.js:58-67`

- [ ] **Step 1: Change the `music` entry to carry `subtiles` instead of a single `onClick`**

In `client/src/components/host/BuildMode.jsx`, replace this line (currently ~640):

```js
                      music:    { icon: '🎵', name: 'Music Library', desc: 'Jukebox songs, sets & trim points', styleKey: 'music', onClick: () => window.open('/music', '_blank') },
```

with:

```js
                      music:    { icon: '🎵', name: 'Music Library', desc: 'Jukebox songs, sets & trim points', styleKey: 'music', subtiles: [
                        { icon: '🎵', label: 'Music Library', onClick: () => window.open('/music', '_blank') },
                        { icon: '🌀', label: 'Album Transitions', onClick: () => window.open('https://claude.ai/code/artifact/a831a530-6ac5-47ed-8486-66a2b3a53352', '_blank') },
                      ] },
```

(The artifact URL is "Station Thirteen Handoffs" — the 3-concept song-transition comparison built 2026-08-17. If it's ever republished under a new URL, update it here — this is the only place it's hardcoded.)

- [ ] **Step 2: Branch the render loop on `box.subtiles`**

In the same file, the render loop currently reads (~line 643-663):

```js
                    return restBoxOrder.map(id => {
                      const box = restBoxContent[id]
                      if (!box) return null
                      const dropTarget = restDragOverId === id
                      return (
                        <button
                          key={id}
                          data-rest-box-id={id}
                          onClick={box.onClick}
                          className={`relative w-[calc(20%-8px)] flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-center min-h-[100px] ${BTN} ${
                            CARD_STYLE[box.styleKey] ?? 'bg-white border-gray-200 hover:border-gray-400'
                          } ${dropTarget ? 'ring-2 ring-[#1a6b4a] ring-offset-1' : ''}`}
                        >
                          <RestGripHandle id={id} />
                          <span className="text-2xl leading-none">{box.icon}</span>
                          <span className="text-sm font-semibold text-gray-800 leading-tight">{box.name}</span>
                          <span className="text-xs text-gray-500 leading-snug">{box.desc}</span>
                        </button>
                      )
                    })
```

Replace it with:

```js
                    return restBoxOrder.map(id => {
                      const box = restBoxContent[id]
                      if (!box) return null
                      const dropTarget = restDragOverId === id

                      if (box.subtiles) {
                        return (
                          <div
                            key={id}
                            data-rest-box-id={id}
                            className={`relative w-[calc(20%-8px)] flex flex-col rounded-xl border overflow-hidden min-h-[100px] ${
                              CARD_STYLE[box.styleKey] ?? 'bg-white border-gray-200'
                            } ${dropTarget ? 'ring-2 ring-[#1a6b4a] ring-offset-1' : ''}`}
                          >
                            <RestGripHandle id={id} />
                            {box.subtiles.map((sub, i) => (
                              <button
                                key={sub.label}
                                onClick={sub.onClick}
                                className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-center ${BTN} ${
                                  i > 0 ? 'border-t border-black/10' : ''
                                }`}
                              >
                                <span className="text-lg leading-none">{sub.icon}</span>
                                <span className="text-xs font-semibold text-gray-800 leading-tight">{sub.label}</span>
                              </button>
                            ))}
                          </div>
                        )
                      }

                      return (
                        <button
                          key={id}
                          data-rest-box-id={id}
                          onClick={box.onClick}
                          className={`relative w-[calc(20%-8px)] flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-center min-h-[100px] ${BTN} ${
                            CARD_STYLE[box.styleKey] ?? 'bg-white border-gray-200 hover:border-gray-400'
                          } ${dropTarget ? 'ring-2 ring-[#1a6b4a] ring-offset-1' : ''}`}
                        >
                          <RestGripHandle id={id} />
                          <span className="text-2xl leading-none">{box.icon}</span>
                          <span className="text-sm font-semibold text-gray-800 leading-tight">{box.name}</span>
                          <span className="text-xs text-gray-500 leading-snug">{box.desc}</span>
                        </button>
                      )
                    })
```

Notes for the implementer:
- `BTN`, `CARD_STYLE`, and `RestGripHandle` are already defined/imported earlier in this file — don't redeclare them.
- `RestGripHandle` stays exactly as-is; the whole compound tile still drags as one unit under `id === 'music'` in `restBoxOrder` — only the click targets inside it split in two. Don't add a second grip handle.
- The outer element changes from `<button>` to `<div>` only for the `subtiles` branch (a `<div>` can't be a valid target for the old single `onClick`, and nesting `<button>` inside `<button>` is invalid HTML) — every other tile is untouched and stays a `<button>`.

- [ ] **Step 3: Visually verify in the running app**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npm run dev` (or `vercel dev` per this repo's normal local workflow), open `/host`, load any show, and confirm on the dashboard grid:
- The tile that used to say "Music Library" / "Jukebox songs, sets & trim points" now shows two stacked rows: "🎵 Music Library" on top, "🌀 Album Transitions" below, divided by a thin line, inside one card with the same footprint as its neighbors.
- Clicking the top row opens `/music` in a new tab (unchanged behavior).
- Clicking the bottom row opens `https://claude.ai/code/artifact/a831a530-6ac5-47ed-8486-66a2b3a53352` in a new tab.
- Drag the ⠿ grip on this tile to reorder it among its neighbors — confirm it still drags as one unit and both rows remain clickable after the reorder.
- No console errors.

- [ ] **Step 4: Extend the existing dashboard e2e assertion**

In `e2e/connection-check.spec.js`, the test `'Dashboard: type cards render including Winner Reveal'` currently ends with:

```js
  await expect(page.getByText('Question Database')).toBeVisible()
  expect(errors, `JS errors:\n${errors.join('\n')}`).toHaveLength(0)
})
```

Change it to:

```js
  await expect(page.getByText('Question Database')).toBeVisible()
  await expect(page.getByText('Music Library')).toBeVisible()
  await expect(page.getByText('Album Transitions')).toBeVisible()
  expect(errors, `JS errors:\n${errors.join('\n')}`).toHaveLength(0)
})
```

- [ ] **Step 5: Run the e2e suite to confirm the assertion passes**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx playwright test e2e/connection-check.spec.js e2e/host-smoke.spec.js`
Expected: `8 passed` (the two new assertions added to the existing 6-test file, plus the 2 host-smoke tests, all green). If `Music Library` or `Album Transitions` isn't found, re-check Step 1/2 — most likely cause is a typo in the label string or the `subtiles` branch not being reached.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/baynes-trivia/trivia-os
git add client/src/components/host/BuildMode.jsx e2e/connection-check.spec.js
git commit -m "$(cat <<'EOF'
Split the Music Library dashboard tile into two subtiles, adding a link to the ring-world transition-concepts comparison

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Do NOT push. Do NOT run `scripts/ship.sh`. Report the commit hash back and stop — Ben reviews before anything goes to origin, especially the night before a live show.

---

## Self-Review

- **Spec coverage:** Music Library subtile (unchanged link) — Step 1/2. Album Transitions subtile (new link to the artifact) — Step 1/2. "Sitting inside" the tile — interpreted as a same-origin-tab link from within the host dashboard, not a same-page iframe embed (claude.ai artifact pages are a different origin with their own framing/auth posture; a plain link matches every other external tile in this grid — `/music`, `/questions`, `/dashboard`, `/shows` — which are all `window.open(url, '_blank')`, not iframes). If an actual embedded iframe is wanted instead of a new-tab link, that's a different, larger change (CSP/frame-ancestors considerations) — flag it back to Ben rather than guessing.
- **Placeholder scan:** none — every step has literal, complete code.
- **Scope check:** single file's render logic plus one e2e assertion; no schema/backend/route changes. Appropriately small for a same-night change.
- **Type/name consistency:** `subtiles` is the only new field name, used identically in Step 1 (data) and Step 2 (render branch) — no drift.
