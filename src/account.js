/**
 * Mapping from the DSH account service outcome to the shape the balance service
 * consumes. Kept dependency-free so it can be unit tested without a host.
 *
 * `deepseekAccount.getBalance()` resolves to
 *   `{ status: 'ready', value: <normal wallets>, bonusWallets: <bonus wallets> }`
 *   `{ status: 'failed' }`
 *   `null`                       (signed out)
 * where a wallet is `{ currency: 'CNY' | 'USD', balance: <decimal string> }`.
 */

const ACCOUNT_CURRENCIES = new Set(['CNY', 'USD'])

function walletKindList(list, kind) {
  if (!Array.isArray(list)) return []
  return list
    .map((item) => ({
      kind,
      currency: String(item?.currency ?? 'CNY').toUpperCase(),
      balance: Number(item?.balance),
    }))
    .filter((wallet) => Number.isFinite(wallet.balance))
}

/**
 * Turns the account outcome into `{ total, currency, wallets, totalCost }`
 * (ready) or `{ code }` (fall through to the API key). Recharge balance and gift
 * balance are separate wallets that get consumed separately, so the total has to
 * be a sum per currency: using only the first wallet reports both a smaller
 * balance and a smaller daily drop.
 *
 * `total_costs` is the account's own lifetime spend counter. It is a far better
 * source for "today's usage" than balance deltas: it only ever grows, so a
 * baseline captured once a day gives an exact figure, while a balance can also
 * move because of a top-up or an expiring gift.
 */
export function readAccountOutcome(outcome) {
  if (!outcome) return { code: 'NO_ACCOUNT' }
  if (outcome.status === 'failed') {
    return { code: 'ACCOUNT_ERROR', transient: true, error: '账户余额读取失败' }
  }
  const wallets = [
    ...walletKindList(outcome.value, 'normal'),
    ...walletKindList(outcome.bonusWallets, 'bonus'),
  ]
  if (wallets.length === 0) return { code: 'NO_ACCOUNT' }
  const totals = new Map()
  for (const wallet of wallets) {
    const sum = (totals.get(wallet.currency) ?? 0) + wallet.balance
    totals.set(wallet.currency, Number(sum.toFixed(8)))
  }
  const currency = [...totals.keys()].find((code) => ACCOUNT_CURRENCIES.has(code)) ?? wallets[0].currency
  const total = totals.get(currency)
  if (!Number.isFinite(total)) return { code: 'NO_ACCOUNT' }
  const costs = Array.isArray(outcome.totalCosts) ? outcome.totalCosts : []
  const cost = costs
    .map((item) => ({ currency: String(item?.currency ?? currency).toUpperCase(), amount: Number(item?.amount) }))
    .find((item) => item.currency === currency && Number.isFinite(item.amount))
  return {
    total,
    currency,
    wallets: wallets.filter((wallet) => wallet.currency === currency),
    totalCost: cost ? cost.amount : null,
  }
}
