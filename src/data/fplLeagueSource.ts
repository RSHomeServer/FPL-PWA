import { fetchOfficialJson, officialApiUrl, type FetchLike } from './fplLiveSource'

export function classicLeagueStandingsPath(leagueId: number, page = 1): string {
  return `/api/leagues-classic/${leagueId}/standings/?page_standings=${page}`
}

export type ClassicLeagueStandingRow = {
  entryId: number
  entryName: string
  playerName: string
  rank: number
  lastRank: number | null
  totalPoints: number
  eventTotal: number
}

export type ClassicLeagueStandingsPage = {
  leagueId: number
  leagueName: string
  page: number
  hasNext: boolean
  results: ClassicLeagueStandingRow[]
  lastUpdatedData: string | null
}

export function parseClassicLeagueStandingsPage(payload: unknown): ClassicLeagueStandingsPage {
  const root = asObject(payload, 'league-standings')
  const league = asObject(root.league, 'league')
  const standings = asObject(root.standings, 'standings')
  const leagueId = requiredInt(league.id, 'league.id')
  const leagueName = String(league.name ?? `League ${leagueId}`)
  const results = arrayOfObjects(standings.results)
    .map((row) => parseStandingRow(row))
    .filter((row): row is ClassicLeagueStandingRow => row != null)
  return {
    leagueId,
    leagueName,
    page: requiredInt(standings.page, 'standings.page'),
    hasNext: Boolean(standings.has_next),
    results,
    lastUpdatedData: typeof root.last_updated_data === 'string' ? root.last_updated_data : null,
  }
}

/** Fetch standings pages until `topN` rows or pages exhausted (50 rows/page). */
export async function fetchClassicLeagueTopN(
  leagueId: number,
  topN: number,
  fetchImpl: FetchLike = fetch,
): Promise<ClassicLeagueStandingsPage & { results: ClassicLeagueStandingRow[] }> {
  const collected: ClassicLeagueStandingRow[] = []
  let page = 1
  let hasNext = true
  let leagueName = `League ${leagueId}`
  let lastUpdatedData: string | null = null

  while (hasNext && collected.length < topN) {
    const payload = await fetchOfficialJson(
      officialApiUrl(classicLeagueStandingsPath(leagueId, page)),
      fetchImpl,
    )
    const parsed = parseClassicLeagueStandingsPage(payload)
    leagueName = parsed.leagueName
    lastUpdatedData = parsed.lastUpdatedData
    for (const row of parsed.results) {
      if (collected.length >= topN) break
      collected.push(row)
    }
    hasNext = parsed.hasNext
    page += 1
    if (page > 40) break // hard stop (~2000 rows)
  }

  return {
    leagueId,
    leagueName,
    page: page - 1,
    hasNext,
    results: collected,
    lastUpdatedData,
  }
}

function parseStandingRow(row: Record<string, unknown>): ClassicLeagueStandingRow | null {
  const entryId = optionalInt(row.entry)
  const rank = optionalInt(row.rank)
  if (entryId == null || entryId <= 0 || rank == null || rank <= 0) return null
  return {
    entryId,
    entryName: String(row.entry_name ?? ''),
    playerName: String(row.player_name ?? ''),
    rank,
    lastRank: optionalInt(row.last_rank),
    totalPoints: optionalInt(row.total) ?? 0,
    eventTotal: optionalInt(row.event_total) ?? 0,
  }
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} was not a JSON object`)
  }
  return value as Record<string, unknown>
}

function arrayOfObjects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
}

function requiredInt(value: unknown, label: string): number {
  const n = optionalInt(value)
  if (n == null) throw new Error(`${label} missing`)
  return n
}

function optionalInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}
