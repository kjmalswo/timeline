const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)',
  `CREATE TABLE IF NOT EXISTS books (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS book_parts (
    user_id TEXT NOT NULL,
    id TEXT NOT NULL,
    part_number INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (user_id, id, part_number),
    FOREIGN KEY (user_id, id) REFERENCES books(user_id, id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS auth_attempts (
    ip TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS auth_attempts_expiry ON auth_attempts(expires_at)',
]

// Keep each bound value below the Durable Objects SQLite row limit.
const partLength = 400_000

function* splitBook(value) {
  let start = 0
  while (start < value.length) {
    let end = Math.min(start + partLength, value.length)
    const last = value.charCodeAt(end - 1)
    if (last >= 0xd800 && last <= 0xdbff) end -= 1
    yield value.slice(start, end)
    start = end
  }
}

export function createStore(query, transaction) {
  for (const statement of schema) query(statement)

  function decode(row, userId) {
    const data = row.data || query('SELECT data FROM book_parts WHERE user_id = ? AND id = ? ORDER BY part_number',
      userId, row.id).map(part => part.data).join('')
    return { ...JSON.parse(data), revision: row.revision, updatedAt: row.updated_at }
  }

  return {
    user: email => query('SELECT * FROM users WHERE email = ?', email)[0],
    createUser: (id, email, salt, hash) => query(
      'INSERT OR IGNORE INTO users (id, email, salt, password_hash) VALUES (?, ?, ?, ?) RETURNING id', id, email, salt, hash,
    ).length > 0,
    session: (hash, now) => query(
      'SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.hash = ? AND sessions.expires_at > ?', hash, now,
    )[0] ?? null,
    removeSession: hash => query('DELETE FROM sessions WHERE hash = ?', hash),
    createSession(hash, userId, expiresAt, now) {
      query('DELETE FROM sessions WHERE expires_at <= ?', now)
      query('INSERT INTO sessions (hash, user_id, expires_at) VALUES (?, ?, ?)', hash, userId, expiresAt)
    },
    authAttempt(ip, now, window) {
      query('DELETE FROM auth_attempts WHERE expires_at <= ?', now)
      return query(`INSERT INTO auth_attempts (ip, attempts, expires_at) VALUES (?, 1, ?)
        ON CONFLICT(ip) DO UPDATE SET attempts = attempts + 1 RETURNING attempts, expires_at`, ip, now + window)[0]
    },
    books: userId => query(
      'SELECT id, data, revision, updated_at FROM books WHERE user_id = ? ORDER BY updated_at DESC', userId,
    ).map(row => decode(row, userId)),
    saveBook(userId, id, revision, data, time) {
      return transaction(() => {
        const inline = data.length <= partLength ? data : ''
        const row = revision === 0
          ? query(`INSERT INTO books (user_id, id, revision, data, updated_at) VALUES (?, ?, 1, ?, ?)
                   ON CONFLICT DO NOTHING RETURNING id, revision, updated_at`, userId, id, inline, time)[0]
          : query(`UPDATE books SET data = ?, updated_at = ?, revision = revision + 1
                   WHERE user_id = ? AND id = ? AND revision = ? RETURNING id, revision, updated_at`,
            inline, time, userId, id, revision)[0]
        if (!row) {
          const current = query('SELECT id, data, revision, updated_at FROM books WHERE user_id = ? AND id = ?', userId, id)[0]
          return { changed: false, book: current ? decode(current, userId) : null }
        }

        if (revision > 0) query('DELETE FROM book_parts WHERE user_id = ? AND id = ?', userId, id)
        if (!inline) {
          let index = 0
          for (const part of splitBook(data)) {
            query('INSERT INTO book_parts (user_id, id, part_number, data) VALUES (?, ?, ?, ?)', userId, id, index++, part)
          }
        }
        return { changed: true, book: { ...JSON.parse(data), revision: row.revision, updatedAt: row.updated_at } }
      })
    },
  }
}
