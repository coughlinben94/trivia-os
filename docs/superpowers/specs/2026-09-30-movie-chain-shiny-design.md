# Movie Chain Shiny Question Design

## Goal

Add a phone-played shiny question where teams connect a visible starting movie to a visible ending movie through performers who appeared in adjacent movies. The host announces a shortest movie count. A valid chain at that count earns 15 points; one movie longer earns 10; any longer or invalid chain earns 0.

## Rules

- A chain alternates movie, performer, movie, ending with performer, then the fixed destination movie. The number of movies includes both endpoints. A direct shared performer is a two-movie chain.
- Eligible connections are credited film cast and voice performers. Crew and TV credits do not count. Movie and person identity uses Wikidata QIDs, never a typed name alone.
- A team cannot repeat a movie or performer in its chain. The UI allows at most the announced count plus one movie. A valid chain shorter than the announced count earns 15; the host sees that the announced minimum was beaten.
- Movie A, Movie B, the announced count, and the growing chain remain visible on phones. The TV shows both endpoints, the count, and the number of teams submitted.
- The host controls the usual submission countdown and lock. Team Lock In saves one complete chain to `phone_answers`; the team can revise it before host lock, following the app's existing phone-answer pattern. The submitted chain is restored after a phone reload.

## Guided play

1. The phone offers searchable credited performers from the current movie.
2. After a performer is selected, the team types a middle movie into a global movie search. The app checks that film credits the selected performer. A valid selection extends the chain; an invalid one leaves it unchanged. The search never lists a performer's filmography.
3. If the searched movie is the fixed destination, the app gives the same neutral instruction to use Finish for every performer; it does not check that final connection.
4. The team may remove the latest pair and choose another. To finish, it selects a performer from the current movie and taps Lock In. The app appends the fixed destination movie visually but does not validate that last edge or display a correctness hint.
5. Earlier connections are guided and checked as the team builds, but scoring verifies the full submitted chain again at reveal. An altered or malformed `phone_answers` row cannot earn points.

## Data source and reliability

Use Wikidata's CC0 structured data as the source: film cast (`P161`) and voice actor (`P725`). A Vercel API route mediates entity search and credit checks, uses bounded requests and short caching, and returns years with same-name movie suggestions. It never supplies a list of movies for a selected performer. The guided UI treats a search for the ending movie neutrally, without checking that last connection. The UI uses no third-party poster or profile images.

Wikidata's cast can be incomplete. The host editor checks that each endpoint resolves to a film and shows the number of available cast entries. The host may correct a disputed result after reveal with an explicit per-team score override; this updates both the scoreboard and the team's verdict. If Wikidata is unavailable, search shows a retry state and keeps the unsaved chain; reveal remains pending with a retry action and does not assign speculative points. A team can independently look up film credits outside Trivia OS; this is a live trivia honor rule, not a security promise.

## Host authoring and reveal

The format is named **Movie Chain** in Add Shiny. The blank slide is configured in the right rail with Movie A, Movie B, and an integer announced count of at least 2. The host can open a phone preview. Incomplete configuration blocks the host lock/advance with a useful message.

Host lock saves the cutoff timestamp and closes new submissions but does not calculate or publish results. On the host's A reveal, the app reads submissions at or before the cutoff, checks every connection against film credits, computes each result, and publishes verdicts and the reveal flag together. Scoreboard updates follow the revealed verdicts through the existing idempotent per-slide score bucket. A failed lookup keeps the reveal pending and can be retried. Before reveal, neither per-team verdicts nor score changes are readable on public show surfaces.

Each phone then shows its last performer, whether it appears in Movie B, its movie count, and points. The TV shows the connection, a valid team chain if one exists, and totals in the 15/10/0 groups. The host sees every team result and can correct a disputed credit. Multiple routes are scored by their actual credits; no authored answer string is used as an answer key.

## Verification

Unit tests cover chain shape, repeated QIDs, end-movie neutrality, movie counting, scoring tiers including shorter-than-announced, malformed submissions, missing credits, and idempotent score updates. UI tests cover host setup, phone chain building and reload, lock and reveal timing, and no premature final-edge feedback. A local build and the full unit suite must pass before completion; the relay suites need network permission to bind localhost in this sandbox.

## Sources

- [Wikidata structured data licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)
- [Wikidata cast-member property](https://www.wikidata.org/wiki/Property:P161)
- [Wikidata voice-actor property](https://www.wikidata.org/wiki/Property:P725)
