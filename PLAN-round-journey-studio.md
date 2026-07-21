# Round Journey Studio — overnight plan (for morning review)

Scope: how we design round journeys going forward, what Adobe's connector actually buys us, and how a journey actually gets from prototype into the live Friday-night app. Written for the fall season push — read top to bottom, nothing here is committed yet.

---

## 1. What the Adobe connector actually is (important — changes the plan)

Checked account: signed in (`auth`), full tool set unlocked.

**The hard fact:** the Adobe connector only runs inside a Claude surface — claude.ai, Claude Desktop, or Cowork. There is no public API version of it. It cannot be embedded in a standalone webapp you host on Vercel; Adobe hasn't exposed these specific tools outside Claude's own client. So "build a webapp that uses Adobe's tools directly" isn't actually on the table — any Adobe work has to happen in a Claude session, same as tonight.

**What it covers (~50 tools, real account = full access):** image edit/adjust/crop/vectorize/background-removal (Photoshop/Lightroom-tier), font pairing via Adobe Fonts, Express template search + fill + animate + export, mood-board creation, video resize/quick-cut, InDesign/PDF document tools, Adobe Stock search+license.

**What it does *not* do:** no text-to-image or AI generative fill (the one exception is `image_generative_expand`, canvas outpainting only) — so it can't invent artwork from a prompt, only edit/adjust/vectorize what already exists. It's also genuinely Express-tier, not real Photoshop/Premiere — independent reviews (May 2026) clock basic ops like a reframe at minutes, not seconds, and note it's better suited to batch asset work than fast interactive editing. Don't expect it to out-perform you doing it by hand for a single one-off image.

**What it's actually good for on this project:** turning a rough or found image into clean SVG geometry (`image_vectorize` — the single most useful tool here, gives Claude real vector paths to animate instead of drawing primitives from scratch), texture (`image_add_grain`, `image_apply_halftone` — cheap, effective "pub poster" texture for the taproom's flat-vector-explainer style), and separately, real production value for **event flyers and social posts** via Express templates (unrelated to journeys, but a genuine side win — see §5).

Your subscription question from last night: whatever you land on tomorrow, sign into the connector with the same Adobe account so tools stay unlocked and continuous across sessions — the guest tier caps you at ~40 tools and no saved history.

---

## 2. Where journeys actually live in the app today (you asked — this is the load-bearing section)

Traced the real code, not guessing:

- **`client/src/components/display/SlideRenderer.jsx`** is the router. It holds `SLIDE_COMPONENTS` (a plain object mapping a slide-type string like `'winner-reveal'` to its component) and `TRANSITIONS` (the 10 named enter/exit animations — `dissolve`, `zoom`, `punch`, etc.) plus `SLIDE_ANIMATIONS` for per-type content-entrance timing. This is the single place that has to know a new slide type exists.
- **`client/src/components/display/slides/`** is where each slide type's component lives as its own file — `WinnerRevealSlide.jsx` and `TeamPickerSlide.jsx` are the existing precedent for "big theatrical canvas/rAF moment," `RoundIntroSlide.jsx` is the slide currently shown at a round boundary.
- **`ParticleBackground.jsx`** is the separate, always-mounted ambient layer (never remounts, GPU-only) — journeys are explicitly *not* built here, per `references/round-journeys.md`.
- Slides are data-driven: each slide is a row with a `type` and a `data` object (`slide?.data?.transition` is how a slide requests one of the 10 named transitions today). A round journey becomes either (a) a variant of `round-intro` triggered by a flag/theme pair in its `data`, or (b) a new slide type of its own (e.g. `'round-journey'`) inserted into the sequence — that's a real decision to make once we have 2–3 shipped journeys and can see the pattern, not before.

**So: is it "drop in a file and go"? No — three things have to happen, in order, every time:**
1. New component file in `slides/` (this is the part that's basically drop-in — canvas/rAF code, same shape as `TeamPickerSlide.jsx`).
2. Import + registration in `SlideRenderer.jsx`'s `SLIDE_COMPONENTS` map (one line), plus a `SLIDE_ANIMATIONS` entry only if it needs custom content-entrance timing beyond the defaults.
3. Surfaced in whatever builds the actual show sequence (the host build/live-control surface — not yet traced tonight, worth confirming tomorrow) so a real round can be told "this boundary uses the meteor journey."

None of that is hard, but it's not zero-config either — every shipped journey touches the router file, and every one needs a real-device check on an actual venue TV before it's trusted on a live Friday (per the round-journeys doc's near-black-banding and motion-smoothing notes — things that don't show up in a laptop preview).

**Fall-season risk to flag now:** right now there's exactly one round-journey pattern documented and zero shipped. If the plan is "several themed journeys ready before the season ramps up," the bottleneck isn't Adobe or tooling — it's this three-step wiring loop times however many journeys we want, each one needing your eyes-check per the skill's own process. Worth deciding this week how many journeys is realistic before the first fall show, so we're not designing forty and shipping two.

---

## 3. The actual design loop (unchanged, confirmed against `references/round-journeys.md`)

This stays exactly as documented — nothing about Adobe changes the method:

1. Pick the theme fresh, each time.
2. Reuse what the theme already owns (`ParticleBackground.jsx` artwork, `TeamPickerSlide.jsx`'s warp engine) before inventing a new mechanism.
3. **New tonight:** if the motif needs a clean vector asset (an icon, a silhouette, a themed shape), route it through Adobe's `image_vectorize` first — feed it real Baynes/theme source art, get back SVG paths Claude can actually animate, instead of Claude drawing a generic shape from scratch. This is the one place Adobe genuinely earns its slot in the pipeline — treat it as an asset step, not a "creative direction" step. (Fable's note, and I agree: skip mood-boarding as a formal phase — the 21 themes already define palette/mood, and the real direction of a journey is the written beat, e.g. "meteor cracks the windshield, gets patched with a bandaid." That's writing, not boarding. Also: skip Adobe's font tools entirely — Boogaloo + DM Sans are locked by brand rule already.)
4. Prototype as standalone HTML in `concepts/` — real theme colors, Replay button, working reduced-motion toggle, notes block, self-gate block. No exceptions.
5. You watch it move, it's wrong in a specific way, we fix that thing, replay, ask again.
6. Only after you approve does it become a real `slides/` component wired into `SlideRenderer.jsx`.

**Craft additions worth adopting** (from tonight's creative-director pass, on top of the existing motion-technique checklist): bake one tileable grain texture and overlay it on every journey — flat gradients read as AI-slop, grain reads as crafted. A 2–3 frame smear on fast moves. Camera shake that decays rather than cuts off. A held tableau beat before the next round slides in — the hold is what makes it feel cinematic rather than just fast. Letterbox bars during the journey as a "this is a movie moment" signal. And design everything for a bright bar TV at 20 feet — bold silhouettes, consistent chunky stroke weight, no fine detail that vanishes from across the room.

---

## 4. Where this "lives" — webapp or stay in Claude

You said you'd prefer a webpage app so it's not taking up space here. Given §1's hard constraint (Adobe tools can't leave a Claude session) and Fable's gut-check, here's the honest shape:

- **The design loop itself (steps 1–6 above) has to keep happening inside Claude/Cowork** — that's not optional, it's where both the round-journeys skill and the Adobe tools actually run.
- **What *can* live outside Claude, and should:** a lightweight review surface for the prototypes that already exist. Not a Supabase-backed app with auth and comment threads — you're the only reviewer, that's process theater for an audience of one. Concretely: a single static `index.html` at the trivia-os repo root (or in `concepts/`) that iframes every prototype in `concepts/`, gives you Replay + side-by-side compare, and reads a small `manifest.json` (`{ file, theme, status: draft|approved|shipped }`) so state travels with the repo instead of living in a separate database that can drift from it. Zero deploy step needed beyond what already exists — it's just a file you open, or it rides along on the next `git push` if you want it on the live Vercel URL too.
- This keeps prototypes, their approval status, and the design doc itself in one place, which is the actual failure mode worth avoiding (a gallery app and the repo silently disagreeing about what's approved).

If, after using it a few weeks, the single-file gallery feels cramped, upgrading it to something with real state is a cheap follow-on — starting there avoids building infrastructure before we know it's needed.

---

## 5. Other tooling worth knowing about

- **Already installed, already relevant, nothing to add:** `impeccable`, `frontend-design`, `canvas-design`, `web-artifacts-builder`, `theme-factory`, and the quiver `design-tokens`/`ui-typography`/`composition-patterns` skills all apply directly to this work and need no new install.
- **Figma and Canva connectors exist in your plugin set but aren't authorized yet** (pending OAuth). Canva's worth a look specifically for templated social posts (faster than Express for that one job); Figma only matters if you ever want a formal handoff spec for a journey's static keyframes, which is unlikely to be worth the overhead here. Low priority — mention only because you asked "anything else."
- **Adobe Express's real win for the business** isn't journeys — it's event flyers and taproom social posts (`search_design` → `fill_text`/`animate_design` → export), which is a genuinely fast path now that the connector's signed in. Separate task from journeys, but same connector, worth doing in the same breath when you're building a themed show (flyer + journey, one session).

---

## 6. What I'd do first, concretely

1. Confirm tomorrow which Adobe plan you actually land on (Express Premium individual is $9.99/mo per current pricing — if you were quoted $20, worth double-checking what tier that maps to before assuming it unlocks anything beyond what's already unlocked tonight as a signed-in account).
2. Pick the first fall-season theme to prototype and just run the existing method end to end once, now with `image_vectorize` in the loop for any asset that needs it — this validates §3 for real rather than in theory.
3. Build the single-file `concepts/` gallery (§4) — under an hour of work, unblocks reviewing multiple prototypes without me re-describing them in chat every time.
4. Once 2–3 journeys are approved and shipped, revisit whether `round-intro` variants or a dedicated `round-journey` slide type is the right home in `SlideRenderer.jsx` — real examples will make that call obvious; guessing now would be premature.

Ready to start on a theme whenever you are.

---

## 7. Addendum — closing the "the art looks AI-crude" gap (added after live tool-shopping session)

Ben's standing complaint tonight: he doesn't trust my freehand SVG/vector drawing for these motifs — the shapes read as LLM-crude, not designed. Went looking for something to specifically fix that (not for more automation, not for a full "AI makes the journey" pipeline — those were correctly ruled out earlier tonight as solving the wrong problem for a hand-choreographed narrative beat).

**Found it: Recraft V4.** It's the only major AI image model with genuinely *native* vector output — real SVG with structured paths and layers, not a raster image traced afterward (which is what Adobe's `image_vectorize` does, and why that path was always going to be second-best). Two features make it fit this specific job:

- **Style lock** — upload 3-5 reference images/icons, lock the style, every subsequent generation in that session matches it. Means a whole theme's cast of motifs (ship, meteor, bandaid, whatever a given journey needs) can be generated in one coherent visual language instead of looking like disconnected AI outputs stitched together.
- **It has an official Claude/Cowork MCP connector** (`mcp.recraft.ai`, OAuth-based) — this is the important part. Unlike Firefly/Nano Banana, which requires manually generating in a separate web app and re-uploading, Recraft can be installed as a connector and called **directly in our Claude/Cowork sessions**, same as the Adobe connector. No app-hop, no manual handoff step. This is the piece that was missing from tonight's earlier "the loop isn't really closed" conclusion — with Recraft, the generate step moves inside the same session as the vectorize/build step.

**The right division of labor (per a second creative pass tonight, and I agree):** Recraft generates static *layered* SVG states — e.g. ship intact / windshield cracked / bandaid applied — as separate, named, addressable groups within the style-locked set. I don't ask it to animate anything. I own turning those states into motion (Framer Motion / canvas, per the existing method) — which is structural editing of markup I'm handed, a different (and more reliable) skill than freehand-drawing a shape from nothing. The Lottie-export feature Recraft also offers is a distraction for the main narrative beat — it's a real option only for a small independent ambient loop (idle flicker, twinkling stars) that doesn't need to sync to the story timeline, not for the journey itself.

**Cost:** Recraft's paid tiers start at $10/mo (private + commercial rights), $27/mo (Advanced) and $48/mo (Pro) for more credits/priority. Free tier (50 credits/day) may be enough to test this before committing to a paid plan.

**Next step:** install the Recraft connector next session, generate one theme's motif set with style lock, and hand it into the existing prototype loop — this is the concrete test of whether it actually fixes the "looks AI-crude" complaint, not just a promising spec sheet.

---

## 8. Second addendum — real research pass, corrections to §7 above

Ben (rightly) called out that §7 was written too fast off vendor pages. Sent two research agents to dig for independent, non-vendor signal before trusting any of this further. Honest results, including where I was wrong above:

**What's confirmed real, not marketing:** the Recraft MCP connector genuinely exists — verified via Recraft's own official GitHub org (`recraft-ai/mcp-recraft-server`) and docs describing a real remote server (`mcp.recraft.ai/mcp`, OAuth 2.0), not just a blog claim. So that part of §7 holds.

**What I got wrong or overstated in §7:**
- **No independent user verification exists yet.** Genuinely searched Reddit, Hacker News, X, design forums — found one dead HN thread (2 points, zero comments) and otherwise nothing but the same genre of SEO content-farm articles that were already flagged as untrustworthy earlier tonight. There is currently no way to verify Recraft's real-world output quality or the MCP connector's real-world reliability from outside Recraft's own claims. That's a genuine blind spot, not a solved question.
- **The "cleanly grouped, animation-ready SVG" claim in §7 is unconfirmed and probably optimistic.** Cross-referencing multiple sources turned up a recurring, more specific caveat: Recraft output is real SVG (paths/fills, not a disguised raster), but generations often collapse into one flat `<g>` rather than semantically separated, named layers — meaning "select just the windshield" is likely **not** a click, it's manual re-grouping work in Illustrator or by hand in the SVG source after generation. Budget for that step; don't assume it away.
- **Free tier is not usable for real production work.** It's public (generations land in Recraft's community gallery — a problem for unreleased show themes) and carries no commercial license. Fine for a first quality test, not for anything that ships.
- **Recraft is reportedly weaker on illustrated scenes than on icons/logos** — exactly the opposite of what our use case needs (a meteor cracking a windshield is a scene, not an icon). This is the single biggest risk to the whole plan and needs a real test before any money or time commitment, not an assumption.

**One genuine new contender surfaced: Magnific (formerly Freepik).** Has an official MCP too (`mcp.magnific.com`), with dedicated `images_generate_svg` / `images_to_svg` tools and a "Soul" custom-style-reference feature — Magnific's answer to style lock. It's the only other tool found that matches Recraft on both counts that matter (native SVG + in-session MCP access, no browser hopping). No independent quality comparison against Recraft exists yet either — genuinely unverified, not "better," just a real second option worth testing side by side rather than committing to Recraft alone.

**Everything else chased down and ruled out:** Kittl (real tool, real community, but zero API/MCP — browser-only, fails the "no hopping" requirement). Illustrator's own native Text to Vector (more capable than the Adobe Claude connector, but desktop-app-only, no MCP path). SVG.io (SEO-farm reviews rank it below Recraft, no independent discussion). Vecteezy (a stock marketplace and raster tracer, not a prompt-driven generator — not actually a competitor in this category).

**Revised next step (replaces the one in §7):** don't commit to Recraft on spec alone. Install both the Recraft and Magnific connectors, run the *same* illustrated-scene prompt (not an icon/logo prompt) through both with style-lock/Soul-reference active, and inspect the raw SVG structure of each output before deciding anything — that test resolves the two open questions (scene quality, real layer structure) that vendor pages can't answer honestly.

---

## 9. Third update — the live test is blocked on billing, plus a new candidate (Reve 2.x)

Both connectors are now installed and authenticated (confirmed tool access to both). The actual test is blocked, though — this needs you, not more research:

- **Recraft**: every call (`get_user`, `generate_image`) returns `400 invalid_billing`. The account authenticated fine but has no valid payment method on file — Recraft's API/MCP access apparently needs that even to pull free-tier credits. Nothing on my end to fix; needs a payment method added at recraft.ai before this connector does anything.
- **Magnific**: explicit error — "Magnific MCP requires a premium account." The connected account is on a free/non-premium Freepik tier; MCP access is gated to paid plans specifically (separate from whatever free-tier web-app access exists). Needs an upgrade at magnific.com/pricing before this one works either.

So the side-by-side test from §8 is teed up and ready to run the moment either of those is unblocked — no new research needed there, just billing.

**While that was blocked, you asked me to look into Reve 2.x (reve.com)** — genuinely interesting, with one important caveat about source quality. Reve is currently ranked #2 on the independent Text-to-Image Arena leaderboard (behind GPT Image 2, ahead of Nano Banana 2), and its real distinguishing feature — confirmed via a carefully-sourced, named-author review (eesel.ai, citing Reve's own help docs and real quoted X posts) rather than the anonymous content-farm genre — is that it generates images via an internal structured "layout" (every element gets a position, size, and description) before rendering, and can auto-detect layers in its own output afterward for targeted editing. A real quoted user: *"Reve 2.0 is incredible at image editing. It automatically detects layers in images you generate, and then you can specifically prompt to make changes."* That's a genuinely different and possibly better answer to the "can I isolate just the windshield" problem than hoping Recraft's SVG happens to be grouped well.

**The caveat:** a second, less trustworthy source claimed Reve has dedicated "V4 Vector / V4 Pro Vector" modes exporting native structured-layer SVG — but that's literally Recraft's own model-naming language, appearing in a Reve article. That's either a genuine coincidence or (more likely, given tonight's pattern) a content-farm article that scraped/blended Recraft's spec sheet into Reve coverage. Treat any claim that Reve natively exports clean-layered SVG as unverified until seen directly — the *verified* feature is the internal editable layout + post-hoc layer detection on raster output, which is different and not yet confirmed to produce SVG at all.

**Also unresolved:** no evidence found of an official Reve MCP connector (a search for one returned a different, unrelated company — Rev.com/Rev AI, a speech-to-text service — which is worth flagging as its own example of how easy it is to get misled chasing tool names at 1am). If there's no MCP, Reve falls into the same bucket as Firefly/Nano Banana from earlier tonight: real capability, but a manual web-app-and-reupload workflow, not a same-session tool.

**Pricing, for real:** Free tier exists but opts your work into model training by default (a real consideration for unreleased show themes) — Lite at $7.99/mo removes that. Pro at $19.99/mo adds video. API is pay-per-image (~$0.20/image on the good endpoint, ~$0.007 on a cheaper legacy one) if you'd rather not subscribe.

**Where this leaves us:** three live candidates now (Recraft, Magnific, Reve), zero of them actually tested end to end yet — two blocked on your billing, one with no session-native access confirmed. Nothing to decide tonight; next concrete step is still yours: add a payment method to Recraft or upgrade Magnific (whichever you'd rather pay for first), and I'll run the real side-by-side the moment one unblocks.

---

## 10. Fourth update — Recraft billing fixed, real generation run, but hit a real wall verifying structure

Recraft's billing cleared (you have 60 credits). Ran the actual test prompt (meteor cracking a spaceship windshield, flat vector illustration, bold color blocking, dark navy/orange/white) through `generate_image` with the `vector_illustration` style, then through `vectorize_image` for comparison.

**The good news — visual quality is genuinely strong.** Both outputs look like real flat-vector-explainer illustration: clean bold shapes, consistent line weight, a coherent orange/navy/white palette, no muddy AI-crude artifacts. This is the first actual evidence (not a spec sheet) that Recraft can produce something that looks designed rather than AI-generated. Worth showing you directly when you're back — attaching isn't possible mid-session the way I'd like, so I'll pull it up live.

**The bad news — I could not verify the SVG structure question, and that matters.** Both tools returned CDN URLs (`img.recraft.ai`, imgproxy-style) plus a rendered WEBP preview — not raw SVG markup I could inspect. I tried to fetch the actual file to check whether it's real grouped/named `<path>`/`<g>` elements (the thing that determines whether "just the windshield" is selectable) versus a flattened raster or single blob:
- My sandbox's network allowlist blocks `img.recraft.ai` outright (`blocked-by-allowlist` on every attempt) — can't reach it from the shell.
- The general web-fetch tool returned empty content on that same URL — consistent with it being a binary asset (raster or otherwise) rather than inspectable SVG text, but I can't confirm which from here.

So the honest status is: **generation quality = confirmed good. Animation-readiness of the actual file structure = still unverified, blocked by my own tooling, not by Recraft.** This is exactly the open question §8 flagged and it's still open.

**What would actually resolve it:** you (or I, walking you through it) opening the Recraft web dashboard directly in a browser, generating or pulling up this same result, and downloading the real `.svg` file to open in a text editor or Illustrator — that bypasses my sandbox's network restriction entirely and gives a direct look at whether the paths are meaningfully grouped. That's the concrete next step, and it's a 2-minute check once you're back, not more research.

---

## 11. Final answer on the vector-gap question — tested with real files, not spec sheets

Ben pulled both actual `.svg` files down himself and handed them over. Inspected the raw markup directly. This resolves §8-10's open question for real:

**Both files — the raster-trace one and the native `vector_illustration` generation — have identical structure: a flat list of anonymous sibling `<path>` elements, zero `<g>` grouping, zero id/class naming, every path carrying a no-op `transform="translate(0,0)"`.** The native-generation file even carries Recraft's own cryptographic signature in its metadata, confirming it's genuinely their real vector output, not a fallback trace. So this isn't a fluke of one tool or one prompt — it's how Recraft's SVG export actually works. A "windshield" isn't a layer; it's however many disconnected color-region paths happened to compose that part of the image, indistinguishable in the markup from the paths making up the ship hull or the background stars.

**What this means for the plan:** the division of labor proposed in §7/§8 — "Recraft generates layered states, I animate them" — doesn't hold up under an actual file. There is no layer to select. Isolating "just the windshield" from this output requires the same amount of manual path-identification and regrouping work as if the shapes had been hand-drawn from scratch. Recraft genuinely earns its keep on one thing only: the art itself looks designed, not AI-crude (confirmed visually) — that complaint from the start of tonight is real and solved. It does not solve "give me animation-ready structure," which was the second half of what we were hoping for.

**Revised, honest recommendation:** use Recraft (or Magnific, once its billing is sorted — worth the same file-level check before trusting it either) for what it's actually proven to do well: a polished *static* reference image or background layer for a theme — the overall look, the color story, the establishing shot. For the specific elements that need to move independently within a journey (the crack lines, the meteor, the bandaid), keep hand-authoring those as simple, clean, purpose-built shapes the way the existing method already does — informed by Recraft's output as a visual reference for style/color, not built from its file. That's a smaller, more honest use of the tool than originally hoped, but it's one backed by an actual file inspection instead of a vendor claim.

---

## 12. Fifth update — asked to second-guess §11, and it was too conservative. Plus: the Reve vector claim is debunked.

Ben pushed back and asked me to re-check both the Recraft conclusion and go deep on Reve directly rather than through secondary sources. Both changed the picture.

**Recraft's paid tiers don't fix the grouping problem.** Checked `subscription_plans` directly: Free (30 credits/day), Basic (1000/mo), Pro 2K/4K/8K/16K (same credits tiers, differing only in max output *resolution*). Nothing in the plan structure ties to SVG structure/grouping — paying more buys higher resolution and more volume, not better-organized files. So upgrading Ben's account wouldn't have changed §11's finding.

**Fable's third pass (specifically asked to be contrarian, not confirm me) found the actual miss, and it's a real one:** §11's conclusion was too conservative because it assumed the fix has to be *regrouping one busy scene* after the fact. Grounded against our own architecture (`SlideRenderer.jsx` — journeys are canvas/rAF components, not DOM-SVG animations, per §2), the better move is **generating each moving element as its own separate, style-locked Recraft call** — one call for "the meteor," one for "the ship," one for "the bandaid" — each arriving pre-separated with its background removable, ready to be drawn and transformed as an independent canvas sprite. No regrouping needed at all, because each file already *is* one thing. This dissolves the problem instead of working around it. Also worth noting, and it undercuts how big a deal §11 made of this: mechanically clustering the ~30 anonymous paths in one busy scene by bounding-box + fill color into logical groups is a scriptable few-minute pass, not the manual Illustrator slog assumed earlier — the "flat paths" finding is real, but its cost was overstated.

One genuine scope correction from that same pass, worth keeping: split what gets generated by *type of motion*, not by which tool made it. Anything that moves as a rigid whole (the meteor flying in, the ship, the bandaid) — generate as a sprite, animate with simple transforms. Anything procedural (the crack actually spreading outward, particle bursts) needs to be hand-built regardless of source, because that's motion no static generated image can express — this was always true and isn't a Recraft limitation specifically.

**Reve's vector-SVG claim — checked Reve's own site directly this time, not a secondary blog. It's false.** Reve's actual marketing page (reve.com) is detailed and specific about what Reve 2.1 does: raster image generation (native 4K/16MP) built on an internal "images as code" layout representation — a structured, editable intermediate description used for composition, positioning, and non-destructive iterative editing. Nowhere on Reve's own page — a page that goes deep on its technical philosophy — is vector or SVG output mentioned once. That confirms §8/§9's suspicion: the "Reve has native SVG vector modes" claim from a secondary blog was contamination from Recraft's own model-naming language, not a real Reve feature. Reve is a (very good, by all accounts) raster model with an unusually well-structured internal representation for editing — not a vector generator, and not a competitor to Recraft on the specific question this whole thread has been chasing.

**Where Reve *is* genuinely useful here:** as a high-quality raster source for the same per-element sprite workflow above, or for a theme's establishing/background image, given its real strengths (4K resolution, precise composition control, strong text rendering if a journey ever needs in-scene text). Feed a Reve-generated raster into Recraft's `vectorize_image` (or Adobe's) the same as any other source image if a vector version is wanted — knowing going in that the vectorized result will have the same flat-path structure as everything else tested tonight, per §11.

**Revised next step:** test the per-element sprite approach for real — one style-locked Recraft call each for 2-3 elements of the meteor/windshield scene (not one full-scene call), with background removal, and see whether style-lock actually holds visual coherence across separate calls the way it's supposed to. That's the test that resolves whether this reframe holds up, same as §11 resolved the single-scene question with a real file instead of a claim.

---

## 13. Sixth update — Reve tested for real (Ben ran it himself), vector question closed, video is a genuine new option

Ben ran the same "meteor cracks windshield" prompt through Reve directly (app.reve.com) and sent the raw output zip. Real files, not claims — same standard as §11.

**Vector question, fully closed with evidence:** the zip contains one PNG (4864×3328, raster) and one MP4 (1280×720, 6s, H.264). No SVG anywhere. Matches reve.com's own claims exactly — confirms §12's debunk directly rather than by inference.

**The still image — best pure visual result of the night, but a different style register.** Genuinely excellent painted/illustrative composition. Worth flagging plainly: it's linework-and-shading illustration, not the flat-vector-explainer style (`round-journeys.md`'s bold color-blocking, minimal shading, generous rounding) the show's world is actually built on. Gorgeous, but a real style decision needs to be made deliberately if this direction is wanted — not adopted by default because one output looked great.

**The video is a genuine new find, not previously on the table.** Extracted frames across the 6 seconds show real staged causality — meteor arrives, glass shatters further, meteor punches through, cockpit consoles flip to red alert — closer to actual storyboarded motion than anything from Runway/Pika/ElevenLabs earlier tonight (§ the tool-shopping stretch). Doesn't land the original bandaid-patch resolution beat, but as a pure "impact" moment it's legitimately strong.

**Real caveats, not dismissed:** it's one opaque raster clip — no frame-level control, can't isolate or re-time individual pieces the way a sprite-based canvas approach allows. Embedding actual video into the live show is a different technical integration than the canvas/CSS approach used everywhere else in the app — looping, file size, compositing over the always-on ambient layer, and reduced-motion fallback all get harder, same caveat already flagged for Runway earlier tonight. Best framed as a possible literal background plate for one beat (the impact moment specifically), not a replacement for hand-choreographing the full journey.

**Where this leaves the toolkit, updated:** Recraft — real vector paths, no semantic grouping, best for per-element sprites generated separately (test still pending, see §12). Reve — no vector at all, but genuinely strong raster stills and a video capability worth keeping in the toolkit for a specific beat rather than the whole sequence. Magnific — still untested, blocked on billing.

---

## 14. Seventh update — §12's per-element sprite test run for real. Mixed result: one tool broken, one new problem found.

Ran the actual test §12 called for: separate style-locked Recraft calls for meteor, ship, and bandaid (not one full-scene call), then `remove_background` on each.

**Style-lock itself is currently broken — could not test the real mechanism.** `create_style` (feeding the generated meteor image back in as a reference) failed three times in a row with `500 Internal Server Error`, across both default (`recraftv4_1`) and `recraftv3` models. This is a server-side fault, not a bad input — so the actual style-lock feature §7/§12 have been counting on to hold visual coherence across separate calls is currently unusable from this connector. Worth a retry another day (transient outage vs. a real gap), but don't plan around it working until it's been seen to succeed once.

**Fallback used instead: matched style-prompt text, no real lock.** Ran all three generations (`vector_illustration` style) with the same hand-written palette/shape-language description appended to each prompt, rather than a shared style ID. Palette coherence held up well this way — all three landed on the same orange/navy/white color story with a consistent flat-color-block rendering approach. That's a real, if weaker, signal that the *visual language* is reproducible without the broken lock feature, at least for a small palette like this one.

**New problem, not previously flagged: shape legibility failed on 2 of 3 elements.** The meteor generation is a clean, readable rounded abstract shape. The ship and bandaid are not — both came back as ambiguous abstract blob compositions that don't read as their subject at a glance (the "ship" is an unrecognizable stack of orange/navy rounded bars; the "bandaid" is an orange pinwheel/X shape with no legible strip-and-pad structure). This is a direct, concrete violation of `round-journeys.md`'s own **silhouette-first legibility** rule ("a shape should read clearly by its outline alone, before color or detail") — measured against the app's own written standard, not a subjective taste call. Recraft's flat-vector *rendering* is genuinely convincing (per §10); its *object comprehension* for a specific concrete noun in one-shot text-to-image is not reliable at this style setting. This would need per-element prompt iteration (multiple regenerations, tighter prompting) to fix — real time cost per asset, eroding the "fast per-element sprite" premise §12 was testing.

**Background removal:** ran clean on all three (one transient `500` on the bandaid, succeeded on retry — consistent with general API flakiness tonight, not a systemic block). **Could not verify alpha-channel correctness**, though — same CDN-fetch restriction as §10 (`img.recraft.ai` blocked by this sandbox's network allowlist; the general web-fetch tool returns empty on the same binary URL). This matters more here than in §10: these designs use bright white as an *interior* highlight color (speed-streak lines inside the meteor/ship, cut-lines inside the bandaid), not just as page background — a real risk that background removal keyed all near-white pixels indiscriminately and punched holes in the artwork itself, not just around it. Unresolved from this session; needs the same 2-minute manual check §10/§11 already used once (download the actual PNG, open it against a checkered/dark background, confirm the interior whites are still opaque).

**Honest verdict on §12's reframe:** doesn't clear the bar yet, for two separate reasons — one a tool outage (style-lock 500s, plausibly fixable by retrying later) and one a real finding (single-call text-to-image struggles with legible object silhouettes for a specific concrete subject like "ship" or "bandaid" at this style setting, independent of the lock question). Recommend not spending further Recraft credits chasing this specific line until either style-lock comes back online for a real test, or accepting that per-element sprites need iterative prompting/regeneration per asset rather than a single confident call each — which is a slower workflow than §12 hoped for.

**What's still true and worth keeping:** the finding from §10/§11 stands — Recraft's flat-vector *rendering quality* (color blocking, line weight, no AI-crude artifacting) is real and good. The open question is narrower now: not "does it look designed" (yes) but "can it draw a specific recognizable object, isolated cleanly, reliably, in one shot" (not yet demonstrated).

**Immediate follow-up, same session: the legibility problem was a technique error, not a model ceiling.** Pulled Recraft's own prompt-engineering docs (`recraft.ai/blog/prompt-engineering-guide`) — two things tonight's first pass got wrong: prompts over ~40 words lose model focus (mine were closer to 60-70, padded with style-language repetition), and `vector_illustration` is the wrong style parameter for a single isolated object — it's tuned for scenes/logos. Recraft ships a dedicated `icon` style (recraftv2 only) specifically for this job.

Reran all three — meteor, ship, bandaid — as short (<25 word) `flat-design icon of a [noun], bold navy and orange color blocking, thick outline, simple silhouette, centered on white` prompts, `input_style: icon`, `model: recraftv2`. **All three came back instantly legible on the first try** — the ship reads as a rocket immediately, the bandaid is an unmistakable classic cross-bandaid shape, the meteor has a clean tail-and-glow silhouette. Palette held consistent across all three (navy/orange/white) without any style-lock mechanism at all — just repeating the same color-language phrase per prompt, same as the original fallback, but now paired with a style setting built for this exact job. This reverses §14's "not yet demonstrated" verdict for the *specific-object legibility* question: it's demonstrated, using `icon` style + short prompts, not `vector_illustration` + long descriptive ones.

**Revised recommendation:** for round-journey moving elements (rigid-body sprites — the ship/meteor/bandaid class, not procedural effects like spreading cracks), use `generate_image` with `input_style: icon`, `model: recraftv2`, short noun-first prompts with an explicit shared color-language phrase repeated verbatim across every element in a set. Style-lock (`create_style`) is still worth retrying once its 500s clear, since a real locked style is more robust than repeated-phrase matching at scale — but it's no longer a blocker for shipping a first journey. Background-removal alpha-on-interior-whites is still the one open unknown from earlier in §14, unresolved by this test — that's the next thing worth Ben's own 2-minute check before these assets go into a real canvas sprite. Both live tools now have real evidence behind them instead of vendor claims; only Magnific is still an open question.

---

## 14. Seventh update — per-element sprite test run for real, Magnific dropped

Ben decided against Magnific entirely (doesn't want to deal with it) — it's out of the toolkit going forward, no further work needed there. Ran the actual per-element sprite test from §12/§13's "revised next step" instead.

**Style-lock (`create_style`) failed both attempts — real platform error, not a fluke.** Got a `500 Internal Server Error` twice in a row trying to lock a style from the meteor sprite as reference. This is a genuine current limitation of the Recraft MCP tool, worth knowing before planning around style-lock as a reliable feature — it may be a temporary outage or a real gap in this MCP's implementation of that endpoint. Didn't chase further tonight; flagging as unverified/broken rather than assuming it'll work next time.

**Fell back to consistent prompt language instead of true style-lock — and it held up well.** Generated three separate, isolated sprites (meteor with fire trail, cracked windshield frame, a bandage) using matching palette/style wording in each prompt rather than a locked style ID. Results: genuinely coherent as a set — same navy/orange palette, same line weight, same rounded-shape language across all three, generated as completely separate calls. One miss along the way worth noting honestly: the first bandaid attempt ("cartoon adhesive bandaid patch") came back as an unrecognizable abstract shape — a real prompt-adherence failure, not a style problem. A more literal, specific prompt ("rectangular medical bandage strip with rounded corners and a padded gauze center") fixed it on retry. Lesson: specific/literal prompts outperform casual/cartoon-adjacent phrasing on this model.

**Real remaining gap, not yet solved:** all three sprites came back with a flat white background fill, not real alpha transparency — "isolated on plain white background" in the prompt gives a white rectangle, not a punched-out sprite. `remove_background` (available in this same Recraft toolset) hasn't been run yet on any of them — that's the concrete next step before these are actually drop-in canvas assets, not a finished result yet.

**Working verdict:** the per-element sprite approach works as a concept even without style-lock — prompt discipline alone gets a coherent set. Next session should run `remove_background` on all three, confirm real transparency, and only then treat this as validated end to end.

**Confirmed same session: `remove_background` did not produce real transparency.** Ran it on all three sprites, then Ben checked the actual downloaded file in Preview.app (which renders alpha as a checkerboard, unlike a browser tab — the correct verification method, same rigor as the SVG file checks earlier). Preview showed solid white, not a checkerboard. Real, confirmed negative result, not a guess.

**Likely real cause, worth testing before concluding the feature is simply broken:** the generation prompts explicitly said "isolated on plain white background" — which may have told the model to literally draw a white background shape rather than leave the canvas empty. Since these are vector generations, the underlying SVG plausibly contains an actual white background path/rect (same as the full-scene SVG in §11 had a background fill as its first path) — meaning `remove_background`'s raster-level matting may be fighting a background that's structurally part of the vector art, not a separable photo backdrop it's designed to matte out. Untested fix: regenerate without any "on white background" instruction in the prompt at all (letting the model default to whatever empty-canvas behavior it has for an isolated object), then inspect the raw SVG the same way §11 did, checking specifically for the presence or absence of a full-canvas background path. That test is queued for next session, not yet run.

---

## 15. Eighth update — real fix found for object legibility (cross-session confirmed)

A parallel Cowork session Ben had running independently ("Round journey studio tooling investigation") hit the same legibility problem this session did — §14's sprite test came back with a clean meteor but unreadable blobs for the ship and bandaid — and traced it to a real, fixable cause instead of a model limitation.

**The bug: wrong style parameter, not a capability gap.** We used `vector_illustration`, which Recraft's own docs describe as tuned for full scenes/logos. There's a separate `icon` style (recraftv2 only) built specifically for single-object legibility, and a documented rule that prompts over ~40 words lose focus. That session reran meteor/ship/bandaid with short (<25 word), noun-first prompts under `icon` style and got all three instantly recognizable on the first try — no style-lock needed, same color phrase repeated per prompt held the palette fine on its own.

**Confirmed independently in this session too**, not just taken on faith: `generate_image` with prompt `"bandaid, navy and orange, flat icon"`, `input_style: icon`, `model: recraftv2` produced an unmistakable, clean crossed-bandage icon on the first try — the exact object that failed twice under `vector_illustration`. Same platform, same account, same night — the fix reproduces.

**Bonus corroboration:** that other session hit the identical `create_style` 500 error independently — good confirmation it's a real, reproducible platform outage right now, not specific to this account or a fluke worth re-testing yet.

**Updated, real recommendation for per-element sprites:** use `input_style: icon` + `model: recraftv2` + short noun-first prompts (repeat the same color-phrase across calls for palette consistency, skip style-lock until it stops erroring) — not `vector_illustration` with longer descriptive prompts, which is what §14 got wrong. This is now a validated technique, confirmed twice independently, not a hopeful theory.

**Full sprite set regenerated and confirmed with the fix — all three clean:** meteor with fire trail, cracked windshield, and the bandaid all came back instantly legible on the first try, same navy/orange palette held across all three independent calls, zero style-lock. §14's "2 of 3 unreadable" result is fully superseded — the `icon` + `recraftv2` + short-prompt recipe is the validated approach going forward for any per-element sprite generation.

**The transparency question is closed too, resolved better than expected.** Ben generated the same meteor prompt directly in Recraft Studio (the web app, not the MCP) and sent the raw `.svg`. Real file inspected directly: it has **no background rect at all** — just three colored paths on an inherently transparent canvas. That means the right move is pulling the actual `.svg` from Studio directly, not routing a PNG through `remove_background` — SVG has no background to begin with unless one gets explicitly drawn, so this sidesteps the whole alpha-matting problem for free. `remove_background`'s realiability is now a moot question for this workflow.

**Structure note, consistent with every other file inspected tonight:** still three flat, ungrouped sibling paths internally — no separate "flame" layer vs "rock" layer. Doesn't matter for the sprite-per-element plan specifically, since each generated sprite (the whole meteor, the whole bandaid) is meant to move as one rigid unit anyway per §12's reframe — there's nothing that needed sub-selecting in the first place for this use case.

**Recraft sprite pipeline, final validated recipe:** `input_style: icon`, `model: recraftv2`, short (<25 word) noun-first prompts with a repeated color phrase for palette consistency, exported as `.svg` directly from Recraft Studio (or pulled via the MCP's `generate_image` the same way) rather than routed through raster `remove_background`. This is now a fully tested, evidence-backed pipeline — not a plan, a working recipe.
