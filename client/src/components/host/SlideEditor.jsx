import { useEffect, useRef, useState } from 'react'
import MediaUpload from './MediaUpload.jsx'
import HostPhotoLibrary from './HostPhotoLibrary.jsx'

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

export default function SlideEditor({ slide, show, onUpdateSlide, onDeleteSlide, uploadMedia, getHostPhotos }) {
  const [data, setData] = useState(slide.data)
  const saveTimer = useRef(null)

  // Sync local data when selected slide changes
  useEffect(() => { setData(slide.data) }, [slide.id])

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

  // Media upload helpers
  async function handleMediaUpload(file) {
    const result = await uploadMedia(file)
    if (result?.url) {
      change('mediaUrl', result.url)
      change('mediaType', result.mimetype)
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
      {/* Slide type + delete row */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">Slide Type</label>
          <select
            value={slide.type}
            onChange={e => changeType(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-baynes-forest"
          >
            {SLIDE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <button
          onClick={() => { if (confirm('Delete this slide?')) onDeleteSlide(slide.id) }}
          className="mt-5 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded"
        >
          Delete slide
        </button>
      </div>

      {/* Type-specific editor */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {slide.type === 'title' && (
          <TitleEditor data={data} onChange={change} />
        )}
        {(slide.type === 'round-intro' || slide.type === 'swing-round-intro') && (
          <RoundIntroEditor data={data} onChange={change} isSwing={slide.type === 'swing-round-intro'}
            uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} />
        )}
        {slide.type === 'question' && (
          <QuestionEditor data={data} onChange={change}
            onMediaUpload={handleMediaUpload} uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} />
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
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
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
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-xs text-gray-400 font-medium">{label}</span>
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

function QuestionEditor({ data, onChange, onMediaUpload, uploadMedia, getHostPhotos }) {
  return (
    <>
      <div className="flex gap-4">
        <Field label="Label" hint='e.g. "Q1" or "Q6a"'>
          <TextInput value={data.questionLabel} onChange={v => onChange('questionLabel', v)} placeholder="Q1" className="w-20" />
        </Field>
        <Field label="Number">
          <NumberInput value={data.questionNumber} onChange={v => onChange('questionNumber', v)} />
        </Field>
      </div>

      <Field label="Question Text">
        <TextArea value={data.text} onChange={v => onChange('text', v)} placeholder="Write the full question here…" rows={5} />
      </Field>

      <Divider label="Shiny Settings" />

      <Toggle
        label="Shiny Question"
        checked={!!data.isShiny}
        onChange={v => onChange('isShiny', v)}
        description="Visual or audio question — gets special entry animation"
      />

      {data.isShiny && (
        <>
          <Field label="Shiny Type">
            <div className="flex gap-2">
              {['visual', 'audio'].map(t => (
                <button
                  key={t}
                  onClick={() => onChange('shinyType', t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    data.shinyType === t
                      ? 'bg-baynes-forest text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t === 'visual' ? '✨ Visual' : '🎵 Audio'}
                </button>
              ))}
            </div>
          </Field>

          {data.shinyType === 'visual' && (
            <MediaUpload
              accept="image"
              label="Question Image"
              currentUrl={data.mediaUrl}
              currentType={data.mediaType}
              onUpload={onMediaUpload}
              onRemove={() => { onChange('mediaUrl', null); onChange('mediaType', null) }}
            />
          )}

          {data.shinyType === 'audio' && (
            <MediaUpload
              accept="audio"
              label="Audio File"
              currentUrl={data.mediaUrl}
              currentType={data.mediaType}
              onUpload={onMediaUpload}
              onRemove={() => { onChange('mediaUrl', null); onChange('mediaType', null) }}
            />
          )}
        </>
      )}

      <Divider label="Series Settings" />

      <Toggle
        label="Part of a Series"
        checked={!!data.isSeries}
        onChange={v => onChange('isSeries', v)}
        description="Groups related questions under a shared theme"
      />

      {data.isSeries && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Series Label" hint='e.g. "6a"'>
            <TextInput value={data.seriesLabel} onChange={v => onChange('seriesLabel', v)} placeholder="6a" />
          </Field>
          <Field label="Series Theme" hint='e.g. "Name That Movie"'>
            <TextInput value={data.seriesTheme} onChange={v => onChange('seriesTheme', v)} placeholder="Name That Movie" />
          </Field>
        </div>
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
