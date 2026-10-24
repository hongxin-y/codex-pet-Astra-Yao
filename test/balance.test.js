import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BALANCE_URL, LEDGER_FILE, createBalanceService } from '../src/balance.js'

// The service is built for injection: a fetch double keeps these tests offline
// and lets them assert the exact request and the ledger arithmetic.

// Each run gets a private DSH home under the OS temp directory, so the ledger
// file never lands in the repository.
const HOME = mkdtempSync(path.join(os.tmpdir(), 'dsh-pet-astra-yao-'))

function freshHome() {
  rmSync(HOME, { recursive: true, force: true })
  mkdirSync(HOME, { recursive: true })
  return HOME
}

test.after(() => rmSync(HOME, { recursive: true, force: true }))

function balancePayload(total, currency = 'CNY') {
  return { is_available: true, balance_infos: [{ currency, total_balance: total, granted_balance: '0.00', topped_up_balance: total }] }
}

function fetchStub(responses) {
  const calls = []
  const impl = async (url, options) => {
    calls.push({ url, options })
    const next = responses.shift()
    if (next instanceof Error) throw next
    if (next?.status && next.status >= 400) return { ok: false, status: next.status, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => next }
  }
  impl.calls = calls
  return impl
}

function credentialStub(value, error = null) {
  return async (name) => {
    if (error) throw error
    return value === undefined ? null : { value, name }
  }
}

test('reads the balance, accumulates today usage and keeps a ledger', async () => {
  const home = freshHome()
  let clock = Date.UTC(2026, 9, 24, 2, 0, 0)
  const fetchImpl = fetchStub([balancePayload('100.50'), balancePayload('99.75'), balancePayload('98.25')])
  const service = createBalanceService({
    resolveCredential: credentialStub('sk-test'),
    dshHome: home,
    fetchImpl,
    now: () => clock,
    ttlMs: 0,
  })

  const first = await service.getBalance()
  assert.equal(first.ok, true)
  assert.equal(first.totalBalance, 100.5)
  assert.equal(first.currency, 'CNY')
  assert.equal(first.todayUsage, 0)
  assert.equal(fetchImpl.calls[0].url, BALANCE_URL)
  assert.equal(fetchImpl.calls[0].options.headers.authorization, 'Bearer sk-test')

  clock += 60_000
  const second = await service.getBalance()
  assert.equal(second.totalBalance, 99.75)
  assert.equal(second.todayUsage, 0.75)

  clock += 60_000
  const third = await service.getBalance()
  assert.equal(third.totalBalance, 98.25)
  assert.equal(Math.round(third.todayUsage * 100) / 100, 2.25)

  const ledger = JSON.parse(readFileSync(path.join(home, LEDGER_FILE), 'utf8'))
  assert.equal(ledger.lastBalance, 98.25)
  assert.equal(Math.round(ledger.todayUsage * 100) / 100, 2.25)
})

test('a top-up does not count as negative usage', async () => {
  const home = freshHome()
  const now = () => Date.UTC(2026, 9, 24, 2, 0, 0)
  const fetchImpl = fetchStub([balancePayload('10.00'), balancePayload('30.00')])
  const service = createBalanceService({ resolveCredential: credentialStub('sk'), dshHome: home, fetchImpl, now, ttlMs: 0 })
  await service.getBalance()
  const after = await service.getBalance()
  assert.equal(after.todayUsage, 0)
  assert.equal(after.totalBalance, 30)
})

test('missing or unavailable credentials are values, not exceptions', async () => {
  const home = freshHome()
  const noCredential = createBalanceService({ resolveCredential: async () => null, dshHome: home, fetchImpl: fetchStub([]) })
  const missing = await noCredential.getBalance()
  assert.equal(missing.ok, false)
  assert.equal(missing.code, 'NO_KEY')

  const broken = createBalanceService({
    resolveCredential: credentialStub(undefined, new Error('vault locked')),
    dshHome: home,
    fetchImpl: fetchStub([]),
  })
  const failed = await broken.getBalance()
  assert.equal(failed.ok, false)
  assert.equal(failed.code, 'NO_SERVICE')
  assert.match(failed.error, /vault locked/u)

  const noService = createBalanceService({ dshHome: home, fetchImpl: fetchStub([]) })
  assert.equal((await noService.getBalance()).code, 'NO_SERVICE')
})

test('the ttl cache avoids duplicate requests and force goes through', async () => {
  const home = freshHome()
  let clock = Date.UTC(2026, 9, 24, 2, 0, 0)
  const fetchImpl = fetchStub([balancePayload('5.00'), balancePayload('4.00')])
  const service = createBalanceService({
    resolveCredential: credentialStub('sk'),
    dshHome: home,
    fetchImpl,
    now: () => clock,
    ttlMs: 60_000,
  })
  await service.getBalance()
  clock += 1000
  await service.getBalance()
  assert.equal(fetchImpl.calls.length, 1, 'cached read must not hit the network')
  await service.getBalance({ force: true })
  assert.equal(fetchImpl.calls.length, 2)
})

test('a transient failure falls back to the cached balance', async () => {
  const home = freshHome()
  let clock = Date.UTC(2026, 9, 24, 2, 0, 0)
  const fetchImpl = fetchStub([balancePayload('7.00'), new Error('socket hang up'), new Error('socket hang up')])
  const service = createBalanceService({
    resolveCredential: credentialStub('sk'),
    dshHome: home,
    fetchImpl,
    now: () => clock,
    ttlMs: 0,
  })
  await service.getBalance()
  clock += 60_000
  const stale = await service.getBalance()
  assert.equal(stale.ok, true)
  assert.equal(stale.stale, true)
  assert.equal(stale.totalBalance, 7)
  assert.match(stale.error, /socket hang up/u)
})

test('an http error is reported without a cache and is not retried five times', async () => {
  const home = freshHome()
  const fetchImpl = fetchStub([{ status: 401 }, { status: 401 }])
  const service = createBalanceService({ resolveCredential: credentialStub('sk'), dshHome: home, fetchImpl })
  const payload = await service.getBalance()
  assert.equal(payload.ok, false)
  assert.equal(payload.code, 'HTTP')
  assert.equal(payload.transient, false)
  assert.equal(fetchImpl.calls.length, 2)
})

test('the ledger rolls over on a new day', async () => {
  const home = freshHome()
  let clock = Date.UTC(2026, 9, 24, 2, 0, 0)
  const fetchImpl = fetchStub([balancePayload('50.00'), balancePayload('49.00'), balancePayload('49.00')])
  const service = createBalanceService({
    resolveCredential: credentialStub('sk'),
    dshHome: home,
    fetchImpl,
    now: () => clock,
    ttlMs: 0,
  })
  await service.getBalance()
  clock += 60_000
  assert.equal((await service.getBalance()).todayUsage, 1)
  clock += 24 * 60 * 60 * 1000
  const nextDay = await service.getBalance()
  assert.equal(nextDay.todayUsage, 0, 'a new day starts with zero usage')
  assert.equal(nextDay.totalBalance, 49)
})

test('in-flight requests are shared', async () => {
  const home = freshHome()
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    await gate
    return { ok: true, status: 200, json: async () => balancePayload('3.00') }
  }
  const service = createBalanceService({ resolveCredential: credentialStub('sk'), dshHome: home, fetchImpl })
  const first = service.getBalance()
  const second = service.getBalance()
  release()
  const [a, b] = await Promise.all([first, second])
  assert.equal(calls, 1)
  assert.equal(a.totalBalance, 3)
  assert.equal(b.totalBalance, 3)
})

test('a signed-in account supplies the balance without any API key', async () => {
  // The desktop app signs in with an account, so there is no DEEPSEEK_API_KEY to
  // read; the account service already holds the wallet.
  const home = freshHome()
  const fetchImpl = fetchStub([])
  const service = createBalanceService({
    readAccount: async () => ({ total: 88.5, currency: 'CNY' }),
    resolveCredential: async () => null,
    dshHome: home,
    fetchImpl,
  })
  const payload = await service.getBalance()
  assert.equal(payload.ok, true)
  assert.equal(payload.totalBalance, 88.5)
  assert.equal(payload.currency, 'CNY')
  assert.equal(payload.source, 'account')
  assert.equal(fetchImpl.calls.length, 0, 'the account read must not hit the public API')
})

test('the payload carries the wallet breakdown and when counting started', async () => {
  // "今日 ¥0.85" is only trustworthy when the user can see which wallets the
  // number was derived from and since when the drops were observed.
  const service = createBalanceService({
    readAccount: async () => ({
      total: 52.73,
      currency: 'CNY',
      wallets: [
        { kind: 'normal', currency: 'CNY', balance: 50 },
        { kind: 'bonus', currency: 'CNY', balance: 2.73 },
      ],
    }),
    resolveCredential: async () => null,
    dshHome: freshHome(),
    fetchImpl: fetchStub([]),
  })
  const payload = await service.getBalance()
  assert.equal(payload.totalBalance, 52.73)
  assert.deepEqual(payload.wallets.map((wallet) => wallet.kind).sort(), ['bonus', 'normal'])
  assert.match(String(payload.observedSince), /^\d{4}-\d{2}-\d{2}T/u, 'counting start is part of the payload')
})

test('a missing account wallet falls back to the key, account errors are reported', async () => {
  const viaKey = createBalanceService({
    readAccount: async () => ({ code: 'NO_ACCOUNT' }),
    resolveCredential: credentialStub('sk'),
    dshHome: freshHome(),
    fetchImpl: fetchStub([balancePayload('9.00')]),
  })
  const payload = await viaKey.getBalance()
  assert.equal(payload.ok, true)
  assert.equal(payload.source, 'key')

  const broken = createBalanceService({
    readAccount: async () => {
      throw new Error('grant expired')
    },
    resolveCredential: credentialStub('sk'),
    dshHome: freshHome(),
    fetchImpl: fetchStub([balancePayload('1.00')]),
  })
  const failed = await broken.getBalance()
  assert.equal(failed.ok, false)
  assert.equal(failed.code, 'ACCOUNT_ERROR')
  assert.match(failed.error, /grant expired/u)
})