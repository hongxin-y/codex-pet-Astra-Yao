import assert from 'node:assert/strict'
import test from 'node:test'

import { readAccountOutcome } from '../src/account.js'

test('recharge and bonus wallets are summed instead of taking the first one', () => {
  const outcome = readAccountOutcome({
    status: 'ready',
    value: [{ currency: 'CNY', balance: '50.00' }],
    bonusWallets: [{ currency: 'CNY', balance: '2.73' }],
  })
  assert.equal(outcome.total, 52.73)
  assert.equal(outcome.currency, 'CNY')
  assert.equal(outcome.wallets.length, 2)
  assert.deepEqual(outcome.wallets.map((wallet) => wallet.kind).sort(), ['bonus', 'normal'])
})

test('scientific notation and decimal strings both parse', () => {
  const outcome = readAccountOutcome({
    status: 'ready',
    value: [
      { currency: 'CNY', balance: '5.346462856e1' },
      { currency: 'USD', balance: '1.5' },
    ],
    bonusWallets: [],
  })
  assert.equal(outcome.currency, 'CNY')
  assert.equal(outcome.total, 53.46462856)
  assert.equal(outcome.wallets.length, 1, 'only wallets of the reported currency are kept')
})

test('a USD-only account reports USD', () => {
  const outcome = readAccountOutcome({
    status: 'ready',
    value: [{ currency: 'USD', balance: '2.00' }],
    bonusWallets: [{ currency: 'USD', balance: '0.50' }],
  })
  assert.equal(outcome.currency, 'USD')
  assert.equal(outcome.total, 2.5)
})

test('junk wallet entries are ignored, an empty wallet list falls through', () => {
  assert.deepEqual(
    readAccountOutcome({ status: 'ready', value: [{ currency: 'CNY', balance: 'abc' }], bonusWallets: null }),
    { code: 'NO_ACCOUNT' },
  )
  assert.deepEqual(readAccountOutcome({ status: 'ready', value: [], bonusWallets: [] }), { code: 'NO_ACCOUNT' })
})

test('a signed-out account falls through to the API key, a failed read does not', () => {
  assert.deepEqual(readAccountOutcome(null), { code: 'NO_ACCOUNT' })
  const failed = readAccountOutcome({ status: 'failed' })
  assert.equal(failed.code, 'ACCOUNT_ERROR')
  assert.equal(failed.transient, true)
})

test('the lifetime spend counter is passed through when the service exposes it', () => {
  // DSH's balance query currently drops total_costs, but if a future runtime
  // keeps it the plugin can report an exact daily figure instead of a delta.
  const withCosts = readAccountOutcome({
    status: 'ready',
    value: [{ currency: 'CNY', balance: '52.15590008' }],
    bonusWallets: [{ currency: 'CNY', balance: '0' }],
    totalCosts: [{ currency: 'CNY', amount: '582.30983528' }],
  })
  assert.equal(withCosts.total, 52.15590008)
  assert.equal(withCosts.totalCost, 582.30983528)

  const withoutCosts = readAccountOutcome({ status: 'ready', value: [{ currency: 'CNY', balance: '1' }] })
  assert.equal(withoutCosts.totalCost, null)
})
