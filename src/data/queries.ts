import { playerDisplayName } from './parse'
import { formatGbpFromTenths } from './prices'
import {
  cleanSheetApplicable,
  concededApplicable,
  defensiveContributionApplicable,
  formatEvent,
  formatMetric,
  savesApplicable,
  scoreParts,
} from './scoring'
import type { FplFixture, FplPerformance, FplPlayer, FplTeam, SeasonSnapshot } from './types'

export function teamById(teams: readonly FplTeam[]): Map<number, FplTeam> {
  return new Map(teams.map((team) => [team.id, team]))
}

export function teamName(teams: Map<number, FplTeam>, id: number): string {
  return teams.get(id)?.shortName ?? teams.get(id)?.name ?? String(id)
}

export function playerById(players: readonly FplPlayer[]): Map<number, FplPlayer> {
  return new Map(players.map((player) => [player.id, player]))
}

export function performancesForPlayer(
  rows: readonly FplPerformance[],
  playerId: number,
): FplPerformance[] {
  return rows
    .filter((row) => row.playerId === playerId)
    .sort((a, b) => a.round - b.round || a.fixture - b.fixture)
}

export type SeriesPoint = {
  x: number
  y: number
  label?: string
}

export function formSeries(
  rows: readonly FplPerformance[],
  playerId: number,
  lastN = 8,
): SeriesPoint[] {
  const appearances = performancesForPlayer(rows, playerId)
  const totals = new Map<number, number>()
  for (const row of appearances) {
    totals.set(row.round, (totals.get(row.round) ?? 0) + row.totalPoints)
  }
  const rounds = [...totals.keys()].sort((a, b) => a - b).slice(-lastN)
  return rounds.map((round) => ({
    x: round,
    y: totals.get(round) ?? 0,
    label: `GW ${round}`,
  }))
}

export function formSparkline(
  rows: readonly FplPerformance[],
  playerId: number,
  lastN = 8,
): number[] {
  return formSeries(rows, playerId, lastN).map((point) => point.y)
}

export function maxRound(rows: readonly FplPerformance[], fixtures: readonly FplFixture[]): number {
  let max = 0
  for (const row of rows) max = Math.max(max, row.round)
  for (const fixture of fixtures) {
    if (fixture.event) max = Math.max(max, fixture.event)
  }
  return max
}

export function latestPlayedRound(rows: readonly FplPerformance[]): number {
  let max = 0
  for (const row of rows) {
    if (row.minutes > 0 || row.totalPoints !== 0) max = Math.max(max, row.round)
  }
  return max
}

export type GameweekEventRow = {
  player: FplPlayer | undefined
  team: FplTeam | undefined
  opponent: FplTeam | undefined
  who: string
  position: FplPlayer['position']
  event: string
  points: number
  minutes: number
  goals: number
  assists: number
  cleanSheet: string
  saves: string
  bonus: number
  goalsConceded: string
  expectedInvolvement: string
  expectedPoints: string
  defensiveContribution: string
  bps: number
  wasHome: boolean
  /** GW price from vaastav `value` (tenths of a million). */
  costTenths: number
}

export function gameweekEvents(
  snapshot: SeasonSnapshot,
  round: number,
): GameweekEventRow[] {
  const names = playerById(snapshot.players)
  const teams = teamById(snapshot.teams)
  return snapshot.performances
    .filter((row) => row.round === round && (row.minutes > 0 || row.totalPoints !== 0))
    .map((row) => {
      const player = names.get(row.playerId)
      const position = player?.position && player.position !== 'UNK' ? player.position : row.gwPosition
      const who = player ? playerDisplayName(player) : `Player ${row.playerId}`
      const team = player ? teams.get(player.teamId) : undefined
      const opponent = teams.get(row.opponentTeamId)
      return {
        player,
        team,
        opponent,
        who,
        position,
        event: formatEvent(scoreParts(row, position)),
        points: row.totalPoints,
        minutes: row.minutes,
        goals: row.goalsScored,
        assists: row.assists,
        cleanSheet: formatMetric(row.cleanSheets, cleanSheetApplicable(position)),
        saves: formatMetric(row.saves, savesApplicable(position)),
        bonus: row.bonus,
        goalsConceded: formatMetric(row.goalsConceded, concededApplicable(position)),
        expectedInvolvement: row.expectedGoalInvolvements.toFixed(2),
        expectedPoints: row.expectedPoints == null ? 'NA' : row.expectedPoints.toFixed(1),
        defensiveContribution: formatMetric(
          row.defensiveContribution,
          defensiveContributionApplicable(position, row.defensiveContribution),
        ),
        bps: row.bps,
        wasHome: row.wasHome,
        costTenths: row.valueTenths,
      }
    })
    .sort((a, b) => b.points - a.points)
}

export type GameweekRowFilters = {
  teamId: number | 'all'
  position: FplPlayer['position'] | 'all'
  minCostTenths: number | null
  maxCostTenths: number | null
}

export function filterGameweekRows(
  rows: readonly GameweekEventRow[],
  filters: GameweekRowFilters,
): GameweekEventRow[] {
  return rows.filter((row) => {
    if (filters.teamId !== 'all' && row.team?.id !== filters.teamId) return false
    if (filters.position !== 'all' && row.position !== filters.position) return false
    if (filters.minCostTenths != null && row.costTenths < filters.minCostTenths) return false
    if (filters.maxCostTenths != null && row.costTenths > filters.maxCostTenths) return false
    return true
  })
}

export function meanPointsSeries(rows: readonly FplPerformance[]): SeriesPoint[] {
  const sums = new Map<number, { total: number; count: number }>()
  for (const row of rows) {
    if (row.minutes <= 0) continue
    const bucket = sums.get(row.round) ?? { total: 0, count: 0 }
    bucket.total += row.totalPoints
    bucket.count += 1
    sums.set(row.round, bucket)
  }
  const rounds = [...sums.keys()].sort((a, b) => a - b)
  return rounds.map((round) => {
    const bucket = sums.get(round)
    const y = !bucket || bucket.count === 0 ? 0 : bucket.total / bucket.count
    return { x: round, y, label: `GW ${round}` }
  })
}

export function meanPointsByRound(rows: readonly FplPerformance[]): number[] {
  return meanPointsSeries(rows).map((point) => point.y)
}

export function playerPriceLabel(player: FplPlayer): string {
  return formatGbpFromTenths(player.nowCostTenths)
}

export function upcomingFixturesForTeam(
  fixtures: readonly FplFixture[],
  teamId: number,
  limit = 3,
): FplFixture[] {
  return fixtures
    .filter((fixture) => !fixture.finished && (fixture.teamH === teamId || fixture.teamA === teamId))
    .sort((a, b) => (a.event ?? 99) - (b.event ?? 99) || a.kickoffTime.localeCompare(b.kickoffTime))
    .slice(0, limit)
}

export function formatKickoff(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
