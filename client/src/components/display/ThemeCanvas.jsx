import { useEffect, useRef } from 'react'

export default function ThemeCanvas({ theme }) {
  const canvasRef = useRef(null)

  // Keep canvas pixel dimensions in sync with its CSS size
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    function sync() {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // Drive the theme background animation via rAF — only when a fn is provided
  useEffect(() => {
    const canvas = canvasRef.current
    const fn = theme?.scene?.background
    if (!canvas || !fn) return

    let raf
    let alive = true
    function tick(timestamp) {
      if (!alive) return
      fn(canvas, timestamp)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [theme?.scene?.background])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
