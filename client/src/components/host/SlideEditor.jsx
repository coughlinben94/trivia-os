import { useEffect, useRef, useState } from 'react'
import { analyzeAudioGain } from '../../lib/audioNormalize.js'
import MediaUpload from './MediaUpload.jsx'
import HostPhotoLibrary from './HostPhotoLibrary.jsx'
import FormatLibrary from './FormatLibrary.jsx'

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
]

const SLIDE_NAV_META = {
  'title':             { icon: '📺' },
  'round-intro':       { icon: '🎬' },
  'swing-round-intro': { icon: '🎷' },
  'question':          { icon: '❓' },
  'grading-break':     { icon: '⏸️' },
  'scoreboard-reveal': { icon: '🏆' },
  'custom':            { icon: '✏️' },
  'pixelate-series':   { icon: '🎨' },
  'multi-question':    { icon: '📋' },
  'pyl-reveal':        { icon: '🎰' },
}

function getNavLabel(slide) {
  const { data, type } = slide
  if (type === 'question' || type === 'pixelate-series') return data.questionLabel || `Q${data.questionNumber || '?'}`
  if (type === 'round-intro' || type === 'swing-round-intro') return data.roundTitle || 'Round Intro'
  if (type === 'grading-break') return 'Grading Break'
  if (type === 'scoreboard-reveal') return data.title || 'Scoreboard'
  if (type === 'title') return data.title || 'Title'
  if (type === 'multi-question') return data.seriesTitle || 'Multi-Q'
  if (type === 'pyl-reveal') return 'PYL Reveal'
  return type
}

export default function SlideEditor({ slide, show, onUpdateSlide, onDeleteSlide, onClose, uploadMedia, getHostPhotos }) {
  const [data, setData] = useState(slide.data)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const saveTimer = useRef(null)

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
      const updates = { mediaUrl: result.url, mediaType: result.mimetype }
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
          ← Add slides
        </button>
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <span className="leading-none">{navMeta.icon}</span>
          <span>{navLabel}</span>
        </div>
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
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
            className="text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            Delete
          </button>
        )}
      </div>

      {/* Slide type row */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-4 border-b border-gray-100 shrink-0">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Slide type</label>
          <select
            value={slide.type}
            onChange={e => changeType(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-baynes-forest"
          >
            {SLIDE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Type-specific editor */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {slide.type === 'title' && (
          <TitleEditor data={data} onChange={change} />
        )}
        {(slide.type === 'round-intro' || slide.type === 'swing-round-intro') && (
          <RoundIntroEditor data={data} onChange={change} isSwing={slide.type === 'swing-round-intro'}
            uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} />
        )}
        {slide.type === 'question' && (
          <QuestionEditor data={data} onChange={change} onBatchChange={batchChange} uploadMedia={uploadMedia} />
        )}
        {slide.type === 'grading-break' && (
          <GradingBreakEditor data={data} onChange={change} roundSlides={roundSlides}
            uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} />
        )}
        {slide.type === 'scoreboard-reveal' && (
          <ScoreboardRevealEditor data={data} onChange={change} show={show} />
        )}
        {slide.type === 'custom' && (
          <CustomEditor data={data} onChange={change} onMediaUpload={handleMediaUpload} />
        )}
        {slide.type === 'pixelate-series' && (
          <PixelateSeriesEditor data={data} onChange={change}
            onStageUpload={handleStageUpload} />
        )}
        {slide.type === 'multi-question' && (
          <MultiQuestionEditor data={data} onChange={change} setData={setData} scheduleSave={scheduleSave} />
        )}
        {slide.type === 'pyl-reveal' && (
          <PylRevealEditor data={data} onChange={change} setData={setData} scheduleSave={scheduleSave} />
        )}
      </div>
    </div>
  )
}

// ─── Field primitives ────────────────────────────────────────────────────────

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
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

function QuestionEditor({ data, onChange, onBatchChange, uploadMedia }) {
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
      next[i] = { url: result.url, type: result.mimetype }
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
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-1 rounded">
            {data.questionLabel || (data.questionNumber ? `Q${data.questionNumber}` : 'Q?')}
          </span>
          <button
            onClick={() => onChange('questionMode', null)}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Change type
          </button>
        </div>
        <Field label="Question Text">
          <TextArea value={data.text} onChange={v => onChange('text', v)} placeholder="Write the full question here…" rows={6} />
        </Field>
      </>
    )
  }

  // ── Shiny mode ─────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 font-medium">✨ Shiny</span>
        <button
          onClick={() => onChange('questionMode', null)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Change type
        </button>
      </div>

      {/* Format selector */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Format</label>
        {data.shinyFormatId ? (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50">
            <span className="text-xl">{data.shinyFormatIcon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">{data.shinyFormatName}</p>
              <p className="text-xs text-gray-400">
                {schema.type ?? ''}
                {slots > 0 ? ` · ${slots} slot${slots !== 1 ? 's' : ''}` : ''}
              </p>
            </div>
            <button
              onClick={() => setShowFormatLibrary(true)}
              className="text-xs text-gray-500 hover:text-gray-700 underline shrink-0"
            >
              Change
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowFormatLibrary(true)}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span>✨</span>
            <span className="text-sm">Choose Format from Library</span>
          </button>
        )}
      </div>

      {data.shinyFormatId && (
        <>
          {/* Label + number */}
          <div className="flex gap-4">
            <Field label='Label' hint='e.g. "Q1" or "6a"'>
              <TextInput value={data.questionLabel} onChange={v => onChange('questionLabel', v)} placeholder="Q1" className="w-20" />
            </Field>
            <Field label="Number">
              <NumberInput value={data.questionNumber} onChange={v => onChange('questionNumber', v)} />
            </Field>
          </div>

          {/* Image slots */}
          {schema.type === 'image' && slots > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {slots === 1 ? 'Image' : `Images (${slots} slots)`}
              </label>
              <div className="space-y-3">
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
              <TextArea value={data.text} onChange={v => onChange('text', v)} placeholder="Write the question here…" rows={4} />
            </Field>
          )}

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
        </>
      )}

      {showFormatLibrary && (
        <FormatLibrary
          onClose={() => setShowFormatLibrary(false)}
          onSelectFormat={fmt => {
            onBatchChange({
              shinyFormatId: fmt.id,
              shinyFormatName: fmt.name,
              shinyFormatIcon: fmt.icon,
              shinyInputSchema: fmt.input_schema,
            })
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

function GradingBreakEditor({ data, onChange, roundSlides, uploadMedia, getHostPhotos }) {
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
