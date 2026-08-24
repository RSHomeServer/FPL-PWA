import { isUserStateFresh, isUserStateStale, USER_STATE_TTL_MS } from './cachePolicy'
import { getFplCacheDb } from './db'
import { FplLiveFetchError, loadOfficialLiveSnapshot, type FetchLike } from './fplLiveSource'
import {
  fetchManagerState,
  fetchManagerTransfers,
  joinSquadPickCodes,
} from './fplUserSource'
import type {
  LoadedUserState,
  ManagerEntrySummary,
  ManagerGameweekPicks,
  ManagerHistory,
  ManagerSnapshot,
  UserHistoryRecord,
  UserPicksRawJson,
  UserPicksRecord,
  UserProfileRecord,
  UserTransfersRecord,
} from './types'

export type RefreshUserStateOptions = {
  force?: boolean
  event?: number
  fetchImpl?: FetchLike
  now?: number
}

export type LoadUserStateOptions = {
  event?: number
  triggerBackgroundRefresh?: boolean
  fetchImpl?: FetchLike
  now?: number
}

export { isUserStateStale, USER_STATE_TTL_MS }

export function userPicksCompoundKey(entryId: number, event: number): [number, number] {
  return [entryId, event]
}

/**
 * Read the configured entry ID from Dexie (`userProfile` holds a single active row).
 */
export async function readConfiguredEntryId(): Promise<number | null> {
  const profiles = await getFplCacheDb().userProfile.toArray()
  if (!profiles.length) return null
  const latest = profiles.reduce((best, row) =>
    row.configuredAt > best.configuredAt ? row : best,
  )
  return latest.entryId
}

/**
 * Fetch manager state from the official API and persist actual squad stores.
 * Only `refreshUserState` writes `userProfile`, `userPicks`, `userHistory`, and
 * `userTransfers` — hypothetical transfer scenarios use `transferScenarios` later.
 */
export async function refreshUserState(
  entryId: number,
  options?: RefreshUserStateOptions,
): Promise<ManagerSnapshot> {
  const now = options?.now ?? Date.now()
  const fetchImpl = options?.fetchImpl ?? fetch
  const cache = getFplCacheDb()

  if (!options?.force) {
    const profile = await cache.userProfile.get(entryId)
    if (profile && isUserStateFresh(profile.lastRefreshAt, now)) {
      const cached = await assembleSnapshotFromStores(entryId, options?.event)
      if (cached) return cached.snapshot
    }
  }

  try {
    const [managerSnapshot, transfers, live] = await Promise.all([
      fetchManagerState(entryId, options?.event, fetchImpl),
      fetchManagerTransfers(entryId, fetchImpl),
      loadOfficialLiveSnapshot({ fetchImpl, force: false, now }),
    ])
    const codeByElementId = new Map(live.players.map((player) => [player.id, player.code]))
    const picksWithCodes = joinSquadPickCodes(managerSnapshot.picks.picks, codeByElementId)
    const snapshot: ManagerSnapshot = {
      ...managerSnapshot,
      picks: { ...managerSnapshot.picks, picks: picksWithCodes },
      fetchedAt: now,
    }
    await persistUserState(snapshot, transfers, now)
    return snapshot
  } catch (error) {
    const cached = await assembleSnapshotFromStores(entryId, options?.event)
    if (cached && !options?.force) return cached.snapshot
    if (error instanceof FplLiveFetchError || error instanceof Error) {
      throw error
    }
    throw new Error('Failed to refresh manager state.', { cause: error })
  }
}

/**
 * Read manager state from Dexie. When stale, optionally triggers a background refresh
 * without blocking the return value.
 */
export async function loadUserState(
  entryId: number,
  options?: LoadUserStateOptions,
): Promise<LoadedUserState | null> {
  const now = options?.now ?? Date.now()
  const assembled = await assembleSnapshotFromStores(entryId, options?.event)
  if (!assembled) return null

  const profile = await getFplCacheDb().userProfile.get(entryId)
  const stale = isUserStateStale(profile?.lastRefreshAt, now)

  if (options?.triggerBackgroundRefresh && stale) {
    void refreshUserState(entryId, {
      fetchImpl: options.fetchImpl,
      now,
      event: options.event,
    }).catch(() => {
      /* background refresh — caller already has cached snapshot */
    })
  }

  return {
    snapshot: assembled.snapshot,
    lastRefreshAt: profile?.lastRefreshAt ?? assembled.snapshot.fetchedAt,
    servingCached: false,
    refreshFailed: false,
  }
}

/**
 * On app boot: refresh configured entry when user state is stale (>30m).
 * Non-blocking — errors are swallowed.
 */
export async function bootRefreshUserStateIfStale(options?: {
  fetchImpl?: FetchLike
  now?: number
}): Promise<void> {
  const entryId = await readConfiguredEntryId()
  if (!entryId) return
  const profile = await getFplCacheDb().userProfile.get(entryId)
  if (!profile || !isUserStateStale(profile.lastRefreshAt, options?.now)) return
  try {
    await refreshUserState(entryId, {
      fetchImpl: options?.fetchImpl,
      now: options?.now,
      force: true,
    })
  } catch {
    /* stale-while-revalidate — cached squad remains in Dexie */
  }
}

/**
 * Load cached state after a failed refresh attempt and mark the result as offline/stale.
 */
export async function loadCachedUserStateAfterFailure(
  entryId: number,
  event?: number,
): Promise<LoadedUserState | null> {
  const assembled = await assembleSnapshotFromStores(entryId, event)
  if (!assembled) return null
  const profile = await getFplCacheDb().userProfile.get(entryId)
  return {
    snapshot: assembled.snapshot,
    lastRefreshAt: profile?.lastRefreshAt ?? assembled.snapshot.fetchedAt,
    servingCached: true,
    refreshFailed: true,
  }
}

async function assembleSnapshotFromStores(
  entryId: number,
  event?: number,
): Promise<{ snapshot: ManagerSnapshot } | null> {
  const cache = getFplCacheDb()
  const profile = await cache.userProfile.get(entryId)
  if (!profile) return null

  const resolvedEvent = event ?? profile.currentEvent
  const picksRow = await cache.userPicks.get(userPicksCompoundKey(entryId, resolvedEvent))
  const historyRow = await cache.userHistory.get(entryId)
  if (!picksRow || !historyRow) return null

  const entry = profileToEntrySummary(profile)
  const picks: ManagerGameweekPicks = {
    entryId,
    event: picksRow.event,
    picks: picksRow.picks,
    entryHistory: picksRow.entryHistory,
    activeChip: picksRow.activeChip,
    automaticSubs: picksRow.automaticSubs,
  }
  const history: ManagerHistory = {
    current: historyRow.current,
    chips: historyRow.chips,
  }
  const fetchedAt = Math.min(picksRow.fetchedAt, historyRow.fetchedAt, profile.lastRefreshAt)
  return {
    snapshot: { entry, picks, history, event: picksRow.event, fetchedAt },
  }
}

async function persistUserState(
  snapshot: ManagerSnapshot,
  transfers: UserTransfersRecord['transfers'],
  now: number,
): Promise<void> {
  const cache = getFplCacheDb()
  const existingProfile = await cache.userProfile.get(snapshot.entry.identity.entryId)
  const configuredAt = existingProfile?.configuredAt ?? now

  const profile: UserProfileRecord = {
    entryId: snapshot.entry.identity.entryId,
    teamName: snapshot.entry.identity.teamName,
    playerFirstName: snapshot.entry.identity.playerFirstName,
    playerLastName: snapshot.entry.identity.playerLastName,
    startedEvent: snapshot.entry.startedEvent,
    currentEvent: snapshot.entry.currentEvent,
    summaryOverallPoints: snapshot.entry.summaryOverallPoints,
    summaryOverallRank: snapshot.entry.summaryOverallRank,
    lastDeadlineBankTenths: snapshot.entry.lastDeadlineBankTenths,
    lastDeadlineValueTenths: snapshot.entry.lastDeadlineValueTenths,
    configuredAt,
    lastRefreshAt: now,
  }

  const rawJson: UserPicksRawJson = {
    picks: snapshot.picks.picks,
    entry_history: snapshot.picks.entryHistory,
    active_chip: snapshot.picks.activeChip,
    automatic_subs: snapshot.picks.automaticSubs,
  }

  const picksRecord: UserPicksRecord = {
    entryId: snapshot.entry.identity.entryId,
    event: snapshot.picks.event,
    picks: snapshot.picks.picks,
    rawJson,
    entryHistory: snapshot.picks.entryHistory,
    activeChip: snapshot.picks.activeChip,
    automaticSubs: snapshot.picks.automaticSubs,
    fetchedAt: now,
  }

  const historyRecord: UserHistoryRecord = {
    entryId: snapshot.entry.identity.entryId,
    current: snapshot.history.current,
    chips: snapshot.history.chips,
    fetchedAt: now,
  }

  const transfersRecord: UserTransfersRecord = {
    entryId: snapshot.entry.identity.entryId,
    transfers,
    fetchedAt: now,
  }

  await cache.transaction(
    'rw',
    cache.userProfile,
    cache.userPicks,
    cache.userHistory,
    cache.userTransfers,
    async () => {
      await cache.userProfile.clear()
      await cache.userProfile.put(profile)
      await cache.userPicks.put(picksRecord)
      await cache.userHistory.put(historyRecord)
      await cache.userTransfers.put(transfersRecord)
    },
  )
}

function profileToEntrySummary(profile: UserProfileRecord): ManagerEntrySummary {
  return {
    identity: {
      entryId: profile.entryId,
      teamName: profile.teamName,
      playerFirstName: profile.playerFirstName,
      playerLastName: profile.playerLastName,
    },
    startedEvent: profile.startedEvent,
    currentEvent: profile.currentEvent,
    summaryOverallPoints: profile.summaryOverallPoints,
    summaryOverallRank: profile.summaryOverallRank,
    lastDeadlineBankTenths: profile.lastDeadlineBankTenths,
    lastDeadlineValueTenths: profile.lastDeadlineValueTenths,
  }
}
