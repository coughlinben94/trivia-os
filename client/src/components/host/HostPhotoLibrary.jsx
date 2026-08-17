import { useState, useEffect, useRef } from 'react'

export default function HostPhotoLibrary({ getHostPhotos, uploadMedia, currentPhotoUrl, onSelectPhoto, hasRandomFallback = false, usedPhotoUrls }) {
  const [photos, setPhotos] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setLoading(true)
      getHostPhotos().then(p => { setPhotos(p); setLoading(false) })
    }
  }, [open, getHostPhotos])

  async function handleUpload(file) {
    if (!file) return
    setUploading(true)
    try {
      const result = await uploadMedia(file, true)
      if (result?.url) setPhotos(prev => [...prev, { url: result.url, filename: result.filename }])
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-700 mb-1.5">Ben Photo</p>

      {/* Current photo */}
      {currentPhotoUrl ? (
        <div className="relative inline-block mb-2">
          <img src={currentPhotoUrl} alt="Host photo" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
          <button
            onClick={() => onSelectPhoto(null)}
            className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 text-gray-500 text-xs rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-50 hover:text-red-500 shadow-sm"
          >
            ✕
          </button>
        </div>
      ) : hasRandomFallback && currentPhotoUrl === null ? (
        // Explicitly hidden — distinct from "unset" so it doesn't quietly
        // fall back to a random pool photo again on the next slide mount.
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs text-gray-400">No photo on this slide</p>
          <button
            onClick={() => onSelectPhoto(undefined)}
            className="text-xs text-baynes-forest hover:text-green-800 font-medium"
          >
            🎲 Use random photo
          </button>
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-baynes-forest hover:text-green-800 font-medium"
          >
            📷 Choose photo
          </button>
        </div>
      ) : hasRandomFallback ? (
        // Unset — a random photo from the shared pool is showing live.
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs text-gray-400">🎲 Using a random photo</p>
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-baynes-forest hover:text-green-800 font-medium"
          >
            Choose specific…
          </button>
          <button
            onClick={() => onSelectPhoto(null)}
            className="text-xs text-gray-400 hover:text-red-500 font-medium"
          >
            Hide photo
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-baynes-forest hover:text-green-800 font-medium flex items-center gap-1.5 mb-2"
        >
          <span>📷</span> Add Ben Photo
        </button>
      )}

      {/* Photo picker modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Ben Photo Library</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {/* Upload tile — first cell in the same grid, not a separate
                      section above it (Ben, 2026-08-17: the upload button
                      should live inside the library, not read as its own
                      screen before it). Drag-and-drop still works here. */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => {
                      e.preventDefault()
                      setDragging(false)
                      const file = e.dataTransfer.files[0]
                      if (file) handleUpload(file)
                    }}
                    disabled={uploading}
                    className={`aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
                      dragging ? 'border-baynes-forest bg-green-50' : 'border-gray-200 hover:border-baynes-forest hover:bg-gray-50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.gif,.webp"
                      onChange={e => { const f = e.target.files[0]; if (f) handleUpload(f); e.target.value = '' }}
                      className="hidden"
                    />
                    <span className="text-lg text-gray-400">{uploading ? '…' : '+'}</span>
                    <span className="text-[10px] text-gray-400 text-center px-1">{uploading ? 'Uploading' : 'Upload'}</span>
                  </button>

                  {photos.map(photo => {
                    const isUsed = usedPhotoUrls?.has(photo.url)
                    return (
                      <button
                        key={photo.url}
                        onClick={() => { onSelectPhoto(photo.url); setOpen(false) }}
                        title={isUsed ? 'Already used elsewhere in this show' : undefined}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                          photo.url === currentPhotoUrl ? 'border-baynes-forest' : 'border-transparent hover:border-gray-300'
                        }`}
                      >
                        <img src={photo.url} alt="" className={`w-full h-full object-cover ${isUsed ? 'opacity-40' : ''}`} />
                        {isUsed && (
                          <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[9px] font-medium px-1 py-0.5 rounded">
                            Used
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
