import { DurableObject } from 'cloudflare:workers'
import { createApi, secureHeaders } from './api.js'
import { createStore } from './store.js'

// Keep the existing namespace available for rollback without touching its data.
export class GameRoom extends DurableObject {}

export class YeobaekLibrary extends DurableObject {
  constructor(context, env) {
    super(context, env)
    const store = createStore(
      (statement, ...values) => context.storage.sql.exec(statement, ...values).toArray(),
      callback => context.storage.transactionSync(callback),
    )
    this.api = createApi(store)
  }

  fetch(request) {
    return this.api(request, {
      secure: new URL(request.url).protocol === 'https:',
      ip: request.headers.get('CF-Connecting-IP') ?? 'local',
    })
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return env.YEOBAEK_LIBRARY.getByName('production-library-v1').fetch(request)
    }
    const asset = await env.ASSETS.fetch(request)
    const response = new Response(asset.body, asset)
    secureHeaders(response.headers)
    return response
  },
}
