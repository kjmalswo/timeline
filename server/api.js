import { Buffer } from 'node:buffer'
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { identifier, sanitizeBook } from './books.js'
import { sampleBooks } from './examples.js'
import { shareLinkPattern } from '../src/reader-book.js'

const deriveKey = promisify(scrypt)
const sessionTime = 30 * 24 * 60 * 60 * 1000
const bodyLimit = 10 * 1024 * 1024

export function secureHeaders(headers, development = false, path = '') {
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'same-origin')
  if (!development) {
    const wasm = /^\/assets\/korean-spelling-worker-[\w-]+\.js$/.test(path) ? " 'wasm-unsafe-eval'" : ''
    headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self'${wasm}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'`)
  }
}

function json(data, status = 200, responseHeaders) {
  const headers = new Headers(responseHeaders)
  headers.set('Cache-Control', 'no-store')
  secureHeaders(headers)
  return Response.json(data, { status, headers })
}

function failure(error, status, headers) {
  return json({ error }, status, headers)
}

function readToken(request) {
  return (request.headers.get('Cookie') ?? '').match(/(?:^|; *)yeobaek_session=([a-f0-9]{64})(?:;|$)/)?.[1]
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function cookie(token, maxAge, secure) {
  return 'yeobaek_session=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + (secure ? '; Secure' : '')
}

function credentials(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 128) return null
  return { email, password }
}

class RequestError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function bodyJson(request) {
  const tooLarge = () => new RequestError('원고가 너무 큽니다. 책을 나누어 저장해 주세요.', 413)
  if (Number(request.headers.get('Content-Length')) > bodyLimit) throw tooLarge()
  const reader = request.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder()
  const parts = []
  let size = 0
  try {
    for (let part = await reader.read(); !part.done; part = await reader.read()) {
      size += part.value.byteLength
      if (size > bodyLimit) {
        void reader.cancel().catch(() => {})
        throw tooLarge()
      }
      parts.push(decoder.decode(part.value, { stream: true }))
    }
    parts.push(decoder.decode())
    return JSON.parse(parts.join(''))
  } catch (error) {
    if (error instanceof RequestError) throw error
    throw new RequestError('요청을 처리할 수 없습니다.', 400)
  } finally {
    reader.releaseLock()
  }
}

export function createApi(store) {
  function library(user) {
    return user ? { user, books: store.books(user.id), examples: sampleBooks() } : { user: null, books: [] }
  }

  function openSession(request, user, secure, status) {
    const time = Date.now()
    const token = randomBytes(32).toString('hex')
    const previous = readToken(request)
    if (previous) store.removeSession(tokenHash(previous))
    store.createSession(tokenHash(token), user.id, time + sessionTime, time)
    return json(library({ id: user.id, email: user.email }), status, { 'Set-Cookie': cookie(token, sessionTime / 1000, secure) })
  }

  async function authenticate(request, path, secure, ip) {
    const now = Date.now()
    const attempt = store.authAttempt(ip, now, 10 * 60_000)
    if (attempt.attempts > 18) {
      return failure('시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요.', 429, {
        'Retry-After': String(Math.ceil((attempt.expires_at - now) / 1000)),
      })
    }
    const input = credentials(await bodyJson(request))
    if (path === '/api/auth/register') {
      if (!input || input.password.length < 8) {
        return failure('이메일 주소와 8자 이상의 비밀번호를 입력해 주세요.', 400)
      }
      const salt = randomBytes(32).toString('hex')
      const hash = (await deriveKey(input.password, salt, 64)).toString('hex')
      const id = randomUUID()
      if (!store.createUser(id, input.email, salt, hash)) {
        return failure('이미 가입된 이메일입니다. 로그인해 주세요.', 409)
      }
      return openSession(request, { id, email: input.email }, secure, 201)
    }

    const invalid = '이메일 또는 비밀번호를 다시 확인해 주세요.'
    if (!input) return failure(invalid, 401)
    const user = store.user(input.email)
    const hash = await deriveKey(input.password, user?.salt ?? 'yeobaek-invalid-account-salt', 64)
    if (!timingSafeEqual(hash, user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64)) || !user) {
      return failure(invalid, 401)
    }
    return openSession(request, user, secure, 200)
  }

  async function save(request, user, id) {
    if (!user) return failure('다시 로그인하면 동기화가 이어집니다.', 401)
    const { revision, book, saveId, accountId } = await bodyJson(request) ?? {}
    if (accountId !== undefined && accountId !== user.id) return failure('원고를 작성한 계정으로 다시 로그인해 주세요.', 401)
    if (!identifier.test(id) || !Number.isSafeInteger(revision) || revision < 0 || id !== book?.id ||
        (saveId !== undefined && (typeof saveId !== 'string' || !identifier.test(saveId)))) {
      return failure('저장 요청을 확인해 주세요.', 400)
    }
    let data
    try {
      data = JSON.stringify({ ...sanitizeBook(book, id), lastSaveId: saveId ?? null })
    } catch {
      return failure('원고 서식이나 책 설정을 저장할 수 없습니다.', 400)
    }
    const saved = store.saveBook(user.id, id, revision, data, new Date().toISOString())
    if (!saved.book) return failure('서재에서 이 원고를 찾을 수 없습니다.', 404)
    if (!saved.changed) {
      if (saveId && saved.book.lastSaveId === saveId) return json({ book: saved.book })
      return json({ error: '다른 기기에서 이 원고를 수정했습니다.', book: saved.book }, 409)
    }
    return json({ book: saved.book }, revision === 0 ? 201 : 200)
  }

  async function manageShare(request, method, user, id) {
    if (!user) return failure('공유를 관리하려면 로그인해 주세요.', 401)
    if (!identifier.test(id)) return failure('서재에서 이 원고를 찾을 수 없습니다.', 404)
    if (method === 'GET') return json({ share: store.shareInfo(user.id, id) })
    const { accountId, revision } = await bodyJson(request) ?? {}
    if (accountId !== user.id) return failure('원고를 작성한 계정으로 로그인해 주세요.', 401)
    if (method === 'DELETE') {
      store.revokeShare(user.id, id)
      return json({ share: null })
    }
    if (!Number.isSafeInteger(revision) || revision < 1) return failure('원고를 저장한 뒤 공유해 주세요.', 400)
    const result = store.publishBook(user.id, id, revision, randomBytes(24).toString('hex'), new Date().toISOString())
    if (result.error === 'missing') return failure('서재에서 이 원고를 찾을 수 없습니다.', 404)
    if (result.error === 'draft') return failure('초고 완료로 표시한 원고만 공유할 수 있습니다.', 409)
    if (result.error === 'stale') return failure('다른 기기에서 원고가 수정됐어요. 최신 원고를 연 뒤 다시 공유해 주세요.', 409)
    return json({ share: result.share })
  }

  return async function api(request, { secure, ip }) {
    const { pathname } = new URL(request.url)
    const path = pathname.replace(/\/$/, '')
    const method = request.method === 'HEAD' ? 'GET' : request.method
    if (['POST', 'PUT', 'DELETE'].includes(method) && (
      request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json' ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site'
    )) return failure('요청 형식이 올바르지 않습니다.', 415)

    try {
      if (method === 'GET' && path === '/api/health') return json({ status: 'ok' })
      const publicToken = path.match(/^\/api\/shares\/([^/]+)$/)?.[1]
      if (method === 'GET' && publicToken) {
        const book = shareLinkPattern.test(publicToken) ? store.sharedBook(publicToken) : null
        return book ? json({ book }) : failure('공유된 책을 열 수 없어요. 링크를 확인해 주세요.', 404)
      }
      if (method === 'POST' && (path === '/api/auth/register' || path === '/api/auth/login')) {
        return await authenticate(request, path, secure, ip)
      }
      const token = readToken(request)
      if (method === 'POST' && path === '/api/auth/logout') {
        if (token) store.removeSession(tokenHash(token))
        return json({ user: null }, 200, { 'Set-Cookie': cookie('', 0, secure) })
      }
      const user = token ? store.session(tokenHash(token), Date.now()) : null
      if (method === 'GET' && path === '/api/session') return json(library(user))
      const sharing = path.match(/^\/api\/books\/([^/]+)\/share$/)
      if (sharing && ['GET', 'PUT', 'DELETE'].includes(method)) return await manageShare(request, method, user, sharing[1])
      const book = path.match(/^\/api\/books\/([^/]+)$/)
      if (method === 'PUT' && book) return await save(request, user, book[1])
      return failure('요청을 찾을 수 없습니다.', 404)
    } catch (error) {
      if (error instanceof RequestError) return failure(error.message, error.status)
      console.error(error.message)
      return failure('서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.', 500)
    }
  }
}
