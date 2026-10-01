// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatusSlot, CountLine, useFontsReady } from './shinyParts.jsx'

const theme = { colors: { text: '#fff' }, fonts: { body: 'Lora' } }

describe('shinyParts', () => {
  it('StatusSlot keeps its reserved height and themed text', () => {
    const html = renderToStaticMarkup(<StatusSlot theme={theme}>hi</StatusSlot>)
    expect(html).toContain('min-height:3.4rem')
    expect(html).toContain('color:#fffd9')
    expect(html).toContain("font-family:&#x27;Lora&#x27;, &#x27;DM Sans&#x27;, sans-serif")
    expect(html).toContain('>hi<')
  })
  it('CountLine copy: with and without a team total', () => {
    expect(renderToStaticMarkup(<CountLine n={2} total={5} />)).toContain('2 of 5 teams submitted')
    expect(renderToStaticMarkup(<CountLine n={1} total={0} />)).toContain('1 team submitted')
    expect(renderToStaticMarkup(<CountLine n={3} total={0} />)).toContain('3 teams submitted')
  })
  describe('useFontsReady', () => {
    let host, root, seen, resolve
    function Probe() { seen = useFontsReady(); return null }
    beforeEach(() => {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      vi.stubGlobal('document', Object.assign(document, {}))
      Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise(r => { resolve = r }) } })
      host = document.createElement('div'); root = createRoot(host)
    })
    afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals() })
    it('false until document.fonts.ready resolves, then true', async () => {
      await act(async () => { root.render(<Probe />) })
      expect(seen).toBe(false)
      await act(async () => { resolve(); await Promise.resolve() })
      expect(seen).toBe(true)
    })
  })
})
