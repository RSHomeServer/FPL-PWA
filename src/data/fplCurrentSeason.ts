import { CURRENT_SEASON_TTL_MS, isSeasonFresh } from './cachePolicy'
import { getFplCacheDb } from './db'
import {
  FPL_EVENT_LIVE_PATH,
  countByRound,
  parseEventLivePayload,
  performanceFromEventLive,
  roundsCovered,
} from './fplEventLive'
import {
  type FetchLike,
  fetchOfficialJson,
  fetchOfficialLiveSnapshot,
  loadOfficialLiveSnapshot,
  officialApiUrl,
} from './fplLiveSource'
import type {
  FplFixture,
  FplLiveEvent,
  FplLivePlayer,
  FplPerformance,
  FplPlayer,
  SeasonCacheMeta,
  SeasonSnapshot,
} from './types'

export type CurrentSeasonBuildProgress = {
  gw: number
  total: number
  message: string
}

/**
 * Build / refresh the current-season snapshot from the official FPL API
 * (bootstrap + fixtures + `/api/event/{gw}/live/` for finished and current GWs).
 * Historical seasons stay on Vaastav via `ingest.ts`.
 */
export async function loadCurrentSeasonSnapshot(options?: {
  force?: boolean
  fetchImpl?: FetchLike
  now?: number
  seasonId?: string
  onProgress?: (progress: CurrentSeasonBuildProgress) => void
}): Promise<SeasonSnapshot> {
  const now = options?.now ?? Date.now()
  const fetchImpl = options?.fetchImpl ?? fetch
  const live =
    typeof document === 'undefined'
      ? await fetchOfficialLiveSnapshot(fetchImpl, now)
      : await loadOfficialLiveSnapshot({ force: options?.force, fetchImpl, now })

  const seasonId = options?.seasonId || live.meta.seasonId
  const targetGws = targetEventIds(live.events)
  const cache = getFplCacheDb()
  const existing = await cache.seasons.get(seasonId)

  if (!options?.force && existing?.dataSource === 'fpl-api' && isSeasonFresh(existing, now)) {
    const [players, teams, fixtures, performances] = await Promise.all([
      cache.players.where('seasonId').equals(seasonId).toArray(),
      cache.teams.where('seasonId').equals(seasonId).toArray(),
      cache.fixtures.where('seasonId').equals(seasonId).toArray(),
      cache.performances.where('seasonId').equals(seasonId).toArray(),
    ])
    const covered = new Set(roundsCovered(performances))
    const complete = targetGws.every((gw) => covered.has(gw))
    if (complete && players.length && performances.length) {
      return {
        meta: existing,
        players,
        teams,
        fixtures,
        performances,
      }
    }
  }

  options?.onProgress?.({
    gw: 0,
    total: targetGws.length,
    message: `Fetching live stats for ${targetGws.length} gameweek(s)…`,
  })

  const playersById = new Map(live.players.map((player) => [player.id, player]))
  const teamsById = new Map(live.teams.map((team) => [team.id, team]))
  const fixturesById = new Map(live.fixtures.map((fixture) => [fixture.id, fixture]))
  const fixturesByEvent = groupFixturesByEvent(live.fixtures)

  const performances: FplPerformance[] = []
  for (let index = 0; index < targetGws.length; index += 1) {
    const gw = targetGws[index]!
    options?.onProgress?.({
      gw,
      total: targetGws.length,
      message: `Loading GW${gw} live (${index + 1}/${targetGws.length})…`,
    })
    const payload = await fetchOfficialJson(officialApiUrl(FPL_EVENT_LIVE_PATH(gw)), fetchImpl)
    const elements = parseEventLivePayload(payload)
    const eventFixtures = fixturesByEvent.get(gw) ?? []
    for (const element of elements) {
      const player = playersById.get(element.id)
      const team = player ? teamsById.get(player.teamId) : undefined
      performances.push(
        performanceFromEventLive(
          seasonId,
          gw,
          element,
          player,
          team,
          fixturesById,
          eventFixtures,
        ),
      )
    }
  }

  const players: FplPlayer[] = live.players.map(stripLiveFields)
  const fixtures = live.fixtures.map((fixture) =>
    fixture.seasonId === seasonId ? fixture : { ...fixture, seasonId },
  )
  const teams = live.teams.map((team) => (team.seasonId === seasonId ? team : { ...team, seasonId }))

  const maxGw = targetGws.at(-1) ?? 0
  const meta: SeasonCacheMeta = {
    seasonId,
    kind: 'current',
    dataSource: 'fpl-api',
    fetchedAt: now,
    sourceRevision: `fpl-api:gw${maxGw}@${now}`,
    etags: { source: 'fpl-api', events: targetGws.join(',') },
    playerCount: players.length,
    teamCount: teams.length,
    fixtureCount: fixtures.length,
    performanceCount: performances.length,
  }

  await persistSeasonSnapshot({ meta, players, teams, fixtures, performances })

  options?.onProgress?.({
    gw: maxGw,
    total: targetGws.length,
    message: `Cached ${performances.length} performance rows across GW ${targetGws.join(', ') || '—'}`,
  })

  return { meta, players, teams, fixtures, performances }
}

/** Finished events plus the current event (may be provisional). */
export function targetEventIds(events: readonly FplLiveEvent[]): number[] {
  const ids = new Set<number>()
  for (const event of events) {
    if (event.finished || event.isCurrent) ids.add(event.id)
  }
  return [...ids].filter((id) => id > 0).sort((a, b) => a - b)
}

export function summarizeCurrentSeason(snapshot: SeasonSnapshot) {
  return {
    seasonId: snapshot.meta.seasonId,
    dataSource: snapshot.meta.dataSource ?? 'unknown',
    sourceRevision: snapshot.meta.sourceRevision,
    fetchedAt: snapshot.meta.fetchedAt,
    players: snapshot.players.length,
    teams: snapshot.teams.length,
    fixtures: snapshot.fixtures.length,
    performances: snapshot.performances.length,
    rounds: countByRound(snapshot.performances),
  }
}

function stripLiveFields(player: FplLivePlayer): FplPlayer {
  return {
    seasonId: player.seasonId,
    id: player.id,
    code: player.code,
    firstName: player.firstName,
    secondName: player.secondName,
    webName: player.webName,
    teamId: player.teamId,
    position: player.position,
    nowCostTenths: player.nowCostTenths,
    totalPoints: player.totalPoints,
    minutes: player.minutes,
    goalsScored: player.goalsScored,
    assists: player.assists,
    form: player.form,
    selectedByPercent: player.selectedByPercent,
  }
}

function groupFixturesByEvent(fixtures: readonly FplFixture[]): Map<number, FplFixture[]> {
  const map = new Map<number, FplFixture[]>()
  for (const fixture of fixtures) {
    if (fixture.event == null || fixture.event <= 0) continue
    const list = map.get(fixture.event) ?? []
    list.push(fixture)
    map.set(fixture.event, list)
  }
  return map
}

async function persistSeasonSnapshot(snapshot: SeasonSnapshot): Promise<void> {
  const cache = getFplCacheDb()
  const { seasonId } = snapshot.meta
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
      await cache.seasons.put(snapshot.meta)
      if (snapshot.players.length) await cache.players.bulkPut(snapshot.players)
      if (snapshot.teams.length) await cache.teams.bulkPut(snapshot.teams)
      if (snapshot.fixtures.length) await cache.fixtures.bulkPut(snapshot.fixtures)
      if (snapshot.performances.length) await cache.performances.bulkPut(snapshot.performances)
    },
  )
}

export { CURRENT_SEASON_TTL_MS }
