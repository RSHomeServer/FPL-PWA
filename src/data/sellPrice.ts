/**
 * Sell-price reconstruction (discovery §2.4).
 *
 * Official `game_settings.transfers_sell_on_fee = 0.5`: keep half of any rise
 * since purchase (floor to tenths); price falls apply in full.
 *
 * `game_settings.transfers_cap = 20` is the API max transfers per transfer
 * session — it does **not** cap sell-on profit. Documented here so tests can
 * assert that large rises still use floor(half rise) without a £2.0m clamp.
 */

import type {
  FplLivePlayer,
  ManagerHistoryGameweek,
  ManagerTransfer,
  SellPriceByElement,
  SellPriceDetail,
  SquadPick,
} from './types'

/** Bootstrap / API sell-on fee (fraction of price rise retained). */
export const TRANSFERS_SELL_ON_FEE = 0.5

/**
 * API `transfers_cap` — max transfers in one transfer action, not a sell-price clamp.
 * Kept for documentation / golden tests (discovery §7.1).
 */
export const TRANSFERS_CAP = 20

export type DeriveSellPricesArgs = {
  picks: readonly SquadPick[]
  transfers: readonly ManagerTransfer[]
  players: readonly Pick<FplLivePlayer, 'id' | 'code' | 'nowCostTenths' | 'costChangeStart'>[]
  /** Season history — used to detect incomplete transfer logs. */
  historyCurrent?: readonly ManagerHistoryGameweek[]
}

/**
 * FPL sell price in tenths: half of rises (floored), full falls.
 *
 * Examples (purchase 100): now 104 → 102; now 103 → 101; now 98 → 98; now 100 → 100.
 */
export function computeSellPriceTenths(
  purchasePriceTenths: number,
  nowCostTenths: number,
  sellOnFee = TRANSFERS_SELL_ON_FEE,
): number {
  const delta = nowCostTenths - purchasePriceTenths
  if (delta > 0) {
    return purchasePriceTenths + Math.floor(delta * sellOnFee)
  }
  return nowCostTenths
}

/** Opening-cost proxy: `now_cost - cost_change_start`. */
export function openingCostProxyTenths(
  player: Pick<FplLivePlayer, 'nowCostTenths' | 'costChangeStart'>,
): number {
  return player.nowCostTenths - player.costChangeStart
}

function latestPurchaseFromTransfers(
  elementId: number,
  transfers: readonly ManagerTransfer[],
): ManagerTransfer | null {
  let best: ManagerTransfer | null = null
  for (const row of transfers) {
    if (row.elementIn !== elementId) continue
    if (
      !best ||
      row.event > best.event ||
      (row.event === best.event && row.time > best.time)
    ) {
      best = row
    }
  }
  return best
}

function seasonHadTransfers(historyCurrent: readonly ManagerHistoryGameweek[] | undefined): boolean {
  if (!historyCurrent?.length) return false
  return historyCurrent.some((row) => row.eventTransfers > 0)
}

/**
 * Derive sell prices for the current 15 picks. Does not mutate Dexie or picks.
 */
export function deriveSellPrices(args: DeriveSellPricesArgs): SellPriceByElement {
  const byElement = new Map(args.players.map((player) => [player.id, player]))
  const historyHadTransfers = seasonHadTransfers(args.historyCurrent)
  const transferLogEmpty = args.transfers.length === 0
  const result: SellPriceByElement = new Map()

  for (const pick of args.picks) {
    const player = byElement.get(pick.elementId)
    const buy = latestPurchaseFromTransfers(pick.elementId, args.transfers)
    let detail: SellPriceDetail

    if (buy) {
      const purchasePriceTenths = buy.elementInCostTenths
      const nowCostTenths = player?.nowCostTenths ?? purchasePriceTenths
      detail = {
        elementId: pick.elementId,
        code: pick.code || player?.code || 0,
        purchasePriceTenths,
        nowCostTenths,
        sellPriceTenths: computeSellPriceTenths(purchasePriceTenths, nowCostTenths),
        uncertain: false,
        method: 'transfer-log',
      }
    } else if (player) {
      const purchasePriceTenths = openingCostProxyTenths(player)
      const sell = computeSellPriceTenths(purchasePriceTenths, player.nowCostTenths)
      // Held since GW1 with no buy in the log. If the season shows transfers but the
      // transfer store is empty, the log may be incomplete — flag + conservative.
      const uncertain = historyHadTransfers && transferLogEmpty
      const sellPriceTenths = uncertain ? Math.min(sell, player.nowCostTenths) : sell
      detail = {
        elementId: pick.elementId,
        code: pick.code || player.code,
        purchasePriceTenths,
        nowCostTenths: player.nowCostTenths,
        sellPriceTenths,
        uncertain,
        method: uncertain ? 'conservative' : 'opening-proxy',
      }
    } else {
      // No bootstrap row — cannot reconstruct; treat purchase = 0 rise, sell unknown-low.
      detail = {
        elementId: pick.elementId,
        code: pick.code,
        purchasePriceTenths: 0,
        nowCostTenths: 0,
        sellPriceTenths: 0,
        uncertain: true,
        method: 'conservative',
      }
    }

    result.set(pick.elementId, detail)
  }

  return result
}

export function sellPriceTenthsByCode(sellPrices: SellPriceByElement): Map<number, number> {
  const byCode = new Map<number, number>()
  for (const detail of sellPrices.values()) {
    if (detail.code > 0) byCode.set(detail.code, detail.sellPriceTenths)
  }
  return byCode
}
