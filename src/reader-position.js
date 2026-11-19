import { PAPERS, pixelsPerMillimeter } from './catalog.js'

const gap = 5

export function readerPageSize(box, layout, mode) {
  const visible = box.width >= 720 && mode !== 'single' ? 2 : 1
  const paper = PAPERS[layout.paper]
  const pixels = millimeters => Math.round(millimeters * pixelsPerMillimeter)
  const width = pixels(paper.width)
  const height = pixels(paper.height)
  const left = pixels(layout.margins.left)
  const right = pixels(layout.margins.right)
  const top = pixels(layout.margins.top)
  const bottom = pixels(layout.margins.bottom)
  const spreadWidth = width * visible + gap * (visible - 1)
  const fit = Math.min(box.width / spreadWidth, box.height / height)
  return { visible, width, height, left, right, top, bottom, gap, pitch: width + gap, spreadWidth, fit,
    textWidth: width - left - right, textHeight: height - top - bottom }
}

export function measureReaderPages(flow, pitch, textWidth) {
  const bounds = flow.getBoundingClientRect()
  const scale = bounds.width / textWidth
  if (scale <= 0) return null

  const starts = Array.from(flow.querySelectorAll('[data-chapter-anchor]'), anchor =>
    Math.max(0, Math.round((anchor.getBoundingClientRect().left - bounds.left) / (pitch * scale))))
  // Some layouts underreport the horizontally overflowing columns. Include the last chapter's rendered fragments.
  const lastChapter = flow.lastElementChild?.getBoundingClientRect()
  const renderedEnd = lastChapter ? (lastChapter.right - bounds.left) / scale : 0
  const count = Math.max(1, (starts.at(-1) ?? 0) + 1,
    Math.ceil((flow.scrollWidth - textWidth - 2) / pitch) + 1,
    Math.ceil(renderedEnd / pitch))
  return { count, starts }
}

export function pageForSpread(page, count, visible) {
  if (!count || !Number.isFinite(page) || page < 0) return -1
  return Math.floor(Math.min(page, count - 1) / visible) * visible
}

export function readingPoint(page, starts, count, chapters) {
  if (page < 0 || !count) return null
  const index = Math.max(0, starts.findLastIndex(start => start <= page))
  const start = starts[index]
  const length = (starts[index + 1] ?? count) - start
  return { id: chapters[index].id, index, fraction: (page - start) / Math.max(1, length) }
}

export function bookmarkPage(point, starts, count, chapters) {
  if (!point || !count || !starts.length) return -1
  const index = chapters.findIndex(chapter => chapter.id === point.id)
  const fallback = Number.isInteger(point.index) ? Math.max(0, Math.min(point.index, starts.length - 1)) : 0
  const chapter = index < 0 ? fallback : index
  const start = starts[chapter]
  const length = Math.max(1, (starts[chapter + 1] ?? count) - start)
  const fraction = Number.isFinite(point.fraction) ? Math.max(0, Math.min(point.fraction, 1)) : 0
  return start + Math.min(length - 1, Math.round(fraction * length))
}
