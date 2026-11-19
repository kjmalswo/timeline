import { coverAuthor } from './cover-model.js'

export const shareLinkPattern = /^[a-f0-9]{48}$/

export function isReadableBook(book) {
  return book?.status === 'complete' && !book.trashed
}

export function readingCopy(book) {
  return {
    title: book.title,
    author: coverAuthor(book) || book.spine?.author?.trim() || '',
    layout: book.layout,
    cover: book.cover,
    coverDesign: book.coverDesign ?? null,
    chapters: book.chapters.map(({ id, title, content, heading }) => ({ id, title, content, ...(heading ? { heading } : {}) })),
  }
}
