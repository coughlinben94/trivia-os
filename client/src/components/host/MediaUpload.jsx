import { useRef, useState } from 'react'

const ACCEPT_IMAGE = '.jpg,.jpeg,.png,.gif,.webp'
const ACCEPT_AUDIO = '.mp3,.wav,.m4a,.ogg'
const ACCEPT_ALL   = `${ACCEPT_IMAGE},${ACCEPT_AUDIO}`

function isImage(file) { return file.type.startsWith('image/') }
function isAudio(file) { return file.type.startsWith('audio/') }

export default function MediaUpload({ accept = 'all', currentUrl, currentType, onUpload, onRemove, label }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const acceptAttr = accept === 'image' ? ACCEPT_IMAGE : accept === 'audio' ? ACCEPT_AUDIO : ACCEPT_ALL

  async function handleFile(file) {
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { setError('File is too large — max 50MB.'); return }
    setError(null)
    setUploading(true)
    try {
      const result = await onUpload(file)
      if (result?.url) { /* parent handles state update */ }
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

  const hasMedia = Boolean(currentUrl)
  const mediaIsImage = currentType?.startsWith('image/') || (currentUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(currentUrl))
  const mediaIsAudio = currentType?.startsWith('audio/') || (currentUrl && /\.(mp3|wav|m4a|ogg)$/i.test(currentUrl))

  return (
    <div className="space-y-2">
      {label && <p className="text-xs font-medium text-gray-700">{label}</p>}

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
            </p>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
