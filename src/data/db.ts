import {
  createSongaraDb,
  songaraDbName,
  type Table,
} from '@songara/pwa-base/preview/dexie'
import type {
  FplFixture,
  FplLiveEvent,
  FplLivePlayer,
  FplPerformance,
  FplPlayer,
  FplTeam,
  LiveCacheMeta,
  Gw0SquadPinsRecord,
  RoleEvidenceRecord,
  SeasonCacheMeta,
  TransferScenarioRecord,
  UserHistoryRecord,
  UserPicksRecord,
  UserProfileRecord,
  UserTransfersRecord,
} from './types'
import type { PerfectDynamicCacheRecord, PerfectStaticCacheRecord } from './perfectTeamCache'

export type CatalogRecord = {
  id: 'seasons'
  seasonIds: string[]
  fetchedAt: number
  sourceRevision: string
}

export type FplCacheDb = ReturnType<typeof createSongaraDb> & {
  catalog: Table<CatalogRecord>
  seasons: Table<SeasonCacheMeta>
  players: Table<FplPlayer>
  teams: Table<FplTeam>
  fixtures: Table<FplFixture>
  performances: Table<FplPerformance>
  liveMeta: Table<LiveCacheMeta>
  livePlayers: Table<FplLivePlayer>
  liveTeams: Table<FplTeam>
  liveFixtures: Table<FplFixture>
  liveEvents: Table<FplLiveEvent>
  roleEvidence: Table<RoleEvidenceRecord>
  gw0SquadPins: Table<Gw0SquadPinsRecord>
  perfectDynamic: Table<PerfectDynamicCacheRecord>
  perfectStatic: Table<PerfectStaticCacheRecord>
  userProfile: Table<UserProfileRecord>
  userPicks: Table<UserPicksRecord, [number, number]>
  userHistory: Table<UserHistoryRecord>
  userTransfers: Table<UserTransfersRecord>
  transferScenarios: Table<TransferScenarioRecord>
}

let db: FplCacheDb | null = null

/** Test helper: close and reset the singleton so each test gets a fresh schema. */
export async function resetFplCacheDbForTests(): Promise<void> {
  if (db) {
    await db.delete()
    db = null
  }
}

export function getFplCacheDb(): FplCacheDb {
  if (db) return db
  db = createSongaraDb({
    name: songaraDbName('fpl', 'vaastav'),
    versions: [
      {
        version: 1,
        stores: {
          catalog: 'id',
          seasons: 'seasonId',
          players: '[seasonId+id], seasonId, teamId',
          teams: '[seasonId+id], seasonId',
          fixtures: '[seasonId+id], seasonId, event',
          performances: '[seasonId+playerId+round+fixture], seasonId, playerId, round',
        },
      },
      {
        version: 2,
        stores: {
          liveMeta: 'id',
          livePlayers: 'id, code, teamId',
          liveTeams: 'id',
          liveFixtures: 'id, event',
          liveEvents: 'id',
        },
      },
      {
        version: 3,
        stores: {
          roleEvidence: 'code, liveId',
        },
      },
      {
        version: 4,
        stores: {
          gw0SquadPins: 'id',
        },
      },
      {
        version: 5,
        stores: {
          perfectDynamic: 'id, seasonId',
          perfectStatic: 'id, seasonId, round',
        },
      },
      {
        version: 6,
        stores: {
          userProfile: 'entryId',
          userPicks: '[entryId+event], entryId, event',
          userHistory: 'entryId',
          userTransfers: 'entryId',
          transferScenarios: 'id, entryId',
        },
      },
    ],
  }) as FplCacheDb
  return db
}
