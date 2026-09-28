import { describe, it, expect } from 'vitest'
import { mergeWalkoutClip } from './walkoutClip.js'

describe('mergeWalkoutClip', () => {
  it('keeps trigger when the clip changes', () => {
    expect(mergeWalkoutClip({ url: 'a', trigger: 'invoke' }, { url: 'b', start: 3 }))
      .toEqual({ url: 'b', start: 3, trigger: 'invoke' })
  })
  it('works with no existing walkout', () => {
    expect(mergeWalkoutClip(undefined, { url: 'b' })).toEqual({ url: 'b' })
  })
  it('null clears', () => {
    expect(mergeWalkoutClip({ url: 'a', trigger: 'invoke' }, null)).toBeNull()
  })
})
