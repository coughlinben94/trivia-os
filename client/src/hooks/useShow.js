import { useState, useEffect, useRef, useCallback } from 'react'
import { nanoid } from 'nanoid'
import { supabase } from '../lib/supabase.js'
import { DEFAULT_THEME_ID } from '../themes/index.js'

const ACTIVE_SHOW_KEY = 'trivia-os:activeShowId'
const SHOW_MEDIA_BUCKET = 'trivia-show-media'
const HOST_PHOTOS_BUCKET = 'trivia-host-photos'
const FONT_BUCKET = 'trivia-fonts'

function normalizeShow(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    theme: row.theme_id ?? 'midnight-galaxy',
    themeOverrides: row.theme_overrides ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slides: row.slides ?? [],
    rounds: row.rounds ?? [],
    powerups: row.powerups ?? [],
    tickerMessages: row.ticker_messages ?? [],
    showState: {
      currentSlideId: row.current_slide_id ?? null,
      currentSlideIndex: row.current_slide_index ?? 0,
      isLive: row.is_live ?? false,
      scoreboardVisible: row.scoreboard_visible ?? false,
      scoresRevealed: row.scores_revealed ?? false,
      answerReveal: row.answer_reveal ?? false,
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

  // On mount, restore the last active show.
  // Cancel flag prevents a Strict Mode double-invocation from letting a
  // stale async fetch clobber state after the first invocation has settled.
  useEffect(() => {
    let cancelled = false
    const savedId = localStorage.getItem(ACTIVE_SHOW_KEY)
    if (savedId) {
      fetchShow(savedId, () => cancelled).finally(() => {
        if (!cancelled) setLoading(false)
      })
    } else {
      setLoading(false)
    }
    return () => { cancelled = true }
  }, [])

  async function fetchShow(id, isCancelled = () => false) {
    const { data, error } = await supabase
      .from('shows')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) return null
    const normalized = normalizeShow(data)
    if (!isCancelled()) setShow(normalized)
    return normalized
  }

  async function createShow(title, date, themeId) {
    const id = `show_${nanoid(8)}`
    const { error } = await supabase.from('shows').insert({
      id,
      title,
      date,
      theme_id: themeId ?? DEFAULT_THEME_ID,
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
      .select('id, title, date, updated_at, slides, rounds')
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map(row => ({
      id: row.id,
      title: row.title,
      date: row.date,
      updatedAt: row.updated_at,
      slideCount: (row.slides ?? []).length,
      roundCount: (row.rounds ?? []).length,
    }))
  }

  function unloadShow() {
    setShow(null)
    localStorage.removeItem(ACTIVE_SHOW_KEY)
  }

  async function exportShowById(id) {
    const { data, error } = await supabase.from('shows').select('*').eq('id', id).single()
    if (error || !data) throw new Error('Show not found')
    const normalized = normalizeShow(data)
    const json = JSON.stringify(normalized, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = (normalized.title ?? 'show').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')
    a.download = `${safeName}-${normalized.date ?? 'export'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importShow(json) {
    const now = new Date().toISOString()
    const newId = `show_${nanoid(8)}`
    const { error } = await supabase.from('shows').insert({
      id: newId,
      title: json.title ?? 'Imported Show',
      date: json.date ?? now.split('T')[0],
      theme_id: json.theme_id ?? json.theme ?? DEFAULT_THEME_ID,
      slides: json.slides ?? [],
      rounds: json.rounds ?? [],
      powerups: json.powerups ?? [],
      is_live: false,
      scoreboard_visible: false,
      scores_revealed: false,
      ticker_messages: json.tickerMessages ?? json.ticker_messages ?? [],
      current_slide_id: null,
      current_slide_index: 0,
      created_at: now,
      updated_at: now,
    })
    if (error) throw new Error(error.message)
    return loadShow(newId)
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
      current_slide_id: null,
      current_slide_index: 0,
      created_at: now,
      updated_at: now,
    })
    if (insertError) throw new Error(insertError.message)
    return {
      id: newId,
      title: `${original.title} (copy)`,
      date: original.date,
      updatedAt: now,
      slideCount: (original.slides ?? []).length,
      roundCount: (original.rounds ?? []).length,
    }
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
    if (meta.themeOverrides !== undefined) row.theme_overrides = meta.themeOverrides
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
      roundType: data.roundType ?? 'normal',
      ...(data.roundNumber !== undefined ? { roundNumber: data.roundNumber } : {}),
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
    if (import.meta.env.DEV) console.log('[addSlide] newSlides before write:', JSON.stringify(newSlides.map(s => s.id)))
    setShow(prev => ({ ...prev, slides: newSlides }))
    const { data: _d, error, status, count } = await supabase
      .from('shows')
      .update({ slides: newSlides })
      .eq('id', show.id)
      .select()
    if (import.meta.env.DEV) console.log('[addSlide] write result:', { status, count, error, newCount: newSlides.length, showId: show.id })

    if (slideData.type === 'question') {
      const round = show.rounds.find(r => r.id === (slideData.roundId ?? null))
      const d = slideData.data ?? {}
      supabase.from('questions').insert({
        show_id: show.id,
        show_date: show.date ?? null,
        show_title: show.title ?? null,
        type: d.isShiny ? 'shiny' : 'regular',
        text: d.text ?? null,
        answer: d.answer ?? null,
        is_bonus: d.isBonus ?? false,
        is_shiny: d.isShiny ?? false,
        shiny_type: d.shinyType ?? d.shinyInputSchema?.type ?? null,
        media_url: d.mediaUrl ?? null,
        round_number: round?.roundNumber ?? round?.number ?? null,
        question_number: d.questionNumber ?? null,
      }).then(({ error: qErr }) => {
        if (qErr && import.meta.env.DEV) console.warn('[addSlide] question archive write failed:', qErr)
      })
    }

    return slide
  }

  async function addSiblingSlides(afterSlideId, slidesData) {
    if (!show || !slidesData.length) return []
    const afterSlide = show.slides.find(s => s.id === afterSlideId)
    const insertAfterOrder = afterSlide?.order ?? show.slides.length - 1
    const count = slidesData.length
    const shifted = show.slides.map(s =>
      s.order > insertAfterOrder ? { ...s, order: s.order + count } : s
    )
    const newSlides = slidesData.map((d, i) => ({
      id: `slide_${nanoid(8)}`,
      type: d.type ?? 'question',
      roundId: d.roundId ?? null,
      order: insertAfterOrder + 1 + i,
      data: d.data ?? {},
    }))
    const allSlides = [...shifted, ...newSlides]
    setShow(prev => ({ ...prev, slides: allSlides }))
    await supabase.from('shows').update({ slides: allSlides }).eq('id', show.id)
    return newSlides
  }

  function updateSlide(id, patch) {
    if (!show) return
    setShow(prev => {
      const newSlides = prev.slides.map(s =>
        s.id === id ? { ...s, ...patch } : s
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

  async function reorderRounds(orderedRoundIds) {
    if (!show) return
    const newRounds = orderedRoundIds
      .map(id => show.rounds.find(r => r.id === id))
      .filter(Boolean)
    // Reorder slides: general (no-round) slides keep their relative positions at the top,
    // then each round's slides in the new round order
    const allSorted = sortedSlides(show)
    const generalSlides = allSorted.filter(s => !s.roundId)
    const roundedSlides = orderedRoundIds.flatMap(id => allSorted.filter(s => s.roundId === id))
    const newSlides = [...generalSlides, ...roundedSlides].map((s, i) => ({ ...s, order: i }))
    setShow(prev => ({ ...prev, rounds: newRounds, slides: newSlides }))
    await supabase.from('shows').update({ rounds: newRounds, slides: newSlides }).eq('id', show.id)
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

  async function uploadFont(file) {
    if (!show) throw new Error('No active show')
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['woff2', 'woff', 'ttf', 'otf'].includes(ext)) {
      throw new Error('Font file must be .woff2, .woff, .ttf, or .otf')
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Font file must be under 5MB')
    }
    const familyName = `Custom-${nanoid(8)}`
    const path = `${show.id}/${familyName}.${ext}`

    const { error } = await supabase.storage.from(FONT_BUCKET).upload(path, file, { upsert: false })
    if (error) throw new Error(error.message)

    const { data: { publicUrl } } = supabase.storage.from(FONT_BUCKET).getPublicUrl(path)
    return { familyName, url: publicUrl }
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

  // --- Live Mode navigation ---

  async function goLive() {
    if (!show) return
    const sorted = sortedSlides(show)
    const first = sorted[0] ?? null
    const now = new Date().toISOString()
    setShow(s => ({
      ...s,
      updatedAt: now,
      showState: { ...s.showState, isLive: true, currentSlideIndex: 0, currentSlideId: first?.id ?? null },
    }))
    await supabase.from('shows').update({
      is_live: true,
      current_slide_index: 0,
      current_slide_id: first?.id ?? null,
      updated_at: now,
    }).eq('id', show.id)
  }

  async function goLiveFrom(index) {
    if (!show) return
    const sorted = sortedSlides(show)
    const target = Math.max(0, Math.min(index, sorted.length - 1))
    const slide = sorted[target] ?? null
    const now = new Date().toISOString()
    setShow(s => ({
      ...s,
      updatedAt: now,
      showState: { ...s.showState, isLive: true, currentSlideIndex: target, currentSlideId: slide?.id ?? null },
    }))
    await supabase.from('shows').update({
      is_live: true,
      current_slide_index: target,
      current_slide_id: slide?.id ?? null,
      updated_at: now,
    }).eq('id', show.id)
  }

  async function nextSlide() {
    if (!show) return
    const sorted = sortedSlides(show)
    const cur = show.showState.currentSlideIndex ?? 0
    const target = Math.min(cur + 1, sorted.length - 1)
    if (target === cur) return
    const slide = sorted[target]
    setShow(s => ({
      ...s,
      showState: { ...s.showState, currentSlideIndex: target, currentSlideId: slide?.id ?? null, answerReveal: false },
    }))
    await supabase.from('shows').update({
      current_slide_index: target,
      current_slide_id: slide?.id ?? null,
      answer_reveal: false,
    }).eq('id', show.id)
  }

  async function prevSlide() {
    if (!show) return
    const sorted = sortedSlides(show)
    const cur = show.showState.currentSlideIndex ?? 0
    const target = Math.max(cur - 1, 0)
    if (target === cur) return
    const slide = sorted[target]
    setShow(s => ({
      ...s,
      showState: { ...s.showState, currentSlideIndex: target, currentSlideId: slide?.id ?? null, answerReveal: false },
    }))
    await supabase.from('shows').update({
      current_slide_index: target,
      current_slide_id: slide?.id ?? null,
      answer_reveal: false,
    }).eq('id', show.id)
  }

  async function setScoreboardVisible(visible) {
    if (!show) return
    setShow(s => ({ ...s, showState: { ...s.showState, scoreboardVisible: visible } }))
    await supabase.from('shows').update({ scoreboard_visible: visible }).eq('id', show.id)
  }

  async function setAnswerReveal(visible) {
    if (!show) return
    setShow(s => ({ ...s, showState: { ...s.showState, answerReveal: visible } }))
    await supabase.from('shows').update({ answer_reveal: visible }).eq('id', show.id)
  }

  async function updateRoundScore(teamId, roundIndex, score) {
    if (!show) return
    const { data: existing } = await supabase
      .from('team_scores')
      .select('id')
      .eq('team_id', teamId)
      .eq('round_index', roundIndex)
      .maybeSingle()
    if (existing?.id) {
      await supabase
        .from('team_scores')
        .update({ score, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('team_scores').insert({
        id: `sc_${nanoid(10)}`,
        show_id: show.id,
        team_id: teamId,
        round_index: roundIndex,
        score,
      })
    }
  }

  async function saveResults() {
    if (!show) return
    const [{ data: teamData }, { data: scoreData }] = await Promise.all([
      supabase.from('teams').select('id, name, color').eq('show_id', show.id),
      supabase.from('team_scores').select('team_id, round_index, score').eq('show_id', show.id),
    ])
    const teams = teamData ?? []
    const scores = scoreData ?? []
    const finalScores = teams.map(t => {
      const rounds = scores
        .filter(s => s.team_id === t.id)
        .sort((a, b) => a.round_index - b.round_index)
        .map(s => s.score ?? 0)
      return { teamId: t.id, name: t.name, color: t.color, total: rounds.reduce((n, s) => n + s, 0), rounds }
    }).sort((a, b) => b.total - a.total)
    await supabase.from('shows').update({ player_count: teams.length, final_scores: finalScores }).eq('id', show.id)
  }

  async function updateTickerMessages(messages) {
    if (!show) return
    setShow(prev => ({ ...prev, tickerMessages: messages }))
    await supabase.from('shows').update({ ticker_messages: messages }).eq('id', show.id)
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
    exportShowById,
    importShow,
    unloadShow,
    updateShowMeta,
    addRound,
    updateRound,
    deleteRound,
    addSlide,
    addSiblingSlides,
    updateSlide,
    deleteSlide,
    reorderSlides,
    reorderRounds,
    addPowerup,
    deletePowerup,
    uploadMedia,
    uploadFont,
    getHostPhotos,
    goLive,
    goLiveFrom,
    nextSlide,
    prevSlide,
    setScoreboardVisible,
    setAnswerReveal,
    updateRoundScore,
    saveResults,
    updateTickerMessages,
  }
}
