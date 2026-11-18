import { Node } from '@tiptap/core'
import { isPhoto } from './media.js'

export const IMAGE_ALIGNS = ['left', 'center', 'right']

export function imageWidth(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 15 && value <= 100 ? value : 75
}

export function imageRatio(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.125 && value <= 8 ? value : null
}

export const ManuscriptImage = Node.create({
  name: 'manuscriptImage',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      width: { default: 75 },
      align: { default: 'center' },
      ratio: { default: null },
    }
  },
  parseHTML() {
    return [{
      tag: 'figure[data-manuscript-image]',
      getAttrs(element) {
        const img = element.querySelector('img')
        const src = img?.getAttribute('src')
        if (!isPhoto(src)) return false
        return {
          src,
          alt: (img.getAttribute('alt') ?? '').slice(0, 160),
          width: imageWidth(Number(element.getAttribute('data-width'))),
          align: IMAGE_ALIGNS.includes(element.dataset.align) ? element.dataset.align : 'center',
          ratio: imageRatio(Number(element.getAttribute('data-ratio'))),
        }
      },
    }]
  },
  renderHTML({ node }) {
    const { src, alt, width, align, ratio } = node.attrs
    const size = imageWidth(width)
    return ['figure', {
      'data-manuscript-image': '',
      'data-align': IMAGE_ALIGNS.includes(align) ? align : 'center',
      'data-width': size,
      ...(imageRatio(ratio) ? { 'data-ratio': ratio } : {}),
      style: '--manuscript-image-width:' + size + '%;' + (imageRatio(ratio) ? '--manuscript-image-ratio:' + ratio + ';' : ''),
    }, ['img', { ...(isPhoto(src) ? { src } : {}), alt: String(alt ?? '').slice(0, 160), draggable: 'false' }]]
  },
})
