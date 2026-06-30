import { supabase } from './supabase.js'

export async function archiveQuestion(row) {
  const { error } = await supabase.from('questions').insert(row)
  if (error) console.warn('[archive] failed to save question:', error.message)
}

export async function archiveQuestions(rows) {
  if (!rows.length) return
  const { error } = await supabase.from('questions').insert(rows)
  if (error) console.warn('[archive] failed to save questions:', error.message)
}
