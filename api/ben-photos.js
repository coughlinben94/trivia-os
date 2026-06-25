import fs from 'fs'
import path from 'path'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

export default function handler(req, res) {
  const benDir = path.join(process.cwd(), 'public', 'ben')

  let files
  try {
    files = fs.readdirSync(benDir)
  } catch {
    return res.status(200).json([])
  }

  const photos = files
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .map(f => `/ben/${f}`)

  res.status(200).json(photos)
}
