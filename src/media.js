export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
export const MAX_PHOTO_LENGTH = 720_000
export const BOOK_PHOTO_LIMIT = 5_400_000
const raster = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/

export function isPhoto(source) {
  return typeof source === 'string' && source.length <= MAX_PHOTO_LENGTH && raster.test(source)
}

export function bookPhotoLength(book, cover = book.coverDesign) {
  const count = node => node.type === 'manuscriptImage'
    ? (node.attrs?.src?.length ?? 0)
    : (node.content ?? []).reduce((sum, child) => sum + count(child), 0)
  const body = book.chapters.reduce((sum, chapter) => sum + count(chapter.content), 0)
  return body + (cover?.layers ?? []).reduce((sum, layer) => sum + (layer.type === 'photo' ? layer.src.length : 0), 0)
}

export async function importPhoto(file) {
  if (!PHOTO_ACCEPT.split(',').includes(file.type)) throw new Error('JPG, PNG, WebP 이미지 파일을 선택해 주세요.')
  if (file.size > 30 * 1024 * 1024) throw new Error('30MB 이하의 사진 파일을 선택해 주세요.')
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('사진을 읽을 수 없습니다. 다른 사진 파일을 선택해 주세요.')
  }
  try {
    const ratio = bitmap.width / bitmap.height
    let scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이 브라우저에서 사진을 열 수 없습니다.')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const src = canvas.toDataURL('image/webp', 0.87)
      if (isPhoto(src)) return { src, ratio, alt: file.name.replace(/\.[^.]+$/, '').slice(0, 160) }
      scale *= 0.72
    }
    throw new Error('사진이 너무 큽니다. 크기를 줄인 후 다시 선택해 주세요.')
  } finally {
    bitmap.close()
  }
}
