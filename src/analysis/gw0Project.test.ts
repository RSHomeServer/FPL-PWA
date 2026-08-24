import { describe, expect, it } from 'vitest'
import { PHASE0_CS_FDR, PHASE0_GOALS_FDR } from './fdr'
import type { AnalysisPlayer, LoadedSeason } from './loadSeason'
import type { FplFixture, FplLivePlayer, FplPerformance, FplTeam, PlayerPosition } from '../data/types'
import {
  auditLine,
  confidenceLabel,
  DEFAULT_GW0_OPTIONS,
  fitnessMultiplier,
  joinGw0Pool,
  projectGw0Pool,
  resolveGw0Fitness,
} from './gw0Project'
import { aggregatePriors, buildBaselines } from './backtest'
import { expectedPointsApproachA } from './metrics'

describe('M8 fitness mapping', () => {
  it('follows the modelling-plan chance table and zeros i/u/s', () => {
    expect(fitnessMultiplier('a', 100)).toBe(1)
    expect(fitnessMultiplier('a', 75)).toBeCloseTo(0.85, 10)
    expect(fitnessMultiplier('a', 50)).toBeCloseTo(0.6, 10)
    expect(fitnessMultiplier('a', 25)).toBeCloseTo(0.3, 10)
    expect(fitnessMultiplier('a', 0)).toBe(0)
    expect(fitnessMultiplier('d', null)).toBeCloseTo(0.7, 10)
    expect(fitnessMultiplier('d', 75)).toBeCloseTo(0.85, 10)
    expect(fitnessMultiplier('i', 0)).toBe(0)
    expect(fitnessMultiplier('u', 0)).toBe(0)
    expect(fitnessMultiplier('s', 0)).toBe(0)
    expect(fitnessMultiplier('a', null)).toBe(1)
  })
})

describe('join on code', () => {
  it('matches different season ids on code and treats missing ≥90-minute priors as new-to-PL', () => {
    const prior = priorSeason()
    const current = [
      livePlayer({ id: 44, code: 99, teamId: 1, teamCode: 3 }),
      livePlayer({ id: 50, code: 1001, webName: 'NewSign', teamId: 1, teamCode: 3 }),
    ]
    const joined = joinGw0Pool(current, [team()], prior)
    expect(joined).toHaveLength(2)
    expect(joined[0]?.code).toBe(99)
    expect(joined[0]?.current.id).toBe(44)
    expect(joined[0]?.prior?.playerId).toBe(10)
    expect(joined[0]?.newToPl).toBe(false)
    expect(joined[0]?.club).toBe('same')
    expect(joined[1]?.newToPl).toBe(true)
    expect(joined[1]?.prior).toBeNull()
    expect(joined[1]?.club).toBe('unknown')
  })

  it('marks a team_code change as transferred and unknown continuity as not a transfer', () => {
    const prior = priorSeason()
    const moved = joinGw0Pool(
      [livePlayer({ id: 44, code: 99, teamId: 2, teamCode: 14 })],
      [team({ id: 2, code: 14, name: 'Liverpool', shortName: 'LIV' })],
      prior,
    )
    expect(moved[0]?.club).toBe('transferred')

    const unknownPrior = priorSeason({ teamCode: 0, teamName: '', teamShortName: '' })
    const unknown = joinGw0Pool(
      [livePlayer({ id: 44, code: 99, teamId: 1, teamCode: 0 })],
      [team({ code: 0, name: '', shortName: '' })],
      unknownPrior,
    )
    expect(unknown[0]?.club).toBe('unknown')
  })
})

describe('GW0 golden projection (hand-calculated MID)', () => {
  const baselines = buildBaselines([
    ...aggregatePriors(priorSeason()),
    regular('GK', 4),
    regular('DEF', 4),
    regular('MID', 4, 2 / 3),
    regular('FWD', 4),
  ])

  it('reproduces adj_p90=3.9, E_min=60, E_pts=2.6 at FDR 2', () => {
    const joined = joinGw0Pool([livePlayer({ id: 44, code: 99 })], [team()], priorSeason())
    const projected = projectGw0Pool(joined, [fixture({ teamHDifficulty: 2 })], baselines)
    const row = projected[0]
    expect(row?.adjP90).toBeCloseTo(3.9, 10)
    expect(row?.expectedMinutesGw1).toBeCloseTo(60, 10)
    expect(row?.ePtsGw1).toBeCloseTo(2.6, 10)
    const gw1 = row?.auditByGw[0]
    expect(gw1).toBeDefined()
    expect(reconstruct(gw1!)).toBeCloseTo(row!.ePtsGw1, 10)
    expect(gw1!.c).toBeCloseTo(0.25, 10)
    expect(gw1!.rawP90).toBeCloseTo(3.6, 10)
    expect(gw1!.kTrans).toBe(0.75)
    expect(gw1!.transferred).toBe(false)
  })

  it('applies k_trans=0.75 only when clubStatus is transferred', () => {
    const joined = joinGw0Pool(
      [livePlayer({ id: 44, code: 99, teamId: 2, teamCode: 14 })],
      [team({ id: 2, code: 14, name: 'Liverpool', shortName: 'LIV' })],
      priorSeason(),
    )
    const projected = projectGw0Pool(joined, [fixture({ teamH: 2, teamA: 1, teamHDifficulty: 2 })], baselines)
    expect(projected[0]?.club).toBe('transferred')
    expect(projected[0]?.adjP90).toBeCloseTo(3.9 * 0.75, 10)
    expect(projected[0]?.ePtsGw1).toBeCloseTo(1.95, 10)
  })

  it('keeps k_trans=1 when club continuity is unknown', () => {
    const prior = priorSeason({ teamCode: 0, teamName: '', teamShortName: '' })
    const joined = joinGw0Pool(
      [livePlayer({ id: 44, code: 99, teamCode: 0 })],
      [team({ code: 0, name: '', shortName: '' })],
      prior,
    )
    const projected = projectGw0Pool(joined, [fixture({ teamHDifficulty: 2 })], baselines)
    expect(projected[0]?.club).toBe('unknown')
    expect(projected[0]?.adjP90).toBeCloseTo(3.9, 10)
  })

  it('uses positional baseline only for new-to-PL (c=0)', () => {
    const joined = joinGw0Pool([livePlayer({ id: 9, code: 777, webName: 'New' })], [team()], priorSeason())
    const projected = projectGw0Pool(joined, [fixture({ teamHDifficulty: 2 })], baselines)
    expect(projected[0]?.newToPl).toBe(true)
    expect(projected[0]?.auditByGw[0]?.c).toBe(0)
    expect(projected[0]?.adjP90).toBeCloseTo(4, 10)
    expect(projected[0]?.confidence.label).toBe('LOW')
  })

  it('does not apply k_trans to a new-to-PL code even if team_code changed', () => {
    const prior = priorSeason({
      minutes: 0,
      totalPoints: 0,
      teamCode: 1,
      teamName: 'Leeds',
      teamShortName: 'LEE',
    })
    prior.performances = []
    const joined = joinGw0Pool(
      [livePlayer({ id: 8, code: 99, teamId: 1, teamCode: 3 })],
      [team()],
      prior,
    )
    expect(joined[0]?.newToPl).toBe(true)
    expect(joined[0]?.club).toBe('transferred')
    const projected = projectGw0Pool(joined, [fixture({ teamHDifficulty: 2 })], baselines)
    expect(projected[0]?.adjP90).toBeCloseTo(4, 10)
    expect(projected[0]?.auditByGw[0]?.transferred).toBe(false)
  })

  it('applies frozen FDR 1 to a MID (attack factor 1.255)', () => {
    expect(PHASE0_GOALS_FDR[1].factor).toBeCloseTo(1.255, 10)
    expect(PHASE0_CS_FDR[2].factor).toBe(1)
    const joined = joinGw0Pool([livePlayer({ id: 44, code: 99 })], [team()], priorSeason())
    const projected = projectGw0Pool(joined, [fixture({ teamHDifficulty: 1 })], baselines)
    expect(projected[0]?.ePtsGw1).toBeCloseTo(2.6 * 1.255, 10)
    expect(projected[0]?.auditByGw[0]?.fixtures[0]?.attackFactor).toBeCloseTo(1.255, 10)
    expect(projected[0]?.auditByGw[0]?.fixtures[0]?.opponentTeamId).toBe(2)
    expect(projected[0]?.auditByGw[0]?.fixtures[0]?.home).toBe(true)
  })

  it('blends DEF FDR with the Phase 0 0.5 / 0.5 heuristic', () => {
    const defPrior = priorSeason({ position: 'DEF' })
    const joined = joinGw0Pool(
      [livePlayer({ id: 44, code: 99, position: 'DEF' })],
      [team()],
      defPrior,
    )
    const defBaselines = buildBaselines([
      ...aggregatePriors(defPrior),
      regular('GK', 4),
      regular('DEF', 4, 2 / 3),
      regular('MID', 4),
      regular('FWD', 4),
    ])
    const projected = projectGw0Pool(joined, [fixture({ teamHDifficulty: 1 })], defBaselines)
    const blended = 0.5 * PHASE0_GOALS_FDR[1].factor + 0.5 * PHASE0_CS_FDR[1].factor
    expect(projected[0]?.auditByGw[0]?.blendedFactor).toBeCloseTo(blended, 10)
    expect(projected[0]?.ePtsGw1).toBeCloseTo((3.9 / 90) * 60 * blended, 10)
  })

  it('zeros EP when m_fitness=0', () => {
    const joined = joinGw0Pool(
      [livePlayer({ id: 44, code: 99, status: 'i', chanceOfPlayingNextRound: 0 })],
      [team()],
      priorSeason(),
    )
    const projected = projectGw0Pool(joined, [fixture({ teamHDifficulty: 2 })], baselines)
    expect(projected[0]?.mFitness).toBe(0)
    expect(projected[0]?.ePtsGw1).toBe(0)
    expect(projected[0]?.expectedMinutesGw1).toBe(0)
    expect(projected[0]?.confidence.label).toBe('LOW')
  })

  it('does not use live leftover minutes, points, or ep_next in the prior', () => {
    const joined = joinGw0Pool(
      [
        livePlayer({
          id: 44,
          code: 99,
          minutes: 3330,
          totalPoints: 162,
          epNext: 9.9,
          form: 8.4,
        }),
      ],
      [team()],
      priorSeason(),
    )
    const projected = projectGw0Pool(joined, [fixture({ teamHDifficulty: 2 })], baselines)
    expect(projected[0]?.prior?.minutes).toBe(225)
    expect(projected[0]?.prior?.points).toBe(9)
    expect(projected[0]?.adjP90).toBeCloseTo(3.9, 10)
    expect(projected[0]?.ePtsGw1).toBeCloseTo(2.6, 10)
    expect(projected[0]?.epNext).toBe(9.9)
    const again = projectGw0Pool(
      joinGw0Pool([livePlayer({ id: 44, code: 99, epNext: 0 })], [team()], priorSeason()),
      [fixture({ teamHDifficulty: 2 })],
      baselines,
    )
    expect(again[0]?.ePtsGw1).toBeCloseTo(projected[0]!.ePtsGw1, 10)
  })

  it('projects GW1–6 independently from the same rate prior', () => {
    const joined = joinGw0Pool([livePlayer({ id: 44, code: 99 })], [team()], priorSeason())
    const fixtures = [
      fixture({ id: 1, event: 1, teamHDifficulty: 2 }),
      fixture({ id: 2, event: 2, teamHDifficulty: 1 }),
      fixture({ id: 3, event: 3, teamHDifficulty: 5 }),
      fixture({ id: 4, event: 4, teamHDifficulty: 2 }),
      fixture({ id: 5, event: 5, teamHDifficulty: 2 }),
      fixture({ id: 6, event: 6, teamHDifficulty: 2 }),
    ]
    const projected = projectGw0Pool(joined, fixtures, baselines)
    expect(projected[0]?.ePtsByGw).toHaveLength(6)
    expect(projected[0]?.ePtsByGw[0]).toBeCloseTo(2.6, 10)
    expect(projected[0]?.ePtsByGw[1]).toBeCloseTo(2.6 * 1.255, 10)
    expect(projected[0]?.ePtsGw16).toBeCloseTo(
      projected[0]!.ePtsByGw.reduce((sum, value) => sum + value, 0),
      10,
    )
    expect(auditLine(projected[0]!.auditByGw[0]!)).toContain('raw_p90=3.60')
  })
})

describe('M13 labels', () => {
  it('labels LOW for thin samples, new-to-PL, and doubtful fitness', () => {
    expect(confidenceLabel({ minutes: 200, newToPl: false, mSem: 1, mFitness: 1, club: 'same' })).toBe('LOW')
    expect(confidenceLabel({ minutes: 900, newToPl: true, mSem: 1, mFitness: 1, club: 'unknown' })).toBe('LOW')
    expect(confidenceLabel({ minutes: 900, newToPl: false, mSem: 1, mFitness: 0.7, club: 'same' })).toBe('LOW')
    expect(confidenceLabel({ minutes: 900, newToPl: false, mSem: 1, mFitness: 1, club: 'same' })).toBe('HIGH')
    expect(confidenceLabel({ minutes: 900, newToPl: false, mSem: 1, mFitness: 1, club: 'transferred' })).toBe(
      'MEDIUM',
    )
  })
})

describe('per-player m_sem', () => {
  const baselines = buildBaselines([
    ...aggregatePriors(priorSeason()),
    regular('GK', 4),
    regular('DEF', 4),
    regular('MID', 4, 2 / 3),
    regular('FWD', 4),
  ])

  it('keeps unreviewed players at m_sem = 1 (Phase 1 minutes)', () => {
    const joined = joinGw0Pool([livePlayer({ id: 44, code: 99 })], [team()], priorSeason())
    const projected = projectGw0Pool(joined, [fixture({ teamHDifficulty: 2 })], baselines)
    expect(projected[0]?.mSem).toBe(1)
    expect(projected[0]?.roleEvidence).toBeNull()
    expect(projected[0]?.expectedMinutesGw1).toBeCloseTo(60, 10)
    expect(projected[0]?.auditByGw[0]?.semSummary).toContain('unreviewed')
    expect(auditLine(projected[0]!.auditByGw[0]!)).toContain('m_sem=1.00')
  })

  it('reduces E_minutes when reviewed startingLikelihood is LOW', () => {
    const joined = joinGw0Pool([livePlayer({ id: 44, code: 99 })], [team()], priorSeason())
    const evidence = {
      startingLikelihood: 'LOW' as const,
      roleContinuity: 'HIGH' as const,
      competitionForPlace: 'HIGH' as const,
      fitnessConcern: 'NONE' as const,
      roleChange: 'NONE' as const,
      evidenceNotes: 'Rotation risk; not a locked starter.',
      sources: ['https://example.test/preview'],
      confidence: 'MEDIUM' as const,
    }
    const projected = projectGw0Pool(joined, [fixture({ teamHDifficulty: 2 })], baselines, {
      ...DEFAULT_GW0_OPTIONS,
      roleEvidenceByCode: new Map([[99, evidence]]),
    })
    expect(projected[0]?.mSem).toBeCloseTo(0.55, 10)
    expect(projected[0]?.expectedMinutesGw1).toBeCloseTo(60 * 0.55, 10)
    expect(projected[0]?.ePtsGw1).toBeCloseTo(2.6 * 0.55, 10)
    expect(auditLine(projected[0]!.auditByGw[0]!)).toContain('start=LOW')
    expect(auditLine(projected[0]!.auditByGw[0]!)).toContain('change=NONE')
  })

  it('does not let fitnessConcern override published chance fields', () => {
    const joined = joinGw0Pool(
      [livePlayer({ id: 44, code: 99, chanceOfPlayingNextRound: 100 })],
      [team()],
      priorSeason(),
    )
    const evidence = {
      startingLikelihood: 'HIGH' as const,
      roleContinuity: 'HIGH' as const,
      competitionForPlace: 'LOW' as const,
      fitnessConcern: 'HIGH' as const,
      roleChange: 'NONE' as const,
      evidenceNotes: 'API chance is 100; concern is audit only.',
      sources: ['https://fantasy.premierleague.com/api/bootstrap-static/'],
      confidence: 'HIGH' as const,
    }
    expect(resolveGw0Fitness(joined[0]!, evidence)).toBe(1)
    expect(resolveGw0Fitness(joined[0]!, null)).toBe(1)
  })
})

function reconstruct(audit: { adjP90: number; eMinutes: number; blendedFactor: number; ePts: number }): number {
  return expectedPointsApproachA(audit.adjP90, audit.eMinutes, audit.blendedFactor)
}

function livePlayer(
  partial: Partial<FplLivePlayer> & Pick<FplLivePlayer, 'id' | 'code'>,
): FplLivePlayer {
  return {
    seasonId: '2026-27',
    firstName: 'Test',
    secondName: 'Player',
    webName: 'Test',
    teamId: 1,
    position: 'MID',
    nowCostTenths: 70,
    totalPoints: 0,
    minutes: 0,
    goalsScored: 0,
    assists: 0,
    form: 0,
    selectedByPercent: 0,
    teamCode: 3,
    status: 'a',
    news: '',
    chanceOfPlayingThisRound: null,
    chanceOfPlayingNextRound: null,
    epNext: 2.1,
    canSelect: true,
    costChangeStart: 0,
    ...partial,
  }
}

function team(partial: Partial<FplTeam> = {}): FplTeam {
  return {
    seasonId: '2026-27',
    id: 1,
    code: 3,
    name: 'Arsenal',
    shortName: 'ARS',
    strength: 0,
    strengthAttackHome: 0,
    strengthAttackAway: 0,
    strengthDefenceHome: 0,
    strengthDefenceAway: 0,
    ...partial,
  }
}

function fixture(partial: Partial<FplFixture> = {}): FplFixture {
  return {
    seasonId: '2026-27',
    id: 1,
    event: 1,
    kickoffTime: '',
    teamH: 1,
    teamA: 2,
    teamHScore: null,
    teamAScore: null,
    finished: false,
    teamHDifficulty: 2,
    teamADifficulty: 3,
    ...partial,
  }
}

function priorSeason(playerPartial: Partial<AnalysisPlayer> = {}): LoadedSeason {
  const player = analysisPlayer({ id: 10, code: 99, position: 'MID', minutes: 225, totalPoints: 9, ...playerPartial })
  return {
    seasonId: '2025-26',
    players: [player],
    teams: [
      {
        seasonId: '2025-26',
        id: 1,
        code: player.teamCode,
        name: player.teamName || 'Arsenal',
        shortName: player.teamShortName || 'ARS',
        strength: 0,
        strengthAttackHome: 0,
        strengthAttackAway: 0,
        strengthDefenceHome: 0,
        strengthDefenceAway: 0,
      },
    ],
    fixtures: [],
    performances: [
      perf({ playerId: 10, round: 1, minutes: 90, totalPoints: 6, goalsScored: 1, starts: 1 }),
      perf({ playerId: 10, round: 2, minutes: 90, totalPoints: 2, starts: 1 }),
      perf({ playerId: 10, round: 3, minutes: 45, totalPoints: 1, starts: 0 }),
    ],
    hasMergedGw: true,
    startsInferred: false,
  }
}

function analysisPlayer(
  partial: Partial<AnalysisPlayer> & Pick<AnalysisPlayer, 'id' | 'code'>,
): AnalysisPlayer {
  return {
    seasonId: '2025-26',
    firstName: 'Test',
    secondName: 'Player',
    webName: 'Test',
    teamId: 1,
    position: 'MID',
    nowCostTenths: 50,
    totalPoints: 0,
    minutes: 0,
    goalsScored: 0,
    assists: 0,
    form: 0,
    selectedByPercent: 0,
    costChangeStart: 0,
    teamCode: 3,
    teamName: 'Arsenal',
    teamShortName: 'ARS',
    status: 'a',
    ...partial,
  }
}

function perf(partial: Partial<FplPerformance> & Pick<FplPerformance, 'playerId' | 'round'>): FplPerformance {
  return {
    seasonId: '2025-26',
    fixture: partial.round,
    minutes: 0,
    totalPoints: 0,
    goalsScored: 0,
    assists: 0,
    cleanSheets: 0,
    saves: 0,
    bonus: 0,
    bps: 0,
    goalsConceded: 0,
    ownGoals: 0,
    penaltiesMissed: 0,
    penaltiesSaved: 0,
    yellowCards: 0,
    redCards: 0,
    starts: 0,
    expectedGoals: 0,
    expectedAssists: 0,
    expectedGoalInvolvements: 0,
    expectedPoints: null,
    defensiveContribution: null,
    gwPosition: 'MID',
    wasHome: true,
    opponentTeamId: 2,
    valueTenths: 50,
    kickoffTime: '',
    teamName: 'Arsenal',
    ...partial,
  }
}

function regular(
  position: PlayerPosition,
  p90: number,
  startRate = 1,
): ReturnType<typeof aggregatePriors>[number] {
  return {
    code: position.charCodeAt(0),
    playerId: position.charCodeAt(0),
    position,
    teamCode: 1,
    teamName: 'Pool',
    teamShortName: 'POL',
    minutes: 900,
    points: p90 * 10,
    startsRate: startRate,
    rawP90: p90,
    eventRates: null,
    eventEp90: p90,
  }
}
