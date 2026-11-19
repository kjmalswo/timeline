const undoLimit = 100
const mergeDelay = 650

export function createHistory(limit = undoLimit) {
  let past = []
  let future = []
  let previousGroup = null

  return {
    get canUndo() { return past.length > 0 },
    get canRedo() { return future.length > 0 },
    record({ scope, before, after, group, time = performance.now() }) {
      if (group && previousGroup === group && past.at(-1)?.scope === scope && time - past.at(-1).time <= mergeDelay) {
        Object.assign(past.at(-1), { after, time })
      } else {
        past.push({ scope, before, after, time })
        if (past.length > limit) past.shift()
      }
      previousGroup = group
      future = []
    },
    step(direction) {
      const undo = direction === 'undo'
      const entry = (undo ? past : future).pop()
      if (!entry) return null
      if (undo) future.push(entry)
      else past.push(entry)
      previousGroup = null
      return { scope: entry.scope, value: undo ? entry.before : entry.after }
    },
    separate() { previousGroup = null },
    forget(scope) {
      past = scope === undefined ? [] : past.filter(entry => entry.scope !== scope)
      future = scope === undefined ? [] : future.filter(entry => entry.scope !== scope)
      previousGroup = null
    },
  }
}

const bookMetadata = new Set(['id', 'revision', 'updatedAt', 'lastSaveId', 'activeChapterId', 'cursor', 'example'])

function bookPosition(book) {
  return { chapterId: book.activeChapterId, cursor: book.cursor,
    selection: book.cursor ? { type: 'text', ...book.cursor } : null }
}

export function bookChange(before, after, { beforePosition, afterPosition } = {}) {
  const previous = {}
  const next = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (bookMetadata.has(key) || before[key] === after[key]) continue
    previous[key] = before[key]
    next[key] = after[key]
  }
  if (!beforePosition && !Object.keys(next).length) return null
  const switched = before.activeChapterId !== after.activeChapterId
  return {
    before: { fields: previous, position: beforePosition ?? (switched ? bookPosition(before) : null) },
    after: { fields: next, position: afterPosition ?? (switched ? bookPosition(after) : null) },
  }
}

export function restoreBook(book, { fields, position }) {
  return {
    ...book, ...fields,
    ...(position ? { activeChapterId: position.chapterId, cursor: position.cursor } : {}),
  }
}
