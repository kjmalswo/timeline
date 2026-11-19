import assert from 'node:assert/strict'
import test from 'node:test'
import { TEMPLATES } from '../src/catalog.js'
import { bookmarkPage, pageForSpread, readerPageSize, readingPoint } from '../src/reader-position.js'

test('reader pages have the same trim and text area on desktop and mobile', () => {
  const layout = { ...TEMPLATES.novel.layout, paper: 'a5', margins: { top: 16, right: 22, bottom: 19, left: 29 } }
  const desktop = readerPageSize({ width: 1150, height: 840 }, layout, 'auto')
  const mobile = readerPageSize({ width: 350, height: 580 }, layout, 'auto')
  for (const key of ['width', 'height', 'left', 'right', 'top', 'bottom', 'textWidth', 'textHeight', 'gap', 'pitch']) {
    assert.equal(desktop[key], mobile[key], key)
  }
  assert.equal(desktop.visible, 2)
  assert.equal(mobile.visible, 1)
  assert.ok(mobile.spreadWidth * mobile.fit <= 350)
  assert.ok(desktop.height * desktop.fit <= 840)
  assert.ok(mobile.fit < desktop.fit)
})

test('a saved page remains exact when switching between a single page and a spread', () => {
  const chapters = [{ id: 'one' }, { id: 'two' }]
  const starts = [0, 3]
  const count = 8
  const location = readingPoint(5, starts, count, chapters)
  const restored = bookmarkPage(location, starts, count, chapters)
  assert.equal(restored, 5)
  assert.equal(pageForSpread(restored, count, 2), 4)
  assert.equal(pageForSpread(restored, count, 1), 5)
  assert.equal(bookmarkPage(location, [0, 7], 12, chapters), 9)
})
