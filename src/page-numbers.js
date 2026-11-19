import { FONTS } from './catalog.js'

export const PAGE_NUMBER_POSITIONS = {
  outside: '바깥쪽 아래',
  center: '아래 가운데',
  left: '왼쪽 아래',
  right: '오른쪽 아래',
}

export function pageNumberPosition(layout) {
  const position = layout.pageNumberPosition
  return typeof position === 'string' && Object.hasOwn(PAGE_NUMBER_POSITIONS, position) ? position : 'outside'
}

export function pageNumberAlignment(position, index) {
  if (position !== 'outside') return position
  return index % 2 === 0 ? 'left' : 'right'
}

export function printPageNumbers(layout) {
  const position = pageNumberPosition(layout)
  const marginBox = align => `@bottom-${align} { content: counter(page); text-align: ${align}; vertical-align: middle;
    font: 9pt ${FONTS[layout.font].family}; color: #4e4161; }`
  if (position === 'outside') {
    return `@page yeobaek-text:left { ${marginBox('left')} }
      @page yeobaek-text:right { ${marginBox('right')} }`
  }
  return `@page yeobaek-text { ${marginBox(position)} }`
}
