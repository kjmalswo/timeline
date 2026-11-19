import { Mark } from '@tiptap/pm/model'
import { Selection, TextSelection } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'

export const formatEdit = 'manuscriptFormat'
export const historyRestore = 'manuscriptHistoryRestore'

export function createDocumentSerializer() {
  const cache = new WeakMap()
  function serialize(node) {
    if (cache.has(node)) return cache.get(node)
    const json = node.childCount ? node.copy().toJSON() : node.toJSON()
    if (node.childCount) {
      json.content = []
      node.forEach(child => json.content.push(serialize(child)))
    }
    cache.set(node, json)
    return json
  }
  return serialize
}

export function editPosition(state, chapterId) {
  const { anchor, head } = state.selection
  return { chapterId, cursor: { anchor, head }, selection: state.selection.toJSON(),
    marks: state.storedMarks?.map(mark => mark.toJSON()) ?? null }
}

export function marksChanged(before, after, transaction) {
  return transaction.getMeta(formatEdit) && !Mark.sameSet(before.storedMarks ?? [], after.storedMarks ?? [])
}

export function typingGroup(before, after, transaction, chapterId) {
  const composing = transaction.getMeta('composition')
  if (composing !== undefined) return chapterId + ':composition:' + composing
  const [step] = transaction.steps
  if (transaction.getMeta(formatEdit) || transaction.getMeta('inputRule') || transaction.getMeta('uiEvent') || transaction.steps.length !== 1 ||
      !(step instanceof ReplaceStep) || !before.selection.empty || !after.selection.empty) return undefined
  const from = before.selection.$from
  const to = after.selection.$from
  if (!from.parent.isTextblock || !to.parent.isTextblock || from.start() !== to.start() ||
      step.from < from.start() || step.to > from.end() || step.slice.openStart || step.slice.openEnd) return undefined
  if (step.slice.size && (!step.slice.content.firstChild?.isText || step.slice.content.childCount !== 1)) return undefined
  return chapterId + ':typing:' + from.start() + ':' + (step.slice.size ? 'insert' : 'delete')
}

export function restoreManuscript(editor, { content, position, cursor }) {
  const { state, view, schema } = editor
  const tr = state.tr
  if (content) {
    const doc = schema.nodeFromJSON(content)
    if (!state.doc.eq(doc)) tr.replaceWith(0, state.doc.content.size, doc.content)
  }
  if (position?.selection && position.selection.type !== 'text') {
    tr.setSelection(Selection.fromJSON(tr.doc, position.selection))
  } else if (cursor) {
    const end = tr.doc.content.size
    tr.setSelection(TextSelection.between(tr.doc.resolve(Math.min(cursor.anchor, end)), tr.doc.resolve(Math.min(cursor.head, end))))
  } else if (tr.docChanged || position) {
    tr.setSelection(Selection.atStart(tr.doc))
  }
  if (position && Object.hasOwn(position, 'marks')) tr.setStoredMarks(position.marks?.map(mark => schema.markFromJSON(mark)) ?? null)
  if (tr.docChanged || tr.selectionSet || tr.storedMarksSet) {
    view.dispatch(tr.setMeta(historyRestore, true).setMeta('skipTrailingNode', true).setMeta('preventUpdate', true))
  }
}
