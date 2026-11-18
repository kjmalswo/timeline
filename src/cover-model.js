import { COVERS, newId } from './catalog.js'

export const COVER_LAYER_LIMIT = 28
export const COVER_STROKE_LIMIT = 120
export const STROKE_POINT_LIMIT = 360
export const COVER_TEXT_LIMIT = 160
export const coverAlignments = ['left', 'center', 'right']
export const photoFits = ['contain', 'cover']
export const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

export function textLayer(book, role) {
  const title = role === 'title'
  return {
    id: newId(), type: 'text', role,
    text: title ? book.title : '',
    x: 10, y: title ? 15 : 78, w: 80,
    angle: 0, opacity: 1,
    color: COVERS[book.cover].ink, size: title ? 9 : 5,
    font: title ? 'serif' : 'sans', align: 'center', bold: title,
  }
}

export function initialCover(book) {
  return { background: null, layers: [textLayer(book, 'title')] }
}

export function photoLayer(photo, paper) {
  const ratio = photo.ratio * paper.height / paper.width
  const w = Math.min(76, 58 * ratio)
  const h = w / ratio
  return {
    id: newId(), type: 'photo', src: photo.src, alt: photo.alt,
    x: (100 - Math.max(4, w)) / 2, y: (100 - Math.max(4, h)) / 2,
    w: Math.max(4, w), h: Math.max(4, h),
    angle: 0, opacity: 1, brightness: 1, fit: 'contain',
    cropX: 50, cropY: 50, flip: false,
  }
}

export function coverLayerName(layer) {
  return layer.type === 'text' ? (layer.role === 'author' ? '저자' : '제목') :
    layer.type === 'photo' ? (layer.alt || '사진') : '손그림'
}
