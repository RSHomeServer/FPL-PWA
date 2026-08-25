import { describe, expect, it } from 'vitest'
import { aggregatePriors, buildBaselines, type PriorPlayer } from './backtest'
import type { AnalysisPlayer, LoadedSeason } from './loadSeason'
import type { FplFixture, FplLivePlayer, FplPerformance, FplTeam, PlayerPosition } from '../data/types'
import {
  DEFAULT_GW0_OPTIONS,
  joinGw0Pool,
  projectGw0Pool,
} from './gw0Project'
import { expectedPointsApproachA, shrinkageC } from './metrics'
import {
  adjP90Live,
  DEFAULT_LIVE_OPTIONS,
  joinLivePool,
  liveAuditLine,
  liveStartsRate,
  projectLivePool,
  resolveAsOfEvent,
  resolveLiveFitness,
} from './liveProject'

describe('IS1 adj_p90_live', () => {
  it('returns the GW0 prior when current minutes are 0', () => {
    const blend = adjP90Live(null, 0, 3.9, 3.9, DEFAULT_LIVE_OPTIONS.shrinkage)
    expect(blend.wCur).toBe(0)
    expect(blend.adj).toBeCloseTo(3.9, 10)
  })

  it('weights current raw p90 by shrinkageC(m_cur)', () => {
    const mCur = 225
    const w = shrinkageC(mCur, DEFAULT_LIVE_OPTIONS.shrinkage)
    expect(w).toBeCloseTo(0.25, 10)
    const blend = adjP90Live(6, mCur, 3.9, 3.9, DEFAULT_LIVE_OPTIONS.shrinkage)
    expect(blend.wCur).toBeCloseTo(0.25, 10)
    expect(blend.adj).toBeCloseTo(0.25 * 6 + 0.75 * 3.9, 10)
  })

  it('drops k_trans from the prior once m_cur >= 450', () => {
    const withK = 3.9 * 0.75
    const withoutK = 3.9
    const low = adjP90Live(5, 200, withK, withoutK, DEFAULT_LIVE_OPTIONS.shrinkage)
    expect(low.priorComponent).toBeCloseTo(withK, 10)
    const high = adjP90Live(5, 450, withK, withoutK, DEFAULT_LIVE_OPTIONS.shrinkage)
    expect(high.priorComponent).toBeCloseTo(withoutK, 10)
  })
})

describe('IS2 live starts / minutes', () => {
  it('falls back to the prior starts rate when m_cur = 0', () => {
    expect(liveStartsRate(0.9, 0, 2 / 3)).toBeCloseTo(2 / 3, 10)
  })

  it('uses current starts once the sample reaches 450 minutes', () => {
    expect(liveStartsRate(0.9, 450, 2 / 3)).toBeCloseTo(0.9, 10)
  })
})

describe('live fitness mode', () => {
  it('prefers this-round chance mid-GW and next-round before deadline', () => {
    const player = {
      current: livePlayer({
        id: 1,
        code: 99,
        chanceOfPlayingThisRound: 50,
        chanceOfPlayingNextRound: 100,
      }),
    }
    expect(resolveLiveFitness(player, null, 'mid_gw')).toBeCloseTo(0.6, 10)
    expect(resolveLiveFitness(player, null, 'before_deadline')).toBe(1)
  })
})

describe('GW0 parity when m_cur = 0', () => {
  const baselines = buildBaselines([
    ...aggregatePriors(priorSeason()),
    regular('GK', 4),
    regular('DEF', 4),
    regular('MID', 4, 2 / 3),
    regular('FWD', 4),
  ])

  it('matches GW0 adj_p90, E_min, and E_pts for returning players', () => {
    const fixtures = [fixture({ event: 1, teamHDifficulty: 2 })]
    const gw0Joined = joinGw0Pool([livePlayer({ id: 44, code: 99 })], [team()], priorSeason())
    const gw0 = projectGw0Pool(gw0Joined, fixtures, baselines, DEFAULT_GW0_OPTIONS)[0]!

    const liveJoined = joinLivePool(
      [livePlayer({ id: 44, code: 99 })],
      [team()],
      priorSeason(),
      currentSeasonEmpty(),
      1,
    )
    expect(liveJoined[0]?.currentSample.minutes).toBe(0)
    const live = projectLivePool(liveJoined, fixtures, baselines, 1, {
      ...DEFAULT_LIVE_OPTIONS,
      horizon: 1,
    })[0]!

    expect(live.adjP90Live).toBeCloseTo(gw0.adjP90, 10)
    expect(live.expectedMinutesNext).toBeCloseTo(gw0.expectedMinutesGw1, 10)
    expect(live.ePtsNext).toBeCloseTo(gw0.ePtsGw1, 10)
    expect(reconstruct(live.auditByGw[0]!)).toBeCloseTo(live.ePtsNext, 10)
  })

  it('matches transferred k_trans behaviour when m_cur = 0', () => {
    const fixtures = [fixture({ event: 1, teamH: 2, teamA: 1, teamHDifficulty: 2 })]
    const teams = [team({ id: 2, code: 14, name: 'Liverpool', shortName: 'LIV' })]
    const players = [livePlayer({ id: 44, code: 99, teamId: 2, teamCode: 14 })]
    const gw0 = projectGw0Pool(joinGw0Pool(players, teams, priorSeason()), fixtures, baselines)[0]!
    const live = projectLivePool(
      joinLivePool(players, teams, priorSeason(), currentSeasonEmpty(), 1),
      fixtures,
      baselines,
      1,
      { ...DEFAULT_LIVE_OPTIONS, horizon: 1 },
    )[0]!
    expect(live.adjP90Live).toBeCloseTo(gw0.adjP90, 10)
    expect(live.ePtsNext).toBeCloseTo(gw0.ePtsGw1, 10)
  })
})

describe('IS3–IS5 projection', () => {
  const baselines = buildBaselines([
    ...aggregatePriors(priorSeason()),
    regular('GK', 4),
    regular('DEF', 4),
    regular('MID', 4, 2 / 3),
    regular('FWD', 4),
  ])

  it('reconstructs next-GW EP from audit inputs and exposes Approach B separately', () => {
    const fixtures = [fixture({ event: 3, teamHDifficulty: 2 })]
    const live = projectLivePool(
      joinLivePool(
        [livePlayer({ id: 44, code: 99 })],
        [team()],
        priorSeason(),
        currentSeasonWithMinutes(),
        3,
      ),
      fixtures,
      baselines,
      3,
      { ...DEFAULT_LIVE_OPTIONS, horizon: 1 },
    )[0]!

    expect(live.currentSample.minutes).toBe(225)
    expect(live.adjP90Live).toBeGreaterThan(0)
    expect(reconstruct(live.auditByGw[0]!)).toBeCloseTo(live.ePtsNext, 10)
    expect(live.ePtsBNext).toBeGreaterThanOrEqual(0)
    expect(liveAuditLine(live.auditByGw[0]!)).toContain('adj_live=')
    expect(live.confidence.drivers.some((d) => d.includes('Current season'))).toBe(true)
  })

  it('horizon sum equals the sum of per-GW terms', () => {
    const fixtures = [1, 2, 3, 4, 5].map((event) =>
      fixture({ id: event, event, teamHDifficulty: 2 }),
    )
    const live = projectLivePool(
      joinLivePool(
        [livePlayer({ id: 44, code: 99 })],
        [team()],
        priorSeason(),
        currentSeasonEmpty(),
        1,
      ),
      fixtures,
      baselines,
      1,
      { ...DEFAULT_LIVE_OPTIONS, horizon: 5 },
    )[0]!

    expect(live.horizonEffective).toBe(5)
    expect(live.ePtsByGw).toHaveLength(5)
    expect(live.ePtsHorizon).toBeCloseTo(
      live.ePtsByGw.reduce((sum, value) => sum + value, 0),
      10,
    )
    expect(live.ePtsHorizon).toBeCloseTo(live.ePtsNext * 5, 10)
  })

  it('omits horizon GWs with no published fixtures', () => {
    const fixtures = [fixture({ id: 1, event: 1, teamHDifficulty: 2 })]
    const live = projectLivePool(
      joinLivePool(
        [livePlayer({ id: 44, code: 99 })],
        [team()],
        priorSeason(),
        currentSeasonEmpty(),
        1,
      ),
      fixtures,
      baselines,
      1,
      { ...DEFAULT_LIVE_OPTIONS, horizon: 5 },
    )[0]!
    expect(live.horizonEffective).toBe(1)
    expect(live.ePtsHorizon).toBeCloseTo(live.ePtsNext, 10)
  })
})

describe('resolveAsOfEvent', () => {
  it('prefers nextEventId then isNext then current', () => {
    expect(resolveAsOfEvent({ nextEventId: 4 })).toBe(4)
    expect(
      resolveAsOfEvent({
        events: [
          { id: 2, isNext: false, isCurrent: true },
          { id: 3, isNext: true, isCurrent: false },
        ],
      }),
    ).toBe(3)
    expect(resolveAsOfEvent({ currentEventId: 2 })).toBe(2)
    expect(resolveAsOfEvent({})).toBe(1)
  })
})

function reconstruct(audit: {
  adjP90: number
  eMinutes: number
  blendedFactor: number
}): number {
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
  const player = analysisPlayer({
    id: 10,
    code: 99,
    position: 'MID',
    minutes: 225,
    totalPoints: 9,
    ...playerPartial,
  })
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

function currentSeasonEmpty(): LoadedSeason {
  return {
    seasonId: '2026-27',
    players: [analysisPlayer({ id: 44, code: 99, seasonId: '2026-27' })],
    teams: [team()],
    fixtures: [],
    performances: [],
    hasMergedGw: false,
    startsInferred: false,
  }
}

function currentSeasonWithMinutes(): LoadedSeason {
  return {
    seasonId: '2026-27',
    players: [analysisPlayer({ id: 44, code: 99, seasonId: '2026-27', minutes: 225, totalPoints: 15 })],
    teams: [team()],
    fixtures: [],
    performances: [
      perf({
        seasonId: '2026-27',
        playerId: 44,
        round: 1,
        minutes: 90,
        totalPoints: 8,
        goalsScored: 1,
        starts: 1,
      }),
      perf({
        seasonId: '2026-27',
        playerId: 44,
        round: 2,
        minutes: 135,
        totalPoints: 7,
        starts: 1,
      }),
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

function perf(
  partial: Partial<FplPerformance> & Pick<FplPerformance, 'playerId' | 'round'>,
): FplPerformance {
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

function regular(position: PlayerPosition, raw: number, starts = 0.8): PriorPlayer {
  return {
    code: 2000 + position.charCodeAt(0) + Math.round(raw * 10),
    playerId: 2000 + Math.round(raw * 10),
    position,
    teamCode: 3,
    teamName: 'Arsenal',
    teamShortName: 'ARS',
    minutes: 900,
    points: raw * 10,
    startsRate: starts,
    rawP90: raw,
    eventRates: null,
    eventEp90: null,
  }
}
