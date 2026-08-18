import { fetchVaastavFile } from '../data/cdn'
import { parseCsv, parseIntField } from '../data/csv'
import {
  dedupePerformances,
  parseFixtureRow,
  parsePerformanceRow,
  parsePlayerRow,
  parseTeamRow,
} from '../data/parse'
import type {
  FplFixture,
  FplPerformance,
  FplPlayer,
  FplTeam,
  PlayerPosition,
  SeasonSnapshot,
} from '../data/types'

export const SEASON_IDS = [
  '2016-17',
  '2017-18',
  '2018-19',
  '2019-20',
  '2020-21',
  '2021-22',
  '2022-23',
  '2023-24',
  '2024-25',
  '2025-26',
  '2026-27',
] as const

export type SeasonId = (typeof SEASON_IDS)[number]

export type AnalysisPlayer = FplPlayer & {
  costChangeStart: number
  teamCode: number
  teamName: string
  teamShortName: string
  status: string
}

export type LoadedSeason = {
  seasonId: string
  players: AnalysisPlayer[]
  teams: FplTeam[]
  fixtures: FplFixture[]
  performances: FplPerformance[]
  hasMergedGw: boolean
  startsInferred: boolean
}

/** Disk cache lives in the Node runner; tests can pass a memory map. */
export type SeasonCache = {
  read(path: string): string | null
  write(path: string, text: string): void
}

export function priorSeasonId(seasonId: string): string | null {
  const index = SEASON_IDS.indexOf(seasonId as SeasonId)
  if (index <= 0) return null
  return SEASON_IDS[index - 1]
}

export function openingPriceTenths(player: Pick<AnalysisPlayer, 'nowCostTenths' | 'costChangeStart'>): number {
  return player.nowCostTenths - player.costChangeStart
}

export async function loadSeason(seasonId: string, cache: SeasonCache): Promise<LoadedSeason> {
  const prefix = `data/${seasonId}`
  const [playersText, teamsText, fixturesText, gwText] = await Promise.all([
    readCachedCsv(cache, `${prefix}/players_raw.csv`, true),
    readCachedCsv(cache, `${prefix}/teams.csv`, false),
    readCachedCsv(cache, `${prefix}/fixtures.csv`, false),
    readCachedCsv(cache, `${prefix}/gws/merged_gw.csv`, false),
  ])

  const teams = teamsText
    ? parseCsv(teamsText)
        .map((row) => parseTeamRow(seasonId, row))
        .filter((row): row is FplTeam => row !== null)
    : []
  const teamById = new Map(teams.map((team) => [team.id, team]))

  const players = parseCsv(playersText)
    .map((row) => toAnalysisPlayer(seasonId, row, teamById))
    .filter((row): row is AnalysisPlayer => row !== null)

  const fixtures = fixturesText
    ? parseCsv(fixturesText)
        .map((row) => parseFixtureRow(seasonId, row))
        .filter((row): row is FplFixture => row !== null)
    : []

  const rawPerformances = gwText
    ? parseCsv(gwText)
        .map((row) => parsePerformanceRow(seasonId, row))
        .filter((row): row is FplPerformance => row !== null)
    : []
  const performances = dedupePerformances(rawPerformances)
  const startsInferred = performances.length > 0 && performances.every((row) => row.starts === 0)

  return {
    seasonId,
    players,
    teams,
    fixtures,
    performances,
    hasMergedGw: performances.length > 0,
    startsInferred,
  }
}

function toAnalysisPlayer(
  seasonId: string,
  row: Record<string, string>,
  teamById: Map<number, FplTeam>,
): AnalysisPlayer | null {
  const parsed = parsePlayerRow(seasonId, row)
  if (!parsed) return null
  const team = teamById.get(parsed.teamId)
  return {
    ...parsed,
    costChangeStart: parseIntField(row.cost_change_start),
    teamCode: team?.code ?? 0,
    teamName: team?.name ?? '',
    teamShortName: team?.shortName ?? '',
    status: (row.status ?? '').trim(),
  }
}

async function readCachedCsv(cache: SeasonCache, path: string, required: boolean): Promise<string> {
  const cached = cache.read(path)
  if (cached != null && cached.includes(',')) return cached
  const file = await fetchVaastavFile(path)
  if (!file.ok || !file.text.includes(',')) {
    if (required) {
      throw new Error(`Vaastav file missing: ${path} (HTTP ${file.status})`)
    }
    return ''
  }
  cache.write(path, file.text)
  return file.text
}

/** Browser path: Dexie vaastav snapshot → the analysis season used by priors. */
export function loadedSeasonFromSnapshot(snapshot: SeasonSnapshot): LoadedSeason {
  const teamById = new Map(snapshot.teams.map((team) => [team.id, team]))
  const players: AnalysisPlayer[] = snapshot.players.map((player) => {
    const team = teamById.get(player.teamId)
    return {
      ...player,
      costChangeStart: 0,
      teamCode: team?.code ?? 0,
      teamName: team?.name ?? '',
      teamShortName: team?.shortName ?? '',
      status: 'a',
    }
  })
  const startsInferred =
    snapshot.performances.length > 0 && snapshot.performances.every((row) => row.starts === 0)
  return {
    seasonId: snapshot.meta.seasonId,
    players,
    teams: snapshot.teams,
    fixtures: snapshot.fixtures,
    performances: snapshot.performances,
    hasMergedGw: snapshot.performances.length > 0,
    startsInferred,
  }
}

export function playerByCode(season: LoadedSeason): Map<number, AnalysisPlayer> {
  const map = new Map<number, AnalysisPlayer>()
  for (const player of season.players) {
    if (player.code > 0) map.set(player.code, player)
  }
  return map
}

export function playerById(season: LoadedSeason): Map<number, AnalysisPlayer> {
  return new Map(season.players.map((player) => [player.id, player]))
}

export function positionOf(
  season: LoadedSeason,
  playerId: number,
  fallback: PlayerPosition = 'UNK',
): PlayerPosition {
  return playerById(season).get(playerId)?.position ?? fallback
}
