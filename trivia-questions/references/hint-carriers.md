# Hint Carriers — Auditing and Drafting the Second Path

Companion to `question-anatomy.md` §2–3 (hook/wink authoring taxonomy). That file teaches how to WRITE a hook or wink from scratch. This one is about AUDITING a question that already exists: does it need a hint at all, and if so, which carrier is the shortest one that survives verification. Findings below come from two independent minings of the `questions` table (Supabase project `qwtbgusqfoypvehnungr`, 1,883 rows, 1,526 `type='regular'`), Aug 2026.

**The core finding: hints are never labeled.** "as a hint" appears once in 1,883 rows. "if that helps," "as a clue," "for a clue," "bonus point," "by the way" — zero. Flagging the hint destroys it — the bar can't tell it's being helped until after it works.

**The mechanic under every carrier below:** quote the answer's own culture in that culture's own voice, with zero connective tissue. Never explain the bridge. Drop the artifact, let the room build it. The connective tissue IS the length — cutting it is what makes a hint short.

**The em-dash is not this voice.** One occurrence in 1,526 `regular` rows, and it's a test row. Set-off punctuation is the ellipsis (132 questions end in `…`) and the exclamation point. A hint drafted with an `— aside —` construction reads as not-Ben.

## Two Positions, Two Registers

- **Head** (before the question's first real sentence): 138 rows, 32 under 25 characters, 17 under 15. The compressed register — under-used relative to how well it works.
- **Tail** (after the final `?`): 383 rows, 274 of them over 90 characters. The LONG form — six to eight seconds of talking after the question mark, which is where a bar stops listening. This is where over-length hints come from. Tail only earns its place when the payoff needs the answer's shape already in the ear (a joke, an imperative, a catchphrase).

## Carrier Taxonomy — ranked punchiest first

**1. Cold cry** — bare interjection, `!`, head position, no grammatical connection to the question. Fires when the answer's world has a shout everyone knows. Shortest carrier that exists.
`Zoinks!` → Shaggy (1638) · `Cha ching!` → Banksy (598) · `Blast off!` → Cape Canaveral (1175) · `Snap a limb!` → Theater (387) · `Jelly time!` → Lead (202) · `Go Blitzburgh!` → Big Ben (492) · `Masters' week!` → Sheep (206) · `Ow! My Patella!` → Wounded Knee (365) · `Go find your beach!` → Corona (1632)

**2. Name ladder** — two to four one-word famous bearers, each with its own `?`, escalating to `?!?` or `???`. Fires when the answer is a common name or short word with multiple famous holders. Used ~8 times ever — the most generative under-used pattern in the bank.
`Daltrey? Goodell? Bannister???` → Roger (137) · `Big? Kingston? Paul? Coughlin?!?` → Down (512) · `Steve? Andy? Mick?` → Ballroom Blitz (479)

**3. Sequence completion** — a set the bar finishes in their own head. Answer arrives by pattern completion, not inference.
`Alpha, Bravo, Charlie….` → Echo (341) · `Stanley, Phyllis, Jim, Ted…` → Elroy (740)

**4. Sound effect** — onomatopoeia standing alone, either position.
`*FLASH*` → Men in Black (623), 7 chars, shortest real hint in the bank · `PTTTTNNNNNNGGGGG!` → Wild Bill Hickok (188) · `Beep beep boop boop!` → Close Encounters (1231) · `Stayin alive, stayin alive!` → pulsar (69)

**5. Cold-open quote** — unattributed line from the answer's universe, head position, 56 rows. Never say who said it.
`"Ginger ale and pomegranate, hold the vodka".` → Shirley Temple (320) · `"Coming soon"…` → Blockbuster (602) · `"I am serious… and don't call me Shirley".` → Boeing (180) · `"End of the line, sonny Jim".` → Lucy and Linus (432)

**6. Ellipsis lead-in** — short fragment, `…`, question continues off it in lowercase. Grammatically fused, one breath aloud, no "here comes a clue" tell. 31 rows.
`We've all got light and dark inside us… the brightest star in the night sky is named what?` → Sirius (1313) · `I don't like sand… What island, located in between France and Italy…` → Corsica (71) · `Think outside the box… ` → Billie Eilish (1037)

**7. Short imperative tail** — post-`?` second-person command. The imperative mood forces compression: no subject, no "This term also…" throat-clearing.
`Watch out, middle aged men!` → Cougars (216) · `Just don't pull a flick…` → Narnia (1871) · `Stick to baseball, bud, you're no Jerry Garcia…` → Guitar Hero (620) · `Go at sunrise, it'll be way easier to get a table.` → Tokyo (1762)

**8. Catchphrase tail** — carriers 1/5 moved behind the `?`.
`Heidy ho!` → Home Improvement (218) · `Suck on that!` → Janis Ian (423) · `Giddyap, bullseye!` → Spurs (118) · `N O T D E A D.` → Dazed and Confused (500) · `Watson.` → Martin Freeman (1140) · `This is the way.` → Mandolin (201)

**9. `shares its name with`** — 54–67 rows depending on how you count, and the flattest reading in the bank. Works fine load-bearing INSIDE a question stem (see `question-anatomy.md` §1). Appended as a tail (`? This term shares its name with Shakespeare's longest play.` → Hamlet, 1602) it announces itself as a hint and goes limp. The fallback, not the default.

## Anti-Patterns

- **The labeled hint.** "As a hint," "if that helps." One occurrence ever, and it produced the clunkiest tail in the sample.
- **The obituary tail.** Death-date postscripts (`? We unfortunately lost this star in 2023, at the age of 96.` → Tony Bennett, 1841; `? Unfortunately, we lost this icon in the year 2009, at the age of 15.` → Taco Bell, 1064). They land after the answer's locked — neither hint nor entertainment. A tic, not a technique.
- **The restatement tail.** `? With a recognizable riff, the song chronicles a fire above Lake Geneva.` → Smoke on the Water (328). The question already said this.
- **The 90-plus-character tail.** 274 rows. Past ~60 characters it's not a hint, it's an appended paragraph.
- **The em-dash aside.** Zero real occurrences. Foreign body.
- **Same-domain second route.** If the setup is baseball and the hint is baseball, it's not a second route — it rewards the same table twice. The second path must come from a different discipline.
- **Read-aloud forks.** A clue that changes meaning on one misheard syllable. See step 5 of the audit procedure below — this gets its own check, not a glance.

## The Audit Procedure

Default output is DOING NOTHING. An agent asked to add a hint will always add one; the correct output is frequently "this question already has two routes, leave it alone." Treat "no hint needed" as an expected, blessed result, not a failure to find something.

1. **Route census.** Enumerate independent paths to the answer, tag each by knowledge domain (sports / geography / music / news-recall / wordplay / film).
2. **Gate.** Two or more routes spanning two or more domains? Stop. Output "no hint needed." Optionally tighten the existing wink.
3. **Position.** Default to HEAD. Only go to tail when the hint is a joke that needs the answer's shape already in the listener's ear.
4. **Carrier.** Walk the taxonomy top-down, take the first that fits the answer. Under 8 words. Under 25 characters is the target for head carriers.
5. **Mishearing check — the highest-value step in this procedure.** Say the candidate hint AND the full question out loud, over imagined bar noise. Does any word fork into a second defensible answer if misheard? "The only team never to REACH a World Series" is unique to Seattle, but heard as "never WON one" it has four defensible answers. If a carrier forks, cut it or rebuild it — don't ship it and hope. Run this check even on carriers that pass gate 2 with no new hint added, if the existing wink was never checked.
6. **Verify.** Any name-twin, catchphrase, or attributed line must be web-verified before it ships (standing rule, `SKILL.md` Hard Rule 1) — "shares its name with" is the single most hallucination-prone construction in trivia writing, and a wrong hint gets read aloud to a bar.
7. **Difficulty check.** Each route added moves the question a notch easier. Cap at three. Refuse any route whose required knowledge is rarer than the answer itself — a hint nobody can use is dead air.
8. **Output shape.** Propose two or three verified carrier options with the fact attached. Never hand back finished prose as final — this procedure is a critic that hands Ben ammunition, not a ghostwriter.

## Worked Example

Original: *"One of my favorite recent news stories revolves around a raccoon with a rare genetic condition known as Short Spine Syndrome. What MLB team, whose normal mascot is a Moose, embraced Jimothy the raccoon as a guest mascot, as they went on a winning streak after Jimothy was spotted?"* → **Seattle Mariners**

Rejected fix: appending *"This team also holds the distinction of being the only one in the league to have never reached a World Series…"* — same-domain (baseball setup, baseball clue, and the Moose route is already baseball), 17 words of Wikipedia, and fails the mishearing check (forks on reach/won when read aloud).

Accepted fix — name ladder, head position, 25 characters: **`Cobain? Frasier? Griffey?!?`** Three domains (music, TV, baseball), one city, and the non-baseball tables finally get a door.
