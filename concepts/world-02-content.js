/* ═══════════════════════════════════════════════════════════════════════
   WORLD 02 — CONTENT · world-02-content.js · 2026-07-30

   THE CONTRACT
   This file assigns one global, window.WORLD02_CONTENT, and is loaded by
   a plain <script> tag in concepts/world-02-married.html BEFORE that
   page's own script. If this file is absent the page falls back to its
   built-in question set. Plain ES5 only: no modules, no imports, no
   template literals, no trailing commas.

   .questions  — array of question objects. The consumer's normalizeQ()
                 needs at least 8 entries and reads `q` (or `question`)
                 from each; it takes the first 8 and word-animates the
                 text onto the stage. Extra fields (round, number,
                 category, text, answer) are for the real show pipeline
                 and future consumers; `q` mirrors `text` so both
                 contracts hold.

   .palettes   — all 21 real Trivia OS themes, hex values pulled straight
                 from client/src/themes/index.js (not retyped from
                 memory). Each entry:
                   tokens { bg, deep, accent, hl, text } — maps 1:1 to
                     the stage's CSS custom-property set --t-bg /
                     --t-deep / --t-accent / --t-hl / --t-text
                     (bg ← colors.bg, deep ← colors.bgDeep,
                      accent ← colors.accent, hl ← colors.highlight,
                      text ← colors.text).
                   sky — a 14-stop vertical linear-gradient string in the
                     Sonora structure (ParticleBackground.jsx §13): dark
                     top (deep halved → deep → bg), a climb through
                     bg→accent blends, a narrow highlight crest near 71%,
                     then back down through accent/deep blends to deep at
                     100%. A real colour journey top to bottom — never a
                     centred radial blob.

   .rotations  — curated 4–5 palette sequences that read as one night's
                 colour arc. Ben: "each night should have 4-5 diff colors
                 that fade in/rotate in then fade out." Each entry:
                 { id, name, palettes: [palette ids in play order] }.

   THE WORLD RULE
   A new world changes ONLY: its palette + sky ramp (this file) and the
   six per-world art items — palette, far texture, anchor form, drifter
   sprite, occluder silhouette, horizon/light direction. The engine
   (detent, wrap, periods, scheduler) is never touched.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── QUESTIONS — Baynes house style ─────────────────────────────────
     Every factual claim below verified against my confident knowledge;
     none flagged as uncertain. `q` mirrors `text` for the consumer. */
  var QUESTIONS = [
    {
      round: 1,
      number: 1,
      category: 'Music',
      text: '“The lake, it is said, never gives up her dead…” In November 1975 the freighter Edmund Fitzgerald went down with all 29 hands, and Gordon Lightfoot put the wreck on the radio a year later. On which of the five Great Lakes did she sink — the biggest, coldest one, if that helps…',
      answer: 'Lake Superior'
    },
    {
      round: 1,
      number: 2,
      category: 'Film',
      text: 'In 1995, Pixar spent four years and a warehouse of humming computers making an 81-minute movie — the first feature film ever animated entirely by computer. What movie, starring a pull-string cowboy with some serious trust issues?',
      answer: 'Toy Story'
    },
    {
      round: 1,
      number: 3,
      category: 'Food',
      text: 'Snap! Crackle!… nope, wrong box. What Michigan city — the self-crowned Cereal City — did the Kellogg brothers put on the map in the 1890s, when a batch of cooked wheat went stale in exactly the right way? Tony the Tiger still gets his mail there…',
      answer: 'Battle Creek'
    },
    {
      round: 1,
      number: 4,
      category: 'Sport',
      text: 'Blame the royals. At the 1908 London Olympics, one race got stretched so it could start beneath the windows of Windsor Castle and finish right in front of the king’s box — and the awkward distance of 26 miles, 385 yards stuck forever. What race?',
      answer: 'The marathon'
    },
    {
      round: 1,
      number: 5,
      category: 'Science',
      text: 'Talk about a long Monday. On what planet — named for the Roman goddess of love, and sharing its name with a five-time Wimbledon champion — does a single day last longer than its entire year?',
      answer: 'Venus'
    },
    {
      round: 2,
      number: 1,
      category: 'History',
      text: 'The whole thing was over before your pizza got cold. In 1896, Britain fought the shortest war in history — roughly 40 minutes, start to surrender — against a sultanate on an island off East Africa where, fifty years later, a kid named Farrokh Bulsara would be born. You know him as Freddie Mercury. Name the island.',
      answer: 'Zanzibar'
    },
    {
      round: 2,
      number: 2,
      category: 'Music',
      text: 'R-E-S-P-E-C-T. In 1987 the Rock and Roll Hall of Fame let a woman through its doors for the very first time. Who was she — raised in Detroit, and you may address her as the Queen of Soul?',
      answer: 'Aretha Franklin'
    },
    {
      round: 2,
      number: 3,
      category: 'Geography',
      text: 'Grab a map and squint. What Michigan city is the only major American city where you drive SOUTH to cross into Canada? The tunnel drops you off in Windsor…',
      answer: 'Detroit'
    },
    {
      round: 2,
      number: 4,
      category: 'Television',
      text: '“D’oh!” Since December 1989, one yellow family in a town called Springfield — a Springfield deliberately placed in no particular state — has outlasted every other scripted primetime show in American history. What show?',
      answer: 'The Simpsons'
    },
    {
      round: 2,
      number: 5,
      category: 'Sport',
      text: 'In 1892, Lord Stanley of Preston dropped about fifty bucks on a silver punch bowl, and it became the oldest trophy in North American pro sports. The Red Wings have their name engraved on it eleven times. What trophy?',
      answer: 'The Stanley Cup'
    }
  ];

  /* give the consumer its `q` field without typing every string twice */
  for (var i = 0; i < QUESTIONS.length; i++) {
    QUESTIONS[i].q = QUESTIONS[i].text;
  }

  /* ── PALETTES — all 21 Trivia OS themes ─────────────────────────────
     Hex values read from client/src/themes/index.js. Sky ramps are
     14-stop Sonora-structure journeys generated from each theme's own
     deep → bg → accent → highlight, crest at 71%, dark again by 100%. */
  var PALETTES = [
    {
      id: 'pure-michigan',
      name: 'Pure Michigan',
      tokens: { bg: '#020d12', deep: '#010810', accent: '#1a6b4a', hl: '#4dffc3', text: '#e8f5f0' },
      sky: 'linear-gradient(180deg,#010408 0%,#010810 10%,#020d12 22%,#082520 33%,#0e3c2e 43%,#14543c 52%,#1a6b4a 59%,#29976e 64%,#39c493 68%,#4dffc3 71%,#2ea67a 74%,#0e3a2d 80%,#051719 90%,#010810 100%)'
    },
    {
      id: 'midnight-galaxy',
      name: 'Midnight Galaxy',
      tokens: { bg: '#08001a', deep: '#040010', accent: '#4a1a8f', hl: '#c060ff', text: '#e8d0ff' },
      sky: 'linear-gradient(180deg,#020008 0%,#040010 10%,#08001a 22%,#190737 33%,#290d55 43%,#3a1472 52%,#4a1a8f 59%,#6d2fb1 64%,#9144d2 68%,#c060ff 71%,#7936bc 74%,#270d50 80%,#0f0423 90%,#040010 100%)'
    },
    {
      id: 'autumn-harvest',
      name: 'Autumn Harvest',
      tokens: { bg: '#1a0800', deep: '#0e0400', accent: '#7a2808', hl: '#ff6820', text: '#f8d8b0' },
      sky: 'linear-gradient(180deg,#070200 0%,#0e0400 10%,#1a0800 22%,#321002 33%,#4a1804 43%,#622006 52%,#7a2808 59%,#a23b0f 64%,#ca4e16 68%,#ff6820 71%,#af4212 74%,#441604 80%,#1e0901 90%,#0e0400 100%)'
    },
    {
      id: 'northern-lights',
      name: 'Northern Lights',
      tokens: { bg: '#020c18', deep: '#010810', accent: '#0d5040', hl: '#40ffcc', text: '#c0f0e8' },
      sky: 'linear-gradient(180deg,#010408 0%,#010810 10%,#020c18 22%,#051d22 33%,#082e2c 43%,#0a3f36 52%,#0d5040 59%,#1c856a 64%,#2cb994 68%,#40ffcc 71%,#219678 74%,#072c28 80%,#031317 90%,#010810 100%)'
    },
    {
      id: 'medieval-tavern',
      name: 'Medieval Tavern',
      tokens: { bg: '#0e0800', deep: '#080400', accent: '#5a2a08', hl: '#e08020', text: '#f0d8a0' },
      sky: 'linear-gradient(180deg,#040200 0%,#080400 10%,#0e0800 22%,#211102 33%,#341904 43%,#472206 52%,#5a2a08 59%,#82440f 64%,#aa5e16 68%,#e08020 71%,#904c12 74%,#311704 80%,#140a01 90%,#080400 100%)'
    },
    {
      id: 'sunset-boulevard',
      name: 'Sunset Boulevard',
      tokens: { bg: '#100818', deep: '#080410', accent: '#c2521e', hl: '#ff9a4d', text: '#fbe8d6' },
      sky: 'linear-gradient(180deg,#040208 0%,#080410 10%,#100818 22%,#3d1b1a 33%,#692d1b 43%,#96401d 52%,#c2521e 59%,#d4682c 64%,#e77d3a 68%,#ff9a4d 71%,#da6f31 74%,#652b17 80%,#241012 90%,#080410 100%)'
    },
    {
      id: 'retro-arcade',
      name: 'Retro Arcade',
      tokens: { bg: '#040010', deep: '#020008', accent: '#3a0880', hl: '#a020ff', text: '#e0c0ff' },
      sky: 'linear-gradient(180deg,#010004 0%,#020008 10%,#040010 22%,#12022c 33%,#1f0448 43%,#2d0664 52%,#3a0880 59%,#590fa6 64%,#7716cc 68%,#a020ff 71%,#6312b3 74%,#1e0444 80%,#0a011a 90%,#020008 100%)'
    },
    {
      id: 'sand-dune-chill',
      name: 'Sand Dune Chill',
      tokens: { bg: '#0a0d14', deep: '#06080f', accent: '#6e84b6', hl: '#f7cda0', text: '#e9edf7' },
      sky: 'linear-gradient(180deg,#030408 0%,#06080f 10%,#0a0d14 22%,#232b3d 33%,#3c4965 43%,#55668e 52%,#6e84b6 59%,#979aaf 64%,#c0b0a9 68%,#f7cda0 71%,#a5a1ad 74%,#3a4663 80%,#161b28 90%,#06080f 100%)'
    },
    {
      id: 'halloween',
      name: 'Halloween',
      tokens: { bg: '#060008', deep: '#030005', accent: '#380858', hl: '#a000ff', text: '#e0c0f8' },
      sky: 'linear-gradient(180deg,#020003 0%,#030005 10%,#060008 22%,#13021c 33%,#1f0430 43%,#2c0644 52%,#380858 59%,#57068a 64%,#7603bc 68%,#a000ff 71%,#62059b 74%,#1e042f 80%,#0b0111 90%,#030005 100%)'
    },
    {
      id: 'jazz-club',
      name: 'Jazz Club',
      tokens: { bg: '#080608', deep: '#040404', accent: '#4a2808', hl: '#d4820c', text: '#f0d890' },
      sky: 'linear-gradient(180deg,#020202 0%,#040404 10%,#080608 22%,#190f08 33%,#291708 43%,#3a2008 52%,#4a2808 59%,#734309 64%,#9d5e0a 68%,#d4820c 71%,#814c0a 74%,#271606 80%,#0f0905 90%,#040404 100%)'
    },
    {
      id: 'dive-bar',
      name: 'Dive Bar',
      tokens: { bg: '#100008', deep: '#080005', accent: '#600818', hl: '#ff2040', text: '#f8d0d8' },
      sky: 'linear-gradient(180deg,#040003 0%,#080005 10%,#100008 22%,#24020c 33%,#380410 43%,#4c0614 52%,#600818 59%,#900f24 64%,#bf1630 68%,#ff2040 71%,#a01228 74%,#34040f 80%,#150108 90%,#080005 100%)'
    },
    {
      id: 'sonora-balloons',
      name: 'Sonora Balloons',
      tokens: { bg: '#2a1238', deep: '#180a28', accent: '#e06a28', hl: '#ffb84d', text: '#ffeeda' },
      sky: 'linear-gradient(180deg,#0c0514 0%,#180a28 10%,#2a1238 22%,#582834 33%,#853e30 43%,#b3542c 52%,#e06a28 59%,#e98133 64%,#f3993e 68%,#ffb84d 71%,#ec8937 74%,#7c3a28 80%,#361828 90%,#180a28 100%)'
    },
    {
      id: 'christmas-eve',
      name: 'Christmas Eve',
      tokens: { bg: '#030204', deep: '#020103', accent: '#3a0810', hl: '#ff4040', text: '#f8f0f0' },
      sky: 'linear-gradient(180deg,#010102 0%,#020103 10%,#030204 22%,#110407 33%,#1f050a 43%,#2c070d 52%,#3a0810 59%,#75191e 64%,#b02a2d 68%,#ff4040 71%,#891e23 74%,#1e050a 80%,#0a0205 90%,#020103 100%)'
    },
    {
      id: 'drive-in-movie',
      name: 'Drive-In Movie',
      tokens: { bg: '#080410', deep: '#040208', accent: '#280848', hl: '#e0a000', text: '#f8f0d0' },
      sky: 'linear-gradient(180deg,#020104 0%,#040208 10%,#080410 22%,#10051e 33%,#18062c 43%,#20073a 52%,#280848 59%,#5f3632 64%,#96631d 68%,#e0a000 71%,#72452b 74%,#160528 80%,#090312 90%,#040208 100%)'
    },
    {
      id: 'western-showdown',
      name: 'Western Showdown',
      tokens: { bg: '#100800', deep: '#080400', accent: '#602000', hl: '#e06010', text: '#f8e0b0' },
      sky: 'linear-gradient(180deg,#040200 0%,#080400 10%,#100800 22%,#240e00 33%,#381400 43%,#4c1a00 52%,#602000 59%,#863305 64%,#ad460a 68%,#e06010 71%,#933a06 74%,#341200 80%,#150800 90%,#080400 100%)'
    },
    {
      id: 'under-the-sea',
      name: 'Under the Sea',
      tokens: { bg: '#000c18', deep: '#000810', accent: '#003848', hl: '#00d8c0', text: '#b0f0f0' },
      sky: 'linear-gradient(180deg,#000408 0%,#000810 10%,#000c18 22%,#001724 33%,#002230 43%,#002d3c 52%,#003848 59%,#00686c 64%,#009890 68%,#00d8c0 71%,#007878 74%,#00202c 80%,#000f18 90%,#000810 100%)'
    },
    {
      id: 'neon-tokyo',
      name: 'Neon Tokyo',
      tokens: { bg: '#040008', deep: '#020005', accent: '#380048', hl: '#ff00c0', text: '#f8d0ff' },
      sky: 'linear-gradient(180deg,#010003 0%,#020005 10%,#040008 22%,#110018 33%,#1e0028 43%,#2b0038 52%,#380048 59%,#74006c 64%,#af0090 68%,#ff00c0 71%,#880078 74%,#1d0027 80%,#0a000f 90%,#020005 100%)'
    },
    {
      id: 'firefly-summer',
      name: 'Firefly Summer',
      tokens: { bg: '#040e04', deep: '#020a02', accent: '#1a3808', hl: '#d4a020', text: '#e8f0c0' },
      sky: 'linear-gradient(180deg,#010501 0%,#020a02 10%,#040e04 22%,#0a1905 33%,#0f2306 43%,#152e07 52%,#1a3808 59%,#52570f 64%,#8a7616 68%,#d4a020 71%,#646212 74%,#0e2105 80%,#061103 90%,#020a02 100%)'
    },
    {
      id: 'wine-cellar',
      name: 'Wine Cellar',
      tokens: { bg: '#0c0006', deep: '#080004', accent: '#480018', hl: '#c02040', text: '#f0d0d8' },
      sky: 'linear-gradient(180deg,#040002 0%,#080004 10%,#0c0006 22%,#1b000b 33%,#2a000f 43%,#390014 52%,#480018 59%,#6c0a24 64%,#901330 68%,#c02040 71%,#780d28 74%,#28000e 80%,#120007 90%,#080004 100%)'
    },
    {
      id: 'meteor-shower',
      name: 'Meteor Shower',
      tokens: { bg: '#020408', deep: '#010306', accent: '#101828', hl: '#e0f0ff', text: '#f0f8ff' },
      sky: 'linear-gradient(180deg,#010203 0%,#010306 10%,#020408 22%,#060910 33%,#090e18 43%,#0d1320 52%,#101828 59%,#4e5969 64%,#8d9aa9 68%,#e0f0ff 71%,#636e7e 74%,#090e17 80%,#03060b 90%,#010306 100%)'
    },
    {
      id: 'eighties-night',
      name: '80s Night',
      tokens: { bg: '#080010', deep: '#040008', accent: '#300858', hl: '#ff1090', text: '#f8d0ff' },
      sky: 'linear-gradient(180deg,#020004 0%,#040008 10%,#080010 22%,#120222 33%,#1c0434 43%,#260646 52%,#300858 59%,#6e0a69 64%,#ac0d7a 68%,#ff1090 71%,#830b6e 74%,#1a0430 80%,#0b0114 90%,#040008 100%)'
    }
  ];

  /* ── ROTATIONS — a night's colour arc, 4–5 palettes each ──────────── */
  var ROTATIONS = [
    {
      id: 'deep-space',
      name: 'Deep Space',
      palettes: ['midnight-galaxy', 'meteor-shower', 'under-the-sea', 'retro-arcade', 'northern-lights']
    },
    {
      id: 'halloween-night',
      name: 'Halloween Night',
      palettes: ['halloween', 'wine-cellar', 'neon-tokyo', 'dive-bar']
    },
    {
      id: 'autumn-night',
      name: 'Autumn Night',
      palettes: ['autumn-harvest', 'western-showdown', 'sonora-balloons', 'medieval-tavern', 'jazz-club']
    },
    {
      id: 'north-woods-summer',
      name: 'North Woods Summer',
      palettes: ['pure-michigan', 'firefly-summer', 'northern-lights', 'sand-dune-chill']
    },
    {
      id: 'neon-city',
      name: 'Neon City',
      palettes: ['eighties-night', 'neon-tokyo', 'retro-arcade', 'sunset-boulevard', 'drive-in-movie']
    },
    {
      id: 'holiday-hearth',
      name: 'Holiday Hearth',
      palettes: ['christmas-eve', 'wine-cellar', 'midnight-galaxy', 'meteor-shower']
    }
  ];

  window.WORLD02_CONTENT = {
    questions: QUESTIONS,
    palettes: PALETTES,
    rotations: ROTATIONS
  };
})();
