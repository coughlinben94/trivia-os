// Parses a pasted Word/Docs outline (round content, PYL boards, Appendix
// lists — anything built as a nested bulleted list) into a title plus one
// or more "groups", each holding an ordered [{text, answer}] item list.
//
// Bullet GLYPHS are not trusted (❖ ➢ ▪ •) — Word's symbol-font bullets
// frequently arrive mangled or substituted after a plain-text paste.
// Nesting is read from INDENTATION instead: each line's leading whitespace
// (a tab counts as one level, every 2 leading spaces counts as one level)
// gives its depth. Any leading non-word bullet glyph is stripped from the
// line's content before it's used.
//
// The hard problem this solves: the SAME "one header line, then several
// deeper lines" shape means two different things in Ben's docs —
//   - a PYL category ("State nicknames") where the deeper lines are the
//     6 answers to save AS A GROUP under that category, vs.
//   - an appendix ("Appendix A") where the deeper lines are 27 independent
//     leaf items that should stay together as ONE archive entry, not 27
//     separate categories.
// The distinguishing signal isn't the header text, it's whether the
// header-depth lines mostly HAVE children (→ they're category headers,
// multiple groups) or mostly DON'T (→ they're leaf items themselves, one
// group). See groupDepthLines() below.

import { cleanPastedText } from './cleanPaste.js'

const INLINE_SPLIT_RE = /\s[–—-]\s/
// "Redemption" is a section LABEL in Ben's list-format appendices, not a
// real entry — the actual list item is whatever's underneath it. Any
// header matching this (with exactly one child) gets dropped, promoting
// its child to be the item directly, same shape as every other row.
const REDEMPTION_RE = /^redempt/i

function lineDepth(rawLine) {
  const leading = rawLine.match(/^[ \t]*/)[0]
  const tabs = (leading.match(/\t/g) || []).length
  const spaces = leading.replace(/\t/g, '').length
  return tabs + Math.floor(spaces / 2)
}

function stripBullet(line) {
  return line.replace(/^[ \t]*/, '').replace(/^[^\w"'“]+/, '').trim()
}

// Pairs a run of same-depth "header" lines with whatever deeper lines
// immediately follow each one:
//   0 following deeper lines  → the header line is itself the item (split
//                               on an inline dash if present, e.g. a lone
//                               "Virginia – the old dominion" line with no
//                               separate answer line under it)
//   1 following deeper line   → {text: header, answer: thatLine} — a clue
//                               with its own answer right underneath
//   2+ following deeper lines → the header was a shared prompt, not an
//                               item — expand each deeper line into its
//                               own item (dash-split if present)
function pairRuns(lines, depths, baseDepth) {
  const items = []
  let i = 0
  while (i < lines.length) {
    if (depths[i] !== baseDepth) { i++; continue }
    const header = stripBullet(lines[i])
    i++
    const children = []
    while (i < lines.length && depths[i] > baseDepth) { children.push(stripBullet(lines[i])); i++ }

    if (children.length === 0) {
      const m = header.match(INLINE_SPLIT_RE)
      items.push(m ? { text: header.slice(0, m.index).trim(), answer: header.slice(m.index + m[0].length).trim() } : { text: header, answer: '' })
    } else if (children.length === 1) {
      items.push(REDEMPTION_RE.test(header) ? { text: children[0], answer: '' } : { text: header, answer: children[0] })
    } else {
      for (const child of children) {
        const m = child.match(INLINE_SPLIT_RE)
        items.push(m ? { text: child.slice(0, m.index).trim(), answer: child.slice(m.index + m[0].length).trim() } : { text: '', answer: child })
      }
    }
  }
  return items.filter(it => it.text || it.answer)
}

export function parseOutlinePaste(rawText) {
  const cleaned = cleanPastedText(rawText, { multiline: true })
  const rawLines = cleaned.split('\n').filter(l => l.trim())
  if (rawLines.length === 0) return { title: null, groups: [] }

  let lines = rawLines
  let depths = lines.map(lineDepth)
  let title = null

  const minDepth = Math.min(...depths)
  const atMin = depths.filter(d => d === minDepth).length
  if (atMin === 1 && lines.length > 1) {
    title = stripBullet(lines[0])
    lines = lines.slice(1)
    depths = lines.map(lineDepth)
  }

  if (lines.length === 0) return { title, groups: [] }

  const groupDepth = Math.min(...depths)
  const headerIdx = depths.reduce((acc, d, i) => (d === groupDepth ? [...acc, i] : acc), [])
  const withChildren = headerIdx.filter(i => depths[i + 1] > groupDepth).length
  const mostlyHeaders = headerIdx.length > 0 && withChildren / headerIdx.length >= 0.5

  if (!mostlyHeaders) {
    return { title, groups: [{ title: title ?? 'Untitled', items: pairRuns(lines, depths, groupDepth) }] }
  }

  const groups = []
  let i = 0
  while (i < lines.length) {
    if (depths[i] !== groupDepth) { i++; continue }
    const groupTitle = stripBullet(lines[i])
    i++
    const bodyLines = []
    const bodyDepths = []
    while (i < lines.length && depths[i] > groupDepth) { bodyLines.push(lines[i]); bodyDepths.push(depths[i]); i++ }
    const items = pairRuns(bodyLines, bodyDepths, Math.min(...bodyDepths))
    if (items.length) groups.push({ title: groupTitle, items })
  }
  return { title, groups }
}
