// Shared by the scripts that talk to Supabase (backup-db, migrate-shiny-title-slides).
import { readFileSync } from 'node:fs'

// The Baynes Trivia project, never Baynes Business Suite — that mix-up already
// cost a production 404.
export const TRIVIA_PROJECT = 'qwtbgusqfoypvehnungr'

export function parseEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8').split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('='))
        .map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] })
    )
  } catch { return {} }
}

// Throws unless `url` is the Baynes Trivia Supabase project.
export function assertTriviaProject(url) {
  if (!url || !url.includes(TRIVIA_PROJECT)) {
    throw new Error(`Refusing to run: VITE_SUPABASE_URL is not the Baynes Trivia project (${TRIVIA_PROJECT}).\n  got: ${url}`)
  }
}
