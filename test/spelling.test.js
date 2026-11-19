import assert from 'node:assert/strict'
import test from 'node:test'
import { getSchema } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import dictionary from 'dictionary-ko'
import { createHunspellFromStrings } from 'hunspell-wasm'
import { makeDocument } from '../src/catalog.js'
import { writingExtensions } from '../src/document.js'
import { setSpelling, spellingExtension, spellingStatus } from '../src/spelling.js'

test('enabling spelling scans the existing Korean document and disabling removes the decorations', { timeout: 15_000 }, async t => {
  const originalWorker = globalThis.Worker
  const checker = createHunspellFromStrings(String(dictionary.aff), String(dictionary.dic))
  t.after(async () => {
    if (originalWorker) globalThis.Worker = originalWorker
    else delete globalThis.Worker
    const spell = await checker
    spell.dispose()
  })

  globalThis.Worker = class {
    addEventListener(event, listener) {
      if (event === 'message') this.receive = listener
    }

    async postMessage({ id, words }) {
      const spell = await checker
      this.receive({ data: { id, misspelled: words.filter(word => !spell.testSpelling(word)) } })
    }

    terminate() {}
  }

  const [plugin] = spellingExtension.config.addProseMirrorPlugins()
  const schema = getSchema(writingExtensions)
  const doc = schema.nodeFromJSON(makeDocument('안녕하새요. 됬어요. 할수 있다. 안녕 하세요.', '안녕하세요. 됐어요. 할 수 있다. 갈수록.'))
  const scanned = Promise.withResolvers()
  const view = {
    state: EditorState.create({ doc, plugins: [plugin] }),
    dispatch(transaction) {
      const previous = this.state
      this.state = previous.apply(transaction)
      lifecycle.update(this, previous)
      const status = spellingStatus(this.state).status
      if (status === 'ready' || status === 'partial') scanned.resolve(status)
    },
  }
  const lifecycle = plugin.spec.view(view)
  t.after(() => lifecycle.destroy())
  const editor = {
    view,
    options: { editorProps: { attributes: { role: 'textbox' } } },
    get state() { return view.state },
    setOptions(options) { this.options = { ...this.options, ...options } },
  }
  const marks = () => plugin.props.decorations(view.state).find()
  const underlined = () => marks().map(mark => doc.textBetween(mark.from, mark.to))

  setSpelling(editor, true)
  assert.deepEqual(underlined(), ['됬어요', '할수 있다', '안녕 하세요'])
  assert.equal(marks()[1].type.attrs.title, '띄어쓰기 제안 · 할 수 있다')
  assert.equal(await scanned.promise, 'ready')
  assert.deepEqual(underlined(), ['안녕하새요', '됬어요', '할수 있다', '안녕 하세요'])
  assert.equal(view.state.doc, doc)
  assert.equal(editor.options.editorProps.attributes.spellcheck, 'true')
  assert.equal(editor.options.editorProps.attributes.role, 'textbox')

  setSpelling(editor, false)
  assert.deepEqual(underlined(), [])
  assert.equal(editor.options.editorProps.attributes.spellcheck, 'false')
})
