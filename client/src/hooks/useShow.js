import { useState, useEffect, useRef } from 'react'
import { nanoid } from 'nanoid'
import { supabase } from '../lib/supabase.js'
import { DEFAULT_THEME_ID } from '../themes/index.js'
import { deriveRoundCols, computeTotal } from '../lib/scoreboardMath.js'
import { renumberRoundQuestions } from '../lib/questionNumbering.js'

const ACTIVE_SHOW_KEY = 'trivia-os:activeShowId'
const SHOW_MEDIA_BUCKET = 'trivia-show-media'
const HOST_PHOTOS_BUCKET = 'trivia-host-photos'
const FONT_BUCKET = 'trivia-fonts'

function normalizeShow(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    theme: row.theme_id ?? DEFAULT_THEME_ID,
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
  // Host-visible write-failure signal — set on any failed shows-row write,
  // cleared the instant the next one succeeds. Visibility only: doesn't retry
  // or roll back the optimistic update that already ran locally. Host.jsx
  // watches this to surface a toast in both Build and Live Mode; /display
  // and /join never read useShow()'s action surface, so this can't leak there.
  const [writeError, setWriteError] = useState(null)

  // Every mutating action here optimistically updates local React state first,
  // then fires this write — it used to do so with no error check at all, so a
  // failed write (network blip, RLS denial, oversized payload) left the host's
  // UI showing a change that was never actually persisted, with no signal that
  // anything went wrong until a reload silently reverted it. This doesn't retry
  // or roll back the optimistic update (that's a bigger behavior change), but
  // it at least surfaces the failure instead of swallowing it completely.
  async function updateShowRow(id, patch) {
    const { error } = await supabase.from('shows').update(patch).eq('id', id)
    if (error) {
      console.error(`[useShow] shows update failed (${Object.keys(patch).join(', ')}):`, error)
      setWriteError({ id: `we_${Date.now()}`, message: 'Save failed — check connection' })
    } else {
      setWriteError(null)
    }
    return !error
  }

  // Refs for debounced saves — always hold latest values without stale closure issues
  const slidesRef = useRef([])
  const showIdRef = useRef(null)
  const debounceTimers = useRef({})

  // Guards realtime echo from clobbering optimistic slide-index updates. Set for
  // 1.5s after any local navigation action — long enough to outlast the echo.
  const localNavRef = useRef(false)
  const localNavTimerRef = useRef(null)
  function markLocalNav() {
    localNavRef.current = true
    clearTimeout(localNavTimerRef.current)
    localNavTimerRef.current = setTimeout(() => { localNavRef.current = false }, 1500)
  }

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

  // Subscribe to shows row changes so Display.jsx slide advances (e.g. PYL onDone)
  // and scoreboard/answer-reveal toggles propagate back to the Host in real time.
  // Only merges showState fields — never touches slides/rounds to avoid optimistic clobber.
  useEffect(() => {
    if (!show?.id) return
    const showId = show.id
    const ch = supabase
      .channel(`show-state:${showId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shows', filter: `id=eq.${showId}` },
        (payload) => {
          const row = payload.new
          setShow(prev => {
            if (!prev || prev.id !== row.id) return prev
            return {
              ...prev,
              showState: {
                // Skip nav fields during the 1.5s window after a local action to
                // prevent our own echo from overwriting an already-updated index.
                ...(localNavRef.current ? prev.showState : {
                  ...prev.showState,
                  currentSlideIndex: row.current_slide_index ?? prev.showState.currentSlideIndex,
                  currentSlideId: row.current_slide_id ?? prev.showState.currentSlideId,
                }),
                isLive: row.is_live ?? prev.showState.isLive,
                scoreboardVisible: row.scoreboard_visible ?? prev.showState.scoreboardVisible,
                scoresRevealed: row.scores_revealed ?? prev.showState.scoresRevealed,
                answerReveal: row.answer_reveal ?? prev.showState.answerReveal,
              },
            }
          })
        }
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [show?.id])

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
      theme_overrides: json.themeOverrides ?? json.theme_overrides ?? {},
      slides: json.slides ?? [],
      rounds: json.rounds ?? [],
      powerups: json.powerups ?? [],
      is_live: false,
      scoreboard_visible: false,
      scores_revealed: false,
      answer_reveal: false,
      ticker_messages: json.tickerMessages ?? json.ticker_messages ?? [],
      current_slide_id: null,
      current_slide_index: 0,
      final_scores: null,
      player_count: null,
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
      scoreboard_visible: false,
      scores_revealed: false,
      answer_reveal: false,
      final_scores: null,
      player_count: null,
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
    const safeName = (show.title ?? 'show').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')
    a.download = `${safeName}-${show.date ?? 'export'}.json`
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
    await updateShowRow(show.id, row)
  }

  // --- Rounds ---

  async function addRound(data = {}) {
    if (!show) return
    const round = {
      id: `round_${nanoid(8)}`,
      number: Math.max(0, ...show.rounds.map(r => r.number ?? 0)) + 1,
      title: data.title ?? `Round ${Math.max(0, ...show.rounds.map(r => r.number ?? 0)) + 1}`,
      subtitle: data.subtitle ?? '',
      type: data.type ?? 'standard',
      roundType: data.roundType ?? 'normal',
      ...(data.roundNumber !== undefined ? { roundNumber: data.roundNumber } : {}),
      slides: [],
    }
    const newRounds = [...show.rounds, round]
    setShow(prev => ({ ...prev, rounds: newRounds }))
    await updateShowRow(show.id, { rounds: newRounds })
    return round
  }

  async function updateRound(id, patch) {
    if (!show) return
    const newRounds = show.rounds.map(r => r.id === id ? { ...r, ...patch } : r)
    setShow(prev => ({ ...prev, rounds: newRounds }))
    await updateShowRow(show.id, { rounds: newRounds })
  }

  async function deleteRound(roundId) {
    if (!show) return
    const newRounds = show.rounds.filter(r => r.id !== roundId)
    const newSlides = show.slides.filter(s => s.roundId !== roundId)
    setShow(prev => ({ ...prev, rounds: newRounds, slides: newSlides }))
    await updateShowRow(show.id, { rounds: newRounds, slides: newSlides })
  }

  // --- Slides ---

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
    const allSlides = renumberRoundQuestions([...shifted, ...newSlides])
    setShow(prev => ({ ...prev, slides: allSlides }))
    await updateShowRow(show.id, { slides: allSlides })
    // Return the freshly-renumbered versions, not the pre-renumber snapshot —
    // callers (e.g. AddSlideWizard) open the editor on this returned slide.
    const newIds = new Set(newSlides.map(s => s.id))
    return allSlides.filter(s => newIds.has(s.id))
  }

  function updateSlide(id, patch) {
    if (!show) return
    setShow(prev => {
      // Renumbered on every edit, not just when isBonus changes — cheap and
      // covers any future patch shape that could move a slide between
      // counting groups without going through reorder/delete.
      const newSlides = renumberRoundQuestions(prev.slides.map(s =>
        s.id === id ? { ...s, ...patch } : s
      ))
      slidesRef.current = newSlides
      return { ...prev, slides: newSlides }
    })
    clearTimeout(debounceTimers.current['slides'])
    debounceTimers.current['slides'] = setTimeout(async () => {
      await updateShowRow(showIdRef.current, { slides: slidesRef.current })
    }, 600)
  }

  async function deleteSlide(id) {
    if (!show) return
    const newSlides = renumberRoundQuestions(show.slides.filter(s => s.id !== id))
    setShow(prev => ({ ...prev, slides: newSlides }))
    await updateShowRow(show.id, { slides: newSlides })
  }

  async function reorderSlides(orderedIds) {
    if (!show) return
    const newSlides = renumberRoundQuestions(
      orderedIds
        .map((id, index) => {
          const slide = show.slides.find(s => s.id === id)
          return slide ? { ...slide, order: index } : null
        })
        .filter(Boolean)
    )
    setShow(prev => ({ ...prev, slides: newSlides }))
    await updateShowRow(show.id, { slides: newSlides })
  }

  async function reorderRounds(orderedRoundIds) {
    if (!show) return
    const newRounds = orderedRoundIds
      .map(id => show.rounds.find(r => r.id === id))
      .filter(Boolean)
    // Build a sequence of "segments" (general or round) in the current order, then
    // replace round segments with the new round order while leaving general-slide
    // segments in their current positions. This preserves e.g. a winner-reveal that
    // was dragged to the bottom — a round reorder must not snap it back to the top.
    const allSorted = sortedSlides(show)
    const segs = []
    let lastKey = null
    for (const s of allSorted) {
      const key = s.roundId ?? '__general__'
      if (key !== lastKey) {
        lastKey = key
        segs.push(s.roundId
          ? { isRound: true, roundId: s.roundId, slides: [s] }
          : { isRound: false, slides: [s] })
      } else {
        segs[segs.length - 1].slides.push(s)
      }
    }
    const newRoundOrder = new Map(orderedRoundIds.map((id, i) => [id, i]))
    const roundSegs = segs.filter(sg => sg.isRound).sort((a, b) =>
      (newRoundOrder.get(a.roundId) ?? 0) - (newRoundOrder.get(b.roundId) ?? 0)
    )
    let ri = 0
    const newSlides = segs
      .map(sg => sg.isRound ? roundSegs[ri++] : sg)
      .flatMap(sg => sg.slides)
      .map((s, i) => ({ ...s, order: i }))
    setShow(prev => ({ ...prev, rounds: newRounds, slides: newSlides }))
    await updateShowRow(show.id, { rounds: newRounds, slides: newSlides })
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
    await updateShowRow(show.id, { powerups: newPowerups })
    return powerup
  }

  async function deletePowerup(id) {
    if (!show) return
    const newPowerups = show.powerups.filter(p => p.id !== id)
    setShow(prev => ({ ...prev, powerups: newPowerups }))
    await updateShowRow(show.id, { powerups: newPowerups })
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

  // Every shiny question gets a standalone intro beat (data.introDone: false)
  // before its content — image/audio/parts — is revealed. Multi-part shiny
  // series (data.parts.length > 1) additionally step through their parts
  // once revealed. Entering a slide fresh (goLive/goLiveFrom, or crossing
  // into it from an adjacent slide) always resets to a specific state
  // rather than resuming wherever a previous visit left off, so jumping to
  // a slide is predictable.
  function withEntryState(slides, slide, { currentPart, introDone } = {}) {
    if (!slide) return slides
    const patch = {}
    if (currentPart !== undefined && (slide.data?.parts?.length ?? 0) > 1 && (slide.data.currentPart ?? 0) !== currentPart) {
      patch.currentPart = currentPart
    }
    if (introDone !== undefined && slide.data?.isShiny && !!slide.data.introDone !== introDone) {
      patch.introDone = introDone
    }
    if (Object.keys(patch).length === 0) return slides
    return slides.map(s => s.id === slide.id ? { ...s, data: { ...s.data, ...patch } } : s)
  }

  // team-picker slides step through [intro, ...teams, outro, landed] using the
  // exact same data.currentPart mechanism as shiny series (withEntryState above
  // and the parts-stepping branches in nextSlide/prevSlide already handle any
  // slide with an array in data.parts — no changes needed there). The only
  // team-picker-specific piece is baking data.parts to the right LENGTH once,
  // the first time the slide is entered fresh, from a live count of the teams
  // table — after that it's just a plain step counter (TeamPickerSlide fetches
  // the actual names itself). Baking only once (not on every entry) means a
  // team registering mid-reveal can't resize the sequence out from under an
  // in-progress Stream Deck advance.
  async function bakeTeamPickerParts(slides, slide) {
    if (!slide || slide.type !== 'team-picker' || Array.isArray(slide.data?.parts)) return slides
    const { data, error } = await supabase.from('teams').select('id').eq('show_id', show.id)
    if (error) console.error('[useShow] bakeTeamPickerParts failed:', error)
    const count = data?.length ?? 0
    const parts = new Array(count + 3).fill(null) // intro + teams + outro + landed
    return slides.map(s => s.id === slide.id ? { ...s, data: { ...s.data, parts } } : s)
  }

  async function goLive() {
    if (!show) return
    markLocalNav()
    const sorted = sortedSlides(show)
    const first = sorted[0] ?? null
    const now = new Date().toISOString()
    const bakedSlides = await bakeTeamPickerParts(show.slides, first)
    const newSlides = withEntryState(bakedSlides, bakedSlides.find(s => s.id === first?.id) ?? first, { currentPart: 0, introDone: false })
    setShow(s => ({
      ...s,
      slides: newSlides,
      updatedAt: now,
      showState: { ...s.showState, isLive: true, currentSlideIndex: 0, currentSlideId: null },
    }))
    await updateShowRow(show.id, {
      slides: newSlides,
      is_live: true,
      current_slide_index: 0,
      current_slide_id: null,
      updated_at: now,
    })
  }

  async function goLiveFrom(index) {
    if (!show) return
    markLocalNav()
    const sorted = sortedSlides(show)
    const target = Math.max(0, Math.min(index, sorted.length - 1))
    const slide = sorted[target] ?? null
    const now = new Date().toISOString()
    const bakedSlides = await bakeTeamPickerParts(show.slides, slide)
    const newSlides = withEntryState(bakedSlides, bakedSlides.find(s => s.id === slide?.id) ?? slide, { currentPart: 0, introDone: false })
    setShow(s => ({
      ...s,
      slides: newSlides,
      updatedAt: now,
      showState: { ...s.showState, isLive: true, currentSlideIndex: target, currentSlideId: null },
    }))
    await updateShowRow(show.id, {
      slides: newSlides,
      is_live: true,
      current_slide_index: target,
      current_slide_id: null,
      updated_at: now,
    })
  }

  async function nextSlide() {
    if (!show) return
    markLocalNav()
    const sorted = sortedSlides(show)
    const cur = show.showState.currentSlideIndex ?? 0

    // First advance after going live — reveal the queued slide without stepping past it.
    if (show.showState.currentSlideId === null) {
      const targetSlide = sorted[cur]
      if (!targetSlide) return
      const bakedSlides = await bakeTeamPickerParts(show.slides, targetSlide)
      const newSlides = withEntryState(bakedSlides, bakedSlides.find(s => s.id === targetSlide.id) ?? targetSlide, { currentPart: 0, introDone: false })
      setShow(s => ({
        ...s,
        slides: newSlides,
        showState: { ...s.showState, currentSlideId: targetSlide.id, answerReveal: false },
      }))
      await updateShowRow(show.id, {
        slides: newSlides,
        current_slide_id: targetSlide.id,
        answer_reveal: false,
      })
      return
    }

    const curSlide = sorted[cur]
    const data = curSlide?.data

    // Reveal the intro's content before doing anything else.
    if (data?.isShiny && !data.introDone) {
      const newSlides = show.slides.map(s =>
        s.id === curSlide.id ? { ...s, data: { ...s.data, introDone: true } } : s
      )
      setShow(s => ({ ...s, slides: newSlides, showState: { ...s.showState, answerReveal: false } }))
      await updateShowRow(show.id, { slides: newSlides, answer_reveal: false })
      return
    }

    // Step through this slide's parts before moving to the next slide.
    const parts = data?.parts
    if (Array.isArray(parts) && parts.length > 1) {
      const curPart = data.currentPart ?? 0
      if (curPart < parts.length - 1) {
        const newSlides = show.slides.map(s =>
          s.id === curSlide.id ? { ...s, data: { ...s.data, currentPart: curPart + 1 } } : s
        )
        setShow(s => ({ ...s, slides: newSlides, showState: { ...s.showState, answerReveal: false } }))
        await updateShowRow(show.id, { slides: newSlides, answer_reveal: false })
        return
      }
    }

    const target = Math.min(cur + 1, sorted.length - 1)
    if (target === cur) return
    const targetSlide = sorted[target]
    const bakedSlides = await bakeTeamPickerParts(show.slides, targetSlide)
    const newSlides = withEntryState(bakedSlides, bakedSlides.find(s => s.id === targetSlide?.id) ?? targetSlide, { currentPart: 0, introDone: false })
    setShow(s => ({
      ...s,
      slides: newSlides,
      showState: { ...s.showState, currentSlideIndex: target, currentSlideId: targetSlide?.id ?? null, answerReveal: false },
    }))
    await updateShowRow(show.id, {
      slides: newSlides,
      current_slide_index: target,
      current_slide_id: targetSlide?.id ?? null,
      answer_reveal: false,
    })
  }

  async function prevSlide() {
    if (!show) return
    markLocalNav()
    const sorted = sortedSlides(show)
    const cur = show.showState.currentSlideIndex ?? 0
    const curSlide = sorted[cur]
    const data = curSlide?.data
    const parts = data?.parts

    // Step back through this slide's parts before un-revealing its intro.
    // Generic on purpose (matches the forward branch in nextSlide) — not
    // gated to isShiny/introDone, since team-picker uses this same
    // data.parts/currentPart mechanism without either of those fields.
    if (Array.isArray(parts) && parts.length > 1) {
      const curPart = data.currentPart ?? 0
      if (curPart > 0) {
        const newSlides = show.slides.map(s =>
          s.id === curSlide.id ? { ...s, data: { ...s.data, currentPart: curPart - 1 } } : s
        )
        setShow(s => ({ ...s, slides: newSlides, showState: { ...s.showState, answerReveal: false } }))
        await updateShowRow(show.id, { slides: newSlides, answer_reveal: false })
        return
      }
    }

    // Back to the intro beat before moving to the previous slide.
    if (data?.isShiny && data.introDone) {
      const newSlides = show.slides.map(s =>
        s.id === curSlide.id ? { ...s, data: { ...s.data, introDone: false } } : s
      )
      setShow(s => ({ ...s, slides: newSlides, showState: { ...s.showState, answerReveal: false } }))
      await updateShowRow(show.id, { slides: newSlides, answer_reveal: false })
      return
    }

    const target = Math.max(cur - 1, 0)
    if (target === cur) return
    const targetSlide = sorted[target]
    const bakedSlides = await bakeTeamPickerParts(show.slides, targetSlide)
    const resolvedTarget = bakedSlides.find(s => s.id === targetSlide?.id) ?? targetSlide
    // Backing into a shiny or team-picker slide lands on its last revealed
    // state — the natural "undo" of advancing forward through it.
    const lastPartIdx = Math.max((resolvedTarget?.data?.parts?.length ?? 1) - 1, 0)
    const newSlides = withEntryState(bakedSlides, resolvedTarget, { currentPart: lastPartIdx, introDone: true })
    setShow(s => ({
      ...s,
      slides: newSlides,
      showState: { ...s.showState, currentSlideIndex: target, currentSlideId: targetSlide?.id ?? null, answerReveal: false },
    }))
    await updateShowRow(show.id, {
      slides: newSlides,
      current_slide_index: target,
      current_slide_id: targetSlide?.id ?? null,
      answer_reveal: false,
    })
  }

  async function setScoreboardVisible(visible) {
    if (!show) return
    setShow(s => ({ ...s, showState: { ...s.showState, scoreboardVisible: visible } }))
    await updateShowRow(show.id, { scoreboard_visible: visible })
  }

  async function setAnswerReveal(visible) {
    if (!show) return
    setShow(s => ({ ...s, showState: { ...s.showState, answerReveal: visible } }))
    await updateShowRow(show.id, { answer_reveal: visible })
  }

  async function setScoresRevealed(revealed) {
    if (!show) return
    setShow(s => ({ ...s, showState: { ...s.showState, scoresRevealed: revealed } }))
    await updateShowRow(show.id, { scores_revealed: revealed })
  }

  async function updateRoundScore(teamId, roundIndex, score) {
    if (!show) return
    // Atomic upsert on the (team_id, round_index) unique constraint — the
    // previous select-then-insert-or-update had a race: two rapid calls for
    // the same team/round could both see no existing row and both attempt
    // an insert, and the loser's unique-constraint violation was never
    // caught, silently dropping that score update. `id` is deterministic
    // (not a fresh nanoid per call) so a same-row upsert-on-conflict doesn't
    // churn the primary key on every edit.
    const { error } = await supabase.from('team_scores').upsert(
      { id: `sc_${teamId}_${roundIndex}`, show_id: show.id, team_id: teamId, round_index: roundIndex, score, updated_at: new Date().toISOString() },
      { onConflict: 'team_id,round_index' }
    )
    if (error) console.error('[useShow] updateRoundScore failed:', error)
  }

  async function saveResults() {
    if (!show) return
    const { data: sbTeams } = await supabase
      .from('scoreboard_teams').select('id, name, scores').eq('show_id', show.id)

    let finalScores
    if (sbTeams?.length) {
      const cols = deriveRoundCols(show)
      finalScores = sbTeams.map(t => ({
        teamId: t.id,
        name: t.name,
        total: computeTotal(t.scores, cols),
        rounds: cols.map(c => Number(t.scores?.[c.key] ?? 0)),
      })).sort((a, b) => b.total - a.total)
    } else {
      // Fallback: legacy team_scores
      const [{ data: teamData }, { data: scoreData }] = await Promise.all([
        supabase.from('teams').select('id, name, color').eq('show_id', show.id),
        supabase.from('team_scores').select('team_id, round_index, score').eq('show_id', show.id),
      ])
      const teams = teamData ?? []
      const scores = scoreData ?? []
      finalScores = teams.map(t => {
        const rounds = scores
          .filter(s => s.team_id === t.id)
          .sort((a, b) => a.round_index - b.round_index)
          .map(s => s.score ?? 0)
        return { teamId: t.id, name: t.name, color: t.color, total: rounds.reduce((n, s) => n + s, 0), rounds }
      }).sort((a, b) => b.total - a.total)
    }

    await updateShowRow(show.id, {
      player_count: (sbTeams ?? []).length || finalScores.length,
      final_scores: finalScores,
    })
  }

  async function updateTickerMessages(messages) {
    if (!show) return
    setShow(prev => ({ ...prev, tickerMessages: messages }))
    await updateShowRow(show.id, { ticker_messages: messages })
  }

  return {
    show,
    loading,
    writeError,
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
    setScoresRevealed,
    updateRoundScore,
    saveResults,
    updateTickerMessages,
  }
}
