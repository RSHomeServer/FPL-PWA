import { describe, expect, it } from 'vitest'
import {
  FPL_API_ORIGIN,
  FPL_BOOTSTRAP_PATH,
  FPL_BOOTSTRAP_URL,
  FPL_BROWSER_PROXY_PREFIX,
  FPL_FIXTURES_PATH,
  FPL_FIXTURES_URL,
  mapOfficialBootstrap,
  mapOfficialFixtures,
  officialApiUrl,
  parseLivePlayer,
  recordFromJson,
  seasonIdFromDeadline,
} from './fplLiveSource'
import { CURRENT_SEASON_TTL_MS, isLiveFresh } from './cachePolicy'
import { parseOptionalFloat } from './csv'

const bootstrap = {
  events: [
    {
      id: 1,
      name: 'Gameweek 1',
      deadline_time: '2026-08-21T17:30:00Z',
      is_next: true,
      is_current: false,
      finished: false,
    },
  ],
  teams: [
    {
      id: 1,
      code: 3,
      name: 'Arsenal',
      short_name: 'ARS',
      strength: null,
      strength_attack_home: 0,
      strength_attack_away: 0,
      strength_defence_home: 0,
      strength_defence_away: 0,
    },
  ],
  elements: [
    {
      id: 1,
      code: 154561,
      first_name: 'David',
      second_name: 'Raya Martín',
      web_name: 'Raya',
      team: 1,
      team_code: 3,
      element_type: 1,
      now_cost: 60,
      cost_change_start: 0,
      total_points: 162,
      minutes: 3330,
      goals_scored: 0,
      assists: 0,
      form: '0.0',
      selected_by_percent: '30.7',
      status: 'a',
      news: '',
      chance_of_playing_this_round: null,
      chance_of_playing_next_round: null,
      ep_next: '4.0',
      can_select: true,
    },
  ],
}

describe('official JSON mapping', () => {
  it('reuses parsePlayerRow fields and keeps GW0 extras', () => {
    const mapped = mapOfficialBootstrap(bootstrap, 1_700_000_000_000)
    expect(mapped.meta.seasonId).toBe('2026-27')
    expect(mapped.meta.nextEventId).toBe(1)
    expect(mapped.players).toHaveLength(1)
    const raya = mapped.players[0]
    expect(raya?.id).toBe(1)
    expect(raya?.code).toBe(154561)
    expect(raya?.position).toBe('GK')
    expect(raya?.nowCostTenths).toBe(60)
    expect(raya?.costChangeStart).toBe(0)
    expect(raya?.teamCode).toBe(3)
    expect(raya?.status).toBe('a')
    expect(raya?.epNext).toBe(4)
    expect(raya?.canSelect).toBe(true)
    expect(raya?.chanceOfPlayingNextRound).toBeNull()
  })

  it('maps fixtures through parseFixtureRow', () => {
    const fixtures = mapOfficialFixtures(
      [
        {
          id: 1,
          event: 1,
          kickoff_time: '2026-08-21T19:00:00Z',
          team_h: 1,
          team_a: 7,
          team_h_score: null,
          team_a_score: null,
          finished: false,
          team_h_difficulty: 2,
          team_a_difficulty: 5,
        },
      ],
      '2026-27',
    )
    expect(fixtures[0]?.event).toBe(1)
    expect(fixtures[0]?.teamHDifficulty).toBe(2)
    expect(fixtures[0]?.finished).toBe(false)
  })

  it('stringifies JSON values the same way CSV cells look', () => {
    expect(recordFromJson({ now_cost: 60, can_select: false, news: null })).toEqual({
      now_cost: '60',
      can_select: 'false',
      news: '',
    })
    expect(seasonIdFromDeadline('2026-08-21T17:30:00Z')).toBe('2026-27')
    expect(parseOptionalFloat('4.0')).toBe(4)
    expect(parseLivePlayer('2026-27', recordFromJson(bootstrap.elements[0]))?.epNext).toBe(4)
  })
})

describe('official API URLs', () => {
  it('keeps Node on the official origin and the browser on the Vite proxy', () => {
    expect(officialApiUrl(FPL_BOOTSTRAP_PATH, 'node')).toBe(FPL_BOOTSTRAP_URL)
    expect(officialApiUrl(FPL_FIXTURES_PATH, 'node')).toBe(FPL_FIXTURES_URL)
    expect(officialApiUrl(FPL_BOOTSTRAP_PATH, 'browser')).toBe(
      `${FPL_BROWSER_PROXY_PREFIX}${FPL_BOOTSTRAP_PATH}`,
    )
    expect(officialApiUrl(FPL_FIXTURES_PATH, 'browser')).toBe(
      `${FPL_BROWSER_PROXY_PREFIX}${FPL_FIXTURES_PATH}`,
    )
    expect(FPL_BOOTSTRAP_URL.startsWith(FPL_API_ORIGIN)).toBe(true)
  })
})

describe('live TTL', () => {
  it('reuses the 6h current-season window', () => {
    expect(
      isLiveFresh({
        id: 'current',
        seasonId: '2026-27',
        fetchedAt: Date.now() - CURRENT_SEASON_TTL_MS - 1,
        playerCount: 1,
        teamCount: 1,
        fixtureCount: 1,
        eventCount: 1,
        nextEventId: 1,
      }),
    ).toBe(false)
    expect(
      isLiveFresh({
        id: 'current',
        seasonId: '2026-27',
        fetchedAt: Date.now(),
        playerCount: 1,
        teamCount: 1,
        fixtureCount: 1,
        eventCount: 1,
        nextEventId: 1,
      }),
    ).toBe(true)
  })
})
