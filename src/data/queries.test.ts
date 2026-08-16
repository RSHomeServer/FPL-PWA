import { describe, expect, it } from 'vitest'
import { filterGameweekRows, formSeries, meanPointsSeries, type GameweekEventRow } from './queries'
import type { FplPerformance, FplTeam } from './types'

function gw(partial: Partial<FplPerformance> & Pick<FplPerformance, 'playerId' | 'round'>): FplPerformance {
  return {
    seasonId: '2025-26',
    fixture: partial.round,
    minutes: 90,
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
    starts: 1,
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

describe('labelled series', () => {
  it('keeps gameweek numbers on the x axis for player form', () => {
    const series = formSeries(
      [gw({ playerId: 1, round: 3, totalPoints: 2 }), gw({ playerId: 1, round: 5, totalPoints: 8 })],
      1,
    )
    expect(series).toEqual([
      { x: 3, y: 2, label: 'GW 3' },
      { x: 5, y: 8, label: 'GW 5' },
    ])
  })

  it('averages points by published round', () => {
    const series = meanPointsSeries([
      gw({ playerId: 1, round: 1, totalPoints: 2 }),
      gw({ playerId: 2, round: 1, totalPoints: 6 }),
      gw({ playerId: 1, round: 2, totalPoints: 4, minutes: 0 }),
    ])
    expect(series).toEqual([{ x: 1, y: 4, label: 'GW 1' }])
  })
})

describe('filterGameweekRows', () => {
  const arsenal: FplTeam = {
    seasonId: '2025-26',
    id: 1,
    code: 3,
    name: 'Arsenal',
    shortName: 'ARS',
    strength: 0,
    strengthAttackHome: 0,
    strengthAttackAway: 0,
    strengthDefenceHome: 0,
    strengthDefenceAway: 0,
  }

  function row(partial: Partial<GameweekEventRow>): GameweekEventRow {
    return {
      player: undefined,
      team: arsenal,
      opponent: undefined,
      who: 'Saka',
      position: 'MID',
      event: '60+ (+2)',
      points: 2,
      minutes: 90,
      goals: 0,
      assists: 0,
      cleanSheet: '0',
      saves: 'NA',
      bonus: 0,
      goalsConceded: 'NA',
      expectedInvolvement: '0.00',
      expectedPoints: 'NA',
      defensiveContribution: '0',
      bps: 10,
      wasHome: true,
      costTenths: 100,
      ...partial,
    }
  }

  it('filters by team, position, and GW value (cost) bounds', () => {
    const rows = [
      row({ who: 'Saka', position: 'MID', costTenths: 100 }),
      row({ who: 'Raya', position: 'GK', costTenths: 55 }),
      row({ who: 'Haaland', position: 'FWD', costTenths: 150, team: { ...arsenal, id: 2, shortName: 'MCI' } }),
    ]
    expect(
      filterGameweekRows(rows, {
        teamId: 1,
        position: 'all',
        minCostTenths: null,
        maxCostTenths: 60,
      }).map((entry) => entry.who),
    ).toEqual(['Raya'])
    expect(
      filterGameweekRows(rows, {
        teamId: 'all',
        position: 'FWD',
        minCostTenths: 120,
        maxCostTenths: null,
      }).map((entry) => entry.who),
    ).toEqual(['Haaland'])
  })
})
