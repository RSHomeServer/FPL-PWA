import { describe, expect, it } from 'vitest'
import { eliteGameweekOwnership, playerRoundPoints } from './eliteOwnership'
import type { EliteEntryRecord, EliteGameweekSquad, FplPerformance } from '../data/types'

function squad(gw: number, xi: number[], bench: number[], captain = xi[0]!): EliteGameweekSquad {
  return {
    gw,
    xi,
    bench,
    captainElementId: captain,
    viceCaptainElementId: xi[1] ?? xi[0]!,
    activeChip: null,
    historyChips: [],
    points: 50,
    overallRank: 100,
  }
}

function entry(id: number, gameweeks: EliteGameweekSquad[]): EliteEntryRecord {
  return {
    entryId: id,
    entryName: `T${id}`,
    playerName: `M${id}`,
    totalPoints: 100,
    leagues: [],
    gameweeks,
    fetchedAt: 1,
  }
}

function perf(playerId: number, round: number, fixture: number, totalPoints: number): FplPerformance {
  return {
    seasonId: '2026-27',
    playerId,
    round,
    fixture,
    minutes: totalPoints > 0 ? 90 : 0,
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

describe('eliteGameweekOwnership', () => {
  it('ranks by ownership across the elite sample for a GW', () => {
    const xi = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    const entries = [
      entry(1, [squad(1, xi, [12, 13, 14, 15], 1)]),
      entry(2, [squad(1, xi, [12, 13, 14, 16], 1)]),
      entry(3, [squad(1, [...xi.slice(0, 10), 20], [12, 13, 14, 15], 20)]),
    ]
    const board = eliteGameweekOwnership(entries, 1, 30)
    expect(board.sampleSize).toBe(3)
    expect(board.rows[0]?.elementId).toBe(1)
    expect(board.rows[0]?.ownership).toBe(1)
    expect(board.rows[0]?.captainCount).toBe(2)
    const rare = board.rows.find((row) => row.elementId === 20)
    expect(rare?.ownership).toBeCloseTo(1 / 3)
  })
})

describe('playerRoundPoints', () => {
  it('sums multi-fixture rows for a round', () => {
    const performances = [perf(10, 2, 1, 6), perf(10, 2, 2, 0)]
    expect(playerRoundPoints(performances, 10, 2)).toBe(6)
    expect(playerRoundPoints(performances, 10, 1)).toBeNull()
  })
})
