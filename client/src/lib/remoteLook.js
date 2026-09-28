// The /remote look, in one place. Same shape as the Remote Look Lab's "Copy
// settings" JSON: paste a new one over REMOTE_LOOK and /remote follows.
// Remote.jsx sets lookCssVars(REMOTE_LOOK) (plus LOOK_DERIVED) on its root
// and every colour, font, size and radius there reads a --rl-* var.
//
// "Midnight orchard": a forest-tinted night, cream text, Bright Leaf for the
// one button that matters. Contrast (measured with the old fonts, same
// colours): text/night 16.2, nextink/next 7.4, text-75/surface 7.9,
// ink/amber 10.2, text/red 5.8.
//
// Lilita One + Nunito are Ben's pick for this host-tool page only; every
// other page stays on Boogaloo + DM Sans.
//
// public/remote-manifest.json theme_color and background_color must equal
// colors.night (JSON can't import this file; remoteLook.test.js checks it).
export const REMOTE_LOOK = {
  colors: {
    night: '#0a1710', surface: '#13261a', raised: '#1b3324', text: '#f5f0e8',
    next: '#60c000', nextink: '#06200a', amber: '#f2b632', red: '#b8161a',
  },
  type: { display: 'Lilita One', body: 'Nunito' },
  sizes: { nextWordPx: 120, cuePx: 50, buttonHeightPx: 130, cornerRadiusPx: 35 },
}

// Real fallbacks for while the web fonts load (font-display: swap) or if
// Google Fonts is unreachable on the venue network.
const DISPLAY_FALLBACK = "'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif"
const BODY_FALLBACK = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"

export function lookCssVars({ colors: c, type, sizes: s }) {
  return {
    '--rl-night': c.night, '--rl-surface': c.surface, '--rl-raised': c.raised, '--rl-text': c.text,
    '--rl-next': c.next, '--rl-nextink': c.nextink, '--rl-amber': c.amber, '--rl-red': c.red,
    '--rl-display': `"${type.display}", ${DISPLAY_FALLBACK}`,
    '--rl-body': `"${type.body}", ${BODY_FALLBACK}`,
    '--rl-word': `${s.nextWordPx}px`, '--rl-cue': `${s.cuePx}px`,
    '--rl-bh': `${s.buttonHeightPx}px`, '--rl-r': `${s.cornerRadiusPx}px`,
  }
}

// Not part of the look: press shades and faded text, worked out from the
// look's own vars so a colour change carries through.
const mix = (v, pct, other) => `color-mix(in srgb, var(${v}) ${pct}%, ${other})`
export const LOOK_DERIVED = {
  '--rl-next-press': mix('--rl-next', 88, 'black'),
  '--rl-raised-press': mix('--rl-raised', 85, 'var(--rl-text)'),
  '--rl-text-press': mix('--rl-text', 92, 'black'),
  '--rl-red-press': mix('--rl-red', 85, 'black'),
  '--rl-amber-ink': mix('--rl-amber', 10, 'black'),
  '--rl-red-bright': mix('--rl-red', 45, 'white'),
  ...Object.fromEntries([15, 20, 25, 30, 50, 60, 75, 80].map(p => [`--rl-text-${p}`, mix('--rl-text', p, 'transparent')])),
}

const family = name => name.trim().replace(/\s+/g, '+')
export function lookFontsHref({ type }) {
  return `https://fonts.googleapis.com/css2?family=${family(type.display)}&family=${family(type.body)}:wght@400;600;700;800&display=swap`
}
