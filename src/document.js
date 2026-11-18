import { Extension } from '@tiptap/core'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { FONTS } from './catalog.js'

export const TEXT_SIZES = [8, 9, 10, 10.5, 11, 11.5, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48]
export const LETTER_SPACINGS = [-0.08, -0.04, -0.02, 0, 0.02, 0.04, 0.08, 0.12]
export const LINE_HEIGHTS = [1.2, 1.4, 1.5, 1.65, 1.75, 1.85, 2, 2.25, 2.5]
export const INDENTS = [0, 0.5, 1, 1.5, 2, 3]
export const BLOCK_INDENTS = [0, 1, 2, 3, 4, 5]
export const ALIGNS = ['left', 'center', 'right', 'justify']
export const COLORS = ['#292433', '#7a42c8', '#325842', '#96374c', '#846026', '#285e81']

export function inRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function parseStyleNumber(element, property, unit, min, max) {
  const raw = element.style[property]
  if (!raw || (unit && !raw.endsWith(unit))) return null
  const value = Number(unit ? raw.slice(0, -unit.length) : raw)
  return inRange(value, min, max) ? value : null
}

function numberStyle(attribute, property, cssName, unit, min, max) {
  return {
    default: null,
    parseHTML: element => parseStyleNumber(element, property, unit, min, max),
    renderHTML: attrs => inRange(attrs[attribute], min, max) ? { style: cssName + ': ' + attrs[attribute] + unit } : {},
  }
}

const WritingStyle = Extension.create({
  name: 'writingStyle',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          font: {
            default: null,
            parseHTML: element => {
              const family = element.style.fontFamily.replace(/["']/g, '')
              return Object.keys(FONTS).find(key => family === FONTS[key].family.replace(/"/g, '')) ?? null
            },
            renderHTML: attrs => Object.hasOwn(FONTS, attrs.font) ? { style: 'font-family: ' + FONTS[attrs.font].family } : {},
          },
          fontSize: numberStyle('fontSize', 'fontSize', 'font-size', 'pt', 6, 72),
          letterSpacing: numberStyle('letterSpacing', 'letterSpacing', 'letter-spacing', 'em', -0.15, 0.3),
          color: {
            default: null,
            parseHTML: element => COLORS.find(color => {
              const rgb = color.slice(1).match(/../g).map(byte => parseInt(byte, 16))
              return element.style.color === color || element.style.color === 'rgb(' + rgb.join(', ') + ')'
            }) ?? null,
            renderHTML: attrs => COLORS.includes(attrs.color) ? { style: 'color: ' + attrs.color } : {},
          },
        },
      },
      {
        types: ['paragraph', 'heading'],
        attributes: {
          align: {
            default: null,
            parseHTML: element => ALIGNS.includes(element.style.textAlign) ? element.style.textAlign : null,
            renderHTML: attrs => ALIGNS.includes(attrs.align) ? { style: 'text-align: ' + attrs.align } : {},
          },
          firstLine: numberStyle('firstLine', 'textIndent', 'text-indent', 'em', 0, 6),
          blockIndent: numberStyle('blockIndent', 'marginInlineStart', 'margin-inline-start', 'em', 0, 10),
          lineHeight: numberStyle('lineHeight', 'lineHeight', 'line-height', '', 1, 3),
        },
      },
    ]
  },
})

export const writingExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, codeBlock: false, strike: false, code: false }),
  TextStyle,
  WritingStyle,
]

export function paperStyle(layout) {
  return {
    '--paper-font': FONTS[layout.font].family,
    '--paper-font-size': layout.fontSize + 'pt',
    '--paper-line-height': layout.lineHeight,
    '--paper-indent': layout.firstLine + 'em',
  }
}
