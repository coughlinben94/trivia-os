import { useEffect, useRef, useState } from 'react'
import { analyzeAudioGain } from '../../lib/audioNormalize.js'
import { JUKEBOX_LIBRARIES } from '../../lib/jukeboxLibraries.js'
import { fetchJukeboxLibraries } from '../../lib/jukeboxSupabase.js'
import MediaUpload from './MediaUpload.jsx'
import YoutubeClipEditor from './YoutubeClipEditor.jsx'
import HostPhotoLibrary from './HostPhotoLibrary.jsx'
import FormatLibrary from './FormatLibrary.jsx'
import SlideCanvasEditor from './SlideCanvasEditor.jsx'
import { useTheme } from '../shared/ThemeProvider.jsx'
import { useShinyFormats } from '../../hooks/useShinyFormats.js'

export default function SlideEditor({ slide, show, onUpdateSlide, onDeleteSlide, uploadMedia, getHostPhotos }) {
  const { theme } = useTheme()
  const [data, setData] = useState(slide.data)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [jukeboxLibs, setJukeboxLibs] = useState(JUKEBOX_LIBRARIES)
  const saveTimer = useRef(null)
  // Holds the latest scheduled { id, updates } so flushSave() can persist it
  // immediately (on slide-switch / overlay edit-mode toggle-off / unmount)
  // instead of waiting out the debounce and risking a lost edit.
  const pendingSaveRef = useRef(null)

  useEffect(() => {
    let alive = true
    fetchJukeboxLibraries().then(libs => { if (alive && libs) setJukeboxLibs(libs) })
    return () => { alive = false }
  }, [])

  // Sync local data when the selected slide changes. Flush first so any pending
  // edit to the slide we're leaving is persisted before its data is swapped out
  // (scheduleSave captured that slide's id, so the write still targets it).
  useEffect(() => {
    flushSave()
    setData(slide.data); setConfirmingDelete(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id])

  // questionLabel/questionNumber are auto-recomputed by renumberRoundQuestions
  // (useShow.js) whenever this round's question order or bonus-status changes
  // — including as a side effect of an edit made right here (e.g. toggling
  // Bonus on this very slide). That recompute lands on the incoming `slide`
  // prop only after the debounced save round-trips, so without this, the
  // editor's own local copy of these two fields goes stale while the slide
  // stays open. Resyncs only these two fields — never the rest of `data`,
  // which would clobber any other in-progress unsaved local edit.
  useEffect(() => {
    if (slide.data?.questionLabel === data.questionLabel && slide.data?.questionNumber === data.questionNumber) return
    setData(d => ({ ...d, questionLabel: slide.data?.questionLabel, questionNumber: slide.data?.questionNumber }))
  }, [slide.data?.questionLabel, slide.data?.questionNumber])

  // Flush any pending debounced save on unmount so a last-second edit is never
  // dropped when the editor closes.
  useEffect(() => {
    return () => { flushSave() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function change(key, value) {
    const next = { ...data, [key]: value }
    setData(next)
    scheduleSave({ data: next })
  }

  function changeNested(key, index, subKey, value) {
    const arr = [...(data[key] || [])]
    arr[index] = { ...arr[index], [subKey]: value }
    const next = { ...data, [key]: arr }
    setData(next)
    scheduleSave({ data: next })
  }

  function scheduleSave(updates) {
    pendingSaveRef.current = { id: slide.id, updates }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      pendingSaveRef.current = null
      onUpdateSlide(slide.id, updates)
    }, 600)
  }

  // Write the pending edit right now instead of waiting out the debounce.
  function flushSave() {
    if (!saveTimer.current) return
    clearTimeout(saveTimer.current); saveTimer.current = null
    const p = pendingSaveRef.current; pendingSaveRef.current = null
    if (p) onUpdateSlide(p.id, p.updates)
  }

  function batchChange(updates) {
    const next = { ...data, ...updates }
    setData(next)
    scheduleSave({ data: next })
  }

  // Media upload helpers
  async function handleMediaUpload(file) {
    const result = await uploadMedia(file)
    if (result?.url) {
      const updates = { mediaUrl: result.url, mediaType: result.type }
      if (file.type.startsWith('audio/')) {
        updates.audioGainDb = await analyzeAudioGain(file)
      }
      batchChange(updates)
    }
    return result
  }

  async function handleStageUpload(index, file) {
    const result = await uploadMedia(file)
    if (result?.url) changeNested('stages', index, 'mediaUrl', result.url)
    return result
  }

  // Questions in same round (for grading-break back link)
  const roundSlides = show.slides.filter(s => s.roundId === slide.roundId && s.type === 'question')

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT: slide canvas (scaled live preview + region & overlay editing) ── */}
        <div className="flex-1 min-w-0">
          <SlideCanvasEditor
            slide={slide}
            show={show}
            theme={theme}
            data={data}
            setData={setData}
            scheduleSave={scheduleSave}
            change={change}
            flushSave={flushSave}
            uploadMedia={uploadMedia}
            getHostPhotos={getHostPhotos}
          />
        </div>

        {/* ── RIGHT: editing sidebar ── */}
        <div className="w-72 bg-white border-l border-gray-200 flex flex-col overflow-hidden shrink-0">
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Slide Content</p>
              {slide.type === 'title' && <TitleEditor data={data} onChange={change} />}
              {(slide.type === 'round-intro' || slide.type === 'swing-round-intro') && (
                <RoundIntroEditor data={data} onChange={change} isSwing={slide.type === 'swing-round-intro'}
                  uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} />
              )}
              {slide.type === 'question' && (
                // Keyed by slide.id so per-slot local UI state (which audio
                // slots are in "YouTube" mode, the format-library modal, etc.)
                // resets when switching to a different question slide instead
                // of leaking across slides that share this same component type.
                <QuestionEditor key={slide.id} data={data} onChange={change} onBatchChange={batchChange} uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} />
              )}
              {slide.type === 'grading-break' && (
                <GradingBreakEditor data={data} onChange={change} roundSlides={roundSlides}
                  uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} jukeboxLibs={jukeboxLibs} />
              )}
              {slide.type === 'scoreboard-reveal' && (
                <ScoreboardRevealEditor data={data} onChange={change} show={show} />
              )}
              {slide.type === 'custom' && (
                <CustomEditor data={data} onChange={change} onMediaUpload={handleMediaUpload} />
              )}
              {slide.type === 'pixelate-series' && (
                <PixelateSeriesEditor data={data} onChange={change} onStageUpload={handleStageUpload} />
              )}
              {slide.type === 'multi-question' && (
                <MultiQuestionEditor data={data} onChange={change} setData={setData} scheduleSave={scheduleSave} />
              )}
              {slide.type === 'pyl-reveal' && (
                <PylRevealEditor data={data} onChange={change} setData={setData} scheduleSave={scheduleSave} />
              )}
              {slide.type === 'state-of-union' && (
                <StateOfUnionEditor data={data} onChange={change} getHostPhotos={getHostPhotos} uploadMedia={uploadMedia} />
              )}
              {slide.type === 'team-picker' && (
                <TeamPickerEditor data={data} onChange={change} />
              )}
              {slide.type === 'grid' && (
                <GridEditor data={data} onChange={change} setData={setData} scheduleSave={scheduleSave} onMediaUpload={handleMediaUpload}
                  uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} />
              )}
              {slide.type === 'winner-reveal' && (
                <WinnerRevealEditor data={data} onChange={change} />
              )}
            </div>
          </div>

          {/* Bottom: transition + delete */}
          <div className="shrink-0 px-3 py-3 border-t border-gray-200 space-y-2">
            {!data.isShiny && (
              <select
                value={data.transition ?? ''}
                onChange={e => change('transition', e.target.value === '' ? null : e.target.value)}
                className="w-full text-xs bg-gray-50 text-gray-700 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
              >
                <option value="">Default transition</option>
                <option value="random">✦ Random</option>
                <optgroup label="Fade from back">
                  <option value="dissolve">Dissolve</option>
                  <option value="emerge">Emerge</option>
                  <option value="zoom">Zoom</option>
                  <option value="punch">Punch</option>
                </optgroup>
                <optgroup label="Down from top">
                  <option value="drop">Drop</option>
                  <option value="descend">Descend</option>
                </optgroup>
                <optgroup label="Compound">
                  <option value="sink">Sink</option>
                </optgroup>
                <optgroup label="Push from front">
                  <option value="settle">Settle</option>
                  <option value="loom">Loom</option>
                </optgroup>
                <optgroup label="Construct">
                  <option value="assemble">Assemble</option>
                </optgroup>
              </select>
            )}
            {confirmingDelete ? (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-red-400">Delete this slide?</span>
                <div className="flex gap-3">
                  <button onClick={() => onDeleteSlide(slide.id)} className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors">Yes</button>
                  <button onClick={() => setConfirmingDelete(false)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">No</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="w-full text-xs text-red-500/50 hover:text-red-400 transition-colors py-0.5"
              >
                Delete slide
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Field primitives ────────────────────────────────────────────────────────

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500">
        <span className="block mb-1.5">{label}</span>
        {children}
      </label>
      {hint && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, className = '' }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-baynes-forest ${className}`}
    />
  )
}

function TextArea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-baynes-forest leading-relaxed"
    />
  )
}

function NumberInput({ value, onChange, min = 1, max, placeholder }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      min={min}
      max={max}
      placeholder={placeholder}
      className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-baynes-forest"
    />
  )
}

function Toggle({ label, checked, onChange, description }) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex w-10 h-5.5 shrink-0 rounded-full transition-colors mt-0.5 ${
          checked ? 'bg-baynes-forest' : 'bg-gray-200'
        }`}
        style={{ height: '22px', width: '40px' }}
      >
        <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-[18px]' : ''}`} />
      </button>
      <div>
        <p className="text-sm text-gray-800 font-medium leading-none">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
    </div>
  )
}

function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-[11px] font-medium text-gray-400">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  )
}

// ─── Slide type editors ──────────────────────────────────────────────────────

function TitleEditor({ data, onChange }) {
  return (
    <>
      <Field label="Title"><TextInput value={data.title} onChange={v => onChange('title', v)} placeholder="Baynes Apple Valley" /></Field>
      <Field label="Subtitle"><TextInput value={data.subtitle} onChange={v => onChange('subtitle', v)} placeholder="Trivia Night" /></Field>
    </>
  )
}

function RoundIntroEditor({ data, onChange, isSwing, uploadMedia, getHostPhotos }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Round Number"><NumberInput value={data.roundNumber} onChange={v => onChange('roundNumber', v)} /></Field>
        <Field label="Round Title"><TextInput value={data.roundTitle} onChange={v => onChange('roundTitle', v)} placeholder="Round 1" /></Field>
      </div>
      <Field label="Subtitle" hint='e.g. "Fight!" or "It did not went well."'>
        <TextInput value={data.subtitle} onChange={v => onChange('subtitle', v)} placeholder="Optional catchphrase" />
      </Field>
      {isSwing && (
        <Field label="Theme Description" hint="Describe the special treatment for this round">
          <TextInput value={data.themeDescription} onChange={v => onChange('themeDescription', v)} placeholder="Swing / theme round details…" />
        </Field>
      )}
      <Divider label="Ben Photo" />
      <HostPhotoLibrary
        getHostPhotos={getHostPhotos}
        uploadMedia={uploadMedia}
        currentPhotoUrl={data.hostPhotoUrl}
        onSelectPhoto={url => onChange('hostPhotoUrl', url)}
      />
    </>
  )
}

function QuestionEditor({ data, onChange, onBatchChange, uploadMedia, getHostPhotos }) {
  const [showFormatLibrary, setShowFormatLibrary] = useState(false)
  const { formats: shinyFormats, loading: shinyFormatsLoading } = useShinyFormats()

  const mode = data.questionMode
  const schema = data.shinyInputSchema ?? {}
  const slots = typeof schema.slots === 'number' ? schema.slots : 0
  const mediaSlots = data.mediaSlots ?? []
  const isSeriesMode = !!data.isSeries && Array.isArray(data.parts)

  // Per-slot "Upload file" vs "YouTube URL" toggle for audio slots — not
  // persisted to `data`, just derived once from whatever's already there
  // (a slot already shaped like {type:'youtube',...} opens in YouTube mode).
  // This component is remounted (via `key={slide.id}` at the call site)
  // whenever the host switches slides, so this lazy init never goes stale.
  const [audioModes, setAudioModes] = useState(() => {
    const init = {}
    mediaSlots.forEach((slot, i) => { if (slot?.type === 'youtube') init[i] = 'youtube' })
    return init
  })

  async function uploadSlot(i, file) {
    const result = await uploadMedia(file)
    if (result?.url) {
      const next = [...mediaSlots]
      while (next.length <= i) next.push({})
      next[i] = { url: result.url, type: result.type }
      onChange('mediaSlots', next)
    }
  }

  function removeSlot(i) {
    const next = [...mediaSlots]
    if (next[i]) next[i] = { url: null, type: null }
    onChange('mediaSlots', next)
  }

  // Writes a YouTube clip directly into mediaSlots[i] — no upload involved,
  // just metadata (mirrors uploadSlot/removeSlot's onChange('mediaSlots', ...) shape).
  function setYoutubeSlot(i, clip) {
    const next = [...mediaSlots]
    while (next.length <= i) next.push({})
    next[i] = clip ? { type: 'youtube', videoId: clip.videoId, start: clip.start, end: clip.end } : { url: null, type: null }
    onChange('mediaSlots', next)
  }

  // Toggling series mode migrates content between the top-level fields
  // (single-part shape) and data.parts (multi-part shape) so nothing typed
  // in gets lost when the host flips it.
  function toggleSeries(on) {
    if (on) {
      if (Array.isArray(data.parts) && data.parts.length > 0) {
        onChange('isSeries', true)
        return
      }
      onBatchChange({
        isSeries: true,
        seriesTheme: data.seriesTheme || data.shinyFormatName || '',
        parts: [{ label: '', text: data.text ?? '', answer: data.answer ?? '', mediaSlots: data.mediaSlots ?? [] }],
        currentPart: 0,
        // Clear the flat fields now that they live on the part, so the
        // "Shared Answer" field doesn't show a stale leftover value.
        text: undefined,
        answer: undefined,
        mediaSlots: undefined,
      })
    } else {
      const idx = data.currentPart ?? 0
      const p = data.parts?.[idx] ?? {}
      onBatchChange({
        isSeries: false,
        text: p.text ?? data.text ?? '',
        answer: p.answer ?? data.answer ?? '',
        mediaSlots: p.mediaSlots ?? data.mediaSlots ?? [],
        parts: undefined,
        currentPart: undefined,
      })
    }
  }

  function updatePart(i, nextPart) {
    const parts = [...(data.parts ?? [])]
    parts[i] = nextPart
    onChange('parts', parts)
  }

  function addPart() {
    const parts = [...(data.parts ?? []), { label: '', text: '', answer: '', mediaSlots: [] }]
    onBatchChange({ parts, currentPart: parts.length - 1 })
  }

  function removePart(i) {
    const parts = (data.parts ?? []).filter((_, idx) => idx !== i)
    const currentPart = Math.min(data.currentPart ?? 0, Math.max(parts.length - 1, 0))
    onBatchChange({ parts, currentPart })
  }

  async function uploadPartMedia(i, file) {
    const result = await uploadMedia(file)
    if (result?.url) {
      const part = data.parts[i]
      updatePart(i, { ...part, mediaSlots: [{ url: result.url, type: result.type }] })
    }
    return result
  }

  // ── Mode selector ──────────────────────────────────────────────────────
  if (!mode) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-500">What kind of question is this?</p>
        <div className="flex gap-3">
          <button
            onClick={() => onChange('questionMode', 'regular')}
            className="flex-1 flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-gray-200 hover:border-gray-400 transition-colors text-center"
          >
            <span className="text-2xl">📝</span>
            <span className="text-sm font-semibold text-gray-700">Regular</span>
            <span className="text-xs text-gray-400">Standard text question</span>
          </button>
          <button
            onClick={() => onChange('questionMode', 'shiny')}
            className="flex-1 flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-gray-200 hover:border-yellow-400 hover:bg-yellow-50 transition-colors text-center"
          >
            <span className="text-2xl">✨</span>
            <span className="text-sm font-semibold text-gray-700">Shiny</span>
            <span className="text-xs text-gray-400">Image, audio, video, list…</span>
          </button>
        </div>
      </div>
    )
  }

  // ── Regular mode ───────────────────────────────────────────────────────
  if (mode === 'regular') {
    return (
      <>
        <div className="flex gap-3 items-end">
          <Field label="Label" hint="Auto-numbered from this slide's position — reorder or add/delete questions to change it.">
            <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600 select-none">
              {data.questionLabel || '—'}
            </div>
          </Field>
          <label className="flex items-center gap-1.5 pb-2 cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={!!data.isBonus}
              onChange={e => onChange('isBonus', e.target.checked)}
              className="w-4 h-4 accent-baynes-forest"
            />
            <span className="text-xs font-medium text-gray-600">Bonus</span>
          </label>
        </div>
        <Field label="Question Text">
          <TextArea value={data.text} onChange={v => onChange('text', v)} placeholder="Write the full question here…" rows={4} />
        </Field>
        <Field label="Answer">
          <TextInput value={data.answer ?? ''} onChange={v => onChange('answer', v)} placeholder="The answer…" />
        </Field>
      </>
    )
  }

  // ── Shiny mode ─────────────────────────────────────────────────────────
  return (
    <>
      {/* No format assigned — edge case, show minimal picker */}
      {!data.shinyFormatId && (
        <button
          onClick={() => setShowFormatLibrary(true)}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <span>✨</span>
          <span className="text-sm">Choose Format from Library</span>
        </button>
      )}

      {/* Previewing — which beat the live canvas on the left shows.
          Every shiny question gets a standalone intro beat before its
          content, so this control exists whether or not it's a series. */}
      {data.shinyFormatId && (
        <>
          <Divider label="Previewing" />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onChange('introDone', false)}
              className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                !data.introDone
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-800'
              }`}
            >
              🎬 Intro
            </button>
            {isSeriesMode ? (
              data.parts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => onBatchChange({ introDone: true, currentPart: i })}
                  className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                    !!data.introDone && (data.currentPart ?? 0) === i
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {i + 1}{p.label ? ` · ${p.label}` : ''}
                </button>
              ))
            ) : (
              <button
                onClick={() => onChange('introDone', true)}
                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                  !!data.introDone
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-800'
                }`}
              >
                Content
              </button>
            )}
          </div>

          <Divider label="Intro Screen" />
          <Field label="Subtitle" hint='Optional — e.g. "Dog Edition" or "Bluegrass Cover"'>
            <TextInput value={data.introSubtitle ?? ''} onChange={v => onChange('introSubtitle', v)} placeholder="Optional subtitle…" />
          </Field>
          <HostPhotoLibrary
            getHostPhotos={getHostPhotos}
            uploadMedia={uploadMedia}
            currentPhotoUrl={data.hostPhotoUrl}
            onSelectPhoto={url => onChange('hostPhotoUrl', url)}
          />
        </>
      )}

      {data.shinyFormatId && !isSeriesMode && (
        <>
          {/* Image slots — side by side */}
          {schema.type === 'image' && slots > 0 && (
            <div className={slots > 1 ? 'grid grid-cols-2 gap-3' : ''}>
              {Array.from({ length: slots }).map((_, i) => (
                <MediaUpload
                  key={i}
                  accept="image"
                  label={schema.labels?.[i] ?? (slots > 1 ? `Image ${i + 1}` : 'Image')}
                  currentUrl={mediaSlots[i]?.url}
                  currentType={mediaSlots[i]?.type}
                  onUpload={file => uploadSlot(i, file)}
                  onRemove={() => removeSlot(i)}
                />
              ))}
            </div>
          )}

          {/* Audio slots — upload a file OR source from a YouTube clip */}
          {schema.type === 'audio' && slots > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {slots === 1 ? 'Audio' : `Audio (${slots} tracks)`}
              </label>
              <div className="space-y-3">
                {Array.from({ length: slots }).map((_, i) => {
                  const slotMode = audioModes[i] ?? 'upload'
                  return (
                    <div key={i} className="flex flex-col gap-2">
                      {slots > 1 && (
                        <TextInput
                          value={data[`trackLabel_${i}`] ?? ''}
                          onChange={v => onChange(`trackLabel_${i}`, v)}
                          placeholder={`Track ${i + 1} title…`}
                        />
                      )}
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAudioModes(m => ({ ...m, [i]: 'upload' }))}
                          className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                            slotMode === 'upload'
                              ? 'bg-blue-500 border-blue-500 text-white'
                              : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          📁 Upload
                        </button>
                        <button
                          type="button"
                          onClick={() => setAudioModes(m => ({ ...m, [i]: 'youtube' }))}
                          className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                            slotMode === 'youtube'
                              ? 'bg-blue-500 border-blue-500 text-white'
                              : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          ▶️ YouTube
                        </button>
                      </div>
                      {slotMode === 'youtube' ? (
                        <YoutubeClipEditor
                          value={mediaSlots[i]?.type === 'youtube' ? mediaSlots[i] : null}
                          onChange={clip => setYoutubeSlot(i, clip)}
                        />
                      ) : (
                        <MediaUpload
                          accept="audio"
                          label={slots > 1 ? `Audio ${i + 1}` : 'Audio File'}
                          currentUrl={mediaSlots[i]?.url}
                          currentType={mediaSlots[i]?.type}
                          onUpload={file => uploadSlot(i, file)}
                          onRemove={() => removeSlot(i)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Video slots — YouTube clip only, no file upload */}
          {schema.type === 'video' && slots > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {slots === 1 ? 'Video (YouTube)' : `Videos — YouTube (${slots} slots)`}
              </label>
              <div className="space-y-3">
                {Array.from({ length: slots }).map((_, i) => (
                  <YoutubeClipEditor
                    key={i}
                    value={mediaSlots[i]?.type === 'youtube' ? mediaSlots[i] : null}
                    onChange={clip => setYoutubeSlot(i, clip)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* List builder */}
          {schema.type === 'list' && (
            <ShinyListBuilder
              items={data.listItems ?? [{ text: '', points: 0 }]}
              hasPoints={!!schema.hasPoints}
              onChange={items => onChange('listItems', items)}
            />
          )}

          {/* Question text — not for list type */}
          {schema.type !== 'list' && (
            <Field label="Question Text">
              <TextArea value={data.text} onChange={v => onChange('text', v)} placeholder="Write the question here…" rows={3} />
            </Field>
          )}

          {/* Answer — all shiny types */}
          <Field label="Answer">
            <TextInput value={data.answer ?? ''} onChange={v => onChange('answer', v)} placeholder="The answer…" />
          </Field>
        </>
      )}

      {/* Series settings — only if schema.seriesEnabled (multi-slot formats
          auto-enter series mode from selection and don't offer a toggle) */}
      {data.shinyFormatId && schema.seriesEnabled && (
        <>
          <Divider label="Series" />
          <Toggle
            label="Part of a Series"
            checked={!!data.isSeries}
            onChange={toggleSeries}
            description="Groups variations (Villain Laughs, Monster Roars…) under one shared question"
          />
        </>
      )}

      {/* Parts editor — the merged series content: one question, N variations */}
      {isSeriesMode && (
        <>
          <Field label="Series Theme" hint='Shared across every part, e.g. "Hear Me Roar"'>
            <TextInput value={data.seriesTheme} onChange={v => onChange('seriesTheme', v)} placeholder="Hear Me Roar" />
          </Field>
          <Field label="Shared Answer (optional)" hint="Leave blank — each part below gets its own answer. Only fill this in if every part shares ONE answer.">
            <TextInput value={data.answer ?? ''} onChange={v => onChange('answer', v)} placeholder="Leave blank for per-part answers" />
          </Field>

          <Divider label="Previewing part" />
          <div className="flex flex-wrap gap-1.5">
            {data.parts.map((p, i) => (
              <button
                key={i}
                onClick={() => onChange('currentPart', i)}
                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                  (data.currentPart ?? 0) === i
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-800'
                }`}
              >
                {i + 1}{p.label ? ` · ${p.label}` : ''}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {data.parts.map((part, i) => (
              <ShinyPartEditor
                key={i}
                part={part}
                index={i}
                schemaType={schema.type}
                onChange={next => updatePart(i, next)}
                onRemove={() => removePart(i)}
                onUploadMedia={file => uploadPartMedia(i, file)}
                canRemove={data.parts.length > 1}
              />
            ))}
          </div>
          <button
            onClick={addPart}
            className="text-xs text-baynes-forest hover:text-green-800 font-medium transition-colors"
          >
            + Add part
          </button>
        </>
      )}

      {showFormatLibrary && (
        <FormatLibrary
          formats={shinyFormats}
          loading={shinyFormatsLoading}
          onClose={() => setShowFormatLibrary(false)}
          onSelectFormat={fmt => {
            const totalSlots = fmt.input_schema?.slots ?? 1
            if (totalSlots > 1) {
              // Multi-slot format (e.g. 4 images that are secretly the same
              // answer) — one slide, N parts, host fills each in below.
              const singleSchema = { ...fmt.input_schema, slots: 1 }
              onBatchChange({
                shinyFormatId: fmt.id,
                shinyFormatName: fmt.name,
                shinyFormatIcon: fmt.icon,
                shinyInputSchema: singleSchema,
                shinyType: fmt.input_schema.type,
                isSeries: true,
                seriesTheme: fmt.name,
                currentPart: 0,
                parts: Array.from({ length: totalSlots }, () => ({ label: '', text: '', answer: '', mediaSlots: [] })),
              })
            } else {
              onBatchChange({
                shinyFormatId: fmt.id,
                shinyFormatName: fmt.name,
                shinyFormatIcon: fmt.icon,
                shinyInputSchema: fmt.input_schema,
                shinyType: fmt.input_schema?.type ?? null,
              })
            }
            setShowFormatLibrary(false)
          }}
        />
      )}
    </>
  )
}

function ShinyPartEditor({ part, index, schemaType, onChange, onRemove, onUploadMedia, canRemove }) {
  const media = part.mediaSlots?.[0]
  // Same upload-vs-YouTube toggle as the top-level Audio slots block, scoped
  // to this part. Derived once from whatever's already on the part; this
  // component is remounted whenever the parent QuestionEditor remounts
  // (slide switch), so the lazy init never goes stale.
  const [audioMode, setAudioMode] = useState(media?.type === 'youtube' ? 'youtube' : 'upload')

  function setPartYoutube(clip) {
    onChange({ ...part, mediaSlots: clip ? [{ type: 'youtube', videoId: clip.videoId, start: clip.start, end: clip.end }] : [] })
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Part {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="text-xs text-gray-300 hover:text-red-500 transition-colors">✕</button>
        )}
      </div>
      <Field label="Subtitle" hint='e.g. "Villain Laughs"'>
        <TextInput value={part.label} onChange={v => onChange({ ...part, label: v })} placeholder="Optional label for this part" />
      </Field>
      {schemaType === 'image' && (
        <MediaUpload
          accept="image"
          label="Image"
          currentUrl={media?.url}
          currentType={media?.type}
          onUpload={onUploadMedia}
          onRemove={() => onChange({ ...part, mediaSlots: [] })}
        />
      )}
      {schemaType === 'audio' && (
        <>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setAudioMode('upload')}
              className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                audioMode === 'upload'
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-800'
              }`}
            >
              📁 Upload
            </button>
            <button
              type="button"
              onClick={() => setAudioMode('youtube')}
              className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                audioMode === 'youtube'
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-800'
              }`}
            >
              ▶️ YouTube
            </button>
          </div>
          {audioMode === 'youtube' ? (
            <YoutubeClipEditor
              value={media?.type === 'youtube' ? media : null}
              onChange={setPartYoutube}
            />
          ) : (
            <MediaUpload
              accept="audio"
              label="Audio File"
              currentUrl={media?.url}
              currentType={media?.type}
              onUpload={onUploadMedia}
              onRemove={() => onChange({ ...part, mediaSlots: [] })}
            />
          )}
        </>
      )}
      {schemaType === 'video' && (
        <YoutubeClipEditor
          value={media?.type === 'youtube' ? media : null}
          onChange={setPartYoutube}
        />
      )}
      {schemaType !== 'list' && (
        <Field label="Question Text">
          <TextArea value={part.text} onChange={v => onChange({ ...part, text: v })} placeholder="Write the question here…" rows={2} />
        </Field>
      )}
      <Field label="Answer">
        <TextInput value={part.answer ?? ''} onChange={v => onChange({ ...part, answer: v })} placeholder="The answer…" />
      </Field>
    </div>
  )
}

function ShinyListBuilder({ items, hasPoints, onChange }) {
  function updateItem(i, key, value) {
    onChange(items.map((it, idx) => idx === i ? { ...it, [key]: value } : it))
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="block text-xs font-medium text-gray-700 mb-1.5">List Items</label>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-center">
          <span className="text-xs text-gray-400 w-5 shrink-0 text-right">{i + 1}.</span>
          <input
            value={item.text}
            onChange={e => updateItem(i, 'text', e.target.value)}
            placeholder={`Item ${i + 1}…`}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-baynes-forest"
          />
          {hasPoints && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-gray-400">+</span>
              <input
                type="number"
                value={item.points ?? 0}
                onChange={e => updateItem(i, 'points', Number(e.target.value))}
                min={0}
                className="w-14 border border-gray-200 rounded px-2 py-2 text-sm text-center text-gray-900 focus:outline-none focus:ring-1 focus:ring-baynes-forest"
              />
            </div>
          )}
          {items.length > 1 && (
            <button
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="text-xs text-gray-300 hover:text-red-400 shrink-0"
            >✕</button>
          )}
        </div>
      ))}
      <button
        onClick={() => onChange([...items, { text: '', points: 0 }])}
        className="text-xs text-baynes-forest hover:text-green-800 font-medium text-left"
      >
        + Add item
      </button>
    </div>
  )
}

function GradingBreakEditor({ data, onChange, roundSlides, uploadMedia, getHostPhotos, jukeboxLibs }) {
  return (
    <>
      <Field label="Message">
        <TextArea
          value={data.message}
          onChange={v => onChange('message', v)}
          placeholder="Now, please sit back, relax, and enjoy each other's company as Ben grades papers 😊"
          rows={4}
        />
      </Field>

      <Field label="Between-rounds music" hint="Jukebox library to auto-play at this break">
        <select
          value={data.jukeboxLib ?? 'random'}
          onChange={e => onChange('jukeboxLib', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-baynes-forest"
        >
          <option value="random">🎲 Random</option>
          {jukeboxLibs.map(lib => (
            <option key={lib.id} value={lib.id}>{lib.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Back Link" hint="Jumps to this slide when host taps ↩ Back">
        <select
          value={data.backLinkSlideId ?? ''}
          onChange={e => onChange('backLinkSlideId', e.target.value || null)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-baynes-forest"
        >
          <option value="">No back link</option>
          {roundSlides.map(s => (
            <option key={s.id} value={s.id}>
              {s.data.questionLabel || `Q${s.data.questionNumber}`} — {s.data.text?.slice(0, 50) || 'Question'}
            </option>
          ))}
        </select>
      </Field>

      <Divider label="Ben Photo" />

      <HostPhotoLibrary
        getHostPhotos={getHostPhotos}
        uploadMedia={uploadMedia}
        currentPhotoUrl={data.hostPhotoUrl}
        onSelectPhoto={url => onChange('hostPhotoUrl', url)}
      />
    </>
  )
}

function WinnerRevealEditor({ data, onChange }) {
  return (
    <div className="flex flex-col gap-3 py-2">
      <p className="text-sm text-gray-500 leading-relaxed">
        This slide plays a drum roll, then reveals the winning team with confetti.
      </p>
      <p className="text-xs text-gray-400 leading-relaxed">
        The winner is calculated live from team scores at the time the slide appears. No configuration needed — just place it last in your show order.
      </p>
    </div>
  )
}

function StateOfUnionEditor({ data, onChange, getHostPhotos, uploadMedia }) {
  return (
    <>
      <Field label="Message">
        <textarea
          value={data.message ?? "Welcome to Trivia Night at Baynes Apple Valley. Let's get into it."}
          onChange={e => onChange('message', e.target.value)}
          rows={3}
          className="w-full text-sm bg-gray-50 text-gray-900 rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-baynes-forest resize-none"
        />
      </Field>
      <Divider label="Ben Photo" />
      <HostPhotoLibrary
        getHostPhotos={getHostPhotos}
        uploadMedia={uploadMedia}
        currentPhotoUrl={data.photoUrl}
        onSelectPhoto={url => onChange('photoUrl', url)}
      />
    </>
  )
}

function TeamPickerEditor({ data, onChange }) {
  return (
    <>
      <Field label="Opening Line"><TextInput value={data.openingText} onChange={v => onChange('openingText', v)} placeholder="Now, let's meet our teams" /></Field>
      <Field label="Closing Line"><TextInput value={data.closingText} onChange={v => onChange('closingText', v)} placeholder="Now, let's do this shit" /></Field>
    </>
  )
}

function ScoreboardRevealEditor({ data, onChange, show }) {
  return (
    <>
      <Field label="Title" hint='e.g. "After Round 1"'>
        <TextInput value={data.title} onChange={v => onChange('title', v)} placeholder="After Round 1" />
      </Field>
      <Field label="After Round">
        <select
          value={data.afterRound ?? ''}
          onChange={e => onChange('afterRound', e.target.value === '' ? null : Number(e.target.value))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-baynes-forest"
        >
          <option value="">None</option>
          {show.rounds.map(r => (
            <option key={r.id} value={r.number}>Round {r.number} — {r.title}</option>
          ))}
        </select>
      </Field>
    </>
  )
}

function CustomEditor({ data, onChange, onMediaUpload }) {
  return (
    <>
      <Field label="Title"><TextInput value={data.title} onChange={v => onChange('title', v)} placeholder="Slide title" /></Field>
      <Field label="Body"><TextArea value={data.body} onChange={v => onChange('body', v)} placeholder="Slide content…" rows={6} /></Field>
      <MediaUpload
        accept="image"
        label="Optional Image"
        currentUrl={data.mediaUrl}
        currentType={data.mediaType}
        onUpload={onMediaUpload}
        onRemove={() => { onChange('mediaUrl', null); onChange('mediaType', null) }}
      />
    </>
  )
}

function PixelateSeriesEditor({ data, onChange, onStageUpload }) {
  const stages = data.stages || [{}, {}, {}]

  return (
    <>
      <div className="flex gap-4">
        <Field label="Label" hint="Auto-numbered from this slide's position.">
          <div className="w-20 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600 select-none">
            {data.questionLabel || '—'}
          </div>
        </Field>
      </div>
      <Field label="Question Text">
        <TextArea value={data.text} onChange={v => onChange('text', v)} placeholder="What is this?" rows={3} />
      </Field>
      <Divider label="Pixelate Stages (most pixelated → clear)" />
      {stages.map((stage, i) => (
        <MediaUpload
          key={i}
          accept="image"
          label={`Stage ${i + 1} — ${i === 0 ? 'Pixelated' : i === 1 ? 'Less pixelated' : 'Clear'}`}
          currentUrl={stage.mediaUrl}
          currentType={stage.mediaType}
          onUpload={file => onStageUpload(i, file)}
          onRemove={() => {
            const next = [...stages]
            next[i] = { ...next[i], mediaUrl: null, mediaType: null }
            onChange('stages', next)
          }}
        />
      ))}
    </>
  )
}

function MultiQuestionEditor({ data, onChange, setData, scheduleSave }) {
  const questions = data.questions || [{ text: '' }]

  function addQuestion() {
    const next = { ...data, questions: [...questions, { text: '' }] }
    setData(next)
    scheduleSave({ data: next })
  }

  function removeQuestion(i) {
    const next = { ...data, questions: questions.filter((_, idx) => idx !== i) }
    setData(next)
    scheduleSave({ data: next })
  }

  function updateQuestion(i, text) {
    const next = { ...data, questions: questions.map((q, idx) => idx === i ? { ...q, text } : q) }
    setData(next)
    scheduleSave({ data: next })
  }

  return (
    <>
      <Field label="Series Title" hint='e.g. "Those Sneaky Bricks" or "Flipped Questions"'>
        <TextInput value={data.seriesTitle} onChange={v => onChange('seriesTitle', v)} placeholder="Series title…" />
      </Field>
      <Divider label="Questions" />
      <div className="space-y-2">
        {questions.map((q, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-xs text-gray-400 mt-2.5 w-5 text-right shrink-0">{i + 1}.</span>
            <textarea
              value={q.text}
              onChange={e => updateQuestion(i, e.target.value)}
              rows={2}
              placeholder={`Question ${i + 1}…`}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-baynes-forest resize-none"
            />
            {questions.length > 1 && (
              <button onClick={() => removeQuestion(i)} className="text-gray-300 hover:text-red-500 mt-2 text-xs transition-colors">✕</button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={addQuestion}
        className="text-xs text-baynes-forest hover:text-green-800 font-medium transition-colors"
      >
        + Add question
      </button>
    </>
  )
}

function GridEditor({ data, onChange, setData, scheduleSave, onMediaUpload, uploadMedia, getHostPhotos }) {
  const columns = Array.isArray(data.columns) ? data.columns : []

  function writeTile(ci, ri, patch) {
    const next = { ...data, columns: columns.map((col, c) =>
      c === ci ? col.map((tile, r) => r === ri ? { ...tile, ...patch } : tile) : col
    ) }
    setData(next)
    scheduleSave({ data: next })
  }

  async function uploadTileImage(ci, ri, file) {
    if (!file) return
    const url = await onMediaUpload(file)
    if (url) writeTile(ci, ri, { mediaUrl: url })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Previewing — matches QuestionEditor: every shiny slide gets a
          standalone intro beat before its content. */}
      {data.isShiny && (
        <>
          <Divider label="Previewing" />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onChange('introDone', false)}
              className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                !data.introDone ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-800'
              }`}
            >
              🎬 Intro
            </button>
            <button
              onClick={() => onChange('introDone', true)}
              className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                !!data.introDone ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-800'
              }`}
            >
              Content
            </button>
          </div>

          <Divider label="Intro Screen" />
          <Field label="Subtitle" hint='Optional — e.g. "Dog Edition" or "Bird Edition"'>
            <TextInput value={data.introSubtitle ?? ''} onChange={v => onChange('introSubtitle', v)} placeholder="Optional subtitle…" />
          </Field>
          <HostPhotoLibrary
            getHostPhotos={getHostPhotos}
            uploadMedia={uploadMedia}
            currentPhotoUrl={data.hostPhotoUrl}
            onSelectPhoto={url => onChange('hostPhotoUrl', url)}
          />
          <Divider label="Grid" />
        </>
      )}

      {/* Question text */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Question text (optional)</label>
        <textarea
          value={data.text ?? ''}
          onChange={e => onChange('text', e.target.value)}
          rows={2}
          placeholder="e.g. Name the color scheme in each column."
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
        />
      </div>

      {/* Layout controls */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Column gap</label>
          <button
            onClick={() => onChange('interGap', (data.interGap ?? 84) > 0 ? 0 : 84)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${(data.interGap ?? 84) > 0 ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-100 border-gray-200 text-gray-600'}`}
          >{(data.interGap ?? 84) > 0 ? 'Broken' : 'Butted'}</button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Column numbers</label>
          <button
            onClick={() => onChange('columnLabels', data.columnLabels === false ? true : false)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${data.columnLabels !== false ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-100 border-gray-200 text-gray-600'}`}
          >{data.columnLabels !== false ? 'On' : 'Off'}</button>
        </div>
      </div>

      {/* Tile grid — columns left→right, tiles top→bottom */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-2">
            <p className="text-[11px] text-gray-400 text-center font-medium">Col {ci + 1}</p>
            {col.map((tile, ri) => (
              <div key={ri} className="flex items-center gap-1.5 border border-gray-200 rounded-lg p-1.5">
                {tile.mediaUrl ? (
                  <img src={tile.mediaUrl} alt="" className="w-10 h-10 rounded object-cover" />
                ) : (
                  <input
                    type="color"
                    value={tile.color ?? '#888888'}
                    onChange={e => writeTile(ci, ri, { color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent p-0"
                    title={`Column ${ci + 1}, square ${ri + 1}`}
                  />
                )}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-700">
                    🖼
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => uploadTileImage(ci, ri, e.target.files?.[0])} />
                  </label>
                  {(tile.mediaUrl || tile.color) && (
                    <button
                      onClick={() => writeTile(ci, ri, { color: null, mediaUrl: null })}
                      className="text-[10px] text-gray-400 hover:text-gray-600"
                      title="Clear"
                    >↺</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <Field label="Answer">
        <TextInput value={data.answer ?? ''} onChange={v => onChange('answer', v)} placeholder="The answer…" />
      </Field>
    </div>
  )
}

function PylRevealEditor({ data, onChange, setData, scheduleSave }) {
  const stages = data.stages || [{ text: '', points: 40, revealed: false }]

  function addStage() {
    const next = { ...data, stages: [...stages, { text: '', points: 20, revealed: false }] }
    setData(next)
    scheduleSave({ data: next })
  }

  function removeStage(i) {
    const next = { ...data, stages: stages.filter((_, idx) => idx !== i) }
    setData(next)
    scheduleSave({ data: next })
  }

  function updateStage(i, key, value) {
    const next = { ...data, stages: stages.map((s, idx) => idx === i ? { ...s, [key]: value } : s) }
    setData(next)
    scheduleSave({ data: next })
  }

  return (
    <>
      <p className="text-xs text-gray-500">Each stage reveals one answer item. Host advances to reveal the next.</p>
      <Divider label="Reveal Stages" />
      <div className="space-y-3">
        {stages.map((stage, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-xs text-gray-400 mt-2.5 w-5 text-right shrink-0">{i + 1}.</span>
            <input
              value={stage.text}
              onChange={e => updateStage(i, 'text', e.target.value)}
              placeholder={`Answer item ${i + 1}…`}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-baynes-forest"
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">+</span>
              <input
                type="number"
                value={stage.points}
                onChange={e => updateStage(i, 'points', Number(e.target.value))}
                min={0}
                className="w-14 border border-gray-200 rounded px-2 py-2 text-sm text-center text-gray-900 focus:outline-none focus:ring-1 focus:ring-baynes-forest"
              />
            </div>
            {stages.length > 1 && (
              <button onClick={() => removeStage(i)} className="text-gray-300 hover:text-red-500 mt-2 text-xs transition-colors">✕</button>
            )}
          </div>
        ))}
      </div>
      <button onClick={addStage} className="text-xs text-baynes-forest hover:text-green-800 font-medium transition-colors">
        + Add reveal stage
      </button>
    </>
  )
}
