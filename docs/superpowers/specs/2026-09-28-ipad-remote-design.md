# iPad Host Remote: design spec

**Date:** 2026-09-28 · **Status:** v4. It takes in three outside critiques; rejected or narrowed items are in §16. · **Scope:** spec only

## 1. Goal

An iPad app (added to the home screen) that Ben holds while he hosts. It does more than the Stream Deck and should replace it in time. The Stream Deck stays plugged in as a backup for the first few shows.

On the iPad:
1. **What's coming next.** A big Next button that shows what the next press will do (from `nextPressCue`), plus an Up Next list.
2. **Score entry**, in the style of Quick Entry.
3. **Jump and fix.** Go to any slide, unlock a question, re-run scoring, and set the answer, TV scoreboard and phone scores.
4. A plain host screen that covers most of the night.
5. *Nice-to-have, phase 4:* room status.

**Non-goals:** editing slides; Build Mode; running a show with the laptop closed; the iPad as a second show engine.

## 2. Hard rule: the laptop is the only engine

The laptop (**macbook-pro**) stays on `/host` Live Mode. It is the **only** window that runs the lock countdown, lock+score, audio start, and the TV. The iPad is a remote control. It never writes to Supabase and never calls `actions.nextSlide` itself.

Why: Next is not one action. It runs the lock countdown first, then audio start, then answer-hide with a deferred advance, and only then `nextSlide`. The countdown finish effect (LiveMode ~:1082) and `lockHandlersRef` exist only in this component. There is one more reason. The laptop's `useShow` Realtime handler merges `showState` only, never `slides` (`useShow.js:~146-179`), so a `slides` write from anywhere else would be missed and then overwritten.

That merge rule has a second effect. **While the iPad is in use, keep Stream Deck keyboard focus on the `/host` window.** A press that lands on `/display` changes `currentPart` in the database, and the laptop never sees it, so its next press rewinds the slide (LiveMode ~:841-856).

## 3. Transport: a relay on the laptop, reached over Tailscale

```
 iPad PWA  https://trivia-os.vercel.app/remote
        │  wss://macbook-pro.tail13050c.ts.net:8795   (first message: pairing secret)
        ▼
  tailscale serve ──► 127.0.0.1:8796 "remote" listener ┐
                                                       ├─ relay/server.mjs (node:http + ws)
  /host tab (Chrome) ──ws://localhost:8794──► 127.0.0.1:8794 "host" listener ┘
        └─ runHostCommand ──► Supabase (host_verified session) ──► TV / phones
```

- **The relay is a thin pipe.** It checks shape and size on messages from the iPad (8KB max). It sends commands to the host and sends state and results to the iPads. It keeps the last state and **marks it stale when the host socket closes**. It does not queue commands. If no host is connected, it replies straight away with `laptop-offline`.
- **Two listeners, not one.** Both bind to `127.0.0.1`, and serve proxies only to the remote port (8796), so no tailnet device can reach the host port (8794).
- **One host socket at a time.** The newest one wins. The old socket gets **close code 4001 ("replaced")**. The old tab then shows "Another /host tab took over the iPad remote" and **stops reconnecting** until it's reloaded.
- **The iPad page is served from Vercel** as a normal route.
- **Ports:** 8794 to 8796 are free on macbook-pro. `tailscale serve status` also lists entries under `bens-macbook-air`, which Ben says is a stale name for this machine. Don't clean them up with `tailscale serve reset`, because that clears every route, Davos's included. Remove only the named stale route, as a separate, deliberate step.

**Platform facts (checked 2026-09-28):**
- **Chrome gates WebSocket connections to localhost.** From Chrome 147, Local Network Access (LNA) gates WebSocket connections from a public https origin to loopback behind a permission prompt; the user can Allow or Block (blink-dev "Local network access restrictions for WebSockets"; getsentry/browser-updates-radar#29). The permission is **per origin**, the same as the relay's Origin allowlist. A page on `localhost:5173` never triggers it. Safari on the laptop is not supported for `/host`.
- **`tailscale serve`.** `tailscale serve --bg --https=8795 http://127.0.0.1:8796` lasts across reboots and needs tailnet HTTPS certificates (tailscale.com/kb/1242, /kb/1312). Never use Funnel.
- **WebSocket through serve is unproven here.** The docs don't mention it. Issue #18651 reports query strings dropped on WS upgrades, so nothing goes in the URL. Issue #18827 reports serve WebSocket connections dropping every 10-40s with close code 1001 on some machines; I haven't reproduced this myself. The label printer's serve setup is plain HTTP and proves nothing about WebSockets. The phase-0 spike tests it (§13).

## 4. Auth

Every device on this tailnet signs in as `coughlinben94@`: macbook-pro, bens-server, iphone182, ipad157, ipad157-1, ipad157-2 and ipad-air-10-5. A login check therefore can't tell devices apart, so **the pairing secret is the gate.**

- **Pairing secret (phase 1).** `npm run relay -- --init` writes a random **26-character base32** secret to `~/.config/trivia-relay/secret` (mode 0600) and prints it once. Ben types it once into the iPad's ⚙ drawer, or pastes it with Universal Clipboard, and it's kept in `localStorage`.
  - The iPad sends it as the **first WebSocket message**, `{type:'hello', secret}`, never in the URL.
  - The relay compares **SHA-256 digests** with `crypto.timingSafeEqual`, so the two buffers always have equal length. (`timingSafeEqual` throws `RangeError` when lengths differ.) All hello handling is wrapped in try/catch.
  - A wrong or missing hello within 3s closes the socket with code 4003, and the iPad shows "Pairing code wrong — re-enter it in ⚙."
  - **Rotation.** The relay reads the secret file **on every hello**, so a new `--init` takes effect without a restart. `--init` **refuses to overwrite** an existing file unless `--force` is passed. After close code 4003 the iPad **stops auto-reconnecting** until the ⚙ secret field changes, so a wrong code doesn't hammer the relay.
- **Origin check on both listeners.** The allowlist is `https://trivia-os.vercel.app` only. `http://localhost:5173` is allowed only with `RELAY_DEV=1`. The relay logs a loud warning on each start while that's on, and refuses the flag when launched by launchd (`XPC_SERVICE_NAME` is set). The plist never sets it.
- **Tailnet access rule: deferred, not a phase-1 gate.** The rule's source would have to be the iPad's 100.x address. The first rule written replaces the default allow-all policy, so it could cut off bens-server, Kingo and the label printer. Treat it as a separate step that can be undone, after Ben signs off the full policy text.
- **RLS still holds.** Each database write for an iPad command runs in the laptop tab, through its own `actions` and its own session carrying `host_verified` (`HostPinGate` and `verify-host-pin`). The iPad holds no Supabase session or key, RLS has not changed, and the iPad can only do what `/host` can already do.
- **Gaps:** until the tailnet rule exists, any tailnet device that has the secret is a remote. A lost iPad is handled by revoking it in Tailscale and running `--init` again. Local programs on the laptop are trusted.

## 5. `runHostCommand`: one decision path

**Already built, uncommitted (see §13):** `client/src/lib/hostCommands.js` `planHostCommand({cmd, via}, ctx)`, wired into LiveMode. It returns `{run}` or `{refuse}`. `via:'button'` keeps the Next button's older behaviour: no modal check and no answer-hide dance.

- The socket's `onmessage` calls **`runHostCommandRef.current`**, reassigned every render (the same approach as `actionsRef` and `lockHandlersRef`).
- Remote commands use a new `via:'remote'`, which gets the keyboard's checks plus the remote-only checks below.
- **Exact check order for `via:'remote'`** (first match wins):
  1. `late` (laptop `now − sentAt > 1500`, or `sentAt` missing)
  2. `paused`
  3. `busy` (the remote busy gate, §6) — for `next` and `prev` only. It **must** come before the lock-phase check: `updateSlide` is optimistic, so the instant `handleLockWagers` writes `wagerTiersLocked`, `pendingLockPhase` flips to `wager-guesses`, and without this a second Next would start a phantom guesses countdown that `handleLockWagers`' final write then wipes.
  4. `modal-open`
  5. `slide-changed` (`expectSlideId` ≠ current slide id) — for `next`, `prev` and `answer`
  6. per command. `next`: `pending-advance`, then `gate-changed` (the laptop's gate is `reveal-owed` or `null`, or differs from `expectGate`), then the keyboard's own order (lock phase, `locking`, `scoring`, audio, answer-hide, advance). `answer`: `scoring`, then the end-state rules (§6).
  7. anything else is `unknown-command`.
- **The keyboard's KeyA/S/R stay toggles.** Only `via:'remote'` uses end-state commands, so step 1 doesn't change what the keys do.

## 6. Command vocabulary

Every command is `{type:'cmd', id, cmd, args, expectSlideId, sentAt}`. `sentAt` is in laptop time (§7). The reply is `{type:'result', id, received:true}` or `{type:'result', id, refused:<reason>}`. **"received" only means the laptop got the command.** The iPad treats only the next `state` as the truth. Refusals show on the iPad as plain text:

| reason | iPad text |
|---|---|
| `slide-changed` | "Slide changed — check the screen" |
| `gate-changed` | "That button changed — look again" |
| `scoring` | "Scoring in progress" |
| `saving-scores` | "Saving scores…" |
| `late` | "Got there late — press again" |
| `modal-open` | "Close the panel on the laptop" |
| `paused` | "Remote paused on the laptop" |
| `pending-advance` | shown with the `gate-changed` text |
| `locking` | "Countdown running" |
| `busy` | "Laptop is busy — wait a second" |
| `laptop-offline` | "Open Live Mode on the laptop" (the relay sends it when no host socket is connected; it also drives the orange strip) |
| `unknown-command` | dev-only: "Update the remote app" (only a newer iPad build talking to an older laptop can hit it) |

**Remote busy gate** (as `ctx.remoteBusy`), true while any of these is true:
- `jumpBusy` (phase 2), `scoringBusy` (the keyboard's capped `scoringBlocksNext()`), or `raceBusy` with **its own `raceSinceRef` 12s cap**. `raceBusy` stays a separate remote-only busy input; folding it into `scoringBusy` would change the keyboard and is not approved (§15 Q2).
- `pylPickerBusy`
- `lockCountdownStartedAt`
- the score write queue is non-empty (phase 3)

It never gates the keyboard.

| cmd | Laptop runs | Rules |
|---|---|---|
| `next {expectGate}` | `planHostCommand('next', via:'remote')` | `expectGate` is the `gate` the iPad showed (§8 vocabulary). It's refused as `gate-changed` if the laptop's current gate is different, and always on `reveal-owed` (a locked but unrevealed phone question: the keyboard path advances there — pre-existing, left alone — but the remote refuses and lights Answer instead) and on `null`. Example: a second tap on "Play clip" after the audio has started would otherwise advance and cut the clip off. Another example: a second tap during `handleLockWagers`'s busy window would otherwise start a guesses countdown that the tiers write then wipes. It's refused while scoring (already in `planHostCommand`: `scoringBlocked`) and while the score queue is non-empty. **No `sentAt` spacing: `guardNav` decides, exactly as for the keyboard.** |
| `prev` | ArrowLeft path | |
| `answer {value}` | If `pendingReveal(slide)` and `value` is true, then `revealCurrentSlide()`. If the phone slide is already revealed and `value` is true, do nothing. Otherwise `setAnswerReveal(value)`, a no-op if it already matches | Refused while scoring |
| `scoreboard {value}` / `scores-reveal {value}` | Set the value, a no-op if it already matches | |
| `jump {index}` | `jumpTo(index)` (below) | `expectSlideId` + busy gate. Also refused while `pendingAdvanceRef` is set, because the 280ms deferred `nextSlide` holds the old `show` and would overwrite the jump |
| `unlock` | `unlockCurrentSlide()`; horse race has its own branch (`raceLocked:false`) | `expectSlideId` + busy gate. The gate matters here: `lockAndScore`'s final write (~:502-504) sets the lock field again |
| `rescore` | `scoreActionFor(phoneMechanic, slide)`, **extracted** from the inline `panel.act` closures (LiveMode ~:1442-1499); it doesn't exist yet | Only if **`canRescore = !pendingLockPhase(slide) && lastLockFieldSet && !busy && !lockCountdownStartedAt && !(revealed && !error)`** (the laptop's `hideMainPanel` rule, ~:1506). On wager, "any lock field" would count tiers-only as locked, and `handleLockAndScoreWagers` would then lock the guesses early. After the reveal, a rescore would rewrite `wagerResults` under a reveal the TV is already showing. **Horse race is excluded** (laptop only) |
| `score.teams` | Fresh read of `scoreboard_teams` + `deriveRoundCols` | |
| `score.open` / `score.close` | `scores_locked_at` lock + 2-min refresh (the `ScoreboardModal.jsx:311-337` compare-and-clear, extracted) | Refused while the laptop's `ScoreboardModal` is open. The iPad **sends `score.open` again when the first live `state` arrives after a reconnect** (not on socket open, when the host may not be there yet) while the drawer is open, and each `score.set` refreshes the lock too. The laptop drops the lock if no `score.*` arrives for 3 min (`Join.jsx` already treats a lock older than 10 min as expired) |
| `score.set {teamId, colKey, value}` | Queued on the **score chain** (below): fresh read of the row, then build the cell with `phoneBySlide` from that read, then `upsert` | Busy gate + modal refusal |

**The score chain.** It is one promise chain on the laptop (`scoreCellWrite.js`), and it has to work in both directions:
- `lockAndScore` (~:452-490) runs its `scoreboard_teams` read-then-upsert **inside the same chain**, so a `score.set` can't land between that read and that upsert.
- That is less code than bringing the atomic jsonb-set RPC forward. An RPC fixes only the iPad's cell write, while `lockAndScore` would still upsert whole `scores` objects built from its own earlier read, so the chain would still be needed. The RPC stays a later fix.
- The snapshot carries `scoreQueueDepth`. While it's above 0, Next reads "Saving scores…" and `next` and `jump` are refused. `WinnerRevealSlide` and `saveResults` read `scoreboard_teams` as the winner slide appears.

**`jumpTo(index)` in `useShow.js` is new mid-show behaviour.** Live Mode has no jump today. It mirrors `goLiveFrom` (`useShow.js:760`) with these differences:
- `protectInProgress = target <= furthestIndexRef.current`. `furthestIndexRef` is a new ref in `useShow`, raised on every nav (next, prev, jump) and reset in `goLive`/`goLiveFrom`. `target < current` is wrong: jump back to Q3, then forward to Q5 (already scored), and Q5's locks would be cleared.
- Only a **team-picker** target needs `bakeTeamPickerParts` first, which costs a `teams` SELECT before the optimistic update. Any other target does `markLocalNav()` and `setShow` optimistically **before any `await`**. `withEntryState` and `bakeTeamPickerParts` patch only the target slide, although the whole `slides` column is written.
- It sets a non-null `current_slide_id`. If it were null, `computeNextStep` would take its first-reveal branch (~:477).
- It folds `answer_reveal:false` into the same write and applies `withAudioReset`.
- It **skips `archiveShow` and `is_live`**. (`updated_at` comes from the DB trigger.)

LiveMode holds `jumpBusy`, capped at 12s, until the write resolves.

**Laptop-only (YAGNI):** flip-em-down hints, horse-race start/reset/rescore, the PYL picker, the visual-shiny image reveal, Late Team, End Show, theme, and "Score anyway: 0".

## 7. Clocks, freshness, heartbeat

There are two mechanisms, merged into one exchange:
1. The **relay sends `relay-beat` every 2s** to every socket.
2. The laptop **answers inside `onmessage`**, not from its own `setInterval`, because hidden Chrome tabs throttle timers. Its reply is `{type:'beat', laptopNow: Date.now(), visibility: document.visibilityState}`, and the relay passes it on to the iPads.

- The iPad keeps `offset = laptopNow − iPadNow` from the latest beat and stamps `sentAt = Date.now() + offset`.
- The laptop drops any command with `now − sentAt > 1500` and replies `late`. `sentAt` is used **only** for this cut.
- The iPad force-reconnects after 5s without a `relay-beat`, with **1s-to-10s backoff**. The relay's `ws` ping every 10s ends dead sockets.
- Buttons go grey when the last laptop beat is more than 5s old.

**Status strip:** 🟢 "Laptop connected" / 🟠 "Laptop screen hidden — timers slowed, bring /host to the front" (`visibility:'hidden'`) / 🟠 "Open Live Mode on the laptop" (cached state is stale) / 🟠 "Laptop not responding" / 🔴 "Can't reach the laptop — check Tailscale" or "Pairing code wrong".

**Laptop Live Mode chip:**
- States: "iPad remote: connected" / "no iPad" / "relay not running, or Chrome blocked local network access for this site (Site settings)".
- **"Pause iPad remote"** is a switch on the chip that takes control back in an emergency. While it's on, every remote command is refused as `paused` and the iPad shows it.
- The laptop reconnects with 1s-to-10s backoff, only while LiveMode is mounted, and never after close code 4001.

## 8. State (laptop to iPad)

The iPad reads no Supabase. The laptop sends one snapshot, **throttled to one message every 150ms at most, and only when the snapshot has changed**. "Changed" alone would leave a fresh iPad blank after a relay restart, so:
- the laptop **resets `lastSent` to null on every socket open** and sends a snapshot straight away;
- the relay caches the last state and **replays it on every accepted iPad hello**;
- the relay pushes **`{type:'host', connected:bool}`** to iPads on every host connect/close and after each hello, so the iPad can tell a stale cached state from a live one.

Phase-1 shape:

```
{ type:'state', slide:{index,total,id,label,type}, cue, gate, upNext:[{label,type}×2],
  toggles:{answerReveal,scoreboardVisible,scoresRevealed},
  fix:{mechanic, pendingReveal, revealed, canUnlock, canRescore, error},
  busy:{jump, scoring, race, countdown}, scoreQueueDepth, audioPlaying,
  laptopModalOpen, paused, slides:[{index,label,round}] }
```

- `cue` and `gate` both come from one call (`nextPressGate`, which `nextPressCue` wraps). `gate` is the machine-readable form, so the same code produces the label and `expectGate`, and the two can't disagree. The call passes `scoringBusy`; LiveMode's call today (~:277) doesn't.
- **Gate vocabulary, 1:1 with the cue branches:** `lock`, `locking`, `scoring`, `saving`, `audio`, `walkout`, `reveal-part`, `reveal-owed`, `advance`, `null`. The iPad greys Next on `locking`, `scoring`, `saving` and `null`.
- **`nextPressCue.js` fixes** (they help the laptop too):
  - When `pendingReveal(slide)`, it says "Press Answer to reveal".
  - It covers the invoke-gated walkout-song press (`slideStepping.js` ~:494-520): "Play walkout song".
  - The `wager-tiers` phase says "Lock wagers" instead of "Lock answers".
  - It adds "Saving scores…".
- **Up Next: 2 slides** (LiveMode `slice(+1,+3)`, ~:273). **One label function:** move `slidePickerLabel` (`Host.jsx:350`) to `client/src/lib/slidePickerLabel.js` for the snapshot, Up Next and the jump list. Switching the laptop's `UpNextCard` (~:200) to it is optional.
- **Nothing new in the database:** no schema, RLS or publication changes, and no RT-1 merge on the iPad, so there's no third show-shape copy. The project-id check (`qwtbgusqfoypvehnungr`, not `dreggwinegtirxxanntv`) has nothing to guard until phase 4.

## 9. The iPad app

- **Route:** `/remote`, component `client/src/views/Remote.jsx`. No `HostPinGate` and no service worker.
- **Home screen:** `public/remote-manifest.json` (scope `/remote`, standalone, orientation `any`, join icons), added with the head-tag injection pattern from `Join.jsx:1876-1892`.
- **Wake lock:** requested on first tap and again when the page becomes visible. It needs iPadOS 18.4 or later in home-screen apps (WebKit bug 254545). **Ben assumes 18.4 or later, unverified.** Fallback: Auto-Lock set to Never.
- **Touch:** targets at least 64pt, Next at least 200pt, `touch-action: manipulation`, no hover, layouts for landscape and portrait.
- **⚙ drawer:** relay URL (default `wss://macbook-pro.tail13050c.ts.net:8795`) and the pairing secret.

```
┌───────────────────────────────────────────────────────────────┐
│ 🟢 Laptop connected        Q4 · Round 2        slide 23 / 61   │
├───────────────────────────────────────┬───────────────────────┤
│            NEXT ▶                     │  UP NEXT              │
│        "Lock answers"                 │  › Q5 Round 2         │
│                                       │  › Q6 Round 2         │
├──────────┬───────────┬────────────────┼───────────────────────┤
│ ◀ PREV   │ Answer ●  │ Scoreboard ○   │  FIX (this slide)     │
├──────────┴───────────┼────────────────┤  🔓 Unlock  🔁 Rescore │
│ Phone scores ○       │                │  refusal / error text │
├──────────────────────┴────────────────┴───────────────────────┤
│   [ Jump ▸ ]            [ Score ▸ ]            [ ⚙ ]          │
└───────────────────────────────────────────────────────────────┘
```

- Toggles show the snapshot state and send the opposite as `{value}`.
- Jump asks for a second tap to confirm.
- The Score drawer uses Quick Entry's team, round, then score steps as large buttons and a number pad.
- Buttons go grey from `busy.*`, `scoreQueueDepth`, `paused` and heartbeat age.

## 10. Repo layout

```
relay/                         own package, never imported by client/ (not in the Vercel bundle)
  package.json                 { "type":"module", "dependencies": { "ws": "^8" }, "scripts": { "start": "node server.mjs" } }
  server.mjs                   node:http ×2 + ws noServer/handleUpgrade, hello/secret, origin, beats
  server.test.mjs              vitest (real ws server, ephemeral ports)
  stub-host.mjs                fake LiveMode peer for protocol e2e
  e2e.test.mjs                 relay + stub-host + fake iPad, vitest
  ops/com.baynes.trivia-relay.plist   KeepAlive + RunAtLoad; never sets RELAY_DEV
client/src/lib/hostCommands.js        BUILT (step 1): planHostCommand; step 2 adds via:'remote', expectGate, remoteBusy, end-state
client/src/lib/remoteProtocol.js      constants, refusal text, message validation, iPad status (shared by relay, laptop, iPad)
client/src/lib/remoteSnapshot.js      buildSnapshot, hostReply, makeSnapshotSender, hostChipText
client/src/hooks/useRemoteLink.js     laptop socket, beat reply, runHostCommandRef dispatch, lock auto-drop, pause
client/src/lib/slidePickerLabel.js    moved from Host.jsx
client/src/lib/scoreCellWrite.js      score chain (shared by score.set, lockAndScore, ScoreboardModal) + scores lock
client/src/views/Remote.jsx
public/remote-manifest.json
root package.json    + "relay": "npm --prefix relay start"
                     + "relay:serve": "tailscale serve --bg --https=8795 http://127.0.0.1:8796"
```

- **Bare `node:http` + `ws` only.** Node 24 has a WebSocket client but no server. Express and Socket.io are not used.
- **Scoped exception, two docs.** **SKILL.md Rule 4** ("No Socket.io, no Express") and **CLAUDE.md Key Rules** ("Never use Socket.io, Express, or local file storage"; "Supabase is the only backend") were both written for show sync. The relay is a deliberate, narrow exception, and its secret file is laptop-local config, not show data. **Recommended wording for both:** "Show state lives in Supabase and syncs through Realtime only — no Socket.io, no Express, no local file storage. One scoped exception: `relay/` (bare Node + `ws`, laptop-local, plus its pairing-secret file) carries iPad remote commands to the /host tab and never carries show state to /display or /join."
- Relay tests run under vitest: `vitest.config.js` `include` gains `relay/**/*.test.mjs` (the `ws` import resolves from `relay/node_modules`, so `npm --prefix relay install` must have run). The relay never deploys.
- `RELAY_DEV` under launchd: macOS Terminal shells set `XPC_SERVICE_NAME=0`, so the check is "set and not `0`" (`devRefused` in `server.mjs`).

## 11. Startup story

**One-time setup:**
1. `npm --prefix relay install`
2. `npm run relay -- --init`
3. `npm run relay:serve`
4. Load the plist.
5. Allow the Chrome LNA prompt on the deployed site.
6. On the iPad: open `/remote`, Add to Home Screen, enter the secret.

**Show night:** open `/host` in Chrome and go to Live Mode; the chip should read "connected". Without launchd, run `npm run relay`.

## 12. Testing

- **Unit (vitest):**
  - `hostCommands.test.js` (exists) pins `jump` as `unknown-command`; **flip that test when `jump` lands** (phase 2). It gains `via:'remote'`: the §5 check order, `expectGate` mismatch, `remoteBusy` (race, PYL, countdown, jump, queue), end-state no-ops, the answer reveal-first order and the already-revealed no-op, and `canRescore` false for wager tiers-only, unlocked or revealed slides.
  - `remoteSnapshot.test.js`: `gate`/`cue` agreement and 2-slide Up Next.
  - `nextPressCue.test.js`: new labels.
  - `scoreCellWrite.test.js`: fresh-read `phoneBySlide`, and that the chain puts a `lockAndScore` segment and a `score.set` in order.
- **Relay (vitest, `relay/*.test.mjs`):**
  - A wrong-length secret doesn't crash the relay.
  - Wrong or late hello gives 4003.
  - Origin rejects, and dev origin is refused without the flag.
  - Offline reply with no queue.
  - Close code 4001 on replace.
  - Stale state on host close.
  - Beat relay.
  - 8KB inbound cap.
- **Protocol e2e (no Supabase):** relay + `stub-host.mjs` + `/remote` in bundled Playwright Chromium, never Ben's real Chrome and never `executablePath`. It checks that taps become commands with the right `expectGate`, that each refusal reason shows, and that the strip moves 🟢, then 🟠 when the stub stops beating, then 🔴 when the relay is killed.
- **Real LiveMode: manual rehearsal (route 12b) is the real route.** Pin the TV to `/display?show=<id>`, use a throwaway show, and finish with the required teardown: `endShow`, then delete the show. (Live Mode can't run without `is_live:true`, and `display:any-live` follows any live show.) Route 12a, a Supabase branch or local stack, is optional and may cost money.
- **`jumpTo` unit tests (phase 2)** include "jump back, then jump forward to an already-scored question keeps its locks".
- **Rehearsal checklist:** step through a multi-part shiny series (fast Next through its parts); a wager slide end to end (lock wagers, lock answers, reveal, and rescore refused after the reveal); Play clip then a fast second tap refused as `gate-changed`; a jump back into a locked question keeps its locks; score entry during a countdown refused; the Pause switch.

## 13. Build order

- **Step 1: `runHostCommand` / `planHostCommand` refactor, keyboard only.** **BUILT, uncommitted:** `client/src/lib/hostCommands.js` + LiveMode wiring, tests and build passing. **Unproven until it passes the route-12b rehearsal, which must happen before any real show uses it.**
- **Phase 0 spike, before any relay code:**
  - A throwaway page on the deployed `trivia-os.vercel.app` opens `ws://localhost:8794` to check the LNA prompt with both Allow and Block.
  - A real iPad holds WSS through `tailscale serve` to a 20-line echo server **for 30 minutes**, sleeping and waking the iPad, while counting reconnects and 1001 closes (issue #18827). Too many drops means rethinking the transport.
- **Phase 1:** relay, plist, pairing, `useRemoteLink` (beat reply, Pause), `/remote` with Next (`cue`/`gate`), Prev, the three toggles, Up Next, strip, chip, wake lock, manifest, and the `nextPressCue` fixes. Rehearse, then one show with the Stream Deck as backup.
- **Phase 2:** `jumpTo` + `jumpBusy`, then unlock and rescore. Then **Stream Deck parity (§17)**: jukebox mode through a `/display` relay peer, volume and Duck, and the soundboard.
- **Phase 3:** score chain (including the `lockAndScore` segment), `score.*`, lock keep-alive and auto-drop.
- **Phase 4, nice-to-have:** room status; re-check the project id and publication before touching them.
- **Later:** the tailnet access rule (§4) and the atomic jsonb-set RPC.

## 14. Failure modes

Fallback ladder: **iPad, then the laptop keyboard or Live Mode buttons.** The Stream Deck is optional; while plugged in, it acts as the laptop keyboard.

| Failure | What Ben sees | Fallback |
|---|---|---|
| Relay process dies | 🔴; chip "relay not running…". launchd restarts it | Laptop |
| Chrome LNA blocked | Chip names it | Site settings, then Allow |
| Serve WebSocket drops (1001) | Brief 🔴, then auto-reconnect; state resends | Laptop if it keeps dropping |
| Tailscale drops on iPad | 🔴 "check Tailscale" | Laptop |
| Laptop screen hidden | 🟠 "timers slowed". The laptop still answers beats, because it replies from `onmessage` | Bring /host to the front |
| Laptop asleep / /host closed | 🟠. Nothing queued; late commands dropped at 1500ms | Wake the laptop, open Live Mode |
| iPad sleeps with Score drawer open | Lock dropped after 3 min with no `score.*`; `score.open` resent when live state returns | None |
| Relay restarts | iPad reconnects (1-10s backoff); the laptop resends a snapshot on open and the relay replays it on hello | None |
| iPad view stale | `expectGate` / `expectSlideId` refusals with plain text | Look, press again |
| Stream Deck + iPad at once | Both run through one window's `guardNav` (120ms by arrival), so at most one advance per 120ms | One person drives Next |
| Stream Deck focus on /display | Rewind risk (§2) | Keep focus on /host |
| Something odd from the iPad | | **Pause iPad remote** on the chip |
| Two /host tabs | Old one gets 4001 and stops | Close it |
| Jukebox button pressed while the `/display` window is closed or not linked (§17) | Jukebox buttons grey, "TV window not linked" | Stream Deck B / Space with focus on /display |
| Back to Trivia during the 10s wait, before the jukebox is up | Refused `jukebox-not-open`; the iPad offers "Open jukebox now" instead | None |
| Relay restarts while ducked | Relay reloads the pre-duck volume from `duck.json`, and the iPad still shows Duck ●; one press restores it | Vol keys |
| Relay crashes mid-sound | The `afplay` child is orphaned and plays to the end (clips are short); Stop all can't reach it | Wait, or Vol down |
| Volume keys with the audio output on AirPlay to the TV | Unverified that `set volume` moves the AirPlay volume (§17 Q) | Stream Deck vol keys / TV remote |

## 15. Cut (YAGNI) and open questions

**Cut:**
- The Supabase command queue, both as the main transport and as a fallback. The laptop keyboard covers a dead relay. Revisit only if Ben needs to drive a show from off the laptop's tailnet.
- Command-id dedup and `sentAt` press spacing.
- Login allowlist.
- A separate slides message.
- Service worker, relay-served page, custom icon.
- Laptop-only commands (§6).
- Full cross-page Playwright with real LiveMode.

**Open questions:**
1. Which tailnet device is the show iPad (`ipad-air-10-5`, offline 42 days, or one of the `ipad157*`)? Only needed for the later access rule.
2. **Proposed separate fix, not approved:** add `raceBusy` to LiveMode's `scoringBusy` (~:266) so the keyboard's Next is blocked during horse-race scoring too. The remote gate covers it either way.
3. Phase 4: is `phone_answers` in the Realtime publication, or should the laptop poll it?
4. Stream Deck parity questions are in §17.

## 16. Rejected or narrowed critique items

I checked everything against the code: `pendingLockPhase`, `pendingReveal` and `unlockPatch` in `slideStepping.js`; `computeNextStep` ~:474-560; `lockAndScore` ~:387-506; `hideMainPanel` ~:1486; `goLiveFrom`; `withEntryState`; the `updated_at` trigger migration; `planHostCommand` in the built `hostCommands.js`; `tailscale status` and `tailscale serve status`.

- **Critique 1 #1 (tailnet ACL as a gate):** narrowed by critique 2 #10 to a deferred step. The pairing secret is the gate.
- **Critique 1 #16 (one label function):** required for the iPad; switching the laptop's `UpNextCard` over is optional (visible change).
- **Critique 2 SF3 (chain or RPC):** chose the chain. The RPC alone doesn't stop `lockAndScore`'s whole-object upsert from overwriting a cell written between its read and its write, so it wouldn't be less code.
- **Critique 2 nit (clean stale `bens-macbook-air` serve entries):** narrowed. Never use `tailscale serve reset`, because it clears every route including Davos. Remove only the named stale route, as a separate step.
- **Critique 2 SF1 (goLiveFrom "rewrites every slide"):** accepted as a correction. It writes the whole `slides` column, but `withEntryState`/`bakeTeamPickerParts` patch only the target slide. `goLiveFrom` also puts `updated_at` in its patch, but the trigger sets it on every write anyway.
- **Critique 2 B3 "also refuse iPad next while scoringBusy":** already the case in the built `planHostCommand` (`scoringBlocked` goes to `refuse:'scoring'`); now documented rather than added.
- **Critique 2 SF11:** issue #18827 is cited as reported. I haven't reproduced it, and the spike measures it.

**Third critique (2026-09-28), all checked against the code:**
- **B1, B2, B3, S4, S5, S7, S8 and the nits:** accepted, folded into §4-§8 and §12-§14. B3 checked: `handleLockWagers` sets `wagerBusy` then writes `wagerTiersLocked` through the optimistic `updateSlide` (`useShow.js` ~:442), while `planHostCommand` checks `lockPhase` before `scoringBlocked`.
- **S6 (drop the 60s "no iPad socket" rule):** accepted. The phase-1 relay does send the host a `{type:'remotes', count}` message, but only to drive the chip's "no iPad" state; nothing auto-drops on it.
- **B2 walkout grace:** narrowed. Inside `WALKOUT_INVOKE_GRACE_MS` (4s) after a walkout press, `computeNextStep` makes Next a no-op, but the gate still reads `advance` (the cue is computed on render and has no clock). A remote tap in that window is received and does nothing, the same as the keyboard.
- **Nit "raceBusy in scoringBusy":** not approved, as the brief says; `raceBusy` is a separate remote-only busy input with its own cap.

## 17. Stream Deck parity (phase 2)

Source: Ben's Stream Deck profile `FFF3BAC3-…sdProfile`, read-only.

**Page 1 keys:** Next (→) ×2, Back (←) ×2, Answer (A) ×2, Scoreboard (S), Back to Trivia (B), Duck (a BetterTouchTool action), Vol −/+ (macOS default output, ±10), Open PowerPoint / Excel / Chrome, and Ctrl+→ (switch macOS Space).

**Page 2:** 10 Play Audio keys that play local files from `~/Desktop/Trivia Sounds`, `~/Documents` and `~/Downloads`.

**Duplicated keys** (two each of Next, Back and Answer) are there for the left and right hand. The iPad needs one of each, and it already has them (§9).

### 17.1 Where each key lives today (checked in code)

| Key | Handled by | Window |
|---|---|---|
| → ← A S | `planHostCommand` via LiveMode keydown | `/host` (already in phases 1–2) |
| B, Back to Trivia | `Jukebox.jsx` keydown `e.key === 'b'` (~:1300-1354): `handoffFiredRef` guard, then if playing `setLibHandoffPending(true)`, `handleStop()`, wait `EXIT_TOTAL_MS`, then `flushPendingWrite()`, then `onExitToShow()`. `JukeboxBreakOverlay` passes `onExitToShow={onExit}`, which is Display's `onBreakAdvance`, which calls `advanceAfterBreak` (`Display.jsx:609`: +1, or the Final Break jump to winner-reveal, through the anon `advance_show` RPC) | `/display` |
| Space, jukebox play/stop | `Jukebox.jsx` keydown (~:1273-1298): guarded by `modalTrack`, `libHandoffPending` and `liveEnding`; then `handleStop()` or `startShuffle()` | `/display` |
| Space/→, "skip the 10s wait" | `DisplayInner` effect (~:880-892): `setWarp('out')` while `breakEligible && !breakActive && !warp` | `/display` |
| Duck | BetterTouchTool named trigger `duck`, read from BTT's data store (read-only). Step 1: `osascript -e 'output volume of (get volume settings)' > /tmp/preduck_vol`. Last step: `osascript -e "set volume output volume $(cat /tmp/preduck_vol)"`. The steps in between (BTT action 366) weren't decoded, so the ducked level is unknown | macOS, **system output volume** |
| Vol −/+ | Stream Deck built-in, default output ±10 | macOS |
| Soundboard | Stream Deck Play Audio, default output | macOS |

**The architecture gap:** B and the jukebox Space are only in the `/display` window, and the relay only talks to `/host`. Pressing Next on `/host` during a break is *not* the same as B. The overlay's own comment says a host advance mid-break unmounts the jukebox and "player disconnect cuts any early audio". That path also skips the fade-out, `flushPendingWrite()` and `advanceAfterBreak`'s Final Break jump.

### 17.2 Reaching `/display`: pick a relay peer

| Option | Cost | Verdict |
|---|---|---|
| **A. `/display` connects to the relay as a second local peer** (`ws://localhost:8794`, first message `{type:'hello-local', role:'display'}`) | Two small functions pulled out of the two `Jukebox.jsx` handlers, plus a ~40-line hook in Display; the relay adds one role. No schema change. `/display` is a Chrome window on the same laptop (BTT lists the LG TV as an AirPlay display), so it has the same origin and the same LNA permission | **Chosen** |
| B. `/host` sets a show flag that Display reads | A new `shows` column (a migration and a second show-shape change in both implementations, SKILL.md), RT-1 merge care, and Realtime is at-most-once (the TEAM-2 note in Display.jsx), so a press can be lost. It is also the Supabase command queue that was already cut | Rejected |
| C. Relay sends a keystroke with `osascript` System Events "b" | Goes to whatever window has focus (the §2 problem) and needs Accessibility permission for node | Rejected |

**Option A in detail:**
- **Jukebox.jsx.** Lift the two handler bodies into `exitToShow()` and `togglePlay()`, with every existing guard moved inside them. The keydown handlers call these functions, so the keys behave exactly as now. `Jukebox` takes an optional `remoteRef` prop, and `JukeboxBreakOverlay` passes it through; the ref holds `{exitToShow, togglePlay, state}`.
- **Display.jsx.** A `useDisplayLink` hook connects only when not `isPreview`/`isDemo` and `show.is_live`. It sends `{type:'display-state', breakWaiting, jukeboxOpen, playing, handoffPending}` on change. It answers `relay-beat` from `onmessage`, the same way the host does.
- **Display commands:**
  - `jukebox.exit` calls `exitToShow()`. It is refused as `jukebox-not-open` if the overlay isn't mounted.
  - `jukebox.playStop` calls `togglePlay()`.
  - `break.skipWait` calls `setWarp('out')`, under the same three conditions as the key.
- **Relay.** One display socket at a time (4001 on replace). It sends `jukebox.*` and `break.*` to the display socket; everything else still goes to the host. If there is no display socket, it replies `display-offline`, shown as "TV window not linked". The iPad status strip adds a small "TV linked ●/○".
- **Freshness.** `sentAt` and the 1500ms cut apply as for host commands, and the display's beat reply carries `laptopNow`, so it uses the same clock.

**Jukebox mode on the iPad** applies while host state `slide.type === 'grading-break'`:
- **Before the warp:** a big "Open jukebox now" (`break.skipWait`).
- **Once `jukeboxOpen`:** a big **Back to Trivia** (`jukebox.exit`, one tap, like B), Play/Stop (`jukebox.playStop`, lit when `playing`), Duck, and Vol −/+.
- **Host Next is hidden** behind "Skip the break (no fade)", which needs a confirming second tap. This keeps the iPad from making the cut described in 17.1.
- Everything greys while `handoffPending`.

### 17.3 Volume and Duck: both are relay-local macOS, not jukebox gain

- **Duck must match today's behaviour, which is system output volume.** The jukebox has its own gain (`useSpotifyPlayer.js` `setVolume` ~:743, which calls `player.setVolume`), but Ben's Duck doesn't use it (checked: no "duck" anywhere in `client/src/jukebox`). A jukebox-only duck would be new behaviour, so it's left as an open question.
- **`vol.up` / `vol.down`.** The relay reads `output volume of (get volume settings)` and sets it to ±10, clamped to 0–100.
- **`duck` (toggle).** First press: save the current volume to memory **and** `~/.config/trivia-relay/duck.json`, then set it to `duckLevel`. Second press: restore and delete the file. After a restart, the relay reloads `duck.json`, so a restore is never lost.
- **Duck level (decided by Ben, 2026-09-28):** ducked volume = 20% of the pre-duck volume (pre 60 gives 12), and the second press restores exactly the saved pre-duck volume. Store the ratio as `duckRatio: 0.2` in the relay config. Ben has not used Duck in a live show yet (his words), so treat it as unproven: it ships behind the phase-2 rehearsal like everything else.
- The host snapshot doesn't carry these values. The relay sends `{type:'local-state', volume, ducked}` itself.

### 17.4 Soundboard

- **Config:** `~/.config/trivia-relay/sounds.json` is `[{id, label, path}]`, with absolute paths to the 10 Stream Deck files. The relay checks on start that each file exists, and marks missing ones as `missing`.
- **The iPad only ever sends `{cmd:'sound.play', id}`.** The relay looks up the id and runs `execFile('/usr/bin/afplay', [path])`: no shell, no path from the iPad, and unknown ids are refused. Output is the default device, the same as the Stream Deck.
- **`sound.stopAll`** kills the `afplay` children the relay is tracking. A new play doesn't stop older ones, which matches Stream Deck overlap. The iPad gets the list (`{id,label,missing}`) on hello and shows it as a Sounds drawer: a grid of 64pt buttons plus a red Stop all.

### 17.5 Not ported

- **App launchers (PowerPoint / Excel / Chrome) and Ctrl+→ Space switch:** these arrange the laptop itself, and a remote can't show what they did. Leave them on the Stream Deck unless Ben says he uses them mid-show (open question).

### 17.6 Security: the relay now runs local commands

- **Fixed commands only.** Every local command is a set `execFile` call (`osascript` with a script built in the relay from a clamped number, or `afplay` with an allowlisted path). There is no shell and no argument text from the iPad.
- **Secret required.** All of them go through the paired-secret socket (§4). The host and display listeners never accept `vol.*`, `duck` or `sound.*`: the relay routes these only from remote sockets.
- **Logging.** Each one is logged (time, command, id) to `~/Library/Logs/trivia-relay/out.log`.
- **Rate limit.** More than 10 local commands per second from one socket closes it with code 4008.
- **Pause.** "Pause iPad remote" (§7) also blocks these; the relay checks the host's `paused` flag.
- **CLAUDE.md/SKILL.md scoped exception** (§10): add "and plays allowlisted sounds / sets system volume on the laptop" to the relay wording.

### 17.7 Tests

- **Relay (vitest):**
  - Unknown sound id refused.
  - A path in the message is ignored.
  - `execFile` is called with an argument array, checked with a mock.
  - Duck, restart, restore brings back the saved volume.
  - Volume stays within 0–100.
  - `jukebox.*` with no display socket gives `display-offline`.
  - The display role is refused on the remote port.
  - Rate limit gives 4008.
- **Unit:** `exitToShow`/`togglePlay` keep the old key guards (`handoffFiredRef` double-press, `libHandoffPending`, `liveEnding`).
- **Rehearsal:**
  - A full grading break from the iPad only: Open jukebox now, Play/Stop, Duck and restore, Back to Trivia.
  - A last break, to check the Final Break jump to winner-reveal.
  - Each soundboard key, and Stop all.

### 17.8 Open questions

1. ~~What volume should Duck drop to?~~ Answered: 20% of the pre-duck volume, restore to the saved level (see 17.3). Duck has not been used in a live show yet.
2. Should Duck stay system-wide (which also ducks the soundboard and question audio, as today), or become jukebox-only through `setVolume`?
3. Does `set volume output volume` move the volume when the output is AirPlay to the LG TV? Test this in the phase-0 spike.
4. Does Ben use PowerPoint / Excel / Chrome / the Space switch mid-show?
