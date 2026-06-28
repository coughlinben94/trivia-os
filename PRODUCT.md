# Product

## Register

product

## Users

Five distinct viewer types with radically different contexts:

- **Bar crowd (/display)**: 10–30 people watching 3 TV screens from 10+ feet in a dimly lit taproom. Passive — they read, react, and enjoy. The ambient backgrounds are the show; questions sit on top. High-saturation colors, large type, legibility at distance.
- **Host (/host, /live)**: Ben, solo operator running the show from a laptop in the same room as the crowd. Fast, high-pressure, zero time to think mid-show. Needs to advance slides and enter scores without taking eyes off the TVs.
- **Players (/join)**: Bar patrons on personal phones (cheap Androids and iPhones) in a dark, loud environment. One-handed, glance-based. Joining, reading the current question, viewing scores.
- **Producer (build mode)**: Ben, pre-event at a desk, assembling the show. Unhurried. Needs clarity and speed, not drama.
- **Secondary display (/scores)**: Not yet built. A dedicated scoreboard for a second TV.

## Product Purpose

Trivia OS is a real-time trivia night platform built for Baynes Apple Valley, a Michigan cider mill and taproom. It replaces PowerPoint + manual scorekeeping with a live-synced production system: the host advances slides on their laptop, scores teams, and three TVs update instantly. The experience should feel like a polished venue production, not a hackathon demo.

## Brand Personality

Festive, theatrical, local. Baynes is a family cider mill with a distinct physical character — warm, seasonal, community-rooted. The product takes cues from that: the 21 themes are like changing the venue's atmosphere, not swapping a stylesheet. Dramatic reveals. Thematic immersion. Ben's personality (casual, funny) woven in.

## Anti-references

- Kahoot / Mentimeter: too schoolroom, too gamified-cute
- Corporate dashboards (Looker, Tableau): antiseptic, no soul
- PowerPoint-projected pub quizzes: visually low-effort
- Generic AI trivia tool: clean beige body, Inter everywhere, rounded cards, hero metrics

## Design Principles

1. **The room is the interface.** /display is the primary output; everything else is a control surface. Host and player UIs should disappear into the task.
2. **Theme drives everything.** 21 named themes transform the entire visual context — not just accent colors. Every design decision must be verified against the full range, not just the default.
3. **Design for the worst-case viewer.** /display must be readable at 10 feet; /join must work at arm's length, one-handed, in low light on a cheap phone. Use those conditions as the design constraint, not ideal conditions.
4. **Pressure-resistant host UX.** The operator is mid-show, talking to a crowd. Primary actions (advance slide, open scores) must be unmistakable at a glance with no cognitive overhead.
5. **Dramatic over functional for the crowd.** Scoreboard reveals, round intros, and Shiny questions are theatrical moments. Lean into drama; do not sand off the edges.

## Accessibility & Inclusion

WCAG AA as the floor. Reduced motion must be respected on all surfaces — particularly critical on /display (ambient animations) and /join (entrance animations). /join must work on cheap Android devices including older/slower hardware. /display WCAG keyboard navigation is N/A (passive TV output), but visual contrast must hold across all 21 themes at 10-foot viewing distance.
