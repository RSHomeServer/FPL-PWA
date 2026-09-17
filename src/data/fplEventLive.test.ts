import { describe, expect, it } from 'vitest'
import {
  countByRound,
  parseEventLivePayload,
  performanceFromEventLive,
} from './fplEventLive'
import { targetEventIds } from './fplCurrentSeason'
import type { FplFixture, FplLiveEvent, FplLivePlayer, FplTeam } from './types'

describe('parseEventLivePayload', () => {
  it('keeps valid element rows', () => {
    const elements = parseEventLivePayload({
      elements: [
        { id: 12, stats: { minutes: 90, total_points: 6 } },
        { id: 0, stats: {} },
        null,
      ],
    })
    expect(elements).toHaveLength(1)
    expect(elements[0]?.id).toBe(12)
  })
})

describe('performanceFromEventLive', () => {
  it('maps stats and joins opponent from fixtures', () => {
    const player: FplLivePlayer = {
      seasonId: '2026-27',
      id: 12,
      code: 99,
      firstName: 'A',
      secondName: 'B',
      webName: 'Tester',
      teamId: 1,
      position: 'DEF',
      nowCostTenths: 55,
      totalPoints: 20,
      minutes: 270,
      goalsScored: 0,
      assists: 0,
      form: 4,
      selectedByPercent: 10,
      teamCode: 3,
      status: 'a',
      news: '',
      chanceOfPlayingThisRound: null,
      chanceOfPlayingNextRound: null,
      epNext: 3,
      canSelect: true,
      costChangeStart: 0,
      eventPoints: 6,
    }
    const team: FplTeam = {
      seasonId: '2026-27',
      id: 1,
      code: 3,
      name: 'Arsenal',
      shortName: 'ARS',
      strength: 4,
      strengthAttackHome: 1200,
      strengthAttackAway: 1100,
      strengthDefenceHome: 1200,
      strengthDefenceAway: 1100,
    }
    const fixture: FplFixture = {
      seasonId: '2026-27',
      id: 7,
      event: 1,
      kickoffTime: '2026-08-21T19:00:00Z',
      teamH: 1,
      teamA: 7,
      teamHScore: 3,
      teamAScore: 0,
      finished: true,
      teamHDifficulty: 2,
      teamADifficulty: 4,
    }
    const row = performanceFromEventLive(
      '2026-27',
      1,
      {
        id: 12,
        stats: {
          minutes: 90,
          total_points: 6,
          clean_sheets: 1,
          starts: 1,
          bonus: 0,
          bps: 24,
          defensive_contribution: 5,
        },
        explain: [{ fixture: 7 }],
      },
      player,
      team,
      new Map([[7, fixture]]),
      [fixture],
    )
    expect(row.playerId).toBe(12)
    expect(row.round).toBe(1)
    expect(row.totalPoints).toBe(6)
    expect(row.minutes).toBe(90)
    expect(row.wasHome).toBe(true)
    expect(row.opponentTeamId).toBe(7)
    expect(row.valueTenths).toBe(55)
    expect(row.defensiveContribution).toBe(5)
    expect(row.teamName).toBe('Arsenal')
  })
})

describe('targetEventIds', () => {
  it('includes finished and current events only', () => {
    const events: FplLiveEvent[] = [
      { id: 1, name: 'GW1', deadlineTime: '', isNext: false, isCurrent: false, finished: true },
      { id: 2, name: 'GW2', deadlineTime: '', isNext: false, isCurrent: false, finished: true },
      { id: 3, name: 'GW3', deadlineTime: '', isNext: false, isCurrent: true, finished: false },
      { id: 4, name: 'GW4', deadlineTime: '', isNext: true, isCurrent: false, finished: false },
    ]
    expect(targetEventIds(events)).toEqual([1, 2, 3])
  })
})

describe('countByRound', () => {
  it('summarises row and minutes counts', () => {
    const summary = countByRound([
      {
        seasonId: '2026-27',
        playerId: 1,
        round: 1,
        fixture: 1,
        minutes: 90,
        totalPoints: 6,
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
        opponentTeamId: 2,
        valueTenths: 60,
        kickoffTime: '',
        teamName: 'T',
      },
      {
        seasonId: '2026-27',
        playerId: 2,
        round: 1,
        fixture: 1,
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
        wasHome: false,
        opponentTeamId: 1,
        valueTenths: 45,
        kickoffTime: '',
        teamName: 'U',
      },
    ])
    expect(summary).toEqual([{ round: 1, rows: 2, withMinutes: 1 }])
  })
})
