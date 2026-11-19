import { useEffect, useRef, useState } from 'react'
import { newId } from './catalog.js'
import { exampleShelf } from './example-shelf.js'
import { bookChange, createHistory, restoreBook } from './history.js'
import { request } from './api-request.js'

const guestKey = 'yeobaek.guest.v1'

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

const draftKey = user => 'yeobaek.pending.v1.' + user.id

export function useLibrary() {
  const [initialGuest] = useState(() => readLocal(guestKey, { books: [], touched: [] }))
  const guest = useRef(initialGuest)
  const [books, setBooks] = useState(exampleShelf)
  const currentBooks = useRef(books)
  const [user, setUser] = useState(null)
  const currentUser = useRef(null)
  const [ready, setReady] = useState(false)
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [statuses, setStatuses] = useState({})
  const [versions, setVersions] = useState({})
  const [history] = useState(createHistory)
  const [, refreshHistory] = useState(0)
  const [historyReplay, setHistoryReplay] = useState(null)
  const queues = useRef(new Map())
  const refreshing = useRef(false)

  function publishBooks(next) {
    currentBooks.current = next
    setBooks(next)
  }

  function replace(book) {
    const current = currentBooks.current
    publishBooks(current.some(item => item.id === book.id)
      ? current.map(item => item.id === book.id ? book : item)
      : [book, ...current])
  }

  function status(id, state, extra) {
    setStatuses(previous => ({ ...previous, [id]: { state, ...extra } }))
  }

  function preserveQueue() {
    if (!currentUser.current) return false
    return writeLocal(draftKey(currentUser.current), [...queues.current.values()].map(queue =>
      ({ book: queue.book, revision: queue.revision, saveId: queue.saveId }),
    ))
  }

  function schedule(queue, delay = 650) {
    clearTimeout(queue.timer)
    if (!queue.remote) queue.timer = setTimeout(() => flush(queue.book.id), delay)
  }

  function flush(id, background = false) {
    const queue = queues.current.get(id)
    if (!queue || queue.remote) return
    if (queue.inFlight) return queue.inFlight
    clearTimeout(queue.timer)
    queue.inFlight = send(id, queue, background)
    return queue.inFlight
  }

  async function send(id, queue, background) {
    const snapshot = queue.book
    status(id, 'saving')
    try {
      const { book: saved } = await request('/books/' + id, 'PUT', {
        revision: queue.revision, book: snapshot, saveId: queue.saveId, accountId: currentUser.current?.id,
      }, background)
      if (queues.current.get(id) !== queue) return false
      queue.revision = saved.revision
      if (queue.book === snapshot) {
        queues.current.delete(id)
        replace(saved)
        status(id, 'saved')
      } else {
        queue.book = { ...queue.book, revision: saved.revision }
        replace(queue.book)
        schedule(queue, 250)
      }
      preserveQueue()
      return true
    } catch (error) {
      if (queues.current.get(id) !== queue) return false
      if (error.status === 401 && preserveQueue()) {
        openLibrary({ user: null, books: [] })
        setNeedsSignIn(true)
        return false
      }
      if (error.status === 409 && error.data.book) {
        queue.remote = error.data.book
        status(id, 'conflict', { remote: queue.remote })
      } else {
        status(id, 'error', { message: error.message, signIn: error.status === 401 })
        if (!error.status || error.status >= 500) schedule(queue, 12_000)
      }
      return false
    } finally {
      queue.inFlight = null
    }
  }

  async function saveBook(id) {
    if (!currentUser.current) return false
    const queue = queues.current.get(id)
    if (!queue) return true
    if (queue.remote) return false
    const alreadySaving = Boolean(queue.inFlight)
    const saved = await flush(id)
    if (saved && alreadySaving && queues.current.get(id) === queue) return await flush(id)
    return saved
  }

  async function publishBook(id) {
    const accountId = currentUser.current?.id
    const saved = await saveBook(id)
    if (!accountId || currentUser.current?.id !== accountId) throw new Error('공유하려면 다시 로그인해 주세요.')
    const book = currentBooks.current.find(item => item.id === id)
    if (!saved || queues.current.has(id) || !book?.revision) throw new Error('원고의 저장 상태를 확인한 뒤 다시 공유해 주세요.')
    return request('/books/' + id + '/share', 'PUT', { accountId, revision: book.revision })
  }

  function queueBook(book, firstRevision = book.revision, saveId = newId()) {
    const previous = queues.current.get(book.id)
    const queue = previous ?? { book, revision: firstRevision }
    queue.book = book
    queue.saveId = saveId
    queues.current.set(book.id, queue)
    if (!queue.remote) {
      status(book.id, 'saving')
      schedule(queue)
    }
    return queue
  }

  function commit(book) {
    if (!currentUser.current) return
    const next = { ...book, updatedAt: new Date().toISOString() }
    replace(next)
    queueBook(next)
    preserveQueue()
    return next
  }

  function createBook(book) {
    if (!currentUser.current) return
    history.record({ scope: book.id, before: { fields: { trashed: true } }, after: { fields: { trashed: false } } })
    return commit(book)
  }

  function updateBook(id, updater, options = {}) {
    if (!currentUser.current) return
    const previous = currentBooks.current.find(item => item.id === id)
    if (!previous) return
    if (options.beforePosition && options.beforePosition.chapterId !== previous.activeChapterId) return
    const updated = updater(previous)
    if (options.record === false) {
      if (updated !== previous) history.separate()
    } else {
      const change = bookChange(previous, updated, options)
      if (change) {
        history.record({ scope: id, ...change, group: options.group })
        if (updated === previous) refreshHistory(count => count + 1)
      }
    }
    if (updated !== previous || options.beforePosition) setHistoryReplay(current => current?.id === id ? null : current)
    if (updated !== previous) commit(updated)
  }

  function stepHistory(direction) {
    if (!currentUser.current) return
    const entry = history.step(direction)
    if (!entry) return
    if (entry.value.view) {
      refreshHistory(count => count + 1)
      return { view: entry.value.view }
    }
    const book = currentBooks.current.find(item => item.id === entry.scope)
    if (!book) {
      refreshHistory(count => count + 1)
      return
    }
    const next = restoreBook(book, entry.value)
    setHistoryReplay({ id: book.id, ...entry.value })
    if (Object.keys(entry.value.fields).length || next.activeChapterId !== book.activeChapterId ||
        next.cursor?.anchor !== book.cursor?.anchor || next.cursor?.head !== book.cursor?.head) commit(next)
    return { book: next }
  }

  function recordView(id, before, after) {
    if (!currentUser.current) return
    history.record({ scope: id, before: { view: before }, after: { view: after } })
    refreshHistory(count => count + 1)
  }

  function openLibrary({ user: account, books: remoteBooks, examples = [] }, importGuest = false) {
    history.forget()
    setHistoryReplay(null)
    queues.current.forEach(queue => clearTimeout(queue.timer))
    queues.current.clear()
    currentUser.current = account
    setUser(account)
    setNeedsSignIn(false)
    setStatuses({})
    setVersions(previous => Object.fromEntries([...new Set([...Object.keys(previous), ...currentBooks.current.map(book => book.id)])]
      .map(id => [id, (previous[id] ?? 0) + 1])))
    if (!account) {
      publishBooks(exampleShelf())
      return
    }

    const merged = new Map(remoteBooks.map(book => [book.id, book]))
    const pending = readLocal(draftKey(account), [])
    for (const item of pending) {
      const remote = merged.get(item.book.id)
      if (item.saveId && remote?.lastSaveId === item.saveId) continue
      merged.set(item.book.id, item.book)
      const queue = queueBook(item.book, item.revision, item.saveId)
      if (remote && remote.revision !== item.revision) {
        queue.remote = remote
        clearTimeout(queue.timer)
        status(item.book.id, 'conflict', { remote })
      }
    }
    const imported = new Map()
    if (importGuest) {
      for (const book of guest.current.books.filter(item => guest.current.touched.includes(item.id))) {
        const copy = {
          ...book,
          id: merged.has(book.id) ? newId() : book.id,
          revision: 0,
        }
        imported.set(book.id, copy.id)
        merged.set(copy.id, copy)
        queueBook(copy)
      }
    }
    for (const example of examples) {
      if (!merged.has(example.id)) merged.set(example.id, example)
    }
    publishBooks([...merged.values()])
    if (preserveQueue() && importGuest) {
      guest.current = { books: [], touched: [] }
      writeLocal(guestKey, guest.current)
    }
    return { imported, bookIds: new Set(merged.keys()) }
  }

  async function authenticate(mode, email, password) {
    const result = await request('/auth/' + mode, 'POST', { email, password })
    return openLibrary(result, true)
  }

  async function signOut() {
    await Promise.all([...queues.current.keys()].map(id => flush(id)))
    if (queues.current.size && !preserveQueue()) {
      throw new Error('저장되지 않은 원고를 이 기기에 보관할 수 없습니다. 저장을 마친 뒤 로그아웃해 주세요.')
    }
    await request('/auth/logout', 'POST', {})
    openLibrary({ user: null, books: [] })
  }

  function resolveConflict(id, keepCopy) {
    const pending = queues.current.get(id)
    if (!pending?.remote) return
    clearTimeout(pending.timer)
    queues.current.delete(id)
    history.forget(id)
    setHistoryReplay(current => current?.id === id ? null : current)
    replace(pending.remote)
    status(id, 'saved')
    setVersions(previous => ({ ...previous, [id]: (previous[id] ?? 0) + 1 }))
    if (keepCopy) {
      const copy = createBook({ ...pending.book, id: newId(), revision: 0, title: pending.book.title.slice(0, 145) + ' (이 기기 사본)' })
      return copy.id
    }
    preserveQueue()
    return id
  }

  useEffect(() => {
    let mounted = true
    request('/session').then(result => {
      if (mounted && result.user) openLibrary(result, guest.current.touched.length > 0)
    }).catch(() => {}).finally(() => { if (mounted) setReady(true) })

    function syncPending() {
      if (currentUser.current) queues.current.forEach((_queue, id) => flush(id, document.visibilityState === 'hidden'))
    }

    async function refresh() {
      const account = currentUser.current
      if (!account || refreshing.current || document.visibilityState !== 'visible') return
      refreshing.current = true
      try {
        const result = await request('/session')
        if (!mounted || currentUser.current?.id !== account.id) return
        if (result.user?.id !== account.id) {
          if (!queues.current.size || preserveQueue()) openLibrary(result)
          return
        }
        const byId = new Map(currentBooks.current.map(book => [book.id, book]))
        const changed = []
        for (const remote of result.books) {
          if (queues.current.has(remote.id)) continue
          const local = byId.get(remote.id)
          if (!local || remote.revision > local.revision) {
            byId.set(remote.id, remote)
            if (local) {
              changed.push(remote.id)
              history.forget(remote.id)
            }
          }
        }
        publishBooks([...byId.values()])
        if (changed.length) {
          setHistoryReplay(current => changed.includes(current?.id) ? null : current)
          setVersions(previous => {
            const next = { ...previous }
            for (const id of changed) next[id] = (next[id] ?? 0) + 1
            return next
          })
        }
      } catch {
        // Existing drafts remain available while the connection is interrupted.
      } finally {
        refreshing.current = false
      }
    }

    function onVisibility() {
      syncPending()
      if (document.visibilityState === 'visible') refresh()
    }

    window.addEventListener('pagehide', syncPending)
    window.addEventListener('online', onVisibility)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      mounted = false
      window.removeEventListener('pagehide', syncPending)
      window.removeEventListener('online', onVisibility)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
      queues.current.forEach(queue => clearTimeout(queue.timer))
    }
  }, [])

  return {
    user, books, ready, statuses, versions, needsSignIn,
    guestHasDrafts: guest.current.touched.length > 0,
    canUndo: history.canUndo, canRedo: history.canRedo, historyReplay, stepHistory, recordView,
    publishBook,
    create: createBook, update: updateBook, save: saveBook, flush, authenticate, signOut, resolveConflict,
  }
}
