/* ═══════════════════════════════════════════════════════════════════════
   WORLD 03 — CONTENT · world-03-content.js · 2026-07-30

   THE CONTRACT
   Assigns one global, window.WORLD03_CONTENT, loaded by a plain <script>
   tag BEFORE the page's own script. Plain ES5 only: no modules, no
   imports, no template literals, no trailing commas.

   ★ THE 22-WORD RULE — DO NOT REINTRODUCE PARAGRAPH QUESTIONS ★
   World 02 shipped 40–60-word paragraph questions. At display type in a
   60%-of-stage-width box they rendered seven lines and overflowed the
   safe area by 23% of stage height. The client rejected them. So:
     · Every question text is 22 words MAXIMUM (most 12–18).
     · One sentence; a second only if very short.
     · No leading quotation, no preamble clause, no trailing ellipsis.
     · Must render in 3 lines or fewer on the TV.
   Each question carries `words`, its computed whitespace-split word
   count (em dashes treated as separators). If you edit a question,
   recount and update `words` — consumers may assert on it.

   .questions  — 12 objects { round, number, category, text, answer,
                 words }. `q` mirrors `text` for the world-02 consumer
                 contract (normalizeQ reads `q`).

   .palettes   — all 21 real Trivia OS themes. Hex tokens read straight
                 from client/src/themes/index.js (bg ← colors.bg,
                 deep ← colors.bgDeep, accent ← colors.accent,
                 hl ← colors.highlight, text ← colors.text).
                 Per palette, three corner-hue field colours hA/hB/hC as
                 rgba() strings derived from that theme's own accent and
                 highlight. The world-03 sky is THREE DRIFTING CORNER HUE
                 FIELDS — not a vertical gradient ramp. hA = accent
                 field, hB = highlight field, hC = accent/highlight
                 blend field.

   .rotations  — curated 4–5 palette sequences reading as one night's
                 colour arc.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── QUESTIONS — Baynes flavour, compressed hard. ≤22 words each. ── */
  var QUESTIONS = [
    {
      round: 1,
      number: 1,
      category: 'Music',
      text: 'Gordon Lightfoot sang about the Edmund Fitzgerald. Which Great Lake took her down in November 1975?',
      answer: 'Lake Superior',
      words: 16
    },
    {
      round: 1,
      number: 2,
      category: 'Film',
      text: 'What 1995 Pixar film — the first fully computer-animated feature — stars a jealous pull-string cowboy?',
      answer: 'Toy Story',
      words: 14
    },
    {
      round: 1,
      number: 3,
      category: 'Food',
      text: 'A stale batch of wheat made which Michigan city the Kelloggs’ Cereal City?',
      answer: 'Battle Creek',
      words: 13
    },
    {
      round: 1,
      number: 4,
      category: 'Sport',
      text: 'Blame the royals: which race got stretched to 26 miles, 385 yards at the 1908 London Olympics?',
      answer: 'The marathon',
      words: 17
    },
    {
      round: 1,
      number: 5,
      category: 'Science',
      text: 'Talk about a long Monday — on which planet does a day outlast its year?',
      answer: 'Venus',
      words: 14
    },
    {
      round: 1,
      number: 6,
      category: 'History',
      text: 'Britain’s shortest war lasted about 40 minutes in 1896 — on which island, Freddie Mercury’s future birthplace?',
      answer: 'Zanzibar',
      words: 16
    },
    {
      round: 2,
      number: 1,
      category: 'Music',
      text: 'Who was the first woman inducted into the Rock and Roll Hall of Fame, in 1987?',
      answer: 'Aretha Franklin',
      words: 16
    },
    {
      round: 2,
      number: 2,
      category: 'Geography',
      text: 'Grab a map: from which American city do you drive south into Canada?',
      answer: 'Detroit',
      words: 13
    },
    {
      round: 2,
      number: 3,
      category: 'Television',
      text: 'Since 1989, what yellow family has outlasted every other scripted primetime show in America?',
      answer: 'The Simpsons',
      words: 14
    },
    {
      round: 2,
      number: 4,
      category: 'Sport',
      text: 'Lord Stanley paid about fifty bucks for what trophy, now the oldest in North American pro sports?',
      answer: 'The Stanley Cup',
      words: 17
    },
    {
      round: 2,
      number: 5,
      category: 'Science',
      text: 'What sweetener have archaeologists found still edible in ancient Egyptian tombs?',
      answer: 'Honey',
      words: 11
    },
    {
      round: 2,
      number: 6,
      category: 'Michigan',
      text: 'Which state touches four of the five Great Lakes? You’re sitting in it.',
      answer: 'Michigan',
      words: 13
    }
  ];

  /* give the consumer its `q` field without typing every string twice */
  for (var i = 0; i < QUESTIONS.length; i++) {
    QUESTIONS[i].q = QUESTIONS[i].text;
  }

  /* ── corner-hue helpers — derive rgba() fields from theme hexes ──── */
  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }
  function mixRgba(hexA, hexB, t, a) {
    var p = hexToRgb(hexA);
    var q = hexToRgb(hexB);
    var r = Math.round(p.r + (q.r - p.r) * t);
    var g = Math.round(p.g + (q.g - p.g) * t);
    var b = Math.round(p.b + (q.b - p.b) * t);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ── PALETTES — all 21 Trivia OS themes ────────────────────────────
     Hex values read from client/src/themes/index.js. hA/hB/hC are the
     three drifting corner hue fields: hA = accent (strong), hB =
     highlight (bright, kept faint), hC = accent↔highlight midpoint. */
  var RAW = [
    { id: 'pure-michigan', name: 'Pure Michigan', bg: '#020d12', deep: '#010810', accent: '#1a6b4a', hl: '#4dffc3', text: '#e8f5f0' },
    { id: 'midnight-galaxy', name: 'Midnight Galaxy', bg: '#08001a', deep: '#040010', accent: '#4a1a8f', hl: '#c060ff', text: '#e8d0ff' },
    { id: 'autumn-harvest', name: 'Autumn Harvest', bg: '#1a0800', deep: '#0e0400', accent: '#7a2808', hl: '#ff6820', text: '#f8d8b0' },
    { id: 'northern-lights', name: 'Northern Lights', bg: '#020c18', deep: '#010810', accent: '#0d5040', hl: '#40ffcc', text: '#c0f0e8' },
    { id: 'medieval-tavern', name: 'Medieval Tavern', bg: '#0e0800', deep: '#080400', accent: '#5a2a08', hl: '#e08020', text: '#f0d8a0' },
    { id: 'sunset-boulevard', name: 'Sunset Boulevard', bg: '#100818', deep: '#080410', accent: '#c2521e', hl: '#ff9a4d', text: '#fbe8d6' },
    { id: 'retro-arcade', name: 'Retro Arcade', bg: '#040010', deep: '#020008', accent: '#3a0880', hl: '#a020ff', text: '#e0c0ff' },
    { id: 'sand-dune-chill', name: 'Sand Dune Chill', bg: '#0a0d14', deep: '#06080f', accent: '#6e84b6', hl: '#f7cda0', text: '#e9edf7' },
    { id: 'halloween', name: 'Halloween', bg: '#060008', deep: '#030005', accent: '#380858', hl: '#a000ff', text: '#e0c0f8' },
    { id: 'jazz-club', name: 'Jazz Club', bg: '#080608', deep: '#040404', accent: '#4a2808', hl: '#d4820c', text: '#f0d890' },
    { id: 'dive-bar', name: 'Dive Bar', bg: '#100008', deep: '#080005', accent: '#600818', hl: '#ff2040', text: '#f8d0d8' },
    { id: 'sonora-balloons', name: 'Sonora Balloons', bg: '#2a1238', deep: '#180a28', accent: '#e06a28', hl: '#ffb84d', text: '#ffeeda' },
    { id: 'christmas-eve', name: 'Christmas Eve', bg: '#030204', deep: '#020103', accent: '#3a0810', hl: '#ff4040', text: '#f8f0f0' },
    { id: 'drive-in-movie', name: 'Drive-In Movie', bg: '#080410', deep: '#040208', accent: '#280848', hl: '#e0a000', text: '#f8f0d0' },
    { id: 'western-showdown', name: 'Western Showdown', bg: '#100800', deep: '#080400', accent: '#602000', hl: '#e06010', text: '#f8e0b0' },
    { id: 'under-the-sea', name: 'Under the Sea', bg: '#000c18', deep: '#000810', accent: '#003848', hl: '#00d8c0', text: '#b0f0f0' },
    { id: 'neon-tokyo', name: 'Neon Tokyo', bg: '#040008', deep: '#020005', accent: '#380048', hl: '#ff00c0', text: '#f8d0ff' },
    { id: 'firefly-summer', name: 'Firefly Summer', bg: '#040e04', deep: '#020a02', accent: '#1a3808', hl: '#d4a020', text: '#e8f0c0' },
    { id: 'wine-cellar', name: 'Wine Cellar', bg: '#0c0006', deep: '#080004', accent: '#480018', hl: '#c02040', text: '#f0d0d8' },
    { id: 'meteor-shower', name: 'Meteor Shower', bg: '#020408', deep: '#010306', accent: '#101828', hl: '#e0f0ff', text: '#f0f8ff' },
    { id: 'eighties-night', name: '80s Night', bg: '#080010', deep: '#040008', accent: '#300858', hl: '#ff1090', text: '#f8d0ff' }
  ];

  var PALETTES = [];
  for (var p = 0; p < RAW.length; p++) {
    var t = RAW[p];
    PALETTES.push({
      id: t.id,
      name: t.name,
      tokens: { bg: t.bg, deep: t.deep, accent: t.accent, hl: t.hl, text: t.text },
      hA: rgba(t.accent, 0.55),
      hB: rgba(t.hl, 0.30),
      hC: mixRgba(t.accent, t.hl, 0.5, 0.40)
    });
  }

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

  window.WORLD03_CONTENT = {
    questions: QUESTIONS,
    palettes: PALETTES,
    rotations: ROTATIONS
  };
})();
