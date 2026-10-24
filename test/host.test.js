import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  API_PREFIX,
  ENDPOINTS,
  PET_ID,
  apply,
  applyPatch,
  createHandlers,
  guardHandler,
  mount,
  normalizeConfig,
  registerRoutes,
} from '../src/index.js'

// ---------------------------------------------------------------------------
// HTTP doubles
// ---------------------------------------------------------------------------

function request({ method = 'GET', body, headers = {}, remoteAddress = '127.0.0.1', url } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
  return {
    method,
    url,
    headers: { host: '127.0.0.1:6575', ...headers },
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    payload: undefined,
    headersSent: false,
    writeHead(status, headers) {
      response_headers(this, status, headers)
    },
    end(payload) {
      this.payload = payload
      this.headersSent = true
    },
  }
}

function response_headers(res, status, headers) {
  res.statusCode = status
  res.headers = headers
}

function json(res) {
  return JSON.parse(String(res.payload))
}

function createTrackerStub() {
  const state = {
    snapshot: {
      active: true,
      sessionId: 's1',
      state: 'thinking',
      activity: 'shell',
      waitingKind: '',
      errorKind: '',
      errorText: '',
      title: null,
      project: 'pet-astra-yao',
      updatedAt: 1,
      pulse: null,
    },
    acknowledged: [],
    cleared: 0,
    includeSubagents: false,
  }
  return {
    state,
    snapshot: () => state.snapshot,
    acknowledge(sessionId) {
      state.acknowledged.push(sessionId)
      state.snapshot = { ...state.snapshot, state: 'idle' }
    },
    clearPulse() {
      state.cleared += 1
    },
    handle() {
      return false
    },
    dispose() {
      return true
    },
    setIncludeSubagents(value) {
      state.includeSubagents = Boolean(value)
    },
  }
}

function createStore(initial = normalizeConfig({ scale: 1.25 })) {
  let config = initial
  return {
    patches: [],
    get: () => config,
    patch(patch) {
      this.patches.push(patch)
      config = applyPatch(config, patch)
      return config
    },
  }
}

function createHandlersFixture(assets) {
  const tracker = createTrackerStub()
  const store = createStore()
  return { tracker, store, handlers: createHandlers({ tracker, store, version: '9.9.9', assets }) }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

test('state endpoint describes the plugin, the pet atlas and the session', async () => {
  const { handlers, store } = createHandlersFixture()
  const res = response()
  await handlers.serveState(request(), res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'no-store')
  const body = json(res)
  assert.equal(body.ok, true)
  assert.equal(body.plugin.key, 'dsh-pet-astra-yao')
  assert.equal(body.plugin.version, '9.9.9')
  assert.deepEqual(body.config, store.get())
  assert.equal(body.pet.id, PET_ID)
  assert.equal(body.pet.spriteVersionNumber, 2)
  assert.equal(body.pet.spritesheetPath, ENDPOINTS.spritesheet)
  assert.match(String(body.pet.sheetVersion), /^\d+-\d+$/, 'the sheet revision bumps when the file changes')
  assert.equal(body.pet.atlas.animations.idle.row, 0)
  assert.equal(body.pet.atlas.lookCells, 16)
  assert.equal(body.session.state, 'thinking')
})

test('config endpoint reads, patches and rejects malformed patches', async () => {
  const { handlers, store } = createHandlersFixture()

  const read = response()
  await handlers.serveConfig(request(), read)
  assert.equal(read.statusCode, 200)
  assert.deepEqual(json(read).config, store.get())

  const patched = response()
  await handlers.serveConfig(request({ method: 'PATCH', body: { scale: 1.5, hidden: true } }), patched)
  assert.equal(patched.statusCode, 200)
  assert.deepEqual(store.patches, [{ scale: 1.5, hidden: true }])
  assert.equal(json(patched).config.scale, 1.5)
  assert.equal(json(patched).config.hidden, true)

  const unknown = response()
  await handlers.serveConfig(request({ method: 'POST', body: { nope: 1 } }), unknown)
  assert.equal(unknown.statusCode, 400)
  assert.match(json(unknown).error, /unknown config field: nope/u)

  const malformed = response()
  await handlers.serveConfig(request({ method: 'PATCH', body: '{' }), malformed)
  assert.equal(malformed.statusCode, 400)

  const wrongMethod = response()
  await handlers.serveConfig(request({ method: 'DELETE' }), wrongMethod)
  assert.equal(wrongMethod.statusCode, 405)
})

test('ack endpoint only accepts POST and clears the error state', async () => {
  const { handlers, tracker } = createHandlersFixture()

  const rejected = response()
  await handlers.serveAck(request(), rejected)
  assert.equal(rejected.statusCode, 405)

  const accepted = response()
  await handlers.serveAck(request({ method: 'POST', body: { sessionId: 's1' } }), accepted)
  assert.equal(accepted.statusCode, 200)
  assert.deepEqual(tracker.state.acknowledged, ['s1'])
  assert.equal(tracker.state.cleared, 1)
  assert.equal(json(accepted).session.state, 'idle')
})

test('asset endpoints serve the committed spritesheet and manifest', async () => {
  const { handlers } = createHandlersFixture()

  const sheet = response()
  await handlers.serveSpritesheet(request(), sheet)
  assert.equal(sheet.statusCode, 200)
  assert.equal(sheet.headers['content-type'], 'image/webp')
  assert.match(String(sheet.headers['cache-control']), /no-cache/)
  assert.match(String(sheet.headers.etag), /^"\d+-\d+"$/)
  const bytes = sheet.payload
  assert.equal(bytes.length, Number(sheet.headers['content-length']))
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.deepEqual(bytes, await readFile(new URL('../spritesheet.webp', import.meta.url)))

  const manifest = response()
  await handlers.serveManifest(request(), manifest)
  assert.equal(manifest.headers['content-type'], 'application/json; charset=utf-8')
  const pet = JSON.parse(String(manifest.payload))
  assert.equal(pet.id, 'astra-yao')
  assert.equal(pet.spriteVersionNumber, 2)
})

test('assets revalidate with an etag so a page reload sees a replaced atlas', async () => {
  const { handlers } = createHandlersFixture()

  const first = response()
  await handlers.serveSpritesheet(request(), first)
  const etag = String(first.headers.etag)

  const cached = response()
  await handlers.serveSpritesheet(request({ headers: { 'if-none-match': etag } }), cached)
  assert.equal(cached.statusCode, 304)
  assert.equal(cached.payload, undefined)

  const stale = response()
  await handlers.serveSpritesheet(request({ headers: { 'if-none-match': '"1-1"' } }), stale)
  assert.equal(stale.statusCode, 200)
})

test('a replaced spritesheet is picked up without restarting the host', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-pet-astra-yao-assets-'))
  const file = join(dir, 'sheet.webp')
  try {
    await writeFile(file, 'RIFF-old-bytes')
    const { handlers } = createHandlersFixture({ spritesheet: file })

    const before = response()
    await handlers.serveSpritesheet(request(), before)
    assert.equal(String(before.payload), 'RIFF-old-bytes')
    const oldEtag = String(before.headers.etag)

    await writeFile(file, 'RIFF-new-bytes-of-a-different-length')
    const after = response()
    await handlers.serveSpritesheet(request({ headers: { 'if-none-match': oldEtag } }), after)
    assert.equal(after.statusCode, 200)
    assert.equal(String(after.payload), 'RIFF-new-bytes-of-a-different-length')
    assert.notEqual(String(after.headers.etag), oldEtag)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('guardHandler blocks non-loopback callers and reports handler failures', async () => {
  let called = 0
  const guarded = guardHandler(async (_req, res) => {
    called += 1
    res.end('ok')
  })

  const remote = response()
  await guarded(request({ remoteAddress: '10.0.0.5' }), remote)
  assert.equal(remote.statusCode, 403)
  assert.equal(called, 0)

  const foreignOrigin = response()
  await guarded(request({ headers: { origin: 'https://evil.example' } }), foreignOrigin)
  assert.equal(foreignOrigin.statusCode, 403)

  const local = response()
  await guarded(request({ headers: { origin: 'http://127.0.0.1:6575' } }), local)
  assert.equal(called, 1)
  assert.equal(local.payload, 'ok')

  const broken = guardHandler(async () => {
    throw new Error('kaboom')
  })
  const failed = response()
  await broken(request(), failed)
  assert.equal(failed.statusCode, 500)
  assert.equal(json(failed).error, 'kaboom')
})

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function fakeHttpContext() {
  const routes = []
  const httpCtx = {
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
    effect(factory) {
      const dispose = factory()
      return () => dispose?.()
    },
  }
  return { routes, httpCtx }
}

test('registerRoutes mounts every endpoint on the web server', () => {
  const { routes, httpCtx } = fakeHttpContext()
  let injected = null
  const ctx = {
    logger: { warn() {} },
    inject(services, callback) {
      injected = services
      callback(httpCtx)
    },
  }
  const { handlers } = createHandlersFixture()

  const wired = registerRoutes(ctx, { handlers })
  const withoutInject = registerRoutes({}, { handlers })

  assert.equal(wired, true)
  assert.equal(withoutInject, false, 'a context without inject cannot host routes')
  assert.deepEqual(injected, ['webServer'])
  assert.deepEqual(
    routes.map((route) => route.path).sort(),
    [ENDPOINTS.ack, ENDPOINTS.balance, ENDPOINTS.config, ENDPOINTS.manifest, ENDPOINTS.spritesheet, ENDPOINTS.state].sort(),
  )
  assert.ok(routes.every((route) => route.kind === 'exact'))
  assert.ok(routes.every((route) => typeof route.handler === 'function'))
  assert.ok(routes.every((route) => route.path.startsWith(API_PREFIX)))
})

test('apply wires session tracking, config storage and routes together', async () => {
  const { routes, httpCtx } = fakeHttpContext()
  const listeners = new Map()
  const effects = []

  const ctx = {
    logger: { warn() {} },
    inject(_services, callback) {
      callback(httpCtx)
    },
    effect(factory, label) {
      effects.push(label)
      const dispose = factory()
      return () => dispose?.()
    },
    on(type, handler, options) {
      listeners.set(type, { handler, options })
      return () => listeners.delete(type)
    },
  }

  const wired = apply(ctx, { scale: 0.75 })
  assert.equal(typeof wired, 'object')
  assert.ok(effects.some((label) => String(label).includes('session events')))
  assert.ok(listeners.has('session/event'))
  assert.equal(listeners.get('session/event').options.global, true)
  assert.ok(listeners.has('session/disposed'))

  const stateRoute = routes.find((route) => route.path === ENDPOINTS.state)
  const readState = async () => {
    const res = response()
    await stateRoute.handler(request(), res)
    return json(res)
  }

  let body = await readState()
  assert.equal(body.config.scale, 0.75)
  assert.equal(body.session.active, false)

  const session = { header: { id: 'live-1', cwd: 'C:\\repos\\pet-astra-yao' } }
  listeners.get('session/event').handler(session, { type: 'turn/start', data: {} })
  listeners.get('session/event').handler(session, { type: 'tool/call', data: { callId: 'c1', name: 'shell' } })

  body = await readState()
  assert.equal(body.session.state, 'working')
  assert.equal(body.session.activity, 'shell')
  assert.equal(body.session.project, 'pet-astra-yao')

  const configRoute = routes.find((route) => route.path === ENDPOINTS.config)
  const patchRes = response()
  await configRoute.handler(request({ method: 'PATCH', body: { scale: 1.5, hidden: true } }), patchRes)
  assert.equal(patchRes.statusCode, 200)
  assert.equal(json(patchRes).config.scale, 1.5)

  body = await readState()
  assert.equal(body.config.scale, 1.5)
  assert.equal(body.config.hidden, true)

  listeners.get('session/disposed').handler(session)
  body = await readState()
  assert.equal(body.session.active, false)
})

test('mount never reads a service property outside its inject gate', () => {
  // DSH 0.2.1-rc.3+ throws "cannot get property <name> without inject" when a
  // plugin touches a service it did not gate on, which silently kills the host
  // half (no routes, an offline client). Services are only reachable through
  // the scoped context an inject callback receives.
  const { routes, httpCtx } = fakeHttpContext()
  const provided = {
    settings: { register: () => null },
    credentials: { resolve: async () => null },
    webServer: httpCtx.webServer,
  }
  const gated = []
  const ctx = {
    logger: { warn() {} },
    on: () => () => {},
    effect: (factory) => factory(),
    inject(services, callback) {
      gated.push(...services)
      const missing = services.filter((name) => !(name in provided))
      if (missing.length > 0) return
      const scoped = {
        effect: (factory) => factory(),
        get: (name) => provided[name],
      }
      for (const name of services) scoped[name] = provided[name]
      callback(scoped)
    },
  }
  for (const name of ['settings', 'credentials', 'webServer']) {
    Object.defineProperty(ctx, name, {
      get() {
        throw new Error(`cannot get property "${name}" without inject`)
      },
    })
  }

  const mounted = mount(ctx, { showBubbleUsage: true })
  assert.ok(mounted.balance, 'the balance service is still built without credentials')
  assert.deepEqual(gated.sort(), ['credentials', 'settings', 'webServer'])
  assert.equal(routes.length, 6, 'every endpoint is mounted despite the strict context')
})

test('mount returns the tracker, store and handlers it built', async () => {
  const { httpCtx } = fakeHttpContext()
  const ctx = { logger: { warn() {} }, inject: (_s, cb) => cb(httpCtx), on: () => () => {}, effect: (factory) => factory() }
  const mounted = mount(ctx, { opacity: 0.5 })
  assert.ok(mounted.tracker)
  assert.ok(mounted.store)
  assert.equal(mounted.store.get().opacity, 0.5)

  const res = response()
  await mounted.handlers.serveState(request(), res)
  assert.equal(json(res).config.opacity, 0.5)
})

test('normalizeConfig defaults used by the host are the shipped defaults', () => {
  assert.deepEqual(normalizeConfig({}), {
    enabled: true,
    scale: 1,
    opacity: 1,
    speed: 1,
    mirror: false,
    locked: false,
    hidden: false,
    paused: false,
    showBubble: true,
    showBubbleUsage: false,
    lookAtPointer: true,
    includeSubagents: false,
    posX: null,
    posY: null,
  })
})

test('balance endpoint returns the service payload and refuses non-GET', async () => {
  const tracker = createTrackerStub()
  const store = createStore()
  let forced = null
  const balance = {
    async getBalance(options = {}) {
      forced = Boolean(options.force)
      return { ok: true, totalBalance: 12.5, currency: 'CNY', todayUsage: 0.35, updatedAt: '2026-10-24T04:00:00.000Z' }
    },
  }
  const handlers = createHandlers({ tracker, store, balance, version: '9.9.9' })

  const res = response()
  await handlers.serveBalance(request({ url: '/plugins/dsh-pet-astra-yao/balance' }), res)
  assert.equal(res.statusCode, 200)
  const body = json(res)
  assert.equal(body.ok, true)
  assert.equal(body.balance.totalBalance, 12.5)
  assert.equal(body.balance.todayUsage, 0.35)
  assert.equal(body.balance.currency, 'CNY')
  assert.equal(forced, false)

  const fresh = response()
  await handlers.serveBalance(request({ url: '/plugins/dsh-pet-astra-yao/balance?refresh=1' }), fresh)
  assert.equal(forced, true)

  const posted = response()
  await handlers.serveBalance(request({ method: 'POST' }), posted)
  assert.equal(posted.statusCode, 405)

  const unavailable = createHandlers({ tracker, store })
  const none = response()
  await unavailable.serveBalance(request(), none)
  assert.equal(json(none).balance.code, 'NO_SERVICE')
})
