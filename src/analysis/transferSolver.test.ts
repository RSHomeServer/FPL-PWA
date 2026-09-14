import { describe, expect, it } from 'vitest'
import type { FplLivePlayer, PlayerPosition } from '../data/types'
import { HIT_COST_PER_TRANSFER } from '../data/freeTransfers'
import { solveTransfers } from './transferSolver'
import {
  buildTransferLp,
  buildTransferPool,
  greedySequentialTransfers,
  hitCostForTransfers,
  hitCountForTransfers,
  isLegalTransferSquad,
  pairTransferSwaps,
  transferCountsToEnumerate,
  transferObjectiveEp,
  type TransferLpCandidate,
} from './transferSquad'
import type { LiveProjection } from './liveProject'

describe('pairTransferSwaps', () => {
  it('pairs same-position moves first', () => {
    const outs = [
      { code: 1, webName: 'A', teamShortName: 'T1', position: 'MID', priceTenths: 50, ep: 3 },
      { code: 2, webName: 'B', teamShortName: 'T2', position: 'FWD', priceTenths: 60, ep: 4 },
    ]
    const ins = [
      { code: 9, webName: 'X', teamShortName: 'T9', position: 'FWD', priceTenths: 70, ep: 6 },
      { code: 8, webName: 'Y', teamShortName: 'T8', position: 'MID', priceTenths: 55, ep: 5 },
    ]
    const pairs = pairTransferSwaps(outs, ins)
    expect(pairs).toHaveLength(2)
    expect(pairs[0]).toMatchObject({ out: { code: 2 }, inn: { code: 9 }, costDeltaTenths: 10, epDelta: 2 })
    expect(pairs[1]).toMatchObject({ out: { code: 1 }, inn: { code: 8 }, costDeltaTenths: 5, epDelta: 2 })
  })
})

describe('transfer hit maths', () => {
  it('enumerates 0..FT+3 and prices hits from FT', () => {
    expect(transferCountsToEnumerate(1)).toEqual([0, 1, 2, 3, 4])
    expect(transferCountsToEnumerate(2, { hitCap: 2 })).toEqual([0, 1, 2, 3, 4])
    expect(hitCountForTransfers(3, 1)).toBe(2)
    expect(hitCostForTransfers(3, 1)).toBe(8)
    expect(hitCostForTransfers(15, 1, true)).toBe(0)
  })
})

describe('transfer LP budget linearisation', () => {
  it('emits bank + sells cover buys (not sequenced)', () => {
    const current = baseSquad()
    const pool = withExtras(current, [
      livePlayer({
        code: 901,
        position: 'MID',
        teamId: 12,
        nowCostTenths: 70,
        ePtsNext: 8,
        ePtsByGw: [8, 8, 8, 8, 8],
      }),
      livePlayer({
        code: 902,
        position: 'MID',
        teamId: 13,
        nowCostTenths: 30,
        ePtsNext: 4,
        ePtsByGw: [4, 4, 4, 4, 4],
      }),
    ])
    const owned = new Set(current.map((row) => row.code))
    const sell = new Map(current.map((row) => [row.code, row.nowCostTenths]))
    const candidates = buildTransferPool(pool, owned, sell, { epKeepTopFraction: 1 })
    const lp = buildTransferLp(candidates, 'immediate', {
      bankTenths: 0,
      transferCount: 2,
      freeTransfers: 2,
    })
    expect(lp).toContain('budget:')
    expect(lp).toContain('transfers_out:')
    expect(lp).toContain('transfers_in:')
    expect(lp).toMatch(/transfers_out:.* = 2/)
    expect(lp).toMatch(/transfers_in:.* = 2/)
    expect(lp).toMatch(/budget:.*- \d+ s/)
  })
})

describe('simultaneous transfers vs greedy', () => {
  it('beats greedy when intermediate bank cannot fund a single premium buy', async () => {
    /**
     * Classic budget dance:
     * - Bank = 0
     * - Sell MID-A (45) and MID-B (50); buy premium MID-C (90) + fodder MID-D (5)
     * - Neither single sell affords C; fodder EP is worse than either out so greedy
     *   will not take a stepping-stone 1-transfer; MILP at T=2 finds the pair.
     */
    const current = baseSquad().map((row) => {
      if (row.code === 31) {
        return livePlayer({
          code: 31,
          position: 'MID',
          teamId: 3,
          nowCostTenths: 45,
          ePtsNext: 4.0,
          ePtsByGw: [4, 4, 4, 4, 4],
          webName: 'CheapA',
        })
      }
      if (row.code === 32) {
        return livePlayer({
          code: 32,
          position: 'MID',
          teamId: 4,
          nowCostTenths: 50,
          ePtsNext: 4.0,
          ePtsByGw: [4, 4, 4, 4, 4],
          webName: 'CheapB',
        })
      }
      return row
    })
    expect(isLegalTransferSquad(current)).toBe(true)

    const premium = livePlayer({
      code: 901,
      position: 'MID',
      teamId: 12,
      nowCostTenths: 90,
      ePtsNext: 10.0,
      ePtsByGw: [10, 10, 10, 10, 10],
      webName: 'PremiumC',
    })
    const fodder = livePlayer({
      code: 902,
      position: 'MID',
      teamId: 13,
      nowCostTenths: 5,
      ePtsNext: 1.0,
      ePtsByGw: [1, 1, 1, 1, 1],
      webName: 'FodderD',
    })
    const projected = withExtras(current, [premium, fodder])
    const sell = new Map(current.map((row) => [row.code, row.nowCostTenths]))
    const bankTenths = 0
    const freeTransfers = 2

    const greedy = greedySequentialTransfers({
      current,
      pool: projected,
      bankTenths,
      sellPriceTenthsByCode: sell,
      strategy: 'immediate',
      maxTransfers: 2,
      freeTransfers,
    })
    expect(greedy.transferCount).toBe(0)

    const milp = await solveTransfers({
      projected,
      currentSquad: current,
      bankTenths,
      freeTransfers,
      sellPriceTenthsByCode: sell,
      strategy: 'immediate',
      transferCounts: [0, 1, 2],
      poolOptions: { epKeepTopFraction: 1, positionFloors: { GK: 0, DEF: 0, MID: 0, FWD: 0 } },
    })

    expect(milp.best).not.toBeNull()
    expect(milp.best!.transferCount).toBe(2)
    expect(milp.best!.hits).toBe(0)
    expect(milp.best!.hitCost).toBe(0)
    expect(milp.best!.ins.map((row) => row.code).sort()).toEqual([901, 902])
    expect(milp.best!.outs).toHaveLength(2)
    expect(milp.best!.remainingBankTenths).toBeGreaterThanOrEqual(0)
    expect(milp.best!.objectiveValue).toBeGreaterThan(greedy.objectiveValue)
    expect(isLegalTransferSquad(milp.best!.players)).toBe(true)
  })

  it('takes a hit when EP gain exceeds −4 and skips when it does not', async () => {
    const current = baseSquad()
    const weakMid = current.find((row) => row.code === 31)!
    const sell = new Map(current.map((row) => [row.code, row.nowCostTenths]))

    const hugeUpgrade = livePlayer({
      code: 911,
      position: 'MID',
      teamId: 12,
      nowCostTenths: weakMid.nowCostTenths,
      ePtsNext: weakMid.ePtsNext + 6,
      ePtsByGw: [weakMid.ePtsNext + 6, 1, 1, 1, 1],
      webName: 'HitYes',
    })
    const tinyUpgrade = livePlayer({
      code: 912,
      position: 'MID',
      teamId: 13,
      nowCostTenths: weakMid.nowCostTenths,
      ePtsNext: weakMid.ePtsNext + 1,
      ePtsByGw: [weakMid.ePtsNext + 1, 1, 1, 1, 1],
      webName: 'HitNo',
    })

    const yes = await solveTransfers({
      projected: withExtras(current, [hugeUpgrade]),
      currentSquad: current,
      bankTenths: 0,
      freeTransfers: 0,
      sellPriceTenthsByCode: sell,
      strategy: 'immediate',
      transferCounts: [0, 1],
      poolOptions: { epKeepTopFraction: 1, positionFloors: { GK: 0, DEF: 0, MID: 0, FWD: 0 } },
    })
    expect(yes.best?.transferCount).toBe(1)
    expect(yes.best?.hitCost).toBe(HIT_COST_PER_TRANSFER)
    expect(yes.best!.netEpVsCurrent).toBeGreaterThan(0)

    const no = await solveTransfers({
      projected: withExtras(current, [tinyUpgrade]),
      currentSquad: current,
      bankTenths: 0,
      freeTransfers: 0,
      sellPriceTenthsByCode: sell,
      strategy: 'immediate',
      transferCounts: [0, 1],
      poolOptions: { epKeepTopFraction: 1, positionFloors: { GK: 0, DEF: 0, MID: 0, FWD: 0 } },
    })
    expect(no.best?.transferCount).toBe(0)
    expect(no.best?.hitCost).toBe(0)
  })
})

describe('feasibility guards', () => {
  it('marks club-limit and bank-insufficient T as infeasible', async () => {
    const current = baseSquad()
    const sell = new Map(current.map((row) => [row.code, row.nowCostTenths]))
    const stacked = livePlayer({
      code: 930,
      position: 'MID',
      teamId: 1,
      nowCostTenths: 50,
      ePtsNext: 20,
      ePtsByGw: [20, 20, 20, 20, 20],
      webName: 'StackClub',
    })
    // team1: GK1, DEF11 + MID31 = 3. Buying StackClub MID team1 must not yield 4-of-club.
    const withThree = current.map((row) => {
      if (row.code === 31) {
        return livePlayer({
          code: 31,
          position: 'MID',
          teamId: 1,
          nowCostTenths: 50,
          ePtsNext: 3,
          ePtsByGw: [3, 3, 3, 3, 3],
        })
      }
      return row
    })
    const clubCase = await solveTransfers({
      projected: withExtras(withThree, [stacked]),
      currentSquad: withThree,
      bankTenths: 100,
      freeTransfers: 2,
      sellPriceTenthsByCode: new Map(withThree.map((row) => [row.code, row.nowCostTenths])),
      strategy: 'immediate',
      transferCounts: [1],
      poolOptions: { epKeepTopFraction: 1, positionFloors: { GK: 0, DEF: 0, MID: 0, FWD: 0 } },
    })
    if (clubCase.best) {
      expect(isLegalTransferSquad(clubCase.best.players)).toBe(true)
      const team1 = clubCase.best.players.filter((row) => row.current.teamId === 1)
      expect(team1.length).toBeLessThanOrEqual(3)
    }

    const expensive = livePlayer({
      code: 940,
      position: 'MID',
      teamId: 14,
      nowCostTenths: 120,
      ePtsNext: 15,
      ePtsByGw: [15, 15, 15, 15, 15],
      webName: 'TooDear',
    })
    const bankCase = await solveTransfers({
      projected: withExtras(current, [expensive]),
      currentSquad: current,
      bankTenths: 0,
      freeTransfers: 2,
      sellPriceTenthsByCode: sell,
      strategy: 'immediate',
      transferCounts: [1],
      poolOptions: { epKeepTopFraction: 1, positionFloors: { GK: 0, DEF: 0, MID: 0, FWD: 0 } },
    })
    expect(bankCase.best).toBeNull()
    expect(bankCase.infeasibleCounts).toContain(1)
  })

  it('keeps 0-transfer baseline feasible', async () => {
    const current = baseSquad()
    const sell = new Map(current.map((row) => [row.code, row.nowCostTenths]))
    const result = await solveTransfers({
      projected: current,
      currentSquad: current,
      bankTenths: 5,
      freeTransfers: 1,
      sellPriceTenthsByCode: sell,
      strategy: 'immediate',
      transferCounts: [0],
    })
    expect(result.best?.transferCount).toBe(0)
    expect(result.best?.ins).toEqual([])
    expect(result.best?.outs).toEqual([])
    expect(result.best?.remainingBankTenths).toBe(5)
  })
})

describe('strategy objectives', () => {
  it('immediate vs longTerm can differ on fixture-driven EP', async () => {
    const current = baseSquad().map((row) => {
      if (row.code === 31) {
        return livePlayer({
          code: 31,
          position: 'MID',
          teamId: 3,
          nowCostTenths: 50,
          ePtsNext: 6,
          ePtsByGw: [6, 1, 1, 1, 1],
          ePtsHorizon: 10,
          webName: 'SpikeNow',
        })
      }
      return row
    })
    const sell = new Map(current.map((row) => [row.code, row.nowCostTenths]))
    const longHaul = livePlayer({
      code: 950,
      position: 'MID',
      teamId: 12,
      nowCostTenths: 50,
      ePtsNext: 3,
      ePtsByGw: [3, 5, 5, 5, 5],
      ePtsHorizon: 23,
      webName: 'LongHaul',
    })
    const projected = withExtras(current, [longHaul])
    const opts = {
      projected,
      currentSquad: current,
      bankTenths: 0,
      freeTransfers: 1,
      sellPriceTenthsByCode: sell,
      transferCounts: [0, 1] as const,
      poolOptions: { epKeepTopFraction: 1, positionFloors: { GK: 0, DEF: 0, MID: 0, FWD: 0 } },
    }

    const immediate = await solveTransfers({ ...opts, strategy: 'immediate' })
    const longTerm = await solveTransfers({ ...opts, strategy: 'longTerm' })

    expect(immediate.best?.transferCount).toBe(0)
    expect(longTerm.best?.transferCount).toBe(1)
    expect(longTerm.best?.ins[0]?.code).toBe(950)
    expect(transferObjectiveEp(longHaul, 'longTerm')).toBeGreaterThan(
      transferObjectiveEp(current.find((row) => row.code === 31)!, 'longTerm'),
    )
  })
})

describe('pool builder', () => {
  it('always includes owned codes', () => {
    const current = baseSquad()
    const owned = new Set(current.map((row) => row.code))
    const sell = new Map(current.map((row) => [row.code, row.nowCostTenths]))
    const extras = Array.from({ length: 40 }, (_, i) =>
      livePlayer({
        code: 1000 + i,
        position: i % 2 === 0 ? 'MID' : 'FWD',
        teamId: (i % 10) + 1,
        nowCostTenths: 50,
        ePtsNext: 0.1,
        ePtsByGw: [0.1, 0.1, 0.1, 0.1, 0.1],
      }),
    )
    const pool = buildTransferPool(withExtras(current, extras), owned, sell, {
      epKeepTopFraction: 0.1,
    })
    for (const code of owned) {
      expect(pool.some((row) => row.projection.code === code)).toBe(true)
    }
    expect(pool.every((row: TransferLpCandidate) => row.owned === owned.has(row.projection.code))).toBe(
      true,
    )
  })
})

/** Legal 2/5/5/3 across clubs 1–11, cheap baseline EP. */
function baseSquad(): LiveProjection[] {
  const rows: LiveProjection[] = []
  const add = (
    code: number,
    position: PlayerPosition,
    teamId: number,
    nowCostTenths: number,
    ePtsNext: number,
  ) => {
    rows.push(
      livePlayer({
        code,
        position,
        teamId,
        nowCostTenths,
        ePtsNext,
        ePtsByGw: [ePtsNext, ePtsNext, ePtsNext, ePtsNext, ePtsNext],
      }),
    )
  }
  add(1, 'GK', 1, 45, 3.0)
  add(2, 'GK', 2, 40, 2.5)
  add(11, 'DEF', 1, 45, 3.2)
  add(12, 'DEF', 2, 45, 3.1)
  add(13, 'DEF', 3, 45, 3.0)
  add(14, 'DEF', 4, 40, 2.8)
  add(15, 'DEF', 5, 40, 2.7)
  add(31, 'MID', 3, 50, 3.5)
  add(32, 'MID', 4, 55, 3.4)
  add(33, 'MID', 5, 55, 3.3)
  add(34, 'MID', 6, 50, 3.2)
  add(35, 'MID', 7, 50, 3.1)
  add(41, 'FWD', 8, 55, 3.6)
  add(42, 'FWD', 9, 50, 3.4)
  add(43, 'FWD', 10, 45, 3.0)
  expect(rows).toHaveLength(15)
  expect(isLegalTransferSquad(rows)).toBe(true)
  return rows
}

function withExtras(
  current: readonly LiveProjection[],
  extras: readonly LiveProjection[],
): LiveProjection[] {
  return [...current, ...extras]
}

function livePlayer(partial: {
  code: number
  position: PlayerPosition
  teamId: number
  nowCostTenths: number
  ePtsNext: number
  ePtsByGw: number[]
  ePtsHorizon?: number
  mFitness?: number
  webName?: string
}): LiveProjection {
  const nowCostTenths = partial.nowCostTenths
  const ePtsNext = partial.ePtsNext
  const ePtsByGw = partial.ePtsByGw
  const ePtsHorizon = partial.ePtsHorizon ?? ePtsByGw.reduce((sum, v) => sum + v, 0)
  const current: FplLivePlayer = {
    seasonId: '2026-27',
    id: partial.code,
    code: partial.code,
    firstName: 'T',
    secondName: `P${partial.code}`,
    webName: partial.webName ?? `P${partial.code}`,
    teamId: partial.teamId,
    position: partial.position,
    nowCostTenths,
    totalPoints: 0,
    minutes: 900,
    goalsScored: 0,
    assists: 0,
    form: 0,
    selectedByPercent: 0,
    teamCode: partial.teamId,
    status: 'a',
    news: '',
    chanceOfPlayingThisRound: null,
    chanceOfPlayingNextRound: null,
    epNext: ePtsNext,
    canSelect: true,
    costChangeStart: 0,
    eventPoints: 0,
  }
  return {
    code: partial.code,
    current,
    teamName: `Team ${partial.teamId}`,
    teamShortName: `T${partial.teamId}`,
    prior: null,
    newToPl: false,
    club: 'same',
    promotedClub: false,
    position: partial.position,
    nowCostTenths,
    asOfEvent: 2,
    adjP90: 4,
    adjP90Gw0: 4,
    adjP90Live: 4,
    mSem: 1,
    roleEvidence: null,
    mFitness: partial.mFitness ?? 1,
    expectedMinutesNext: 70,
    ePtsNext,
    ePtsByGw,
    ePtsHorizon,
    horizonGws: ePtsByGw.map((_, i) => i + 1),
    horizonEffective: ePtsByGw.length,
    eppmNext: ePtsNext / (nowCostTenths / 10),
    epNext: ePtsNext,
    confidence: {
      value: 1,
      label: 'HIGH',
      cMinutes: 1,
      cExternal: 1,
      cTeamStability: 1,
      horizonFactor: 1,
      drivers: [],
      currentMinutes: 900,
      priorMinutes: 900,
    },
    auditByGw: [],
    eventRates: null,
    ePtsBNext: 0,
    currentSample: {
      minutes: 900,
      points: 40,
      startsRate: 0.9,
      rawP90: 4,
      eventRates: null,
      eventEp90: null,
      appearanceGws: 10,
      starts: 9,
    },
  }
}
