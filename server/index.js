import express from 'express'
import { createServer } from 'node:http'
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { identifier, sanitizeBook } from './books.js'

const project = fileURLToPath(new URL('..', import.meta.url))
const dataPath = resolve(process.env.DATA_DIR || resolve(project, 'data'), 'studio.sqlite')
const dist = resolve(project, 'dist')
const development = process.argv.includes('--dev')
const deriveKey = promisify(scrypt)
const sessionTime = 30 * 24 * 60 * 60 * 1000
const sessionName = 'yeobaek_session'

process.umask(0o077)
mkdirSync(dirname(dataPath), { recursive: true })
const db = new DatabaseSync(dataPath)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS books (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  );
`)

const statements = {
  user: db.prepare('SELECT * FROM users WHERE email = ?'),
  newUser: db.prepare('INSERT OR IGNORE INTO users (id, email, salt, password_hash) VALUES (?, ?, ?, ?)'),
  newSession: db.prepare('INSERT INTO sessions (hash, user_id, expires_at) VALUES (?, ?, ?)'),
  session: db.prepare('SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE hash = ? AND expires_at > ?'),
  removeSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
  expireSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  books: db.prepare('SELECT data, revision, updated_at FROM books WHERE user_id = ? ORDER BY updated_at DESC'),
  book: db.prepare('SELECT data, revision, updated_at FROM books WHERE user_id = ? AND id = ?'),
  insert: db.prepare('INSERT INTO books (user_id, id, revision, data, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT DO NOTHING'),
  update: db.prepare('UPDATE books SET data = ?, updated_at = ?, revision = revision + 1 WHERE user_id = ? AND id = ? AND revision = ?'),
}

const app = express()
const server = createServer(app)
app.disable('x-powered-by')
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  })
  if (!development) {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'")
  }
  next()
})

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  if (['POST', 'PUT'].includes(req.method) &&
      (!req.is('application/json') || req.get('Sec-Fetch-Site') === 'cross-site')) {
    return res.status(415).json({ error: '요청 형식이 올바르지 않습니다.' })
  }
  next()
}, express.json({ limit: '10mb' }))

function readToken(req) {
  return (req.get('Cookie') ?? '').match(/(?:^|; *)yeobaek_session=([a-f0-9]{64})(?:;|$)/)?.[1]
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function currentUser(req) {
  const token = readToken(req)
  return token ? statements.session.get(tokenHash(token), Date.now()) ?? null : null
}

function cookieOptions(req) {
  return { httpOnly: true, sameSite: 'lax', secure: req.secure || process.env.COOKIE_SECURE === '1', path: '/' }
}

function decodeBook(row) {
  return { ...JSON.parse(row.data), revision: row.revision, updatedAt: row.updated_at }
}

function library(user) {
  return { user, books: user ? statements.books.all(user.id).map(decodeBook) : [] }
}

function openSession(req, res, user) {
  const time = Date.now()
  const token = randomBytes(32).toString('hex')
  const previous = readToken(req)
  if (previous) statements.removeSession.run(tokenHash(previous))
  statements.expireSessions.run(time)
  statements.newSession.run(tokenHash(token), user.id, time + sessionTime)
  res.cookie(sessionName, token, { ...cookieOptions(req), maxAge: sessionTime })
  return library({ id: user.id, email: user.email })
}

const authAttempts = new Map()
function authLimit(req, res, next) {
  const now = Date.now()
  if (authAttempts.size > 512) {
    for (const [ip, entry] of authAttempts) if (entry.until <= now) authAttempts.delete(ip)
  }
  let attempt = authAttempts.get(req.ip)
  if (!attempt || attempt.until <= now) {
    attempt = { count: 0, until: now + 10 * 60_000 }
    authAttempts.set(req.ip, attempt)
  }
  if (++attempt.count > 18) {
    res.set('Retry-After', String(Math.ceil((attempt.until - now) / 1000)))
    return res.status(429).json({ error: '시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요.' })
  }
  next()
}

function credentials(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 128) return null
  return { email, password }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.get('/api/session', (req, res) => res.json(library(currentUser(req))))

app.post('/api/auth/register', authLimit, async (req, res) => {
  const input = credentials(req.body)
  if (!input || input.password.length < 8) {
    return res.status(400).json({ error: '이메일 주소와 8자 이상의 비밀번호를 입력해 주세요.' })
  }
  const salt = randomBytes(32).toString('hex')
  const hash = (await deriveKey(input.password, salt, 64)).toString('hex')
  const id = randomUUID()
  if (!statements.newUser.run(id, input.email, salt, hash).changes) {
    return res.status(409).json({ error: '이미 가입된 이메일입니다. 로그인해 주세요.' })
  }
  res.status(201).json(openSession(req, res, { id, email: input.email }))
})

app.post('/api/auth/login', authLimit, async (req, res) => {
  const input = credentials(req.body)
  const error = { error: '이메일 또는 비밀번호를 다시 확인해 주세요.' }
  if (!input) return res.status(401).json(error)
  const user = statements.user.get(input.email)
  const hash = await deriveKey(input.password, user?.salt ?? 'yeobaek-invalid-account-salt', 64)
  if (!timingSafeEqual(hash, user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64)) || !user) {
    return res.status(401).json(error)
  }
  res.json(openSession(req, res, user))
})

app.post('/api/auth/logout', (req, res) => {
  const token = readToken(req)
  if (token) statements.removeSession.run(tokenHash(token))
  res.clearCookie(sessionName, cookieOptions(req)).json({ user: null })
})

app.put('/api/books/:id', (req, res) => {
  const user = currentUser(req)
  if (!user) return res.status(401).json({ error: '다시 로그인하면 동기화가 이어집니다.' })
  const { id } = req.params
  const { revision, book, saveId } = req.body ?? {}
  if (!identifier.test(id) || !Number.isSafeInteger(revision) || revision < 0 || id !== book?.id ||
      (saveId !== undefined && (typeof saveId !== 'string' || !identifier.test(saveId)))) {
    return res.status(400).json({ error: '저장 요청을 확인해 주세요.' })
  }
  let data
  try {
    data = JSON.stringify({ ...sanitizeBook(book, id), lastSaveId: saveId ?? null })
  } catch {
    return res.status(400).json({ error: '원고 서식이나 책 설정을 저장할 수 없습니다.' })
  }
  const time = new Date().toISOString()
  const result = revision === 0
    ? statements.insert.run(user.id, id, data, time)
    : statements.update.run(data, time, user.id, id, revision)
  const current = statements.book.get(user.id, id)
  if (!current) return res.status(404).json({ error: '서재에서 이 원고를 찾을 수 없습니다.' })
  const decoded = decodeBook(current)
  if (!result.changes) {
    if (saveId && decoded.lastSaveId === saveId) return res.json({ book: decoded })
    return res.status(409).json({ error: '다른 기기에서 이 원고를 수정했습니다.', book: decoded })
  }
  res.status(revision === 0 ? 201 : 200).json({ book: decoded })
})

app.use('/api', (_req, res) => res.status(404).json({ error: '요청을 찾을 수 없습니다.' }))

let vite
if (development) {
  const { createServer: createViteServer } = await import('vite')
  vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  app.get('/', (_req, res) => res.sendFile(resolve(dist, 'index.html'), { maxAge: 0 }))
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
}

app.use((error, _req, res, _next) => {
  if (error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ error: error.status === 413 ? '원고가 너무 큽니다. 책을 나누어 저장해 주세요.' : '요청을 처리할 수 없습니다.' })
  }
  console.error(error.message)
  res.status(500).json({ error: '서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' })
})

server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0', () => {
  const address = server.address()
  console.log('Yeobaek ready on port ' + address.port)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await vite?.close()
    server.close(() => db.close())
    server.closeIdleConnections()
  })
}
