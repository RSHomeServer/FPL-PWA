import { describe, expect, it } from 'vitest'
import {
  aggregatePriors,
  buildBaselines,
  DEFAULT_PROJECTION,
  joinTransition,
  projectJoined,
  scorePredictions,
} from './backtest'
import type { AnalysisPlayer, LoadedSeason } from './loadSeason'
import type { FplPerformance, PlayerPosition } from '../data/types'

describe('GW0 protocol on a hand-calculated pair', () => {
  it('joins on code, uses S-1 rates only, and hits 2.6 predicted GW1 points', () => {
    const prior = season('2023-24', {
      player: player({ id: 10, code: 99, position: 'MID', minutes: 225, totalPoints: 9, teamId: 1 }),
      performances: [
        perf({ playerId: 10, round: 1, minutes: 90, totalPoints: 6, goalsScored: 1, starts: 1 }),
        perf({ playerId: 10, round: 2, minutes: 90, totalPoints: 2, starts: 1 }),
        perf({ playerId: 10, round: 3, minutes: 45, totalPoints: 1, starts: 0 }),
      ],
    })
    const next = season('2024-25', {
      player: player({
        id: 44,
        code: 99,
        position: 'MID',
        minutes: 90,
        totalPoints: 6,
        teamId: 1,
        seasonId: '2024-25',
      }),
      performances: [perf({ seasonId: '2024-25', playerId: 44, round: 1, minutes: 90, totalPoints: 6, starts: 1 })],
    })

    const priors = aggregatePriors(prior)
    expect(priors[0]?.rawP90).toBeCloseTo(3.6, 10)
    const joined = joinTransition(prior, next)
    expect(joined).toHaveLength(1)
    expect(joined[0]?.code).toBe(99)
    expect(joined[0]?.actualGw1Points).toBe(6)

    const baselines = buildBaselines([
      ...priors,
      regular('GK', 4),
      regular('DEF', 4),
      regular('MID', 4, 2 / 3),
      regular('FWD', 4),
    ])
    expect(baselines.p90.MID).toBeCloseTo(4, 6)

    const projected = projectJoined(joined, next, baselines, DEFAULT_PROJECTION)
    expect(projected[0]?.predictedGw1).toBeCloseTo(2.6, 6)
    const card = scorePredictions(projected)
    expect(card.n).toBe(1)
    expect(card.rmse).toBeCloseTo(Math.abs(2.6 - 6), 6)
  })
})

function player(partial: Partial<AnalysisPlayer> & Pick<AnalysisPlayer, 'id' | 'code'>): AnalysisPlayer {
  return {
    seasonId: '2023-24',
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
    seasonId: '2023-24',
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

function season(
  seasonId: string,
  parts: { player: AnalysisPlayer; performances: FplPerformance[] },
): LoadedSeason {
  return {
    seasonId,
    players: [parts.player],
    teams: [
      {
        seasonId,
        id: 1,
        code: 3,
        name: 'Arsenal',
        shortName: 'ARS',
        strength: 0,
        strengthAttackHome: 0,
        strengthAttackAway: 0,
        strengthDefenceHome: 0,
        strengthDefenceAway: 0,
      },
    ],
    fixtures: [
      {
        seasonId,
        id: 1,
        event: 1,
        kickoffTime: '',
        teamH: 1,
        teamA: 2,
        teamHScore: 1,
        teamAScore: 0,
        finished: true,
        teamHDifficulty: 2,
        teamADifficulty: 2,
      },
    ],
    performances: parts.performances,
    hasMergedGw: true,
    startsInferred: false,
  }
}

function regular(
  position: PlayerPosition,
  p90: number,
  startRate = 1,
): ReturnType<typeof aggregatePriors>[number] {
  const minutes = 900
  const points = p90 * 10
  return {
    code: position.charCodeAt(0),
    playerId: position.charCodeAt(0),
    position,
    teamCode: 1,
    teamName: 'Pool',
    teamShortName: 'POL',
    minutes,
    points,
    startsRate: startRate,
    rawP90: p90,
    eventRates: null,
    eventEp90: p90,
  }
}
