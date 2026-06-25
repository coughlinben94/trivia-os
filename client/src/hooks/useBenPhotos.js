import { useState, useEffect, useMemo } from 'react'

export function useBenPhotos() {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/ben-photos')
      .then(r => r.json())
      .then(data => {
        setPhotos(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        setPhotos([])
      })
      .finally(() => setLoading(false))
  }, [])

  // Picked once on mount — stable across re-renders
  const randomPhoto = useMemo(() => {
    if (photos.length === 0) return null
    return photos[Math.floor(Math.random() * photos.length)]
  }, [photos])

  return { photos, randomPhoto, loading }
}
