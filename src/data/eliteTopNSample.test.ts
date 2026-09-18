import { describe, expect, it } from 'vitest'
import { parseClassicLeagueStandingsPage } from './fplLeagueSource'
import { buildGameweekSquadFromPicks, pickLargestLeagues } from './eliteTopNSample'
import { eliteEntriesToDictionary } from './eliteEntryStore'
import type { EliteEntryRecord } from './types'

describe('parseClassicLeagueStandingsPage', () => {
  it('parses Overall standings page shape', () => {
    const page = parseClassicLeagueStandingsPage({
      league: { id: 314, name: 'Overall', league_type: 's', scoring: 'c' },
      standings: {
        has_next: true,
        page: 1,
        results: [
          {
            entry: 895045,
            entry_name: 'Giant Wise Owls',
            player_name: 'Jasper Selvaraj',
            rank: 1,
            last_rank: 2,
            total: 405,
            event_total: 99,
          },
        ],
      },
      last_updated_data: '2026-09-17T20:00:00Z',
      new_entries: {},
    })
    expect(page.leagueId).toBe(314)
    expect(page.leagueName).toBe('Overall')
    expect(page.results[0]?.entryId).toBe(895045)
    expect(page.results[0]?.rank).toBe(1)
    expect(page.hasNext).toBe(true)
  })
})

describe('pickLargestLeagues', () => {
  it('prefers overall / event-1 / sky / england when present', () => {
    const picked = pickLargestLeagues(
      [
        { leagueId: 99, leagueName: 'Tiny', shortName: null, rankCount: 10, leagueType: 'x' },
        { leagueId: 261, leagueName: 'England', shortName: 'region-241', rankCount: 2_000_000, leagueType: 's' },
        { leagueId: 314, leagueName: 'Overall', shortName: 'overall', rankCount: 10_000_000, leagueType: 's' },
        { leagueId: 317, leagueName: 'Sky Sports League', shortName: 'brd-skysports', rankCount: 3_000_000, leagueType: 's' },
        { leagueId: 276, leagueName: 'Gameweek 1', shortName: 'event-1', rankCount: 8_000_000, leagueType: 's' },
      ],
      4,
    )
    expect(picked.map((row) => row.shortName)).toEqual([
      'overall',
      'event-1',
      'brd-skysports',
      'region-241',
    ])
  })
})

describe('buildGameweekSquadFromPicks', () => {
  it('splits XI/bench and finds C/VC', () => {
    const picks = Array.from({ length: 15 }, (_, index) => ({
      elementId: index + 1,
      position: index + 1,
      isCaptain: index === 0,
      isViceCaptain: index === 1,
    }))
    const squad = buildGameweekSquadFromPicks({
      gw: 3,
      picks,
      activeChip: '3xc',
      historyChips: ['3xc'],
      points: 90,
      overallRank: 2,
    })
    expect(squad.xi).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(squad.bench).toEqual([12, 13, 14, 15])
    expect(squad.captainElementId).toBe(1)
    expect(squad.viceCaptainElementId).toBe(2)
    expect(squad.activeChip).toBe('3xc')
  })
})

describe('eliteEntriesToDictionary', () => {
  it('flattens to teamId / leagues / gameweek arrays', () => {
    const entries: EliteEntryRecord[] = [
      {
        entryId: 42,
        entryName: 'Test',
        playerName: 'A B',
        totalPoints: 300,
        leagues: [
          { leagueId: 314, leagueName: 'Overall', position: 10 },
          { leagueId: 261, leagueName: 'England', position: 4 },
        ],
        gameweeks: [
          {
            gw: 1,
            xi: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            bench: [12, 13, 14, 15],
            captainElementId: 9,
            viceCaptainElementId: 8,
            activeChip: 'bboost',
            historyChips: ['bboost'],
            points: 80,
            overallRank: 100,
          },
        ],
        fetchedAt: 1,
      },
    ]
    const dict = eliteEntriesToDictionary(entries)
    expect(dict[42]?.teamId).toBe(42)
    expect(dict[42]?.leagues).toEqual([
      [314, 'Overall', 10],
      [261, 'England', 4],
    ])
    expect(dict[42]?.gameweeks[1]?.captain).toBe(9)
    expect(dict[42]?.gameweeks[1]?.activeChip).toBe('bboost')
  })
})
