import { describe, it, expect } from 'vitest'
import { createPendingCounter } from './pendingWrites.js'

describe('createPendingCounter', () => {
  it('tracks begin/end and never goes negative', () => {
    const c = createPendingCounter()
    expect(c.count).toBe(0)
    c.begin(); c.begin()
    expect(c.count).toBe(2)
    c.end(); c.end(); c.end()
    expect(c.count).toBe(0)
  })
})
