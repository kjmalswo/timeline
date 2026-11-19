export async function request(path, method = 'GET', data, background = false, signal) {
  const body = data === undefined ? undefined : JSON.stringify(data)
  const timeout = AbortSignal.timeout(20_000)
  const response = await fetch('/api' + path, {
    method,
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body } : {}),
    keepalive: background && body !== undefined && new Blob([body]).size <= 60_000,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw Object.assign(new Error(result.error ?? '서버에 연결할 수 없습니다.'), { status: response.status, data: result })
  }
  return result
}
