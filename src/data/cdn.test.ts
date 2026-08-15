import { describe, expect, it } from 'vitest'
import { seasonFolderIds, vaastavCdnUrl } from './cdn'
import { CURRENT_SEASON_TTL_MS, isSeasonFresh, seasonKind } from './cachePolicy'

describe('cdn helpers', () => {
  it('builds jsDelivr GitHub URLs without cloning the repo', () => {
    expect(vaastavCdnUrl('data/2025-26/players_raw.csv')).toBe(
      'https://cdn.jsdelivr.net/gh/vaastav/Fantasy-Premier-League@master/data/2025-26/players_raw.csv',
    )
  })

  it('lists season folders through the current campaign', () => {
    const ids = seasonFolderIds(new Date('2026-08-15T00:00:00Z'))
    expect(ids[0]).toBe('2016-17')
    expect(ids.at(-1)).toBe('2026-27')
  })
})

describe('cache TTL', () => {
  it('treats the latest folder as current with a short TTL', () => {
    expect(seasonKind('2026-27', ['2024-25', '2025-26', '2026-27'])).toBe('current')
    expect(seasonKind('2025-26', ['2024-25', '2025-26', '2026-27'])).toBe('historical')
    expect(
      isSeasonFresh(
        {
          seasonId: '2026-27',
          kind: 'current',
          fetchedAt: Date.now() - CURRENT_SEASON_TTL_MS - 1,
          sourceRevision: 'abc',
          etags: {},
          playerCount: 1,
          teamCount: 1,
          fixtureCount: 0,
          performanceCount: 0,
        },
      ),
    ).toBe(false)
    expect(
      isSeasonFresh(
        {
          seasonId: '2024-25',
          kind: 'historical',
          fetchedAt: 0,
          sourceRevision: 'abc',
          etags: {},
          playerCount: 1,
          teamCount: 1,
          fixtureCount: 0,
          performanceCount: 0,
        },
      ),
    ).toBe(true)
  })
})
