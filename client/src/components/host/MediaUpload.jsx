import { useEffect, useRef, useState } from 'react'

const ACCEPT_IMAGE = '.jpg,.jpeg,.png,.gif,.webp'
const ACCEPT_AUDIO = '.mp3,.wav,.m4a,.ogg'
const ACCEPT_ALL   = `${ACCEPT_IMAGE},${ACCEPT_AUDIO}`

function isImage(file) { return file.type.startsWith('image/') }
function isAudio(file) { return file.type.startsWith('audio/') }

// popup (2026-08-19, Ben: "the pop up wizard is way easier than the right
// hand rail wizard in reality") — same upload/drag-drop/paste logic, just
// rendered as a compact trigger + centered modal instead of always-inline,
// for the two shiny-visual-question call sites in SlideEditor.jsx that were
// cluttering the rail. Every other call site (Custom, Grid, Venn, Matching,
// audio uploads, etc.) is untouched — still inline, `popup` defaults false —
// deliberately not migrated wholesale; see MediaUpload's git history if this
// gets extended to more call sites later.
export default function MediaUpload({ accept = 'all', currentUrl, currentType, onUpload, onRemove, label, popup = false }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  const acceptAttr = accept === 'image' ? ACCEPT_IMAGE : accept === 'audio' ? ACCEPT_AUDIO : ACCEPT_ALL

  async function handleFile(file) {
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { setError('File is too large — max 50MB.'); return }
    setError(null)
    setUploading(true)
    try {
      const result = await onUpload(file)
      if (result?.url) { if (popup) setOpen(false) }
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleInput(e) {
    const file = e.target.files[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  // Paste support (Opus 5 review, 2026-08-19) — a `paste` event needs no
  // permission prompt (unlike navigator.clipboard.read()), so this is safe
  // to attach directly. Guarded to never interfere with a normal text paste
  // elsewhere on the page: only acts when the clipboard actually carries an
  // image, and only calls preventDefault() in that case — a text paste into
  // some other field on the page falls through completely untouched.
  // e.defaultPrevented check means if two of these happen to be mounted at
  // once, only the first to see the event handles it, not both.
  useEffect(() => {
    if (popup && !open) return
    function onPaste(e) {
      if (e.defaultPrevented) return
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'))
      if (!item) return
      e.preventDefault()
      const file = item.getAsFile()
      if (file) handleFile(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [popup, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape-to-close, matching FormatLibrary.jsx's modal pattern.
  useEffect(() => {
    if (!popup || !open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popup, open])

  const hasMedia = Boolean(currentUrl)
  const mediaIsImage = currentType?.startsWith('image/') || (currentUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(currentUrl))
  const mediaIsAudio = currentType?.startsWith('audio/') || (currentUrl && /\.(mp3|wav|m4a|ogg)$/i.test(currentUrl))

  const body = (
    <div className="space-y-2">
      {/* In popup mode the modal header already shows label as its title —
          this line would be a third redundant repeat alongside the trigger's
          own label line below. */}
      {label && !popup && <p className="text-xs font-medium text-gray-700">{label}</p>}

      {/* Current media preview */}
      {hasMedia && (
        <div className="relative rounded-lg overflow-hidden border border-gray-200">
          {mediaIsImage && (
            <img
              src={currentUrl}
              alt="Uploaded media"
              className="w-full h-36 object-cover bg-gray-100"
            />
          )}
          {mediaIsAudio && (
            <div className="flex items-center gap-3 p-3 bg-gray-800">
              <span className="text-2xl">🎵</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{currentUrl.split('/').pop()}</p>
                <audio controls src={currentUrl} className="mt-1 w-full h-7" style={{ colorScheme: 'dark' }} />
              </div>
            </div>
          )}
          <button
            onClick={onRemove}
            className="absolute top-1.5 right-1.5 bg-black/60 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-baynes-forest bg-green-50'
            : 'border-gray-200 hover:border-baynes-forest hover:bg-gray-50'
        } ${uploading ? 'pointer-events-none' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          onChange={handleInput}
          className="hidden"
        />
        {uploading ? (
          <p className="text-xs text-gray-500">Uploading…</p>
        ) : (
          <>
            <p className="text-xs font-medium text-gray-600">
              {hasMedia ? 'Replace' : 'Drop file or click to browse'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {accept === 'image' ? 'JPG, PNG, GIF, WebP' : accept === 'audio' ? 'MP3, WAV, M4A, OGG' : 'Images or audio · Max 50MB'}
              {accept !== 'audio' && ' · or paste (⌘V)'}
            </p>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )

  if (!popup) return body

  return (
    <div>
      {label && <p className="text-xs font-medium text-gray-700 mb-1.5">{label}</p>}
      {hasMedia ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative block rounded-lg overflow-hidden border border-gray-200 hover:border-baynes-forest transition-colors"
        >
          <img src={currentUrl} alt="Uploaded media" className="w-20 h-20 object-cover bg-gray-100" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-baynes-forest hover:text-green-800 font-medium flex items-center gap-1.5"
        >
          <span>🖼️</span> Add Image
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">{label || 'Image'}</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-4">
              {body}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
