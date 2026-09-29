// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
vi.mock('../../lib/supabase.js', () => ({ supabase: {} }))

import { ShinyFormatPicker } from './DatabaseAddPanels.jsx'

const formats = [
  { id: 'p', name: 'Pin It', description: '', icon: 'P', input_schema: { type: 'pin' } },
  { id: 't', name: 'Plain Text', description: '', icon: 'T', input_schema: { type: 'text' } },
]

describe('ShinyFormatPicker', () => {
  it('never offers the pin format (question bank has no coordinates)', () => {
    const el = document.createElement('div')
    act(() => { createRoot(el).render(<ShinyFormatPicker formats={formats} loading={false} selectedId="" onSelect={() => {}} />) })
    expect(el.textContent).toContain('Plain Text')
    expect(el.textContent).not.toContain('Pin It')
  })
})
