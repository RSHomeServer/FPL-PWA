import { describe, expect, it } from 'vitest'
import type { FplLivePlayer, PlayerPosition } from '../data/types'
import type { Gw0Projection } from './gw0Project'
import { suggestCaptain, suggestCaptainForSquad } from './gw0Captain'
import { solveBothObjectives, solveSquadObjective } from './gw0Solver'
import {
  DEFAULT_FORMATION,
  FORMATIONS,
  assembleSquad,
  buildSquadLp,
  diagnosePins,
  fixtureCliff,
  formatPinInfeasibility,
  isLegalSquad,
  isSquadInfeasibleError,
  lpVarName,
  orderBench,
  overlapDiffs,
  pickBestXi,
  squadViolations,
  type LpCandidate,
} from './gw0Squad'
import { positionPool } from './metrics'

describe('squad constraints', () => {
  it('rejects the wrong size, overspend, 4-of-club, wrong positions, and m_fitness=0', () => {
    const legal = legalFifteen()
    expect(isLegalSquad(legal)).toBe(true)
    expect(squadViolations(legal)).toEqual([])

    expect(squadViolations(legal.slice(0, 14)).some((row) => row.code === 'size')).toBe(true)

    const rich = legal.map((player, index) => (index < 8 ? withPrice(player, 150) : player))
    expect(squadViolations(rich).some((row) => row.code === 'budget')).toBe(true)

    const stacked = legal.map((player, index) => (index < 4 ? withTeam(player, 1, 'ARS') : player))
    expect(squadViolations(stacked).some((row) => row.code === 'club')).toBe(true)

    const extraMid = [...legal.slice(0, 14), player({ code: 99, position: 'MID', teamId: 8 })]
    expect(squadViolations(extraMid).some((row) => row.code === 'position')).toBe(true)

    const unfit = legal.map((row, index) => (index === 0 ? { ...row, mFitness: 0 } : row))
    expect(squadViolations(unfit).some((row) => row.code === 'fitness')).toBe(true)
  })

  it('maps AM into the MID quota via positionPool', () => {
    const squad = legalFifteen().map((row, index) =>
      positionPool(row.position) === 'MID' && index === 7 ? { ...row, position: 'AM' as const } : row,
    )
    expect(isLegalSquad(squad)).toBe(true)
  })
})

describe('best XI and bench', () => {
  it('locks 3-4-3 (1-3-4-3) inside a legal 15 and keeps the GK last on the bench', () => {
    const squad = legalFifteen()
    const xi = pickBestXi(squad, '3-4-3', 'shortTerm')
    expect(xi).toHaveLength(11)
    expect(countPos(xi)).toEqual(FORMATIONS['3-4-3'])
    const bench = orderBench(squad, xi)
    expect(bench).toHaveLength(4)
    expect(positionPool(bench[0]?.position ?? 'UNK')).not.toBe('GK')
    expect(positionPool(bench[bench.length - 1]?.position ?? 'UNK')).toBe('GK')
    const gkOnBench = bench.filter((row) => positionPool(row.position) === 'GK')
    expect(gkOnBench).toHaveLength(1)
    expect(gkOnBench[0]?.ePtsGw1 ?? 0).toBeLessThanOrEqual(
      Math.max(...squad.filter((row) => positionPool(row.position) === 'GK').map((row) => row.ePtsGw1)),
    )
  })

  it('enumerates 3-5-2 and 4-4-2 on the same 15', () => {
    const squad = legalFifteen()
    expect(countPos(pickBestXi(squad, '3-5-2', 'shortTerm'))).toEqual(FORMATIONS['3-5-2'])
    expect(countPos(pickBestXi(squad, '4-4-2', 'longTerm'))).toEqual(FORMATIONS['4-4-2'])
  })
})

describe('fixture cliff and overlap', () => {
  it('flags FDR 4–5 clustered in GW4–6', () => {
    const quiet = player({ code: 1, position: 'MID' })
    const cliffed = player({
      code: 2,
      position: 'MID',
      audit: [
        { gw: 1, fdr: 2 },
        { gw: 4, fdr: 5 },
        { gw: 5, fdr: 4 },
        { gw: 6, fdr: 2 },
      ],
    })
    expect(fixtureCliff(quiet).flagged).toBe(false)
    expect(fixtureCliff(cliffed).flagged).toBe(true)
    expect(fixtureCliff(cliffed).hardGw46).toBe(2)
  })

  it('reports the 15-player overlap and EP trade-off', () => {
    const shortTerm = legalFifteen()
    const longTerm = shortTerm.map((row, index) =>
      index === 14 ? player({ code: 900, position: 'FWD', teamId: 9, ePtsGw1: 1, ePtsGw16: 40 }) : row,
    )
    const overlap = overlapDiffs(shortTerm, longTerm)
    expect(overlap.shared).toHaveLength(14)
    expect(overlap.onlyShort).toHaveLength(1)
    expect(overlap.onlyLong).toHaveLength(1)
    expect(overlap.onlyLong[0]?.code).toBe(900)
  })
})

describe('HiGHS 15-man solve', () => {
  it('produces two legal 15s from a tiny pool, drops m_fitness=0, and respects 3-per-club / budget', async () => {
    const candidates = tinyPool()
    expect(candidates.some((row) => row.projection.mFitness === 0)).toBe(false)
    expect(candidates.some((row) => row.projection.code === 999)).toBe(false)

    const { shortTerm, longTerm } = await solveBothObjectives(candidates, DEFAULT_FORMATION)
    expect(isLegalSquad(shortTerm.players)).toBe(true)
    expect(isLegalSquad(longTerm.players)).toBe(true)
    expect(shortTerm.xi).toHaveLength(11)
    expect(longTerm.bench).toHaveLength(4)
    expect(countPos(shortTerm.xi)).toEqual(FORMATIONS['3-4-3'])

    const shortCodes = codes(shortTerm.players)
    const longCodes = codes(longTerm.players)
    expect(shortCodes).toContain(501)
    expect(shortCodes).not.toContain(502)
    expect(longCodes).toContain(502)
    expect(longCodes).not.toContain(501)

    for (const squad of [shortTerm.players, longTerm.players]) {
      expect(squad.every((row) => row.mFitness > 0)).toBe(true)
      const ars = squad.filter((row) => row.current.teamId === 1).length
      expect(ars).toBeLessThanOrEqual(3)
      expect(squad.reduce((sum, row) => sum + row.nowCostTenths, 0)).toBeLessThanOrEqual(1000)
    }
  }, 30_000)

  it('writes binary variables and official constraints into the LP text', () => {
    const lp = buildSquadLp(tinyPool(), 'shortTerm')
    expect(lp).toContain('Maximize')
    expect(lp).toContain('n15:')
    expect(lp).toContain('budget:')
    expect(lp).toContain('pos_GK:')
    expect(lp).toContain('pos_DEF:')
    expect(lp).toContain('Binaries')
    expect(lp).toContain(lpVarName(501))
    expect(lp).not.toContain(lpVarName(999))
  })
})

describe('lock / exclude pins', () => {
  it('writes lock x_p = 1 and exclude x_p = 0 into the LP text', () => {
    const lp = buildSquadLp(tinyPool(), 'shortTerm', { lockedCodes: [501], excludedCodes: [502] })
    expect(lp).toContain(`lock_501: ${lpVarName(501)} = 1`)
    expect(lp).toContain(`excl_502: ${lpVarName(502)} = 0`)
  })

  it('lock forces inclusion in the short-term 15', async () => {
    const squad = await solveSquadObjective(tinyPool(), 'shortTerm', DEFAULT_FORMATION, {
      lockedCodes: [502],
    })
    expect(codes(squad.players)).toContain(502)
    expect(isLegalSquad(squad.players)).toBe(true)
  }, 30_000)

  it('exclude forces omission from the short-term 15', async () => {
    const squad = await solveSquadObjective(tinyPool(), 'shortTerm', DEFAULT_FORMATION, {
      excludedCodes: [501],
    })
    expect(codes(squad.players)).not.toContain(501)
    expect(isLegalSquad(squad.players)).toBe(true)
  }, 30_000)

  it('4 locked from one club is infeasible with a readable error and does not drop locks', async () => {
    const pins = { lockedCodes: [31, 32, 33, 34] }
    const diagnosed = diagnosePins(tinyPool(), pins)
    expect(diagnosed.some((row) => row.code === 'club')).toBe(true)
    expect(formatPinInfeasibility(diagnosed)).toMatch(/T1 has 4 locked players \(max 3\)/)
    expect(formatPinInfeasibility(diagnosed)).toMatch(/P31|P32|P33|P34/)
    expect(formatPinInfeasibility(diagnosed)).toMatch(/Locks were not dropped/)

    try {
      await solveSquadObjective(tinyPool(), 'shortTerm', DEFAULT_FORMATION, pins)
      throw new Error('expected infeasible solve')
    } catch (cause) {
      expect(isSquadInfeasibleError(cause)).toBe(true)
      if (!isSquadInfeasibleError(cause)) return
      expect(cause.violations.some((row) => row.code === 'club')).toBe(true)
      expect(cause.message).toMatch(/max 3/)
      expect(cause.message).not.toMatch(/dropped the lock/i)
    }
  }, 30_000)
})

describe('captain suggestion', () => {
  it('captain is max E GW1 in the XI and vice is a different XI player', () => {
    const ordered = assembleSquad(legalFifteen(), 'shortTerm', '3-4-3')
    const suggestion = suggestCaptainForSquad(ordered)
    const xiMax = Math.max(...ordered.xi.map((row) => row.ePtsGw1))
    expect(suggestion.captain.ePtsGw1).toBe(xiMax)
    expect(ordered.xi.some((row) => row.code === suggestion.captain.code)).toBe(true)
    expect(suggestion.vice.code).not.toBe(suggestion.captain.code)
    expect(ordered.xi.some((row) => row.code === suggestion.vice.code)).toBe(true)
    expect(suggestion.captainDoubledGw1).toBeCloseTo(2 * suggestion.captain.ePtsGw1)
    expect(suggestion.squadGw1WithCaptain).toBeCloseTo(
      ordered.players.reduce((sum, row) => sum + row.ePtsGw1, 0) + suggestion.captain.ePtsGw1,
    )
  })

  it('notes a toss-up when the top two XI EPs are within 0.2', () => {
    const captain = player({ code: 1, position: 'MID', ePtsGw1: 5.0 })
    const vice = player({ code: 2, position: 'MID', ePtsGw1: 4.85 })
    const suggestion = suggestCaptain([captain, vice], [captain, vice])
    expect(suggestion.captain.code).toBe(1)
    expect(suggestion.vice.code).toBe(2)
    expect(suggestion.tossUp).toBe(true)
    expect(suggestion.tossUpDetail).toMatch(/0\.2/)
  })
})

function countPos(rows: readonly Gw0Projection[]): Record<'GK' | 'DEF' | 'MID' | 'FWD', number> {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const row of rows) counts[positionPool(row.position)] += 1
  return counts
}

function codes(rows: readonly Gw0Projection[]): number[] {
  return rows.map((row) => row.code)
}

function legalFifteen(): Gw0Projection[] {
  const rows: Gw0Projection[] = []
  let code = 1
  const push = (position: PlayerPosition, teamId: number, ePtsGw1: number) => {
    rows.push(player({ code: code++, position, teamId, ePtsGw1, ePtsGw16: ePtsGw1 * 5, nowCostTenths: 45 }))
  }
  push('GK', 1, 4.0)
  push('GK', 2, 3.5)
  for (let i = 0; i < 5; i += 1) push('DEF', 3 + (i % 4), 3.2 + i * 0.1)
  for (let i = 0; i < 5; i += 1) push('MID', 7 + (i % 4), 4.0 + i * 0.15)
  push('FWD', 11, 4.8)
  push('FWD', 12, 4.5)
  push('FWD', 13, 4.1)
  return rows
}

function tinyPool(): LpCandidate[] {
  const rows: LpCandidate[] = []
  const add = (spec: Parameters<typeof player>[0]) => {
    const projection = player(spec)
    rows.push({ projection, varName: lpVarName(projection.code) })
  }

  add({ code: 11, position: 'GK', teamId: 8, nowCostTenths: 45, ePtsGw1: 4.2, ePtsGw16: 22 })
  add({ code: 12, position: 'GK', teamId: 2, nowCostTenths: 45, ePtsGw1: 4.0, ePtsGw16: 24 })
  add({ code: 13, position: 'GK', teamId: 3, nowCostTenths: 50, ePtsGw1: 3.0, ePtsGw16: 16 })

  for (let i = 0; i < 6; i += 1) {
    add({
      code: 20 + i,
      position: 'DEF',
      teamId: 2 + (i % 5),
      nowCostTenths: 45,
      ePtsGw1: 3.4 + i * 0.05,
      ePtsGw16: 18 + i,
    })
  }

  add({ code: 31, position: 'MID', teamId: 1, nowCostTenths: 50, ePtsGw1: 5.6, ePtsGw16: 28 })
  add({ code: 32, position: 'MID', teamId: 1, nowCostTenths: 50, ePtsGw1: 5.5, ePtsGw16: 27 })
  add({ code: 33, position: 'MID', teamId: 1, nowCostTenths: 50, ePtsGw1: 5.4, ePtsGw16: 26 })
  add({ code: 34, position: 'MID', teamId: 1, nowCostTenths: 50, ePtsGw1: 5.3, ePtsGw16: 25 })
  add({ code: 35, position: 'MID', teamId: 4, nowCostTenths: 50, ePtsGw1: 5.0, ePtsGw16: 30 })
  add({ code: 36, position: 'MID', teamId: 5, nowCostTenths: 55, ePtsGw1: 4.8, ePtsGw16: 29 })
  add({ code: 37, position: 'MID', teamId: 6, nowCostTenths: 55, ePtsGw1: 4.6, ePtsGw16: 28 })

  add({ code: 41, position: 'FWD', teamId: 7, nowCostTenths: 50, ePtsGw1: 4.6, ePtsGw16: 24 })
  add({ code: 42, position: 'FWD', teamId: 8, nowCostTenths: 50, ePtsGw1: 4.5, ePtsGw16: 23 })
  add({ code: 43, position: 'FWD', teamId: 9, nowCostTenths: 50, ePtsGw1: 4.0, ePtsGw16: 20 })
  add({ code: 501, position: 'FWD', teamId: 10, nowCostTenths: 90, ePtsGw1: 9.0, ePtsGw16: 18 })
  add({ code: 502, position: 'FWD', teamId: 11, nowCostTenths: 90, ePtsGw1: 3.4, ePtsGw16: 42 })
  add({
    code: 999,
    position: 'FWD',
    teamId: 12,
    nowCostTenths: 40,
    ePtsGw1: 50,
    ePtsGw16: 300,
    mFitness: 0,
  })

  return rows.filter((row) => row.projection.mFitness > 0)
}

function withPrice(row: Gw0Projection, nowCostTenths: number): Gw0Projection {
  return { ...row, nowCostTenths, current: { ...row.current, nowCostTenths } }
}

function withTeam(row: Gw0Projection, teamId: number, shortName: string): Gw0Projection {
  return {
    ...row,
    teamShortName: shortName,
    current: { ...row.current, teamId },
  }
}

function player(partial: {
  code: number
  position: PlayerPosition
  teamId?: number
  nowCostTenths?: number
  ePtsGw1?: number
  ePtsGw16?: number
  mFitness?: number
  audit?: Array<{ gw: number; fdr: 1 | 2 | 3 | 4 | 5 }>
}): Gw0Projection {
  const teamId = partial.teamId ?? 1
  const ePtsGw1 = partial.ePtsGw1 ?? 3
  const ePtsGw16 = partial.ePtsGw16 ?? ePtsGw1 * 5
  const nowCostTenths = partial.nowCostTenths ?? 50
  const current: FplLivePlayer = {
    seasonId: '2026-27',
    id: partial.code,
    code: partial.code,
    firstName: 'T',
    secondName: `P${partial.code}`,
    webName: `P${partial.code}`,
    teamId,
    position: partial.position,
    nowCostTenths,
    totalPoints: 0,
    minutes: 0,
    goalsScored: 0,
    assists: 0,
    form: 0,
    selectedByPercent: 0,
    teamCode: teamId,
    status: 'a',
    news: '',
    chanceOfPlayingThisRound: null,
    chanceOfPlayingNextRound: null,
    epNext: 2,
    canSelect: true,
  }
  const auditByGw = (partial.audit ?? [{ gw: 1, fdr: 2 as const }]).map((row) => ({
    gw: row.gw,
    priorMinutes: 900,
    rawP90: 4,
    c: 1,
    baselineP90: 4,
    kTrans: 0.75,
    transferred: false,
    adjP90: 4,
    startsRate: 0.8,
    shrunkStarts: 0.8,
    mSem: 1,
    semSummary: 'start=— change=— unreviewed',
    mFitness: partial.mFitness ?? 1,
    eMinutes: 70,
    fixtures: [],
    fdrBuckets: [row.fdr],
    blendedFactor: 1,
    appearancePart: 0,
    ratePart: ePtsGw1,
    ePts: row.gw === 1 ? ePtsGw1 : ePtsGw16 / 6,
  }))
  return {
    code: partial.code,
    current,
    teamName: `Team ${teamId}`,
    teamShortName: `T${teamId}`,
    prior: null,
    newToPl: false,
    club: 'same',
    promotedClub: false,
    position: partial.position,
    nowCostTenths,
    adjP90: 4,
    mSem: 1,
    roleEvidence: null,
    mFitness: partial.mFitness ?? 1,
    expectedMinutesGw1: 70,
    ePtsByGw: [ePtsGw1],
    ePtsGw1,
    ePtsGw16,
    eppmGw1: ePtsGw1 / (nowCostTenths / 10),
    epNext: 2,
    confidence: {
      value: 1,
      label: 'HIGH',
      cMinutes: 1,
      cExternal: 1,
      cTeamStability: 1,
      horizonFactor: 1,
      drivers: [],
    },
    auditByGw,
    eventRates: null,
    ePtsBGw1: 0,
  }
}
