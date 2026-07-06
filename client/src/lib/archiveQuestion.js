import { supabase } from './supabase.js'

// Both return true on success, false on failure — callers that collect user
// input (DatabaseAddPanels) MUST check this and keep the typed text on
// failure. The original fire-and-forget version let a failed insert clear
// the form and flash the success toast: typed questions silently vanished.

export async function archiveQuestion(row) {
  const { error } = await supabase.from('questions').insert(row)
  if (error) console.warn('[archive] failed to save question:', error.message)
  return !error
}

export async function archiveQuestions(rows) {
  if (!rows.length) return true
  const { error } = await supabase.from('questions').insert(rows)
  if (error) console.warn('[archive] failed to save questions:', error.message)
  return !error
}
