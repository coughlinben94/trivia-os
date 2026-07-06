// Paste handling for the question-archive entry forms. Two jobs:
//
// 1. Strip Word/Docs paste artifacts a plain <textarea>/<input> doesn't
//    remove on its own — these elements already discard bold/color/font (an
//    HTML paste can't survive a plain-text DOM value), but they keep the
//    literal characters: non-breaking spaces, zero-width characters, and
//    runs of blank lines all come through untouched.
// 2. Split a single pasted "question then answer" block into the two
//    fields it belongs in — Ben's source docs mark the answer with a label
//    (Answer:, A:, an arrow) that loses its bold/color on paste but survives
//    as plain text, or with no label at all if it's just the last line.

const ANSWER_LABEL_RE = /^\s*(answers?|ans\.?)\s*[:\-–—)\.]+\s*/i
const ANSWER_ARROW_RE = /^\s*(→|»|>{1,2})\s*/

export function cleanPastedText(raw, { multiline = false } = {}) {
  let text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')       // non-breaking space variants
    .replace(/[​-‍﻿]/g, '')       // zero-width chars, BOM
  return multiline
    ? text.replace(/[ \t]+(?=\n)/g, '').replace(/\n{3,}/g, '\n\n').trim()
    : text.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim()
}

// Returns { question, answer } if the block confidently splits, else null
// (caller falls back to treating it as question text only — never guess
// wrong and silently mangle a real answer).
export function splitQuestionAnswer(cleanedMultilineText) {
  const lines = cleanedMultilineText.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const labelMatch = line.match(ANSWER_LABEL_RE) || line.match(ANSWER_ARROW_RE)
    if (!labelMatch) continue
    const afterLabel = line.slice(labelMatch[0].length).trim()
    const answerLines = afterLabel ? [afterLabel, ...lines.slice(i + 1)] : lines.slice(i + 1)
    const answer = answerLines.join(' ').replace(/\s+/g, ' ').trim()
    const question = lines.slice(0, i).join('\n').trim()
    if (question && answer) return { question, answer }
  }

  // No label — the common shape is just two lines, question then answer,
  // with the distinguishing formatting having been the answer's own
  // bold/color (invisible to us in plain text).
  const nonEmpty = lines.map(l => l.trim()).filter(Boolean)
  if (nonEmpty.length === 2) return { question: nonEmpty[0], answer: nonEmpty[1] }

  return null
}

// Simple paste-clean for a single field (category, answer-only edits, PYL
// theme names) — inserts the cleaned text at the cursor instead of letting
// the browser's raw paste through.
export function makeCleanPasteHandler(setValue, opts) {
  return (e) => {
    e.preventDefault()
    const raw = e.clipboardData.getData('text/plain')
    const clean = cleanPastedText(raw, opts)
    const el = e.target
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const next = el.value.slice(0, start) + clean + el.value.slice(end)
    setValue(next)
    const pos = start + clean.length
    requestAnimationFrame(() => { try { el.setSelectionRange(pos, pos) } catch {} })
  }
}

// Paste handler for a question textarea that also owns an answer field:
// if the pasted block splits into question+answer, both fields are set
// (full replace — pasting a whole Q+A block means starting fresh). If it
// doesn't confidently split, falls back to a plain clean-insert-at-cursor
// into the question field only, same as makeCleanPasteHandler.
export function makeQuestionPasteHandler(setQuestionValue, setAnswerValue) {
  return (e) => {
    e.preventDefault()
    const raw = e.clipboardData.getData('text/plain')
    const clean = cleanPastedText(raw, { multiline: true })
    const split = splitQuestionAnswer(clean)
    if (split) {
      setQuestionValue(split.question)
      setAnswerValue(split.answer)
      return
    }
    const el = e.target
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const next = el.value.slice(0, start) + clean + el.value.slice(end)
    setQuestionValue(next)
    const pos = start + clean.length
    requestAnimationFrame(() => { try { el.setSelectionRange(pos, pos) } catch {} })
  }
}
