import { beforeEach, describe, expect, it, vi } from 'vitest'
import entryFixture from './__fixtures__/manager/entry-1.json'
import historyFixture from './__fixtures__/manager/history-1.json'
import picksFixture from './__fixtures__/manager/picks-gw1.json'
import transfersEmptyFixture from './__fixtures__/manager/transfers-empty.json'
import { USER_STATE_TTL_MS, isUserStateStale } from './cachePolicy'
import { getFplCacheDb, resetFplCacheDbForTests } from './db'
import { mapOfficialBootstrap } from './fplLiveSource'
import {
  bootRefreshUserStateIfStale,
  loadCachedUserStateAfterFailure,
  loadUserState,
  readConfiguredEntryId,
  refreshUserState,
  userPicksCompoundKey,
} from './userStateRefresh'

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
      id: 426,
      code: 999001,
      first_name: 'Test',
      second_name: 'Captain',
      web_name: 'Captain',
      team: 1,
      team_code: 3,
      element_type: 3,
      now_cost: 80,
      cost_change_start: 0,
      total_points: 0,
      minutes: 0,
      goals_scored: 0,
      assists: 0,
      form: '0.0',
      selected_by_percent: '0.0',
      status: 'a',
      news: '',
      chance_of_playing_this_round: null,
      chance_of_playing_next_round: null,
      ep_next: '0.0',
      can_select: true,
    },
  ],
}

function managerFetchImpl() {
  return vi.fn(async (url: string) => {
    if (url.includes('/transfers/')) {
      return new Response(JSON.stringify(transfersEmptyFixture), { status: 200 })
    }
    if (url.includes('/history/')) {
      return new Response(JSON.stringify(historyFixture), { status: 200 })
    }
    if (url.includes('/picks/')) {
      return new Response(JSON.stringify(picksFixture), { status: 200 })
    }
    return new Response(JSON.stringify(entryFixture), { status: 200 })
  })
}

function createCombinedFetchImpl() {
  const manager = managerFetchImpl()
  const live = liveFetchImpl()
  return vi.fn(async (url: string) => {
    if (url.includes('bootstrap-static') || url.includes('/fixtures/')) {
      return live(url)
    }
    return manager(url)
  })
}

function liveFetchImpl() {
  return vi.fn(async (url: string) => {
    if (url.includes('/fixtures/')) return new Response(JSON.stringify([]), { status: 200 })
    return new Response(JSON.stringify(bootstrap), { status: 200 })
  })
}

async function seedLivePlayers(): Promise<void> {
  const cache = getFplCacheDb()
  const mapped = mapOfficialBootstrap(bootstrap, 1_700_000_000_000)
  await cache.liveMeta.put({ ...mapped.meta, fixtureCount: 0 })
  await cache.livePlayers.bulkPut(mapped.players)
  await cache.liveTeams.bulkPut(mapped.teams)
}

describe('isUserStateStale', () => {
  it('treats data within TTL as fresh and beyond as stale', () => {
    const now = 1_700_000_000_000
    expect(isUserStateStale(now - USER_STATE_TTL_MS + 1, now)).toBe(false)
    expect(isUserStateStale(now - USER_STATE_TTL_MS, now)).toBe(true)
    expect(isUserStateStale(undefined, now)).toBe(true)
  })
})

describe('refreshUserState', () => {
  beforeEach(async () => {
    await resetFplCacheDbForTests()
    await seedLivePlayers()
  })

  it('writes all four user stores without touching live vaastav tables', async () => {
    const fetchImpl = createCombinedFetchImpl()

    await getFplCacheDb().players.put({
      seasonId: '2025-26',
      id: 99,
      code: 123,
      firstName: 'Vaastav',
      secondName: 'Only',
      webName: 'Vaastav',
      teamId: 1,
      position: 'MID',
      nowCostTenths: 50,
      totalPoints: 0,
      minutes: 0,
      goalsScored: 0,
      assists: 0,
      form: 0,
      selectedByPercent: 0,
    })

    const livePlayerCountBefore = await getFplCacheDb().livePlayers.count()
    const vaastavPlayerCountBefore = await getFplCacheDb().players.count()

    const snapshot = await refreshUserState(1, {
      force: true,
      fetchImpl,
      now: 1_700_000_000_000,
    })

    expect(snapshot.entry.identity.entryId).toBe(1)
    expect(snapshot.picks.picks).toHaveLength(15)
    expect(snapshot.picks.picks.find((pick) => pick.elementId === 426)?.code).toBe(999001)

    const cache = getFplCacheDb()
    expect(await cache.userProfile.get(1)).toMatchObject({
      entryId: 1,
      lastRefreshAt: 1_700_000_000_000,
    })
    expect(await cache.userPicks.get(userPicksCompoundKey(1, 1))).toBeTruthy()
    expect(await cache.userHistory.get(1)).toBeTruthy()
    expect(await cache.userTransfers.get(1)).toBeTruthy()
    expect(await cache.transferScenarios.count()).toBe(0)

    expect(await cache.livePlayers.count()).toBe(livePlayerCountBefore)
    expect(await cache.players.count()).toBe(vaastavPlayerCountBefore)
  })

  it('is idempotent — double refresh overwrites the same keys', async () => {
    const fetchImpl = createCombinedFetchImpl()

    await refreshUserState(1, { force: true, fetchImpl, now: 1_700_000_000_000 })
    await refreshUserState(1, { force: true, fetchImpl, now: 1_700_000_100_000 })

    const cache = getFplCacheDb()
    expect(await cache.userProfile.count()).toBe(1)
    expect(await cache.userPicks.count()).toBe(1)
    expect(await cache.userHistory.count()).toBe(1)
    expect(await cache.userTransfers.count()).toBe(1)
    expect((await cache.userProfile.get(1))?.lastRefreshAt).toBe(1_700_000_100_000)
  })

  it('returns cached snapshot without fetching when still fresh and not forcing', async () => {
    const fetchImpl = createCombinedFetchImpl()

    await refreshUserState(1, { force: true, fetchImpl, now: 1_700_000_000_000 })

    const failingFetch = vi.fn(async () => new Response('down', { status: 503 }))
    const snapshot = await refreshUserState(1, {
      force: false,
      fetchImpl: failingFetch,
      now: 1_700_000_000_000 + 60_000,
    })

    expect(snapshot.entry.identity.teamName).toBe('Solio Moose')
    expect(failingFetch).not.toHaveBeenCalled()
  })

  it('returns cached snapshot after failed fetch when not forcing', async () => {
    const fetchImpl = createCombinedFetchImpl()
    await refreshUserState(1, { force: true, fetchImpl, now: 1_700_000_000_000 })

    const failingFetch = vi.fn(async () => new Response('down', { status: 503 }))
    const snapshot = await refreshUserState(1, {
      force: false,
      fetchImpl: failingFetch,
      now: 1_700_000_000_000 + USER_STATE_TTL_MS + 1,
    })

    expect(snapshot.entry.identity.teamName).toBe('Solio Moose')
    expect(failingFetch).toHaveBeenCalled()
  })

  it('throws on forced failure without cache', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }))
    await expect(
      refreshUserState(9_999_999, { force: true, fetchImpl, now: 1_700_000_000_000 }),
    ).rejects.toThrow(/HTTP 503|failed/i)
  })
})

describe('loadCachedUserStateAfterFailure', () => {
  beforeEach(async () => {
    await resetFplCacheDbForTests()
    await seedLivePlayers()
  })

  it('returns cached snapshot with offline flags after refresh failure', async () => {
    const fetchImpl = createCombinedFetchImpl()

    await refreshUserState(1, { force: true, fetchImpl, now: 1_700_000_000_000 })

    try {
      await refreshUserState(1, {
        force: true,
        fetchImpl: vi.fn(async () => new Response('down', { status: 503 })),
        now: 1_700_000_100_000,
      })
    } catch {
      /* expected */
    }

    const cached = await loadCachedUserStateAfterFailure(1)
    expect(cached).not.toBeNull()
    expect(cached?.servingCached).toBe(true)
    expect(cached?.refreshFailed).toBe(true)
    expect(cached?.snapshot.picks.picks).toHaveLength(15)
  })
})

describe('readConfiguredEntryId and boot refresh', () => {
  beforeEach(async () => {
    await resetFplCacheDbForTests()
    await seedLivePlayers()
  })

  it('reads configured entry and skips boot refresh when fresh', async () => {
    const fetchImpl = createCombinedFetchImpl()

    await refreshUserState(1, { force: true, fetchImpl, now: 1_700_000_000_000 })
    expect(await readConfiguredEntryId()).toBe(1)

    await bootRefreshUserStateIfStale({
      fetchImpl,
      now: 1_700_000_000_000 + 60_000,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('boot refresh fetches when stale', async () => {
    const fetchImpl = createCombinedFetchImpl()

    await refreshUserState(1, { force: true, fetchImpl, now: 1_700_000_000_000 })

    await bootRefreshUserStateIfStale({
      fetchImpl,
      now: 1_700_000_000_000 + USER_STATE_TTL_MS + 1,
    })

    expect(fetchImpl.mock.calls.length).toBeGreaterThan(4)
  })
})

describe('loadUserState', () => {
  beforeEach(async () => {
    await resetFplCacheDbForTests()
    await seedLivePlayers()
  })

  it('loads assembled snapshot from Dexie', async () => {
    const fetchImpl = createCombinedFetchImpl()

    await refreshUserState(1, { force: true, fetchImpl, now: 1_700_000_000_000 })
    const loaded = await loadUserState(1)
    expect(loaded?.snapshot.history.current.length).toBe(1)
    expect(loaded?.lastRefreshAt).toBe(1_700_000_000_000)
  })
})
