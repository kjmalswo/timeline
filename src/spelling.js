import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const commonMistakes = new Map([
  ['됬', '됐'], ['됀', '된'], ['됄', '될'], ['되요', '돼요'], ['되서', '돼서'], ['뵈요', '봬요'],
  ['어의없', '어이없'], ['오랫만', '오랜만'], ['어떻해', '어떡해'], ['몇일', '며칠'],
  ['웬지', '왠지'], ['왠일', '웬일'], ['역활', '역할'], ['설겆이', '설거지'],
  ['깨끗히', '깨끗이'], ['일일히', '일일이'], ['틈틈히', '틈틈이'],
])
const mistakePattern = new RegExp([...commonMistakes.keys()].join('|'), 'g')
const spellingKey = new PluginKey('yeobaekSpelling')

function misspellings(text) {
  const marks = []
  for (const match of text.matchAll(/[가-힣]+/g)) {
    const [word] = match
    const correction = word.replace(mistakePattern, wrong => commonMistakes.get(wrong))
    if (correction !== word) marks.push({ from: match.index, to: match.index + word.length, correction })
  }
  return marks
}

export const spellingExtension = Extension.create({
  name: 'yeobaekSpelling',
  addProseMirrorPlugins() {
    const cache = new WeakMap()

    function check(doc) {
      const marks = []
      doc.descendants((node, position) => {
        if (!node.isTextblock) return
        if (!cache.has(node)) cache.set(node, misspellings(node.textBetween(0, node.content.size, '', '\ufffc')))
        for (const { from, to, correction } of cache.get(node)) {
          marks.push(Decoration.inline(position + 1 + from, position + 1 + to, { class: 'spelling-error', title: `맞춤법 제안 · ${correction}` }))
        }
        return false
      })
      return DecorationSet.create(doc, marks)
    }

    return [new Plugin({
      key: spellingKey,
      state: {
        init: () => ({ enabled: false, marks: DecorationSet.empty }),
        apply(transaction, previous) {
          const options = transaction.getMeta(spellingKey)
          const enabled = options?.enabled ?? previous.enabled
          if (!enabled) return previous.enabled ? { enabled, marks: DecorationSet.empty } : previous
          if (previous.enabled && !options?.refresh && !transaction.docChanged) return previous
          const composing = transaction.getMeta('composition') != null
          const marks = composing ? previous.marks.map(transaction.mapping, transaction.doc) : check(transaction.doc)
          return { enabled, marks }
        },
      },
      props: {
        decorations: state => spellingKey.getState(state)?.marks,
        handleDOMEvents: {
          compositionend(view) {
            if (!spellingKey.getState(view.state)?.enabled) return false
            requestAnimationFrame(() => {
              if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(spellingKey, { refresh: true }))
            })
            return false
          },
        },
      },
    })]
  },
})

export function setSpelling(editor, enabled) {
  const props = editor.options.editorProps
  editor.setOptions({ editorProps: { ...props, attributes: { ...props.attributes, lang: 'ko', spellcheck: String(enabled) } } })
  if (spellingKey.getState(editor.state)?.enabled !== enabled) {
    editor.view.dispatch(editor.state.tr.setMeta(spellingKey, { enabled }))
  }
}
