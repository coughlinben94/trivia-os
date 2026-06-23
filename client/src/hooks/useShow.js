import { useState, useEffect, useRef, useCallback } from 'react'
import { nanoid } from 'nanoid'
import { supabase } from '../lib/supabase.js'

const ACTIVE_SHOW_KEY = 'trivia-os:activeShowId'
const SHOW_MEDIA_BUCKET = 'trivia-show-media'
const HOST_PHOTOS_BUCKET = 'trivia-host-photos'

function normalizeShow(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    theme: row.theme_id ?? 'midnight-galaxy',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slides: row.slides ?? [],
    rounds: row.rounds ?? [],
    powerups: row.powerups ?? [],
    showState: {
      currentSlideId: row.current_slide_id ?? null,
      currentSlideIndex: row.current_slide_index ?? 0,
      isLive: row.is_live ?? false,
      scoreboardVisible: row.scoreboard_visible ?? false,
      scoresRevealed: row.scores_revealed ?? false,
    },
  }
}

export function sortedSlides(show) {
  if (!show?.slides) return []
  return [...show.slides].sort((a, b) => a.order - b.order)
}

export function useShow() {
  const [show, setShow] = useState(null)
  const [loading, setLoading] = useState(true)

  // Refs for debounced saves — always hold latest values without stale closure issues
  const slidesRef = useRef([])
  const showIdRef = useRef(null)
  const debounceTimers = useRef({})

  useEffect(() => {
    slidesRef.current = show?.slides ?? []
    showIdRef.current = show?.id ?? null
  }, [show])

  // On mount, restore the last active show
  useEffect(() => {
    const savedId = localStorage.getItem(ACTIVE_SHOW_KEY)
    if (savedId) {
      fetchShow(savedId).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  async function fetchShow(id) {
    const { data, error } = await supabase
      .from('shows')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) return null
    const normalized = normalizeShow(data)
    setShow(normalized)
    return normalized
  }

  async function createShow(title, date) {
    const id = `show_${nanoid(8)}`
    const { error } = await supabase.from('shows').insert({
      id,
      title,
      date,
      theme_id: 'midnight-galaxy',
      slides: [],
      rounds: [],
      powerups: [],
      current_slide_index: 0,
      is_live: false,
      scoreboard_visible: false,
      scores_revealed: false,
    })
    if (error) throw new Error(error.message)
    localStorage.setItem(ACTIVE_SHOW_KEY, id)
    return fetchShow(id)
  }

  async function loadShow(id) {
    localStorage.setItem(ACTIVE_SHOW_KEY, id)
    return fetchShow(id)
  }

  async function listShows() {
    const { data, error } = await supabase
      .from('shows')
      .select('id, title, date, updated_at')
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map(row => ({
      id: row.id,
      title: row.title,
      date: row.date,
      updatedAt: row.updated_at,
    }))
  }

  async function deleteShow(id) {
    await supabase.from('shows').delete().eq('id', id)
    if (show?.id === id) {
      setShow(null)
      localStorage.removeItem(ACTIVE_SHOW_KEY)
    }
  }

  async function duplicateShow(id) {
    const { data: original, error } = await supabase
      .from('shows')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !original) throw new Error('Show not found')
    const newId = `show_${nanoid(8)}`
    const now = new Date().toISOString()
    const { error: insertError } = await supabase.from('shows').insert({
      ...original,
      id: newId,
      title: `${original.title} (copy)`,
      is_live: false,
      created_at: now,
      updated_at: now,
    })
    if (insertError) throw new Error(insertError.message)
    return { id: newId, title: `${original.title} (copy)`, date: original.date, updatedAt: now }
  }

  async function exportShow() {
    if (!show) return
    const json = JSON.stringify(show, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${show.title.replace(/\s+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function updateShowMeta(meta) {
    if (!show) return
    const row = { updated_at: new Date().toISOString() }
    if (meta.title !== undefined) row.title = meta.title
    if (meta.date !== undefined) row.date = meta.date
    if (meta.theme !== undefined) row.theme_id = meta.theme
    setShow(prev => ({ ...prev, ...meta, updatedAt: row.updated_at }))
    await supabase.from('shows').update(row).eq('id', show.id)
  }

  // --- Rounds ---

  async function addRound(data = {}) {
    if (!show) return
    const round = {
      id: `round_${nanoid(8)}`,
      number: show.rounds.length + 1,
      title: data.title ?? `Round ${show.rounds.length + 1}`,
      subtitle: data.subtitle ?? '',
      type: data.type ?? 'standard',
      slides: [],
    }
    const newRounds = [...show.rounds, round]
    setShow(prev => ({ ...prev, rounds: newRounds }))
    await supabase.from('shows').update({ rounds: newRounds }).eq('id', show.id)
    return round
  }

  async function updateRound(id, patch) {
    if (!show) return
    const newRounds = show.rounds.map(r => r.id === id ? { ...r, ...patch } : r)
    setShow(prev => ({ ...prev, rounds: newRounds }))
    await supabase.from('shows').update({ rounds: newRounds }).eq('id', show.id)
  }

  async function deleteRound(roundId) {
    if (!show) return
    const newRounds = show.rounds.filter(r => r.id !== roundId)
    const newSlides = show.slides.filter(s => s.roundId !== roundId)
    setShow(prev => ({ ...prev, rounds: newRounds, slides: newSlides }))
    await supabase.from('shows').update({ rounds: newRounds, slides: newSlides }).eq('id', show.id)
  }

  // --- Slides ---

  async function addSlide(slideData) {
    if (!show) return
    const slide = {
      id: `slide_${nanoid(8)}`,
      type: slideData.type ?? 'question',
      roundId: slideData.roundId ?? null,
      order: slideData.order ?? show.slides.length,
      data: slideData.data ?? {},
    }
    const newSlides = [...show.slides, slide]
    setShow(prev => ({ ...prev, slides: newSlides }))
    await supabase.from('shows').update({ slides: newSlides }).eq('id', show.id)
    return slide
  }

  function updateSlide(id, patch) {
    if (!show) return
    setShow(prev => {
      const newSlides = prev.slides.map(s =>
        s.id === id ? { ...s, data: { ...s.data, ...patch } } : s
      )
      slidesRef.current = newSlides
      return { ...prev, slides: newSlides }
    })
    clearTimeout(debounceTimers.current['slides'])
    debounceTimers.current['slides'] = setTimeout(async () => {
      await supabase
        .from('shows')
        .update({ slides: slidesRef.current })
        .eq('id', showIdRef.current)
    }, 600)
  }

  async function deleteSlide(id) {
    if (!show) return
    const newSlides = show.slides.filter(s => s.id !== id)
    setShow(prev => ({ ...prev, slides: newSlides }))
    await supabase.from('shows').update({ slides: newSlides }).eq('id', show.id)
  }

  async function reorderSlides(orderedIds) {
    if (!show) return
    const newSlides = orderedIds
      .map((id, index) => {
        const slide = show.slides.find(s => s.id === id)
        return slide ? { ...slide, order: index } : null
      })
      .filter(Boolean)
    setShow(prev => ({ ...prev, slides: newSlides }))
    await supabase.from('shows').update({ slides: newSlides }).eq('id', show.id)
  }

  // --- Powerups ---

  async function addPowerup(data = {}) {
    if (!show) return
    const powerup = {
      id: `pu_${nanoid(8)}`,
      name: data.name ?? 'New Powerup',
      description: data.description ?? '',
      icon: data.icon ?? '⚡',
      effect: 'manual',
    }
    const newPowerups = [...show.powerups, powerup]
    setShow(prev => ({ ...prev, powerups: newPowerups }))
    await supabase.from('shows').update({ powerups: newPowerups }).eq('id', show.id)
    return powerup
  }

  async function deletePowerup(id) {
    if (!show) return
    const newPowerups = show.powerups.filter(p => p.id !== id)
    setShow(prev => ({ ...prev, powerups: newPowerups }))
    await supabase.from('shows').update({ powerups: newPowerups }).eq('id', show.id)
  }

  // --- Media (Supabase Storage) ---

  async function uploadMedia(file, isHostPhoto = false) {
    if (!show) throw new Error('No active show')
    const ext = file.name.split('.').pop().toLowerCase()
    const bucket = isHostPhoto ? HOST_PHOTOS_BUCKET : SHOW_MEDIA_BUCKET
    const path = isHostPhoto
      ? `${show.id}/host-photos/${nanoid(12)}.${ext}`
      : `${show.id}/${nanoid(12)}.${ext}`

    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false })
    if (error) throw new Error(error.message)

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
    return { url: publicUrl, filename: path, type: file.type }
  }

  async function getHostPhotos() {
    if (!show) return []
    const { data, error } = await supabase.storage
      .from(HOST_PHOTOS_BUCKET)
      .list(`${show.id}/host-photos`, { sortBy: { column: 'created_at', order: 'desc' } })
    if (error || !data) return []
    return data
      .filter(f => f.name && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
      .map(f => ({
        url: supabase.storage
          .from(HOST_PHOTOS_BUCKET)
          .getPublicUrl(`${show.id}/host-photos/${f.name}`).data.publicUrl,
        filename: f.name,
      }))
  }

  const refresh = useCallback(() => {
    if (show?.id) return fetchShow(show.id)
  }, [show?.id])

  return {
    show,
    loading,
    refresh,
    createShow,
    loadShow,
    listShows,
    deleteShow,
    duplicateShow,
    exportShow,
    updateShowMeta,
    addRound,
    updateRound,
    deleteRound,
    addSlide,
    updateSlide,
    deleteSlide,
    reorderSlides,
    addPowerup,
    deletePowerup,
    uploadMedia,
    getHostPhotos,
  }
}
