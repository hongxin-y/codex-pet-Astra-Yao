import assert from 'node:assert/strict'
import test from 'node:test'

import { ACCOUNT_RECORD, dayWindow, createUsageService, summarizeUsage } from '../src/usage.js'

/** The platform's shape: one block per currency, each holding per-key series of hourly buckets. */
function body(cost = '0.536') {
  return {
    code: 0,
    data: {
      biz_code: 0,
      biz_msg: '',
      biz_data: {
        start: 1_792_857_600,
        end: 1_792_944_000,
        bucket: 3600,
        models: ['deepseek-flash'],
        functions: ['tool-search'],
        data: [
          {
            currency: 'CNY',
            series: [
              {
                api_key: { tracking_id: 'abc', name: 'labor-agent' },
                model: 'deepseek-flash',
                buckets: [
                  { time: 1_792_857_600, cost: '8.6946' },
                  { time: 1_792_861_200, cost: '0' },
                ],
              },
              {
                api_key: { tracking_id: 'def', name: 'DeepSeek Harness' },
                model: 'deepseek-flash',
                buckets: [{ time: 1_792_857_600, cost: cost }],
              },
            ],
          },
        ],
      },
    },
  }
}

test('today window starts at local midnight and spans exactly one day', () => {
  // 2026-10-25T07:40:00Z is 15:40 in UTC+8.
  const at = Date.parse('2026-10-25T07:40:00.000Z')
  const window = dayWindow(at, 8 * 3600)
  assert.equal(window.tz, 28_800)
  assert.equal(new Date(window.start * 1000).toISOString(), '2026-10-24T16:00:00.000Z')
  assert.equal(window.end - window.start, 86_400)

  // A negative offset has to land on its own local midnight, not on UTC's.
  const west = dayWindow(Date.parse('2026-10-25T03:10:00.000Z'), -7 * 3600)
  assert.equal(new Date(west.start * 1000).toISOString(), '2026-10-24T07:00:00.000Z')
})

test('the payload is summed per key and tolerates junk buckets', () => {
  const summary = summarizeUsage(body())
  assert.equal(summary.currency, 'CNY')
  assert.equal(summary.cost, 9.2306)
  assert.deepEqual(summary.byKey.map((entry) => entry.name).sort(), ['DeepSeek Harness', 'labor-agent'])

  const messy = body()
  messy.data.biz_data.data[0].series[0].buckets.push({ time: 1, cost: 'not-a-number' }, { time: 2 })
  assert.equal(summarizeUsage(messy).cost, 9.2306, 'unparsable costs count as zero instead of NaN')
  assert.equal(summarizeUsage({ data: {} }), null)
})

test('without a stored grant the service reports NO_GRANT and never calls fetch', async () => {
  let calls = 0
  const service = createUsageService({
    readRecord: async () => undefined,
    fetchImpl: async () => {
      calls += 1
      throw new Error('should not run')
    },
  })
  const result = await service.getTodayCost()
  assert.equal(result.ok, false)
  assert.equal(result.code, 'NO_GRANT')
  assert.equal(calls, 0)
})

test('a signed-in account is asked with the day window and its grant', async () => {
  const seen = {}
  const service = createUsageService({
    now: () => Date.parse('2026-10-25T07:40:00.000Z'),
    tzOffsetSeconds: () => 28_800,
    version: '9.9.9',
    readRecord: async (key) => {
      seen.key = key
      return { kind: 'grant', payload: { token: 'tok-123' } }
    },
    fetchImpl: async (url, options) => {
      seen.url = url
      seen.headers = options.headers
      return { ok: true, status: 200, async json() { return body() } }
    },
  })

  const result = await service.getTodayCost()
  assert.equal(result.ok, true)
  assert.equal(result.cost, 9.2306)
  assert.equal(result.currency, 'CNY')
  assert.equal(seen.key, ACCOUNT_RECORD)
  assert.match(seen.url, /start=1792857600&end=1792944000&tz=28800$/u)
  assert.equal(seen.headers['x-dsh-auth-token'], 'tok-123')
  assert.equal(seen.headers['x-client-version'], '9.9.9')
})

test('a rejected window, a broken response and a stale cache all stay values', async () => {
  const rejected = createUsageService({
    readRecord: async () => ({ kind: 'grant', payload: { token: 'tok' } }),
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return { data: { biz_code: 1, biz_msg: 'INVALID_PARAM' } } } }),
  })
  const bad = await rejected.getTodayCost()
  assert.equal(bad.ok, false)
  assert.equal(bad.code, 'SHAPE')
  assert.match(bad.error, /INVALID_PARAM/u)

  const http = createUsageService({
    readRecord: async () => ({ kind: 'grant', payload: { token: 'tok' } }),
    fetchImpl: async () => ({ ok: false, status: 500, async json() { return {} } }),
  })
  assert.equal((await http.getTodayCost()).code, 'HTTP')

  let calls = 0
  const cached = createUsageService({
    now: () => 1_000,
    ttlMs: 60_000,
    readRecord: async () => ({ kind: 'grant', payload: { token: 'tok' } }),
    fetchImpl: async () => {
      calls += 1
      return { ok: true, status: 200, async json() { return body() } }
    },
  })
  await cached.getTodayCost()
  await cached.getTodayCost()
  assert.equal(calls, 1, 'the second read is served from the cache')
  await cached.getTodayCost({ force: true })
  assert.equal(calls, 2)
})
