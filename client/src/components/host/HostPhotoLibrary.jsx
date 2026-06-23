import { useState, useEffect } from 'react'
import MediaUpload from './MediaUpload.jsx'

export default function HostPhotoLibrary({ getHostPhotos, uploadMedia, currentPhotoUrl, onSelectPhoto }) {
  const [photos, setPhotos] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setLoading(true)
      getHostPhotos().then(p => { setPhotos(p); setLoading(false) })
    }
  }, [open, getHostPhotos])

  async function handleUpload(file) {
    const result = await uploadMedia(file, true)
    if (result?.url) setPhotos(prev => [...prev, { url: result.url, filename: result.filename }])
    return result
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

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Upload new */}
              <MediaUpload
                accept="image"
                label="Upload new photo"
                onUpload={handleUpload}
                onRemove={() => {}}
              />

              {/* Photo grid */}
              {loading ? (
                <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
              ) : photos.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No photos yet — upload one above</p>
              ) : (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Library</p>
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map(photo => (
                      <button
                        key={photo.url}
                        onClick={() => { onSelectPhoto(photo.url); setOpen(false) }}
                        className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                          photo.url === currentPhotoUrl ? 'border-baynes-forest' : 'border-transparent hover:border-gray-300'
                        }`}
                      >
                        <img src={photo.url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
