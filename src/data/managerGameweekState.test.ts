import { describe, expect, it } from 'vitest'
import { buildManagerGameweekStateFromSnapshot } from './managerGameweekState'
import type { ManagerSnapshot, ManagerTransfer, SquadPick } from './types'

function pick(elementId: number, code: number, position: number): SquadPick {
  return {
    elementId,
    code,
    position,
    isCaptain: position === 1,
    isViceCaptain: false,
    multiplier: position === 1 ? 2 : 1,
  }
}

describe('buildManagerGameweekStateFromSnapshot', () => {
  it('composes sell prices + FT without mutating the snapshot picks array', () => {
    const picks = [pick(1, 101, 1), pick(2, 102, 2)]
    const snapshot: ManagerSnapshot = {
      entry: {
        identity: {
          entryId: 8585919,
          teamName: 'Test',
          playerFirstName: 'A',
          playerLastName: 'B',
        },
        startedEvent: 1,
        currentEvent: 2,
        summaryOverallPoints: 50,
        summaryOverallRank: 1,
        lastDeadlineBankTenths: 5,
        lastDeadlineValueTenths: 1005,
      },
      picks: {
        entryId: 8585919,
        event: 2,
        picks,
        entryHistory: {
          event: 2,
          points: 0,
          totalPoints: 50,
          bankTenths: 5,
          squadValueTenths: 1005,
          eventTransfers: 0,
          eventTransfersCost: 0,
          pointsOnBench: 0,
        },
        activeChip: null,
        automaticSubs: [],
      },
      history: {
        current: [
          {
            event: 1,
            points: 50,
            totalPoints: 50,
            bankTenths: 0,
            squadValueTenths: 1000,
            eventTransfers: 0,
            eventTransfersCost: 0,
            overallRank: 1,
          },
        ],
        chips: [],
      },
      event: 2,
      fetchedAt: 1_700_000_000_000,
    }

    const transfers: ManagerTransfer[] = [
      {
        elementIn: 2,
        elementInCostTenths: 70,
        elementOut: 9,
        elementOutCostTenths: 65,
        entryId: 8585919,
        event: 1,
        time: '2026-08-15T12:00:00Z',
      },
    ]

    const players = [
      { id: 1, code: 101, nowCostTenths: 80, costChangeStart: 5 },
      { id: 2, code: 102, nowCostTenths: 72, costChangeStart: 0 },
    ]

    const before = structuredClone(picks)
    const state = buildManagerGameweekStateFromSnapshot(snapshot, { transfers, players })

    expect(state.freeTransfers).toBe(2)
    expect(state.freeTransferDetail.hits).toBe(0)
    expect(state.sellPrices.size).toBe(2)
    expect(state.sellPrices.get(1)?.method).toBe('opening-proxy')
    expect(state.sellPrices.get(2)?.method).toBe('transfer-log')
    expect(state.sellPriceTenthsByCode.get(101)).toBe(state.sellPrices.get(1)?.sellPriceTenths)
    expect(picks).toEqual(before)
  })
})
