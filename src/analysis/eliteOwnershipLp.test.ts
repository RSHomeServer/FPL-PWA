import { describe, expect, it } from 'vitest'
import { buildEliteLpPool, objectiveScoreLabel } from './eliteOwnershipLp'
import type { EliteGwOwnershipRow } from './eliteOwnership'
import type { FplPlayer, SeasonSnapshot } from '../data/types'

function player(id: number, overrides: Partial<FplPlayer> = {}): FplPlayer {
  return {
    seasonId: '2026-27',
    id,
    code: id * 10,
    firstName: 'A',
    secondName: 'B',
    webName: `P${id}`,
    teamId: (id % 5) + 1,
    position: id % 4 === 0 ? 'GK' : id % 4 === 1 ? 'DEF' : id % 4 === 2 ? 'MID' : 'FWD',
    nowCostTenths: 50 + id,
    totalPoints: 20 + id,
    minutes: 90,
    goalsScored: 0,
    assists: 0,
    form: 3 + (id % 5) * 0.5,
    selectedByPercent: 10,
    ...overrides,
  }
}

describe('buildEliteLpPool', () => {
  it('maps ownership rows to hindsight players with the chosen objective score', () => {
    const snapshot: SeasonSnapshot = {
      meta: {
        seasonId: '2026-27',
        kind: 'current',
        fetchedAt: 0,
        sourceRevision: 'test',
        etags: {},
        playerCount: 2,
        teamCount: 2,
        fixtureCount: 0,
        performanceCount: 0,
      },
      players: [player(1, { form: 6.5, totalPoints: 40 }), player(2, { form: 2, totalPoints: 10 })],
      teams: [
        {
          seasonId: '2026-27',
          id: 2,
          code: 2,
          name: 'Arsenal',
          shortName: 'ARS',
          strength: 1,
          strengthAttackHome: 1,
          strengthAttackAway: 1,
          strengthDefenceHome: 1,
          strengthDefenceAway: 1,
        },
        {
          seasonId: '2026-27',
          id: 3,
          code: 3,
          name: 'Villa',
          shortName: 'AVL',
          strength: 1,
          strengthAttackHome: 1,
          strengthAttackAway: 1,
          strengthDefenceHome: 1,
          strengthDefenceAway: 1,
        },
      ],
      fixtures: [],
      performances: [],
    }

    const rows: EliteGwOwnershipRow[] = [
      {
        elementId: 1,
        count: 10,
        ownership: 0.5,
        sampleSize: 20,
        xiCount: 8,
        benchCount: 2,
        captainCount: 3,
        captaincy: 0.15,
      },
      {
        elementId: 2,
        count: 4,
        ownership: 0.2,
        sampleSize: 20,
        xiCount: 2,
        benchCount: 2,
        captainCount: 0,
        captaincy: 0,
      },
    ]

    const formPool = buildEliteLpPool(rows, snapshot, 2, 'form')
    expect(formPool).toHaveLength(2)
    expect(formPool.find((row) => row.playerId === 1)?.gwPoints).toBe(6.5)

    const totalPool = buildEliteLpPool(rows, snapshot, 2, 'totalPoints')
    expect(totalPool.find((row) => row.playerId === 1)?.gwPoints).toBe(40)
  })
})

describe('objectiveScoreLabel', () => {
  it('labels known objectives', () => {
    expect(objectiveScoreLabel('form')).toBe('Form')
    expect(objectiveScoreLabel('prevGwPoints')).toBe('Last GW points')
  })
})
