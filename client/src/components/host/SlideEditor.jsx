import { useEffect, useRef, useState } from 'react'
import { analyzeAudioGain } from '../../lib/audioNormalize.js'
import { JUKEBOX_LIBRARIES } from '../../lib/jukeboxLibraries.js'
import { fetchJukeboxLibraries } from '../../lib/jukeboxSupabase.js'
import MediaUpload from './MediaUpload.jsx'
import HostPhotoLibrary from './HostPhotoLibrary.jsx'
import FormatLibrary from './FormatLibrary.jsx'
import SlideRenderer from '../display/SlideRenderer.jsx'
import ParticleBackground from '../display/ParticleBackground.jsx'
import { makeElement } from '../display/SlideElements.jsx'
import { DISPLAY_FONTS } from './ThemeCustomizeControls.jsx'
import { useTheme } from '../shared/ThemeProvider.jsx'
import { useShinyFormats } from '../../hooks/useShinyFormats.js'

const INNER_W = 1280
const INNER_H = 720
const PREVIEW_W = 680
const PREVIEW_H = Math.round(PREVIEW_W * (9 / 16))
const SCALE = PREVIEW_W / INNER_W

export default function SlideEditor({ slide, show, onUpdateSlide, onDeleteSlide, uploadMedia, getHostPhotos }) {
  const { theme } = useTheme()
  const [data, setData] = useState(slide.data)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [jukeboxLibs, setJukeboxLibs] = useState(JUKEBOX_LIBRARIES)
  const [selectedElId, setSelectedElId] = useState(null)
  const saveTimer = useRef(null)
  const overlayRef = useRef(null)
  const dragStateRef = useRef(null)
  const leftPanelRef = useRef(null)
  const [panelW, setPanelW] = useState(800)
  const [panelH, setPanelH] = useState(600)

  useEffect(() => {
    let alive = true
    fetchJukeboxLibraries().then(libs => { if (alive && libs) setJukeboxLibs(libs) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const el = leftPanelRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      setPanelW(Math.round(entry.contentRect.width))
      setPanelH(Math.round(entry.contentRect.height))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Sync local data when selected slide changes
  useEffect(() => {
    setData(slide.data); setConfirmingDelete(false); setSelectedElId(null)
    // If a drag got interrupted (see startDrag's pointercancel comment) and
    // its listeners are still attached, this stops onMove from writing
    // element-position updates to the slide we just navigated away from.
    dragStateRef.current = null
  }, [slide.id])

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
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onUpdateSlide(slide.id, updates), 600)
  }

  function batchChange(updates) {
    const next = { ...data, ...updates }
    setData(next)
    scheduleSave({ data: next })
  }

  // Element overlay helpers
  function updateElement(id, updates) {
    const next = (data.elements ?? []).map(el => el.id === id ? { ...el, ...updates } : el)
    change('elements', next)
  }

  function addElement(type) {
    const el = makeElement(type)
    const next = [...(data.elements ?? []), el]
    change('elements', next)
    setSelectedElId(el.id)
  }

  function deleteElement(id) {
    const next = (data.elements ?? []).filter(el => el.id !== id)
    change('elements', next)
    if (selectedElId === id) setSelectedElId(null)
  }

  function duplicateElement(id) {
    const el = (data.elements ?? []).find(e => e.id === id)
    if (!el) return
    const dupe = { ...el, id: `el_${Math.random().toString(36).slice(2, 10)}`, x: (el.x ?? 50) + 4, y: (el.y ?? 50) + 4 }
    const next = [...(data.elements ?? []), dupe]
    change('elements', next)
    setSelectedElId(dupe.id)
  }

  function bringForward(id) {
    const els = [...(data.elements ?? [])]
    const i = els.findIndex(e => e.id === id)
    if (i < els.length - 1) { [els[i], els[i + 1]] = [els[i + 1], els[i]]; change('elements', els) }
  }

  function sendBackward(id) {
    const els = [...(data.elements ?? [])]
    const i = els.findIndex(e => e.id === id)
    if (i > 0) { [els[i - 1], els[i]] = [els[i], els[i - 1]]; change('elements', els) }
  }

  function startDrag(e, elId, el) {
    e.stopPropagation()
    const overlay = overlayRef.current
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    dragStateRef.current = {
      elId,
      startMouseX: e.clientX, startMouseY: e.clientY,
      startElX: el.x ?? 50, startElY: el.y ?? 50,
      rectW: rect.width, rectH: rect.height,
    }
    setSelectedElId(elId)
    function onMove(ev) {
      const s = dragStateRef.current
      if (!s) return
      const dx = (ev.clientX - s.startMouseX) / s.rectW * 100
      const dy = (ev.clientY - s.startMouseY) / s.rectH * 100
      updateElement(s.elId, {
        x: Math.max(2, Math.min(98, s.startElX + dx)),
        y: Math.max(2, Math.min(98, s.startElY + dy)),
      })
    }
    function onUp() {
      dragStateRef.current = null
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    // Browsers fire pointercancel (not pointerup) when a drag gets interrupted —
    // released outside the window, an OS-level focus steal, etc. Without this,
    // the listeners never get removed and onMove keeps writing to this element
    // via a stale closure even after the host has moved on to a different slide.
    document.addEventListener('pointercancel', onUp)
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
      {(() => {
        const elements = data.elements ?? []
        const selectedEl = elements.find(el => el.id === selectedElId) ?? null
        const dynScale = Math.min(panelW / INNER_W, panelH / INNER_H)
        const scaledW  = Math.round(INNER_W * dynScale)
        const scaledH  = Math.round(INNER_H * dynScale)
        return (
          <div className="flex flex-1 min-h-0">

            {/* ── LEFT: slide canvas ── */}
            <div className="flex-1 bg-white flex flex-col overflow-hidden">
              {/* Slide viewport — ref here so panelH excludes the chips strip below */}
              <div ref={leftPanelRef} className="flex-1 flex items-center justify-center min-h-0 overflow-hidden">
                {/* Wrapper: canvas is clipped; overlay is NOT, so handles near edges stay clickable */}
                <div style={{ width: scaledW, height: scaledH, position: 'relative', flexShrink: 0 }}>
                  {/* Clipped canvas */}
                  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: INNER_W, height: INNER_H, transform: `scale(${dynScale})`, transformOrigin: 'top left', overflow: 'hidden', background: theme.colors.bg }}>
                      <ParticleBackground theme={theme} />
                      <SlideRenderer slide={{ ...slide, data }} show={show} direction={1} isPreview />
                    </div>
                  </div>
                  {/* Interactive element overlay — overflow visible so handles aren't clipped */}
                  <div
                    ref={overlayRef}
                    style={{ position: 'absolute', inset: 0, zIndex: 50, overflow: 'visible' }}
                    onPointerDown={() => setSelectedElId(null)}
                  >
                  {elements.map(el => {
                    const isSel = el.id === selectedElId
                    const elX = el.x ?? 50
                    const elY = el.y ?? 50
                    const elW = el.width ?? (el.type === 'image' ? 40 : 60)
                    const rot = el.rotation ?? 0
                    const fH  = el.flipH ? -1 : 1
                    const fV  = el.flipV ? -1 : 1
                    return (
                      <div
                        key={el.id}
                        style={{
                          position: 'absolute',
                          left: `${elX}%`, top: `${elY}%`,
                          width: `${elW}%`,
                          transform: `translate(-50%, -50%) rotate(${rot}deg) scaleX(${fH}) scaleY(${fV})`,
                          border: isSel ? '2px solid #3b82f6' : '1px dashed rgba(255,255,255,0.35)',
                          borderRadius: 4,
                          minHeight: el.type === 'text'
                            ? Math.max(36, Math.round((el.fontSize ?? 60) * dynScale * (el.lineHeight ?? 1.2)))
                            : Math.max(36, Math.round(elW / 100 * scaledW * (INNER_H / INNER_W))),
                          cursor: 'move',
                          background: isSel ? 'rgba(59,130,246,0.07)' : 'transparent',
                          boxSizing: 'border-box',
                        }}
                        onPointerDown={e => { e.stopPropagation(); startDrag(e, el.id, el) }}
                      >
                        {isSel && (
                          <button
                            style={{ position: 'absolute', top: -9, right: -9, background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
                            onPointerDown={e => { e.stopPropagation(); deleteElement(el.id) }}
                          >×</button>
                        )}
                        <span style={{ position: 'absolute', top: -16, left: 0, fontSize: 10, color: isSel ? '#60a5fa' : 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                          {el.type === 'text' ? (el.content?.slice(0, 22) || 'Text box') : 'Image'}
                        </span>
                      </div>
                    )
                  })}
                  </div>
                </div>
              </div>

              {/* Layer chips — anchored at the bottom, outside the centered viewport */}
              {elements.length > 0 && (
                <div className="shrink-0 px-3 py-2 flex flex-wrap gap-1.5 justify-center border-t border-gray-100">
                  {elements.map(el => (
                    <button
                      key={el.id}
                      onClick={() => setSelectedElId(prev => prev === el.id ? null : el.id)}
                      className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${
                        el.id === selectedElId
                          ? 'bg-blue-500 border-blue-500 text-white'
                          : 'text-gray-400 border-gray-200 hover:text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {el.type === 'text' ? (el.content?.slice(0, 18) || '(empty text)') : '🖼 Image'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── RIGHT: editing sidebar ── */}
            <div className="w-72 bg-white border-l border-gray-200 flex flex-col overflow-hidden shrink-0">
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {/* ── Slide content ── */}
                {(
                  <div className="space-y-3 pb-3 border-b border-gray-100">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Slide Content</p>
                    {slide.type === 'title' && <TitleEditor data={data} onChange={change} />}
                    {(slide.type === 'round-intro' || slide.type === 'swing-round-intro') && (
                      <RoundIntroEditor data={data} onChange={change} isSwing={slide.type === 'swing-round-intro'}
                        uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} />
                    )}
                    {slide.type === 'question' && (
                      <QuestionEditor data={data} onChange={change} onBatchChange={batchChange} uploadMedia={uploadMedia} getHostPhotos={getHostPhotos} />
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
                    {slide.type === 'winner-reveal' && (
                      <WinnerRevealEditor data={data} onChange={change} />
                    )}
                  </div>
                )}
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Overlay Elements</p>
                {/* Add element buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => addElement('text')}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 border border-dashed border-gray-300 rounded-lg py-2 hover:border-gray-400 hover:text-gray-700 transition-colors"
                  >
                    <span className="font-bold text-sm leading-none">T</span> Add text
                  </button>
                  <button
                    onClick={() => addElement('image')}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 border border-dashed border-gray-300 rounded-lg py-2 hover:border-gray-400 hover:text-gray-700 transition-colors"
                  >
                    🖼 Add image
                  </button>
                </div>

              {/* ── Text element properties ────────────────────── */}
              {selectedEl?.type === 'text' && (
                <div className="space-y-2.5 pt-2 border-t border-gray-100">
                  {/* Content */}
                  <textarea
                    autoFocus
                    value={selectedEl.content ?? ''}
                    onChange={e => updateElement(selectedElId, { content: e.target.value })}
                    rows={2}
                    placeholder="Type your text…"
                    className="w-full text-sm bg-gray-50 text-gray-900 rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none placeholder:text-gray-400"
                  />
                  {/* Font */}
                  <select
                    value={selectedEl.font ?? 'Boogaloo'}
                    onChange={e => updateElement(selectedElId, { font: e.target.value })}
                    className="w-full text-xs bg-gray-50 text-gray-900 border border-gray-200 rounded-md px-2 py-1 focus:outline-none"
                  >
                    {DISPLAY_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  {/* Style: B I U S̶ */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      ['bold',          'B'],
                      ['italic',        'I'],
                      ['underline',     'U'],
                      ['strikethrough', 'S̶'],
                    ].map(([key, label]) => (
                      <button key={key}
                        onClick={() => updateElement(selectedElId, { [key]: !selectedEl[key] })}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${selectedEl[key] ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                      >{label}</button>
                    ))}
                    {/* Text transform */}
                    {[
                      ['none',       'Aa'],
                      ['uppercase',  'AA'],
                      ['lowercase',  'aa'],
                      ['capitalize', 'Abc'],
                    ].map(([val, label]) => (
                      <button key={val}
                        onClick={() => updateElement(selectedElId, { textTransform: val })}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${(selectedEl.textTransform ?? 'none') === val ? 'bg-violet-500 border-violet-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                      >{label}</button>
                    ))}
                  </div>
                  {/* Align + color */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      ['left',    '▤'],
                      ['center',  '☰'],
                      ['right',   '▥'],
                      ['justify', '▦'],
                    ].map(([a, icon]) => (
                      <button key={a}
                        onClick={() => updateElement(selectedElId, { align: a })}
                        className={`text-[11px] px-1.5 py-1 rounded border transition-colors ${(selectedEl.align ?? 'center') === a ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                      >{icon}</button>
                    ))}
                    <input type="color" value={selectedEl.color ?? '#ffffff'}
                      onChange={e => updateElement(selectedElId, { color: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0" title="Text color"
                    />
                    {selectedEl.color && (
                      <button onClick={() => updateElement(selectedElId, { color: null })} className="text-[10px] text-gray-400 hover:text-gray-600">↺</button>
                    )}
                  </div>
                  {/* Size + width */}
                  {[
                    ['Size',  'fontSize',     16, 200, 2,   60, 'px'],
                    ['Width', 'width',        10, 100, 1,   60, '%'],
                  ].map(([label, key, min, max, step, def, unit]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-9 shrink-0">{label}</span>
                      <input type="range" min={min} max={max} step={step}
                        value={selectedEl[key] ?? def}
                        onChange={e => updateElement(selectedElId, { [key]: Number(e.target.value) })}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-400 w-12 text-right">{selectedEl[key] ?? def}{unit}</span>
                    </div>
                  ))}
                  {/* Curve + Spacing */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-9 shrink-0">Curve</span>
                    <input type="range" min="-100" max="100"
                      value={selectedEl.curve ?? 0}
                      onChange={e => updateElement(selectedElId, { curve: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 w-8 text-right">{selectedEl.curve ?? 0}</span>
                    {(selectedEl.curve ?? 0) !== 0 && (
                      <button onClick={() => updateElement(selectedElId, { curve: 0 })} className="text-[10px] text-gray-400 hover:text-gray-600">↺</button>
                    )}
                  </div>
                  {[
                    ['Spacing', 'letterSpacing', -5, 30, 0.5, 0,   'px'],
                    ['Line ht', 'lineHeight',    0.8,  3, 0.1, 1.2, '×'],
                  ].map(([label, key, min, max, step, def, unit]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-9 shrink-0">{label}</span>
                      <input type="range" min={min} max={max} step={step}
                        value={selectedEl[key] ?? def}
                        onChange={e => updateElement(selectedElId, { [key]: Number(e.target.value) })}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-400 w-12 text-right">{(selectedEl[key] ?? def)}{unit}</span>
                    </div>
                  ))}
                  {/* Shadow */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateElement(selectedElId, { shadow: !selectedEl.shadow })}
                        className={`text-xs px-2 py-1 rounded border transition-colors shrink-0 ${selectedEl.shadow ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                      >Shadow</button>
                      {selectedEl.shadow && (
                        <>
                          <span className="text-[10px] text-gray-400">blur</span>
                          <input type="range" min="0" max="40"
                            value={selectedEl.shadowBlur ?? 8}
                            onChange={e => updateElement(selectedElId, { shadowBlur: Number(e.target.value) })}
                            className="flex-1"
                          />
                          <span className="text-xs text-gray-400 w-5">{selectedEl.shadowBlur ?? 8}</span>
                          <input type="color" value={selectedEl.shadowColor?.startsWith('#') ? selectedEl.shadowColor : '#000000'}
                            onChange={e => updateElement(selectedElId, { shadowColor: e.target.value })}
                            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0" title="Shadow color"
                          />
                        </>
                      )}
                    </div>
                    {selectedEl.shadow && (
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-[10px] text-gray-400 w-6">X</span>
                        <input type="range" min="-30" max="30"
                          value={selectedEl.shadowX ?? 2}
                          onChange={e => updateElement(selectedElId, { shadowX: Number(e.target.value) })}
                          className="flex-1"
                        />
                        <span className="text-xs text-gray-400 w-8 text-right">{selectedEl.shadowX ?? 2}px</span>
                        <span className="text-[10px] text-gray-400 w-4">Y</span>
                        <input type="range" min="-30" max="30"
                          value={selectedEl.shadowY ?? 2}
                          onChange={e => updateElement(selectedElId, { shadowY: Number(e.target.value) })}
                          className="flex-1"
                        />
                        <span className="text-xs text-gray-400 w-8 text-right">{selectedEl.shadowY ?? 2}px</span>
                      </div>
                    )}
                  </div>
                  {/* Outline/stroke */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateElement(selectedElId, { stroke: !selectedEl.stroke })}
                      className={`text-xs px-2 py-1 rounded border transition-colors shrink-0 ${selectedEl.stroke ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                    >Outline</button>
                    {selectedEl.stroke && (
                      <>
                        <input type="range" min="1" max="12"
                          value={selectedEl.strokeWidth ?? 2}
                          onChange={e => updateElement(selectedElId, { strokeWidth: Number(e.target.value) })}
                          className="flex-1"
                        />
                        <span className="text-xs text-gray-400 w-7">{selectedEl.strokeWidth ?? 2}px</span>
                        <input type="color" value={selectedEl.strokeColor ?? '#000000'}
                          onChange={e => updateElement(selectedElId, { strokeColor: e.target.value })}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0" title="Outline color"
                        />
                      </>
                    )}
                  </div>
                  {/* Glow */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateElement(selectedElId, { glow: !selectedEl.glow })}
                      className={`text-xs px-2 py-1 rounded border transition-colors shrink-0 ${selectedEl.glow ? 'bg-yellow-500 border-yellow-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                    >Glow</button>
                    {selectedEl.glow && (
                      <>
                        <input type="range" min="2" max="60"
                          value={selectedEl.glowRadius ?? 20}
                          onChange={e => updateElement(selectedElId, { glowRadius: Number(e.target.value) })}
                          className="flex-1"
                        />
                        <span className="text-xs text-gray-400 w-7">{selectedEl.glowRadius ?? 20}</span>
                        <input type="color" value={selectedEl.glowColor ?? '#ffffff'}
                          onChange={e => updateElement(selectedElId, { glowColor: e.target.value })}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0" title="Glow color"
                        />
                      </>
                    )}
                  </div>
                  {/* Background fill */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateElement(selectedElId, { bgFill: !selectedEl.bgFill })}
                        className={`text-xs px-2 py-1 rounded border transition-colors shrink-0 ${selectedEl.bgFill ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                      >BG Fill</button>
                      {selectedEl.bgFill && (
                        <>
                          <input type="color" value={selectedEl.bgColor ?? '#000000'}
                            onChange={e => updateElement(selectedElId, { bgColor: e.target.value })}
                            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0" title="Fill color"
                          />
                          <span className="text-[10px] text-gray-400">opacity</span>
                          <input type="range" min="0" max="1" step="0.05"
                            value={selectedEl.bgOpacity ?? 0.6}
                            onChange={e => updateElement(selectedElId, { bgOpacity: Number(e.target.value) })}
                            className="flex-1"
                          />
                          <span className="text-xs text-gray-400 w-7">{Math.round((selectedEl.bgOpacity ?? 0.6) * 100)}%</span>
                        </>
                      )}
                    </div>
                    {selectedEl.bgFill && (
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-[10px] text-gray-400 w-8">Pad</span>
                        <input type="range" min="0" max="40"
                          value={selectedEl.bgPadding ?? 12}
                          onChange={e => updateElement(selectedElId, { bgPadding: Number(e.target.value) })}
                          className="flex-1"
                        />
                        <span className="text-xs text-gray-400 w-7">{selectedEl.bgPadding ?? 12}px</span>
                        <span className="text-[10px] text-gray-400 w-8">R</span>
                        <input type="range" min="0" max="40"
                          value={selectedEl.bgRadius ?? 8}
                          onChange={e => updateElement(selectedElId, { bgRadius: Number(e.target.value) })}
                          className="flex-1"
                        />
                        <span className="text-xs text-gray-400 w-7">{selectedEl.bgRadius ?? 8}px</span>
                      </div>
                    )}
                  </div>
                  {/* Opacity */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-9 shrink-0">Opacity</span>
                    <input type="range" min="0" max="1" step="0.05"
                      value={selectedEl.opacity ?? 1}
                      onChange={e => updateElement(selectedElId, { opacity: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 w-12 text-right">{Math.round((selectedEl.opacity ?? 1) * 100)}%</span>
                  </div>
                  {/* Transform */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 shrink-0">Rotate</span>
                    <button onClick={() => updateElement(selectedElId, { rotation: ((selectedEl.rotation ?? 0) - 90 + 360) % 360 })} className="text-xs bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 px-2 py-1 rounded transition-colors">↺ 90°</button>
                    <button onClick={() => updateElement(selectedElId, { rotation: ((selectedEl.rotation ?? 0) + 90) % 360 })} className="text-xs bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 px-2 py-1 rounded transition-colors">↻ 90°</button>
                    <input type="range" min="-180" max="180"
                      value={selectedEl.rotation ?? 0}
                      onChange={e => updateElement(selectedElId, { rotation: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 w-10 text-right">{selectedEl.rotation ?? 0}°</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => updateElement(selectedElId, { flipH: !selectedEl.flipH })}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${selectedEl.flipH ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                    >↔ Flip H</button>
                    <button onClick={() => updateElement(selectedElId, { flipV: !selectedEl.flipV })}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${selectedEl.flipV ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                    >↕ Flip V</button>
                    {((selectedEl.rotation ?? 0) !== 0 || selectedEl.flipH || selectedEl.flipV) && (
                      <button onClick={() => updateElement(selectedElId, { rotation: 0, flipH: false, flipV: false })} className="text-[10px] text-gray-400 hover:text-gray-600">↺ reset</button>
                    )}
                  </div>
                  {/* Align to slide */}
                  <div className="space-y-1">
                    <span className="text-xs text-gray-400">Align to slide</span>
                    <div className="flex gap-1">
                      {[['⬅', 10], ['↔', 50], ['➡', 90]].map(([icon, x]) => (
                        <button key={x} onClick={() => updateElement(selectedElId, { x })}
                          className="flex-1 text-sm bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 py-1 rounded transition-colors"
                          title={x === 10 ? 'Align left' : x === 50 ? 'Center' : 'Align right'}
                        >{icon}</button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      {[['⬆', 10], ['⬛', 50], ['⬇', 90]].map(([icon, y]) => (
                        <button key={y} onClick={() => updateElement(selectedElId, { y })}
                          className="flex-1 text-sm bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 py-1 rounded transition-colors"
                          title={y === 10 ? 'Align top' : y === 50 ? 'Middle' : 'Align bottom'}
                        >{icon}</button>
                      ))}
                    </div>
                  </div>
                  {/* Z-order + duplicate */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 shrink-0">Layer</span>
                    <button onClick={() => bringForward(selectedElId)} className="flex-1 text-xs bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 py-1 rounded transition-colors">▲ Forward</button>
                    <button onClick={() => sendBackward(selectedElId)} className="flex-1 text-xs bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 py-1 rounded transition-colors">▼ Back</button>
                    <button onClick={() => duplicateElement(selectedElId)} className="flex-1 text-xs bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 py-1 rounded transition-colors">⧉ Dupe</button>
                  </div>
                </div>
              )}

              {/* ── Image element properties ───────────────────── */}
              {selectedEl?.type === 'image' && (
                <div className="space-y-2.5 pt-2 border-t border-gray-100">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <MediaUpload
                      accept="image"
                      label="Image"
                      currentUrl={selectedEl.url}
                      onUpload={async file => {
                        const result = await uploadMedia(file)
                        if (result?.url) updateElement(selectedElId, { url: result.url })
                        return result
                      }}
                      onRemove={() => updateElement(selectedElId, { url: null })}
                    />
                  </div>
                  {/* Width + Radius */}
                  {[
                    ['Width',  'width',        5, 100, 1,  40, '%'],
                    ['Radius', 'borderRadius', 0,  50, 1,   0, '%'],
                  ].map(([label, key, min, max, step, def, unit]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-9 shrink-0">{label}</span>
                      <input type="range" min={min} max={max} step={step}
                        value={selectedEl[key] ?? def}
                        onChange={e => updateElement(selectedElId, { [key]: Number(e.target.value) })}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-400 w-12 text-right">{selectedEl[key] ?? def}{unit}</span>
                    </div>
                  ))}
                  {/* Opacity */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-9 shrink-0">Opacity</span>
                    <input type="range" min="0" max="1" step="0.05"
                      value={selectedEl.opacity ?? 1}
                      onChange={e => updateElement(selectedElId, { opacity: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 w-12 text-right">{Math.round((selectedEl.opacity ?? 1) * 100)}%</span>
                  </div>
                  {/* Blend mode */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-9 shrink-0">Blend</span>
                    <select
                      value={selectedEl.blendMode ?? 'normal'}
                      onChange={e => updateElement(selectedElId, { blendMode: e.target.value })}
                      className="flex-1 text-xs bg-gray-50 text-gray-900 border border-gray-200 rounded-md px-2 py-1 focus:outline-none"
                    >
                      {['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  {/* CSS Filters */}
                  {[
                    ['Bright', 'filterBrightness', 0, 200, 1, 100, '%'],
                    ['Contrast','filterContrast',  0, 200, 1, 100, '%'],
                    ['Saturat','filterSaturate',   0, 200, 1, 100, '%'],
                    ['Hue',    'filterHue',        0, 360, 1,   0, '°'],
                    ['Blur',   'filterBlur',       0,  20, 0.5, 0, 'px'],
                    ['Gray',   'filterGrayscale',  0, 100, 1,   0, '%'],
                  ].map(([label, key, min, max, step, def, unit]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-9 shrink-0">{label}</span>
                      <input type="range" min={min} max={max} step={step}
                        value={selectedEl[key] ?? def}
                        onChange={e => updateElement(selectedElId, { [key]: Number(e.target.value) })}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-400 w-12 text-right">{selectedEl[key] ?? def}{unit}</span>
                      {(selectedEl[key] ?? def) !== def && (
                        <button onClick={() => updateElement(selectedElId, { [key]: def })} className="text-[10px] text-gray-400 hover:text-gray-600">↺</button>
                      )}
                    </div>
                  ))}
                  {/* Image glow */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateElement(selectedElId, { imgGlow: !selectedEl.imgGlow })}
                      className={`text-xs px-2 py-1 rounded border transition-colors shrink-0 ${selectedEl.imgGlow ? 'bg-yellow-500 border-yellow-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                    >Glow</button>
                    {selectedEl.imgGlow && (
                      <>
                        <input type="range" min="2" max="60"
                          value={selectedEl.imgGlowRadius ?? 20}
                          onChange={e => updateElement(selectedElId, { imgGlowRadius: Number(e.target.value) })}
                          className="flex-1"
                        />
                        <span className="text-xs text-gray-400 w-7">{selectedEl.imgGlowRadius ?? 20}</span>
                        <input type="color" value={selectedEl.imgGlowColor ?? '#3b82f6'}
                          onChange={e => updateElement(selectedElId, { imgGlowColor: e.target.value })}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0" title="Glow color"
                        />
                      </>
                    )}
                  </div>
                  {/* Image border */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateElement(selectedElId, { imgBorder: !selectedEl.imgBorder })}
                      className={`text-xs px-2 py-1 rounded border transition-colors shrink-0 ${selectedEl.imgBorder ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                    >Border</button>
                    {selectedEl.imgBorder && (
                      <>
                        <input type="range" min="1" max="20"
                          value={selectedEl.imgBorderWidth ?? 3}
                          onChange={e => updateElement(selectedElId, { imgBorderWidth: Number(e.target.value) })}
                          className="flex-1"
                        />
                        <span className="text-xs text-gray-400 w-7">{selectedEl.imgBorderWidth ?? 3}px</span>
                        <input type="color" value={selectedEl.imgBorderColor ?? '#ffffff'}
                          onChange={e => updateElement(selectedElId, { imgBorderColor: e.target.value })}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0" title="Border color"
                        />
                      </>
                    )}
                  </div>
                  {/* Transform */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 shrink-0">Rotate</span>
                    <button onClick={() => updateElement(selectedElId, { rotation: ((selectedEl.rotation ?? 0) - 90 + 360) % 360 })} className="text-xs bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 px-2 py-1 rounded transition-colors">↺ 90°</button>
                    <button onClick={() => updateElement(selectedElId, { rotation: ((selectedEl.rotation ?? 0) + 90) % 360 })} className="text-xs bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 px-2 py-1 rounded transition-colors">↻ 90°</button>
                    <input type="range" min="-180" max="180"
                      value={selectedEl.rotation ?? 0}
                      onChange={e => updateElement(selectedElId, { rotation: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 w-10 text-right">{selectedEl.rotation ?? 0}°</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => updateElement(selectedElId, { flipH: !selectedEl.flipH })}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${selectedEl.flipH ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                    >↔ Flip H</button>
                    <button onClick={() => updateElement(selectedElId, { flipV: !selectedEl.flipV })}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${selectedEl.flipV ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900'}`}
                    >↕ Flip V</button>
                    {((selectedEl.rotation ?? 0) !== 0 || selectedEl.flipH || selectedEl.flipV) && (
                      <button onClick={() => updateElement(selectedElId, { rotation: 0, flipH: false, flipV: false })} className="text-[10px] text-gray-400 hover:text-gray-600">↺ reset</button>
                    )}
                  </div>
                  {/* Align to slide */}
                  <div className="space-y-1">
                    <span className="text-xs text-gray-400">Align to slide</span>
                    <div className="flex gap-1">
                      {[['⬅', 10], ['↔', 50], ['➡', 90]].map(([icon, x]) => (
                        <button key={x} onClick={() => updateElement(selectedElId, { x })}
                          className="flex-1 text-sm bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 py-1 rounded transition-colors"
                          title={x === 10 ? 'Align left' : x === 50 ? 'Center' : 'Align right'}
                        >{icon}</button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      {[['⬆', 10], ['⬛', 50], ['⬇', 90]].map(([icon, y]) => (
                        <button key={y} onClick={() => updateElement(selectedElId, { y })}
                          className="flex-1 text-sm bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 py-1 rounded transition-colors"
                          title={y === 10 ? 'Align top' : y === 50 ? 'Middle' : 'Align bottom'}
                        >{icon}</button>
                      ))}
                    </div>
                  </div>
                  {/* Z-order + duplicate */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 shrink-0">Layer</span>
                    <button onClick={() => bringForward(selectedElId)} className="flex-1 text-xs bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 py-1 rounded transition-colors">▲ Forward</button>
                    <button onClick={() => sendBackward(selectedElId)} className="flex-1 text-xs bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 py-1 rounded transition-colors">▼ Back</button>
                    <button onClick={() => duplicateElement(selectedElId)} className="flex-1 text-xs bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 py-1 rounded transition-colors">⧉ Dupe</button>
                  </div>
                </div>
              )}

                {elements.length > 0 && !selectedEl && (
                  <p className="text-xs text-gray-300 text-center pt-1">Click an element on the slide to edit it</p>
                )}
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
        )
      })()}

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
          <Field label="Label">
            <TextInput value={data.questionLabel ?? ''} onChange={v => onChange('questionLabel', v)} placeholder="Q5" />
          </Field>
          <Field label="#">
            <NumberInput value={data.questionNumber} onChange={v => onChange('questionNumber', v)} />
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
          <Field label="Shared Answer" hint="Only needed if every part has the SAME answer — leave blank if each part below has its own">
            <TextInput value={data.answer ?? ''} onChange={v => onChange('answer', v)} placeholder="Optional — used when a part has no answer of its own" />
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
      {(schemaType === 'image' || schemaType === 'audio' || schemaType === 'video') && (
        <MediaUpload
          accept={schemaType}
          label={schemaType === 'image' ? 'Image' : schemaType === 'audio' ? 'Audio File' : 'Video File'}
          currentUrl={media?.url}
          currentType={media?.type}
          onUpload={onUploadMedia}
          onRemove={() => onChange({ ...part, mediaSlots: [] })}
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
