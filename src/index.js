/**
 * dsh-pet-astra-yao — host half.
 *
 * Astra Yao is a Codex desktop pet atlas (spriteVersionNumber 2, 8 x 11 frames
 * of 192 x 208 px). This package turns that atlas into a DeepSeek Harness
 * plugin:
 *
 *  - the host half exposes the atlas, the resolved configuration and a small
 *    session-state snapshot over `/plugins/dsh-pet-astra-yao/*`;
 *  - the browser half (`./client`, built into `lib/client.js`) renders the pet
 *    inside the DSH web UI and animates it from that snapshot;
 *  - the config namespace is registered with the DSH settings service when it
 *    is available, so the pet's own context menu can persist scale, opacity,
 *    lock state and position.
 *
 * Nothing here is model-facing: no tools, no prompts, no tokens.
 */

import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { localHostOk } from './local-access.js'
import { createTracker } from './state.js'
import { createBalanceService } from './balance.js'
import { SPRITE_VERSION, describeAtlas } from './atlas.js'
import { CONFIG_PATCH_FIELDS, applyPatch, defaults, normalizeConfig, readConfig } from './config.js'

/**
 * The settings schema is optional. A profile install that links this folder
 * (`dsh plugin add <path>`) does not install the package's own dependencies, so
 * `@deepseek-ai/schemastery` may be unresolvable — the pet still runs, only the
 * Plugins page form is skipped. A registry install resolves it normally.
 */
const Schema = await import('@deepseek-ai/schemastery')
  .then((module) => module.default ?? module)
  .catch(() => null)

export { CONFIG_PATCH_FIELDS, applyPatch, defaults, normalizeConfig, readConfig }

export const name = 'dsh-pet-astra-yao'

export const PLUGIN_KEY = 'dsh-pet-astra-yao'
export const API_PREFIX = `/plugins/${PLUGIN_KEY}`
export const PET_ID = 'astra-yao'
export const PET_DISPLAY_NAME = 'Astra Yao'

export const ENDPOINTS = Object.freeze({
  state: `${API_PREFIX}/state`,
  config: `${API_PREFIX}/config`,
  ack: `${API_PREFIX}/ack`,
  balance: `${API_PREFIX}/balance`,
  spritesheet: `${API_PREFIX}/assets/spritesheet.webp`,
  manifest: `${API_PREFIX}/assets/pet.json`,
})

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
export const VERSION = String(packageJson.version ?? '0.0.0')

export const Config = Schema && Schema.object({
  enabled: Schema.boolean().default(true).description('Show the Astra Yao pet in the DSH web UI').volatile(),
  scale: Schema.number().min(0.5).max(2).step(0.05).default(1).role('slider').description('Pet size multiplier').volatile(),
  opacity: Schema.number().min(0.3).max(1).step(0.05).default(1).role('slider').description('Pet opacity').volatile(),
  speed: Schema.number().min(0.5).max(1.6).step(0.05).default(1).role('slider').description('Animation speed multiplier (lower is calmer)').volatile(),
  mirror: Schema.boolean().default(false).description('Mirror the sprite horizontally').volatile(),
  locked: Schema.boolean().default(false).description('Lock the pet position and disable dragging').volatile(),
  hidden: Schema.boolean().default(false).description('Hide the pet without disabling the plugin').volatile(),
  paused: Schema.boolean().default(false).description('Pause the frame animation').volatile(),
  showBubble: Schema.boolean().default(true).description('Show the status bubble above the pet').volatile(),
  showBubbleUsage: Schema.boolean().default(false).description('Show the DeepSeek balance in the bubble').volatile(),
  lookAtPointer: Schema.boolean().default(true).description('Turn the pet toward the pointer when it is nearby').volatile(),
  includeSubagents: Schema.boolean().default(false).description('Let subagent sessions drive the pet state').volatile(),
  posX: Schema.number().default(null).description('Saved horizontal position in CSS pixels (null = default corner)').volatile(),
  posY: Schema.number().default(null).description('Saved vertical position in CSS pixels (null = default corner)').volatile(),
}).description('Astra Yao — a Codex-style desktop pet for DeepSeek Harness')

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

async function readJsonBody(req, limit = 8192) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > limit) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  const value = JSON.parse(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('body must be a JSON object')
  }
  return value
}

/**
 * Build the endpoint handlers. Exported so tests can drive them without a
 * real HTTP server.
 *
 * @param {object} deps
 * @param {ReturnType<typeof createTracker>} deps.tracker
 * @param {{ get: () => object, patch: (patch: object) => object }} deps.store
 * @param {{ spritesheet?: string | URL, manifest?: string | URL }} [deps.assets]
 * @param {ReturnType<typeof createBalanceService>} [deps.balance]
 */
export function createHandlers({ tracker, store, assets = {}, version = VERSION, balance = null }) {
  const spriteFile = assets.spritesheet ?? new URL('../spritesheet.webp', import.meta.url)
  const manifestFile = assets.manifest ?? new URL('../pet.json', import.meta.url)
  const fileCache = new Map()

  async function readAsset(file) {
    const key = String(file)
    const cached = fileCache.get(key)
    if (cached) return cached
    const data = await readFile(file)
    fileCache.set(key, data)
    return data
  }

  function serveState(_req, res) {
    jsonResponse(res, 200, {
      ok: true,
      plugin: { key: PLUGIN_KEY, name, version },
      config: store.get(),
      pet: {
        id: PET_ID,
        displayName: PET_DISPLAY_NAME,
        spriteVersionNumber: SPRITE_VERSION,
        spritesheetPath: ENDPOINTS.spritesheet,
        manifestPath: ENDPOINTS.manifest,
        atlas: describeAtlas(),
      },
      session: tracker.snapshot(),
      serverTime: Date.now(),
    })
  }

  async function serveConfig(req, res) {
    const method = String(req?.method ?? 'GET').toUpperCase()
    if (method === 'GET' || method === 'HEAD') {
      jsonResponse(res, 200, { ok: true, config: store.get() })
      return
    }
    if (method !== 'POST' && method !== 'PATCH' && method !== 'PUT') {
      jsonResponse(res, 405, { ok: false, error: 'use GET or PATCH' })
      return
    }
    try {
      const patch = await readJsonBody(req)
      jsonResponse(res, 200, { ok: true, config: store.patch(patch) })
    } catch (error) {
      jsonResponse(res, 400, { ok: false, error: String(error?.message ?? error) })
    }
  }

  async function serveAck(req, res) {
    if (String(req?.method ?? 'GET').toUpperCase() !== 'POST') {
      jsonResponse(res, 405, { ok: false, error: 'use POST' })
      return
    }
    let body = {}
    try {
      body = await readJsonBody(req)
    } catch {
      body = {}
    }
    tracker.acknowledge(body?.sessionId)
    tracker.clearPulse()
    jsonResponse(res, 200, { ok: true, session: tracker.snapshot() })
  }

  async function serveBalance(req, res) {
    if (String(req?.method ?? 'GET').toUpperCase() !== 'GET') {
      jsonResponse(res, 405, { ok: false, error: 'use GET' })
      return
    }
    if (!balance) {
      jsonResponse(res, 200, { ok: false, balance: { ok: false, code: 'NO_SERVICE', error: '余额服务不可用' } })
      return
    }
    const force = /[?&](?:refresh|force)=1(?:&|$)/u.test(String(req?.url ?? ''))
    const payload = await balance.getBalance({ force })
    jsonResponse(res, 200, { ok: payload.ok === true, balance: payload, serverTime: Date.now() })
  }

  async function serveSpritesheet(_req, res) {
    const data = await readAsset(spriteFile)
    res.writeHead(200, {
      'content-type': 'image/webp',
      'cache-control': 'private, max-age=3600',
      'content-length': data.length,
    })
    res.end(data)
  }

  async function serveManifest(_req, res) {
    const data = await readAsset(manifestFile)
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, max-age=3600',
      'content-length': data.length,
    })
    res.end(data)
  }

  return { serveState, serveConfig, serveAck, serveBalance, serveSpritesheet, serveManifest }
}

/** Wrap a handler with the loopback guard and a JSON error fallback. */
export function guardHandler(handler, logger) {
  return async (req, res) => {
    if (!localHostOk(req)) {
      jsonResponse(res, 403, { ok: false, error: 'local access only' })
      return
    }
    try {
      await handler(req, res)
    } catch (error) {
      logger?.warn?.(`dsh-pet-astra-yao: ${String(error?.stack ?? error)}`)
      if (!res.headersSent) jsonResponse(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }
}

/**
 * Register the pet routes on the DSH web server.
 * @param {object} ctx cordis context (or an object exposing `inject`)
 * @param {object} deps
 */
export function registerRoutes(ctx, deps) {
  if (typeof ctx?.inject !== 'function') return false
  ctx.inject(['webServer'], (httpCtx) => {
    const server = httpCtx?.webServer
    if (!server || typeof server.register !== 'function') return
    const effect = typeof httpCtx.effect === 'function' ? httpCtx.effect.bind(httpCtx) : ctx.effect?.bind(ctx)
    if (typeof effect !== 'function') return
    const handlers = deps.handlers
    const routes = [
      ['state', ENDPOINTS.state, handlers.serveState],
      ['config', ENDPOINTS.config, handlers.serveConfig],
      ['ack', ENDPOINTS.ack, handlers.serveAck],
      ['balance', ENDPOINTS.balance, handlers.serveBalance],
      ['spritesheet', ENDPOINTS.spritesheet, handlers.serveSpritesheet],
      ['manifest', ENDPOINTS.manifest, handlers.serveManifest],
    ]
    for (const [label, path, handler] of routes) {
      effect(
        () => server.register({ kind: 'exact', path, handler: guardHandler(handler, ctx.logger) }),
        `dsh-pet-astra-yao: ${label}`,
      )
    }
  })
  return true
}

/**
 * Mount the pet: session tracking, settings namespace and HTTP endpoints.
 */
export function mount(ctx, config = {}) {
  const tracker = createTracker()
  let cfg = normalizeConfig(config)
  let formScope = null
  let formUpdate = null

  function registerForms(settingsCtx) {
    if (formScope || !Config) return
    try {
      const forms = settingsCtx?.settings
        ?? (typeof settingsCtx?.get === 'function' ? settingsCtx.get('settings') : undefined)
      if (!forms || typeof forms.register !== 'function') return
      const scope = forms.register(PLUGIN_KEY, Config, { base: cfg, applies: 'live' })
      if (!scope) return
      formScope = scope
      cfg = normalizeConfig(typeof scope.get === 'function' ? scope.get() : cfg)
      tracker.setIncludeSubagents(cfg.includeSubagents)
      formUpdate = typeof scope.update === 'function' ? (patch) => scope.update(patch) : null
      if (typeof scope.watch === 'function') {
        const off = scope.watch((next) => {
          cfg = normalizeConfig(next)
          tracker.setIncludeSubagents(cfg.includeSubagents)
        })
        if (typeof off === 'function') ctx.effect?.(() => off, 'dsh-pet-astra-yao: config watch')
      }
    } catch (error) {
      ctx.logger?.warn?.(`dsh-pet-astra-yao: settings registration failed: ${String(error)}`)
    }
  }

  // Settings may already be live, or may arrive later.
  registerForms(ctx)
  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (settingsCtx) => registerForms(settingsCtx))
  }

  const store = {
    get: () => cfg,
    patch(patch) {
      const next = applyPatch(cfg, patch)
      cfg = next
      tracker.setIncludeSubagents(cfg.includeSubagents)
      try {
        formUpdate?.(patch)
      } catch (error) {
        ctx.logger?.warn?.(`dsh-pet-astra-yao: persisting config failed: ${String(error)}`)
      }
      return cfg
    },
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => {
      const disposers = []
      if (typeof ctx.on === 'function') {
        disposers.push(ctx.on('session/event', (session, event) => {
          tracker.setIncludeSubagents(cfg.includeSubagents)
          tracker.handle(session, event)
        }, { global: true }))
        disposers.push(ctx.on('session/disposed', (session) => tracker.dispose(session), { global: true }))
      }
      return () => {
        for (const dispose of disposers) {
          try {
            dispose?.()
          } catch {
            /* already gone */
          }
        }
      }
    }, 'dsh-pet-astra-yao: session events')
  }

  const credentialsService =
    (typeof ctx.get === 'function' ? ctx.get('credentials') : undefined) ?? ctx.credentials
  const balance = createBalanceService({
    resolveCredential:
      credentialsService && typeof credentialsService.resolve === 'function'
        ? (credentialName) => {
            try {
              return credentialsService.resolve(credentialName)
            } catch (error) {
              return Promise.reject(error)
            }
          }
        : undefined,
    log: (message) => ctx.logger?.warn?.(`dsh-pet-astra-yao: ${message}`),
  })

  const handlers = createHandlers({ tracker, store, balance })
  registerRoutes(ctx, { handlers })
  return { tracker, store, handlers, balance }
}

/** Cordis plugin entry. */
export function apply(ctx, config = {}) {
  return mount(ctx, config)
}
