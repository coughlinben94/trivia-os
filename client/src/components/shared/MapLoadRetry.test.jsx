// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const retry = vi.fn()
vi.mock('../../hooks/useUsMapData.js', () => ({ retryUsMapData: (...a) => retry(...a) }))
const { default: MapLoadRetry } = await import('./MapLoadRetry.jsx')

let host, root
beforeEach(() => { vi.useFakeTimers(); retry.mockReset(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

describe('MapLoadRetry', () => {
  it('shows nothing until 4s with no data, then a retry button that re-requests', () => {
    act(() => root.render(<MapLoadRetry states={null} />))
    act(() => { vi.advanceTimersByTime(3900) })
    expect(host.querySelector('button')).toBeNull()
    act(() => { vi.advanceTimersByTime(200) })
    const b = host.querySelector('button')
    expect(b.textContent).toContain('Tap to retry')
    act(() => b.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(host.querySelector('button')).toBeNull()
  })
  it('never appears once the data is there', () => {
    act(() => root.render(<MapLoadRetry states={[{ id: 'MN' }]} />))
    act(() => { vi.advanceTimersByTime(10000) })
    expect(host.querySelector('button')).toBeNull()
  })
  it('retry={false} (TV): plain "Map unavailable" text, no button', () => {
    act(() => root.render(<MapLoadRetry states={null} retry={false} />))
    act(() => { vi.advanceTimersByTime(4100) })
    expect(host.querySelector('button')).toBeNull()
    expect(host.textContent).toContain('Map unavailable')
  })
})
