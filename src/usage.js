/**
 * Today's spend, read from the platform's own usage endpoint.
 *
 * The wallet balance can only be sampled, so a "today" figure derived from
 * balance drops always misses whatever happened while the plugin was not
 * running. The signed-in account grant can ask the platform for the per-hour
 * cost series instead, which is the same number its usage page prints.
 *
 * Everything here is injected (clock, fetch, credential reader) so the tests
 * stay offline, and every failure is a value — the caller decides how loud to
 * be about it.
 */

export const USAGE_URL = 'https://platform.deepseek.com/api/v0/usage/by_api_key/cost'
export const ACCOUNT_RECORD = 'deepseek-account-platform/default'
const DAY_SECONDS = 86_400
const HOUR_SECONDS = 3_600
const DEFAULT_TTL_MS = 60_000
const REQUEST_TIMEOUT_MS = 15_000

/** Local-midnight window, expressed in epoch seconds, plus the offset the platform wants back. */
export function dayWindow(nowMs, tzOffsetSeconds) {
  const tz = Number.isFinite(tzOffsetSeconds) ? Math.trunc(tzOffsetSeconds) : 0
  const local = Math.floor((Math.trunc(nowMs / 1000) + tz) / DAY_SECONDS) * DAY_SECONDS
  const start = local - tz
  return { start, end: start + DAY_SECONDS, tz }
}

/**
 * Turn the platform payload into one number plus a per-key breakdown.
 * Buckets carry `cost` as a decimal string; anything unparsable counts as zero
 * rather than poisoning the sum with NaN.
 */
export function summarizeUsage(body) {
  const data = body?.data ?? {}
  const bizData = data?.biz_data
  if (!bizData || !Array.isArray(bizData.data)) return null

  const byKey = new Map()
  let cost = 0
  let currency = ''

  const add = (key, amount) => {
    const value = typeof amount === 'number' ? amount : Number.parseFloat(String(amount ?? ''))
    if (!Number.isFinite(value) || value === 0) return 0
    byKey.set(key, (byKey.get(key) ?? 0) + value)
    return value
  }

  for (const block of bizData.data) {
    const blockCurrency = String(block?.currency ?? 'CNY')
    if (!currency) currency = blockCurrency
    for (const series of block?.series ?? []) {
      const key = String(series?.api_key?.name || series?.api_key?.tracking_id || 'unknown')
      for (const bucket of series?.buckets ?? []) cost += add(key, bucket?.cost)
    }
    for (const series of block?.function_series ?? []) {
      const key = String(series?.api_key?.name || 'tools')
      for (const bucket of series?.buckets ?? []) cost += add(key, bucket?.cost)
    }
  }

  return {
    cost: Math.round(cost * 1e6) / 1e6,
    currency: currency || 'CNY',
    byKey: [...byKey.entries()].map(([name, value]) => ({ name, cost: Math.round(value * 1e6) / 1e6 })),
    bucket: Number.isFinite(bizData.bucket) ? bizData.bucket : HOUR_SECONDS,
  }
}

export function createUsageService(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch
  const readRecord = typeof options.readRecord === 'function' ? options.readRecord : null
  const version = String(options.version ?? '0.0.0')
  const ttlMs = Number.isFinite(options.ttlMs) ? Number(options.ttlMs) : DEFAULT_TTL_MS
  const log = typeof options.log === 'function' ? options.log : () => {}
  const offsetOf = typeof options.tzOffsetSeconds === 'function' ? options.tzOffsetSeconds : null

  let cache = null
  let inFlight = null

  async function grant() {
    if (!readRecord) return null
    try {
      const record = await readRecord(ACCOUNT_RECORD)
      if (!record || record.kind !== 'grant') return null
      const token = typeof record.payload?.token === 'string' ? record.payload.token.trim() : ''
      return token || null
    } catch (error) {
      log(`usage grant read failed: ${String(error?.message ?? error).slice(0, 120)}`)
      return null
    }
  }

  async function fetchToday() {
    const token = await grant()
    if (!token) return { ok: false, code: 'NO_GRANT', error: '没有可用的账户登录凭证' }

    const tz = offsetOf ? offsetOf() : -new Date(now()).getTimezoneOffset() * 60
    const window = dayWindow(now(), tz)
    const url = `${USAGE_URL}?start=${window.start}&end=${window.end}&tz=${window.tz}`

    try {
      const response = await fetchImpl(url, {
        headers: {
          'x-dsh-auth-token': token,
          'x-client-bundle-id': '',
          'x-client-platform': 'web',
          'x-client-version': version,
          'x-client-locale': 'zh_CN',
          'x-client-timezone-offset': String(window.tz),
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) return { ok: false, code: 'HTTP', status: response.status, error: `HTTP ${response.status}` }
      const body = await response.json()
      if (body?.data?.biz_code !== 0) {
        const code = body?.data?.biz_code ?? 'NO_CODE'
        return { ok: false, code: 'SHAPE', error: `平台返回 ${code} ${String(body?.data?.biz_msg ?? '').trim()}` }
      }
      const summary = summarizeUsage(body)
      if (!summary) return { ok: false, code: 'SHAPE', error: '返回结构不符合预期' }
      return {
        ok: true,
        cost: summary.cost,
        currency: summary.currency,
        byKey: summary.byKey,
        from: new Date(window.start * 1000).toISOString(),
        to: new Date(window.end * 1000).toISOString(),
        updatedAt: new Date(now()).toISOString(),
      }
    } catch (error) {
      return { ok: false, code: 'ERROR', error: String(error?.message ?? error).slice(0, 120) }
    }
  }

  async function getTodayCost(options = {}) {
    const at = now()
    if (!options.force && cache && at - cache.at < ttlMs) return cache.payload
    if (inFlight) return inFlight
    inFlight = fetchToday()
      .then((payload) => {
        if (payload.ok) cache = { at, payload }
        return payload
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return { getTodayCost, invalidate: () => { cache = null } }
}
