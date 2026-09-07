# fact-hunt-2026-09-04 — in-flight progress

Preflight: yt-dlp OK, agent-reach reddit (OpenCLI backend) OK, throwaway Task dispatch OK. Both platforms live.
Resume check: no round today before this one. Fresh round, 0/30.
FACT-HUNT-BANK.txt: 2622 lines (2025 questions + 597 fact_hunt_entries), built via MCP execute_sql + python extraction (anon-key REST returned empty — RLS blocks anon SELECT on questions/fact_hunt_entries; used MCP execute_sql instead).
Drift check: no top-20 tag orphaned from the 14 wells; coverage looks normal.

## Wave log

wave 1 (track1: Sitcoms/Disney-Pixar-parks/Cool-facts, track2: Comedy films/Nerd canon): returned 18 / intake-bounced 0 / grader-bounced 6 (River Country sayable+debunk, Rabbit-Proof Fence mined vs bank #179, Reptar lawsuit-as-fact, MODOK unverified 1-source, Derelicte unverified 1-source, Swingline unverified 0-usable-source) / accepted 11 (Club 33 scored 2, below ≥3 threshold, also excluded) / edge 0. Flushed and confirmed: select count = 11. Track1 running 9/21, Track2 running 2/9.

wave 2 dispatched: track1 = Music/Sports-as-pop-culture/Cool-facts (quota 4 each), track2 = Michigan/family/Cryptids-haunted-true-crime (quota 3 each). round_counts so far: Sitcoms 4, Disney/Pixar/parks 2, Cool-facts 3, Nerd canon 1, Comedy films 1.

wave 2: all 5 hunters returned, 18 facts (4 Music, 4 Sports, 4 Cool-facts, 3 Michigan/family, 3 Cryptids). Mechanical intake: 18/18 checked · 0 bounced as dupes · 0 skipped. fact_hunt_sources updated. Grader: returned 18 / intake-bounced 0 / grader-bounced 7 (Silverdome mined vs #222, Jonathan unsayable, Kitch-iti-kipi unsayable, Hell MI unverified, Wendigo mined vs #1492, Flying saucer mined vs #803, McDonald's mined vs float-through-McDonald's row) / accepted 9 (Mighty Ducks + Utah Jazz scored 2, below threshold, also excluded) / edge 0. Flushed and confirmed: select count = 20 (11+9). Track1 running 17/21, Track2 running 3/9.

wave 3 dispatched (last wave, per fact-hunt.md 3rd-wave rule — wave 2 accepted 9 ≥5): track1 = Word-origins/Internet-meme, track2 = Myth-folklore-D&D/Brands-toys-retail-drinks/Theme-parks-roadside-Vegas.

wave 3: all 5 hunters returned, 14 facts. Mechanical intake: 14/14 checked · 0 bounced as dupes · 0 skipped. Grader: returned 14 / grader-bounced 4 (Big Brother lawsuit-is-the-fact, POGs mined vs bank #950, Angel's Envy no Shout line §0.8, Betty Willis mined twice over vs bank #1043/#1816/#1179) / accepted 10 / edge 0. Flushed and confirmed.

ROUND CLOSED. Final tally: select count = 30 (11+9+10), exactly the pace-setter. Phase 5: 0 malformed rows (all domain/answer/fact/bridges/≥2 sources/fits/origin present, domain always one of the 14 valid strings). 13 of 14 wells got at least 1 accepted row this round (Cryptids/haunted/true-crime went 0-for-3, all bounced mined). Returned across 3 waves: 18+18+14=50. Accept rate 30/50 = 60%.
