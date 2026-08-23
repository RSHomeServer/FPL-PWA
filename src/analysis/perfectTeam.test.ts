import { describe, expect, it } from 'vitest'
import {
  bestLineupAcrossFormations,
  buildHindsightPool,
  isLegalSquadCodes,
  type HindsightPlayer,
} from './perfectTeam'
import type { SeasonSnapshot } from '../data/types'

function mockPlayer(overrides: Partial<HindsightPlayer> & Pick<HindsightPlayer, 'code' | 'webName' | 'position'>): HindsightPlayer {
  return {
    playerId: overrides.code,
    teamId: overrides.teamId ?? 1,
    teamCode: overrides.teamCode ?? 1,
    teamShortName: overrides.teamShortName ?? 'TST',
    costTenths: overrides.costTenths ?? 80,
    gwPoints: overrides.gwPoints ?? 0,
    performance: overrides.performance ?? null,
    ...overrides,
  }
}

describe('perfectTeam lineup', () => {
  it('picks captain bonus on the highest scorer in the XI', () => {
    const squad = [
      mockPlayer({ code: 1, webName: 'A', position: 'GK', gwPoints: 6 }),
      mockPlayer({ code: 2, webName: 'B', position: 'DEF', gwPoints: 8 }),
      mockPlayer({ code: 3, webName: 'C', position: 'DEF', gwPoints: 7 }),
      mockPlayer({ code: 4, webName: 'D', position: 'DEF', gwPoints: 5 }),
      mockPlayer({ code: 5, webName: 'E', position: 'MID', gwPoints: 12 }),
      mockPlayer({ code: 6, webName: 'F', position: 'MID', gwPoints: 9 }),
      mockPlayer({ code: 7, webName: 'G', position: 'MID', gwPoints: 4 }),
      mockPlayer({ code: 8, webName: 'H', position: 'MID', gwPoints: 3 }),
      mockPlayer({ code: 9, webName: 'I', position: 'FWD', gwPoints: 15 }),
      mockPlayer({ code: 10, webName: 'J', position: 'FWD', gwPoints: 11 }),
      mockPlayer({ code: 11, webName: 'K', position: 'FWD', gwPoints: 2 }),
      mockPlayer({ code: 12, webName: 'L', position: 'GK', gwPoints: 0 }),
      mockPlayer({ code: 13, webName: 'M', position: 'DEF', gwPoints: 1 }),
      mockPlayer({ code: 14, webName: 'N', position: 'MID', gwPoints: 1 }),
      mockPlayer({ code: 15, webName: 'O', position: 'FWD', gwPoints: 1 }),
    ]
    const points = new Map(squad.map((player) => [player.code, player.gwPoints]))
    const lineup = bestLineupAcrossFormations(squad, points)
    expect(lineup.captain.code).toBe(9)
    expect(lineup.points).toBe(
      lineup.xi.reduce((sum, player) => sum + player.gwPoints, 0) + lineup.captain.gwPoints,
    )
  })

  it('builds hindsight pool with zero for players who did not appear', () => {
    const snapshot: SeasonSnapshot = {
      meta: {
        seasonId: '2023-24',
        kind: 'historical',
        fetchedAt: 0,
        sourceRevision: 'test',
        etags: {},
        playerCount: 1,
        teamCount: 1,
        fixtureCount: 0,
        performanceCount: 1,
      },
      players: [
        {
          seasonId: '2023-24',
          id: 10,
          code: 100,
          firstName: 'Test',
          secondName: 'Player',
          webName: 'Tester',
          teamId: 1,
          position: 'FWD',
          nowCostTenths: 80,
          totalPoints: 10,
          minutes: 90,
          goalsScored: 1,
          assists: 0,
          form: 0,
          selectedByPercent: 0,
        },
      ],
      teams: [
        {
          seasonId: '2023-24',
          id: 1,
          code: 11,
          name: 'Test FC',
          shortName: 'TFC',
          strength: 3,
          strengthAttackHome: 1000,
          strengthAttackAway: 1000,
          strengthDefenceHome: 1000,
          strengthDefenceAway: 1000,
        },
      ],
      fixtures: [],
      performances: [
        {
          seasonId: '2023-24',
          playerId: 10,
          round: 1,
          fixture: 1,
          minutes: 90,
          totalPoints: 6,
          goalsScored: 1,
          assists: 0,
          cleanSheets: 0,
          saves: 0,
          bonus: 0,
          bps: 10,
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
          gwPosition: 'FWD',
          wasHome: true,
          opponentTeamId: 2,
          valueTenths: 81,
          kickoffTime: '',
          teamName: 'TFC',
        },
      ],
    }
    const pool = buildHindsightPool(snapshot, 1)
    expect(pool).toHaveLength(1)
    expect(pool[0]?.gwPoints).toBe(6)
    expect(pool[0]?.costTenths).toBe(81)
  })
})

describe('isLegalSquadCodes', () => {
  it('rejects more than three per club', () => {
    const squad = Array.from({ length: 15 }, (_, index) =>
      mockPlayer({
        code: index + 1,
        webName: `P${index + 1}`,
        position: index < 2 ? 'GK' : index < 7 ? 'DEF' : index < 12 ? 'MID' : 'FWD',
        teamId: 1,
      }),
    )
    const byCode = new Map(squad.map((player) => [player.code, player]))
    expect(isLegalSquadCodes(squad, byCode)).toBe(false)
  })
})
