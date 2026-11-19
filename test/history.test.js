import assert from 'node:assert/strict'
import test from 'node:test'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { sanitizeBook } from '../server/books.js'
import { makeDocument, newBook, newChapter } from '../src/catalog.js'
import { formatSelection, paragraphSpacing, paperStyle, updateManuscriptLayout, writingExtensions } from '../src/document.js'
import { bookChange, createHistory, restoreBook } from '../src/history.js'
import { historyShortcut } from '../src/keyboard.js'
import { createDocumentSerializer, editPosition, restoreManuscript, typingGroup } from '../src/manuscript-history.js'
import { pageNumberAlignment, pageNumberPosition, printPageNumbers } from '../src/page-numbers.js'
import { readingCopy } from '../src/reader-book.js'

test('editing history restores manuscript and settings in order without rolling back the cloud revision', () => {
  const history = createHistory()
  let book = newBook({ title: '원고', template: 'novel', paper: 'b6', cover: 'ivory' })
  const [first] = book.chapters
  const next = newChapter('다음 장')
  const schema = getSchema(writingExtensions)
  const serialize = createDocumentSerializer()
  let state = EditorState.create({ doc: schema.nodeFromJSON(makeDocument('', '그대로')) })
  let time = 0

  function edit(updated, options = {}) {
    history.record({ scope: book.id, ...bookChange(book, updated, options), group: options.group, time: ++time })
    book = updated
  }

  function step(direction) {
    const { value } = history.step(direction)
    book = restoreBook(book, value)
    return value.position
  }

  edit({ ...book, chapters: [{ ...first, content: serialize(state.doc) }] })
  const beforeTyping = book.chapters[0].content
  for (const letter of ['가', '나']) {
    const transaction = state.tr.insertText(letter)
    const written = state.apply(transaction)
    edit({ ...book, chapters: [{ ...first, content: serialize(written.doc) }] }, {
      beforePosition: editPosition(state, first.id), afterPosition: editPosition(written, first.id),
      group: typingGroup(state, written, transaction, first.id),
    })
    state = written
  }
  const writtenChapter = book.chapters[0]
  assert.equal(writtenChapter.content.content[1], beforeTyping.content[1])

  edit({ ...book, layout: { ...book.layout, lineHeight: 2, paragraphSpacing: 1.5, pageNumberPosition: 'center' } })
  edit({ ...book, chapters: [...book.chapters, next], activeChapterId: next.id })
  const note = { kind: 'foreshadow', chapterId: first.id, payoffChapterId: next.id }
  edit({ ...book, writerNotes: [note] })
  edit({ ...book, chapters: [next], writerNotes: [{ ...note, chapterId: null }] })
  book = { ...book, revision: 12, lastSaveId: 'newer-save' }

  step('undo')
  assert.deepEqual(book.chapters, [writtenChapter, next])
  assert.equal(book.writerNotes[0].chapterId, first.id)
  step('undo')
  step('undo')
  assert.equal(book.activeChapterId, first.id)
  assert.equal(book.chapters.length, 1)
  step('undo')
  assert.equal(book.layout.lineHeight, 1.75)
  assert.equal(paragraphSpacing(book.layout), 0.68)
  assert.equal(pageNumberPosition(book.layout), 'outside')
  const position = step('undo')
  assert.equal(book.chapters[0].content, beforeTyping)
  assert.equal(book.revision, 12)
  assert.equal(book.lastSaveId, 'newer-save')

  const view = { dispatch(transaction) { state = state.apply(transaction) } }
  restoreManuscript({ state, schema, view }, { content: book.chapters[0].content, position, cursor: position.cursor })
  assert.equal(state.doc.firstChild.textContent, '')
  assert.equal(state.selection.head, 1)

  step('redo')
  assert.equal(book.chapters[0].content, writtenChapter.content)
  step('redo')
  assert.equal(paragraphSpacing(book.layout), 1.5)
  assert.equal(pageNumberPosition(book.layout), 'center')
  edit({ ...book, favorite: true })
  assert.equal(history.canRedo, false)
  history.forget(book.id)
  assert.equal(history.canUndo, false)
})

test('formats show inherited, explicit and mixed values for the current selection', () => {
  const schema = getSchema(writingExtensions)
  const content = makeDocument('기본', '수정')
  content.content[1].attrs = { lineHeight: 2, firstLine: 0, paragraphSpacing: 0 }
  content.content[1].content[0].marks = [{ type: 'textStyle', attrs: { letterSpacing: 0.04 } }]
  let state = EditorState.create({ doc: schema.nodeFromJSON(content) })
  const layout = { lineHeight: 1.75, firstLine: 1, paragraphSpacing: 0.75 }
  assert.deepEqual(formatSelection(state, layout), {
    letterSpacing: { selected: '', base: 0 }, lineHeight: { selected: '', base: 1.75 }, firstLine: { selected: '', base: 1 },
    paragraphSpacing: { selected: '', base: 0.75 },
  })
  const secondParagraph = state.doc.firstChild.nodeSize + 2
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, secondParagraph)))
  assert.deepEqual(formatSelection(state, layout), {
    letterSpacing: { selected: 0.04, base: 0 }, lineHeight: { selected: 2, base: 1.75 }, firstLine: { selected: 0, base: 1 },
    paragraphSpacing: { selected: 0, base: 0.75 },
  })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, secondParagraph)))
  assert.ok(Object.values(formatSelection(state, layout)).every(value => value.selected === 'mixed'))
  assert.equal(historyShortcut({ key: 'z', ctrlKey: true }), 'undo')
  assert.equal(historyShortcut({ key: 'Z', ctrlKey: true, shiftKey: true }), 'redo')
})

test('paragraph spacing and page number settings survive saving and sharing', () => {
  const book = newBook({ title: '원고', template: 'novel', paper: 'b6', cover: 'ivory' })
  const position = pageNumberPosition(book.layout)
  assert.deepEqual([pageNumberAlignment(position, 0), pageNumberAlignment(position, 1)], ['left', 'right'])
  assert.match(printPageNumbers(book.layout), /yeobaek-text:left \{ @bottom-left/)
  assert.match(printPageNumbers(book.layout), /yeobaek-text:right \{ @bottom-right/)
  book.layout.paragraphSpacing = 0
  book.layout.pageNumberPosition = 'center'
  book.chapters[0].content = makeDocument('첫 문단', '다음 문단')
  book.chapters[0].content.content[0].attrs = { paragraphSpacing: 1.5 }

  const copy = readingCopy(sanitizeBook(book, book.id))
  assert.equal(paperStyle(copy.layout)['--paper-paragraph-spacing'], '0pt')
  assert.equal(pageNumberAlignment(pageNumberPosition(copy.layout), 0), 'center')
  assert.match(printPageNumbers(copy.layout), /@bottom-center \{ content: counter\(page\)/)
  const schema = getSchema(writingExtensions)
  const node = schema.nodeFromJSON(copy.chapters[0].content).firstChild
  assert.equal(node.type.spec.toDOM(node)[1]['data-paragraph-spacing'], 1.5)
  assert.match(node.type.spec.toDOM(node)[1].style, /margin-bottom: calc\(1\.5 \* var\(--paper-paragraph-unit/)

  book.layout.pageNumberPosition = 'top'
  assert.throws(() => sanitizeBook(book, book.id), /Invalid manuscript/)
})

test('base font size changes the manuscript type while paragraph gaps stay fixed', () => {
  const book = newBook({ title: '원고', template: 'novel', paper: 'b6', cover: 'ivory' })
  const content = makeDocument('기본 본문', '별도 크기')
  content.content[1].attrs = { paragraphSpacing: 1.5 }
  content.content[1].content[0].marks = [{ type: 'textStyle', attrs: { fontSize: 14, color: '#292433' } }]
  book.chapters[0].content = content
  const changed = updateManuscriptLayout(book, { fontSize: 12, letterSpacing: 0.08 })
  const saved = sanitizeBook(changed, book.id)
  const style = paperStyle(saved.layout)
  assert.equal(style['--paper-font-size'], '12pt')
  assert.equal(style['--paper-letter-spacing'], '0.08em')
  assert.equal(style['--paper-paragraph-spacing'], paperStyle(book.layout)['--paper-paragraph-spacing'])
  assert.equal(style['--paper-paragraph-unit'], '10.5pt')
  assert.equal(changed.chapters[0].content.content[0], content.content[0])
  assert.equal(saved.chapters[0].content.content[1].attrs.paragraphSpacing, 1.5)
  assert.deepEqual(saved.chapters[0].content.content[1].content[0].marks[0].attrs, { fontSize: 16, color: '#292433' })

  const state = EditorState.create({ doc: getSchema(writingExtensions).nodeFromJSON(saved.chapters[0].content) })
  assert.deepEqual(formatSelection(state, saved.layout).letterSpacing, { selected: '', base: 0.08 })
  assert.deepEqual(restoreBook(saved, bookChange(book, changed).before).chapters, book.chapters)
})
