import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { checkDictionary, warmSpellingDictionary } from './spelling-dictionary.js'

const commonMistakes = new Map([
  ['됬', '됐'], ['됀', '된'], ['됄', '될'], ['되요', '돼요'], ['되서', '돼서'], ['뵈요', '봬요'],
  ['어의없', '어이없'], ['오랫만', '오랜만'], ['어떻해', '어떡해'], ['몇일', '며칠'],
  ['웬지', '왠지'], ['왠일', '웬일'], ['역활', '역할'], ['설겆이', '설거지'],
  ['깨끗히', '깨끗이'], ['일일히', '일일이'], ['틈틈히', '틈틈이'],
])
const mistakePattern = new RegExp([...commonMistakes.keys()].join('|'), 'g')
const spellingKey = new PluginKey('yeobaekSpelling')
const empty = { enabled: false, status: 'off', marks: DecorationSet.empty, count: 0, scan: 0 }
const scanDelay = 180

function tokenize(text) {
  const words = []
  for (const match of text.matchAll(/\p{Script=Hangul}+/gu)) {
    const word = match[0].normalize('NFC')
    if (word.length > 80 || !/[가-힣]/.test(word)) continue
    const corrected = word.replace(mistakePattern, wrong => commonMistakes.get(wrong))
    words.push({ word, from: match.index, to: match.index + match[0].length, correction: corrected === word ? null : corrected })
  }
  return words
}

export const spellingExtension = Extension.create({
  name: 'yeobaekSpelling',
  addProseMirrorPlugins() {
    const cache = new WeakMap()
    const checked = new Map()

    function forWords(doc, visit) {
      doc.descendants((node, position) => {
        if (!node.isTextblock) return
        if (!cache.has(node)) cache.set(node, tokenize(node.textBetween(0, node.content.size, '', '\ufffc')))
        for (const word of cache.get(node)) visit(word, position + 1)
        return false
      })
    }

    function decorate(doc) {
      const marks = []
      forWords(doc, ({ from, to, word, correction }, offset) => {
        if (!correction && checked.get(word) !== false) return
        const title = correction ? `맞춤법 제안 · ${correction}` : '한국어 사전에 없는 표기'
        marks.push(Decoration.inline(offset + from, offset + to, { class: 'spelling-error', title }))
      })
      return { marks: DecorationSet.create(doc, marks), count: marks.length }
    }

    return [new Plugin({
      key: spellingKey,
      state: {
        init: () => empty,
        apply(transaction, previous) {
          const options = transaction.getMeta(spellingKey)
          const enabled = options?.enabled ?? previous.enabled
          if (!enabled) return empty
          if (options?.status) return { ...previous, status: options.status, ...decorate(transaction.doc) }
          if (previous.enabled && !options?.refresh && !transaction.docChanged) return previous
          if (previous.enabled && transaction.getMeta('composition') != null) {
            return { ...previous, marks: previous.marks.map(transaction.mapping, transaction.doc) }
          }
          return { enabled, ...decorate(transaction.doc), scan: previous.scan + 1,
            status: previous.enabled ? previous.status : 'checking' }
        },
      },
      view(view) {
        let generation = 0
        let scheduled
        const warmup = setTimeout(warmSpellingDictionary, 0)

        function queue(immediate) {
          const id = ++generation
          clearTimeout(scheduled)
          scheduled = setTimeout(async () => {
            if (view.isDestroyed || view.composing || id !== generation) return
            const doc = view.state.doc
            const needsCheck = new Set()
            forWords(doc, ({ word, correction }) => {
              if (!correction && !checked.has(word)) needsCheck.add(word)
            })
            let status = 'ready'
            try {
              if (needsCheck.size) {
                const mistakes = await checkDictionary([...needsCheck])
                for (const word of needsCheck) checked.set(word, !mistakes.has(word))
              }
            } catch {
              status = 'partial'
            }
            if (id !== generation || view.isDestroyed || view.state.doc !== doc || !spellingKey.getState(view.state).enabled) return
            view.dispatch(view.state.tr.setMeta(spellingKey, { status }))
          }, immediate ? 0 : scanDelay)
        }

        return {
          update(_view, previous) {
            const before = spellingKey.getState(previous)
            const current = spellingKey.getState(view.state)
            if (!current.enabled) {
              generation += 1
              clearTimeout(scheduled)
            } else if (before.scan !== current.scan && current.status !== 'partial') {
              queue(!before.enabled)
            }
          },
          destroy() {
            generation += 1
            clearTimeout(warmup)
            clearTimeout(scheduled)
          },
        }
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

export function spellingStatus(state) {
  const { status, count } = spellingKey.getState(state) ?? empty
  return { status, count }
}

export function setSpelling(editor, enabled) {
  const props = editor.options.editorProps
  editor.setOptions({ editorProps: { ...props, attributes: { ...props.attributes, lang: 'ko', spellcheck: String(enabled) } } })
  if (spellingKey.getState(editor.state)?.enabled !== enabled) {
    editor.view.dispatch(editor.state.tr.setMeta(spellingKey, { enabled }))
  }
}
