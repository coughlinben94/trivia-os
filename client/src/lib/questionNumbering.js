// Auto-numbering for question/pixelate-series slides.
//
// questionNumber/questionLabel used to be set once at creation time
// (AddSlideWizard) and then sit there as manually-editable fields — so
// reordering, inserting, or deleting a question left every later slide's
// label stale until someone noticed and hand-corrected it. Recomputing here,
// at every structural change (add/delete/reorder), makes the stored value
// always match the slide's actual position — so consumers (QuestionCounter,
// RoundSidebar, LiveMode, etc.) don't need to change at all.
//
// Counting convention matches what AddSlideWizard always used: question +
// pixelate-series slides share one sequence per round, split into a
// non-bonus track (Q1, Q2, …) and a bonus track (B1, B2, …). Shiny questions
// still occupy a slot in that count (so a regular question after a shiny one
// gets the right number), but their own label is left alone — BuildMode's
// series grouping matches sibling slides by exact questionLabel equality, so
// silently rewriting it would break that.

export function renumberRoundQuestions(slides) {
  const groups = new Map() // `${roundId}::${isBonus}` -> slides, insertion order arbitrary
  for (const s of slides) {
    if (s.type !== 'question' && s.type !== 'pixelate-series') continue
    const key = `${s.roundId}::${!!s.data?.isBonus}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(s)
  }

  const patches = new Map() // slide id -> { questionNumber, questionLabel }
  for (const [key, group] of groups) {
    const isBonus = key.endsWith('::true')
    group
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((s, i) => {
        const num = i + 1
        patches.set(s.id, {
          questionNumber: num,
          questionLabel: s.data?.isShiny ? s.data.questionLabel : `${isBonus ? 'B' : 'Q'}${num}`,
        })
      })
  }

  return slides.map(s => {
    const patch = patches.get(s.id)
    if (!patch) return s
    return { ...s, data: { ...s.data, ...patch } }
  })
}
