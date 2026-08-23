import { useState, useEffect, useRef } from 'react'
import { nanoid } from 'nanoid'
import { supabase } from '../lib/supabase.js'
import { DEFAULT_THEME_ID } from '../themes/index.js'
import { deriveRoundCols, computeTotal, roundScoreTotal } from '../lib/scoreboardMath.js'
import { renumberRoundQuestions } from '../lib/questionNumbering.js'
import { trackWrite } from '../lib/writeTracking.js'
import { HOST_PHOTOS_BUCKET, listHostPhotos } from '../lib/hostPhotos.js'
import { isShinySeriesSibling, isMatchingShiny, isWagerShiny } from '../lib/shinySeries.js'
import { archiveShow } from '../lib/questionRows.js'

// See the disabled call site in nextSlide() below.
const CLOSING_BEAT_ENABLED = false

const ACTIVE_SHOW_KEY = 'trivia-os:activeShowId'
const SHOW_MEDIA_BUCKET = 'trivia-show-media'
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
      devMode: row.dev_mode ?? false,
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
    // `shows.updated_at` is kept fresh by a DB trigger (shows_updated_at_trigger
    // migration, 2026-08-19) — NOT stamped here. It used to be, but two other
    // direct `supabase.from('shows').update(...)` call sites (PylRevealSlide.jsx,
    // ScoreboardModal.jsx) don't go through this function, so a client-side
    // stamp here alone left `updated_at` frozen on writes from those paths —
    // which silently broke Display.jsx's staleness guard (a same-value
    // `updated_at` reads as "not newer", so PYL auto-advance got dropped by
    // its own subscription). A DB trigger covers every write path, including
    // ones added later, instead of every call site needing to remember this.
    const result = await supabase.from('shows').update(patch).eq('id', id)
    if (result.error) console.error(`[useShow] shows update failed (${Object.keys(patch).join(', ')}):`, result.error)
    return trackWrite(Promise.resolve(result), setWriteError)
  }

  // Refs for debounced saves — always hold latest values without stale closure issues
  const slidesRef = useRef([])
  const showIdRef = useRef(null)
  const debounceTimers = useRef({})
  // Serializes the actual `slides` network writes. The 600ms debounce below only
  // coalesces calls that land within the same window — edits spaced further apart
  // (drag, pause, rotate, pause, recolor — completely normal overlay-editor use)
  // each schedule their own write. Without this chain, those writes fire as
  // separate concurrent requests, and if an earlier one resolves after a later
  // one (ordinary network jitter), it silently overwrites newer data with older.
  // Chaining onto the prior write guarantees they complete in schedule order.
  const slidesSaveChainRef = useRef(Promise.resolve())

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
                devMode: row.dev_mode ?? prev.showState.devMode,
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
    // Chained through slidesSaveChainRef rather than written directly, for the
    // same reason the debounced updateSlide path is (see the comment at
    // flushSlides): two writes to the `slides` jsonb column that leave the
    // browser concurrently can resolve out of order, and the one that lands
    // last wins even if it started first — silently losing whichever
    // structural edit lost the race. Awaiting `run` keeps this function's
    // existing "resolves once the write actually landed" contract.
    const run = slidesSaveChainRef.current.then(() => updateShowRow(show.id, { slides: allSlides }))
    slidesSaveChainRef.current = run.catch(() => {})
    await run
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
    debounceTimers.current['slides'] = setTimeout(() => {
      // Read slidesRef.current inside the chained callback (not here) so a write
      // that had to wait its turn still sends whatever is truly latest at send
      // time, not a stale snapshot from when its timer fired.
      //
      // .catch() here is load-bearing, not decorative: this ref is a promise
      // CHAIN — every future write (debounced or flushSlides) links onto
      // whatever this resolves to. An uncaught rejection would poison the
      // ref permanently, silently killing every slide save for the rest of
      // the show while the UI keeps showing optimistic local updates.
      // updateShowRow itself never rejects (it resolves {error} rather than
      // throwing), so this is defense against a future change, not a live bug.
      slidesSaveChainRef.current = slidesSaveChainRef.current.then(() =>
        updateShowRow(showIdRef.current, { slides: slidesRef.current })
      ).catch(() => {})
    }, 600)
  }

  // updateSlide is NOT awaitable in any meaningful sense — it's a void
  // function around a 600ms-debounced write, so every `await
  // actions.updateSlide(...)` call site in the codebase was really `await
  // undefined`, resolving instantly while the real write still hadn't left
  // the browser. LiveMode's lock-then-score handlers (wager tiers, wager
  // guesses, matching) all did exactly that: lock, "await" it, then
  // immediately fetch phone_answers — reading the DB before the lock had
  // even been written, let alone delivered to phones over Realtime. A team
  // that submits in that window gets scored as a non-answerer while their
  // own phone shows a successful, locked-in submission.
  //
  // flushSlides forces whatever slides write is currently pending (or
  // in-flight from a prior flush) to actually happen now, and returns a
  // promise that resolves only once it has — a real await, not a fake one.
  // Chained through the same slidesSaveChainRef ordering the debounced path
  // already relies on, so this can't race a write that's already in flight.
  function flushSlides() {
    clearTimeout(debounceTimers.current['slides'])
    const run = slidesSaveChainRef.current.then(() =>
      updateShowRow(showIdRef.current, { slides: slidesRef.current })
    )
    // Same poisoned-chain guard as the debounced path above — the ref stores
    // the CAUGHT version so a rejection can't kill every later save, while
    // the caller still gets the real (uncaught) `run` to await/inspect.
    slidesSaveChainRef.current = run.catch(() => {})
    return run
  }

  async function deleteSlide(id) {
    if (!show) return
    const newSlides = renumberRoundQuestions(show.slides.filter(s => s.id !== id))
    setShow(prev => ({ ...prev, slides: newSlides }))
    // Same write-ordering chain as addSiblingSlides — see the comment there.
    const run = slidesSaveChainRef.current.then(() => updateShowRow(show.id, { slides: newSlides }))
    slidesSaveChainRef.current = run.catch(() => {})
    await run
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
    // Same write-ordering chain as addSiblingSlides — see the comment there.
    const run = slidesSaveChainRef.current.then(() => updateShowRow(show.id, { slides: newSlides }))
    slidesSaveChainRef.current = run.catch(() => {})
    await run
  }

  // orderedSlideIds is RoundSidebar's own recomputed flat block order (the same
  // structure reorderSlides trusts) rather than something rebuilt from scratch
  // here. The previous implementation rebuilt slide order from segments derived
  // from the *current* slide order — since that segment shape (which "slot" each
  // round occupies relative to general-slide runs like winner-reveal) never
  // changes, dragging a round past a general slide silently no-opped: the round
  // order (`rounds` array) updated, but its actual slides never moved. Trusting
  // the caller's full slide order (already correct for the empty-round case too,
  // since an empty round contributes no slides either way) fixes this by
  // construction instead of reconstructing it from a fixed segment shape.
  async function reorderRounds(orderedRoundIds, orderedSlideIds) {
    if (!show) return
    const newRounds = orderedRoundIds
      .map(id => show.rounds.find(r => r.id === id))
      .filter(Boolean)
    const newSlides = renumberRoundQuestions(
      orderedSlideIds
        .map((id, index) => {
          const slide = show.slides.find(s => s.id === id)
          return slide ? { ...slide, order: index } : null
        })
        .filter(Boolean)
    )
    setShow(prev => ({ ...prev, rounds: newRounds, slides: newSlides }))
    // Same write-ordering chain as addSiblingSlides — see the comment there.
    const run = slidesSaveChainRef.current.then(() => updateShowRow(show.id, { rounds: newRounds, slides: newSlides }))
    slidesSaveChainRef.current = run.catch(() => {})
    await run
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
    // Caught by Opus review 2026-08-19, ahead of adding clipboard-paste
    // upload support: a pasted image's File can arrive nameless or without
    // an extension (varies by browser/OS), and file.name.split('.').pop()
    // on that gave '' — a storage path ending in a bare '.', which uploaded
    // fine but then MediaUpload.jsx's URL-extension regex couldn't classify
    // it as an image. Fall back to the file's real MIME type.
    const nameExt = file.name?.includes('.') ? file.name.split('.').pop().toLowerCase() : ''
    const MIME_EXT = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
      'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a', 'audio/ogg': 'ogg',
    }
    const ext = nameExt || MIME_EXT[file.type] || 'bin'
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
    return listHostPhotos(show?.id)
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
    // Same guard as the Prev-key handler below: never regress introDone to
    // false on a wager/matching slide that's already locked — jumping away
    // from an in-progress locked question and back to it (Go Live's "jump
    // to a slide" picker, reachable after exiting Live Mode) would otherwise
    // blank every phone back to the teaser screen with no way to submit.
    const wouldRegressLockedQuestion = introDone === false &&
      (slide.data?.wagerTiersLocked || slide.data?.wagerGuessesLocked || slide.data?.matchingLocked)
    if (introDone !== undefined && slide.data?.isShiny && !wouldRegressLockedQuestion) {
      if (!!slide.data.introDone !== introDone) {
        patch.introDone = introDone
      }
      // Fresh entry always restarts the closing-beat cycle too (see
      // nextSlide's outroShown handling below) — a stale true from a
      // previous visit would otherwise skip straight past the closing
      // title card next time this slide's last part is reached. This must
      // NOT be nested inside the introDone-changed check above: a second
      // fresh entry (e.g. rehearsal, then go-live for real) can arrive with
      // introDone already false, which used to skip this reset entirely and
      // leave outroShown stuck true — question never displayed, only the
      // title card, no matter how many times Next was pressed.
      if (slide.data?.outroShown) patch.outroShown = false
    }
    // Fresh entry always re-arms invoke-gated audio too — a stale `invoked:
    // true` from an earlier rehearsal/visit would otherwise skip straight
    // past the silent hold and autoplay again on this new entry.
    if (slide.data?.walkoutSong?.trigger === 'invoke' && slide.data.walkoutSong.invoked) {
      patch.walkoutSong = { ...slide.data.walkoutSong, invoked: false }
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

  // Manual "Sync archive" button in BuildMode — lets a host force an archive
  // pass mid-build without waiting for goLive. Same non-blocking failure
  // surfacing as the goLive/goLiveFrom call sites.
  async function syncArchive() {
    if (!show) return
    const ok = await archiveShow(show)
    trackWrite(Promise.resolve({ error: ok ? null : { message: 'archive failed' } }), setWriteError, 'Archive failed — some questions may not be saved to history')
    return ok
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
    const wroteShow = await updateShowRow(show.id, {
      slides: newSlides,
      is_live: true,
      current_slide_index: 0,
      current_slide_id: null,
      updated_at: now,
    })
    // Best-effort, non-blocking — don't hold up the live transition on it, and
    // don't let a successful archive clear a real shows-write failure toast.
    if (wroteShow) {
      trackWrite(
        archiveShow({ id: show.id, title: show.title, date: show.date, rounds: show.rounds, slides: newSlides }),
        setWriteError,
        'Archive failed — some questions may not be saved to history'
      )
    }
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
      showState: { ...s.showState, isLive: true, currentSlideIndex: target, currentSlideId: slide?.id ?? null },
    }))
    const wroteShow = await updateShowRow(show.id, {
      slides: newSlides,
      is_live: true,
      current_slide_index: target,
      current_slide_id: slide?.id ?? null,
      updated_at: now,
    })
    // Best-effort, non-blocking — don't hold up the live transition on it, and
    // don't let a successful archive clear a real shows-write failure toast.
    if (wroteShow) {
      trackWrite(
        archiveShow({ id: show.id, title: show.title, date: show.date, rounds: show.rounds, slides: newSlides }),
        setWriteError,
        'Archive failed — some questions may not be saved to history'
      )
    }
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
      let newSlides = withEntryState(bakedSlides, bakedSlides.find(s => s.id === targetSlide.id) ?? targetSlide, { currentPart: 0, introDone: false })
      // Invoke-gated audio (pre-show's walkout song) on the revealed slide:
      // this reveal press IS the first real Next press of the show, and per
      // design ("fires the walkout song later, not the instant Go Live lands
      // on it") that's the press meant to fire it. Without this, the check
      // below never runs on this branch (it returns first) — the host would
      // need a second, visually-identical Next press with no on-screen sign
      // the first one did anything.
      const revealed = newSlides.find(s => s.id === targetSlide.id)
      if (revealed?.data?.walkoutSong?.trigger === 'invoke' && revealed.data.walkoutSong.videoId && !revealed.data.walkoutSong.invoked) {
        newSlides = newSlides.map(s =>
          s.id === targetSlide.id ? { ...s, data: { ...s.data, walkoutSong: { ...s.data.walkoutSong, invoked: true } } } : s
        )
      }
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

    // Invoke-gated audio (e.g. pre-show's walkout song, "Hold until triggered"
    // checked): held silent on mount, started by the host's next explicit
    // Next/Stream-Deck press instead — same slide, same index, just flips
    // `invoked`. Ben: the QR screen sits up from doors-open until a
    // Stream-Deck press fires the walkout song later, not the instant Go
    // Live lands on it. A second Next while already playing just advances
    // normally (host's own call to cut it short).
    if (data?.walkoutSong?.trigger === 'invoke' && data.walkoutSong.videoId && !data.walkoutSong.invoked) {
      const newSlides = show.slides.map(s =>
        s.id === curSlide.id ? { ...s, data: { ...s.data, walkoutSong: { ...s.data.walkoutSong, invoked: true } } } : s
      )
      setShow(s => ({ ...s, slides: newSlides }))
      await updateShowRow(show.id, { slides: newSlides })
      return
    }

    // Reveal the intro's content before doing anything else. Guarded on
    // !outroShown too (see the closing-beat branch below) — without it,
    // the Next press that's supposed to land on the closing title card
    // would immediately re-reveal the last part's content instead, since
    // this check alone can't tell "never opened yet" from "just closed."
    if (data?.isShiny && !data.introDone && !data.outroShown) {
      const newSlides = show.slides.map(s =>
        s.id === curSlide.id ? { ...s, data: { ...s.data, introDone: true } } : s
      )
      setShow(s => ({ ...s, slides: newSlides, showState: { ...s.showState, answerReveal: false } }))
      await updateShowRow(show.id, { slides: newSlides, answer_reveal: false })
      return
    }

    // Step through this slide's parts before moving to the next slide.
    const parts = data?.parts
    const isMultiPart = Array.isArray(parts) && parts.length > 1
    if (isMultiPart) {
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
    // Closing beat (Ben, 2026-08-17: "then back down to the shiny title
    // screen, which i then advance to [the next question]"): one more Next
    // pans back down to the title card instead of jumping straight to the
    // next slide — outroShown marks that this already happened, so the NEXT
    // Next press (introDone false again, but outroShown true) skips the
    // re-reveal branch above and actually moves on. Reset to false whenever
    // this slide is entered fresh (withEntryState), so revisiting always
    // restarts the cycle.
    //
    // 2026-08-18, Ben: "pan down is always associated with pan up — if up
    // happens, down must happen eventually." Every isShiny slide pans UP on
    // its own (QuestionSlide's intro→content swap, keyed off introDone) —
    // so by that rule every one of them owes a pan DOWN too, once its
    // content is actually done, not just multi-part series (which is all
    // this used to cover). "Done" varies by type:
    //   - multi-part series: the LAST part (isMultiPart, handled above —
    //     any earlier part returns before reaching here)
    //   - matching / wager: once fully scored (matchingRevealed /
    //     wagerGuessesLocked) — NOT merely locked. Both have a locked-but-
    //     still-scoring window (matching's "Retry Scoring" state, wager's
    //     collecting-guesses-after-tiers-locked state) that must never
    //     regress — same guard withEntryState uses for its own jump-back
    //     case, and the reason isPending exists below.
    //   - everything else (a single-shot list/audio/video/image question,
    //     no parts, not lockable): done the moment its content has been
    //     shown at all, i.e. as soon as introDone is true.
    const isPending = (isMatchingShiny(data) && data.matchingLocked && !data.matchingRevealed) ||
                       (isWagerShiny(data) && data.wagerTiersLocked && !data.wagerGuessesLocked)
    // Disabled 2026-08-19 (Ben, day after this shipped: "shiny intros were
    // shown after the question as well") — SlideRenderer can't distinguish
    // "never shown" from "closing beat" (both read as introDone:false), so
    // flipping it back here replayed the FULL ~2.4s entrance choreography
    // (spin/land/gold-burst/photo-rocket) a second time instead of a quiet
    // pan-down, and one Next press doing that instead of just advancing
    // read as the intro firing unprompted. Block kept intact rather than
    // deleted — CLOSING_BEAT_ENABLED flips this back on if a quiet-variant
    // closing animation (ShinyIntroScreen isClosing prop) gets built later.
    if (CLOSING_BEAT_ENABLED && data?.isShiny && data.introDone && !data.outroShown && !isPending) {
      // Skip the pause when the next slide continues the same shiny series
      // — siblings only get one announce beat at the start (skipIntro
      // below); each one pausing on its own closing title card too would
      // break what's supposed to read as one continuous run. 2026-08-18:
      // this is exactly how 6 separate matching slides chained as one
      // series (isShinySeriesSibling) skip the pan-down between Q1-Q5 and
      // only actually pause after Q6, whose next slide isn't a sibling.
      const peekTarget = sorted[Math.min(cur + 1, sorted.length - 1)]
      const nextIsSeriesSibling = !!peekTarget && peekTarget.id !== curSlide.id && isShinySeriesSibling(curSlide, peekTarget)
      if (!nextIsSeriesSibling) {
        const newSlides = show.slides.map(s =>
          s.id === curSlide.id ? { ...s, data: { ...s.data, introDone: false, outroShown: true } } : s
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
    // A run of separate sibling slides sharing one shiny series (e.g. an
    // image format where the host asked for N slides) already showed its
    // announce beat on the first slide of the run — skip it on the rest.
    const skipIntro = isShinySeriesSibling(curSlide, targetSlide)
    const newSlides = withEntryState(bakedSlides, bakedSlides.find(s => s.id === targetSlide?.id) ?? targetSlide, { currentPart: 0, introDone: skipIntro })
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

    // Undo the closing beat (see nextSlide's outroShown branch) before
    // anything else — without this, the generic parts-backward branch right
    // below would silently decrement currentPart while still on the closing
    // title card (introDone false there blocks any content from showing
    // regardless of currentPart), so Prev would look like it did nothing
    // while actually desyncing which part you'd land back on.
    if (data?.isShiny && data.outroShown) {
      const newSlides = show.slides.map(s =>
        s.id === curSlide.id ? { ...s, data: { ...s.data, introDone: true, outroShown: false } } : s
      )
      setShow(s => ({ ...s, slides: newSlides, showState: { ...s.showState, answerReveal: false } }))
      await updateShowRow(show.id, { slides: newSlides, answer_reveal: false })
      return
    }

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

    // Back to the intro beat before moving to the previous slide — but NOT
    // for a wager/matching slide that's already locked. Regressing introDone
    // there blanks every phone back to "Next question incoming…" (Join.jsx
    // gates the WagerBoard/MatchingBoard mount on introDone, so the board
    // unmounts entirely) with no data loss but no way to submit until the
    // host presses Next again — and Prev is one keystroke/Stream Deck press
    // away, the single most likely accidental trigger of this regression.
    // ALSO not for a non-lead shiny-series sibling (bug fixed 2026-08-17,
    // caught by review, not live): nextSlide() skips resetting introDone
    // for these — they never show their own intro card, they share the
    // lead slide's. This branch didn't know that, so one Prev on Q4/Q5/Q6
    // played the full spin-in title card it was never supposed to have,
    // and it took a SECOND Prev to actually move back a slide.
    const prevInOrder = sorted[cur - 1]
    const isAutoSkippedSibling = prevInOrder && isShinySeriesSibling(prevInOrder, curSlide)
    if (data?.isShiny && data.introDone && !isAutoSkippedSibling && !(data.wagerTiersLocked || data.wagerGuessesLocked || data.matchingLocked)) {
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

  async function setDevMode(enabled) {
    if (!show) return
    setShow(s => ({ ...s, showState: { ...s.showState, devMode: enabled } }))
    await updateShowRow(show.id, { dev_mode: enabled })
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
    const result = await supabase.from('team_scores').upsert(
      { id: `sc_${teamId}_${roundIndex}`, show_id: show.id, team_id: teamId, round_index: roundIndex, score, updated_at: new Date().toISOString() },
      { onConflict: 'team_id,round_index' }
    )
    if (result.error) console.error('[useShow] updateRoundScore failed:', result.error)
    return trackWrite(Promise.resolve(result), setWriteError)
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
        rounds: cols.map(c => roundScoreTotal(t.scores?.[c.key])),
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
    flushSlides,
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
    syncArchive,
    nextSlide,
    prevSlide,
    setScoreboardVisible,
    setAnswerReveal,
    setScoresRevealed,
    setDevMode,
    updateRoundScore,
    saveResults,
  }
}
