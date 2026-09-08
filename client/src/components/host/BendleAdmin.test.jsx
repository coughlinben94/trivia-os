// client/src/components/host/BendleAdmin.test.jsx
import { describe, it, expect, vi } from 'vitest'

// Importing BendleAdmin.jsx pulls in ../../lib/supabase.js, which throws at
// module init without VITE_SUPABASE_URL/ANON_KEY — mock it per the house
// pattern (see BendleSongSearch.test.jsx) so the pure statusLabel export can
// be tested without a real client.
vi.mock('../../lib/supabase.js', () => ({
  supabase: { channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => {} },
}))

const { statusLabel } = await import('./BendleAdmin.jsx')

describe('statusLabel', () => {
  it('labels requested', () => expect(statusLabel('requested')).toBe('⏳ Queued'))
  it('labels processing', () => expect(statusLabel('processing')).toBe('⚙️ Processing'))
  it('labels ready', () => expect(statusLabel('ready')).toBe('✅ Ready'))
  it('labels failed', () => expect(statusLabel('failed')).toBe('❌ Failed'))
})
