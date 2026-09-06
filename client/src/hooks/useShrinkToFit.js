import { useState, useLayoutEffect } from 'react'

// Scale factor (never above 1) that makes contentRef's natural, unscaled
// height fit inside outerRef's real rendered height. Same measure-in-a-
// layout-effect + ResizeObserver shape as lib/autoFitText.js's useFitToBox,
// but for a whole layout block via transform: scale rather than a font size.
//
// Both boxes are observed: outerRef changes on viewport resize / orientation
// flip / a sibling row appearing under it; contentRef changes when the
// content itself does (option count, wager phase flip). transform: scale
// never changes an element's layout size, so setting k can't retrigger the
// observer on contentRef — no feedback loop.
//
// No floor on purpose (2026-09-06, Ben: "i dont ever want it scrollable",
// "scripted to shrink") — a tap target under 44px beats a Lock In button
// below the fold. Math.min(1, …) alone is the whole rule.
//
// When outerRef has no height of its own (a plain block context, e.g.
// SlideEditor's phone preview) the measurement is skipped and k stays 1.
//
// Also caps `avail` at window.visualViewport.height, not just
// outerRef.clientHeight (2026-09-06 audit) — the one screen in this tree
// with a real <input> (Join.jsx's registration name field) sits inside a
// hard height:100dvh + overflow:hidden box with no scroll escape hatch.
// `dvh` is SUPPOSED to track the on-screen keyboard, but real iOS Safari
// versions are inconsistent about updating it the instant the keyboard
// opens — if outerRef's layout height doesn't shrink, a plain
// ResizeObserver-only recompute would reproduce the exact same stale
// number. visualViewport.height reflects the true visible area regardless
// of whether dvh cooperated, so taking the min of the two is correct either
// way: a no-op when dvh already updated (they already agree), the actual
// fix when it didn't. Listened on its own resize event too, since a
// keyboard open/close doesn't necessarily fire a ResizeObserver at all.
export function useShrinkToFit(outerRef, contentRef, enabled = true) {
  const [k, setK] = useState(1)
  useLayoutEffect(() => {
    if (!enabled) return
    const outer = outerRef.current
    const content = contentRef.current
    if (!outer || !content) return
    const recompute = () => {
      const vvh = window.visualViewport?.height
      const avail = vvh != null ? Math.min(outer.clientHeight, vvh) : outer.clientHeight
      const natural = content.offsetHeight
      if (!avail || !natural) return
      setK(Math.min(1, avail / natural))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(outer)
    ro.observe(content)
    window.visualViewport?.addEventListener('resize', recompute)
    return () => {
      ro.disconnect()
      window.visualViewport?.removeEventListener('resize', recompute)
    }
  }, [outerRef, contentRef, enabled])
  return k
}
