import { useEffect, useRef, useState } from 'react'
import { analyzeAudioGain } from '../../lib/audioNormalize.js'
import { JUKEBOX_LIBRARIES } from '../../lib/jukeboxLibraries.js'
import { fetchJukeboxLibraries } from '../../lib/jukeboxSupabase.js'
import MediaUpload from './MediaUpload.jsx'
import HostPhotoLibrary from './HostPhotoLibrary.jsx'
import ElementsEditor from './ElementsEditor.jsx'
import FormatLibrary from './FormatLibrary.jsx'
import SlideRenderer from '../display/SlideRenderer.jsx'

const INNER_W = 1280
const INNER_H = 720
const PREVIEW_W = 680
const PREVIEW_H = Math.round(PREVIEW_W * (9 / 16))
const SCALE = PREVIEW_W / INNER_W

const SLIDE_TYPES = [
  { value: 'title',             label: 'Title' },
  { value: 'round-intro',       label: 'Round Intro' },
  { value: 'swing-round-intro', label: 'Swing Round Intro' },
  { value: 'question',          label: 'Question' },
  { value: 'grading-break',     label: 'Grading Break' },
  { value: 'scoreboard-reveal', label: 'Scoreboard Reveal' },
  { value: 'custom',            label: 'Custom' },
  { value: 'pixelate-series',   label: 'Pixelate Series' },
  { value: 'multi-question',    label: 'Multi-Question' },
  { value: 'pyl-reveal',        label: 'PYL Reveal' },
  { value: 'winner-reveal',     label: 'Winner Reveal' },
]

const SLIDE_NAV_META = {
  'title':             { icon: '🇺🇸' },
  'state-of-union':    { icon: '🇺🇸' },
  'round-intro':       { icon: '🎬' },
  'swing-round-intro': { icon: '🎷' },
  'question':          { icon: '❓' },
  'grading-break':     { icon: '⏸️' },
  'scoreboard-reveal': { icon: '🏆' },
  'custom':            { icon: '✏️' },
  'pixelate-series':   { icon: '🎨' },
  'multi-question':    { icon: '📋' },
  'pyl-reveal':        { icon: '🎰' },
  'winner-reveal':     { icon: '🥇' },
}

function getNavLabel(slide) {
  const { data, type } = slide
  if (type === 'question' || type === 'pixelate-series') {
    if (data.isShiny) return data.shinyFormatName || '✨ Shiny'
    return data.questionLabel || `Q${data.questionNumber || '?'}`
  }
  if (type === 'round-intro' || type === 'swing-round-intro') return data.roundTitle || 'Round Intro'
  if (type === 'grading-break') return 'Grading Break'
  if (type === 'scoreboard-reveal') return data.title || 'Scoreboard'
  if (type === 'title') return data.title || 'Title'
  if (type === 'multi-question') return data.seriesTitle || 'Multi-Q'
  if (type === 'pyl-reveal') return 'PYL Reveal'
  if (type === 'winner-reveal') return 'Winner Reveal'
  return type
}

export default function SlideEditor({ slide, show, onUpdateSlide, onDeleteSlide, onClose, uploadMedia, getHostPhotos, addSiblingSlides }) {
  const [data, setData] = useState(slide.data)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [viewMode, setViewMode] = useState('edit') // 'edit' | 'preview'
  const [jukeboxLibs, setJukeboxLibs] = useState(JUKEBOX_LIBRARIES)
  const saveTimer = useRef(null)

  useEffect(() => {
    let alive = true
    fetchJukeboxLibraries().then(libs => { if (alive && libs) setJukeboxLibs(libs) })
    return () => { alive = false }
  }, [])

  // Sync local data when selected slide changes
  useEffect(() => { setData(slide.data); setConfirmingDelete(false) }, [slide.id])

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

  function changeType(newType) {
    onUpdateSlide(slide.id, { type: newType })
  }

  function scheduleSave(updates) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onUpdateSlide(slide.id, updates), 600)
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

  const navMeta = SLIDE_NAV_META[slide.type] ?? { icon: '📄' }
  const navLabel = getNavLabel(slide)

  return (
    <div className="flex flex-col h-full">
      {/* Slim nav bar */}
      <div className="flex items-center justify-between h-11 px-4 border-b border-gray-100 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← Dashboard
        </button>
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <span className="leading-none">{navMeta.icon}</span>
          <span>{navLabel}</span>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('edit')}
            className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${viewMode === 'edit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Edit
          </button>
          <button
            onClick={() => setViewMode('preview')}
            className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${viewMode === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Type-specific editor */}
      {viewMode === 'edit' && (
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {slide.type === 'title' && (
            <TitleEditor data={data} onChange={change} onMediaUpload={handleMediaUpload} />
          )}
          {(slide.type === 'round-intro' || slide.type === 'swing-round-intro') && (
            <RoundIntroEditor data={data} onChange={change} isSwing={slide.type === 'swing-round-intro'}
              uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} onMediaUpload={handleMediaUpload} />
          )}
          {slide.type === 'question' && (
            <QuestionEditor data={data} onChange={change} onBatchChange={batchChange} uploadMedia={uploadMedia}
              slideId={slide.id} slideRoundId={slide.roundId} addSiblingSlides={addSiblingSlides} onMediaUpload={handleMediaUpload} />
          )}
          {slide.type === 'grading-break' && (
            <GradingBreakEditor data={data} onChange={change} roundSlides={roundSlides}
              uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} jukeboxLibs={jukeboxLibs} onMediaUpload={handleMediaUpload} />
          )}
          {slide.type === 'scoreboard-reveal' && (
            <ScoreboardRevealEditor data={data} onChange={change} show={show} onMediaUpload={handleMediaUpload} />
          )}
          {slide.type === 'custom' && (
            <CustomEditor data={data} onChange={change} onMediaUpload={handleMediaUpload} />
          )}
          {slide.type === 'pixelate-series' && (
            <PixelateSeriesEditor data={data} onChange={change}
              onStageUpload={handleStageUpload} onMediaUpload={handleMediaUpload} />
          )}
          {slide.type === 'multi-question' && (
            <MultiQuestionEditor data={data} onChange={change} setData={setData} scheduleSave={scheduleSave} onMediaUpload={handleMediaUpload} />
          )}
          {slide.type === 'pyl-reveal' && (
            <PylRevealEditor data={data} onChange={change} setData={setData} scheduleSave={scheduleSave} onMediaUpload={handleMediaUpload} />
          )}
          {slide.type === 'winner-reveal' && (
            <WinnerRevealEditor data={data} onChange={change} onMediaUpload={handleMediaUpload} />
          )}
          {slide.type === 'state-of-union' && (
            <StateOfUnionEditor data={data} onChange={change} onMediaUpload={handleMediaUpload} />
          )}
        </div>
      )}

      {viewMode === 'preview' && (
        <div className="flex-1 bg-[#050505] flex items-center justify-center overflow-hidden">
          <div
            style={{
              width: PREVIEW_W,
              height: PREVIEW_H,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 12,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: INNER_W,
                height: INNER_H,
                transform: `scale(${SCALE})`,
                transformOrigin: 'top left',
                overflow: 'hidden',
              }}
            >
              <SlideRenderer slide={{ ...slide, data }} show={show} direction={1} />
            </div>
          </div>
        </div>
      )}

      {/* Footer — transition + delete */}
      <div className="shrink-0 px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        {!data.isShiny ? (
          <select
            value={data.transition ?? ''}
            onChange={e => change('transition', e.target.value === '' ? null : e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-baynes-forest"
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
        ) : (
          <div />
        )}
        {confirmingDelete ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-red-600">Delete slide?</span>
            <button
              onClick={() => onDeleteSlide(slide.id)}
              className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-sm font-medium text-red-500 hover:text-red-700 transition-colors"
          >
            Delete
          </button>
        )}
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

function TitleEditor({ data, onChange, onMediaUpload }) {
  return (
    <>
      <Field label="Title"><TextInput value={data.title} onChange={v => onChange('title', v)} placeholder="Baynes Apple Valley" /></Field>
      <Field label="Subtitle"><TextInput value={data.subtitle} onChange={v => onChange('subtitle', v)} placeholder="Trivia Night" /></Field>
      <Divider label="Elements" />
      <ElementsEditor
        elements={data.elements}
        onChange={next => onChange('elements', next)}
        onUpload={onMediaUpload}
      />
    </>
  )
}

function RoundIntroEditor({ data, onChange, isSwing, uploadMedia, getHostPhotos, onMediaUpload }) {
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
      <Divider label="Elements" />
      <ElementsEditor
        elements={data.elements}
        onChange={next => onChange('elements', next)}
        onUpload={onMediaUpload}
      />
    </>
  )
}

function QuestionEditor({ data, onChange, onBatchChange, uploadMedia, slideId, slideRoundId, addSiblingSlides, onMediaUpload }) {
  const [showFormatLibrary, setShowFormatLibrary] = useState(false)

  const mode = data.questionMode
  const schema = data.shinyInputSchema ?? {}
  const slots = typeof schema.slots === 'number' ? schema.slots : 0
  const mediaSlots = data.mediaSlots ?? []

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
        <Field label="Question Text">
          <TextArea value={data.text} onChange={v => onChange('text', v)} placeholder="Write the full question here…" rows={4} />
        </Field>
        <Field label="Answer">
          <TextInput value={data.answer ?? ''} onChange={v => onChange('answer', v)} placeholder="The answer…" />
        </Field>
        <Divider label="Elements" />
        <ElementsEditor
          elements={data.elements}
          onChange={next => onChange('elements', next)}
          onUpload={onMediaUpload}
        />
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

      {data.shinyFormatId && (
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

          {/* Audio slots */}
          {schema.type === 'audio' && slots > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {slots === 1 ? 'Audio' : `Audio (${slots} tracks)`}
              </label>
              <div className="space-y-3">
                {Array.from({ length: slots }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    {slots > 1 && (
                      <TextInput
                        value={data[`trackLabel_${i}`] ?? ''}
                        onChange={v => onChange(`trackLabel_${i}`, v)}
                        placeholder={`Track ${i + 1} title…`}
                      />
                    )}
                    <MediaUpload
                      accept="audio"
                      label={slots > 1 ? `Audio ${i + 1}` : 'Audio File'}
                      currentUrl={mediaSlots[i]?.url}
                      currentType={mediaSlots[i]?.type}
                      onUpload={file => uploadSlot(i, file)}
                      onRemove={() => removeSlot(i)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Video slots */}
          {schema.type === 'video' && slots > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {slots === 1 ? 'Video' : `Videos (${slots} slots)`}
              </label>
              <div className="space-y-3">
                {Array.from({ length: slots }).map((_, i) => (
                  <MediaUpload
                    key={i}
                    accept="video"
                    label={slots > 1 ? `Video ${i + 1}` : 'Video File'}
                    currentUrl={mediaSlots[i]?.url}
                    currentType={mediaSlots[i]?.type}
                    onUpload={file => uploadSlot(i, file)}
                    onRemove={() => removeSlot(i)}
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

          {/* Series settings — only if schema.seriesEnabled */}
          {schema.seriesEnabled && (
            <>
              <Divider label="Series" />
              <Toggle
                label="Part of a Series"
                checked={!!data.isSeries}
                onChange={v => onChange('isSeries', v)}
                description="Groups questions (6a, 6b, 6c) under a shared theme banner"
              />
              {data.isSeries && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Series Label" hint='e.g. "6a"'>
                    <TextInput value={data.seriesLabel} onChange={v => onChange('seriesLabel', v)} placeholder="6a" />
                  </Field>
                  <Field label="Series Theme" hint='e.g. "Name That Tune"'>
                    <TextInput value={data.seriesTheme} onChange={v => onChange('seriesTheme', v)} placeholder="Name That Tune" />
                  </Field>
                </div>
              )}
            </>
          )}

          <Divider label="Elements" />
          <ElementsEditor
            elements={data.elements}
            onChange={next => onChange('elements', next)}
            onUpload={onMediaUpload}
          />
        </>
      )}

      {showFormatLibrary && (
        <FormatLibrary
          onClose={() => setShowFormatLibrary(false)}
          onSelectFormat={fmt => {
            const totalSlots = fmt.input_schema?.slots ?? 1
            if (totalSlots > 1 && addSiblingSlides) {
              const singleSchema = { ...fmt.input_schema, slots: 1 }
              onBatchChange({
                shinyFormatId: fmt.id,
                shinyFormatName: fmt.name,
                shinyFormatIcon: fmt.icon,
                shinyInputSchema: singleSchema,
                isSeries: true,
                seriesLabel: `1 of ${totalSlots}`,
                seriesTheme: fmt.name,
                slotIndex: 1,
                slotTotal: totalSlots,
                mediaSlots: [],
              })
              addSiblingSlides(slideId, Array.from({ length: totalSlots - 1 }, (_, i) => ({
                type: 'question',
                roundId: slideRoundId,
                data: {
                  questionNumber: data.questionNumber,
                  questionLabel: data.questionLabel,
                  questionMode: 'shiny',
                  isShiny: true,
                  shinyType: fmt.input_schema.type,
                  shinyFormatId: fmt.id,
                  shinyFormatName: fmt.name,
                  shinyFormatIcon: fmt.icon,
                  shinyInputSchema: singleSchema,
                  isSeries: true,
                  seriesLabel: `${i + 2} of ${totalSlots}`,
                  seriesTheme: fmt.name,
                  slotIndex: i + 2,
                  slotTotal: totalSlots,
                  text: '',
                  mediaSlots: [],
                },
              })))
            } else {
              onBatchChange({
                shinyFormatId: fmt.id,
                shinyFormatName: fmt.name,
                shinyFormatIcon: fmt.icon,
                shinyInputSchema: fmt.input_schema,
              })
            }
            setShowFormatLibrary(false)
          }}
        />
      )}
    </>
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

function GradingBreakEditor({ data, onChange, roundSlides, uploadMedia, getHostPhotos, jukeboxLibs, onMediaUpload }) {
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

      <Divider label="Elements" />
      <ElementsEditor
        elements={data.elements}
        onChange={next => onChange('elements', next)}
        onUpload={onMediaUpload}
      />
    </>
  )
}

function WinnerRevealEditor({ data, onChange, onMediaUpload }) {
  return (
    <div className="flex flex-col gap-3 py-2">
      <p className="text-sm text-gray-500 leading-relaxed">
        This slide plays a drum roll, then reveals the winning team with confetti.
      </p>
      <p className="text-xs text-gray-400 leading-relaxed">
        The winner is calculated live from team scores at the time the slide appears. No configuration needed — just place it last in your show order.
      </p>
      <Divider label="Elements" />
      <ElementsEditor
        elements={data.elements}
        onChange={next => onChange('elements', next)}
        onUpload={onMediaUpload}
      />
    </div>
  )
}

function StateOfUnionEditor({ data, onChange, onMediaUpload }) {
  return (
    <div className="flex flex-col gap-3 py-2">
      <p className="text-sm text-gray-500 leading-relaxed">
        This slide is generated automatically from live standings. No configuration needed.
      </p>
      <Divider label="Elements" />
      <ElementsEditor
        elements={data.elements}
        onChange={next => onChange('elements', next)}
        onUpload={onMediaUpload}
      />
    </div>
  )
}

function ScoreboardRevealEditor({ data, onChange, show, onMediaUpload }) {
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
      <Divider label="Elements" />
      <ElementsEditor
        elements={data.elements}
        onChange={next => onChange('elements', next)}
        onUpload={onMediaUpload}
      />
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
      <Divider label="Elements" />
      <ElementsEditor
        elements={data.elements}
        onChange={next => onChange('elements', next)}
        onUpload={onMediaUpload}
      />
    </>
  )
}

function PixelateSeriesEditor({ data, onChange, onStageUpload, onMediaUpload }) {
  const stages = data.stages || [{}, {}, {}]

  return (
    <>
      <div className="flex gap-4">
        <Field label="Label"><TextInput value={data.questionLabel} onChange={v => onChange('questionLabel', v)} placeholder="Q5" className="w-20" /></Field>
        <Field label="Number"><NumberInput value={data.questionNumber} onChange={v => onChange('questionNumber', v)} /></Field>
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
      <Divider label="Elements" />
      <ElementsEditor
        elements={data.elements}
        onChange={next => onChange('elements', next)}
        onUpload={onMediaUpload}
      />
    </>
  )
}

function MultiQuestionEditor({ data, onChange, setData, scheduleSave, onMediaUpload }) {
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
      <Divider label="Elements" />
      <ElementsEditor
        elements={data.elements}
        onChange={next => onChange('elements', next)}
        onUpload={onMediaUpload}
      />
    </>
  )
}

function PylRevealEditor({ data, onChange, setData, scheduleSave, onMediaUpload }) {
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
      <Divider label="Elements" />
      <ElementsEditor
        elements={data.elements}
        onChange={next => onChange('elements', next)}
        onUpload={onMediaUpload}
      />
    </>
  )
}
