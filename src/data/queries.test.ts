import { describe, expect, it } from 'vitest'
import { formSeries, meanPointsSeries } from './queries'
import type { FplPerformance } from './types'

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
