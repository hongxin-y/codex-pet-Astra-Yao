/**
 * DeepSeek balance / today-usage service for the Astra Yao pet.
 *
 * Two numbers, one HTTP call each day-at-most beyond a short cache:
 *   - balance:      `https://api.deepseek.com/user/balance` with the
 *                   `DEEPSEEK_API_KEY` credential the harness already holds.
 *   - today usage:  the balance drops are accumulated into a local ledger
 *                   (`$DSH_HOME/.dsh-pet-astra-yao-usage.json`), so no
 *                   pricing table and no second API token are needed.
 *
 * The service is time-injected and fetch-injected so the tests stay offline,
 * and it never throws: every failure is a value the client can render.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const BALANCE_URL = 'https://api.deepseek.com/user/balance'
export const LEDGER_FILE = '.dsh-pet-astra-yao-usage.json'
const DEFAULT_TTL_MS = 60_000
const REQUEST_TIMEOUT_MS = 15_000

function clampText(value, max) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, max)
}

function todayKey(now) {
  const d = new Date(now)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * @param {object} options
 * @param {(name: string) => Promise<{value: string}|null>} [options.resolveCredential]
 * @param {() => Promise<{total: number, currency: string}|{code: string, error?: string}|null>} [options.readAccount]
 *   Reads the signed-in account wallet through DSH's own account service, so an
 *   account login never needs an API key. `{ code: 'NO_ACCOUNT' }` means "fall
 *   back to the API key"; any other code is reported as-is.
 * @param {string} [options.dshHome]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 * @param {number} [options.ttlMs]
 * @param {(message: string) => void} [options.log]
 */
export function createBalanceService(options = {}) {
  const resolveCredential = options.resolveCredential
  const readAccount = options.readAccount
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const now = options.now ?? (() => Date.now())
  const ttlMs = Number.isFinite(options.ttlMs) ? Number(options.ttlMs) : DEFAULT_TTL_MS
  const dshHome = options.dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const ledgerPath = path.join(dshHome, LEDGER_FILE)
  const log = typeof options.log === 'function' ? options.log : () => {}

  let cache = null
  let inFlight = null

  function readLedger() {
    try {
      const parsed = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
      if (parsed && typeof parsed === 'object' && typeof parsed.date === 'string') return parsed
    } catch {
      /* first run, or a corrupt file: start over */
    }
    return { date: todayKey(now()), lastBalance: null, todayUsage: 0 }
  }

  function writeLedger(ledger) {
    try {
      fs.mkdirSync(path.dirname(ledgerPath), { recursive: true })
      fs.writeFileSync(ledgerPath, JSON.stringify(ledger), 'utf8')
      return true
    } catch (error) {
      log(`ledger write failed: ${clampText(error?.message ?? error, 120)}`)
      return false
    }
  }

  /** Accumulate the balance drop since the previous observation into today's total. */
  function recordUsage(totalBalance) {
    const ledger = readLedger()
    const today = todayKey(now())
    if (ledger.date !== today) {
      ledger.date = today
      ledger.lastBalance = totalBalance
      ledger.todayUsage = 0
    } else {
      const previous = typeof ledger.lastBalance === 'number' ? ledger.lastBalance : totalBalance
      if (typeof previous === 'number' && previous > totalBalance) {
        ledger.todayUsage = Number(ledger.todayUsage || 0) + (previous - totalBalance)
      }
      ledger.lastBalance = totalBalance
    }
    writeLedger(ledger)
    return Number(ledger.todayUsage || 0)
  }

  async function request(url, token) {
    const response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }

  function settle(total, currency, source) {
    const todayUsage = recordUsage(total)
    return {
      ok: true,
      totalBalance: total,
      currency: String(currency || 'CNY'),
      todayUsage,
      source,
      updatedAt: new Date(now()).toISOString(),
    }
  }

  /** Reads the signed-in account wallet first: that works without any API key. */
  async function readFromAccount() {
    if (typeof readAccount !== 'function') return { code: 'NO_ACCOUNT' }
    let outcome = null
    try {
      outcome = await readAccount()
    } catch (error) {
      return { code: 'ACCOUNT_ERROR', transient: true, error: `账户余额读取失败: ${clampText(error?.message ?? error, 120)}` }
    }
    if (!outcome) return { code: 'NO_ACCOUNT' }
    if (Number.isFinite(outcome.total)) return settle(outcome.total, outcome.currency, 'account')
    return outcome
  }

  async function readFromApiKey() {
    if (typeof resolveCredential !== 'function') {
      return { ok: false, code: 'NO_SERVICE', error: '凭据服务不可用' }
    }
    let credential = null
    try {
      credential = await resolveCredential('DEEPSEEK_API_KEY')
    } catch (error) {
      return { ok: false, code: 'NO_SERVICE', error: `凭据读取失败: ${clampText(error?.message ?? error, 120)}` }
    }
    const token = clampText(credential?.value, 512).replace(/^Bearer\s+/iu, '')
    if (!token) return { ok: false, code: 'NO_KEY', error: '未配置 DEEPSEEK_API_KEY' }

    let lastError = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const data = await request(BALANCE_URL, token)
        const info = Array.isArray(data?.balance_infos) ? data.balance_infos[0] : null
        const total = Number(info?.total_balance)
        if (!info || !Number.isFinite(total)) {
          return { ok: false, code: 'SHAPE', error: '余额接口返回结构异常' }
        }
        return settle(total, info.currency, 'key')
      } catch (error) {
        lastError = error
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400))
      }
    }
    const message = clampText(lastError?.message ?? lastError, 160)
    const transient = !/^HTTP 4\d\d/u.test(message)
    return { ok: false, code: 'HTTP', transient, error: `余额请求失败: ${message}` }
  }

  async function fetchBalance() {
    const account = await readFromAccount()
    if (account.ok) return account
    // "no account wallet" only means "try the API key instead"; a real account
    // failure (expired grant, network) is worth reporting on its own.
    if (account.code !== 'NO_ACCOUNT') return { ...account, ok: false }
    return readFromApiKey()
  }

  /**
   * @param {{force?: boolean}} [options]
   * @returns {Promise<object>} balance payload; never rejects
   */
  async function getBalance(options = {}) {
    const at = now()
    if (!options.force && cache && at - cache.at < ttlMs) return cache.payload
    if (inFlight) return inFlight
    inFlight = fetchBalance()
      .then((payload) => {
        if (payload.ok) {
          cache = { at: now(), payload }
          return payload
        }
        if (payload.transient && cache) return { ...cache.payload, stale: true, error: payload.error }
        if (!payload.transient) log(`${payload.code} ${payload.error}`)
        return payload
      })
      .catch((error) => ({ ok: false, code: 'ERROR', error: clampText(error?.message ?? error, 160) }))
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  function invalidate() {
    cache = null
  }

  return { getBalance, invalidate, ledgerPath }
}
