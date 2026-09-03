// CanvasIframe — renders children inside a real <iframe>, sized to a fixed
// resolution and CSS-scaled as a whole, so vw/vh units inside resolve against
// that fixed resolution instead of the real browser window. Same technique as
// ThemePickerModal.jsx's PreviewFrame, generalized for a resizable host panel
// (scale is a prop, not a fixed constant) and for content that needs live DOM
// measurement from outside (SlideCanvasEditor's detectRegions) — so, unlike
// PreviewFrame, the exposed ref is a real node inside the iframe's document,
// not just a portal target.
//
// Style/font strategy deliberately differs from ThemePickerModal: that file
// hand-duplicates the ~4 Tailwind classes its own tiny preview needs. The
// slide-render tree this wraps (SlideRenderer + 19 slide types + OverlayLayer)
// uses far more Tailwind utility classes than is practical to hand-duplicate
// and keep in sync — instead, every <link rel="stylesheet"> and <style> tag
// already in the host document's <head> is cloned into the iframe's <head> at
// mount. This covers Tailwind (a single hashed stylesheet in production, or
// Vite's injected <style> tags in dev) automatically, with no manual class
// list to maintain.
import { useEffect, useRef, useState, forwardRef } from 'react'
import { createPortal } from 'react-dom'

const GOOGLE_FONTS_HTML = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Boogaloo&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
`

const CanvasIframe = forwardRef(function CanvasIframe(
  { width, height, scale, background, children },
  forwardedRef
) {
  const iframeRef = useRef(null)
  const [frameBody, setFrameBody] = useState(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    doc.open()
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">${GOOGLE_FONTS_HTML}</head><body></body></html>`)
    doc.close()

    // Clone every stylesheet link + injected <style> tag from the host
    // document into the iframe — Tailwind's compiled output either way,
    // without hand-duplicating utility classes.
    document.querySelectorAll('head link[rel="stylesheet"], head style').forEach(node => {
      doc.head.appendChild(node.cloneNode(true))
    })
    // Dev-only quirk: this clone happens once, at mount. In dev, editing a
    // Tailwind class updates the host's injected <style> tag live via Vite
    // HMR, but the iframe's copy was already cloned and doesn't follow —
    // the canvas shows stale styling until the editor remounts (e.g.
    // switching slides). Production is unaffected: a single static <link>,
    // unchanged after page load.

    doc.body.style.margin = '0'
    doc.body.style.padding = '0'
    setFrameBody(doc.body)
  }, [])

  // Expose the wrapper div (not the iframe element itself) as the ref, so
  // callers keep using it exactly like the old plain-div canvasRef.
  function setStageRef(el) {
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) forwardedRef.current = el
  }

  return (
    <>
      <iframe
        ref={iframeRef}
        title="slide-canvas-stage"
        style={{
          position: 'absolute', top: 0, left: 0,
          width, height,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
        }}
      />
      {frameBody && createPortal(
        <div
          ref={setStageRef}
          style={{
            position: 'absolute', top: 0, left: 0,
            width, height,
            overflow: 'hidden',
            containerType: 'size',
            background,
          }}
        >
          {children}
        </div>,
        frameBody
      )}
    </>
  )
})

export default CanvasIframe
