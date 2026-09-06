import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { nanoid } from 'nanoid'

export function useShinyFormats() {
  const [formats, setFormats] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    supabase
      .from('shiny_formats')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) setLoadError(error)
        else setFormats(data)
        setLoading(false)
      })
  }, [])

  async function createFormat(format) {
    const id = `fmt_${nanoid(8)}`
    const row = { id, ...format, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('shiny_formats').insert(row).select().single()
    if (error) throw error
    setFormats(prev => [...prev, data])
    return data
  }

  async function updateFormat(id, patch) {
    const { data, error } = await supabase
      .from('shiny_formats')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    setFormats(prev => prev.map(f => f.id === id ? data : f))
    return data
  }

  async function deleteFormat(id) {
    const { error } = await supabase.from('shiny_formats').delete().eq('id', id)
    if (error) throw error
    setFormats(prev => prev.filter(f => f.id !== id))
  }

  return { formats, loading, loadError, createFormat, updateFormat, deleteFormat }
}
