let worker
let nextId = 0
const requests = new Map()

function resetWorker(target = worker) {
  if (target !== worker) return
  worker?.terminate()
  worker = null
  for (const { reject, timeout } of requests.values()) {
    clearTimeout(timeout)
    reject(new Error('Korean spelling dictionary unavailable'))
  }
  requests.clear()
}

export function warmSpellingDictionary() {
  if (worker) return worker
  if (typeof Worker !== 'function') return null
  try {
    const current = new Worker(new URL('./korean-spelling-worker.js', import.meta.url), { type: 'module' })
    worker = current
    current.addEventListener('error', () => resetWorker(current))
    current.addEventListener('message', ({ data: { id, misspelled, failed } }) => {
      if (current !== worker) return
      if (failed) return resetWorker(current)
      const request = requests.get(id)
      if (!request) return
      clearTimeout(request.timeout)
      requests.delete(id)
      request.resolve(new Set(misspelled))
    })
    return current
  } catch {
    resetWorker()
    return null
  }
}

export function checkDictionary(words) {
  return new Promise((resolve, reject) => {
    const current = warmSpellingDictionary()
    if (!current) {
      reject(new Error('Korean spelling dictionary unavailable'))
      return
    }
    const id = ++nextId
    requests.set(id, { resolve, reject, timeout: setTimeout(() => resetWorker(current), 25_000) })
    try {
      current.postMessage({ id, words })
    } catch {
      resetWorker(current)
    }
  })
}
