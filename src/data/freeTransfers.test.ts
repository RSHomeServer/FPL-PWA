import { describe, expect, it } from 'vitest'
import {
  bankedFreeTransfersAfterGameweek,
  deriveFreeTransfers,
  FREE_TRANSFER_BANK_CAP_V1,
  freeTransfersAtEventStart,
  GW1_STARTING_FT,
  HIT_COST_PER_TRANSFER,
  MAX_EXTRA_FREE_TRANSFERS_API,
} from './freeTransfers'
import type { ManagerHistoryGameweek } from './types'

function gw(
  event: number,
  eventTransfers: number,
  eventTransfersCost = Math.max(0, eventTransfers - 1) * 4,
): ManagerHistoryGameweek {
  return {
    event,
    points: 50,
    totalPoints: event * 50,
    bankTenths: 0,
    squadValueTenths: 1000,
    eventTransfers,
    eventTransfersCost,
    overallRank: 1,
  }
}

describe('bankedFreeTransfersAfterGameweek', () => {
  it.each([
    { ft: 1, made: 0, next: 2, label: 'unused 1 → bank to 2' },
    { ft: 2, made: 0, next: 2, label: 'unused 2 stays capped at 2' },
    { ft: 1, made: 1, next: 1, label: 'used all → next starts at 1' },
    { ft: 2, made: 1, next: 2, label: 'used 1 of 2 → leftover 1 +1 capped 2' },
    { ft: 2, made: 2, next: 1, label: 'used both → next 1' },
    { ft: 1, made: 3, next: 1, label: 'hits do not leave negative FT' },
    { ft: 0, made: 0, next: 1, label: 'degenerate 0 unused → 1' },
  ])('$label', ({ ft, made, next }) => {
    expect(bankedFreeTransfersAfterGameweek(ft, made)).toBe(next)
  })

  it('documents v1 bank cap 2 vs API max_extra_free_transfers 4', () => {
    expect(FREE_TRANSFER_BANK_CAP_V1).toBe(2)
    expect(MAX_EXTRA_FREE_TRANSFERS_API).toBe(4)
    expect(bankedFreeTransfersAfterGameweek(2, 0, FREE_TRANSFER_BANK_CAP_V1)).toBe(2)
  })
})

describe('freeTransfersAtEventStart', () => {
  it('starts GW1 with 1 FT', () => {
    expect(freeTransfersAtEventStart([], 1)).toBe(GW1_STARTING_FT)
  })

  it('banks after GW1 with no transfers → 2 at GW2', () => {
    expect(freeTransfersAtEventStart([gw(1, 0)], 2)).toBe(2)
  })

  it('after hits in GW2 with 1 FT → 1 at GW3', () => {
    // GW1 unused → 2 at GW2; GW2 made 3 with FT=2 → unused 0 → 1 at GW3
    expect(freeTransfersAtEventStart([gw(1, 0), gw(2, 3)], 3)).toBe(1)
  })

  it('wildcard completed GW resets next FT to 1', () => {
    const history = [gw(1, 0), gw(2, 5)]
    const chips = [{ name: 'wildcard', event: 2, time: '2026-08-28T12:00:00Z' }]
    expect(freeTransfersAtEventStart(history, 3, chips)).toBe(1)
  })
})

describe('deriveFreeTransfers', () => {
  it('computes hits and hit cost = 4 × H', () => {
    const result = deriveFreeTransfers({
      historyCurrent: [gw(1, 0)],
      currentEvent: 2,
      eventTransfers: 3,
      activeChip: null,
    })
    expect(result.freeTransfers).toBe(2)
    expect(result.eventTransfers).toBe(3)
    expect(result.hits).toBe(1)
    expect(result.hitCost).toBe(HIT_COST_PER_TRANSFER)
  })

  it('GW1 start with transfers beyond 1 FT takes hits', () => {
    const result = deriveFreeTransfers({
      historyCurrent: [],
      currentEvent: 1,
      eventTransfers: 3,
      activeChip: null,
    })
    expect(result.freeTransfers).toBe(1)
    expect(result.hits).toBe(2)
    expect(result.hitCost).toBe(8)
  })

  it('wildcard ignores hits', () => {
    const result = deriveFreeTransfers({
      historyCurrent: [gw(1, 0)],
      currentEvent: 2,
      eventTransfers: 8,
      activeChip: 'wildcard',
    })
    expect(result.hits).toBe(0)
    expect(result.hitCost).toBe(0)
    expect(result.chip).toBe('wildcard')
    expect(result.notes.some((n) => /wildcard/i.test(n))).toBe(true)
  })

  it('surfaces free hit without rewriting FT maths', () => {
    const result = deriveFreeTransfers({
      historyCurrent: [gw(1, 0)],
      currentEvent: 2,
      eventTransfers: 1,
      activeChip: 'freehit',
    })
    expect(result.chip).toBe('freehit')
    expect(result.notes.some((n) => /free hit/i.test(n))).toBe(true)
    expect(result.freeTransfers).toBe(2)
  })
})
