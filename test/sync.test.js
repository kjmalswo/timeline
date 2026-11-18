import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { makeDocument, newBook, newChapter, newId } from '../src/catalog.js'

async function startServer(dataDir) {
  const server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, DATA_DIR: dataDir, PORT: '0', HOST: '127.0.0.1', COOKIE_SECURE: '0', TRUST_PROXY: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  try {
    let port
    for await (const data of server.stdout) {
      port = data.toString().match(/Yeobaek ready on port (\d+)/)?.[1]
      if (port) break
    }
    assert.ok(port, 'The app should start')
    return { server, url: 'http://127.0.0.1:' + port }
  } catch (error) {
    server.kill()
    throw error
  }
}

async function stopServer({ server }) {
  if (server.exitCode !== null || server.signalCode !== null) return
  const exit = once(server, 'exit')
  server.kill()
  await exit
}

test('accounts resume a formatted manuscript on another device and survive a server restart', { timeout: 15000 }, async () => {
  const data = await mkdtemp(join(tmpdir(), 'yeobaek-sync-'))
  let app

  async function call(path, { method = 'GET', body, cookie } = {}) {
    const response = await fetch(app.url + '/api' + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const setCookie = response.headers.get('set-cookie')
    return { status: response.status, body: await response.json(), cookie: setCookie?.split(';')[0], setCookie }
  }

  try {
    app = await startServer(data)
    const credentials = { email: 'author@example.test', password: 'sample-passphrase' }
    const deviceA = await call('/auth/register', { method: 'POST', body: credentials })
    assert.equal(deviceA.status, 201)
    assert.match(deviceA.setCookie, /HttpOnly/)

    const book = newBook({ title: '이어 쓰는 책', template: 'novel', cover: 'grove', paper: 'b6' })
    const chapter = newChapter('두 번째 장')
    chapter.content = makeDocument('한 문장씩.')
    chapter.content.content[0].attrs = { align: 'justify', firstLine: 1.5, blockIndent: 2, lineHeight: 1.85 }
    chapter.content.content[0].content[0].marks = [
      { type: 'bold' },
      { type: 'textStyle', attrs: { font: 'serif', fontSize: 14, letterSpacing: 0.04 } },
    ]
    book.chapters.push(chapter)
    book.activeChapterId = chapter.id
    book.cursor = { anchor: 4, head: 4 }
    book.layout.margins.left = 24
    const path = '/books/' + book.id
    const firstWrite = { revision: 0, book, saveId: newId() }
    const saved = await call(path, { method: 'PUT', cookie: deviceA.cookie, body: firstWrite })
    assert.equal(saved.status, 201)
    assert.equal(saved.body.book.revision, 1)
    const repeated = await call(path, { method: 'PUT', cookie: deviceA.cookie, body: firstWrite })
    assert.equal(repeated.status, 200)
    assert.equal(repeated.body.book.revision, 1)

    const deviceB = await call('/auth/login', { method: 'POST', body: credentials })
    assert.equal(deviceB.status, 200)
    assert.notEqual(deviceA.cookie, deviceB.cookie)
    const resumed = deviceB.body.books[0]
    assert.equal(resumed.activeChapterId, chapter.id)
    assert.deepEqual(resumed.cursor, book.cursor)
    assert.equal(resumed.layout.margins.left, 24)
    assert.deepEqual(resumed.chapters[1].content, chapter.content)

    const other = await call('/auth/register', { method: 'POST', body: { ...credentials, email: 'another@example.test' } })
    assert.deepEqual(other.body.books, [])
    assert.equal((await call(path, { method: 'PUT', cookie: other.cookie, body: { revision: 1, book } })).status, 404)

    const update = await call(path, { method: 'PUT', cookie: deviceB.cookie, body: { revision: 1, book: { ...resumed, title: '기기 B에서 쓴 책' } } })
    assert.equal(update.status, 200)
    const stale = await call(path, { method: 'PUT', cookie: deviceA.cookie, body: { revision: 1, book: { ...resumed, title: '이전 편집본' } } })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.book.title, update.body.book.title)

    await stopServer(app)
    app = await startServer(data)
    const stored = await call('/session', { cookie: deviceA.cookie })
    assert.equal(stored.body.books[0].title, update.body.book.title)
    assert.equal(stored.body.books[0].revision, 2)
    const logout = await call('/auth/logout', { method: 'POST', cookie: deviceA.cookie, body: {} })
    assert.equal(logout.status, 200)
    assert.equal((await call('/session', { cookie: deviceA.cookie })).body.user, null)
  } finally {
    if (app) await stopServer(app)
    await rm(data, { recursive: true, force: true })
  }
})
