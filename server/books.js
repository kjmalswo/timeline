import { getSchema } from '@tiptap/core'
import { ALIGNS, COLORS, inRange, LETTER_SPACING_RANGE, MAX_PARAGRAPH_SPACING, TEXT_SIZE_RANGE, writingExtensions } from '../src/document.js'
import { COVERS, FONTS, PAPERS, STATUSES, TEMPLATES } from '../src/catalog.js'
import {
  COVER_LAYER_LIMIT, COVER_STROKE_LIMIT, COVER_TEXT_LIMIT, SPINE_WIDTH_RANGE, STROKE_POINT_LIMIT, coverAlignments, photoFits, validColor,
} from '../src/cover-model.js'
import { BOOK_PHOTO_LIMIT, bookPhotoLength, isPhoto } from '../src/media.js'
import { IMAGE_ALIGNS, imageRatio, imageWidth } from '../src/manuscript-image.js'
import { NOTE_BODY_LIMIT, NOTE_KINDS, NOTE_LIMIT, NOTE_TITLE_LIMIT } from '../src/writer-notes.js'
import { headingAlignments, headingSize } from '../src/chapter-heading.js'
import { pageNumberPosition } from '../src/page-numbers.js'

const schema = getSchema(writingExtensions)
const nodeTypes = new Set(Object.keys(schema.nodes))
const markTypes = new Set(Object.keys(schema.marks))

export const identifier = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function invalid() {
  throw new Error('Invalid manuscript')
}

function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) invalid()
  return value.trim()
}

function range(value, min, max) {
  if (!inRange(value, min, max)) invalid()
  return value
}

function optionalText(value, maximum = 160) {
  if (typeof value !== 'string' || value.length > maximum) invalid()
  return value
}

function sanitizeCover(design) {
  if (!Array.isArray(design?.layers) || design.layers.length > COVER_LAYER_LIMIT ||
      (design.background !== null && !validColor(design.background))) invalid()
  const seen = new Set()
  const layers = design.layers.map(layer => {
    if (typeof layer?.id !== 'string' || !identifier.test(layer.id) || seen.has(layer.id)) invalid()
    seen.add(layer.id)
    const { id, type } = layer
    if (type === 'ink') {
      if (!Array.isArray(layer.strokes) || layer.strokes.length > COVER_STROKE_LIMIT) invalid()
      const strokes = layer.strokes.map(stroke => {
        if (!validColor(stroke?.color) || !Array.isArray(stroke.points) ||
            stroke.points.length < 1 || stroke.points.length > STROKE_POINT_LIMIT) invalid()
        const points = stroke.points.map(point => {
          if (!Array.isArray(point) || point.length !== 2) invalid()
          return [range(point[0], 0, 100), range(point[1], 0, 100)]
        })
        return { color: stroke.color, size: range(stroke.size, 1, 32), points }
      })
      return { id, type, strokes }
    }
    const placement = {
      id, type, x: range(layer.x, 0, 100), y: range(layer.y, 0, 100), w: range(layer.w, 4, 100),
      angle: range(layer.angle, -180, 180), opacity: range(layer.opacity, 0, 1),
    }
    if (type === 'photo') {
      if (!isPhoto(layer.src) || !photoFits.includes(layer.fit)) invalid()
      return {
        ...placement, src: layer.src, alt: optionalText(layer.alt), h: range(layer.h, 4, 100),
        fit: layer.fit, brightness: range(layer.brightness, 0.4, 1.6),
        cropX: range(layer.cropX, 0, 100), cropY: range(layer.cropY, 0, 100), flip: layer.flip === true,
      }
    }
    if (type !== 'text' || !['title', 'author'].includes(layer.role) || !Object.hasOwn(FONTS, layer.font) ||
        !validColor(layer.color) || !coverAlignments.includes(layer.align)) invalid()
    return {
      ...placement, role: layer.role, text: optionalText(layer.text, COVER_TEXT_LIMIT), font: layer.font,
      color: layer.color, size: range(layer.size, 2, 22), align: layer.align, bold: layer.bold === true,
    }
  })
  return { background: design.background, layers }
}

function sanitizeSpine(spine) {
  if (!validColor(spine.background) || !validColor(spine.color) || !Object.hasOwn(FONTS, spine.font)) invalid()
  return {
    width: range(spine.width, SPINE_WIDTH_RANGE.min, SPINE_WIDTH_RANGE.max),
    title: optionalText(spine.title, COVER_TEXT_LIMIT), author: optionalText(spine.author, COVER_TEXT_LIMIT),
    font: spine.font, color: spine.color, background: spine.background,
  }
}

function sanitizeWriterNotes(notes, chapters) {
  if (!Array.isArray(notes) || notes.length > NOTE_LIMIT) invalid()
  const seen = new Set()
  return notes.map(note => {
    if (typeof note?.id !== 'string' || !identifier.test(note.id) || seen.has(note.id) || !NOTE_KINDS.includes(note.kind)) invalid()
    seen.add(note.id)
    return {
      id: note.id, kind: note.kind, title: optionalText(note.title, NOTE_TITLE_LIMIT),
      body: optionalText(note.body, NOTE_BODY_LIMIT), chapterId: chapters.has(note.chapterId) ? note.chapterId : null,
      ...(note.kind === 'character' || note.kind === 'timeline' ? { detail: optionalText(note.detail, NOTE_TITLE_LIMIT) } : {}),
      ...(note.kind === 'foreshadow' ? {
        payoffChapterId: chapters.has(note.payoffChapterId) ? note.payoffChapterId : null, resolved: note.resolved === true,
      } : {}),
    }
  })
}

function sanitizeHeadingStyle(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) invalid()
  const style = {}
  if (headingAlignments.includes(source.align)) style.align = source.align
  if (inRange(source.fontSize, headingSize.min, headingSize.max)) style.fontSize = source.fontSize
  if (validColor(source.color)) style.color = source.color
  if (Object.hasOwn(FONTS, source.font)) style.font = source.font
  if (typeof source.bold === 'boolean') style.bold = source.bold
  return style
}

function sanitizeDocument(document) {
  let nodes = 0
  function visit(value, depth) {
    if (!value || depth > 40 || ++nodes > 70_000 || !nodeTypes.has(value.type)) invalid()
    const node = { type: value.type }
    if (value.type === 'text') {
      if (typeof value.text !== 'string' || !value.text || value.text.length > 300_000) invalid()
      node.text = value.text
    }
    if (value.content !== undefined) {
      if (!Array.isArray(value.content)) invalid()
      node.content = value.content.map(child => visit(child, depth + 1))
    }
    if (value.type === 'paragraph' || value.type === 'heading') {
      const attrs = value.attrs ?? {}
      node.attrs = {}
      if (value.type === 'heading') {
        if (![1, 2, 3].includes(attrs.level)) invalid()
        node.attrs.level = attrs.level
      }
      if (ALIGNS.includes(attrs.align)) node.attrs.align = attrs.align
      if (inRange(attrs.firstLine, 0, 6)) node.attrs.firstLine = attrs.firstLine
      if (inRange(attrs.blockIndent, 0, 10)) node.attrs.blockIndent = attrs.blockIndent
      if (inRange(attrs.lineHeight, 1, 3)) node.attrs.lineHeight = attrs.lineHeight
      if (inRange(attrs.paragraphSpacing, 0, MAX_PARAGRAPH_SPACING)) node.attrs.paragraphSpacing = attrs.paragraphSpacing
    }
    if (value.type === 'manuscriptImage') {
      const attrs = value.attrs
      if (!isPhoto(attrs?.src)) invalid()
      node.attrs = {
        src: attrs.src, alt: optionalText(attrs.alt ?? ''), width: imageWidth(attrs.width),
        align: IMAGE_ALIGNS.includes(attrs.align) ? attrs.align : 'center', ratio: imageRatio(attrs.ratio),
      }
    }
    if (value.type === 'orderedList' && Number.isSafeInteger(value.attrs?.start)) {
      node.attrs = { start: range(value.attrs.start, 1, 100_000) }
    }
    if (value.marks !== undefined) {
      if (!Array.isArray(value.marks) || value.marks.length > 10) invalid()
      node.marks = value.marks.map(mark => {
        if (!mark || !markTypes.has(mark.type)) invalid()
        if (mark.type !== 'textStyle') return { type: mark.type }
        const source = mark.attrs ?? {}
        const attrs = {}
        if (Object.hasOwn(FONTS, source.font)) attrs.font = source.font
        if (inRange(source.fontSize, TEXT_SIZE_RANGE.min, TEXT_SIZE_RANGE.max)) attrs.fontSize = source.fontSize
        if (inRange(source.letterSpacing, LETTER_SPACING_RANGE.min, LETTER_SPACING_RANGE.max)) attrs.letterSpacing = source.letterSpacing
        if (COLORS.includes(source.color)) attrs.color = source.color
        return { type: mark.type, attrs }
      })
    }
    return node
  }
  const clean = visit(document, 0)
  if (clean.type !== 'doc') invalid()
  schema.nodeFromJSON(clean).check()
  return clean
}

export function sanitizeBook(source, id) {
  if (!source || !identifier.test(id) || !Object.hasOwn(TEMPLATES, source.template) ||
      !Object.hasOwn(COVERS, source.cover) || !Object.hasOwn(STATUSES, source.status)) invalid()
  const { layout, chapters } = source
  if (!layout?.margins || !Object.hasOwn(PAPERS, layout.paper) || !Object.hasOwn(FONTS, layout.font) ||
      !Array.isArray(chapters) || !chapters.length || chapters.length > 200) invalid()
  if (layout.pageNumberPosition != null && pageNumberPosition(layout) !== layout.pageNumberPosition) invalid()
  const seen = new Set()
  const cleanChapters = chapters.map(chapter => {
    if (typeof chapter?.id !== 'string' || !identifier.test(chapter.id) || seen.has(chapter.id)) invalid()
    seen.add(chapter.id)
    const heading = chapter.heading == null ? null : {
      label: chapter.heading.label == null ? null : optionalText(chapter.heading.label).trim(),
      labelStyle: sanitizeHeadingStyle(chapter.heading.labelStyle), titleStyle: sanitizeHeadingStyle(chapter.heading.titleStyle),
    }
    return { id: chapter.id, title: optionalText(chapter.title).trim(), content: sanitizeDocument(chapter.content), ...(heading ? { heading } : {}) }
  })
  const margins = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [side, range(layout.margins[side], 5, 40)]))
  const activeChapterId = seen.has(source.activeChapterId) ? source.activeChapterId : cleanChapters[0].id
  const cursor = source.cursor && [source.cursor.anchor, source.cursor.head].every(position =>
    Number.isSafeInteger(position) && inRange(position, 0, 8_000_000)
  ) ? { anchor: source.cursor.anchor, head: source.cursor.head } : null
  const coverDesign = source.coverDesign == null ? null : sanitizeCover(source.coverDesign)
  const spine = source.spine == null ? null : sanitizeSpine(source.spine)
  const writerNotes = source.writerNotes == null ? [] : sanitizeWriterNotes(source.writerNotes, seen)
  if (bookPhotoLength({ chapters: cleanChapters, coverDesign }) > BOOK_PHOTO_LIMIT) invalid()
  return {
    id, title: name(source.title), template: source.template, cover: source.cover, status: source.status,
    favorite: source.favorite === true, trashed: source.trashed === true, chapters: cleanChapters,
    layout: {
      paper: layout.paper, font: layout.font, margins,
      fontSize: range(layout.fontSize, TEXT_SIZE_RANGE.min, TEXT_SIZE_RANGE.max),
      ...(layout.letterSpacing == null ? {} : { letterSpacing: range(layout.letterSpacing, LETTER_SPACING_RANGE.min, LETTER_SPACING_RANGE.max) }),
      lineHeight: range(layout.lineHeight, 1, 3),
      ...(layout.paragraphSpacing == null ? {} : { paragraphSpacing: range(layout.paragraphSpacing, 0, MAX_PARAGRAPH_SPACING) }),
      ...(layout.paragraphSpacingUnit == null ? {} : { paragraphSpacingUnit: range(layout.paragraphSpacingUnit, TEXT_SIZE_RANGE.min, TEXT_SIZE_RANGE.max) }),
      ...(layout.pageNumberPosition == null ? {} : { pageNumberPosition: layout.pageNumberPosition }),
      firstLine: range(layout.firstLine, 0, 6),
    },
    activeChapterId, cursor,
    ...(coverDesign ? { coverDesign } : {}),
    ...(spine ? { spine } : {}),
    ...(writerNotes.length ? { writerNotes } : {}),
  }
}
