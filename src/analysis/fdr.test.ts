import { describe, expect, it } from 'vitest'
import { clubStatus, fitCleanSheetsByFdr, fitGoalsByFdr, invertAttackTable, isMonotoneDecreasing } from './fdr'
import type { LoadedSeason } from './loadSeason'
import type { FplFixture } from '../data/types'

describe('FDR tables', () => {
  it('fits goals vs FDR and normalises FDR 2 to 1.00', () => {
    const season = seasonWithFixtures([
      fixture({ teamHDifficulty: 1, teamADifficulty: 5, teamHScore: 3, teamAScore: 0 }),
      fixture({ teamHDifficulty: 2, teamADifficulty: 2, teamHScore: 2, teamAScore: 2 }),
      fixture({ teamHDifficulty: 5, teamADifficulty: 1, teamHScore: 0, teamAScore: 1 }),
    ])
    const goals = fitGoalsByFdr([season])
    expect(goals[2].factor).toBeCloseTo(1, 10)
    expect(goals[1].mean).toBeGreaterThan(goals[5].mean)
    expect(isMonotoneDecreasing(goals)).toBe(true)
  })

  it('treats missing team codes as unknown rather than transferred', () => {
    expect(clubStatus({ teamCode: 0, teamName: '' }, { teamCode: 0, teamName: '' })).toBe('unknown')
    expect(clubStatus({ teamCode: 3, teamName: 'Arsenal' }, { teamCode: 3, teamName: 'Arsenal' })).toBe('same')
    expect(clubStatus({ teamCode: 3, teamName: 'Arsenal' }, { teamCode: 14, teamName: 'Liverpool' })).toBe(
      'transferred',
    )
    expect(
      clubStatus(
        { teamCode: 0, teamName: 'Arsenal', teamShortName: 'ARS' },
        { teamCode: 0, teamName: 'Arsenal', teamShortName: 'ARS' },
      ),
    ).toBe('same')
  })

  it('fits clean sheets vs FDR (0-0 and 3-0 examples)', () => {
    const season = seasonWithFixtures([
      fixture({ teamHDifficulty: 1, teamADifficulty: 5, teamHScore: 3, teamAScore: 0 }),
      fixture({ teamHDifficulty: 5, teamADifficulty: 1, teamHScore: 0, teamAScore: 0 }),
    ])
    const cs = fitCleanSheetsByFdr([season])
    expect(cs[1].n + cs[5].n).toBe(4)
    const inverted = invertAttackTable(fitGoalsByFdr([season]))
    expect(inverted[2].factor).toBeCloseTo(1, 10)
  })
})

function fixture(partial: Partial<FplFixture>): FplFixture {
  return {
    seasonId: '2024-25',
    id: Math.floor(Math.random() * 10_000),
    event: 1,
    kickoffTime: '',
    teamH: 1,
    teamA: 2,
    teamHScore: 1,
    teamAScore: 0,
    finished: true,
    teamHDifficulty: 2,
    teamADifficulty: 2,
    ...partial,
  }
}

function seasonWithFixtures(fixtures: FplFixture[]): LoadedSeason {
  return {
    seasonId: '2024-25',
    players: [],
    teams: [],
    fixtures,
    performances: [],
    hasMergedGw: false,
    startsInferred: false,
  }
}
