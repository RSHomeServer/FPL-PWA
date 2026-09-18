import { describe, expect, it } from 'vitest'
import {
  meanUpcomingFdr,
  playerGwPointHistory,
  teamUpcomingFdrChips,
} from './elitePitchEnrichment'
import type { FplFixture, FplPerformance, FplTeam } from '../data/types'

function team(id: number, shortName: string): FplTeam {
  return {
    seasonId: '2026-27',
    id,
    code: id,
    name: shortName,
    shortName,
    strength: 1,
    strengthAttackHome: 1,
    strengthAttackAway: 1,
    strengthDefenceHome: 1,
    strengthDefenceAway: 1,
  }
}

describe('teamUpcomingFdrChips', () => {
  it('builds upcoming FDR chips for a team', () => {
    const teams = new Map([
      [1, team(1, 'ARS')],
      [2, team(2, 'AVL')],
      [3, team(3, 'BHA')],
    ])
    const fixtures: FplFixture[] = [
      {
        seasonId: '2026-27',
        id: 1,
        event: 5,
        kickoffTime: '2026-09-20T14:00:00Z',
        teamH: 1,
        teamA: 2,
        teamHScore: null,
        teamAScore: null,
        finished: false,
        teamHDifficulty: 2,
        teamADifficulty: 4,
      },
      {
        seasonId: '2026-27',
        id: 2,
        event: 6,
        kickoffTime: '2026-09-27T14:00:00Z',
        teamH: 3,
        teamA: 1,
        teamHScore: null,
        teamAScore: null,
        finished: false,
        teamHDifficulty: 3,
        teamADifficulty: 2,
      },
    ]
    const chips = teamUpcomingFdrChips(fixtures, teams, 1, 4)
    expect(chips).toEqual([
      { label: 'AVLH', fdr: 2, event: 5 },
      { label: 'BHAA', fdr: 2, event: 6 },
    ])
    expect(meanUpcomingFdr(chips)).toBe(2)
  })
})

describe('playerGwPointHistory', () => {
  it('sums multi-fixture weeks and keeps recent GWs', () => {
    const performances: FplPerformance[] = [
      perf(10, 1, 1, 4),
      perf(10, 2, 2, 6),
      perf(10, 2, 3, 2),
      perf(10, 3, 4, 1),
    ]
    expect(playerGwPointHistory(performances, 10, 6)).toEqual([
      { gw: 1, points: 4 },
      { gw: 2, points: 8 },
      { gw: 3, points: 1 },
    ])
  })
})

function perf(playerId: number, round: number, fixture: number, totalPoints: number): FplPerformance {
  return {
    seasonId: '2026-27',
    playerId,
    round,
    fixture,
    minutes: 90,
    totalPoints,
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
    starts: 1,
    expectedGoals: 0,
    expectedAssists: 0,
    expectedGoalInvolvements: 0,
    expectedPoints: null,
    defensiveContribution: null,
    gwPosition: 'MID',
    wasHome: true,
    opponentTeamId: 1,
    valueTenths: 70,
    kickoffTime: '',
    teamName: '',
  }
}
