import { FONTS } from './catalog.js'

export const headingAlignments = ['left', 'center', 'right']
export const headingSize = { min: 6, max: 48 }
export const headingDefaults = {
  labelStyle: { fontSize: 9, color: '#75608c' },
  titleStyle: { fontSize: 17, color: '#292433' },
}

export function chapterNumber(index) {
  return `제 ${index + 1}장`
}

export function chapterLabel(chapter, index) {
  return chapter.heading?.label ?? chapterNumber(index)
}

export function chapterName(chapter, index) {
  return chapter.title || chapterLabel(chapter, index) || chapterNumber(index)
}

export function headingStyle(style = {}) {
  return {
    textAlign: style.align,
    fontSize: style.fontSize == null ? undefined : style.fontSize + 'pt',
    color: style.color,
    fontFamily: FONTS[style.font]?.family,
    fontWeight: style.bold == null ? undefined : style.bold ? 760 : 490,
  }
}
