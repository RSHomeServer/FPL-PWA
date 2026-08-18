import { describe, expect, it } from 'vitest'
import { aggregatePriors, buildBaselines } from './backtest'
import { autoFlagReasons, runGw0Funnel, topFractionCutoff } from './gw0Funnel'
import { DEFAULT_GW0_OPTIONS, joinGw0Pool, projectGw0Pool, type Gw0Projection } from './gw0Project'
import type { AnalysisPlayer, LoadedSeason } from './loadSeason'
import type { FplFixture, FplLivePlayer, FplPerformance, FplTeam } from '../data/types'

describe('funnel cutoffs', () => {
  it('keeps the top 60% at or above the 40th-percentile value', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const cutoff = topFractionCutoff(values, 0.6)
    expect(cutoff).toBe(5)
    expect(values.filter((value) => value >= cutoff)).toHaveLength(6)
  })
})

describe('quantitative funnel', () => {
  it('drops unavailable / cannot-select players, then ORs EP / EPPM / minutes', () => {
    const rows = [
      proj({ code: 1, ePtsGw1: 4, eppmGw1: 0.4, minutes: 2000, canSelect: true, mFitness: 1 }),
      proj({ code: 2, ePtsGw1: 0.5, eppmGw1: 0.05, minutes: 90, canSelect: true, mFitness: 1 }),
      proj({ code: 3, ePtsGw1: 5, eppmGw1: 0.8, minutes: 3000, canSelect: true, mFitness: 0 }),
      proj({ code: 4, ePtsGw1: 4, eppmGw1: 0.5, minutes: 2000, canSelect: false, mFitness: 1 }),
      proj({ code: 5, ePtsGw1: 1, eppmGw1: 0.9, minutes: 100, canSelect: true, mFitness: 1 }),
      proj({ code: 6, ePtsGw1: 1, eppmGw1: 0.1, minutes: 800, canSelect: true, mFitness: 1 }),
    ]
    const result = runGw0Funnel(rows, {
      positionFloors: { GK: 9, DEF: 9, MID: 3, FWD: 9 },
      eppmKeepTopFraction: 0.5,
      minutesShareOfSeason: 800 / (38 * 90),
      lowMinutes: 450,
    })
    expect(result.counts.selectable).toBe(5)
    expect(result.counts.available).toBe(4)
    expect(result.counts.excludedUnavailable).toBe(1)
    const lpCodes = result.rows.filter((row) => row.inLp).map((row) => row.projection.code)
    expect(lpCodes).toEqual(expect.arrayContaining([1, 5, 6]))
    expect(lpCodes).not.toContain(2)
    expect(lpCodes).not.toContain(3)
    expect(lpCodes).not.toContain(4)
    expect(result.rows.find((row) => row.projection.code === 1)?.lpReasons).toContain('epFloor')
    expect(result.rows.find((row) => row.projection.code === 5)?.lpReasons).toContain('eppm')
    expect(result.rows.find((row) => row.projection.code === 6)?.lpReasons).toContain('minutesShare')
  })

  it('emits machine-readable auto-flag reasons on LP rows', () => {
    const transferred = proj({
      code: 10,
      ePtsGw1: 4,
      eppmGw1: 0.5,
      minutes: 200,
      club: 'transferred',
      newToPl: false,
      status: 'd',
      mFitness: 0.7,
    })
    const newSigning = proj({
      code: 11,
      ePtsGw1: 4,
      eppmGw1: 0.5,
      minutes: 0,
      newToPl: true,
      promotedClub: true,
    })
    const result = runGw0Funnel([transferred, newSigning], {
      positionFloors: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
      eppmKeepTopFraction: 1,
      minutesShareOfSeason: 1,
      lowMinutes: 450,
    })
    expect(autoFlagReasons(transferred).sort()).toEqual(['doubtful', 'lowMinutes', 'newClub'].sort())
    expect(autoFlagReasons(newSigning).sort()).toEqual(['lowMinutes', 'newToPl', 'promotedClub'].sort())
    expect(result.counts.autoFlag).toBe(2)
    expect(result.rows[0]?.autoFlagReasons).toEqual(expect.arrayContaining(['newClub', 'doubtful', 'lowMinutes']))
  })
})

describe('promoted club join flag', () => {
  it('marks a current club that was absent from the prior-season team table', () => {
    const prior = priorSeason()
    const live = livePlayer({ id: 1, code: 99, teamId: 9, teamCode: 20 })
    const joined = joinGw0Pool(
      [live],
      [team({ id: 9, code: 20, name: 'Sunderland', shortName: 'SUN' })],
      prior,
    )
    const projected = projectGw0Pool(joined, [fixture({ teamH: 9, teamA: 1 })], tinyBaselines(), DEFAULT_GW0_OPTIONS)
    expect(projected[0]?.promotedClub).toBe(true)
  })
})

function tinyBaselines() {
  return buildBaselines([
    ...aggregatePriors(priorSeason()),
    {
      code: 2,
      playerId: 2,
      position: 'GK' as const,
      teamCode: 1,
      teamName: 'Pool',
      teamShortName: 'POL',
      minutes: 900,
      points: 40,
      startsRate: 1,
      rawP90: 4,
      eventRates: null,
      eventEp90: 4,
    },
    {
      code: 3,
      playerId: 3,
      position: 'DEF' as const,
      teamCode: 1,
      teamName: 'Pool',
      teamShortName: 'POL',
      minutes: 900,
      points: 40,
      startsRate: 1,
      rawP90: 4,
      eventRates: null,
      eventEp90: 4,
    },
    {
      code: 4,
      playerId: 4,
      position: 'FWD' as const,
      teamCode: 1,
      teamName: 'Pool',
      teamShortName: 'POL',
      minutes: 900,
      points: 40,
      startsRate: 1,
      rawP90: 4,
      eventRates: null,
      eventEp90: 4,
    },
  ])
}

function proj(
  partial: Partial<Gw0Projection> & {
    code: number
    ePtsGw1: number
    eppmGw1: number
    minutes?: number
    canSelect?: boolean
    mFitness?: number
    club?: Gw0Projection['club']
    newToPl?: boolean
    promotedClub?: boolean
    status?: string
  },
): Gw0Projection {
  const minutes = partial.minutes ?? 900
  return {
    code: partial.code,
    current: livePlayer({
      id: partial.code,
      code: partial.code,
      canSelect: partial.canSelect ?? true,
      status: partial.status ?? 'a',
      chanceOfPlayingNextRound: partial.mFitness === 0 ? 0 : null,
    }),
    teamName: 'Arsenal',
    teamShortName: 'ARS',
    prior:
      minutes > 0
        ? {
            code: partial.code,
            playerId: partial.code,
            position: 'MID',
            teamCode: 3,
            teamName: 'Arsenal',
            teamShortName: 'ARS',
            minutes,
            points: 10,
            startsRate: 0.8,
            rawP90: 4,
            eventRates: null,
            eventEp90: 4,
          }
        : null,
    newToPl: partial.newToPl ?? minutes < 90,
    club: partial.club ?? 'same',
    promotedClub: partial.promotedClub ?? false,
    position: 'MID',
    nowCostTenths: 70,
    adjP90: 4,
    mSem: 1,
    roleEvidence: null,
    mFitness: partial.mFitness ?? 1,
    expectedMinutesGw1: 60,
    ePtsByGw: [partial.ePtsGw1],
    ePtsGw1: partial.ePtsGw1,
    ePtsGw16: partial.ePtsGw1,
    eppmGw1: partial.eppmGw1,
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
    auditByGw: [],
    eventRates: null,
    ePtsBGw1: 0,
  }
}

function livePlayer(partial: Partial<FplLivePlayer> & Pick<FplLivePlayer, 'id' | 'code'>): FplLivePlayer {
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
