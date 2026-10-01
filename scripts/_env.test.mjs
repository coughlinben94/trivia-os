import { describe, it, expect } from 'vitest'
import { parseEnvFile, assertTriviaProject, TRIVIA_PROJECT } from './_env.mjs'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('parseEnvFile', () => {
  it('reads KEY=value lines, strips quotes, skips comments and blanks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-'))
    const f = join(dir, '.env')
    writeFileSync(f, '# c\n\nA=1\nB="two words"\nC=\'x=y\'\n')
    try {
      expect(parseEnvFile(f)).toEqual({ A: '1', B: 'two words', C: 'x=y' })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('returns {} for a missing file', () => {
    expect(parseEnvFile('/nonexistent/.env')).toEqual({})
  })
})

describe('assertTriviaProject', () => {
  it('accepts the Baynes Trivia project url', () => {
    expect(() => assertTriviaProject(`https://${TRIVIA_PROJECT}.supabase.co`)).not.toThrow()
  })
  it('refuses the Business Suite project and anything else', () => {
    expect(() => assertTriviaProject('https://dreggwinegtirxxanntv.supabase.co')).toThrow(/Baynes Trivia/)
    expect(() => assertTriviaProject('')).toThrow()
    expect(() => assertTriviaProject(undefined)).toThrow()
  })
})
