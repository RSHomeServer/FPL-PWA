import {
  isCatalogFresh,
  isSeasonFresh,
  seasonKind,
} from './cachePolicy'
import { parseCsv } from './csv'
import {
  discoverPublishedSeasons,
  fetchVaastavFile,
  fetchVaastavRevision,
} from './cdn'
import { getFplCacheDb } from './db'
import {
  dedupePerformances,
  parseFixtureRow,
  parsePerformanceRow,
  parsePlayerRow,
  parseTeamRow,
} from './parse'
import type {
  FplFixture,
  FplPerformance,
  FplPlayer,
  FplTeam,
  SeasonCacheMeta,
  SeasonCatalogEntry,
  SeasonSnapshot,
} from './types'

export { CURRENT_SEASON_TTL_MS, isSeasonFresh, seasonKind } from './cachePolicy'

export async function loadSeasonCatalog(options?: {
  force?: boolean
}): Promise<SeasonCatalogEntry[]> {
  const cache = getFplCacheDb()
  const existing = await cache.catalog.get('seasons')
  if (!options?.force && isCatalogFresh(existing?.fetchedAt) && existing?.seasonIds.length) {
    return existing.seasonIds.map((seasonId) => ({
      seasonId,
      kind: seasonKind(seasonId, existing.seasonIds),
    }))
  }

  const seasonIds = await discoverPublishedSeasons()
  const sourceRevision = await fetchVaastavRevision()
  await cache.catalog.put({
    id: 'seasons',
    seasonIds,
    fetchedAt: Date.now(),
    sourceRevision,
  })
  return seasonIds.map((seasonId) => ({
    seasonId,
    kind: seasonKind(seasonId, seasonIds),
  }))
}

export async function loadSeasonSnapshot(
  seasonId: string,
  options?: { force?: boolean; kind?: SeasonCatalogEntry['kind'] },
): Promise<SeasonSnapshot> {
  const cache = getFplCacheDb()
  const meta = await cache.seasons.get(seasonId)
  if (!options?.force && isSeasonFresh(meta)) {
    const [players, teams, fixtures, performances] = await Promise.all([
      cache.players.where('seasonId').equals(seasonId).toArray(),
      cache.teams.where('seasonId').equals(seasonId).toArray(),
      cache.fixtures.where('seasonId').equals(seasonId).toArray(),
      cache.performances.where('seasonId').equals(seasonId).toArray(),
    ])
    const needsTeamCodes = teams.some((team) => typeof team.code !== 'number')
    if (!needsTeamCodes) {
      return { meta: meta as SeasonCacheMeta, players, teams, fixtures, performances }
    }
  }

  return ingestSeason(seasonId, options?.kind ?? meta?.kind ?? 'historical')
}

async function ingestSeason(
  seasonId: string,
  kind: SeasonCatalogEntry['kind'],
): Promise<SeasonSnapshot> {
  const prefix = `data/${seasonId}`
  const [playersFile, teamsFile, fixturesFile, gwFile, revision] = await Promise.all([
    fetchVaastavFile(`${prefix}/players_raw.csv`),
    fetchVaastavFile(`${prefix}/teams.csv`),
    fetchVaastavFile(`${prefix}/fixtures.csv`),
    fetchVaastavFile(`${prefix}/gws/merged_gw.csv`),
    fetchVaastavRevision(),
  ])

  if (!playersFile.ok) {
    throw new Error(`Vaastav players_raw.csv missing for ${seasonId} (HTTP ${playersFile.status})`)
  }

  const players = parseCsv(playersFile.text)
    .map((row) => parsePlayerRow(seasonId, row))
    .filter((row): row is FplPlayer => row !== null)

  const teams = teamsFile.ok
    ? parseCsv(teamsFile.text)
        .map((row) => parseTeamRow(seasonId, row))
        .filter((row): row is FplTeam => row !== null)
    : []

  const fixtures = fixturesFile.ok
    ? parseCsv(fixturesFile.text)
        .map((row) => parseFixtureRow(seasonId, row))
        .filter((row): row is FplFixture => row !== null)
    : []

  const performances = gwFile.ok
    ? dedupePerformances(
        parseCsv(gwFile.text)
          .map((row) => parsePerformanceRow(seasonId, row))
          .filter((row): row is FplPerformance => row !== null),
      )
    : []

  const derivedTeams =
    teams.length > 0 ? teams : deriveTeamsFromPerformances(seasonId, performances)

  const etags: Record<string, string> = {}
  for (const file of [playersFile, teamsFile, fixturesFile, gwFile]) {
    if (file.etag) etags[file.path] = file.etag
  }

  const meta: SeasonCacheMeta = {
    seasonId,
    kind,
    fetchedAt: Date.now(),
    sourceRevision: revision,
    etags,
    playerCount: players.length,
    teamCount: derivedTeams.length,
    fixtureCount: fixtures.length,
    performanceCount: performances.length,
  }

  const cache = getFplCacheDb()
  await cache.transaction(
    'rw',
    cache.seasons,
    cache.players,
    cache.teams,
    cache.fixtures,
    cache.performances,
    async () => {
      await Promise.all([
        cache.players.where('seasonId').equals(seasonId).delete(),
        cache.teams.where('seasonId').equals(seasonId).delete(),
        cache.fixtures.where('seasonId').equals(seasonId).delete(),
        cache.performances.where('seasonId').equals(seasonId).delete(),
      ])
      await cache.seasons.put(meta)
      if (players.length) await cache.players.bulkPut(players)
      if (derivedTeams.length) await cache.teams.bulkPut(derivedTeams)
      if (fixtures.length) await cache.fixtures.bulkPut(fixtures)
      if (performances.length) await cache.performances.bulkPut(performances)
    },
  )

  return {
    meta,
    players,
    teams: derivedTeams,
    fixtures,
    performances,
  }
}

function deriveTeamsFromPerformances(
  seasonId: string,
  rows: readonly FplPerformance[],
): FplTeam[] {
  const names = new Map<string, string>()
  for (const row of rows) {
    if (row.teamName) names.set(row.teamName, row.teamName)
  }
  return [...names.values()].map((name, index) => ({
    seasonId,
    id: index + 1,
    code: 0,
    name,
    shortName: name.slice(0, 3).toUpperCase(),
    strength: 0,
    strengthAttackHome: 0,
    strengthAttackAway: 0,
    strengthDefenceHome: 0,
    strengthDefenceAway: 0,
  }))
}
