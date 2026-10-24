import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { ENDPOINTS, apply } from '../src/index.js'

// A real loopback server around the plugin's real handlers: this exercises the
// same wiring DSH performs (webServer.register + Node request/response), the
// loopback guard against genuine headers, and the asset bytes on the wire.

async function startServer() {
  const routes = []
  const ctx = {
    logger: { warn() {} },
    inject(_services, callback) {
      callback({
        webServer: {
          register(route) {
            routes.push(route)
            return () => {}
          },
        },
        effect(factory) {
          factory()
          return () => {}
        },
      })
    },
    on: () => () => {},
    effect: (factory) => {
      factory()
      return () => {}
    },
  }

  apply(ctx, { scale: 1 })

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const route = routes.find((entry) => entry.path === path)
    if (!route) {
      res.writeHead(404).end()
      return
    }
    route.handler(req, res)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  return { server, base: `http://127.0.0.1:${port}`, routes }
}

test('the plugin answers over real HTTP', async (t) => {
  const { server, base, routes } = await startServer()
  t.after(() => new Promise((resolve) => server.close(resolve)))

  assert.equal(routes.length, 5)

  const state = await fetch(`${base}${ENDPOINTS.state}`)
  assert.equal(state.status, 200)
  assert.equal(state.headers.get('cache-control'), 'no-store')
  const snapshot = await state.json()
  assert.equal(snapshot.plugin.key, 'dsh-pet-astra-yao')
  assert.equal(snapshot.pet.id, 'astra-yao')
  assert.equal(snapshot.config.scale, 1)

  const patched = await fetch(`${base}${ENDPOINTS.config}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ opacity: 0.6, pose: 'nope' }),
  })
  assert.equal(patched.status, 400)

  const accepted = await fetch(`${base}${ENDPOINTS.config}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ opacity: 0.6 }),
  })
  assert.equal(accepted.status, 200)
  assert.equal((await accepted.json()).config.opacity, 0.6)

  const sheet = await fetch(`${base}${ENDPOINTS.spritesheet}`)
  assert.equal(sheet.status, 200)
  assert.equal(sheet.headers.get('content-type'), 'image/webp')
  const bytes = Buffer.from(await sheet.arrayBuffer())
  const onDisk = await readFile(new URL('../spritesheet.webp', import.meta.url))
  assert.equal(bytes.length, onDisk.length)
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.deepEqual(bytes, onDisk)

  const ack = await fetch(`${base}${ENDPOINTS.ack}`, { method: 'POST', body: '{}' })
  assert.equal(ack.status, 200)

  const missing = await fetch(`${base}${ENDPOINTS.state}x`)
  assert.equal(missing.status, 404)
})
