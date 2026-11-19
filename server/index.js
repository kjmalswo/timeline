import express from 'express'
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { createApi, secureHeaders } from './api.js'
import { createStore } from './store.js'

const project = fileURLToPath(new URL('..', import.meta.url))
const dataPath = resolve(process.env.DATA_DIR || resolve(project, 'data'), 'studio.sqlite')
const dist = resolve(project, 'dist')
const development = process.argv.includes('--dev')

process.umask(0o077)
mkdirSync(dirname(dataPath), { recursive: true })
const db = new DatabaseSync(dataPath)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
const statements = new Map()

function query(sql, ...bindings) {
  if (!statements.has(sql)) statements.set(sql, db.prepare(sql))
  return statements.get(sql).all(...bindings)
}

function transaction(callback) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = callback()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

const api = createApi(createStore(query, transaction))
const app = express()
const server = createServer(app)
app.disable('x-powered-by')
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)
app.use((req, res, next) => {
  const headers = new Headers()
  secureHeaders(headers, development, req.path)
  headers.forEach((value, name) => res.set(name, value))
  next()
})

app.use('/api', async (req, res) => {
  const hasBody = ['POST', 'PUT', 'DELETE'].includes(req.method)
  const request = new Request(new URL(req.originalUrl, 'http://localhost'), {
    method: req.method,
    headers: req.headers,
    ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
  })
  const response = await api(request, { secure: req.secure || process.env.COOKIE_SECURE === '1', ip: req.ip })
  response.headers.forEach((value, name) => res.set(name, value))
  res.status(response.status).send(Buffer.from(await response.arrayBuffer()))
})

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
  console.error(error.message)
  res.status(500).json({ error: '서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' })
})

server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0', () => {
  console.log('Yeobaek ready on port ' + server.address().port)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await vite?.close()
    server.close(() => db.close())
    server.closeIdleConnections()
  })
}
