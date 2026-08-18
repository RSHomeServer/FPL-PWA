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
} from './types'

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
}

let db: FplCacheDb | null = null

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
    ],
  }) as FplCacheDb
  return db
}
