import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { makeDocument, newBook, newChapter, newId } from '../src/catalog.js'

const target = process.argv.includes('--worker') ? 'worker' : 'node'
const fingerprint = value => createHash('sha256').update(value).digest('hex')

async function startServer(dataDir) {
  const worker = target === 'worker'
  const args = worker
    ? ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', '0',
      '--persist-to', dataDir, '--show-interactive-dev-session=false']
    : ['server/index.js']
  const server = spawn(process.execPath, args, {
    env: {
      ...process.env,
      DATA_DIR: dataDir, PORT: '0', HOST: '127.0.0.1', COOKIE_SECURE: '0', TRUST_PROXY: '0',
      XDG_CONFIG_HOME: join(dataDir, 'config'), WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    const pattern = worker ? /Ready on http:\/\/127\.0\.0\.1:(\d+)/ : /Yeobaek ready on port (\d+)/
    const port = await new Promise((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => reject(new Error('Server did not start\n' + output)), 16_000)
      function read(data) {
        output = (output + data.toString()).slice(-6000)
        const port = output.match(pattern)?.[1]
        if (!port) return
        clearTimeout(timeout)
        resolve(port)
      }
      server.stdout.on('data', read)
      server.stderr.on('data', read)
      server.once('error', reject)
      server.once('exit', code => {
        clearTimeout(timeout)
        reject(new Error('Server exited with code ' + code + '\n' + output))
      })
    })
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

const examplePhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO8sAAAAASUVORK5CYII='
const paragraphFingerprints = blocks => blocks.filter(block => block.type === 'paragraph').map(block => fingerprint(block.content[0].text))

test(target + ': accounts resume a formatted manuscript and share only the published reading copy', { timeout: 55000 }, async () => {
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
    if (target === 'worker') {
      const page = await fetch(app.url + '/')
      assert.equal(page.status, 200)
      const html = await page.text()
      assert.match(html, /<html lang="ko">/)
      const entry = html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1]
      assert.ok(entry, 'The HTML should refer to the generated editor entry')
      assert.match((await fetch(app.url + entry)).headers.get('Content-Type'), /javascript/)
    }
    assert.deepEqual((await call('/session')).body, { user: null, books: [] })
    const credentials = { email: 'author@example.test', password: 'sample-passphrase' }
    const deviceA = await call('/auth/register', { method: 'POST', body: credentials })
    assert.equal(deviceA.status, 201)
    assert.match(deviceA.setCookie, /HttpOnly/)
    const example = deviceA.body.examples[0]
    assert.ok(example.chapters[0].content.content.length > 0)
    assert.equal((await call('/books/' + example.id, { method: 'PUT', body: { revision: 0, book: example } })).status, 401)

    const book = newBook({ title: '이어 쓰는 책', template: 'novel', cover: 'grove', paper: 'b6' })
    book.chapters[0].heading = { label: '', labelStyle: { align: 'right', fontSize: 12 }, titleStyle: { align: 'center', fontSize: 28 } }
    const chapter = newChapter('두 번째 장')
    chapter.content = makeDocument('한 문장씩.')
    chapter.content.content[0].attrs = { align: 'justify', firstLine: 1.5, blockIndent: 2, lineHeight: 1.85 }
    chapter.content.content[0].content[0].marks = [
      { type: 'bold' },
      { type: 'textStyle', attrs: { font: 'serif', fontSize: 14, letterSpacing: 0.04 } },
    ]
    if (target === 'worker') {
      const paragraph = '문장을 이어 쓴다. '.repeat(24_000)
      chapter.content.content.push(...makeDocument(paragraph, paragraph, paragraph, paragraph).content)
    }
    const bodyPhoto = {
      type: 'manuscriptImage', attrs: { src: examplePhoto, alt: '본문 사진', width: 55, align: 'right', ratio: 1 },
    }
    const coverPlacement = { x: 8, y: 15, w: 64, angle: -12, opacity: 0.8 }
    book.coverDesign = {
      background: '#fffaef',
      layers: [
        { id: newId(), type: 'photo', ...coverPlacement, h: 40, src: examplePhoto, alt: '표지 사진',
          fit: 'cover', brightness: 1.2, cropX: 66, cropY: 48, flip: true },
        { id: newId(), type: 'ink', strokes: [{ color: '#332045', size: 8, points: [[12, 31], [74, 63], [87, 92]] }] },
        { id: newId(), type: 'text', ...coverPlacement, role: 'title', text: '가을 원고',
          font: 'serif', color: '#333333', size: 9, align: 'center', bold: true },
        { id: newId(), type: 'text', ...coverPlacement, role: 'author', text: '작가',
          font: 'sans', color: '#352332', size: 5, align: 'right', bold: false },
      ],
    }
    chapter.content.content.push(bodyPhoto)
    book.chapters.push(chapter)
    book.activeChapterId = chapter.id
    book.cursor = { anchor: 4, head: 4 }
    book.layout.margins.left = 24
    book.spine = { width: 12.5, title: '책등 제목', author: '작가', font: 'serif', color: '#4a375c', background: '#f8f2fa' }
    book.writerNotes = [
      { id: newId(), kind: 'memo', title: '집필 메모', body: '작성자만 볼 수 있는 내용', chapterId: chapter.id },
      { id: newId(), kind: 'character', title: '지우', body: '등장인물 설정', detail: '주인공', chapterId: null },
      { id: newId(), kind: 'timeline', title: '첫 만남', body: '', detail: '이틀 뒤', chapterId: chapter.id },
      { id: newId(), kind: 'foreshadow', title: '접힌 지도', body: '', chapterId: book.chapters[0].id, payoffChapterId: chapter.id, resolved: true },
    ]
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
    const originalBlocks = chapter.content.content
    const restoredBlocks = resumed.chapters[1].content.content
    assert.deepEqual(restoredBlocks[0], originalBlocks[0])
    assert.deepEqual(paragraphFingerprints(restoredBlocks), paragraphFingerprints(originalBlocks))
    assert.deepEqual(restoredBlocks.at(-1), bodyPhoto)
    assert.deepEqual(resumed.coverDesign, book.coverDesign)
    assert.deepEqual(resumed.spine, book.spine)
    assert.deepEqual(resumed.writerNotes, book.writerNotes)
    assert.equal(resumed.chapters[0].title, '')
    assert.deepEqual(resumed.chapters[0].heading, book.chapters[0].heading)
    const invalidPhoto = structuredClone(resumed)
    invalidPhoto.coverDesign.layers[0].src = 'data:image/svg+xml;base64,PHN2Zy8+'
    assert.equal((await call(path, { method: 'PUT', cookie: deviceB.cookie,
      body: { revision: 1, book: invalidPhoto } })).status, 400)
    assert.equal((await call(path, { method: 'PUT', cookie: deviceB.cookie,
      body: { revision: 1, book: { ...resumed, spine: { ...book.spine, width: 0 } } } })).status, 400)

    const other = await call('/auth/register', { method: 'POST', body: { ...credentials, email: 'another@example.test' } })
    assert.deepEqual(other.body.books, [])
    assert.equal((await call(path, { method: 'PUT', cookie: other.cookie, body: { revision: 1, book } })).status, 404)
    assert.equal((await call(path, { method: 'PUT', cookie: other.cookie,
      body: { revision: 0, book, accountId: deviceA.body.user.id } })).status, 401)

    const sharePath = path + '/share'
    const accountId = deviceA.body.user.id
    const publish = revision => call(sharePath, { method: 'PUT', cookie: deviceA.cookie, body: { accountId, revision } })
    assert.equal((await call(sharePath)).status, 401)
    assert.equal((await publish(1)).status, 409)
    assert.equal((await call(sharePath, { method: 'PUT', cookie: other.cookie, body: { accountId: other.body.user.id, revision: 1 } })).status, 404)

    const update = await call(path, { method: 'PUT', cookie: deviceB.cookie,
      body: { revision: 1, book: { ...resumed, title: '기기 B에서 쓴 책', status: 'complete' } } })
    assert.equal(update.status, 200)
    const stale = await call(path, { method: 'PUT', cookie: deviceA.cookie, body: { revision: 1, book: { ...resumed, title: '이전 편집본' } } })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.book.title, update.body.book.title)
    assert.equal((await publish(1)).status, 409)
    const published = await publish(2)
    assert.equal(published.status, 200)
    assert.match(published.body.share.token, /^[a-f0-9]{48}$/)
    const publicPath = '/shares/' + published.body.share.token
    assert.deepEqual((await call(sharePath, { cookie: other.cookie })).body, { share: null })

    await stopServer(app)
    app = await startServer(data)
    const stored = await call('/session', { cookie: deviceA.cookie })
    assert.equal(stored.body.books[0].title, update.body.book.title)
    assert.equal(stored.body.books[0].revision, 2)
    const storedBook = stored.body.books[0]
    assert.deepEqual(paragraphFingerprints(storedBook.chapters[1].content.content), paragraphFingerprints(originalBlocks))
    assert.deepEqual(storedBook.chapters[1].content.content.at(-1), bodyPhoto)
    assert.deepEqual(storedBook.coverDesign, book.coverDesign)
    assert.deepEqual(storedBook.spine, book.spine)
    assert.deepEqual(storedBook.writerNotes, book.writerNotes)

    const publicBook = (await call(publicPath)).body.book
    assert.deepEqual(Object.keys(publicBook).sort(), ['author', 'chapters', 'cover', 'coverDesign', 'layout', 'title'])
    assert.equal(publicBook.title, update.body.book.title)
    assert.deepEqual(publicBook.chapters[0].heading, book.chapters[0].heading)
    assert.deepEqual(publicBook.chapters[1].content.content.at(-1), bodyPhoto)
    assert.deepEqual(paragraphFingerprints(publicBook.chapters[1].content.content), paragraphFingerprints(originalBlocks))

    const revised = await call(path, { method: 'PUT', cookie: deviceB.cookie,
      body: { revision: 2, book: { ...update.body.book, title: '수정한 완성본' } } })
    assert.equal(revised.status, 200)
    assert.equal((await call(publicPath)).body.book.title, update.body.book.title)
    assert.equal((await publish(3)).body.share.token, published.body.share.token)
    assert.equal((await call(publicPath)).body.book.title, '수정한 완성본')
    await call(sharePath, { method: 'DELETE', cookie: other.cookie, body: { accountId: other.body.user.id } })
    assert.equal((await call(publicPath)).status, 200)
    assert.deepEqual((await call(sharePath, { method: 'DELETE', cookie: deviceA.cookie, body: { accountId } })).body, { share: null })
    assert.equal((await call(publicPath)).status, 404)

    const republished = await publish(3)
    assert.notEqual(republished.body.share.token, published.body.share.token)
    assert.equal((await call(path, { method: 'PUT', cookie: deviceB.cookie,
      body: { revision: 3, book: { ...revised.body.book, status: 'draft' } } })).status, 200)
    assert.equal((await call('/shares/' + republished.body.share.token)).status, 404)

    const logout = await call('/auth/logout', { method: 'POST', cookie: deviceA.cookie, body: {} })
    assert.equal(logout.status, 200)
    assert.equal((await call('/session', { cookie: deviceA.cookie })).body.user, null)
  } finally {
    if (app) await stopServer(app)
    await rm(data, { recursive: true, force: true })
  }
})
