import { CURRENT_SEASON_TTL_MS, isLiveFresh } from './cachePolicy'
import { parseBoolField, parseIntField, parseOptionalFloat, parseOptionalInt } from './csv'
import { getFplCacheDb } from './db'
import { parseFixtureRow, parsePlayerRow, parseTeamRow } from './parse'
import type {
  FplFixture,
  FplLiveEvent,
  FplLivePlayer,
  FplLiveSnapshot,
  FplTeam,
  LiveCacheMeta,
} from './types'

export const FPL_API_ORIGIN = 'https://fantasy.premierleague.com'
export const FPL_BOOTSTRAP_PATH = '/api/bootstrap-static/'
export const FPL_FIXTURES_PATH = '/api/fixtures/'
/** Same-origin Vite proxy prefix so the browser never hits FPL CORS. */
export const FPL_BROWSER_PROXY_PREFIX = '/fpl-api'
export const FPL_BOOTSTRAP_URL = `${FPL_API_ORIGIN}${FPL_BOOTSTRAP_PATH}`
export const FPL_FIXTURES_URL = `${FPL_API_ORIGIN}${FPL_FIXTURES_PATH}`

export type OfficialApiRuntime = 'browser' | 'node'

export function officialApiRuntime(): OfficialApiRuntime {
  return typeof document === 'undefined' ? 'node' : 'browser'
}

/** Node talks to FPL directly. The browser uses `/fpl-api` (Vite proxy, not a backend). */
export function officialApiUrl(path: string, runtime: OfficialApiRuntime = officialApiRuntime()): string {
  if (runtime === 'browser') return `${FPL_BROWSER_PROXY_PREFIX}${path}`
  return `${FPL_API_ORIGIN}${path}`
}

export type FetchLike = typeof fetch

export type FplLiveSource = {
  kind: 'official-api'
  fetchBootstrap(): Promise<unknown>
  fetchFixtures(): Promise<unknown>
}

export class FplLiveFetchError extends Error {
  readonly url: string
  readonly status: number | null
  readonly corsLikely: boolean

  constructor(message: string, url: string, status: number | null, corsLikely: boolean) {
    super(message)
    this.name = 'FplLiveFetchError'
    this.url = url
    this.status = status
    this.corsLikely = corsLikely
  }
}

/** Convert official JSON objects into the CSV-shaped records `parse*Row` already accept. */
export function recordFromJson(value: Record<string, unknown>): Record<string, string> {
  const row: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (raw == null) row[key] = ''
    else if (typeof raw === 'boolean') row[key] = raw ? 'true' : 'false'
    else row[key] = String(raw)
  }
  return row
}

export function seasonIdFromDeadline(deadlineTime: string | undefined, fallback = new Date()): string {
  const date = deadlineTime ? new Date(deadlineTime) : fallback
  const valid = Number.isFinite(date.getTime()) ? date : fallback
  const year = valid.getUTCFullYear()
  const month = valid.getUTCMonth() + 1
  const start = month >= 7 ? year : year - 1
  return `${start}-${String(start + 1).slice(-2)}`
}

export function parseLiveEvent(row: Record<string, string>): FplLiveEvent | null {
  const id = Number.parseInt(row.id ?? '', 10)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    id,
    name: row.name?.trim() || `Gameweek ${id}`,
    deadlineTime: row.deadline_time?.trim() ?? '',
    isNext: parseBoolField(row.is_next),
    isCurrent: parseBoolField(row.is_current),
    finished: parseBoolField(row.finished),
  }
}

export function parseLivePlayer(seasonId: string, row: Record<string, string>): FplLivePlayer | null {
  const parsed = parsePlayerRow(seasonId, row)
  if (!parsed) return null
  const canSelectRaw = row.can_select
  return {
    ...parsed,
    teamCode: Number.parseInt(row.team_code ?? '', 10) || 0,
    status: (row.status ?? '').trim() || 'a',
    news: row.news?.trim() ?? '',
    chanceOfPlayingThisRound: parseOptionalInt(row.chance_of_playing_this_round),
    chanceOfPlayingNextRound: parseOptionalInt(row.chance_of_playing_next_round),
    epNext: parseOptionalFloat(row.ep_next),
    canSelect: canSelectRaw == null || canSelectRaw === '' ? true : parseBoolField(canSelectRaw),
    costChangeStart: parseIntField(row.cost_change_start),
  }
}

export function mapOfficialBootstrap(
  payload: unknown,
  fetchedAt = Date.now(),
): Omit<FplLiveSnapshot, 'fixtures'> {
  const root = asObject(payload)
  const events = arrayOfObjects(root.events)
    .map((row) => parseLiveEvent(recordFromJson(row)))
    .filter((row): row is FplLiveEvent => row !== null)
  const seasonId = seasonIdFromDeadline(events.find((event) => event.id === 1)?.deadlineTime ?? events[0]?.deadlineTime)
  const teams = arrayOfObjects(root.teams)
    .map((row) => parseTeamRow(seasonId, recordFromJson(row)))
    .filter((row): row is FplTeam => row !== null)
  const players = arrayOfObjects(root.elements)
    .map((row) => parseLivePlayer(seasonId, recordFromJson(row)))
    .filter((row): row is FplLivePlayer => row !== null)
  const nextEventId = events.find((event) => event.isNext)?.id ?? null
  const meta: LiveCacheMeta = {
    id: 'current',
    seasonId,
    fetchedAt,
    playerCount: players.length,
    teamCount: teams.length,
    fixtureCount: 0,
    eventCount: events.length,
    nextEventId,
  }
  return { meta, players, teams, events }
}

export function mapOfficialFixtures(payload: unknown, seasonId: string): FplFixture[] {
  return arrayOfObjects(payload)
    .map((row) => parseFixtureRow(seasonId, recordFromJson(row)))
    .filter((row): row is FplFixture => row !== null)
}

export function createOfficialLiveSource(fetchImpl: FetchLike = fetch): FplLiveSource {
  return {
    kind: 'official-api',
    fetchBootstrap: () => fetchOfficialJson(officialApiUrl(FPL_BOOTSTRAP_PATH), fetchImpl),
    fetchFixtures: () => fetchOfficialJson(officialApiUrl(FPL_FIXTURES_PATH), fetchImpl),
  }
}

/** Node CLI and tests: no Dexie. Browser callers should prefer `loadOfficialLiveSnapshot`. */
export async function fetchOfficialLiveSnapshot(
  fetchImpl: FetchLike = fetch,
  now = Date.now(),
): Promise<FplLiveSnapshot> {
  const source = createOfficialLiveSource(fetchImpl)
  const [bootstrap, fixturesPayload] = await Promise.all([source.fetchBootstrap(), source.fetchFixtures()])
  const mapped = mapOfficialBootstrap(bootstrap, now)
  const fixtures = mapOfficialFixtures(fixturesPayload, mapped.meta.seasonId)
  return {
    ...mapped,
    fixtures,
    meta: { ...mapped.meta, fixtureCount: fixtures.length },
  }
}

/**
 * Browser path: Dexie cache with the current-season TTL. Distinct `live*` stores
 * (schema v2) so vaastav tables are left intact.
 */
export async function loadOfficialLiveSnapshot(options?: {
  force?: boolean
  fetchImpl?: FetchLike
  now?: number
}): Promise<FplLiveSnapshot> {
  const now = options?.now ?? Date.now()
  const cache = getFplCacheDb()
  const existing = await cache.liveMeta.get('current')
  if (!options?.force && isLiveFresh(existing, now)) {
    const cached = await readPersistedLiveSnapshot(existing)
    // LT-3 needs cost_change_start; rows written before that field existed are unusable.
    if (cached && livePlayersHaveCostChangeStart(cached.players)) return cached
  }

  try {
    const snapshot = await fetchOfficialLiveSnapshot(options?.fetchImpl, now)
    await persistLiveSnapshot(snapshot)
    return snapshot
  } catch (error) {
    const stale = await readPersistedLiveSnapshot(existing)
    if (stale) {
      return {
        ...stale,
        players: normalizeLivePlayersCostChange(stale.players),
      }
    }
    throw error
  }
}

export { CURRENT_SEASON_TTL_MS }

function livePlayersHaveCostChangeStart(players: readonly FplLivePlayer[]): boolean {
  if (!players.length) return false
  return players.every((player) => Number.isFinite(player.costChangeStart))
}

function normalizeLivePlayersCostChange(players: FplLivePlayer[]): FplLivePlayer[] {
  return players.map((player) => ({
    ...player,
    costChangeStart: Number.isFinite(player.costChangeStart) ? player.costChangeStart : 0,
  }))
}

async function readPersistedLiveSnapshot(existing: LiveCacheMeta | undefined): Promise<FplLiveSnapshot | null> {
  if (!existing) return null
  const cache = getFplCacheDb()
  const [players, teams, fixtures, events] = await Promise.all([
    cache.livePlayers.toArray(),
    cache.liveTeams.toArray(),
    cache.liveFixtures.toArray(),
    cache.liveEvents.toArray(),
  ])
  if (!players.length || !teams.length) return null
  return { meta: existing, players, teams, fixtures, events }
}

async function persistLiveSnapshot(snapshot: FplLiveSnapshot): Promise<void> {
  const cache = getFplCacheDb()
  await cache.transaction(
    'rw',
    cache.liveMeta,
    cache.livePlayers,
    cache.liveTeams,
    cache.liveFixtures,
    cache.liveEvents,
    async () => {
      await Promise.all([
        cache.livePlayers.clear(),
        cache.liveTeams.clear(),
        cache.liveFixtures.clear(),
        cache.liveEvents.clear(),
      ])
      await cache.liveMeta.put(snapshot.meta)
      if (snapshot.players.length) await cache.livePlayers.bulkPut(snapshot.players)
      if (snapshot.teams.length) await cache.liveTeams.bulkPut(snapshot.teams)
      if (snapshot.fixtures.length) await cache.liveFixtures.bulkPut(snapshot.fixtures)
      if (snapshot.events.length) await cache.liveEvents.bulkPut(snapshot.events)
    },
  )
}

export async function fetchOfficialJson(url: string, fetchImpl: FetchLike = fetch): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(url, { headers: officialFetchHeaders() })
  } catch (error) {
    throw wrapFetchError(url, error)
  }
  if (!response.ok) {
    throw new FplLiveFetchError(
      `Official FPL API ${url} returned HTTP ${response.status}`,
      url,
      response.status,
      false,
    )
  }
  return response.json()
}

function officialFetchHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (typeof navigator === 'undefined') {
    headers['User-Agent'] = 'FPL-PWA/0.0 (GW0 prototype; https://github.com/RSHomeServer/FPL-PWA)'
  }
  return headers
}

function wrapFetchError(url: string, error: unknown): FplLiveFetchError {
  const message = error instanceof Error ? error.message : String(error)
  const corsLikely =
    error instanceof TypeError || /failed to fetch|cors|networkerror/i.test(message)
  const hint = corsLikely
    ? ' The browser must use the same-origin /fpl-api Vite proxy, not fantasy.premierleague.com directly.'
    : ''
  return new FplLiveFetchError(
    `Official FPL API request failed for ${url}: ${message}.${hint}`,
    url,
    null,
    corsLikely,
  )
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new Error('Official FPL bootstrap payload was not a JSON object')
}

function arrayOfObjects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
}
