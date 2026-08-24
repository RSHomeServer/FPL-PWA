import { describe, expect, it } from 'vitest'
import {
  computeSellPriceTenths,
  deriveSellPrices,
  openingCostProxyTenths,
  TRANSFERS_CAP,
  TRANSFERS_SELL_ON_FEE,
} from './sellPrice'
import type { ManagerTransfer, SquadPick } from './types'

function pick(elementId: number, code = elementId): SquadPick {
  return {
    elementId,
    code,
    position: 1,
    isCaptain: false,
    isViceCaptain: false,
    multiplier: 1,
  }
}

function transfer(
  partial: Partial<ManagerTransfer> & Pick<ManagerTransfer, 'elementIn' | 'elementInCostTenths'>,
): ManagerTransfer {
  return {
    elementOut: 0,
    elementOutCostTenths: 0,
    entryId: 1,
    event: 2,
    time: '2026-08-20T12:00:00Z',
    ...partial,
  }
}

describe('computeSellPriceTenths', () => {
  it.each([
    { name: 'no change', purchase: 100, now: 100, sell: 100 },
    { name: 'rise +1 (no profit)', purchase: 100, now: 101, sell: 100 },
    { name: 'rise +2 (half)', purchase: 100, now: 102, sell: 101 },
    { name: 'rise +3 (floor half)', purchase: 100, now: 103, sell: 101 },
    { name: 'rise +4', purchase: 100, now: 104, sell: 102 },
    { name: 'fall -1 (full)', purchase: 100, now: 99, sell: 99 },
    { name: 'fall -2 (full)', purchase: 100, now: 98, sell: 98 },
  ])('$name: purchase $purchase now $now → sell $sell', ({ purchase, now, sell }) => {
    expect(computeSellPriceTenths(purchase, now)).toBe(sell)
  })

  it('uses transfers_sell_on_fee 0.5', () => {
    expect(TRANSFERS_SELL_ON_FEE).toBe(0.5)
    expect(computeSellPriceTenths(50, 54, TRANSFERS_SELL_ON_FEE)).toBe(52)
  })

  it('does not clamp large rises by transfers_cap (cap is max transfers/session)', () => {
    // +40 tenths rise → floor(20) retained; transfers_cap=20 is unrelated to £m profit
    expect(TRANSFERS_CAP).toBe(20)
    expect(computeSellPriceTenths(100, 140)).toBe(120)
  })
})

describe('deriveSellPrices', () => {
  const players = [
    { id: 1, code: 101, nowCostTenths: 80, costChangeStart: 5 }, // opening 75
    { id: 2, code: 102, nowCostTenths: 100, costChangeStart: 0 },
    { id: 3, code: 103, nowCostTenths: 60, costChangeStart: -2 }, // opening 62
  ]

  it('treats missing costChangeStart as 0 (stale Dexie / GW1 listed price)', () => {
    expect(openingCostProxyTenths({ nowCostTenths: 80, costChangeStart: undefined })).toBe(80)
    const map = deriveSellPrices({
      picks: [pick(9, 109)],
      transfers: [],
      players: [{ id: 9, code: 109, nowCostTenths: 80 }],
    })
    expect(map.get(9)).toMatchObject({
      purchasePriceTenths: 80,
      sellPriceTenths: 80,
      method: 'opening-proxy',
      uncertain: false,
    })
  })

  it('uses opening-proxy for GW1 holds (now_cost - cost_change_start)', () => {
    expect(openingCostProxyTenths(players[0]!)).toBe(75)
    const map = deriveSellPrices({
      picks: [pick(1, 101)],
      transfers: [],
      players,
      historyCurrent: [{ event: 1, points: 40, totalPoints: 40, bankTenths: 0, squadValueTenths: 1000, eventTransfers: 0, eventTransfersCost: 0, overallRank: 1 }],
    })
    const row = map.get(1)!
    expect(row.method).toBe('opening-proxy')
    expect(row.uncertain).toBe(false)
    expect(row.purchasePriceTenths).toBe(75)
    expect(row.sellPriceTenths).toBe(computeSellPriceTenths(75, 80)) // +5 → +2
  })

  it('reconstructs purchase from transfer log for later buys', () => {
    const map = deriveSellPrices({
      picks: [pick(2, 102)],
      transfers: [transfer({ elementIn: 2, elementInCostTenths: 96, event: 3 })],
      players,
    })
    const row = map.get(2)!
    expect(row.method).toBe('transfer-log')
    expect(row.purchasePriceTenths).toBe(96)
    expect(row.sellPriceTenths).toBe(computeSellPriceTenths(96, 100)) // +4 → +2 → 98
    expect(row.uncertain).toBe(false)
  })

  it('flags uncertain + conservative low when history shows transfers but log is empty', () => {
    const map = deriveSellPrices({
      picks: [pick(1, 101)],
      transfers: [],
      players,
      historyCurrent: [
        {
          event: 2,
          points: 50,
          totalPoints: 90,
          bankTenths: 10,
          squadValueTenths: 1010,
          eventTransfers: 2,
          eventTransfersCost: 4,
          overallRank: 10,
        },
      ],
    })
    const row = map.get(1)!
    expect(row.uncertain).toBe(true)
    expect(row.method).toBe('conservative')
    // Conservative: never assume sell-on profit above now_cost
    expect(row.sellPriceTenths).toBeLessThanOrEqual(row.nowCostTenths)
  })

  it('flags uncertain when bootstrap player is missing', () => {
    const map = deriveSellPrices({
      picks: [pick(99, 999)],
      transfers: [],
      players,
    })
    const row = map.get(99)!
    expect(row.uncertain).toBe(true)
    expect(row.method).toBe('conservative')
    expect(row.sellPriceTenths).toBe(0)
  })

  it('prefers latest transfer-in when a player was bought more than once', () => {
    const map = deriveSellPrices({
      picks: [pick(2, 102)],
      transfers: [
        transfer({ elementIn: 2, elementInCostTenths: 90, event: 2, time: '2026-08-01T00:00:00Z' }),
        transfer({ elementIn: 2, elementInCostTenths: 97, event: 5, time: '2026-09-01T00:00:00Z' }),
      ],
      players,
    })
    expect(map.get(2)!.purchasePriceTenths).toBe(97)
  })
})
